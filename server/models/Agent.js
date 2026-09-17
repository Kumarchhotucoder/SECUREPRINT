const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true
  },
  agentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  computerName: {
    type: String,
    trim: true,
    default: 'Counter Computer'
  },
  os: {
    type: String,
    default: 'WINDOWS'
  },
  osVersion: {
    type: String,
    trim: true
  },
  deviceIdentifier: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['ONLINE', 'OFFLINE', 'CONNECTING', 'UNPAIRED'],
    default: 'OFFLINE',
    index: true
  },
  authTokenHash: {
    type: String,
    select: false
  },
  pairingCode: {
    type: String,
    select: false,
    index: true
  },
  pairingExpiresAt: {
    type: Date,
    select: false
  },
  pairingAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  },
  appVersion: {
    type: String,
    default: '1.0.0'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

agentSchema.virtual('tenant_id').get(function () {
  return this.shopId;
});

agentSchema.index({ shopId: 1, status: 1 });

module.exports = mongoose.model('Agent', agentSchema);
