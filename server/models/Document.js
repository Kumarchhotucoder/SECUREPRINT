const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
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
  originalFilename: {
    type: String,
    required: true,
    maxlength: 255
  },
  mimeType: {
    type: String,
    required: true
  },
  sizeBytes: {
    type: Number,
    required: true
  },
  pageCount: {
    type: Number,
    default: 1
  },
  // SHA-256 hash of the original file for integrity verification
  sha256Hash: {
    type: String,
    required: true
  },
  // Server-internal storage path — NEVER returned to any client
  storagePath: {
    type: String,
    required: true,
    select: false
  },
  // Soft-delete: when set, file access is revoked
  status: {
    type: String,
    enum: ['ACTIVE', 'DELETED'],
    default: 'ACTIVE'
  },
  deletedAt: {
    type: Date,
    default: null
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PrintJob',
    default: null
  },
  // Order for display
  displayOrder: {
    type: Number,
    default: 0
  }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

documentSchema.virtual('tenant_id').get(function () {
  return this.shopId;
});

// Only return non-deleted documents by default
documentSchema.index({ sessionId: 1, deletedAt: 1 });

module.exports = mongoose.model('Document', documentSchema);
