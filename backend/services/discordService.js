import axios from 'axios';

/**
 * Discord alert: use refer/*.js embed format per chain. Webhook URL from DB (caller passes bot.discordWebhookUrl).
 */

const IN_ICON = '📥';
const OUT_ICON = '📤';

/** IST time string like refer (en-IN, Asia/Kolkata). */
function formatTimeIST(ageStrOrTs) {
  let d = new Date();
  if (ageStrOrTs != null && typeof ageStrOrTs === 'number') {
    d = new Date(ageStrOrTs * 1000);
  } else if (typeof ageStrOrTs === 'string') {
    const trimmed = ageStrOrTs.trim().replace(/\s+(\d{1,2}):(\d{2}):(\d{2})$/, 'T$1:$2:$3Z');
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }) + ' (IST)';
}

/** Exact amount string for Discord (e.g. 0.00000500199999999007). */
function exactAmount(tx) {
  const s = tx.amount != null ? String(tx.amount).trim() : '';
  return s !== '' ? s : String(parseFloat(tx.amount) || 0);
}

// --- Bitcoin (refer/btc.js) ---
function buildEmbedBitcoin(tx) {
  const isIn = (tx.inOut || '').toUpperCase() === 'IN';
  const isOut = (tx.inOut || '').toUpperCase() === 'OUT';
  const typeEmoji = isIn ? IN_ICON : isOut ? OUT_ICON : '↔️';
  const typeText = isIn ? 'Incoming' : isOut ? 'Outgoing' : 'Transfer';
  const amountStr = exactAmount(tx);
  const usdValue = (tx.amountUsd && tx.amountUsd.trim()) ? `$${tx.amountUsd.trim()}` : '—';
  const timeStr = formatTimeIST(tx.age);
  const status = (tx.status || 'confirmed').toLowerCase();
  const blockHeight = (tx.block && String(tx.block).trim()) || '—';
  const network = (process.env.BTC_NETWORK || 'testnet').toLowerCase();
  const explorerUrl = network === 'mainnet'
    ? `https://blockstream.info/tx/${tx.transactionHash || ''}`
    : network === 'testnet4'
      ? `https://mempool.space/testnet4/tx/${tx.transactionHash || ''}`
      : `https://blockstream.info/testnet/tx/${tx.transactionHash || ''}`;
  const networkLabel = network === 'mainnet' ? 'Mainnet' : network === 'testnet4' ? 'Testnet4' : 'Testnet3';

  const color = status === 'pending' ? 0x3498db : (isIn ? 0x2ecc71 : 0xe74c3c);
  let description = '';
  if (status === 'pending') {
    description = `⚠️ **BTC Transaction Alert**\n\n`;
    description += `${typeEmoji} **Type:** ${typeText}\n`;
    description += `🪙 **Asset:** Bitcoin (BTC)\n`;
    description += `🔢 **Amount:** ${amountStr} BTC\n`;
    description += `💵 **USD Value:** ${usdValue}\n`;
    description += `🕐 **Time:** ${timeStr}\n`;
    description += `⏳ **Status:** Pending (Unconfirmed)\n\n`;
    description += `👉 **Action:** Wait for confirmations\n\n`;
    description += `🔗 **Transaction:** [View on Blockstream](${explorerUrl})`;
  } else {
    const title = isIn ? `✅ **New BTC transaction of ${usdValue} received:**` : `📤 **BTC transaction of ${usdValue} sent:**`;
    description = `${title}\n\n`;
    description += `💰 **${amountStr} BTC** (${usdValue})\n`;
    description += `⚡ **Status:** Confirmed\n`;
    description += `🕐 **Time:** ${timeStr}\n`;
    description += `🔗 **Network:** Bitcoin (${networkLabel})\n`;
    description += `${typeEmoji} **Type:** ${typeText}\n`;
    description += `📦 **Block Height:** ${blockHeight}\n\n`;
    description += `🔗 **Transaction:** [View on Blockstream](${explorerUrl})`;
  }
  return { description, color, timestamp: new Date().toISOString() };
}

