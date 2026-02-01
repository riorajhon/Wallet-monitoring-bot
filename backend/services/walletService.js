import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import { getWebhookForWallet } from './runningBotsStore.js';
import { fetchAndParseAllTransactions } from './etherscanParser.js';
import { fetchAndParseAllTransactions as fetchAndParseAllTransactionsBNB } from './bscscanParser.js';
import { fetchAndParseTronWallet } from './tronService.js';
import { fetchAndParseBtcWallet } from './btcService.js';
import { fetchAndParseLtcWallet } from './ltcService.js';
import { fetchAndParseSolWallet } from './solService.js';
import { sendTransactionAlertsBatch } from './discordService.js';

function walletTypeToTxType(walletType) {
  const w = String(walletType || '').trim().toLowerCase();
  if (w === 'bnb') return 'bnb';
  if (w === 'tron') return 'tron';
  if (w === 'bitcoin') return 'btc';
  if (w === 'litecoin') return 'ltc';
  if (w === 'solana') return 'sol';
  return 'eth';
}

export async function saveTransactions(transactions, normalized, walletType = 'Ethereum') {
  const nativeToken = walletType === 'BNB' ? 'BNB' : walletType === 'Tron' ? 'TRX' : walletType === 'Bitcoin' ? 'BTC' : walletType === 'Litecoin' ? 'LTC' : walletType === 'Solana' ? 'SOL' : 'ETH';
  const tokenVal = (tx) => (tx.txType === 'token' ? (tx.token != null && tx.token !== '' ? String(tx.token).trim() : '') : (tx.token || nativeToken));
  const defaultTxType = walletTypeToTxType(walletType);

  const withKey = [];
  for (const tx of transactions) {
    const hash = String(tx.transactionHash || '').trim();
    if (!hash) continue;
    const token = tokenVal(tx);
    withKey.push({ tx, hash, token, key: `${hash}|${normalized}|${token}` });
  }
  if (withKey.length === 0) return { newCount: 0, newTransactions: [] };

  const filters = withKey.map(({ hash, token }) => ({ transactionHash: hash, walletAddress: normalized, token }));
  const existing = await Transaction.find({ $or: filters }).select('transactionHash walletAddress token').lean();
  const existingSet = new Set(existing.map((e) => `${e.transactionHash}|${e.walletAddress}|${e.token}`));

  const toInsert = withKey.filter(({ key }) => !existingSet.has(key));
  if (toInsert.length === 0) return { newCount: 0, newTransactions: [] };

  const docs = toInsert.map(({ tx, hash, token }) => {
    const txType = tx.txType === 'token' ? 'token' : (tx.txType && tx.txType !== 'eth' ? tx.txType : defaultTxType);
    const walletTypeStr = String(tx.walletType || walletType).trim() || 'Ethereum';
    return {
      transactionHash: hash,
      walletAddress: normalized,
      walletType: walletTypeStr,
      txType,
      token,
      method: String(tx.method || '').trim(),
      block: String(tx.block || '').trim(),
      age: String(tx.age || '').trim(),
      from: String(tx.from || '').trim(),
      to: String(tx.to || '').trim(),
      inOut: String(tx.inOut || '').trim(),
      amount: String(tx.amount || '').trim(),
      amountUsd: String(tx.amountUsd != null ? tx.amountUsd : '').trim(),
      txnFee: String(tx.txnFee != null ? tx.txnFee : '').trim(),
    };
  });

  let insertedCount = docs.length;
  let failedIndices = new Set();
  try {
    await Transaction.insertMany(docs, { ordered: false });
  } catch (err) {
    if (err.code === 11000 && err.writeErrors && err.result) {
      failedIndices = new Set(err.writeErrors.map((we) => we.index));
      insertedCount = err.result.insertedCount ?? (err.result.insertedIds ? Object.keys(err.result.insertedIds).length : 0);
      if (insertedCount === 0) throw err;
    } else {
      throw err;
    }
  }

  const newTransactions = toInsert
    .filter((_, i) => !failedIndices.has(i))
    .map(({ tx }) => ({ ...tx, walletType: String(tx.walletType || walletType).trim() || 'Ethereum' }));
  return { newCount: insertedCount, newTransactions };
}

export async function notifyDiscordNewTransactions(normalized, walletType, newTransactions) {
  if (!newTransactions || newTransactions.length === 0) return;
  const webhookUrl = getWebhookForWallet(walletType, normalized);
  if (!webhookUrl) return;
  try {
    await sendTransactionAlertsBatch(webhookUrl, newTransactions);
  } catch (e) {
    console.warn('[Discord alert]', webhookUrl.slice(0, 50) + '...', e.message);
  }
}

