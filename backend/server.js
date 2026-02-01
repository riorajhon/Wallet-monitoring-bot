import './file-global.js';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { connectDB } from './config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import walletRoutes from './routes/walletRoutes.js';
import authRoutes from './routes/authRoutes.js';
import botRoutes from './routes/botRoutes.js';
import { refreshAllWallets, refreshWallet } from './services/walletService.js';
import { getRunningConfigs } from './services/runningBotsStore.js';
import Transaction from './models/Transaction.js';

await connectDB();

// Ensure (transactionHash, walletAddress, token) is the only unique index so "no token" and "has token" are different
const ensureTransactionIndex = async () => {
  const coll = Transaction.collection;
  const indexes = await coll.indexes();
  for (const idx of indexes) {
    if (idx.unique && idx.key && !idx.key.token) {
      const keys = Object.keys(idx.key || {}).sort().join(',');
      if (keys === 'transactionHash,walletAddress') {
        try {
          await coll.dropIndex(idx.name);
          console.log('Dropped legacy 2-field unique index:', idx.name);
        } catch (e) {
          if (e.code !== 27 && e.codeName !== 'IndexNotFound') console.warn('Index drop:', e.message);
        }
      }
    }
  }
  await Transaction.syncIndexes();
};
ensureTransactionIndex().catch((e) => console.warn('ensureTransactionIndex:', e.message));

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/wallets', walletRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bots', botRoutes);

app.get('/health', (_, res) => res.json({ ok: true }));

