const AuditLog = require('../models/AuditLog');

/**
 * Log a security or lifecycle event.
 * Never include document contents in metadata.
 */
const logEvent = async (eventType, context = {}, severity = 'INFO') => {
  try {
    await AuditLog.create({
      eventType,
      userId: context.userId,
      shopId: context.shopId,
      sessionId: context.sessionId,
      jobId: context.jobId,
      documentId: context.documentId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: context.metadata || {},
      severity
    });
  } catch (err) {
    // Audit failures should not crash the application
    console.error('[AUDIT] Failed to log event:', eventType, err.message);
  }
};

/**
 * Helper to extract request metadata for audit logs.
 */
const getRequestMeta = (req) => ({
  ipAddress: req.ip || req.socket?.remoteAddress,
  userAgent: req.headers['user-agent']
});

module.exports = { logEvent, getRequestMeta };
