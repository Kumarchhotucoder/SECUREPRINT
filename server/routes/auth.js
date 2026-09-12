const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { signAccessToken, signRefreshToken, verifyRefreshToken, hashRefreshToken } = require('../utils/jwt');
const { logEvent, getRequestMeta } = require('../utils/audit');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+passwordHash +failedLoginAttempts +lockedUntil +refreshTokenHash');

    if (!user) {
      await logEvent('AUTH_FAILED', { ...getRequestMeta(req), metadata: { email } }, 'WARNING');
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check lockout
    if (user.isLocked()) {
      const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      await logEvent('AUTH_LOCKED', { userId: user._id, ...getRequestMeta(req) }, 'WARNING');
      return res.status(423).json({
        success: false,
        message: `Account temporarily locked. Try again in ${remaining} minutes.`
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      await logEvent('AUTH_FAILED', { userId: user._id, ...getRequestMeta(req) }, 'WARNING');
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Successful login — reset lockout
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();

    const payload = { userId: user._id.toString(), role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    user.refreshTokenHash = hashRefreshToken(refreshToken);
    await user.save();

    await logEvent('AUTH_LOGIN', { userId: user._id, ...getRequestMeta(req) });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token required.' });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
    }

    const user = await User.findById(decoded.userId).select('+refreshTokenHash');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const storedHash = user.refreshTokenHash;
    const incomingHash = hashRefreshToken(refreshToken);
    if (storedHash !== incomingHash) {
      await logEvent('INVALID_TOKEN', { userId: user._id, ...getRequestMeta(req) }, 'WARNING');
      return res.status(401).json({ success: false, message: 'Refresh token has been revoked.' });
    }

    const payload = { userId: user._id.toString(), role: user.role };
    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken(payload);

    user.refreshTokenHash = hashRefreshToken(newRefreshToken);
    await user.save();

    res.json({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    req.user.refreshTokenHash = undefined;
    await req.user.save();
    await logEvent('AUTH_LOGOUT', { userId: req.user._id, ...getRequestMeta(req) });
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register-shop — Onboard new shop owner with permanent QR and shop setup
router.post('/register-shop', async (req, res, next) => {
  try {
    const { name, email, password, shopName, phone, address, pricing, planId = 'TRIAL' } = req.body;
    if (!name || !email || !password || !shopName || !phone) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    // 1. Create shopkeeper user
    const user = new User({
      name,
      email: email.toLowerCase(),
      passwordHash: password,
      role: 'SHOPKEEPER'
    });
    await user.save();

    // 2. Create Shop
    const Shop = require('../models/Shop');
    const QRCode = require('qrcode');

    const shop = new Shop({
      name: shopName,
      ownerId: user._id,
      phone,
      email: email.toLowerCase(),
      address: address || {},
      pricing: pricing || { bwPerPage: 2, colorPerPage: 10, currency: 'INR' },
      isSetupComplete: true,
      isActive: true,
      verificationStatus: 'VERIFIED',
      subscription: {
        plan: planId,
        status: 'ACTIVE',
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    await shop.save();

    // 3. Generate permanent QR
    const publicBaseUrl = (process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    const qrTarget = `${publicBaseUrl}/shop/${shop.slug}`;
    const qrDataUrl = await QRCode.toDataURL(qrTarget, {
      width: 500,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' }
    });

    shop.permanentQrDataUrl = qrDataUrl;
    shop.permanentQrTargetUrl = qrTarget;
    shop.permanentQrGeneratedAt = new Date();
    await shop.save();

    await logEvent('SHOP_REGISTERED', {
      userId: user._id,
      shopId: shop._id,
      metadata: { shopName: shop.name, plan: planId }
    });

    res.status(201).json({
      success: true,
      data: {
        userId: user._id,
        shopId: shop._id,
        slug: shop.slug,
        permanentQrTargetUrl: qrTarget,
        message: 'Shop and owner registered successfully!'
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
});

module.exports = router;
