const Shop = require('../models/Shop');
const { logEvent, getRequestMeta } = require('../utils/audit');

/**
 * Reusable backend middleware enforcing active SaaS subscription entitlement.
 * Enforces:
 * 1. Authentication (req.user must be present)
 * 2. User role & tenant derivation
 * 3. Shop lifecycle status (ACTIVE)
 * 4. Subscription status (ACTIVE)
 * 5. Validity date & configurable grace period
 */
const requireActiveSubscription = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required.'
      });
    }

    // Super Admin has global bypass for platform operations
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
      return next();
    }

    // Find the shop owned by or associated with this user
    let shop = null;
    const requestedShopId = req.headers['x-shop-id'] || req.params.shopId || req.body?.shopId;

    if (requestedShopId) {
      shop = await Shop.findOne({ _id: requestedShopId, ownerId: req.user._id });
    }
    if (!shop) {
      shop = await Shop.findOne({ ownerId: req.user._id });
    }

    if (!shop) {
      return res.status(404).json({
        success: false,
        code: 'SHOP_NOT_FOUND',
        message: 'No shop associated with this account.'
      });
    }

    const now = new Date();
    const sub = shop.subscription || {};

    // Check expiration and grace period
    if (sub.validUntil) {
      const graceDays = sub.gracePeriodDays || parseInt(process.env.GRACE_PERIOD_DAYS || '0', 10);
      const expiryWithGrace = new Date(new Date(sub.validUntil).getTime() + (graceDays * 24 * 60 * 60 * 1000));

      if (now > expiryWithGrace && sub.status === 'ACTIVE') {
        // Automatically transition state to EXPIRED
        shop.status = 'EXPIRED';
        shop.subscription.status = 'EXPIRED';
        shop.isActive = false;
        await shop.save();

        await logEvent('SUBSCRIPTION_EXPIRED', {
          shopId: shop._id,
          userId: req.user._id,
          ...getRequestMeta(req),
          metadata: { validUntil: sub.validUntil, graceDays }
        }, 'WARNING');
      }
    }

    // State machine check
    const isShopActive = shop.status === 'ACTIVE';
    const isSubActive = sub.status === 'ACTIVE';

    if (!isShopActive || !isSubActive) {
      await logEvent('SUBSCRIPTION_GATE_BLOCKED', {
        shopId: shop._id,
        userId: req.user._id,
        ...getRequestMeta(req),
        metadata: {
          shopStatus: shop.status,
          subscriptionStatus: sub.status,
          path: req.originalUrl
        }
      }, 'INFO');

      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: shop.status === 'EXPIRED'
          ? 'Your SecurePrint subscription has expired. Please renew your subscription to continue.'
          : 'Active SecurePrint subscription required.',
        data: {
          shopId: shop._id,
          shopName: shop.name,
          shopStatus: shop.status,
          subscriptionStatus: sub.status,
          plan: sub.plan,
          validUntil: sub.validUntil,
          paymentToken: sub.paymentToken
        }
      });
    }

    // Attach verified shop to request context for downstream handlers
    req.shop = shop;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requireActiveSubscription };
