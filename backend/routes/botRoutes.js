import express from 'express';
import Bot from '../models/Bot.js';
import { addOrUpdateWallet, addOrUpdateWalletBNB, addOrUpdateWalletTron, addOrUpdateWalletBtc, addOrUpdateWalletLtc, addOrUpdateWalletSol } from '../services/walletService.js';
import { addBotToRunning, removeBotFromRunning } from '../services/runningBotsStore.js';
import { startSubscription as startSolanaSubscription, stopSubscription as stopSolanaSubscription } from '../services/solanaSubscriptionManager.js';

function wasBotRunning(bot) {
  return Boolean(bot?.isRunning);
}

const router = express.Router();

const CHAIN_KEYS = ['walletEthereum', 'walletSolana', 'walletBnb', 'walletBitcoin', 'walletLitecoin', 'walletTron'];

function normalizeEthereum(addr) {
  const s = String(addr || '').trim().toLowerCase();
  return s.startsWith('0x') && s.length >= 40 ? s : null;
}

function trimAddr(addr) {
  return String(addr || '').trim() || null;
}

function getEthereumAddress(bot) {
  const raw = bot.walletEthereum || bot.walletAddress || '';
  return normalizeEthereum(raw) || (raw ? raw.trim() : null);
}

function getBnbAddress(bot) {
  const raw = bot.walletBnb || '';
  return normalizeEthereum(raw) || (raw ? raw.trim() : null);
}

router.get('/', async (req, res) => {
  try {
    const bots = await Bot.find().sort({ updatedAt: -1 }).lean();
    res.json(bots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, discordWebhookUrl, ...wallets } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Bot name is required' });
    }
    const doc = {
      name: String(name).trim(),
      walletEthereum: trimAddr(wallets.walletEthereum) || '',
      walletSolana: trimAddr(wallets.walletSolana) || '',
      walletBnb: trimAddr(wallets.walletBnb) || '',
      walletBitcoin: trimAddr(wallets.walletBitcoin) || '',
      walletLitecoin: trimAddr(wallets.walletLitecoin) || '',
      walletTron: trimAddr(wallets.walletTron) || '',
      discordWebhookUrl: typeof discordWebhookUrl === 'string' ? discordWebhookUrl.trim() : '',
    };
    const bot = new Bot(doc);
    await bot.save();
    const ethAddr = getEthereumAddress(bot);
    if (ethAddr) await addOrUpdateWallet(ethAddr);
    const bnbAddr = getBnbAddress(bot);
    if (bnbAddr) await addOrUpdateWalletBNB(bnbAddr).catch(() => {});
    const tronAddr = trimAddr(bot.walletTron);
    if (tronAddr) await addOrUpdateWalletTron(tronAddr).catch(() => {});
    const btcAddr = trimAddr(bot.walletBitcoin);
    if (btcAddr) await addOrUpdateWalletBtc(btcAddr).catch(() => {});
    const ltcAddr = trimAddr(bot.walletLitecoin);
    if (ltcAddr) await addOrUpdateWalletLtc(ltcAddr).catch(() => {});
    const solAddr = trimAddr(bot.walletSolana);
    if (solAddr) await addOrUpdateWalletSol(solAddr).catch(() => {});
    res.status(201).json(bot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { name, discordWebhookUrl, ...wallets } = req.body || {};
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    const keepRunning = wasBotRunning(bot);
    const oldSolana = trimAddr(bot.walletSolana);
    if (name != null) bot.name = String(name).trim();
    if (discordWebhookUrl !== undefined) bot.discordWebhookUrl = typeof discordWebhookUrl === 'string' ? discordWebhookUrl.trim() : '';
    if (wallets.walletEthereum != null) bot.walletEthereum = trimAddr(wallets.walletEthereum) || '';
    if (wallets.walletSolana != null) bot.walletSolana = trimAddr(wallets.walletSolana) || '';
    if (wallets.walletBnb != null) bot.walletBnb = trimAddr(wallets.walletBnb) || '';
    if (wallets.walletBitcoin != null) bot.walletBitcoin = trimAddr(wallets.walletBitcoin) || '';
    if (wallets.walletLitecoin != null) bot.walletLitecoin = trimAddr(wallets.walletLitecoin) || '';
    if (wallets.walletTron != null) bot.walletTron = trimAddr(wallets.walletTron) || '';
    removeBotFromRunning(bot._id);
    if (oldSolana) stopSolanaSubscription(oldSolana);
    bot.isRunning = keepRunning;
    await bot.save();
    const ethAddr = getEthereumAddress(bot);
    if (ethAddr) await addOrUpdateWallet(ethAddr);
    const bnbAddr = getBnbAddress(bot);
    if (bnbAddr) await addOrUpdateWalletBNB(bnbAddr).catch(() => {});
    const tronAddr = trimAddr(bot.walletTron);
    if (tronAddr) await addOrUpdateWalletTron(tronAddr).catch(() => {});
    const btcAddr = trimAddr(bot.walletBitcoin);
    if (btcAddr) await addOrUpdateWalletBtc(btcAddr).catch(() => {});
    const ltcAddr = trimAddr(bot.walletLitecoin);
    if (ltcAddr) await addOrUpdateWalletLtc(ltcAddr).catch(() => {});
    const solAddr = trimAddr(bot.walletSolana);
    if (solAddr) await addOrUpdateWalletSol(solAddr).catch(() => {});
    if (keepRunning) {
      addBotToRunning(bot.toObject ? bot.toObject() : bot);
      if (solAddr) startSolanaSubscription(solAddr);
    }
    res.json(await Bot.findById(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    removeBotFromRunning(bot._id);
    const solAddr = trimAddr(bot.walletSolana);
    if (solAddr) stopSolanaSubscription(solAddr);
    await Bot.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/run', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id).lean();
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    addBotToRunning(bot);
    const solAddr = trimAddr(bot.walletSolana);
    if (solAddr) startSolanaSubscription(solAddr);
    await Bot.findByIdAndUpdate(req.params.id, { isRunning: true });
    res.json(await Bot.findById(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/stop', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    removeBotFromRunning(bot._id);
    bot.isRunning = false;
    await bot.save();
    res.json(bot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
export { getEthereumAddress };
