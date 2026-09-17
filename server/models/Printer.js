const mongoose = require('mongoose');

const printerSchema = new mongoose.Schema({
  printerId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true
  },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true,
    index: true
  },
  // Friendly display name (e.g. "HP LaserJet Pro 400 - Counter")
  name: {
    type: String,
    required: true,
    trim: true
  },
  // Exact OS system driver name as identified by Windows/CUPS
  systemPrinterName: {
    type: String,
    required: true,
    trim: true
  },
  connectionType: {
    type: String,
    enum: ['USB', 'WIFI', 'LAN', 'SHARED', 'WINDOWS_INSTALLED', 'VIRTUAL', 'UNKNOWN'],
    default: 'WINDOWS_INSTALLED'
  },
  isRegistered: {
    type: Boolean,
    default: true,
    index: true
  },
  registeredAt: {
    type: Date
  },
  manufacturer: {
    type: String,
    trim: true
  },
  model: {
    type: String,
    trim: true
  },
  deviceIdentifier: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: [
      'DISCOVERED',
      'CONNECTING',
      'CONNECTED',
      'READY',
      'ONLINE',
      'PRINTING',
      'OFFLINE',
      'ERROR',
      'PAPER_OUT',
      'PAPER_JAM',
      'LOW_INK',
      'LOW_TONER',
      'BUSY',
      'UNKNOWN',
      'DISCONNECTED'
    ],
    default: 'READY',
    index: true
  },
  statusDetails: {
    type: String,
    trim: true
  },
  capabilities: {
    color_supported: { type: Boolean, default: false },
    duplex_supported: { type: Boolean, default: false },
    paper_sizes: { type: [String], default: ['A4'] },
    max_copies: { type: Number, default: 99 }
  },
  isColorCapable: {
    type: Boolean,
    default: false
  },
  supportsDuplex: {
    type: Boolean,
    default: false
  },
  paperSizes: {
    type: [String],
    default: ['A4']
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isEnabled: {
    type: Boolean,
    default: true
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

printerSchema.virtual('tenant_id').get(function () {
  return this.shopId;
});

printerSchema.index({ shopId: 1, isEnabled: 1, status: 1 });
printerSchema.index({ agentId: 1, systemPrinterName: 1 }, { unique: true });

module.exports = mongoose.model('Printer', printerSchema);