// --- Litecoin (refer/ltc.js) ---
function buildEmbedLitecoin(tx) {
  const isIn = (tx.inOut || '').toUpperCase() === 'IN';
  const isOut = (tx.inOut || '').toUpperCase() === 'OUT';
  const typeEmoji = isIn ? IN_ICON : isOut ? OUT_ICON : '↔️';
  const typeText = isIn ? 'Incoming' : isOut ? 'Outgoing' : 'Transfer';
  const amountStr = exactAmount(tx);
  const usdValue = (tx.amountUsd && tx.amountUsd.trim()) ? `$${tx.amountUsd.trim()}` : '—';
  const timeStr = formatTimeIST(tx.age);
  const status = (tx.status || 'confirmed').toLowerCase();
  const blockHeight = (tx.block && String(tx.block).trim()) || '—';
  const network = (process.env.LTC_NETWORK || 'testnet').toLowerCase();
  const explorerUrl = network === 'mainnet'
    ? `https://litecoinspace.org/tx/${tx.transactionHash || ''}`
    : `https://litecoinspace.org/testnet/tx/${tx.transactionHash || ''}`;
  const networkLabel = network === 'mainnet' ? 'Mainnet' : 'Testnet';

  const color = status === 'pending' ? 0x3498db : (isIn ? 0x2ecc71 : 0xe74c3c);
  let description = '';
  if (status === 'pending') {
    description = `⚠️ **LTC Transaction Alert**\n\n`;
    description += `${typeEmoji} **Type:** ${typeText}\n`;
    description += `🪙 **Asset:** Litecoin (LTC)\n`;
    description += `🔢 **Amount:** ${amountStr} LTC\n`;
    description += `💵 **USD Value:** ${usdValue}\n`;
    description += `🕐 **Time:** ${timeStr}\n`;
    description += `⏳ **Status:** Pending (Unconfirmed)\n\n`;
    description += `👉 **Action:** Wait for confirmations\n\n`;
    description += `🔗 **Transaction:** [View on Litecoin Explorer](${explorerUrl})`;
  } else {
    const title = isIn ? `✅ **New LTC transaction of ${usdValue} received:**` : `📤 **LTC transaction of ${usdValue} sent:**`;
    description = `${title}\n\n`;
    description += `💰 **${amountStr} LTC** (${usdValue})\n`;
    description += `⚡ **Status:** Confirmed\n`;
    description += `🕐 **Time:** ${timeStr}\n`;
    description += `🔗 **Network:** Litecoin (${networkLabel})\n`;
    description += `${typeEmoji} **Type:** ${typeText}\n`;
    description += `📦 **Block Height:** ${blockHeight}\n\n`;
    description += `🔗 **Transaction:** [View on Litecoin Explorer](${explorerUrl})`;
  }
  return { description, color, timestamp: new Date().toISOString() };
}

// --- Solana (refer/sol.js) ---
function buildEmbedSolana(tx) {
  const isIn = (tx.inOut || '').toUpperCase() === 'IN';
  const isOut = (tx.inOut || '').toUpperCase() === 'OUT';
  const typeEmoji = isIn ? IN_ICON : isOut ? OUT_ICON : '↔️';
  const typeText = isIn ? 'Incoming' : isOut ? 'Outgoing' : 'Transfer';
  const amountStr = exactAmount(tx);
  const usdValue = (tx.amountUsd && tx.amountUsd.trim()) ? `$${tx.amountUsd.trim()}` : '—';
  const timeStr = formatTimeIST(tx.age);
  const status = (tx.status || 'confirmed').toLowerCase();
  const slot = (tx.block && String(tx.block).trim()) || '—';
  const otherParty = isIn ? (tx.from || '') : (tx.to || '');
  const otherStr = otherParty.length > 16 ? `${otherParty.slice(0, 8)}...${otherParty.slice(-8)}` : otherParty;
  const rpc = (process.env.SOL_RPC_URL || '').toLowerCase();
  const network = rpc.includes('devnet') ? 'Devnet' : rpc.includes('testnet') ? 'Testnet' : 'Mainnet';
  const explorerUrl = network === 'Devnet'
    ? `https://explorer.solana.com/tx/${tx.transactionHash || ''}?cluster=devnet`
    : network === 'Testnet'
      ? `https://explorer.solana.com/tx/${tx.transactionHash || ''}?cluster=testnet`
      : `https://explorer.solana.com/tx/${tx.transactionHash || ''}`;

  const color = status === 'failed' ? 0x95a5a6 : (isIn ? 0x2ecc71 : 0xe74c3c);
  let description = '';
  if (status === 'failed') {
    description = `❌ **SOL Transaction Failed**\n\n`;
    description += `${typeEmoji} **Type:** ${typeText}\n`;
    description += `🪙 **Asset:** Solana (SOL)\n`;
    description += `🔢 **Amount:** ${amountStr} SOL\n`;
    description += `💵 **USD Value:** ${usdValue}\n`;
    description += `🕐 **Time:** ${timeStr}\n`;
    description += `❌ **Status:** Failed\n\n`;
    description += `🔗 **Transaction:** [View on Solana Explorer](${explorerUrl})`;
  } else {
    const title = isIn ? `✅ **New SOL transaction of ${usdValue} received:**` : `📤 **SOL transaction of ${usdValue} sent:**`;
    description = `${title}\n\n`;
    description += `💰 **${amountStr} SOL** (${usdValue})\n`;
    description += `⚡ **Status:** Confirmed\n`;
    description += `🕐 **Time:** ${timeStr}\n`;
    description += `🔗 **Network:** Solana (${network})\n`;
    description += `${typeEmoji} **Type:** ${typeText}\n`;
    description += `📦 **Slot:** ${slot}\n`;
    description += `👤 **${isIn ? 'From' : 'To'}:** \`${otherStr || '—'}\`\n\n`;
    description += `🔗 **Transaction:** [View on Solana Explorer](${explorerUrl})`;
  }
  return { description, color, timestamp: new Date().toISOString() };
}

