import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  transactionHash: { type: String, required: true },
  walletAddress: { type: String, required: true },
  walletType: { type: String, default: 'Ethereum' }, // Ethereum, Solana, BNB, Bitcoin, Litecoin, Tron
  txType: { type: String, default: 'eth' },
  token: { type: String, default: '' },
  method: { type: String, default: '' },
  block: { type: String, default: '' },
  age: { type: String, default: '' },
  from: { type: String, default: '' },
  to: { type: String, default: '' },
  inOut: { type: String, default: '' },
  amount: { type: String, default: '' },
  amountUsd: { type: String, default: '' },
  txnFee: { type: String, default: '' },
}, { timestamps: true });

// Different token = different transaction (same tx hash can have multiple token transfers)
transactionSchema.index({ transactionHash: 1, walletAddress: 1, token: 1 }, { unique: true });

export default mongoose.model('Transaction', transactionSchema);
