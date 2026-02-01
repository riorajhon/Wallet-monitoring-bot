/**
 * Solana wallet data via RPC (no HTML parsing).
 * Address from DB (bot). Config from .env. Normalizes txs for DB + Discord (webhook from DB).
 */
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getSolUsd } from './priceService.js';
import { toAgeStringIST } from '../utils/dateIST.js';

const SOL_SIGNATURE_LIMIT = Math.min(Math.max(parseInt(process.env.SOL_SIGNATURE_LIMIT, 10) || 50, 5), 50);
const SOL_SIGNATURE_PAGES = Math.min(Math.max(parseInt(process.env.SOL_SIGNATURE_PAGES, 10) || 2, 1), 5);
const SOL_CHECK_RECENT_LIMIT = 10; // same as refer/sol.js
const SOL_TX_DELAY_MS = parseInt(process.env.SOL_TX_DELAY_MS, 10) || 250;
const SOL_429_RETRIES = 2;
const SOL_429_BASE_MS = 5000;
const SOL_PROCESSED_CAP = 1000; // same as refer/sol.js

function getRpcUrl() {
  return (process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com').replace(/\/$/, '');
}

function isRateLimitError(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  return msg.includes('429') || msg.includes('too many request');
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getConnection() {
  return new Connection(getRpcUrl(), {
    disableRetryOnRateLimit: true,
  });
}

async function fetchBalance(address) {
  try {
    const conn = getConnection();
    const pubkey = new PublicKey(address);
    const lamports = await conn.getBalance(pubkey);
    const sol = lamports / LAMPORTS_PER_SOL;
    return { balance: String(sol), value: '' };
  } catch {
    return { balance: '0', value: '' };
  }
}

async function fetchTransactions(address, options = {}) {
  const { before } = options;
  try {
    const conn = getConnection();
    const pubkey = new PublicKey(address);
    const opts = { limit: SOL_SIGNATURE_LIMIT };
    if (before) opts.before = before;
    const signatures = await conn.getSignaturesForAddress(pubkey, opts, 'confirmed');
    return signatures;
  } catch {
    return [];
  }
}

async function fetchTransactionsPaginated(address) {
  const all = [];
  let before = undefined;
  for (let page = 0; page < SOL_SIGNATURE_PAGES; page++) {
    const batch = await fetchTransactions(address, before ? { before } : {});
    if (batch.length === 0) break;
    const seen = new Set(all.map((s) => s.signature));
    for (const s of batch) {
      if (!seen.has(s.signature)) {
        seen.add(s.signature);
        all.push(s);
      }
    }
    if (batch.length < SOL_SIGNATURE_LIMIT) break;
    before = batch[batch.length - 1].signature;
    await delay(200);
  }
  return all;
}

async function getParsedTransactionWithRetry(conn, signature) {
  let lastErr;
  for (let attempt = 0; attempt <= SOL_429_RETRIES; attempt++) {
    try {
      return await conn.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err) && attempt < SOL_429_RETRIES) {
        const waitMs = SOL_429_BASE_MS * (attempt + 1);
        await delay(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function normalizeTx(signatureInfo, parsedTx, walletAddress, solPriceUsd = 0) {
  if (!parsedTx?.meta) return null;
  const walletStr = walletAddress;
  const accountIndex = parsedTx.transaction.message.accountKeys.findIndex(
    (key) => key.pubkey.toString() === walletStr
  );
  if (accountIndex === -1) return null;
  const preBalance = (parsedTx.meta.preBalances[accountIndex] || 0) / LAMPORTS_PER_SOL;
  const postBalance = (parsedTx.meta.postBalances[accountIndex] || 0) / LAMPORTS_PER_SOL;
  const change = postBalance - preBalance;
  if (change === 0) return null;
  const inOut = change > 0 ? 'IN' : 'OUT';
  const amount = Math.abs(change);
  let otherParty = '';
  if (parsedTx.transaction.message.accountKeys.length > 1) {
    const other = parsedTx.transaction.message.accountKeys.find(
      (key) => key.pubkey.toString() !== walletStr
    );
    if (other) otherParty = other.pubkey.toString();
  }
  const blockTime = parsedTx.blockTime;
  const ageStr = blockTime ? toAgeStringIST(blockTime) : '';
  const slot = parsedTx.slot != null ? String(parsedTx.slot) : '';
  const status = signatureInfo.err ? 'failed' : 'confirmed';
  const amountUsd = solPriceUsd > 0 ? (amount * solPriceUsd).toFixed(2) : '';
  return {
    transactionHash: signatureInfo.signature || '',
    walletType: 'Solana',
    txType: 'sol',
    token: 'SOL',
    method: 'Transfer',
    block: slot,
    age: ageStr,
    from: inOut === 'IN' ? otherParty : walletStr,
    to: inOut === 'OUT' ? otherParty : walletStr,
    inOut,
    amount: String(amount),
    amountUsd,
    txnFee: '',
    status,
  };
}

/**
 * Same workflow as refer/sol.js checkRecentTransactions + processTransaction.
 * Uses in-memory processedSignatures (caller owns the Set). Address/webhook/DB are handled by caller.
 * @param {import('@solana/web3.js').Connection} connection - Connection (with wsEndpoint for subscription)
 * @param {string} address - Solana wallet address
 * @param {Set<string>} processedSignatures - Mutated: new sigs added; trimmed to SOL_PROCESSED_CAP
 * @returns {Promise<{ newTransactions: Array }>}
 */
export async function checkRecentTransactionsForAddress(connection, address, processedSignatures) {
  const trimmed = (address || '').trim();
  if (!trimmed) return { newTransactions: [] };
  const newTransactions = [];
  try {
    const pubkey = new PublicKey(trimmed);
    const signatures = await connection.getSignaturesForAddress(
      pubkey,
      { limit: SOL_CHECK_RECENT_LIMIT },
      'confirmed'
    );

    if (processedSignatures.size === 0) {
      for (const sigInfo of signatures) {
        processedSignatures.add(sigInfo.signature);
      }
      return { newTransactions: [] };
    }

    const solPriceUsd = await getSolUsd();
    for (const sigInfo of signatures) {
      if (processedSignatures.has(sigInfo.signature)) continue;
      processedSignatures.add(sigInfo.signature);
      let norm = null;
      try {
        const parsed = await getParsedTransactionWithRetry(connection, sigInfo.signature);
        norm = parsed ? normalizeTx(sigInfo, parsed, trimmed, solPriceUsd) : null;
        if (!norm && sigInfo.signature) {
          const ageStr = sigInfo.blockTime ? toAgeStringIST(sigInfo.blockTime) : '';
          norm = {
            transactionHash: sigInfo.signature,
            walletType: 'Solana',
            txType: 'sol',
            token: 'SOL',
            method: 'Transfer',
            block: sigInfo.slot != null ? String(sigInfo.slot) : '',
            age: ageStr,
            from: '',
            to: '',
            inOut: '',
            amount: '',
            amountUsd: '',
            txnFee: '',
            status: sigInfo.err ? 'failed' : 'confirmed',
          };
        }
      } catch (_) {
        // skip failed parse
      }
      if (norm) newTransactions.push(norm);
      await delay(SOL_TX_DELAY_MS);
    }

    if (processedSignatures.size > SOL_PROCESSED_CAP) {
      const arr = Array.from(processedSignatures);
      processedSignatures.clear();
      arr.slice(-SOL_PROCESSED_CAP).forEach((s) => processedSignatures.add(s));
    }
  } catch (e) {
    console.warn('[Solana checkRecent]', trimmed.slice(0, 8) + '...', e?.message || e);
  }
  return { newTransactions };
}

export async function fetchAndParseSolWallet(address) {
  const trimmed = (address || '').trim();
  if (!trimmed) throw new Error('Solana address is required');

  const [balanceRes, solPriceUsd, signatures] = await Promise.all([
    fetchBalance(trimmed),
    getSolUsd(),
    fetchTransactionsPaginated(trimmed),
  ]);
  const { balance } = balanceRes;
  const balanceNum = parseFloat(balance) || 0;
  const valueUsd = solPriceUsd > 0 ? (balanceNum * solPriceUsd).toFixed(2) : '';
  const conn = getConnection();
  const transactions = [];
  for (const sigInfo of signatures) {
    try {
      const parsed = await getParsedTransactionWithRetry(conn, sigInfo.signature);
      let norm = parsed ? normalizeTx(sigInfo, parsed, trimmed, solPriceUsd) : null;
      if (!norm && sigInfo.signature) {
        const ageStr = sigInfo.blockTime ? toAgeStringIST(sigInfo.blockTime) : '';
        norm = {
          transactionHash: sigInfo.signature,
          walletType: 'Solana',
          txType: 'sol',
          token: 'SOL',
          method: 'Transfer',
          block: sigInfo.slot != null ? String(sigInfo.slot) : '',
          age: ageStr,
          from: '',
          to: '',
          inOut: '',
          amount: '',
          amountUsd: '',
          txnFee: '',
          status: sigInfo.err ? 'failed' : 'confirmed',
        };
      }
      if (norm) transactions.push(norm);
    } catch {
      // skip failed parse
    }
    await delay(SOL_TX_DELAY_MS);
  }

  return {
    solBalance: balance,
    solValue: valueUsd,
    transactions,
    tokenTransactions: [],
  };
}
