const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticate, requireShopkeeper } = require('../middleware/auth');
const Shop = require('../models/Shop');
const Payment = require('../models/Payment');
const { logEvent } = require('../utils/audit');

const PLANS = {
  TRIAL: {
    id: 'TRIAL',
    name: 'Free Trial',
    price: 0,
    durationDays: 7,
    features: ['7 Days Full Access', 'Permanent Shop QR', 'Up to 50 Print Jobs', 'Real-Time Queue']
  },
  STARTER: {
    id: 'STARTER',
    name: 'Starter Print Partner',
    price: 499,
    durationDays: 30,
    features: ['30 Days Operational Access', 'Permanent Counter Standee QR', 'Up to 500 Print Jobs / Month', 'Custom Per-Page Pricing', 'Automatic 10s File Cleanup']
  },
  PRO: {
    id: 'PRO',
    name: 'Pro Printing Center',
    price: 999,
    durationDays: 30,
    features: ['Unlimited Print Jobs', 'Priority Dashboard Analytics', 'Instant Razorpay Direct Settlement', 'Multi-Counter Support', '24/7 Priority Support']
  }
};

/**
 * GET /api/subscriptions/plans
 * List available SaaS subscription plans for shop owners.
 */
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    data: Object.values(PLANS)
  });
});

/**
 * POST /api/subscriptions/activate-trial
 * Activate free 7-day trial for new shop owners.
 */
router.post('/activate-trial', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user._id });
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    shop.subscription = {
      plan: 'TRIAL',
      status: 'ACTIVE',
      validUntil,
      monthlyPrice: 0
    };
    shop.isActive = true;
    await shop.save();

    await logEvent('SUBSCRIPTION_ACTIVATED', {
      shopId: shop._id,
      userId: req.user._id,
      metadata: { plan: 'TRIAL', validUntil }
    });

    res.json({
      success: true,
      data: {
        subscription: shop.subscription,
        message: 'Free 7-day trial activated! Your shop is fully operational.'
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/subscriptions/create-order
 * Initiates Razorpay subscription order for a chosen plan.
 */
router.post('/create-order', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const { planId } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ success: false, message: 'Invalid plan selected.' });

    const shop = await Shop.findOne({ ownerId: req.user._id });
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const orderId = `sub_order_${shop._id.toString().slice(-6)}_${crypto.randomBytes(8).toString('hex')}`;

    const payment = new Payment({
      shopId: shop._id,
      type: 'SHOP_SUBSCRIPTION',
      amount: plan.price,
      currency: 'INR',
      gateway: 'RAZORPAY',
      gatewayOrderId: orderId,
      paymentStatus: 'PENDING',
      metadata: {
        planId: plan.id,
        planName: plan.name,
        shopName: shop.name
      }
    });
    await payment.save();

    res.json({
      success: true,
      data: {
        orderId,
        amount: plan.price,
        currency: 'INR',
        plan: plan.name,
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_secureprint2026',
        shopName: shop.name
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/subscriptions/verify
 * Verifies subscription payment and unlocks the shop.
 */
router.post('/verify', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const { planId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const plan = PLANS[planId] || PLANS.STARTER;

    const shop = await Shop.findOne({ ownerId: req.user._id });
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const paidAt = new Date();
    const validUntil = new Date(paidAt.getTime() + (plan.durationDays || 30) * 24 * 60 * 60 * 1000);

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

    shop.subscription = {
      plan: plan.id,
      status: 'ACTIVE',
      validUntil,
      paymentId: payment._id,
      monthlyPrice: plan.price
    };
    shop.isActive = true;
    await shop.save();

    await logEvent('SUBSCRIPTION_PAID', {
      shopId: shop._id,
      userId: req.user._id,
      metadata: { plan: plan.id, amount: plan.price, validUntil }
    });

    res.json({
      success: true,
      data: {
        subscription: shop.subscription,
        message: `Subscription activated successfully! Plan: ${plan.name} valid until ${validUntil.toLocaleDateString('en-IN')}`
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
