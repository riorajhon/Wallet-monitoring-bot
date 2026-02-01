/**
 * Same workflow as refer/sol.js: WebSocket onAccountChange → checkRecentTransactions.
 * Only differences: address and Discord URL from DB (bot); we save to DB and notify via walletService.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { checkRecentTransactionsForAddress } from './solService.js';
import { saveTransactions, notifyDiscordNewTransactions } from './walletService.js';

const refcountByAddress = new Map();
const stateByAddress = new Map();
const debounceByAddress = new Map();
let sharedConnection = null;

function getRpcUrl() {
  return (process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com').replace(/\/$/, '');
}

function getConnection() {
  if (sharedConnection) return sharedConnection;
  const rpcUrl = getRpcUrl();
  const wsUrl = rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
  sharedConnection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    wsEndpoint: wsUrl,
  });
  return sharedConnection;
}

async function onActivity(address) {
  const trimmed = (address || '').trim();
  if (!trimmed) return;
  const state = stateByAddress.get(trimmed);
  if (!state) return;
  const existing = debounceByAddress.get(trimmed);
  if (existing) clearTimeout(existing);
  const timeoutId = setTimeout(async () => {
    debounceByAddress.delete(trimmed);
    try {
      const conn = getConnection();
      const { newTransactions } = await checkRecentTransactionsForAddress(
        conn,
        trimmed,
        state.processedSignatures
      );
      if (newTransactions.length > 0) {
        await saveTransactions(newTransactions, trimmed, 'Solana');
        await notifyDiscordNewTransactions(trimmed, 'Solana', newTransactions);
      }
    } catch (e) {
      console.warn('[Solana subscription]', trimmed.slice(0, 8) + '...', e.message);
    }
  }, 500);
  debounceByAddress.set(trimmed, timeoutId);
}

/**
 * Start monitoring (same as refer/sol.js start). Refcounted for multiple bots per address.
 */
export function startSubscription(address) {
  const trimmed = (address || '').trim();
  if (!trimmed || trimmed.length < 32) return;
  const count = (refcountByAddress.get(trimmed) || 0) + 1;
  refcountByAddress.set(trimmed, count);
  if (count > 1) return;
  try {
    const conn = getConnection();
    const pubkey = new PublicKey(trimmed);
    const state = { processedSignatures: new Set(), subscriptionId: null };
    const subId = conn.onAccountChange(
      pubkey,
      () => onActivity(trimmed),
      'confirmed'
    );
    state.subscriptionId = subId;
    stateByAddress.set(trimmed, state);
    (async () => {
      try {
        const { newTransactions } = await checkRecentTransactionsForAddress(
          conn,
          trimmed,
          state.processedSignatures
        );
        if (newTransactions.length > 0) {
          await saveTransactions(newTransactions, trimmed, 'Solana');
          await notifyDiscordNewTransactions(trimmed, 'Solana', newTransactions);
        }
      } catch (e) {
        console.warn('[Solana subscription initial]', trimmed.slice(0, 8) + '...', e.message);
      }
    })();
  } catch (e) {
    refcountByAddress.set(trimmed, Math.max(0, (refcountByAddress.get(trimmed) || 1) - 1));
    if (refcountByAddress.get(trimmed) === 0) refcountByAddress.delete(trimmed);
    console.warn('[Solana subscription start]', trimmed.slice(0, 8) + '...', e.message);
  }
}

/**
 * Stop monitoring (same as refer/sol.js stop).
 */
export function stopSubscription(address) {
  const trimmed = (address || '').trim();
  if (!trimmed) return;
  const count = Math.max(0, (refcountByAddress.get(trimmed) || 1) - 1);
  if (count === 0) {
    refcountByAddress.delete(trimmed);
    const timeoutId = debounceByAddress.get(trimmed);
    if (timeoutId) {
      clearTimeout(timeoutId);
      debounceByAddress.delete(trimmed);
    }
    const state = stateByAddress.get(trimmed);
    if (state?.subscriptionId != null) {
      try {
        getConnection().removeAccountChangeListener(state.subscriptionId);
      } catch (_) {}
      stateByAddress.delete(trimmed);
    }
  } else {
    refcountByAddress.set(trimmed, count);
  }
}

/** For fallback poll (optional). */
export function getSubscribedSolAddresses() {
  return Array.from(stateByAddress.keys());
}
