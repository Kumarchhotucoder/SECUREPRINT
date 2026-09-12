const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Shop = require('../models/Shop');
const PrintJob = require('../models/PrintJob');
const PrintSession = require('../models/PrintSession');
const { authenticate, requireAdmin, requireShopkeeper } = require('../middleware/auth');
const { generateSecureToken, hashToken } = require('../utils/crypto');
const { logEvent, getRequestMeta } = require('../utils/audit');
const { getTodayRangeIST } = require('../utils/timezone');

// Helper to detect if a URL is a local address (not reachable from a mobile phone)
const isLocalAddress = (url) => {
  if (!url) return true;
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(url);
};

// Canonical public base URL resolver
// Priority: PUBLIC_APP_URL -> APP_BASE_URL -> CLIENT_URL -> request headers -> default
const getAppBaseUrl = (req = null) => {
  const configuredUrl = process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || process.env.CLIENT_URL;
  let baseUrl = configuredUrl ? configuredUrl.trim().replace(/\/$/, '') : '';

  // Production Safety Check:
  // Before generating a production QR: verify configured public URL is https:// and NOT localhost/private IP
  if (process.env.NODE_ENV === 'production') {
    if (!baseUrl || !baseUrl.startsWith('https://') || isLocalAddress(baseUrl)) {
      throw new Error('Invalid production QR configuration. Set PUBLIC_APP_URL to the live HTTPS domain.');
    }
    return baseUrl;
  }

  // If a public URL was configured in non-production, use it
  if (baseUrl) {
    return baseUrl;
  }

  // Check if request arrived through a public proxy or tunnel
  if (req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    if (host && !isLocalAddress(host)) {
      return `${proto}://${host}`;
    }
  }

  return 'http://localhost:5173';
};

// Helper to ensure permanent QR is generated and cached for this shop's slug
const ensurePermanentQr = async (shop, req = null) => {
  const baseUrl = getAppBaseUrl(req);
  if (!shop.slug) {
    const slugify = (text) => text.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
    shop.slug = slugify(shop.name);
  }
  const qrTarget = `${baseUrl}/shop/${shop.slug}`;
  if (!shop.permanentQrDataUrl || shop.permanentQrTargetUrl !== qrTarget) {
    const qrDataUrl = await QRCode.toDataURL(qrTarget, {
      width: 500,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' }
    });
    shop.permanentQrDataUrl = qrDataUrl;
    shop.permanentQrTargetUrl = qrTarget;
    shop.permanentQrGeneratedAt = new Date();
    await shop.save();
  }

  const isLocal = isLocalAddress(qrTarget);
  const warningMessage = isLocal
    ? 'WARNING: This QR is using a local address and cannot be used from a normal external mobile device. Configure PUBLIC_APP_URL.'
    : null;

  return {
    qrDataUrl: shop.permanentQrDataUrl,
    qrTargetUrl: shop.permanentQrTargetUrl || qrTarget,
    isLocalAddress: isLocal,
    warningMessage
  };
};

