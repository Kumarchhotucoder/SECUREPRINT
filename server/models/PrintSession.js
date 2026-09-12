const mongoose = require('mongoose');

const SESSION_STATUSES = ['CREATED', 'UPLOADING', 'READY', 'EXPIRED', 'DELETED', 'CANCELLED'];

const printSessionSchema = new mongoose.Schema({
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  // Cryptographic hash of the session token — raw token is never stored
  secureTokenHash: {
    type: String,
    required: true,
    unique: true,
    select: false
  },
  // Customer session identifier (client-generated, non-sensitive)
  customerSessionId: {
    type: String,
    required: true
  },
  // Customer's entered name (e.g. Rahul Kumar)
  customerName: {
    type: String,
    trim: true,
    default: 'Customer'
  },
  status: {
    type: String,
    enum: SESSION_STATUSES,
    default: 'CREATED'
  },
  expiresAt: {
    type: Date,
    required: true
  },
  // IP and UA for audit (not stored in document model)
  createdFromIp: { type: String, select: false },
  userAgent: { type: String, select: false },
  // Track if this was a one-time (job-specific) or permanent QR session
  sessionType: {
    type: String,
    enum: ['PERMANENT_QR', 'ONE_TIME'],
    default: 'PERMANENT_QR'
  },
  filesDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Auto-expire: mark sessions expired in DB (actual cleanup done by service)
printSessionSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

module.exports = mongoose.model('PrintSession', printSessionSchema);
