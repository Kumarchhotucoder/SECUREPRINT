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
    enum: ['USB', 'WIFI', 'LAN', 'SHARED', 'WINDOWS_INSTALLED', 'VIRTUAL'],
    default: 'WINDOWS_INSTALLED'
  },
  status: {
    type: String,
    enum: ['READY', 'OFFLINE', 'ERROR', 'PAPER_OUT', 'PAPER_JAM', 'LOW_INK', 'LOW_TONER', 'BUSY', 'UNKNOWN'],
    default: 'READY',
    index: true
  },
  statusDetails: {
    type: String,
    trim: true
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
  timestamps: true
});

printerSchema.index({ shopId: 1, isEnabled: 1, status: 1 });
printerSchema.index({ agentId: 1, systemPrinterName: 1 }, { unique: true });

module.exports = mongoose.model('Printer', printerSchema);
