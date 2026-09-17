const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    enum: [
      'SESSION_CREATED', 'QR_SCANNED', 'FILE_UPLOADED', 'FILE_DELETED',
      'JOB_CREATED', 'JOB_ACCESSED', 'JOB_PRINT_STARTED', 'JOB_PRINTING_COMPLETED', 'JOB_COMPLETED',
      'JOB_PAYMENT_VERIFIED', 'JOB_CANCELLED', 'JOB_FAILED', 'JOB_FILES_DELETED',
      'SESSION_EXPIRED', 'SESSION_DELETED',
      'DOCUMENT_DELETION_INITIATED', 'DOCUMENT_DELETED',
      'AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_FAILED', 'AUTH_LOCKED',
      'UNAUTHORIZED_ACCESS', 'INVALID_TOKEN', 'RATE_LIMITED',
      'SHOP_CREATED', 'SHOP_REGISTERED', 'SHOP_UPDATED', 'SHOP_VERIFIED', 'SHOP_QR_GENERATED',
      'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_EXPIRED', 'SUBSCRIPTION_GATE_BLOCKED', 'CLEANUP_STARTED',
      'ADMIN_ACTION', 'ADMIN_MANUAL_SHOP_ACTIVATION',
      'CASH_PAYMENT_REQUESTED', 'CASH_PAYMENT_CONFIRMED', 'CASH_PAYMENT_REJECTED',
      'ONLINE_PAYMENT_STARTED', 'PAYMENT_ORDER_CREATED', 'PAYMENT_METHOD_SELECTED',
      'AGENT_PAIRING_INITIATED', 'AGENT_PAIRED_SUCCESSFULLY', 'PRINTERS_SYNCHRONIZED',
      'PRINT_JOB_DISPATCHED', 'PRINT_JOB_COMPLETED', 'PRINT_JOB_FAILED'
    ]
  },
  // References (any combination)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintSession' },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintJob' },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  // Request metadata
  ipAddress: String,
  userAgent: String,
  // Additional context — NEVER store document contents
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  severity: {
    type: String,
    enum: ['INFO', 'WARNING', 'ERROR', 'CRITICAL'],
    default: 'INFO'
  }
}, {
  timestamps: true,
  // Audit logs are append-only — no updates
  strict: true
});

// Index for efficient querying
auditLogSchema.index({ eventType: 1, createdAt: -1 });
auditLogSchema.index({ shopId: 1, createdAt: -1 });
auditLogSchema.index({ sessionId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
