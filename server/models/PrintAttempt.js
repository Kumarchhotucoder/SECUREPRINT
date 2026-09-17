const mongoose = require('mongoose');

const printAttemptSchema = new mongoose.Schema({
  attemptId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PrintJob',
    required: true,
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
    required: true
  },
  printerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Printer',
    required: true
  },
  status: {
    type: String,
    enum: [
      'QUEUED',               // Sent from cloud to agent queue
      'DOWNLOADING',          // Agent downloading encrypted/signed file
      'DOWNLOADED',           // File ready locally on agent
      'SUBMITTED',            // Sent to OS print spooler
      'PRINT_COMPLETED',      // OS or device confirms printing completed
      'FAILED',               // Print execution failed
      'CANCELLED'             // Cancelled by operator
    ],
    default: 'QUEUED',
    index: true
  },
  printSettings: {
    copies: { type: Number, default: 1 },
    colorMode: { type: String, enum: ['BW', 'COLOR'], default: 'BW' },
    paperSize: { type: String, default: 'A4' },
    duplex: { type: Boolean, default: false },
    orientation: { type: String, enum: ['PORTRAIT', 'LANDSCAPE'], default: 'PORTRAIT' },
    pageRange: { type: String, default: 'ALL' }
  },
  errorMessage: {
    type: String
  },
  submittedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

printAttemptSchema.virtual('tenant_id').get(function () {
  return this.shopId;
});

printAttemptSchema.index({ jobId: 1, createdAt: -1 });

module.exports = mongoose.model('PrintAttempt', printAttemptSchema);
