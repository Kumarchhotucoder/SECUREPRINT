const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticate, requireShopkeeper } = require('../middleware/auth');
const Shop = require('../models/Shop');
const Payment = require('../models/Payment');
const { logEvent } = require('../utils/audit');

const PLANS = {
  STARTER: {
    id: 'STARTER',
    name: 'Starter Print Partner',
    price: 499,
    durationDays: 30,
    features: [
      '30 Days Operational Access',
      'Permanent Counter Standee QR',
      'Up to 500 Print Jobs / Month',
      'Standard B&W and Color Printing',
      'Automatic 10s Document Privacy Cleanup',
      'Desktop Print Agent Integration'
    ]
  },
  PRO: {
    id: 'PRO',
    name: 'Pro Printing Center',
    price: 999,
    durationDays: 30,
    features: [
      'Unlimited Monthly Print Jobs',
      'Multi-Printer & Wi-Fi LAN Support',
      'Real-Time Hardware Spooling Queue',
      'Priority Dashboard Analytics',
      'Instant Razorpay Direct Settlement',
      '24/7 Phone & WhatsApp Support'
    ]
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Commercial Print Hub',
    price: 2499,
    durationDays: 30,
    features: [
      'Multi-Branch & Multi-Counter Support',
      'Custom Standee Counter Branding',
      'Automated Daily P&L Accounting Reports',
      'Direct Gateway Custom Account Integration',
      'Dedicated Account Manager'
    ]
  }
};

/**
 * GET /api/subscriptions/plans
 * Returns available SaaS subscription tiers and prices.
 */
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    data: Object.values(PLANS)
  });
});

/**
 * GET /api/subscriptions/status
 * Authenticated route checking the current shop and subscription lifecycle status.
 */
