/**
 * Litecoin wallet data via litecoinspace API (no HTML parsing).
 * Address from DB (bot). Config from .env. Normalizes txs for DB + Discord (webhook from DB).
 */
import axios from 'axios';
import { getLtcUsd } from './priceService.js';
import { toAgeStringIST } from '../utils/dateIST.js';

const LITOSHI_PER_LTC = 100_000_000;

function getApiUrl() {
  const network = (process.env.LTC_NETWORK || 'mainnet').toLowerCase();
  return network === 'mainnet' ? 'https://litecoinspace.org/api' : 'https://litecoinspace.org/testnet/api';
}

async function fetchBalance(address) {
  const apiUrl = getApiUrl();
  const res = await axios.get(`${apiUrl}/address/${encodeURIComponent(address)}`, {
    validateStatus: (s) => s === 200 || s === 404 || s === 400,
  });
  if (res.status === 404 || res.status === 400 || !res.data) return { balance: '0', value: '' };
  const chain = res.data.chain_stats || {};
  const funded = Number(chain.funded_txo_sum) || 0;
  const spent = Number(chain.spent_txo_sum) || 0;
  const litoshi = Math.max(0, funded - spent);
  const ltc = litoshi / LITOSHI_PER_LTC;
  return { balance: String(ltc), value: '' };
}

const CONFIRMED_PAGE_SIZE = 25;
const MAX_PAGES = 5;

async function fetchTransactions(address) {
  const apiUrl = getApiUrl();
  const opts = { validateStatus: (s) => s === 200 || s === 400 };
  const mempoolRes = await axios.get(`${apiUrl}/address/${encodeURIComponent(address)}/txs/mempool`, opts).catch(() => ({ status: 400, data: [] }));
  const mempool = mempoolRes.status === 400 ? [] : (mempoolRes.data || []);

  const confirmed = [];
  let lastTxid = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = lastTxid
      ? `${apiUrl}/address/${encodeURIComponent(address)}/txs/chain/${encodeURIComponent(lastTxid)}`
      : `${apiUrl}/address/${encodeURIComponent(address)}/txs`;
    const res = await axios.get(url, opts).catch(() => ({ status: 400, data: [] }));
    const chunk = res.status === 400 ? [] : (res.data || []);
    confirmed.push(...chunk);
    if (chunk.length < CONFIRMED_PAGE_SIZE) break;
    lastTxid = chunk[chunk.length - 1]?.txid || null;
    if (!lastTxid) break;
  }
  return [...mempool, ...confirmed];
}

function normalizeTx(tx, walletAddress, ltcPriceUsd = 0) {
  let totalReceived = 0;
  let totalSent = 0;
  for (const vout of tx.vout || []) {
    if (vout.scriptpubkey_address === walletAddress) totalReceived += Number(vout.value) || 0;
  }
  for (const vin of tx.vin || []) {
    if (vin.prevout?.scriptpubkey_address === walletAddress) totalSent += Number(vin.prevout.value) || 0;
  }
  const netChange = totalReceived - totalSent;
  if (netChange === 0) return null;
  const amountLtc = Math.abs(netChange) / LITOSHI_PER_LTC;
  const inOut = netChange > 0 ? 'IN' : 'OUT';
  const blockTime = tx.status?.block_time;
  const ageStr = blockTime ? toAgeStringIST(blockTime) : '';
  const block = tx.status?.block_height != null ? String(tx.status.block_height) : '';
  let from = '';
  let to = '';
  if (inOut === 'IN') {
    const firstVin = tx.vin?.find((v) => v.prevout?.scriptpubkey_address && v.prevout.scriptpubkey_address !== walletAddress);
    from = firstVin?.prevout?.scriptpubkey_address || tx.vin?.[0]?.prevout?.scriptpubkey_address || '';
    to = walletAddress;
  } else {
    from = walletAddress;
    const firstVout = tx.vout?.find((v) => v.scriptpubkey_address && v.scriptpubkey_address !== walletAddress);
    to = firstVout?.scriptpubkey_address || tx.vout?.[0]?.scriptpubkey_address || '';
  }
  const amountUsd = ltcPriceUsd > 0 ? (amountLtc * ltcPriceUsd).toFixed(2) : '';
  return {
    transactionHash: tx.txid || '',
    walletType: 'Litecoin',
    txType: 'ltc',
    token: 'LTC',
    method: 'Transfer',
    block,
    age: ageStr,
    from,
    to,
    inOut,
    amount: String(amountLtc),
    amountUsd,
    txnFee: '',
  };
}

export async function fetchAndParseLtcWallet(address) {
  const trimmed = (address || '').trim();
  if (!trimmed) throw new Error('Litecoin address is required');

  const [balanceRes, ltcPriceUsd, rawTxs] = await Promise.all([
    fetchBalance(trimmed),
    getLtcUsd(),
    fetchTransactions(trimmed),
  ]);
  const { balance } = balanceRes;
  const balanceNum = parseFloat(balance) || 0;
  const valueUsd = ltcPriceUsd > 0 ? (balanceNum * ltcPriceUsd).toFixed(2) : '';
  const transactions = [];
  for (const tx of rawTxs) {
    const norm = normalizeTx(tx, trimmed, ltcPriceUsd);
    if (norm) transactions.push(norm);
  }

  return {
    ltcBalance: balance,
    ltcValue: valueUsd,
    transactions,
    tokenTransactions: [],
  };
}