// Serve built frontend (after: cd frontend && npm run build, then cd backend && npm start)
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_, res) => res.sendFile(path.join(frontendDist, 'index.html')));
} else {
  app.get('/', (_, res) => res.send('Frontend not built. Run: cd frontend && npm run build'));
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Per-chain refresh intervals (ms)
const ETH_REFRESH_INTERVAL_MS = parseInt(process.env.ETH_REFRESH_INTERVAL_MS, 10) || 6_000;
const BNB_REFRESH_INTERVAL_MS = parseInt(process.env.BNB_REFRESH_INTERVAL_MS, 10) || 2_000;
const TRON_REFRESH_INTERVAL_MS = parseInt(process.env.TRON_REFRESH_INTERVAL_MS, 10) || 2_000;
const BTC_REFRESH_INTERVAL_MS = parseInt(process.env.BTC_REFRESH_INTERVAL_MS, 10) || 20_000;
const LTC_REFRESH_INTERVAL_MS = parseInt(process.env.LTC_REFRESH_INTERVAL_MS, 10) || 10_000;
const CHAIN_DELAY_MS = parseInt(process.env.CHAIN_DELAY_MS, 10) || 400;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function getBotEthereumAddress(bot) {
  const raw = bot.walletEthereum || bot.walletAddress || '';
  return raw && String(raw).trim() ? String(raw).trim() : null;
}
function getBotBnbAddress(bot) {
  const raw = bot.walletBnb || '';
  return raw && String(raw).trim() && raw.startsWith('0x') ? String(raw).trim() : null;
}
function getBotTronAddress(bot) {
  const raw = (bot.walletTron || '').trim();
  return raw && raw.length >= 34 ? raw : null;
}
function getBotBtcAddress(bot) {
  const raw = (bot.walletBitcoin || '').trim();
  return raw && raw.length >= 25 ? raw : null;
}
function getBotLtcAddress(bot) {
  const raw = (bot.walletLitecoin || '').trim();
  return raw && raw.length >= 25 ? raw : null;
}
function getBotSolAddress(bot) {
  const raw = (bot.walletSolana || '').trim();
  return raw && raw.length >= 32 ? raw : null;
}
// ETH only
setInterval(async () => {
  try {
    const running = getRunningConfigs();
    if (running.length === 0) return;
    for (const b of running) {
      const ethAddr = getBotEthereumAddress(b);
      if (ethAddr) {
        try {
          await refreshWallet(ethAddr, 'ETH');
        } catch (e) {
          console.warn('[Bot refresh ETH]', ethAddr, e.message);
        }
        await delay(CHAIN_DELAY_MS);
      }
    }
  } catch (e) {
    console.warn('[Bot refresh ETH loop]', e.message);
  }
}, ETH_REFRESH_INTERVAL_MS);
console.log(`Bot monitor: ETH every ${ETH_REFRESH_INTERVAL_MS / 1000}s`);

// BNB only
setInterval(async () => {
  try {
    const running = getRunningConfigs();
    if (running.length === 0) return;
    for (const b of running) {
      const bnbAddr = getBotBnbAddress(b);
      if (bnbAddr) {
        try {
          await refreshWallet(bnbAddr, 'BNB');
        } catch (e) {
          console.warn('[Bot refresh BNB]', bnbAddr, e.message);
        }
        await delay(CHAIN_DELAY_MS);
      }
    }
  } catch (e) {
    console.warn('[Bot refresh BNB loop]', e.message);
  }
}, BNB_REFRESH_INTERVAL_MS);
console.log(`Bot monitor: BNB every ${BNB_REFRESH_INTERVAL_MS / 1000}s`);

// Tron only: every 2s (like refer/tron.js)
setInterval(async () => {
  try {
    const running = getRunningConfigs();
    if (running.length === 0) return;
    for (const b of running) {
      const tronAddr = getBotTronAddress(b);
      if (tronAddr) {
        try {
          await refreshWallet(tronAddr, 'TRON');
        } catch (e) {
          console.warn('[Bot refresh TRON]', tronAddr.slice(0, 10) + '...', e.message);
        }
        await delay(CHAIN_DELAY_MS);
      }
    }
  } catch (e) {
    console.warn('[Bot refresh TRON loop]', e.message);
  }
}, TRON_REFRESH_INTERVAL_MS);
console.log(`Bot monitor: TRON every ${TRON_REFRESH_INTERVAL_MS / 1000}s`);

// BTC only
setInterval(async () => {
  try {
    const running = getRunningConfigs();
    if (running.length === 0) return;
    for (const b of running) {
      const btcAddr = getBotBtcAddress(b);
      if (btcAddr) {
        try {
          await refreshWallet(btcAddr, 'BTC');
        } catch (e) {
          console.warn('[Bot refresh BTC]', btcAddr.slice(0, 10) + '...', e.message);
        }
        await delay(CHAIN_DELAY_MS);
      }
    }
  } catch (e) {
    console.warn('[Bot refresh BTC loop]', e.message);
  }
}, BTC_REFRESH_INTERVAL_MS);
console.log(`Bot monitor: BTC every ${BTC_REFRESH_INTERVAL_MS / 1000}s`);

// LTC only
setInterval(async () => {
  try {
    const running = getRunningConfigs();
    if (running.length === 0) return;
    for (const b of running) {
      const ltcAddr = getBotLtcAddress(b);
      if (ltcAddr) {
        try {
          await refreshWallet(ltcAddr, 'LTC');
        } catch (e) {
          console.warn('[Bot refresh LTC]', ltcAddr.slice(0, 10) + '...', e.message);
        }
        await delay(CHAIN_DELAY_MS);
      }
    }
  } catch (e) {
    console.warn('[Bot refresh LTC loop]', e.message);
  }
}, LTC_REFRESH_INTERVAL_MS);
console.log(`Bot monitor: LTC only every ${LTC_REFRESH_INTERVAL_MS / 1000}s`);

// Re-fetch all wallets at interval from .env (minutes)
const intervalMinutes = parseInt(process.env.FETCH_INTERVAL_MINUTES, 10) || 30;
if (intervalMinutes > 0) {
  const cronExpr = `*/${intervalMinutes} * * * *`;
  cron.schedule(cronExpr, async () => {
    console.log(`[Cron] Refreshing all wallets (every ${intervalMinutes} min)`);
    try {
      const results = await refreshAllWallets();
      console.log('[Cron] Refresh done:', results.length, 'wallets');
    } catch (e) {
      console.error('[Cron] Refresh error:', e.message);
    }
  });
  console.log(`Scheduler: refresh every ${intervalMinutes} minutes`);
}
