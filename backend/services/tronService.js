/**
 * Tron wallet data via TronGrid API (no HTML parsing).
 * Gets wallet address from DB (bot), config from .env. Normalizes txs for DB + existing Discord alert.
 */
import axios from 'axios';
import { TronWeb } from 'tronweb';
import { getTrxUsd } from './priceService.js';
import { toAgeStringIST } from '../utils/dateIST.js';

const SUN_PER_TRX = 1_000_000;

// Known TRC-20 contract -> symbol/decimals (optional, for TRC-20 parsing)
const KNOWN_TRC20 = {
  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: { symbol: 'USDT', decimals: 6 },
  TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8: { symbol: 'USDC', decimals: 6 },
  TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT: { symbol: 'USDJ', decimals: 18 },
  TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR: { symbol: 'WTRX', decimals: 6 },
};

function getBaseUrl() {
  return (process.env.TRON_RPC_URL || 'https://api.trongrid.io').replace(/\/$/, '');
}

function getHeaders() {
  const key = process.env.TRON_API_KEY;
  return key ? { 'TRON-PRO-API-KEY': key } : {};
}

function getTronWeb() {
  const baseUrl = getBaseUrl();
  return new TronWeb({ fullHost: baseUrl, headers: getHeaders() });
}

/**
 * Fetch account balance (TRX in SUN -> string TRX).
 */
async function fetchBalance(address) {
  const baseUrl = getBaseUrl();
  const res = await axios.get(`${baseUrl}/v1/accounts/${encodeURIComponent(address)}`, {
    headers: getHeaders(),
    validateStatus: (s) => s === 200 || s === 404 || s === 400,
  });
  const account = res.data?.data?.[0] ?? res.data?.data ?? res.data;
  if (res.status === 404 || res.status === 400 || !account) return { balance: '0', value: '' };
  const balanceSun = Number(account.balance) || 0;
  const trx = balanceSun / SUN_PER_TRX;
  return { balance: String(trx), value: '' };
}

/**
 * Fetch recent transactions for address.
 * If minBlockTimestamp (ms) is set, only returns txs with block_timestamp >= minBlockTimestamp (gap catch-up).
 */
async function fetchTransactions(address, options = {}) {
  const { minBlockTimestamp } = options;
  const baseUrl = getBaseUrl();
  const params = { only_confirmed: true, limit: 50, order_by: 'block_timestamp,desc' };
  if (minBlockTimestamp != null && minBlockTimestamp > 0) {
    params.min_block_timestamp = minBlockTimestamp;
  }
  const res = await axios.get(`${baseUrl}/v1/accounts/${encodeURIComponent(address)}/transactions`, {
    params,
    headers: getHeaders(),
    validateStatus: (s) => s === 200 || s === 400,
  });
  if (res.status === 400) return [];
  return res.data?.data || [];
}

/**
 * Normalize one Tron tx to our schema (transactionHash, from, to, amount, inOut, token, block, age, amountUsd, ...).
 */
function normalizeTx(tx, walletAddressBase58, tronWeb, trxPriceUsd = 0) {
  const contract = tx.raw_data?.contract?.[0];
  if (!contract) return null;
  const toBase58 = (hex) => {
    try {
      const h = hex.startsWith('41') ? hex : '41' + hex;
      return tronWeb.address.fromHex(h);
    } catch {
      return hex;
    }
  };
  const blockTs = tx.block_timestamp;
  const ageStr = blockTs ? toAgeStringIST(blockTs >= 1e12 ? blockTs : blockTs * 1000) : '';

  if (contract.type === 'TransferContract') {
    const value = contract.parameter?.value;
    if (!value) return null;
    const from = toBase58(value.owner_address);
    const to = toBase58(value.to_address);
    const amountTrx = (value.amount || 0) / SUN_PER_TRX;
    const isIn = to === walletAddressBase58;
    const isOut = from === walletAddressBase58;
    if (!isIn && !isOut) return null;
    const txHash = tx.txID || tx.tx_id || '';
    const amountUsd = trxPriceUsd > 0 ? (amountTrx * trxPriceUsd).toFixed(2) : '';
    return {
      transactionHash: txHash,
      walletType: 'Tron',
      txType: 'tron',
      token: 'TRX',
      method: 'Transfer',
      block: String(tx.block_number ?? tx.block_timestamp ?? ''),
      age: ageStr,
      from,
      to,
      inOut: isIn ? 'IN' : 'OUT',
      amount: `${amountTrx}`,
      amountUsd,
      txnFee: '',
    };
  }

  if (contract.type === 'TriggerSmartContract') {
    const value = contract.parameter?.value;
    if (!value?.data || value.data.length < 136) return null;
    const sig = value.data.slice(0, 8);
    if (sig !== 'a9059cbb') return null;
    try {
      const toHex = '41' + value.data.slice(32, 72).replace(/^0+/, '') || value.data.slice(32, 72);
      const amountHex = value.data.slice(72, 136);
      const to = toBase58(toHex);
      const from = toBase58(value.owner_address);
      const contractAddr = toBase58(value.contract_address);
      const meta = KNOWN_TRC20[contractAddr] || { symbol: 'TRC20', decimals: 6 };
      const amount = parseInt(amountHex, 16) / Math.pow(10, meta.decimals);
      const isIn = to === walletAddressBase58;
      const isOut = from === walletAddressBase58;
      if (!isIn && !isOut) return null;
      const txHash = tx.txID || tx.tx_id || '';
      const amountUsd = (meta.symbol === 'USDT' || meta.symbol === 'USDC' || meta.symbol === 'USDJ') ? amount.toFixed(2) : '';
      return {
        transactionHash: txHash,
        walletType: 'Tron',
        txType: 'token',
        token: meta.symbol,
        method: 'Transfer',
        block: String(tx.block_number ?? tx.block_timestamp ?? ''),
        age: ageStr,
        from,
        to,
        inOut: isIn ? 'IN' : 'OUT',
        amount: `${amount}`,
        amountUsd,
        txnFee: '',
      };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Fetch and normalize all transactions for a Tron address (base58).
 * options.minBlockTimestamp: if set, fetch only txs with block_timestamp >= this (gap catch-up).
 * Returns { tronBalance, tronValue, transactions, tokenTransactions, maxBlockTimestamp }.
 */
export async function fetchAndParseTronWallet(address, options = {}) {
  const trimmed = (address || '').trim();
  if (!trimmed) throw new Error('Tron address is required');

  const [balanceRes, trxPriceUsd, rawTxs] = await Promise.all([
    fetchBalance(trimmed),
    getTrxUsd(),
    fetchTransactions(trimmed, options),
  ]);
  const { balance } = balanceRes;
  const balanceNum = parseFloat(balance) || 0;
  const valueUsd = trxPriceUsd > 0 ? (balanceNum * trxPriceUsd).toFixed(2) : '';

  const tronWeb = getTronWeb();
  const transactions = [];
  const tokenTransactions = [];
  let maxBlockTimestamp = 0;
  for (const tx of rawTxs) {
    const ts = tx.block_timestamp;
    if (ts && ts > maxBlockTimestamp) maxBlockTimestamp = ts;
    const norm = normalizeTx(tx, trimmed, tronWeb, trxPriceUsd);
    if (!norm) continue;
    if (norm.txType === 'token') tokenTransactions.push(norm);
    else transactions.push(norm);
  }

  return {
    tronBalance: balance,
    tronValue: valueUsd,
    transactions,
    tokenTransactions,
    maxBlockTimestamp: maxBlockTimestamp || null,
  };
}
