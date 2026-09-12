const { verifyAccessToken, extractBearerToken } = require('../utils/jwt');
const User = require('../models/User');
const { logEvent, getRequestMeta } = require('../utils/audit');

/**
 * Authenticate shopkeeper or admin.
 * Attaches req.user to the request if valid.
 */
const authenticate = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Session expired. Please log in again.', code: 'TOKEN_EXPIRED' });
      }
      await logEvent('INVALID_TOKEN', { ...getRequestMeta(req), metadata: { reason: err.message } }, 'WARNING');
      return res.status(401).json({ success: false, message: 'Invalid authentication token.' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Account not found or deactivated.' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Require ADMIN or SUPER_ADMIN role.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    logEvent('UNAUTHORIZED_ACCESS', {
      userId: req.user?._id,
      ...getRequestMeta(req),
      metadata: { required: 'ADMIN', got: req.user?.role }
    }, 'WARNING');
    return res.status(403).json({ success: false, message: 'Super Admin access required.' });
  }
  next();
};

/**
 * Require SHOPKEEPER role (or Admin).
 */
const requireShopkeeper = (req, res, next) => {
  if (!req.user || !['SHOPKEEPER', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Shopkeeper access required.' });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireShopkeeper };
