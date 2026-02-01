/**
 * In-memory store for running bots. Data is loaded from DB only when user clicks RUN.
 * Used for: refresh loop (get transactions) and Discord alerts (webhook URL).
 * Edit bot → stop bot and remove from RAM. RUN → load from DB into RAM.
 */

const runningByBotId = new Map();
const webhookByWalletKey = new Map();

function walletKey(walletType, address) {
  if (!address) return null;
  const a = String(address).trim();
  if (walletType === 'Ethereum' || walletType === 'BNB') return `${walletType}:${a.toLowerCase()}`;
  return `${walletType}:${a}`;
}

function clearWebhooksForBot(config) {
  const types = [
    { type: 'Ethereum', addr: config.walletEthereum || config.walletAddress },
    { type: 'BNB', addr: config.walletBnb },
    { type: 'Tron', addr: config.walletTron },
    { type: 'Bitcoin', addr: config.walletBitcoin },
    { type: 'Litecoin', addr: config.walletLitecoin },
    { type: 'Solana', addr: config.walletSolana },
  ];
  for (const { type, addr } of types) {
    if (!addr) continue;
    const key = walletKey(type, addr);
    if (key) webhookByWalletKey.delete(key);
  }
}

/**
 * Add bot to running set. Call when user clicks RUN. Bot should be from DB (lean).
 */
export function addBotToRunning(bot) {
  const id = bot._id?.toString();
  if (!id) return;
  const config = {
    _id: bot._id,
    walletEthereum: (bot.walletEthereum || '').trim() || (bot.walletAddress || '').trim(),
    walletAddress: (bot.walletAddress || '').trim(),
    walletBnb: (bot.walletBnb || '').trim(),
    walletTron: (bot.walletTron || '').trim(),
    walletBitcoin: (bot.walletBitcoin || '').trim(),
    walletLitecoin: (bot.walletLitecoin || '').trim(),
    walletSolana: (bot.walletSolana || '').trim(),
    discordWebhookUrl: (bot.discordWebhookUrl || '').trim(),
  };
  removeBotFromRunning(id);
  runningByBotId.set(id, config);
  const webhook = config.discordWebhookUrl;
  if (webhook) {
    if (config.walletEthereum) webhookByWalletKey.set(walletKey('Ethereum', config.walletEthereum), webhook);
    if (config.walletBnb) webhookByWalletKey.set(walletKey('BNB', config.walletBnb), webhook);
    if (config.walletTron) webhookByWalletKey.set(walletKey('Tron', config.walletTron), webhook);
    if (config.walletBitcoin) webhookByWalletKey.set(walletKey('Bitcoin', config.walletBitcoin), webhook);
    if (config.walletLitecoin) webhookByWalletKey.set(walletKey('Litecoin', config.walletLitecoin), webhook);
    if (config.walletSolana) webhookByWalletKey.set(walletKey('Solana', config.walletSolana), webhook);
  }
}

/**
 * Remove bot from running set. Call on STOP or EDIT or DELETE.
 */
export function removeBotFromRunning(botId) {
  const id = botId?.toString();
  if (!id) return;
  const config = runningByBotId.get(id);
  if (config) {
    clearWebhooksForBot(config);
    runningByBotId.delete(id);
  }
}

/**
 * Get all running bot configs for the refresh loop (no DB read).
 */
export function getRunningConfigs() {
  return Array.from(runningByBotId.values());
}

/**
 * Get Discord webhook URL for a wallet (from RAM). Used when sending alerts.
 */
export function getWebhookForWallet(walletType, normalizedAddress) {
  if (!normalizedAddress) return null;
  const key = walletKey(walletType, normalizedAddress);
  return key ? webhookByWalletKey.get(key) || null : null;
}
