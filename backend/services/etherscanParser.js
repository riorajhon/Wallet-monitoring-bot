import axios from 'axios';
import * as cheerio from 'cheerio';
import { ageStringToIST } from '../utils/dateIST.js';

const BASE = process.env.ETHERSCAN_BASE || 'https://etherscan.io';

const AXIOS_OPTS = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html',
  },
};

/**
 * Fetch etherscan address page HTML
 */
export async function fetchAddressPage(address) {
  const url = `${BASE}/address/${address}`;
  const { data } = await axios.get(url, AXIOS_OPTS);
  return data;
}

/**
 * Fetch token transfers (ERC-20) page HTML for an address.
 * URL: https://etherscan.io/address-tokenpage?m=light&a=<address>
 */
export async function fetchTokenTxnsPage(address) {
  const url = `${BASE}/address-tokenpage?m=light&a=${address}`;
  const { data } = await axios.get(url, AXIOS_OPTS);
  return data;
}

/**
 * Parse ETH Balance from HTML.
 * Structure (from Etherscan): <div><h4>ETH Balance</h4><div><div><i>...</i>0<b>.</b>003738644248147721 ETH</div></div></div>
 */
function parseEthBalance($) {
  const h4 = $('h4.text-cap.mb-1').filter((_, el) => $(el).text().trim() === 'ETH Balance');
  if (!h4.length) return '';
  // Balance text is in the div that is a sibling of the h4 (same parent)
  const balanceWrapper = h4.siblings('div').first();
  if (!balanceWrapper.length) return '';
  let text = balanceWrapper.text().replace(/\s+/g, ' ').trim();
  // Normalize "0 . 003738..." from <b>.</b> to "0.003738..."
  text = text.replace(/\s*\.\s*/g, '.').replace(/\s+ETH\s*$/i, ' ETH').trim();
  const match = text.match(/([\d.]+)\s*ETH/i);
  return match ? `${match[1]} ETH` : text;
}

/**
 * Parse Eth Value from HTML (e.g. "$10.24").
 * Structure: <h4>Eth Value</h4> followed by "$10.24" text in same parent.
 */
function parseEthValue($) {
  const h4 = $('h4.text-cap.mb-1').filter((_, el) => $(el).text().trim() === 'Eth Value');
  if (!h4.length) return '';
  const parent = h4.closest('div');
  let text = parent.contents().filter((_, el) => el.type === 'text').text().trim();
  const match = text.match(/\$[\d,]+\.?\d*/);
  return match ? match[0] : text;
}

/**
 * Parse ETH price from #ethPrice (e.g. <a href='/chart/etherprice'>$2,736.06</a>).
 * Returns numeric price or 0 if not found.
 */
function parseEthPrice($) {
  const el = $('#ethPrice').find('a[href*="etherprice"]').first();
  const text = el.text().trim();
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, '')) || 0;
}

/**
 * Get full address from a cell that has a link or span with address (data-clipboard-text, title, or href)
 */
