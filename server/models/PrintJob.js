const mongoose = require('mongoose');

const JOB_STATUSES = [
  'CREATED', 'READY', 'RECEIVED', 'PRINTING',
  'PRINTING_COMPLETED', 'AWAITING_PAYMENT', 'PAYMENT_PROCESSING',
  'PAID', 'CLEANUP_COUNTDOWN', 'COMPLETED',
  'FAILED', 'EXPIRED', 'CANCELLED', 'DELETED'
];

const printJobSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PrintSession',
    required: true
  },
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  // Human-friendly job number (auto-incremented)
  jobNumber: {
    type: Number
  },
  // Customer's name (e.g. Rahul Kumar)
  customerName: {
    type: String,
    trim: true,
    default: 'Customer'
  },
  status: {
    type: String,
    enum: JOB_STATUSES,
    default: 'CREATED'
  },
  // Print settings
  copies: {
    type: Number,
    default: 1,
    min: 1,
    max: 100
  },
  colorMode: {
    type: String,
    enum: ['BW', 'COLOR'],
    default: 'BW'
  },
  paperSize: {
    type: String,
    enum: ['A4', 'A3', 'Letter', 'A5', 'Legal'],
    default: 'A4'
  },
  duplex: {
    type: Boolean,
    default: false
  },
  pagesPerSheet: {
    type: Number,
    enum: [1, 2, 4],
    default: 1
  },
  // Metadata
  totalFiles: {
    type: Number,
    default: 0
  },
  totalPages: {
    type: Number,
    default: 0
  },
  estimatedPrice: {
    type: Number,
    default: 0
  },
  finalPrice: {
    type: Number
  },
  // Payment tracking
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    default: null
  },
  paidAt: {
    type: Date,
    default: null
  },
  // 10-Second Post-Payment Cleanup Countdown
  cleanupCountdownSeconds: {
    type: Number,
    default: 10
  },
  cleanupScheduledAt: {
    type: Date,
    default: null,
    index: true
  },
  // Status history for audit
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String
  }],
  // Progress tracking during printing
  pagesCompleted: {
    type: Number,
    default: 0
  },
  // Completion
  completedAt: Date,
  // File Deletion & Cleanup Tracking
  filesDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  cleanupStatus: {
    type: String,
    enum: ['PENDING', 'CLEANING', 'SUCCESS', 'FAILED'],
    default: 'PENDING'
  },
  cleanupError: {
    type: String,
    default: null
  },
  // Notes from shopkeeper
  shopNote: {
    type: String,
    maxlength: 500
  }
}, { timestamps: true });

// Auto-increment job number
printJobSchema.pre('save', async function () {
  if (!this.isNew) return;
  try {
    const last = await this.constructor.findOne({}, {}, { sort: { jobNumber: -1 } });
    this.jobNumber = last ? (last.jobNumber || 0) + 1 : 10000 + Math.floor(Math.random() * 1000);
  } catch (e) {
    this.jobNumber = Date.now();
  }
});

module.exports = mongoose.model('PrintJob', printJobSchema);
