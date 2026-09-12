const crypto = require('crypto');

/**
 * Generate a cryptographically secure random token.
 * Used for session tokens, QR tokens, etc.
 */
const generateSecureToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Hash a token using SHA-256 for storage.
 * The raw token is only sent to the client, never stored.
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Compute SHA-256 hash of a file buffer for integrity verification.
 */
const hashFileBuffer = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Generate a short human-readable session ID (not used as security token).
 */
const generateSessionId = () => {
  return 'SP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
};

/**
 * Constant-time comparison to prevent timing attacks.
 */
const safeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

module.exports = { generateSecureToken, hashToken, hashFileBuffer, generateSessionId, safeCompare };