export async function addOrUpdateWallet(address, options = {}) {
  const { forceRefresh = false } = options;
  const normalized = address.trim().toLowerCase();
  if (!normalized.startsWith('0x') || normalized.length < 40) {
    throw new Error('Invalid address (expected 0x...)');
  }

  const existingWallet = await Wallet.findOne({ address: normalized });
  if (existingWallet && !forceRefresh) {
    return getWalletWithTransactions(normalized, 'Ethereum');
  }

  const { ethBalance, ethValue, transactions, tokenTransactions = [] } = await fetchAndParseAllTransactions(normalized);

  let wallet = existingWallet || new Wallet({ address: normalized });
  wallet.ethBalance = ethBalance;
  wallet.ethValue = ethValue;
  wallet.lastFetched = new Date();
  await wallet.save();

  const r1 = await saveTransactions(transactions, normalized, 'Ethereum');
  const r2 = await saveTransactions(tokenTransactions, normalized, 'Ethereum');
  const allNew = [...(r1.newTransactions || []), ...(r2.newTransactions || [])];
  if (allNew.length > 0) {
    await notifyDiscordNewTransactions(normalized, 'Ethereum', allNew);
    wallet.lastFetched = new Date();
    await wallet.save();
  }
  return getWalletWithTransactions(normalized, 'Ethereum');
}

export async function addOrUpdateWalletBNB(address, options = {}) {
  const { forceRefresh = false } = options;
  const normalized = address.trim().toLowerCase();
  if (!normalized.startsWith('0x') || normalized.length < 40) {
    throw new Error('Invalid address (expected 0x...)');
  }

  const existingWallet = await Wallet.findOne({ address: normalized });
  if (existingWallet && !forceRefresh) {
    return getWalletWithTransactions(normalized, 'BNB');
  }

  const { bnbBalance, bnbValue, transactions, tokenTransactions = [] } = await fetchAndParseAllTransactionsBNB(normalized);

  let wallet = existingWallet || new Wallet({ address: normalized });
  wallet.bnbBalance = bnbBalance;
  wallet.bnbValue = bnbValue;
  wallet.lastFetched = new Date();
  await wallet.save();

  const r1 = await saveTransactions(transactions, normalized, 'BNB');
  const r2 = await saveTransactions(tokenTransactions, normalized, 'BNB');
  const allNew = [...(r1.newTransactions || []), ...(r2.newTransactions || [])];
  if (allNew.length > 0) {
    await notifyDiscordNewTransactions(normalized, 'BNB', allNew);
    wallet.lastFetched = new Date();
    await wallet.save();
  }
  return getWalletWithTransactions(normalized, 'BNB');
}

export async function addOrUpdateWalletTron(address, options = {}) {
  const { forceRefresh = false } = options;
  const normalized = (address || '').trim();
  if (!normalized) throw new Error('Tron address is required');

  const existingWallet = await Wallet.findOne({ address: normalized });
  if (existingWallet && !forceRefresh) {
    return getWalletWithTransactions(normalized, 'Tron');
  }

  const minBlockTs = existingWallet?.tronLastBlockTs ?? null;
  const { tronBalance, tronValue, transactions, tokenTransactions = [], maxBlockTimestamp } = await fetchAndParseTronWallet(normalized, { minBlockTimestamp: minBlockTs });

  let wallet = existingWallet || new Wallet({ address: normalized });
  wallet.tronBalance = tronBalance;
  wallet.tronValue = tronValue;
  if (maxBlockTimestamp != null && maxBlockTimestamp > 0) {
    wallet.tronLastBlockTs = Math.max(Number(wallet.tronLastBlockTs) || 0, maxBlockTimestamp);
  }
  wallet.lastFetched = new Date();
  await wallet.save();

  const r1 = await saveTransactions(transactions, normalized, 'Tron');
  const r2 = await saveTransactions(tokenTransactions, normalized, 'Tron');
  const allNew = [...(r1.newTransactions || []), ...(r2.newTransactions || [])];
  if (allNew.length > 0) {
    await notifyDiscordNewTransactions(normalized, 'Tron', allNew);
    wallet.lastFetched = new Date();
    await wallet.save();
  }
  return getWalletWithTransactions(normalized, 'Tron');
}

export async function addOrUpdateWalletBtc(address, options = {}) {
  const { forceRefresh = false } = options;
  const normalized = (address || '').trim();
  if (!normalized) throw new Error('Bitcoin address is required');

  const existingWallet = await Wallet.findOne({ address: normalized });
  if (existingWallet && !forceRefresh) {
    return getWalletWithTransactions(normalized, 'Bitcoin');
  }

  const { btcBalance, btcValue, transactions, tokenTransactions = [] } = await fetchAndParseBtcWallet(normalized);

  let wallet = existingWallet || new Wallet({ address: normalized });
  wallet.btcBalance = btcBalance;
  wallet.btcValue = btcValue;
  wallet.lastFetched = new Date();
  await wallet.save();

  const r1 = await saveTransactions(transactions, normalized, 'Bitcoin');
  const r2 = await saveTransactions(tokenTransactions, normalized, 'Bitcoin');
  const allNew = [...(r1.newTransactions || []), ...(r2.newTransactions || [])];
  if (allNew.length > 0) {
    await notifyDiscordNewTransactions(normalized, 'Bitcoin', allNew);
    wallet.lastFetched = new Date();
    await wallet.save();
  }
  return getWalletWithTransactions(normalized, 'Bitcoin');
}