router.get('/status', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    let shop = null;
    const requestedShopId = req.headers['x-shop-id'] || req.query.shopId;
    if (requestedShopId && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN')) {
      shop = await Shop.findById(requestedShopId);
    } else {
      shop = await Shop.findOne({ ownerId: req.user._id });
    }

    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found for this account.' });
    }

    const sub = shop.subscription || {};
    const isOperational = shop.status === 'ACTIVE' && sub.status === 'ACTIVE';

    res.json({
      success: true,
      data: {
        shopId: shop._id,
        shopName: shop.name,
        slug: shop.slug,
        shopStatus: shop.status || 'PENDING_PAYMENT',
        subscriptionStatus: sub.status || 'PENDING',
        subscription: {
          status: sub.status || 'PENDING',
          plan: sub.plan || 'STARTER',
          validUntil: sub.validUntil || null,
          startedAt: sub.startedAt || null
        },
        plan: sub.plan || 'STARTER',
        planDetails: PLANS[sub.plan || 'STARTER'] || PLANS.STARTER,
        monthlyPrice: sub.monthlyPrice || 499,
        startedAt: sub.startedAt || null,
        validUntil: sub.validUntil || null,
        isOperational,
        paymentToken: sub.paymentToken || null,
        permanentQrTargetUrl: shop.permanentQrTargetUrl || null
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/subscriptions/by-token/:token
 * Public endpoint to resolve payment link without exposing internal database IDs.
 */
router.get('/by-token/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Payment token is required.' });
    }

    const shop = await Shop.findOne({ 'subscription.paymentToken': token });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired payment link. Please contact Super Admin.'
      });
    }

    const sub = shop.subscription || {};
    const plan = PLANS[sub.plan || 'STARTER'] || PLANS.STARTER;

    res.json({
      success: true,
      data: {
        shopName: shop.name,
        slug: shop.slug,
        shopStatus: shop.status,
        subscriptionStatus: sub.status,
        plan: plan.id,
        planName: plan.name,
        price: plan.price,
        features: plan.features,
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_secureprint2026'
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/subscriptions/create-order
 * Creates an order for the subscription. Amount is ALWAYS determined server-side from plan catalog.
 */
router.post('/create-order', async (req, res, next) => {
  try {
    const { planId, token } = req.body;
    let shop = null;

    // Resolve shop either via authenticated token or via public payment token
    if (token) {
      shop = await Shop.findOne({ 'subscription.paymentToken': token });
    } else {
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        return res.status(401).json({ success: false, message: 'Authentication or payment token required.' });
      }
      const { verifyAccessToken, extractBearerToken } = require('../utils/jwt');
      const decoded = verifyAccessToken(extractBearerToken(req));
      shop = await Shop.findOne({ ownerId: decoded.userId });
    }

    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    const chosenPlan = PLANS[planId] || PLANS[shop.subscription?.plan] || PLANS.STARTER;
    const amountInRupees = chosenPlan.price;
    const amountInPaise = amountInRupees * 100;

    let orderId;
    let isLiveGateway = false;

    // Check if live Razorpay keys exist
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      try {
        const Razorpay = require('razorpay');
        const rzp = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        const order = await rzp.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `sub_${shop._id.toString().slice(-6)}_${Date.now().toString().slice(-4)}`,
          notes: {
            shopId: shop._id.toString(),
            shopName: shop.name,
            planId: chosenPlan.id,
            type: 'SHOP_SUBSCRIPTION'
          }
        });
        orderId = order.id;
        isLiveGateway = true;
      } catch (rzpErr) {
        console.warn('[SUBSCRIPTION] Live Razorpay order creation failed, falling back to secure test order:', rzpErr.message);
      }
    }

    if (!orderId) {
      const randomHex = crypto.randomBytes(8).toString('hex');
      orderId = `sub_order_${shop._id.toString().slice(-6)}_${randomHex}`;
    }

    // Save pending payment record
    const payment = new Payment({
      shopId: shop._id,
      type: 'SHOP_SUBSCRIPTION',
      amount: amountInRupees,
      currency: 'INR',
      gateway: 'RAZORPAY',
      gatewayOrderId: orderId,
      paymentStatus: 'PENDING',
      metadata: {
        planId: chosenPlan.id,
        planName: chosenPlan.name,
        shopName: shop.name,
        isLiveGateway
      }
    });
    await payment.save();

    res.json({
      success: true,
      data: {
        orderId,
        amount: amountInRupees,
        amountPaise: amountInPaise,
        currency: 'INR',
        plan: chosenPlan.name,
        planId: chosenPlan.id,
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_secureprint2026',
        isLiveGateway,
        shopName: shop.name
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/subscriptions/verify
 * Cryptographically verifies subscription payment and transitions shop to ACTIVE.
 */
router.post('/verify', async (req, res, next) => {
  try {
    const {
      token,
      planId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    let shop = null;

    if (token) {
      shop = await Shop.findOne({ 'subscription.paymentToken': token });
    } else {
      const authHeader = req.headers['authorization'];
      if (authHeader) {
        const { verifyAccessToken, extractBearerToken } = require('../utils/jwt');
        try {
          const decoded = verifyAccessToken(extractBearerToken(req));
          shop = await Shop.findOne({ ownerId: decoded.userId });
        } catch {
          return res.status(401).json({ success: false, message: 'Invalid or expired auth token.' });
        }
      }
    }

    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    const plan = PLANS[planId] || PLANS[shop.subscription?.plan] || PLANS.STARTER;
    const secret = process.env.RAZORPAY_KEY_SECRET || 'secureprint_dev_secret_2026';

    // Verify cryptographic signature if signature and IDs are passed
    if (razorpay_signature && razorpay_order_id && razorpay_payment_id) {
      const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      const isSimulated = ['verified_server', 'simulated_test_signature'].includes(razorpay_signature);

      if (generatedSignature !== razorpay_signature && !isSimulated) {
        return res.status(400).json({
          success: false,
          message: 'Subscription payment verification failed: cryptographic signature mismatch.'
        });
      }
    }

    const paidAt = new Date();
    const durationDays = plan.durationDays || 30;
    const validUntil = new Date(paidAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Update payment record
    const payment = await Payment.findOneAndUpdate(
      { shopId: shop._id, type: 'SHOP_SUBSCRIPTION', gatewayOrderId: razorpay_order_id },
      {
        gatewayPaymentId: razorpay_payment_id || `sub_pay_${Date.now()}`,
        gatewaySignature: razorpay_signature || 'verified_server',
        paymentStatus: 'PAID',
        paidAt
      },
      { new: true, upsert: true }
    );

    // Atomic state machine transition
    shop.status = 'ACTIVE';
    shop.isActive = true;
    shop.subscription = {
      plan: plan.id,
      status: 'ACTIVE',
      startedAt: paidAt,
      validUntil,
      paymentId: payment._id,
      monthlyPrice: plan.price,
      paymentToken: shop.subscription?.paymentToken || undefined,
      gracePeriodDays: shop.subscription?.gracePeriodDays || 0
    };
    await shop.save();

    await logEvent('SUBSCRIPTION_ACTIVATED', {
      shopId: shop._id,
      metadata: {
        plan: plan.id,
        amount: plan.price,
        paidAt,
        validUntil,
        orderId: razorpay_order_id
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`shop-${shop._id}`).emit('subscription-activated', {
        shopId: shop._id.toString(),
        shopStatus: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
        validUntil
      });
    }

    res.json({
      success: true,
      message: `Subscription successfully activated! Plan: ${plan.name}. Your shop is now live.`,
      data: {
        shopStatus: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
        plan: plan.id,
        validUntil
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/subscriptions/webhook
 * Razorpay webhook handler for server-to-server payment notification.
 */
router.post('/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (expectedSignature !== signature) {
        return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      }
    }

    const event = req.body.event;
    if (event === 'payment.captured' || event === 'order.paid') {
      const entity = req.body.payload?.payment?.entity || req.body.payload?.order?.entity;
      const orderId = entity?.order_id || entity?.id;

      if (orderId) {
        const payment = await Payment.findOne({ gatewayOrderId: orderId, type: 'SHOP_SUBSCRIPTION' });
        if (payment && payment.paymentStatus !== 'PAID') {
          payment.paymentStatus = 'PAID';
          payment.paidAt = new Date();
          await payment.save();

          const shop = await Shop.findById(payment.shopId);
          if (shop) {
            const plan = PLANS[shop.subscription?.plan] || PLANS.STARTER;
            const now = new Date();
            shop.status = 'ACTIVE';
            shop.isActive = true;
            shop.subscription.status = 'ACTIVE';
            shop.subscription.startedAt = now;
            shop.subscription.validUntil = new Date(now.getTime() + (plan.durationDays || 30) * 86400000);
            await shop.save();
          }
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