function getFullAddress($cell) {
  const copyLink = $cell.find('a.js-clipboard[data-clipboard-text]').first();
  const clip = copyLink.attr('data-clipboard-text');
  if (clip && clip.startsWith('0x')) return clip.trim();
  const link = $cell.find('a[href*="/address/"]').first();
  const href = link.attr('href');
  if (href) {
    let addr = href.replace(/.*\/address\//, '').split('#')[0].trim();
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
 * Parse transactions from table.table.table-hover.mb-0 (first one = main tx list)
 * Fields: Transaction Hash, Method, Block, Age (full date), From (full address), In/Out, To (full address), Amount, amountUsd (from ETH price), Txn Fee
 */
function parseTransactions($, walletAddress, ethPrice = 0) {
  const rows = $('table.table.table-hover.mb-0').first().find('tbody tr');
  const transactions = [];

  rows.each((_, row) => {
    const $row = $(row);
    const tds = $row.find('td');

    const hashTd = tds.eq(1);
    const hashLink = hashTd.find('a.hash-tag, a[href^="/tx/"]').first();
    const hash = hashLink.attr('href') ? hashLink.attr('href').replace('/tx/', '').trim() : hashLink.text().trim();
    if (!hash || !hash.startsWith('0x')) return;

    const methodTd = tds.eq(2);
    const method = methodTd.find('.badge, span[data-title]').first().text().trim() || methodTd.text().trim();

    const blockTd = tds.eq(4);
    const block = blockTd.find('a').first().text().trim() || blockTd.text().trim();

    // Age: full date format from showDate span text or showAge span data-bs-title → convert to IST
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

    const amountTd = $row.find('td .td_showAmount');
    const amount = amountTd.first().text().trim() || '';

    // Calculate USD: parse amount number (e.g. "0.09553678 ETH" or "7 wei") and multiply by ethPrice for ETH
    let amountUsd = '';
    if (ethPrice > 0 && amount) {
      const ethMatch = amount.match(/^([\d.]+)\s*ETH/i);
      if (ethMatch) {
        const amountNum = parseFloat(ethMatch[1].replace(/,/g, '')) || 0;
        amountUsd = '$' + (amountNum * ethPrice).toFixed(2);
      }
    }

    const feeTd = $row.find('td.showTxnFee');
    let txnFee = feeTd.first().text().trim().replace(/\s/g, '');
    if (/0\s*\.\s*/.test(txnFee)) txnFee = txnFee.replace(/\s*\.\s*/g, '.');

    transactions.push({
      transactionHash: hash,
      walletAddress,
      txType: 'eth',
      token: 'ETH',
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
 * Parse token transfers from address-tokenpage HTML.
 * Table is identified by thead id="theadTokenERC20Table".
 * Columns: (icon), Transaction Hash, Method, Block, Age, From, In/Out, To, Amount, Token.
 * Token page has a Token column (parsed here), not a Txn Fee column — txnFee is always empty for token txns.
 * Same block/time (same tx hash) but different token = different transfer; we store token so each is a separate record.
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
    const hash = hashLink.attr('href') ? hashLink.attr('href').replace(/.*\/tx\//, '').replace(/\?.*$/, '').trim() : hashLink.text().trim();
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

    // Amount: td with span.td_showAmount; USD from data-bs-title="80 | $79.88"
    const amountTd = tds.eq(11);
    const amountSpan = amountTd.find('span.td_showAmount').first();
    const amount = amountSpan.text().trim() || amountTd.text().replace(/\s+/g, ' ').trim() || '';
    const titleAttr = amountSpan.attr('data-bs-title') || '';
    const usdMatch = titleAttr.match(/\$[\d,]+\.?\d*/);
    const amountUsd = usdMatch ? usdMatch[0] : '';

    // Token column (token page has Token, not Txn Fee)
    const tokenTd = tds.eq(12);
    const token = tokenTd.find('div.hash-tag').first().text().trim().replace(/\s+/g, ' ') || tokenTd.text().trim().replace(/\s+/g, ' ') || '';

    transactions.push({
      transactionHash: hash,
      walletAddress,
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
      txnFee: '', // no Txn Fee column on token page; we parse Token instead
    });
  });

  return transactions;
}

/**
 * Parse full address page: ETH balance, Eth value, ETH price, and transactions (with amountUsd)
 */
export function parseAddressHtml(html, walletAddress) {
  const $ = cheerio.load(html);
  const ethBalance = parseEthBalance($);
  const ethValue = parseEthValue($);
  const ethPrice = parseEthPrice($);
  const transactions = parseTransactions($, walletAddress, ethPrice);
  return { ethBalance, ethValue, transactions };
}

/**
 * Fetch and parse address data from Etherscan
 */
export async function fetchAndParseAddress(address) {
  const html = await fetchAddressPage(address);
  return parseAddressHtml(html, address);
}

/**
 * Parse token transfers page HTML
 */
export function parseTokenTxnsHtml(html, walletAddress) {
  const $ = cheerio.load(html);
  return parseTokenTransactions($, walletAddress);
}

/**
 * Fetch and parse both ETH and token transactions for an address
 */
export async function fetchAndParseAllTransactions(address) {
  const [ethResult, tokenTxns] = await Promise.all([
    fetchAndParseAddress(address),
    fetchTokenTxnsPage(address).then((html) => parseTokenTxnsHtml(html, address)).catch(() => []),
  ]);
  // console.log(ethResult);
  // console.log(tokenTxns);
  const tokenTransactions = Array.isArray(tokenTxns) ? tokenTxns : [];
  return {
    ...ethResult,
    tokenTransactions,
  };
}
