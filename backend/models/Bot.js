import mongoose from 'mongoose';

const botSchema = new mongoose.Schema({
  name: { type: String, required: true },
  isRunning: { type: Boolean, default: false },
  // 6 wallet addresses by type (only Ethereum supported for fetch/refresh for now)
  walletEthereum: { type: String, trim: true, default: '' },
  walletSolana: { type: String, trim: true, default: '' },
  walletBnb: { type: String, trim: true, default: '' },
  walletBitcoin: { type: String, trim: true, default: '' },
  walletLitecoin: { type: String, trim: true, default: '' },
  walletTron: { type: String, trim: true, default: '' },
  // legacy: single wallet (treated as Ethereum)
  walletAddress: { type: String, trim: true, default: '' },
  discordWebhookUrl: { type: String, trim: true, default: '' },
}, { timestamps: true });

export default mongoose.model('Bot', botSchema);
