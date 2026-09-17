const express = require('express');
const router = express.Router();
const PrintSession = require('../models/PrintSession');
const Shop = require('../models/Shop');
const Document = require('../models/Document');
const { hashToken } = require('../utils/crypto');
const { logEvent, getRequestMeta } = require('../utils/audit');
const { sessionLimiter } = require('../middleware/rateLimiter');
const { v4: uuidv4 } = require('uuid');

// POST /api/sessions/start-by-slug — create customer session from shop permanent slug with customer name
router.post('/start-by-slug', sessionLimiter, async (req, res, next) => {
  try {
    const { slug, customerName } = req.body;
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Shop slug is required.' });
    }
    const cleanName = (customerName && customerName.trim()) ? customerName.trim() : 'Customer';

    const shop = await Shop.findOne({ slug: slug.toLowerCase().trim() });
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    const isOperational = shop.status === 'ACTIVE' && shop.isActive && shop.subscription?.status === 'ACTIVE';
    if (!isOperational) {
      return res.status(503).json({
        success: false,
        isInactive: true,
        code: 'SHOP_INACTIVE',
        message: 'This shop is currently not accepting print requests. Please try again later.'
      });
    }

    const { generateSecureToken } = require('../utils/crypto');
    const sessionToken = generateSecureToken(24);
    const sessionTokenHash = hashToken(sessionToken);

    const expiryHours = parseInt(process.env.SESSION_EXPIRY_HOURS || '4');
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const session = await PrintSession.create({
      shopId: shop._id,
      customerName: cleanName,
      secureTokenHash: sessionTokenHash,
      customerSessionId: uuidv4(),
      expiresAt,
      createdFromIp: req.ip,
      userAgent: req.headers['user-agent'],
      sessionType: 'PERMANENT_QR'
    });

    await logEvent('SESSION_CREATED', {
      shopId: shop._id,
      sessionId: session._id,
      ...getRequestMeta(req),
      metadata: { customerName: cleanName, slug }
    });

    res.status(201).json({
      success: true,
      data: {
        sessionId: session._id,
        sessionToken,
        customerName: session.customerName,
        expiresAt: session.expiresAt,
        shop: {
          id: shop._id,
          name: shop.name,
          slug: shop.slug,
          verificationStatus: shop.verificationStatus,
          pricing: shop.pricing,
          supportedPaperSizes: shop.supportedPaperSizes
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessions — create session from QR token
// This is the endpoint hit when a customer scans a shop QR
router.post('/', sessionLimiter, async (req, res, next) => {
  try {
    const { qrToken, shopId } = req.body;
    if (!qrToken || !shopId) {
      return res.status(400).json({ success: false, message: 'Invalid QR code. Please scan again.' });
    }

    // Find the shop and verify the QR token hash
    const shop = await Shop.findById(shopId).select('+permanentQrTokenHash');
    if (!shop || !shop.isActive) {
      return res.status(404).json({ success: false, message: 'This shop is currently offline.' });
    }

    const tokenHash = hashToken(qrToken);
    if (shop.permanentQrTokenHash !== tokenHash) {
      await logEvent('INVALID_TOKEN', {
        shopId: shop._id,
        ...getRequestMeta(req),
        metadata: { reason: 'QR token mismatch' }
      }, 'WARNING');
      return res.status(401).json({
        success: false,
        message: 'This QR code is invalid or has been regenerated. Please scan the current QR.'
      });
    }

    if (shop.verificationStatus !== 'VERIFIED') {
      return res.status(403).json({
        success: false,
        message: 'This shop is pending verification and cannot accept print jobs.'
      });
    }

    // Create a new session (each QR scan = new session)
    const expiryHours = parseInt(process.env.SESSION_EXPIRY_HOURS || '4');
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    // Generate a new unique session token for this customer session
    const { generateSecureToken } = require('../utils/crypto');
    const sessionToken = generateSecureToken(24);
    const sessionTokenHash = hashToken(sessionToken);

    const session = await PrintSession.create({
      shopId: shop._id,
      secureTokenHash: sessionTokenHash,
      customerSessionId: uuidv4(),
      expiresAt,
      createdFromIp: req.ip,
      userAgent: req.headers['user-agent'],
      sessionType: 'PERMANENT_QR'
    });

    await logEvent('SESSION_CREATED', {
      shopId: shop._id,
      sessionId: session._id,
      ...getRequestMeta(req)
    });

    res.status(201).json({
      success: true,
      data: {
        sessionId: session._id,
        sessionToken, // Raw token — returned to client ONCE, never stored raw
        expiresAt: session.expiresAt,
        shop: {
          id: shop._id,
          name: shop.name,
          verificationStatus: shop.verificationStatus,
          pricing: shop.pricing,
          supportedPaperSizes: shop.supportedPaperSizes
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sessions/:id — get session info
// Requires session token in header
router.get('/:id', async (req, res, next) => {
  try {
    const session = await verifySessionAccess(req, res);
    if (!session) return;

    const docs = await Document.find({ sessionId: session._id, deletedAt: null })
      .select('-storagePath')
      .sort({ displayOrder: 1 });

    res.json({
      success: true,
      data: {
        id: session._id,
        status: session.status,
        expiresAt: session.expiresAt,
        shopId: session.shopId,
        isExpired: session.isExpired(),
        documents: docs
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Shared helper: verify session access token from X-Session-Token header.
 */
const verifySessionAccess = async (req, res) => {
  const rawToken = req.headers['x-session-token'];
  if (!rawToken) {
    res.status(401).json({ success: false, message: 'Session token required.' });
    return null;
  }

  const tokenHash = hashToken(rawToken);
  const session = await PrintSession.findOne({
    _id: req.params.id,
    secureTokenHash: tokenHash
  });

  if (!session) {
    await logEvent('UNAUTHORIZED_ACCESS', {
      ...getRequestMeta(req),
      metadata: { sessionId: req.params.id, reason: 'Invalid session token' }
    }, 'WARNING');
    res.status(401).json({ success: false, message: 'Invalid session. Please scan the QR again.' });
    return null;
  }

  if (session.isExpired() || session.status === 'DELETED' || session.status === 'CANCELLED') {
    res.status(410).json({
      success: false,
      message: 'This printing session has expired. Please scan the shop QR again.',
      code: 'SESSION_EXPIRED'
    });
    return null;
  }

  return session;
};

module.exports = router;
module.exports.verifySessionAccess = verifySessionAccess;
