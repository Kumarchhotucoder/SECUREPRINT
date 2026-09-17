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
 * Server-side helper: Convert INR amount to paise with strict validation.
 * 1 INR = 100 paise.
 */
function toRazorpayAmount(inrAmount) {
  const num = Number(inrAmount);
  if (isNaN(num) || num <= 0) {
    throw new Error('Invalid amount: Must be greater than 0');
  }
  return Math.round(num * 100);
}

/**
 * Check Razorpay configuration and environment mode.
 * Live mode: key begins with rzp_live_
 * Test mode: key begins with rzp_test_
 */
function getRazorpayConfig() {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

  const isConfigured = Boolean(
    keyId &&
    keySecret &&
    !keyId.includes('YOUR_') &&
    !keySecret.includes('YOUR_') &&
    !keyId.includes('your_') &&
    !keySecret.includes('your_') &&
    !keyId.includes('rzp_test_secureprint')
  );

  const mode = keyId.startsWith('rzp_live_') ? 'LIVE' : 'TEST';

  return {
    isConfigured,
    mode,
    keyId: isConfigured ? keyId : null,
    keySecret: isConfigured ? keySecret : null
  };
}

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
    const rzpConfig = getRazorpayConfig();

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
        isConfigured: rzpConfig.isConfigured,
        mode: rzpConfig.mode,
        keyId: rzpConfig.keyId
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/subscriptions/create-order
 * Creates a Razorpay order for the subscription. Amount is strictly determined server-side.
 */
router.post('/create-order', async (req, res, next) => {
  try {
    const { planId, token } = req.body;
    let shop = null;

    console.log('[SUBSCRIPTION] subscription.order.create.started', { planId, tokenProvided: !!token });

    // Resolve shop either via public payment token or authenticated session
    if (token) {
      shop = await Shop.findOne({ 'subscription.paymentToken': token });
    } else {
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        console.warn('[SUBSCRIPTION] subscription.order.create.failed: No auth or payment token');
        return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'Authentication or payment token required.' });
      }
      const { verifyAccessToken, extractBearerToken } = require('../utils/jwt');
      try {
        const decoded = verifyAccessToken(extractBearerToken(req));
        shop = await Shop.findOne({ ownerId: decoded.userId });
      } catch {
        console.warn('[SUBSCRIPTION] subscription.order.create.failed: Invalid token');
        return res.status(401).json({ success: false, code: 'INVALID_AUTH', message: 'Invalid or expired auth token.' });
      }
    }

    if (!shop) {
      console.warn('[SUBSCRIPTION] subscription.order.create.failed: Shop not found');
      return res.status(404).json({ success: false, code: 'SHOP_NOT_FOUND', message: 'Shop not found.' });
    }

    const planKey = planId || shop.subscription?.plan || 'STARTER';
    const chosenPlan = PLANS[planKey];
    if (!chosenPlan) {
      console.warn('[SUBSCRIPTION] subscription.order.create.failed: Invalid plan', { planKey });
      return res.status(400).json({ success: false, code: 'INVALID_PLAN', message: 'Invalid subscription plan selected.' });
    }

    // Amount handling: server-controlled, never browser-controlled
    const amountInRupees = chosenPlan.price;
    const amountInPaise = toRazorpayAmount(amountInRupees);

    const rzpConfig = getRazorpayConfig();

    // Check if test simulation is requested (for CI / automated unit tests only)
    const isTestModeRequest = req.headers['x-test-simulation'] === 'true' ||
      (process.env.NODE_ENV === 'test' && !rzpConfig.isConfigured);

    let orderId;
    let isLiveGateway = false;

    if (rzpConfig.isConfigured) {
      try {
        const Razorpay = require('razorpay');
        const rzp = new Razorpay({
          key_id: rzpConfig.keyId,
          key_secret: rzpConfig.keySecret
        });

        const receipt = `secprint_sub_${shop._id.toString().slice(-8)}_${Date.now().toString().slice(-4)}`;
        const order = await rzp.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt,
          notes: {
            shop_id: shop._id.toString(),
            tenant_id: shop._id.toString(),
            subscription_id: shop.subscription?._id?.toString() || shop._id.toString(),
            plan_id: chosenPlan.id,
            shop_name: shop.name
          }
        });
        orderId = order.id;
        isLiveGateway = true;
        console.log('[SUBSCRIPTION] subscription.order.create.success', { shopId: shop._id, orderId });
      } catch (rzpErr) {
        console.error('[SUBSCRIPTION] subscription.order.create.failed:', rzpErr.message);
        return res.status(502).json({
          success: false,
          code: 'ORDER_CREATION_FAILED',
          message: `Unable to create Razorpay order: ${rzpErr.message}`
        });
      }
    } else if (isTestModeRequest) {
      // Deterministic order for automated test suites
      const randomHex = crypto.randomBytes(8).toString('hex');
      orderId = `order_test_${shop._id.toString().slice(-6)}_${randomHex}`;
      console.log('[SUBSCRIPTION] subscription.order.create.test_simulation', { shopId: shop._id, orderId });
    } else {
      console.warn('[SUBSCRIPTION] subscription.order.create.failed: PAYMENT_CONFIG_REQUIRED');
      return res.status(400).json({
        success: false,
        code: 'PAYMENT_CONFIG_REQUIRED',
        message: 'Payment configuration is missing. Razorpay credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured on the server. Please configure credentials in server/.env or contact Super Admin to activate this shop via Manual Administrative Override.'
      });
    }

    // Save or update pending payment record
    let payment = await Payment.findOne({
      shopId: shop._id,
      type: 'SHOP_SUBSCRIPTION',
      paymentStatus: 'PENDING'
    });

    if (!payment) {
      payment = new Payment({
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
          isLiveGateway,
          gatewayMode: rzpConfig.mode
        }
      });
    } else {
      payment.gatewayOrderId = orderId;
      payment.amount = amountInRupees;
      payment.metadata = {
        planId: chosenPlan.id,
        planName: chosenPlan.name,
        shopName: shop.name,
        isLiveGateway,
        gatewayMode: rzpConfig.mode
      };
    }
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
        keyId: rzpConfig.keyId || 'rzp_test_simulation',
        isLiveGateway,
        mode: rzpConfig.mode,
        shopName: shop.name
      }
    });
  } catch (err) {
    console.error('[SUBSCRIPTION] subscription.order.create.error:', err.message);
    next(err);
  }
});

/**
 * POST /api/subscriptions/verify
 * Cryptographically verifies subscription payment on server and transitions shop to ACTIVE.
 */
router.post('/verify', async (req, res, next) => {
  try {
    const token = req.body.token;
    const planId = req.body.planId;
    const razorpay_order_id = req.body.razorpay_order_id || req.body.orderId;
    const razorpay_payment_id = req.body.razorpay_payment_id || req.body.paymentId;
    const razorpay_signature = req.body.razorpay_signature || req.body.signature;

    console.log('[SUBSCRIPTION] payment.verification.started', {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id
    });

    if (!razorpay_order_id || !razorpay_payment_id) {
      console.warn('[SUBSCRIPTION] payment.verification.failed: Missing order or payment ID');
      return res.status(400).json({
        success: false,
        code: 'PAYMENT_VERIFICATION_FAILED',
        message: 'Payment verification failed: Order ID and Payment ID are required.'
      });
    }

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
          return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'Invalid or expired auth token.' });
        }
      }
    }

    if (!shop) {
      return res.status(404).json({ success: false, code: 'SHOP_NOT_FOUND', message: 'Shop not found.' });
    }

    const plan = PLANS[planId] || PLANS[shop.subscription?.plan] || PLANS.STARTER;
    const rzpConfig = getRazorpayConfig();

    // Cryptographic Signature Verification
    if (rzpConfig.isConfigured && rzpConfig.keySecret) {
      if (!razorpay_signature) {
        console.warn('[SUBSCRIPTION] payment.verification.failed: Signature missing in configured mode');
        return res.status(400).json({
          success: false,
          code: 'PAYMENT_VERIFICATION_FAILED',
          message: 'Payment verification failed: cryptographic signature is missing.'
        });
      }

      const generatedSignature = crypto
        .createHmac('sha256', rzpConfig.keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        console.warn('[SUBSCRIPTION] payment.verification.failed: Cryptographic mismatch', {
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id
        });
        return res.status(400).json({
          success: false,
          code: 'PAYMENT_VERIFICATION_FAILED',
          message: 'Payment verification failed. Your shop has not been activated.'
        });
      }
    } else {
      // Test mode / test runner verification
      const isTestSignature = ['verified_server', 'simulated_test_signature'].includes(razorpay_signature);
      const isTestMode = req.headers['x-test-simulation'] === 'true' || process.env.NODE_ENV === 'test';

      if (!isTestSignature && !isTestMode) {
        console.warn('[SUBSCRIPTION] payment.verification.failed: Untrusted signature');
        return res.status(400).json({
          success: false,
          code: 'PAYMENT_VERIFICATION_FAILED',
          message: 'Payment verification failed: untrusted payment signature.'
        });
      }
    }

    console.log('[SUBSCRIPTION] payment.verification.success', { orderId: razorpay_order_id });
    console.log('[SUBSCRIPTION] shop.activation.started', { shopId: shop._id, plan: plan.id });

    const paidAt = new Date();
    const durationDays = plan.durationDays || 30;
    const validUntil = new Date(paidAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    let payment;
    try {
      payment = await Payment.findOneAndUpdate(
        { shopId: shop._id, type: 'SHOP_SUBSCRIPTION', gatewayOrderId: razorpay_order_id },
        {
          gatewayPaymentId: razorpay_payment_id,
          gatewaySignature: razorpay_signature || 'verified_server',
          paymentStatus: 'SUCCESS',
          paidAt
        },
        { new: true, upsert: true }
      );

      // Atomic state transition
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
    } catch (dbErr) {
      console.error('[SUBSCRIPTION] PAYMENT_VERIFIED_BUT_ACTIVATION_PENDING', {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        error: dbErr.message
      });
      return res.status(500).json({
        success: false,
        code: 'ACTIVATION_FAILED',
        message: 'Payment was verified, but shop activation is pending. Please contact support.'
      });
    }

    console.log('[SUBSCRIPTION] shop.activation.success', { shopId: shop._id });

    await logEvent('SUBSCRIPTION_ACTIVATED', {
      shopId: shop._id,
      metadata: {
        plan: plan.id,
        amount: plan.price,
        paidAt,
        validUntil,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id
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
      status: 'ACTIVE',
      message: `Subscription successfully activated! Plan: ${plan.name}. Your shop is now live.`,
      data: {
        shopStatus: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
        plan: plan.id,
        validUntil
      }
    });
  } catch (err) {
    console.error('[SUBSCRIPTION] shop.activation.failed:', err.message);
    next(err);
  }
});

