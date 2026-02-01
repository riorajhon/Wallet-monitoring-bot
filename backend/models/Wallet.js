import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true },
  ethBalance: { type: String, default: '' },
  ethValue: { type: String, default: '' },
  bnbBalance: { type: String, default: '' },
  bnbValue: { type: String, default: '' },
  tronBalance: { type: String, default: '' },
  tronValue: { type: String, default: '' },
  btcBalance: { type: String, default: '' },
  btcValue: { type: String, default: '' },
  ltcBalance: { type: String, default: '' },
  ltcValue: { type: String, default: '' },
  solBalance: { type: String, default: '' },
  solValue: { type: String, default: '' },
  lastFetched: { type: Date, default: null },
  // Gap handling: last seen block timestamp/slot per chain (so we fetch txs *after* this on next run)
  tronLastBlockTs: { type: Number, default: null },
  btcLastBlockTs: { type: Number, default: null },
  ltcLastBlockTs: { type: Number, default: null },
  solLastSlot: { type: Number, default: null },
}, { timestamps: true });

export default mongoose.model('Wallet', walletSchema);
