/**
 * Fetch USD prices for BTC, LTC, SOL, TRX (CoinGecko free API).
 * Cached 10 min to avoid 429 rate limits.
 */
import axios from 'axios';

const CACHE_MS = parseInt(process.env.PRICE_CACHE_MS, 10) || 600_000;
let cache = { prices: null, at: 0 };

const COINGECKO_IDS = {
  btc: 'bitcoin',
  ltc: 'litecoin',
  sol: 'solana',
  trx: 'tron',
};

export async function getPrices() {
  const now = Date.now();
  if (cache.prices && now - cache.at < CACHE_MS) {
    return cache.prices;
  }
  try {
    const ids = Object.values(COINGECKO_IDS).join(',');
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { timeout: 8000, validateStatus: (s) => s === 200 }
    );
    if (res.status !== 200 || !res.data) {
      return { btc: 0, ltc: 0, sol: 0, trx: 0 };
    }
    const d = res.data;
    cache.prices = {
      btc: Number(d[COINGECKO_IDS.btc]?.usd) || 0,
      ltc: Number(d[COINGECKO_IDS.ltc]?.usd) || 0,
      sol: Number(d[COINGECKO_IDS.sol]?.usd) || 0,
      trx: Number(d[COINGECKO_IDS.trx]?.usd) || 0,
    };
    cache.at = now;
    return cache.prices;
  } catch {
    return cache.prices || { btc: 0, ltc: 0, sol: 0, trx: 0 };
  }
}

export async function getBtcUsd() {
  const p = await getPrices();
  return p.btc;
}
export async function getLtcUsd() {
  const p = await getPrices();
  return p.ltc;
}
export async function getSolUsd() {
  const p = await getPrices();
  return p.sol;
}
export async function getTrxUsd() {
  const p = await getPrices();
  return p.trx;
}
