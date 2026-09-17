const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const User = require('../models/User');
const Shop = require('../models/Shop');
const PrintJob = require('../models/PrintJob');
const PrintSession = require('../models/PrintSession');
const AuditLog = require('../models/AuditLog');
const Payment = require('../models/Payment');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logEvent, getRequestMeta } = require('../utils/audit');
const { getAppBaseUrl } = require('../utils/url');

// All admin routes require authentication + ADMIN or SUPER_ADMIN role
router.use(authenticate, requireAdmin);

// ── Helper: build shop QR ──────────────────────────────────────
const generateShopQr = async (slug, req = null) => {
  const base = getAppBaseUrl(req);
  const target = `${base}/shop/${slug}`;
  const dataUrl = await QRCode.toDataURL(target, {
    width: 500, margin: 2,
    color: { dark: '#0F172A', light: '#FFFFFF' }
  });
  return { target, dataUrl };
};

// ── GET /api/admin/dashboard — platform-wide stats ─────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const [totalShops, verifiedShops, totalUsers, totalJobs, completedJobs, recentEvents] = await Promise.all([
      Shop.countDocuments(),
      Shop.countDocuments({ verificationStatus: 'VERIFIED' }),
      User.countDocuments({ role: 'SHOPKEEPER' }),
      PrintJob.countDocuments(),
      PrintJob.countDocuments({ status: 'COMPLETED' }),
      AuditLog.find({ severity: { $in: ['WARNING', 'CRITICAL'] } })
        .sort({ createdAt: -1 }).limit(20)
    ]);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayJobs = await PrintJob.countDocuments({ createdAt: { $gte: today } });

    res.json({
      success: true,
      data: { totalShops, verifiedShops, totalUsers, totalJobs, completedJobs, todayJobs, recentSecurityEvents: recentEvents }
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/analytics — detailed platform-wide analytics ─
router.get('/analytics', async (req, res, next) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalShops, activeShops, verifiedShops,
      customersToday, customersWeek, customersMonth, customersAllTime,
      totalJobs, completedJobs, pendingJobs, deletedCleanedJobs,
      todayJobs, shopsList
    ] = await Promise.all([
      Shop.countDocuments(),
      Shop.countDocuments({ isActive: true }),
      Shop.countDocuments({ verificationStatus: 'VERIFIED' }),
      PrintSession.countDocuments({ createdAt: { $gte: startOfToday } }),
      PrintSession.countDocuments({ createdAt: { $gte: startOfWeek } }),
      PrintSession.countDocuments({ createdAt: { $gte: startOfMonth } }),
      PrintSession.countDocuments(),
      PrintJob.countDocuments(),
      PrintJob.countDocuments({ status: 'COMPLETED' }),
      PrintJob.countDocuments({ status: { $in: ['READY', 'RECEIVED', 'PRINTING'] } }),
      PrintJob.countDocuments({ status: { $in: ['COMPLETED', 'DELETED'] } }),
      PrintJob.countDocuments({ createdAt: { $gte: startOfToday } }),
      Shop.find().populate('ownerId', 'name email').sort({ createdAt: -1 })
    ]);

    // Revenue: sum estimatedPrice of COMPLETED jobs
    const revenueAgg = await PrintJob.aggregate([
      { $match: { status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$estimatedPrice' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    const todayRevenue = await PrintJob.aggregate([
      { $match: { status: 'COMPLETED', completedAt: { $gte: startOfToday } } },
      { $group: { _id: null, total: { $sum: '$estimatedPrice' } } }
    ]);
    const todayRevenueTotal = todayRevenue[0]?.total || 0;

    // Per-shop breakdown
    const shopBreakdowns = await Promise.all(
      shopsList.map(async (shop) => {
        const [jobsCount, sessionsCount, revenueAggShop] = await Promise.all([
          PrintJob.countDocuments({ shopId: shop._id }),
          PrintSession.countDocuments({ shopId: shop._id }),
          PrintJob.aggregate([
            { $match: { shopId: shop._id, status: 'COMPLETED' } },
            { $group: { _id: null, total: { $sum: '$estimatedPrice' } } }
          ])
        ]);
        return {
          id: shop._id,
          name: shop.name,
          slug: shop.slug,
          ownerName: shop.ownerId?.name || 'Unassigned',
          ownerEmail: shop.ownerId?.email || 'N/A',
          isActive: shop.isActive,
          verificationStatus: shop.verificationStatus,
          jobsCount,
          sessionsCount,
          revenue: revenueAggShop[0]?.total || 0,
          createdAt: shop.createdAt
        };
      })
    );

    res.json({
      success: true,
      data: {
        shops: { total: totalShops, active: activeShops, inactive: totalShops - activeShops, verified: verifiedShops },
        customers: { today: customersToday, thisWeek: customersWeek, thisMonth: customersMonth, allTime: customersAllTime },
        jobs: { total: totalJobs, completed: completedJobs, pending: pendingJobs, sanitized: deletedCleanedJobs, today: todayJobs },
        revenue: { total: totalRevenue, today: todayRevenueTotal },
        shopBreakdowns
      }
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/customers — customer metadata list ──────────
router.get('/customers', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, shopId, search } = req.query;
    const filter = {};
    if (shopId) filter.shopId = shopId;
    if (search) filter.customerName = { $regex: search, $options: 'i' };

    const sessions = await PrintSession.find(filter)
      .populate('shopId', 'name slug')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await PrintSession.countDocuments(filter);

    const customerMetadata = await Promise.all(
      sessions.map(async (s) => {
        const jobs = await PrintJob.find({ sessionId: s._id })
          .select('status jobNumber totalPages copies estimatedPrice createdAt');
        return {
          id: s._id,
          customerName: s.customerName || 'Customer',
          customerSessionId: s.customerSessionId,
          shopName: s.shopId?.name || 'Unknown Shop',
          shopSlug: s.shopId?.slug || '',
          sessionStatus: s.status,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
          jobsCount: jobs.length,
          jobsSummary: jobs.map(j => ({
            jobNumber: j.jobNumber,
            status: j.status,
            totalPages: j.totalPages,
            copies: j.copies,
            estimatedPrice: j.estimatedPrice
          }))
          // PRIVACY GUARANTEE: No document names, no storage paths, no buffers, no files!
        };
      })
    );

    res.json({ success: true, data: customerMetadata, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (err) { next(err); }
});

// ── GET /api/admin/shops — list all shops ──────────────────────
router.get('/shops', async (req, res, next) => {
  try {
    const shops = await Shop.find().populate('ownerId', 'name email').sort({ createdAt: -1 });
    res.json({ success: true, data: shops });
  } catch (err) { next(err); }
});

// ── POST /api/admin/shops — create a new shop + shopkeeper (PENDING_PAYMENT) ─────
router.post('/shops', async (req, res, next) => {
  try {
    const { shopName, shopAddress, shopPhone, shopEmail, ownerName, ownerEmail, ownerPassword, plan = 'STARTER' } = req.body;
    if (!shopName || !ownerEmail || !ownerPassword) {
      return res.status(400).json({ success: false, message: 'shopName, ownerEmail and ownerPassword are required.' });
    }

    // Check if email taken
    const existing = await User.findOne({ email: ownerEmail.toLowerCase() });
    if (existing) return res.status(409).json({ success: false, message: 'Email already in use by another account.' });

    // Create shopkeeper user
    const shopkeeper = new User({
      name: ownerName || 'Shopkeeper',
      email: ownerEmail.toLowerCase(),
      passwordHash: ownerPassword,
      role: 'SHOPKEEPER'
    });
    await shopkeeper.save();

    // Create slug from shop name
    const slugify = (text) => text.toString().toLowerCase().trim()
      .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
    let baseSlug = slugify(shopName);
    let slug = baseSlug;
    let count = 1;
    while (await Shop.findOne({ slug })) { slug = `${baseSlug}-${count++}`; }

    // Generate QR
    const { target: qrTarget, dataUrl: qrDataUrl } = await generateShopQr(slug);

    // Parse address
    let address = {};
    if (shopAddress) {
      const parts = shopAddress.split(',').map(s => s.trim());
      address = { street: parts[0] || '', city: parts[1] || '', state: parts[2] || '', pincode: parts[3] || '' };
    }

    // Generate secure random payment token for subscription onboarding link
    const paymentToken = crypto.randomBytes(24).toString('hex');
    const monthlyPrice = plan === 'PRO' ? 999 : plan === 'ENTERPRISE' ? 2499 : 499;

    // Create shop with state PENDING_PAYMENT (strictly gated)
    const shop = new Shop({
      name: shopName,
      slug,
      address,
      phone: shopPhone,
      email: shopEmail,
      ownerId: shopkeeper._id,
      status: 'PENDING_PAYMENT',
      isActive: false,
      verificationStatus: 'PENDING',
      isSetupComplete: false,
      subscription: {
        plan,
        status: 'PENDING',
        monthlyPrice,
        paymentToken,
        paymentTokenExpiresAt: new Date(Date.now() + 30 * 86400000)
      },
      permanentQrDataUrl: qrDataUrl,
      permanentQrTargetUrl: qrTarget,
      permanentQrGeneratedAt: new Date(),
      pricing: { bwPerPage: 1, colorPerPage: 5, currency: 'INR' }
    });
    await shop.save();

    await logEvent('ADMIN_ACTION', {
      userId: req.user._id,
      shopId: shop._id,
      ...getRequestMeta(req),
      metadata: { action: 'CREATE_SHOP', shopName, ownerEmail, status: 'PENDING_PAYMENT', plan }
    });

    const paymentLink = `/subscription/pay/${paymentToken}`;

    res.status(201).json({
      success: true,
      message: `Shop "${shopName}" created. Subscription payment is PENDING.`,
      data: {
        shop: { ...shop.toObject(), ownerId: { _id: shopkeeper._id, name: shopkeeper.name, email: shopkeeper.email } },
        shopkeeperCredentials: { email: ownerEmail, password: ownerPassword },
        paymentToken,
        paymentLink,
        status: 'PENDING_PAYMENT',
        subscriptionStatus: 'PENDING'
      }
    });
  } catch (err) { next(err); }
});

// ── POST /api/admin/shops/:id/payment-link — generate/retrieve payment link ───
router.post('/shops/:id/payment-link', async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

    if (!shop.subscription?.paymentToken) {
      const paymentToken = crypto.randomBytes(24).toString('hex');
      if (!shop.subscription) shop.subscription = {};
      shop.subscription.paymentToken = paymentToken;
      shop.subscription.paymentTokenExpiresAt = new Date(Date.now() + 30 * 86400000);
      await shop.save();
    }

    res.json({
      success: true,
      data: {
        paymentToken: shop.subscription.paymentToken,
        paymentLink: `/subscription/pay/${shop.subscription.paymentToken}`,
        shopName: shop.name,
        status: shop.status,
        subscriptionStatus: shop.subscription?.status
      }
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/shops/:id — single shop details + stats ─────
router.get('/shops/:id', async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id).populate('ownerId', 'name email role isActive');
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const [jobsCount, completedCount, pendingCount, sessionsCount, revenueAgg] = await Promise.all([
      PrintJob.countDocuments({ shopId: shop._id }),
      PrintJob.countDocuments({ shopId: shop._id, status: 'COMPLETED' }),
      PrintJob.countDocuments({ shopId: shop._id, status: { $in: ['READY', 'RECEIVED', 'PRINTING'] } }),
      PrintSession.countDocuments({ shopId: shop._id }),
      PrintJob.aggregate([
        { $match: { shopId: shop._id, status: 'COMPLETED' } },
        { $group: { _id: null, total: { $sum: '$estimatedPrice' } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        ...shop.toObject(),
        stats: {
          totalJobs: jobsCount,
          completedJobs: completedCount,
          pendingJobs: pendingCount,
          totalSessions: sessionsCount,
          revenue: revenueAgg[0]?.total || 0
        }
      }
    });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/shops/:id — edit shop details ─────────────
router.patch('/shops/:id', async (req, res, next) => {
  try {
    const { name, phone, email: shopEmail, isActive, verificationStatus,
            'pricing.bwPerPage': bwPP, 'pricing.colorPerPage': colorPP } = req.body;

    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    if (name !== undefined) shop.name = name;
    if (phone !== undefined) shop.phone = phone;
    if (shopEmail !== undefined) shop.email = shopEmail;
    if (isActive !== undefined) shop.isActive = isActive;
    if (verificationStatus !== undefined) shop.verificationStatus = verificationStatus;
    if (bwPP !== undefined) shop.pricing.bwPerPage = Number(bwPP);
    if (colorPP !== undefined) shop.pricing.colorPerPage = Number(colorPP);

    // Apply from req.body directly if nested
    if (req.body.pricing) {
      if (req.body.pricing.bwPerPage !== undefined) shop.pricing.bwPerPage = Number(req.body.pricing.bwPerPage);
      if (req.body.pricing.colorPerPage !== undefined) shop.pricing.colorPerPage = Number(req.body.pricing.colorPerPage);
    }

    await shop.save();

    await logEvent('ADMIN_ACTION', {
      userId: req.user._id,
      shopId: shop._id,
      ...getRequestMeta(req),
      metadata: { action: 'EDIT_SHOP', shopName: shop.name }
    });

    res.json({ success: true, message: 'Shop updated.', data: shop });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/shops/:id/toggle-active ───────────────────
router.patch('/shops/:id/toggle-active', async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    shop.isActive = !shop.isActive;
    await shop.save();

    await logEvent('ADMIN_ACTION', {
      userId: req.user._id,
      shopId: shop._id,
      ...getRequestMeta(req),
      metadata: { action: 'TOGGLE_SHOP_ACTIVE', shopName: shop.name, newIsActive: shop.isActive }
    });

    res.json({
      success: true,
      message: `Shop "${shop.name}" is now ${shop.isActive ? 'Active' : 'Deactivated'}`,
      data: shop
    });
  } catch (err) { next(err); }
});

// ── POST /api/admin/shops/:id/manual-activate ─────────────────
/**
 * Separate explicit administrative override workflow to manually activate a shop.
 * Requires confirmation, reason, admin identity tracking, and immutable audit logging.
 * NEVER fakes a Razorpay payment. Creates a distinct MANUAL_ADMIN payment record.
 */
router.post('/shops/:id/manual-activate', async (req, res, next) => {
  try {
    const { reason, notes, durationDays = 30 } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        code: 'REASON_REQUIRED',
        message: 'A mandatory reason is required for manual administrative shop activation.'
      });
    }

    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ success: false, code: 'SHOP_NOT_FOUND', message: 'Shop not found.' });
    }

    const now = new Date();
    const days = Number(durationDays) || 30;
    const validUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const monthlyPrice = shop.subscription?.monthlyPrice || 499;

    // Create a distinct Payment record explicitly marking MANUAL_ADMIN
    const payment = new Payment({
      shopId: shop._id,
      type: 'SHOP_SUBSCRIPTION',
      amount: monthlyPrice,
      currency: 'INR',
      method: 'MANUAL',
      gateway: 'MANUAL_ADMIN',
      gatewayOrderId: `manual_override_${Date.now()}`,
      gatewayPaymentId: `admin_${req.user._id.toString().slice(-6)}_${Date.now()}`,
      paymentStatus: 'SUCCESS',
      paidAt: now,
      metadata: {
        activatedByAdminId: req.user._id,
        activatedByAdminEmail: req.user.email,
        activatedByAdminName: req.user.name,
        reason: reason.trim(),
        notes: notes ? notes.trim() : '',
        durationDays: days,
        isAdministrativeOverride: true
      }
    });
    await payment.save();

    // Transition shop and subscription states
    shop.status = 'ACTIVE';
    shop.isActive = true;
    if (!shop.subscription) shop.subscription = {};
    shop.subscription.status = 'ACTIVE';
    shop.subscription.startedAt = now;
    shop.subscription.validUntil = validUntil;
    shop.subscription.paymentId = payment._id;
    await shop.save();

    // Log explicit immutable audit event
    await logEvent('ADMIN_MANUAL_SHOP_ACTIVATION', {
      userId: req.user._id,
      shopId: shop._id,
      ...getRequestMeta(req),
      metadata: {
        adminEmail: req.user.email,
        adminName: req.user.name,
        shopName: shop.name,
        reason: reason.trim(),
        notes: notes ? notes.trim() : '',
        validUntil,
        paymentId: payment._id
      }
    });

    // Notify connected shopkeeper client in real-time
    const io = req.app.get('io');
    if (io) {
      io.to(`shop-${shop._id}`).emit('subscription-activated', {
        shopId: shop._id.toString(),
        shopStatus: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
        validUntil,
        source: 'MANUAL_ADMIN_OVERRIDE'
      });
    }

    res.json({
      success: true,
      message: `Shop "${shop.name}" has been manually activated via Administrative Override. Reason: ${reason.trim()}`,
      data: {
        shop,
        payment,
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
        validUntil
      }
    });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/admin/shops/:id/verify ─────────────────────────
router.patch('/shops/:id/verify', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['VERIFIED', 'SUSPENDED', 'REJECTED', 'PENDING'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    const shop = await Shop.findByIdAndUpdate(req.params.id, { verificationStatus: status }, { new: true });
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    await logEvent('SHOP_VERIFIED', {
      userId: req.user._id, shopId: shop._id, ...getRequestMeta(req),
      metadata: { newStatus: status }
    });

    res.json({ success: true, data: shop });
  } catch (err) { next(err); }
});

// ── POST /api/admin/users — create shopkeeper account ──────────
router.post('/users', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ success: false, message: 'Email already in use.' });

    const user = new User({ name, email, passwordHash: password, role: role || 'SHOPKEEPER' });
    await user.save();

    await logEvent('ADMIN_ACTION', {
      userId: req.user._id, ...getRequestMeta(req),
      metadata: { action: 'CREATE_USER', targetEmail: email }
    });

    res.status(201).json({
      success: true,
      data: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/users — list all users ─────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/users/:id — update user (reset pwd, toggle active) ──
router.patch('/users/:id', async (req, res, next) => {
  try {
    const { name, isActive, newPassword } = req.body;
    const user = await User.findById(req.params.id).select('+passwordHash');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (name !== undefined) user.name = name;
    if (isActive !== undefined) user.isActive = isActive;
    if (newPassword) {
      user.passwordHash = newPassword; // will be hashed by pre-save
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
    }
    await user.save();

    res.json({ success: true, message: 'User updated.', data: { id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive } });
  } catch (err) { next(err); }
});

// ── GET /api/admin/audit — security audit log ─────────────────
router.get('/audit', async (req, res, next) => {
  try {
    const { severity, eventType, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (severity) filter.severity = severity;
    if (eventType) filter.eventType = eventType;

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await AuditLog.countDocuments(filter);
    res.json({ success: true, data: logs, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (err) { next(err); }
});

module.exports = router;