// GET /api/shops/my — shopkeeper gets their own shop
router.get('/my', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user._id });
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found for your account.' });
    }
    const currentTarget = `${getAppBaseUrl(req)}/shop/${shop.slug}`;
    if (!shop.permanentQrDataUrl || !shop.slug || shop.permanentQrTargetUrl !== currentTarget) {
      await ensurePermanentQr(shop, req);
    }
    res.json({
      success: true,
      data: {
        ...shop.toObject(),
        permanentQrTargetUrl: shop.permanentQrTargetUrl || currentTarget
      }
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/shops/my — shopkeeper updates their counter details & pricing
router.put('/my', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user._id });
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found for your account.' });
    }

    const { name, phone, email, address, pricing, supportedPaperSizes } = req.body;

    if (name && name.trim()) {
      shop.name = name.trim();
    }
    if (phone !== undefined) shop.phone = phone;
    if (email !== undefined) shop.email = email;

    if (address && typeof address === 'object') {
      shop.address = {
        street: address.street !== undefined ? address.street : shop.address?.street,
        city: address.city !== undefined ? address.city : shop.address?.city,
        state: address.state !== undefined ? address.state : shop.address?.state,
        pincode: address.pincode !== undefined ? address.pincode : shop.address?.pincode,
        country: address.country || shop.address?.country || 'India'
      };
    }

    if (pricing && typeof pricing === 'object') {
      const bw = Number(pricing.bwPerPage);
      const color = Number(pricing.colorPerPage);

      shop.pricing = {
        bwPerPage: !isNaN(bw) && bw >= 0 ? bw : (shop.pricing?.bwPerPage ?? 1),
        colorPerPage: !isNaN(color) && color >= 0 ? color : (shop.pricing?.colorPerPage ?? 5),
        currency: pricing.currency || shop.pricing?.currency || 'INR'
      };
    }

    if (Array.isArray(supportedPaperSizes) && supportedPaperSizes.length > 0) {
      shop.supportedPaperSizes = supportedPaperSizes;
    }

    // Mark setup complete
    shop.isSetupComplete = true;

    await shop.save();

    await logEvent('SHOP_UPDATED', {
      userId: req.user._id,
      shopId: shop._id,
      ...getRequestMeta(req),
      metadata: {
        shopName: shop.name,
        pricing: shop.pricing,
        isSetupComplete: true
      }
    });

    res.json({
      success: true,
      message: 'Counter details & pricing updated successfully',
      data: shop
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/shops/by-slug/:slug — get shop details by public slug
router.get('/by-slug/:slug', async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase().trim();
    let shop = await Shop.findOne({ slug });
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found with this QR or link.' });
    }
    if (!shop.isActive) {
      return res.json({
        success: false,
        isInactive: true,
        message: 'This SecurePrint shop is currently unavailable.',
        data: {
          id: shop._id,
          name: shop.name,
          slug: shop.slug,
          isActive: false
        }
      });
    }

    if (!shop.permanentQrDataUrl) {
      await ensurePermanentQr(shop, req);
    }

    res.json({
      success: true,
      isInactive: false,
      data: {
        id: shop._id,
        name: shop.name,
        slug: shop.slug,
        address: shop.address,
        phone: shop.phone,
        email: shop.email,
        verificationStatus: shop.verificationStatus,
        isActive: shop.isActive,
        supportedPaperSizes: shop.supportedPaperSizes,
        pricing: shop.pricing,
        permanentQrDataUrl: shop.permanentQrDataUrl
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/shops/:id/permanent-qr — get permanent QR for counter display / download
router.get('/:id/permanent-qr', async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });
    const { qrDataUrl, qrTargetUrl, isLocalAddress: isLocal, warningMessage } = await ensurePermanentQr(shop, req);
    res.json({
      success: true,
      data: {
        shopId: shop._id,
        shopName: shop.name,
        slug: shop.slug,
        qrDataUrl,
        qrTargetUrl,
        isLocalAddress: isLocal,
        warningMessage
      }
    });
  } catch (err) {
    next(err);
  }
});


// GET /api/shops/public/demo — returns an active demo shop and valid token for instant testing
router.get('/public/demo', async (req, res, next) => {
  try {
    let shop = await Shop.findOne({ isActive: true, verificationStatus: 'VERIFIED' });
    if (!shop) {
      shop = await Shop.findOne({});
    }
    if (!shop) {
      return res.status(404).json({ success: false, message: 'No active shop found for demo.' });
    }

    // Generate/refresh token for testing
    const rawToken = generateSecureToken(32);
    shop.permanentQrTokenHash = hashToken(rawToken);
    shop.permanentQrGeneratedAt = new Date();
    await shop.save();

    res.json({
      success: true,
      data: {
        shopId: shop._id,
        shopName: shop.name,
        token: rawToken,
        scanUrl: `/scan/${rawToken}?shop=${shop._id}`
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/shops/:id — get shop public info (for session display)
router.get('/:id', async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id)
      .select('name address verificationStatus isActive supportedPaperSizes pricing');
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }
    if (!shop.isActive) {
      return res.status(503).json({ success: false, message: 'This shop is currently offline.' });
    }
    res.json({ success: true, data: shop });
  } catch (err) {
    next(err);
  }
});

// POST /api/shops/:id/qr — refresh/ensure permanent shop QR
router.post('/:id/qr', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    const { qrDataUrl, qrTargetUrl, isLocalAddress: isLocal, warningMessage } = await ensurePermanentQr(shop, req);

    await logEvent('SHOP_QR_GENERATED', {
      userId: req.user._id,
      shopId: shop._id,
      ...getRequestMeta(req)
    });

    res.json({
      success: true,
      data: {
        qrDataUrl,
        qrUrl: qrTargetUrl,
        qrTargetUrl,
        shopName: shop.name,
        generatedAt: shop.permanentQrGeneratedAt,
        isLocalAddress: isLocal,
        warningMessage
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/shops/:id/jobs — get shop's print jobs (shopkeeper only)
router.get('/:id/jobs', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!shop) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const { status, page = 1, limit = 20 } = req.query;
    const filter = { shopId: shop._id };
    if (status) filter.status = status;

    const jobs = await PrintJob.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('sessionId', 'customerSessionId expiresAt');

    const total = await PrintJob.countDocuments(filter);

    res.json({ success: true, data: jobs, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    next(err);
  }
});

// GET /api/shops/:id/stats — dashboard stats with accurate Asia/Kolkata (IST) daily reset
router.get('/:id/stats', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!shop) return res.status(403).json({ success: false, message: 'Access denied.' });

    // Precise Asia/Kolkata midnight boundaries
    const { startOfDayIST, endOfDayIST, formattedDateIST } = getTodayRangeIST();

    const [active, pending, todayCompleted, todayJobsDocs, todaySessions, totalCustomers, allCompletedDocs] = await Promise.all([
      PrintJob.countDocuments({ shopId: shop._id, status: { $in: ['RECEIVED', 'PRINTING'] } }),
      PrintJob.countDocuments({ shopId: shop._id, status: 'READY' }),
      PrintJob.countDocuments({
        shopId: shop._id,
        status: { $in: ['COMPLETED', 'CLEANUP_COUNTDOWN', 'AWAITING_PAYMENT'] },
        createdAt: { $gte: startOfDayIST, $lte: endOfDayIST }
      }),
      PrintJob.find({ shopId: shop._id, createdAt: { $gte: startOfDayIST, $lte: endOfDayIST } }),
      PrintSession.countDocuments({ shopId: shop._id, createdAt: { $gte: startOfDayIST, $lte: endOfDayIST } }),
      PrintSession.countDocuments({ shopId: shop._id }),
      PrintJob.find({ shopId: shop._id, status: 'COMPLETED' })
    ]);

    const todayPages = todayJobsDocs.reduce((sum, j) => sum + (j.totalPages * (j.copies || 1)), 0);
    // Revenue counts only jobs that are PAID
    const todayRevenue = todayJobsDocs
      .filter(j => j.paymentStatus === 'PAID')
      .reduce((sum, j) => sum + (j.finalPrice || j.estimatedPrice || 0), 0);

    const lifetimeRevenue = allCompletedDocs
      .filter(j => j.paymentStatus === 'PAID')
      .reduce((sum, j) => sum + (j.finalPrice || j.estimatedPrice || 0), 0);

    res.json({
      success: true,
      data: {
        active,
        pending,
        completed: todayCompleted,
        todayJobs: todayJobsDocs.length,
        todayCustomers: todaySessions,
        totalCustomers,
        todayPages,
        todayRevenue,
        lifetimeRevenue,
        lifetimeCompleted: allCompletedDocs.length,
        todayDateIST: formattedDateIST,
        timezone: 'Asia/Kolkata'
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/shops — create shop (admin only)
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, address, phone, email, ownerId, pricing } = req.body;
    if (!name || !ownerId) {
      return res.status(400).json({ success: false, message: 'Name and owner ID are required.' });
    }

    const shop = await Shop.create({ name, address, phone, email, ownerId, pricing });

    await logEvent('SHOP_CREATED', {
      userId: req.user._id,
      shopId: shop._id,
      ...getRequestMeta(req),
      metadata: { shopName: name }
    });

    res.status(201).json({ success: true, data: shop });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
