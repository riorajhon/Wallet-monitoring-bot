import axios from 'axios';
import * as cheerio from 'cheerio';
import { ageStringToIST } from '../utils/dateIST.js';

const BASE = process.env.BSCSCAN_BASE || 'https://bscscan.com';

const AXIOS_OPTS = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html',
  },
};

/**
 * Fetch BscScan address page HTML
 */
export async function fetchAddressPage(address) {
  const url = `${BASE}/address/${address}`;
  const { data } = await axios.get(url, AXIOS_OPTS);
  return data;
}

/**
 * Fetch BEP-20 token transfers page HTML for an address.
 * URL: https://bscscan.com/address-tokenpage?m=light&a=<address>
 */
export async function fetchTokenTxnsPage(address) {
  const url = `${BASE}/address-tokenpage?m=light&a=${address}`;
  const { data } = await axios.get(url, AXIOS_OPTS);
  return data;
}

/**
 * Parse BNB Balance from HTML (same structure as Etherscan "ETH Balance").
 */
function parseBnbBalance($) {
  const h4 = $('h4.text-cap.mb-1').filter((_, el) => $(el).text().trim() === 'BNB Balance');
  if (!h4.length) return '';
  const balanceWrapper = h4.siblings('div').first();
  if (!balanceWrapper.length) return '';
  let text = balanceWrapper.text().replace(/\s+/g, ' ').trim();
  text = text.replace(/\s*\.\s*/g, '.').replace(/\s+BNB\s*$/i, ' BNB').trim();
  const match = text.match(/([\d.]+)\s*BNB/i);
  return match ? `${match[1]} BNB` : text;
}

/**
 * Parse BNB Value (USD) from HTML.
 */
function parseBnbValue($) {
  const h4 = $('h4.text-cap.mb-1').filter((_, el) => $(el).text().trim() === 'BNB Value');
  if (!h4.length) return '';
  const parent = h4.closest('div');
  let text = parent.contents().filter((_, el) => el.type === 'text').text().trim();
  const match = text.match(/\$[\d,]+\.?\d*/);
  return match ? match[0] : text;
}

/**
 * Parse BNB price from page if present (e.g. #bnbPrice or similar).
 */
function parseBnbPrice($) {
  const el = $('#bnbPrice').find('a[href*="bnbprice"], a[href*="chart"]').first();
  if (!el.length) return 0;
  const text = el.text().trim();
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, '')) || 0;
}

