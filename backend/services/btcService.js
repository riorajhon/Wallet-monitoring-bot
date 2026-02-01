/**
 * Bitcoin wallet data via Blockstream/mempool API (no HTML parsing).
 * Address from DB (bot). Config from .env. Normalizes txs for DB + Discord (webhook from DB).
 */
import axios from 'axios';
import { getBtcUsd } from './priceService.js';
import { toAgeStringIST } from '../utils/dateIST.js';

const SATOSHI_PER_BTC = 100_000_000;

function getApiUrl() {
  const network = (process.env.BTC_NETWORK || 'mainnet').toLowerCase();
  if (network === 'mainnet') return 'https://blockstream.info/api';
  if (network === 'testnet4') return 'https://mempool.space/testnet4/api';
  return 'https://blockstream.info/testnet/api';
}

async function fetchBalance(address) {
  const apiUrl = getApiUrl();
  const res = await axios.get(`${apiUrl}/address/${encodeURIComponent(address)}`, {
    validateStatus: (s) => s === 200 || s === 404 || s === 400,
  });
  if (res.status === 404 || res.status === 400 || !res.data) return { balance: '0', value: '' };
  const chain = res.data.chain_stats ?? res.data.chain_stats ?? {};
  const funded = Number(chain.funded_txo_sum) ?? 0;
  const spent = Number(chain.spent_txo_sum) ?? 0;
  if (isNaN(funded) || isNaN(spent)) return { balance: '0', value: '' };
  const satoshi = Math.max(0, funded - spent);
  const btc = satoshi / SATOSHI_PER_BTC;
  return { balance: String(btc), value: '' };
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

function normalizeTx(tx, walletAddress, btcPriceUsd = 0) {
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
  const amountBtc = Math.abs(netChange) / SATOSHI_PER_BTC;
  const inOut = netChange > 0 ? 'IN' : 'OUT';
  const blockTime = tx.status?.block_time;
  const ageStr = blockTime ? toAgeStringIST(blockTime) : '';
  const block = tx.status?.block_height != null ? String(tx.status.block_height) : '';
  const status = tx.status?.confirmed ? 'confirmed' : 'pending';
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
  const amountUsd = btcPriceUsd > 0 ? (amountBtc * btcPriceUsd).toFixed(2) : '';
  return {
    transactionHash: tx.txid || '',
    walletType: 'Bitcoin',
    txType: 'btc',
    token: 'BTC',
    method: 'Transfer',
    block,
    age: ageStr,
    from,
    to,
    inOut,
    amount: String(amountBtc),
    amountUsd,
    txnFee: '',
    status,
  };
}

export async function fetchAndParseBtcWallet(address) {
  const trimmed = (address || '').trim();
  if (!trimmed) throw new Error('Bitcoin address is required');

  const [balanceRes, btcPriceUsd, rawTxs] = await Promise.all([
    fetchBalance(trimmed),
    getBtcUsd(),
    fetchTransactions(trimmed),
  ]);
  const { balance } = balanceRes;
  const balanceNum = parseFloat(balance) || 0;
  const valueUsd = btcPriceUsd > 0 ? (balanceNum * btcPriceUsd).toFixed(2) : '';
  const transactions = [];
  for (const tx of rawTxs) {
    const norm = normalizeTx(tx, trimmed, btcPriceUsd);
    if (norm) transactions.push(norm);
  }

  return {
    btcBalance: balance,
    btcValue: valueUsd,
    transactions,
    tokenTransactions: [],
  };
}