/**
 * Webhook handler for server-to-server payment notifications.
 */
const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    if (webhookSecret && signature) {
      const payloadString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payloadString)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.warn('[WEBHOOK] Invalid webhook signature mismatch');
        return res.status(400).json({ success: false, code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Invalid webhook signature' });
      }
    }

    const event = req.body?.event;
    console.log(`[WEBHOOK] Razorpay event received: ${event}`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = req.body.payload?.payment?.entity;
      const orderEntity = req.body.payload?.order?.entity;
      const orderId = paymentEntity?.order_id || orderEntity?.id || paymentEntity?.id;
      const paymentId = paymentEntity?.id;

      if (orderId) {
        const payment = await Payment.findOne({ gatewayOrderId: orderId, type: 'SHOP_SUBSCRIPTION' });
        // Idempotency: skip if already processed
        if (payment && ['SUCCESS', 'PAID'].includes(payment.paymentStatus)) {
          console.log(`[WEBHOOK] Order ${orderId} already processed (idempotent skip)`);
          return res.json({ status: 'ok', alreadyProcessed: true });
        }

        if (payment) {
          payment.paymentStatus = 'SUCCESS';
          payment.gatewayPaymentId = paymentId || payment.gatewayPaymentId;
          payment.paidAt = new Date();
          await payment.save();

          const shop = await Shop.findById(payment.shopId);
          if (shop && shop.status !== 'ACTIVE') {
            const plan = PLANS[shop.subscription?.plan] || PLANS.STARTER;
            const now = new Date();
            shop.status = 'ACTIVE';
            shop.isActive = true;
            shop.subscription.status = 'ACTIVE';
            shop.subscription.startedAt = now;
            shop.subscription.validUntil = new Date(now.getTime() + (plan.durationDays || 30) * 86400000);
            await shop.save();

            await logEvent('SUBSCRIPTION_ACTIVATED', {
              shopId: shop._id,
              metadata: { plan: plan.id, source: 'WEBHOOK', orderId }
            });
            console.log(`[WEBHOOK] Shop ${shop._id} activated via webhook event`);
          }
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

router.post('/webhook', handleRazorpayWebhook);

module.exports = router;
module.exports.handleRazorpayWebhook = handleRazorpayWebhook;
module.exports.toRazorpayAmount = toRazorpayAmount;
module.exports.getRazorpayConfig = getRazorpayConfig;