// --- Tron (refer/tron.js) ---
function buildEmbedTron(tx) {
  const isIn = (tx.inOut || '').toUpperCase() === 'IN';
  const isOut = (tx.inOut || '').toUpperCase() === 'OUT';
  const typeEmoji = isIn ? IN_ICON : isOut ? OUT_ICON : '↔️';
  const typeText = isIn ? 'Incoming' : isOut ? 'Outgoing' : 'Transfer';
  const amountStr = exactAmount(tx);
  const assetType = (tx.token && tx.token !== 'TRX') ? 'TRC-20' : 'TRX';
  const assetName = tx.token && tx.token.trim() ? tx.token.trim() : 'TRX';
  const usdValue = (tx.amountUsd && tx.amountUsd.trim()) ? `$${tx.amountUsd.trim()}` : (assetType === 'TRC-20' ? 'N/A' : '—');
  const timeStr = formatTimeIST(tx.age);
  const status = (tx.status || 'confirmed').toLowerCase();
  const otherParty = isIn ? (tx.from || '') : (tx.to || '');
  const otherStr = otherParty.length > 14 ? `${otherParty.slice(0, 7)}...${otherParty.slice(-7)}` : otherParty;
  const rpc = (process.env.TRON_RPC_URL || '').toLowerCase();
  const network = rpc.includes('shasta') ? 'Shasta Testnet' : rpc.includes('nile') ? 'Nile Testnet' : 'Mainnet';
  const explorerUrl = network.includes('Shasta')
    ? `https://shasta.tronscan.org/#/transaction/${tx.transactionHash || ''}`
    : network.includes('Nile')
      ? `https://nile.tronscan.org/#/transaction/${tx.transactionHash || ''}`
      : `https://tronscan.org/#/transaction/${tx.transactionHash || ''}`;

  const color = status === 'failed' ? 0x95a5a6 : (isIn ? 0x2ecc71 : 0xe74c3c);
  let description = '';
  if (status === 'failed') {
    description = `❌ **TRX Transaction Failed**\n\n`;
    description += `${typeEmoji} **Type:** ${typeText}\n`;
    description += `🪙 **Asset:** Tron (TRX)\n`;
    description += `🔢 **Amount:** ${amountStr} TRX\n`;
    description += `💵 **USD Value:** ${usdValue}\n`;
    description += `🕐 **Time:** ${timeStr}\n`;
    description += `❌ **Status:** Failed\n\n`;
    description += `🔗 **Transaction:** [View on TronScan](${explorerUrl})`;
  } else {
    const title = isIn ? `✅ **New TRX transaction of ${usdValue} received:**` : `📤 **TRX transaction of ${usdValue} sent:**`;
    description = `${title}\n\n`;
    description += `💰 **${amountStr} ${assetName}** (${usdValue})\n`;
    description += `⚡ **Status:** Confirmed\n`;
    description += `🕐 **Time:** ${timeStr}\n`;
    description += `🔗 **Network:** Tron (${network})\n`;
    description += `${typeEmoji} **Type:** ${typeText}\n`;
    description += `👤 **${isIn ? 'From' : 'To'}:** \`${otherStr || '—'}\`\n\n`;
    description += `🔗 **Transaction:** [View on TronScan](${explorerUrl})`;
  }
  return { description, color, timestamp: new Date().toISOString() };
}