export async function addOrUpdateWalletLtc(address, options = {}) {
  const { forceRefresh = false } = options;
  const normalized = (address || '').trim();
  if (!normalized) throw new Error('Litecoin address is required');

  const existingWallet = await Wallet.findOne({ address: normalized });
  if (existingWallet && !forceRefresh) {
    return getWalletWithTransactions(normalized, 'Litecoin');
  }

  const { ltcBalance, ltcValue, transactions, tokenTransactions = [] } = await fetchAndParseLtcWallet(normalized);

  let wallet = existingWallet || new Wallet({ address: normalized });
  wallet.ltcBalance = ltcBalance;
  wallet.ltcValue = ltcValue;
  wallet.lastFetched = new Date();
  await wallet.save();

  const r1 = await saveTransactions(transactions, normalized, 'Litecoin');
  const r2 = await saveTransactions(tokenTransactions, normalized, 'Litecoin');
  const allNew = [...(r1.newTransactions || []), ...(r2.newTransactions || [])];
  if (allNew.length > 0) {
    await notifyDiscordNewTransactions(normalized, 'Litecoin', allNew);
    wallet.lastFetched = new Date();
    await wallet.save();
  }
  return getWalletWithTransactions(normalized, 'Litecoin');
}

export async function addOrUpdateWalletSol(address, options = {}) {
  const { forceRefresh = false, silent = false } = options;
  const normalized = (address || '').trim();
  if (!normalized) throw new Error('Solana address is required');

  const existingWallet = await Wallet.findOne({ address: normalized });
  if (existingWallet && !forceRefresh) {
    return getWalletWithTransactions(normalized, 'Solana');
  }

  const { solBalance, solValue, transactions, tokenTransactions = [] } = await fetchAndParseSolWallet(normalized);

  let wallet = existingWallet || new Wallet({ address: normalized });
  wallet.solBalance = solBalance;
  wallet.solValue = solValue;
  wallet.lastFetched = new Date();
  await wallet.save();

  const r1 = await saveTransactions(transactions, normalized, 'Solana');
  const r2 = await saveTransactions(tokenTransactions, normalized, 'Solana');
  const allNew = [...(r1.newTransactions || []), ...(r2.newTransactions || [])];
  if (allNew.length > 0 && !silent) {
    await notifyDiscordNewTransactions(normalized, 'Solana', allNew);
    wallet.lastFetched = new Date();
    await wallet.save();
  }
  return getWalletWithTransactions(normalized, 'Solana');
}

export async function getWalletWithTransactions(address, walletType = 'Ethereum') {
  const wType = (walletType || 'Ethereum').trim();
  const caseSensitive = ['Tron', 'Bitcoin', 'Litecoin', 'Solana'].includes(wType);
  const normalized = caseSensitive ? (address || '').trim() : (address || '').trim().toLowerCase();
  const wallet = await Wallet.findOne({ address: normalized });
  if (!wallet) return null;
  const transactions = await Transaction.find({ walletAddress: normalized, walletType: wType })
    .sort({ createdAt: -1 })
    .lean();
  const obj = wallet.toObject();
  let balance = (obj.ethBalance ?? '');
  let value = (obj.ethValue ?? '');
  if (wType === 'BNB') {
    balance = obj.bnbBalance ?? '';
    value = obj.bnbValue ?? '';
  } else if (wType === 'Tron') {
    balance = obj.tronBalance ?? '';
    value = obj.tronValue ?? '';
  } else if (wType === 'Bitcoin') {
    balance = obj.btcBalance ?? '';
    value = obj.btcValue ?? '';
  } else if (wType === 'Litecoin') {
    balance = obj.ltcBalance ?? '';
    value = obj.ltcValue ?? '';
  } else if (wType === 'Solana') {
    balance = obj.solBalance ?? '';
    value = obj.solValue ?? '';
  }
  return { ...obj, ethBalance: balance, ethValue: value, transactions };
}

export async function getAllWallets() {
  const wallets = await Wallet.find().sort({ lastFetched: -1 }).lean();
  return wallets;
}

export async function refreshWallet(address, chain = 'ETH') {
  const c = String(chain || 'ETH').toUpperCase();
  if (c === 'BNB') return addOrUpdateWalletBNB(address, { forceRefresh: true });
  if (c === 'TRON') return addOrUpdateWalletTron(address, { forceRefresh: true });
  if (c === 'BTC') return addOrUpdateWalletBtc(address, { forceRefresh: true });
  if (c === 'LTC') return addOrUpdateWalletLtc(address, { forceRefresh: true });
  if (c === 'SOL') return addOrUpdateWalletSol(address, { forceRefresh: true });
  return addOrUpdateWallet(address, { forceRefresh: true });
}

export async function refreshAllWallets() {
  const wallets = await Wallet.find().select('address').lean();
  const results = [];
  for (const w of wallets) {
    try {
      const result = await addOrUpdateWallet(w.address, { forceRefresh: true });
      results.push({ address: w.address, ok: true, result });
    } catch (err) {
      results.push({ address: w.address, ok: false, error: err.message });
    }
  }
  return results;
}