function getFullAddress($cell) {
  const copyLink = $cell.find('a.js-clipboard[data-clipboard-text]').first();
  const clip = copyLink.attr('data-clipboard-text');
  if (clip && clip.startsWith('0x')) return clip.trim();
  const link = $cell.find('a[href*="/address/"]').first();
  const href = link.attr('href');
  if (href) {
    const addr = href.replace(/.*\/address\//, '').split('#')[0].trim();
    if (addr.startsWith('0x')) return addr;
  }
  const title = link.attr('title') || $cell.find('[title]').first().attr('title');
  if (title && title.startsWith('0x')) return title.trim();
  const span = $cell.find('span[title]').first();
  const spanTitle = span.attr('title');
  if (spanTitle && spanTitle.startsWith('0x')) return spanTitle.trim();
  return '';
}

/**
 * Parse BNB transactions from main table (same structure as Etherscan).
 */
function parseTransactions($, walletAddress, bnbPrice = 0) {
  const rows = $('table.table.table-hover.mb-0').first().find('tbody tr');
  const transactions = [];

  rows.each((_, row) => {
    const $row = $(row);
    const tds = $row.find('td');

    const hashTd = tds.eq(1);
    const hashLink = hashTd.find('a.hash-tag, a[href^="/tx/"]').first();
    let hash = hashLink.attr('href') ? hashLink.attr('href').replace('/tx/', '').trim() : hashLink.text().trim();
    if (hash && hash.includes('?')) hash = hash.split('?')[0].trim();
    if (!hash || !hash.startsWith('0x')) return;

    const methodTd = tds.eq(2);
    const method = methodTd.find('.badge, span[data-title]').first().text().trim() || methodTd.text().trim();

    const blockTd = tds.eq(4);
    const block = blockTd.find('a').first().text().trim() || blockTd.text().trim();

    const showDateTd = $row.find('td.showDate span');
    const showAgeSpan = $row.find('td.showAge span').first();
    let age = showDateTd.first().text().trim();
    if (!age) age = showAgeSpan.attr('data-bs-title') || showAgeSpan.text().trim();

    const fromTd = tds.eq(8);
    const from = getFullAddress(fromTd);

    const inOutTd = tds.eq(9);
    let inOut = inOutTd.find('.badge').first().text().trim().toUpperCase() || '';
    if (inOut !== 'IN' && inOut !== 'OUT') inOut = 'ANY';

    const toTd = tds.eq(10);
    const to = getFullAddress(toTd);

    const amountTd = $row.find('td .td_showAmount');
    const amount = amountTd.first().text().trim() || '';

    let amountUsd = '';
    if (bnbPrice > 0 && amount) {
      const bnbMatch = amount.match(/^([\d.]+)\s*BNB/i);
      if (bnbMatch) {
        const amountNum = parseFloat(bnbMatch[1].replace(/,/g, '')) || 0;
        amountUsd = '$' + (amountNum * bnbPrice).toFixed(2);
      }
    }

    const feeTd = $row.find('td.showTxnFee');
    let txnFee = feeTd.first().text().trim().replace(/\s/g, '') || '';
    if (/0\s*\.\s*/.test(txnFee)) txnFee = txnFee.replace(/\s*\.\s*/g, '.');

    transactions.push({
      transactionHash: hash,
      walletAddress,
      walletType: 'BNB',
      txType: 'bnb',
      token: 'BNB',
      method,
      block,
      age,
      from,
      to,
      inOut,
      amount,
      amountUsd,
      txnFee,
    });
  });

  return transactions;
}

/**
 * Parse BEP-20 token transfers (same table pattern as Etherscan token page).
 * BscScan may use theadTokenERC20Table or similar.
 */
function parseTokenTransactions($, walletAddress) {
  const $table = $('#theadTokenERC20Table').closest('table');
  if (!$table.length) return [];

  const rows = $table.find('tbody tr');
  const transactions = [];
  rows.each((_, row) => {
    const $row = $(row);
    const tds = $row.find('td');
    if (tds.length < 8) return;

    const hashTd = tds.eq(1);
    const hashLink = hashTd.find('a[href*="/tx/"]').first();
    let hash = hashLink.attr('href') ? hashLink.attr('href').replace(/.*\/tx\//, '').replace(/\?.*$/, '').trim() : hashLink.text().trim();
    if (!hash || !hash.startsWith('0x')) return;

    const methodTd = tds.eq(2);
    const method = methodTd.find('.badge, span[data-title]').first().text().trim() || methodTd.text().trim();

    const blockTd = tds.eq(4);
    const block = blockTd.find('a').first().text().trim() || blockTd.text().trim();

    const showDateTd = $row.find('td.showDate span');
    const showAgeSpan = $row.find('td.showAge span').first();
    let age = showDateTd.first().text().trim();
    if (!age) age = showAgeSpan.attr('data-bs-title') || showAgeSpan.text().trim();
    age = ageStringToIST(age);

    const fromTd = tds.eq(8);
    const from = getFullAddress(fromTd);

    const inOutTd = tds.eq(9);
    let inOut = inOutTd.find('.badge').first().text().trim().toUpperCase() || '';
    if (inOut !== 'IN' && inOut !== 'OUT') inOut = 'ANY';

    const toTd = tds.eq(10);
    const to = getFullAddress(toTd);

    const amountTd = tds.eq(11);
    const amountSpan = amountTd.find('span.td_showAmount').first();
    const amount = amountSpan.text().trim() || amountTd.text().replace(/\s+/g, ' ').trim() || '';
    const titleAttr = amountSpan.attr('data-bs-title') || '';
    const usdMatch = titleAttr.match(/\$[\d,]+\.?\d*/);
    const amountUsd = usdMatch ? usdMatch[0] : '';

    const tokenTd = tds.eq(12);
    const token = tokenTd.find('div.hash-tag').first().text().trim().replace(/\s+/g, ' ') || tokenTd.text().trim().replace(/\s+/g, ' ') || '';

    transactions.push({
      transactionHash: hash,
      walletAddress,
      walletType: 'BNB',
      txType: 'token',
      token,
      method,
      block,
      age,
      from,
      to,
      inOut,
      amount,
      amountUsd,
      txnFee: '',
    });
  });

  return transactions;
}

/**
 * Parse full BscScan address page: BNB balance, value, and transactions
 */
export function parseAddressHtml(html, walletAddress) {
  const $ = cheerio.load(html);
  const bnbBalance = parseBnbBalance($);
  const bnbValue = parseBnbValue($);
  const bnbPrice = parseBnbPrice($);
  const transactions = parseTransactions($, walletAddress, bnbPrice);
  return { bnbBalance, bnbValue, transactions };
}

export async function fetchAndParseAddress(address) {
  const html = await fetchAddressPage(address);
  return parseAddressHtml(html, address);
}

export function parseTokenTxnsHtml(html, walletAddress) {
  const $ = cheerio.load(html);
  return parseTokenTransactions($, walletAddress);
}

/**
 * Fetch and parse both BNB and BEP-20 token transactions for an address
 */
export async function fetchAndParseAllTransactions(address) {
  const [mainResult, tokenTxns] = await Promise.all([
    fetchAndParseAddress(address),
    fetchTokenTxnsPage(address).then((html) => parseTokenTxnsHtml(html, address)).catch(() => []),
  ]);
  const tokenTransactions = Array.isArray(tokenTxns) ? tokenTxns : [];
  return {
    ...mainResult,
    tokenTransactions,
  };
}
