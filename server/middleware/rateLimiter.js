const rateLimit = require('express-rate-limit');
const { logEvent, getRequestMeta } = require('../utils/audit');

const createLimiter = (options) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    standardHeaders: true,
    legacyHeaders: false,
    // Skip custom keyGenerator to avoid IPv6 validation errors;
    // express-rate-limit's default keyGenerator handles IPv6 correctly
    validate: { trustProxy: false, xForwardedForHeader: false },
    handler: async (req, res) => {
      try {
        await logEvent('RATE_LIMITED', {
          ...getRequestMeta(req),
          metadata: { endpoint: req.path, limit: options.max }
        }, 'WARNING');
      } catch {}
      res.status(429).json({
        success: false,
        message: 'Too many requests. This session has been temporarily restricted. Please try again later.'
      });
    },
    skip: (req) => process.env.NODE_ENV === 'test' || (process.env.NODE_ENV !== 'production' && (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'))
  });
};

// Strict limit for auth endpoints
const authLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

// Limit for session creation (QR scanning)
const sessionLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

// Limit for file uploads
const uploadLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 60 });

// General API limit
const apiLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 300 });

module.exports = { authLimiter, sessionLimiter, uploadLimiter, apiLimiter };
