const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Sign a short-lived access token.
 */
const signAccessToken = (payload) => {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
};

/**
 * Sign a long-lived refresh token.
 */
const signRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
};

/**
 * Verify and decode an access token.
 * Throws if invalid or expired.
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, ACCESS_SECRET);
};

/**
 * Verify and decode a refresh token.
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, REFRESH_SECRET);
};

/**
 * Extract Bearer token from Authorization header.
 */
const extractBearerToken = (req) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
};

/**
 * Hash a refresh token for storage (prevents token theft from DB).
 */
const hashRefreshToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  extractBearerToken,
  hashRefreshToken
};