// --- Ethereum / BNB (current unified format; no refer script) ---
function buildEmbedEthereumOrBnb(tx) {
  const walletType = (tx.walletType || 'Ethereum').trim();
  const isBnb = walletType === 'BNB';
  const chainLabel = isBnb ? 'BNB' : 'ETH';
  const chainName = isBnb ? 'BNB' : 'Ethereum';
  const chainIcon = isBnb ? '🟡' : '💎';
  const explorerBase = isBnb ? 'https://bscscan.com/tx' : 'https://etherscan.io/tx';
  const txUrl = `${explorerBase}/${tx.transactionHash || ''}`;
  const explorerName = isBnb ? 'BscScan' : 'Etherscan';
  const isIn = (tx.inOut || '').toUpperCase() === 'IN';
  const isOut = (tx.inOut || '').toUpperCase() === 'OUT';
  const flowIcon = isIn ? IN_ICON : isOut ? OUT_ICON : '↔️';
  const typeText = isIn ? 'Incoming' : isOut ? 'Outgoing' : 'Transfer';
  const amountVal = tx.amount || '—';
  const usdVal = tx.amountUsd || '—';
  const timeVal = tx.age ? formatTimeIST(tx.age) : '—';
  const blockVal = (tx.block && String(tx.block).trim()) || '—';
  const title = `${chainIcon} ${chainName} · ${flowIcon} ${typeText}`;
  const description = [
    `${flowIcon} Type: ${typeText}`,
    `🏛️ Asset: ${chainIcon} ${chainName} (${chainLabel})`,
    `🔢 Amount: ${amountVal}`,
    `💲 USD Value: ${usdVal}`,
    `🕒 Time: ${timeVal}`,
    `📦 Block: ${blockVal}`,
    `✅ Status: Confirmed`,
    `🔗 Transaction: [View on ${explorerName}](${txUrl})`,
  ].join('\n');
  const color = isBnb ? 0xF0B90B : 0x627EEA;
  return { title, description, color, footer: { text: `${chainIcon} ${chainLabel} Transaction Monitor` }, timestamp: new Date().toISOString() };
}

function buildTransactionEmbed(tx) {
  const walletType = (tx.walletType || 'Ethereum').trim();
  switch (walletType) {
    case 'Bitcoin':
      return buildEmbedBitcoin(tx);
    case 'Litecoin':
      return buildEmbedLitecoin(tx);
    case 'Solana':
      return buildEmbedSolana(tx);
    case 'Tron':
      return buildEmbedTron(tx);
    case 'BNB':
    case 'Ethereum':
    default:
      return buildEmbedEthereumOrBnb(tx);
  }
}

const DISCORD_EMBEDS_PER_MESSAGE = 10;

/**
 * Send multiple transaction alerts in batch (up to 10 embeds per Discord message).
 */
export async function sendTransactionAlertsBatch(webhookUrl, txList) {
  if (!webhookUrl || typeof webhookUrl !== 'string' || !txList || txList.length === 0) return;
  const url = webhookUrl.trim();
  if (!url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) return;

  for (let i = 0; i < txList.length; i += DISCORD_EMBEDS_PER_MESSAGE) {
    const chunk = txList.slice(i, i + DISCORD_EMBEDS_PER_MESSAGE);
    const embeds = chunk.map((tx) => buildTransactionEmbed(tx));
    const body = { embeds };

    const res = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Discord webhook ${res.status}: ${String(res.data || res.statusText).slice(0, 200)}`);
    }
  }
}

/**
 * Send one transaction alert to a Discord webhook URL (webhook URL from DB – caller passes bot.discordWebhookUrl).
 */
export async function sendTransactionAlert(webhookUrl, tx) {
  if (!webhookUrl || typeof webhookUrl !== 'string') return;
  const url = webhookUrl.trim();
  if (!url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) return;

  const embed = buildTransactionEmbed(tx);
  const body = { embeds: [embed] };

  const res = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Discord webhook ${res.status}: ${String(res.data || res.statusText).slice(0, 200)}`);
  }
}
