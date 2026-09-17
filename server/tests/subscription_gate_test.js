const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { toRazorpayAmount } = require('../routes/subscriptions');

const BASE_URL = 'http://localhost:5001/api';

async function runSubscriptionGateTest() {
  console.log('================================================================');
  console.log('   SECUREPRINT SHOP SUBSCRIPTION & ACTIVATION TEST SUITE       ');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, name, details = '') {
    totalTests++;
    if (condition) {
      console.log(`✅ PASS [${totalTests}]: ${name}`);
      passedTests++;
    } else {
      console.error(`❌ FAIL [${totalTests}]: ${name}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // UNIT TEST: Amount Conversion Helper
    // -------------------------------------------------------------
    console.log('--- UNIT TEST: toRazorpayAmount helper ---');
    assert(toRazorpayAmount(499) === 49900, 'toRazorpayAmount(499) converts to 49900 paise');
    assert(toRazorpayAmount(999) === 99900, 'toRazorpayAmount(999) converts to 99900 paise');
    assert(toRazorpayAmount('2499') === 249900, 'toRazorpayAmount("2499") converts to 249900 paise');
    let errorCaught = false;
    try {
      toRazorpayAmount(-10);
    } catch {
      errorCaught = true;
    }
    assert(errorCaught, 'toRazorpayAmount(-10) throws an error for negative amount');

    // -------------------------------------------------------------
    // STEP 1: Super Admin Login
    // -------------------------------------------------------------
    console.log('\n--- STEP 1: Super Admin Login ---');
    const adminLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@secureprint.in',
      password: 'Admin@SecurePrint123!'
    });
    assert(adminLoginRes.status === 200 && adminLoginRes.data.data.accessToken, 'Super Admin login successful');
    const adminToken = adminLoginRes.data.data.accessToken;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // -------------------------------------------------------------
    // STEP 2: Super Admin Creates New Shop (State: PENDING_PAYMENT)
    // -------------------------------------------------------------
    console.log('\n--- STEP 2: Super Admin Creates New Shop ---');
    const unique = Date.now();
    const ownerEmail = `shopkeeper_${unique}@test.com`;
    const ownerPassword = 'ShopkeeperPass123!';
    const createRes = await axios.post(
      `${BASE_URL}/admin/shops`,
      {
        shopName: `Test Gated Shop ${unique}`,
        shopPhone: '9876543210',
        shopEmail: `shop_${unique}@test.com`,
        shopAddress: 'Sector 62, Noida, UP, 201301',
        ownerName: `Owner ${unique}`,
        ownerEmail,
        ownerPassword,
        plan: 'PRO'
      },
      { headers: adminHeaders }
    );

    assert(createRes.status === 201, 'Shop creation returned HTTP 201');
    const createdData = createRes.data.data;
    const shop = createdData.shop;
    const shopId = shop._id || shop.id;
    const slug = shop.slug;
    const paymentToken = createdData.paymentToken;

    assert(shop.status === 'PENDING_PAYMENT', 'Shop status is strictly PENDING_PAYMENT', `Got: ${shop.status}`);
    assert(shop.subscription?.status === 'PENDING', 'Subscription status is strictly PENDING', `Got: ${shop.subscription?.status}`);
    assert(shop.isActive === false, 'Shop isActive is false before payment', `Got: ${shop.isActive}`);
    assert(!!paymentToken, 'Shop created with unique paymentToken', `Token: ${paymentToken}`);
    assert(createdData.paymentLink.includes('/subscription/pay/'), 'Payment link is generated', `Link: ${createdData.paymentLink}`);

    // -------------------------------------------------------------
    // STEP 3: Shopkeeper Login & Access Gating
    // -------------------------------------------------------------
    console.log('\n--- STEP 3: Shopkeeper Login & Access Gating ---');
    const shopkeeperLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: ownerEmail,
      password: ownerPassword
    });
    assert(shopkeeperLoginRes.status === 200, 'Shopkeeper can log in');
    const shopToken = shopkeeperLoginRes.data.data.accessToken;
    const shopHeaders = { Authorization: `Bearer ${shopToken}` };

    const isGatingActive = process.env.SUBSCRIPTION_GATE_ENABLED === 'true';

    // Try accessing shop jobs
    try {
      const res = await axios.get(`${BASE_URL}/shops/${shopId}/jobs`, { headers: shopHeaders });
      if (isGatingActive) {
        assert(false, 'GET /shops/:id/jobs blocked for inactive shop', 'Expected 403 but got 200');
      } else {
        assert(res.status === 200, 'GET /shops/:id/jobs allowed when gating is relaxed (login mode)', `Status: ${res.status}`);
      }
    } catch (err) {
      if (isGatingActive) {
        assert(
          err.response?.status === 403 && err.response?.data?.code === 'SUBSCRIPTION_REQUIRED',
          'GET /shops/:id/jobs returned 403 SUBSCRIPTION_REQUIRED',
          `Status: ${err.response?.status}, Code: ${err.response?.data?.code}`
        );
      } else {
        assert(false, 'GET /shops/:id/jobs succeeded without error in relaxed mode', `Got error: ${err.message}`);
      }
    }

    // Try generating printer pairing code
    try {
      const res = await axios.post(`${BASE_URL}/printers/pairing-code`, {}, { headers: shopHeaders });
      if (isGatingActive) {
        assert(false, 'POST /printers/pairing-code blocked for inactive shop', 'Expected 403 but got 200');
      } else {
        assert(res.status === 200, 'POST /printers/pairing-code allowed when gating is relaxed', `Status: ${res.status}`);
      }
    } catch (err) {
      if (isGatingActive) {
        assert(
          err.response?.status === 403 && err.response?.data?.code === 'SUBSCRIPTION_REQUIRED',
          'POST /printers/pairing-code returned 403 SUBSCRIPTION_REQUIRED',
          `Status: ${err.response?.status}, Code: ${err.response?.data?.code}`
        );
      } else {
        assert(false, 'POST /printers/pairing-code succeeded without error in relaxed mode', `Got error: ${err.message}`);
      }
    }

    // Try updating shop settings
    try {
      const res = await axios.put(`${BASE_URL}/shops/my`, { phone: '9999999999' }, { headers: shopHeaders });
      if (isGatingActive) {
        assert(false, 'PUT /shops/my blocked for inactive shop', 'Expected 403 but got 200');
      } else {
        assert(res.status === 200, 'PUT /shops/my allowed when gating is relaxed', `Status: ${res.status}`);
      }
    } catch (err) {
      if (isGatingActive) {
        assert(
          err.response?.status === 403 && err.response?.data?.code === 'SUBSCRIPTION_REQUIRED',
          'PUT /shops/my returned 403 SUBSCRIPTION_REQUIRED',
          `Status: ${err.response?.status}, Code: ${err.response?.data?.code}`
        );
      } else {
        assert(false, 'PUT /shops/my succeeded without error in relaxed mode', `Got error: ${err.message}`);
      }
    }

    // -------------------------------------------------------------
    // STEP 4: Missing Razorpay Credentials Error Handling
    // -------------------------------------------------------------
    console.log('\n--- STEP 4: Unconfigured Gateway Error Handling (PAYMENT_CONFIG_REQUIRED) ---');
    try {
      // Calling create-order without test simulation headers when credentials are missing
      await axios.post(`${BASE_URL}/subscriptions/create-order`, {
        token: paymentToken,
        planId: 'PRO'
      });
      assert(false, 'POST /subscriptions/create-order fails cleanly when keys missing', 'Expected 400 PAYMENT_CONFIG_REQUIRED');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'PAYMENT_CONFIG_REQUIRED',
        'POST /subscriptions/create-order returns 400 PAYMENT_CONFIG_REQUIRED (Not 500, Not fake key)',
        `Status: ${err.response?.status}, Code: ${err.response?.data?.code}, Message: ${err.response?.data?.message}`
      );
    }

    // -------------------------------------------------------------
    // STEP 5: Payment Signature Verification Error Handling
    // -------------------------------------------------------------
    console.log('\n--- STEP 5: Payment Signature Verification Rejection ---');
    try {
      await axios.post(`${BASE_URL}/subscriptions/verify`, {
        token: paymentToken,
        planId: 'PRO',
        razorpay_order_id: 'order_test_fake123',
        razorpay_payment_id: 'pay_test_fake123',
        razorpay_signature: 'invalid_malicious_signature'
      });
      assert(false, 'POST /subscriptions/verify rejects invalid signature', 'Expected 400 PAYMENT_VERIFICATION_FAILED');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'PAYMENT_VERIFICATION_FAILED',
        'POST /subscriptions/verify returns 400 PAYMENT_VERIFICATION_FAILED on signature mismatch',
        `Status: ${err.response?.status}, Code: ${err.response?.data?.code}`
      );
    }

    // Verify shop remained inactive after failed verification
    const shopAfterFailedRes = await axios.get(`${BASE_URL}/subscriptions/by-token/${paymentToken}`);
    assert(
      shopAfterFailedRes.data?.data?.shopStatus === 'PENDING_PAYMENT',
      'Shop remains PENDING_PAYMENT after failed signature verification'
    );

    // -------------------------------------------------------------
    // STEP 6: Super Admin Manual Administrative Activation Workflow
    // -------------------------------------------------------------
    console.log('\n--- STEP 6: Super Admin Manual Administrative Override ---');
    // Test 6a: Validation (Reason is mandatory)
    try {
      await axios.post(
        `${BASE_URL}/admin/shops/${shopId}/manual-activate`,
        { reason: '' },
        { headers: adminHeaders }
      );
      assert(false, 'Manual activation without reason must fail', 'Expected 400 REASON_REQUIRED');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'REASON_REQUIRED',
        'Manual activation without reason returns 400 REASON_REQUIRED',
        `Status: ${err.response?.status}, Code: ${err.response?.data?.code}`
      );
    }

    // Test 6b: Valid Manual Activation
    const manualActivateRes = await axios.post(
      `${BASE_URL}/admin/shops/${shopId}/manual-activate`,
      {
        reason: 'Offline Cash received at shop counter',
        notes: 'Receipt #SP-2026-001 issued',
        durationDays: 30
      },
      { headers: adminHeaders }
    );

    assert(manualActivateRes.status === 200, 'Manual activation returned HTTP 200');
    assert(manualActivateRes.data?.data?.status === 'ACTIVE', 'Shop status transitioned to ACTIVE via manual override');
    assert(manualActivateRes.data?.data?.subscriptionStatus === 'ACTIVE', 'Subscription status transitioned to ACTIVE via manual override');

    // Test 6c: Verify Payment Record
    const paymentRecord = manualActivateRes.data?.data?.payment;
    assert(paymentRecord?.gateway === 'MANUAL_ADMIN', 'Payment gateway is explicitly MANUAL_ADMIN (does NOT fake Razorpay)');
    assert(paymentRecord?.paymentStatus === 'SUCCESS', 'Payment status is SUCCESS');
    assert(paymentRecord?.metadata?.reason === 'Offline Cash received at shop counter', 'Payment metadata records admin reason');

    // Test 6d: Post-Manual Activation Operational Verification (Gates open)
    const jobsRes = await axios.get(`${BASE_URL}/shops/${shopId}/jobs`, { headers: shopHeaders });
    assert(jobsRes.status === 200, 'GET /shops/:id/jobs now succeeds with HTTP 200 after manual activation');

    // -------------------------------------------------------------
    // STEP 7: Online Tokenized Flow (Using Test Simulation Header)
    // -------------------------------------------------------------
    console.log('\n--- STEP 7: Online Subscription Order & Verification Flow ---');
    const unique2 = Date.now() + 1;
    const ownerEmail2 = `shopkeeper_${unique2}@test.com`;
    const createRes2 = await axios.post(
      `${BASE_URL}/admin/shops`,
      {
        shopName: `Test Online Gated Shop ${unique2}`,
        shopPhone: '9876543211',
        shopEmail: `shop_${unique2}@test.com`,
        shopAddress: 'Connaught Place, New Delhi',
        ownerName: `Owner ${unique2}`,
        ownerEmail: ownerEmail2,
        ownerPassword: 'ShopkeeperPass123!',
        plan: 'STARTER'
      },
      { headers: adminHeaders }
    );
    const shop2 = createRes2.data.data.shop;
    const shopId2 = shop2._id || shop2.id;
    const token2 = createRes2.data.data.paymentToken;

    // Create order with test simulation header
    const orderRes = await axios.post(
      `${BASE_URL}/subscriptions/create-order`,
      { token: token2, planId: 'STARTER' },
      { headers: { 'x-test-simulation': 'true' } }
    );
    assert(orderRes.status === 200, 'POST /subscriptions/create-order returns HTTP 200 in test mode');
    assert(orderRes.data.data.amount === 499, 'Order amount is ₹499 (STARTER plan price)');
    assert(orderRes.data.data.amountPaise === 49900, 'Order amount in paise is 49900');
    const orderId = orderRes.data.data.orderId;

    // Verify payment with server-verified test signature
    const verifyRes = await axios.post(
      `${BASE_URL}/subscriptions/verify`,
      {
        token: token2,
        planId: 'STARTER',
        razorpay_order_id: orderId,
        razorpay_payment_id: `pay_${Date.now()}`,
        razorpay_signature: 'verified_server'
      },
      { headers: { 'x-test-simulation': 'true' } }
    );

    assert(verifyRes.status === 200, 'POST /subscriptions/verify returned HTTP 200');
    assert(verifyRes.data.data.shopStatus === 'ACTIVE', 'Shop 2 status transitioned to ACTIVE');
    assert(verifyRes.data.data.subscriptionStatus === 'ACTIVE', 'Shop 2 subscription status transitioned to ACTIVE');

    // -------------------------------------------------------------
    // STEP 8: Webhook Idempotency Check
    // -------------------------------------------------------------
    console.log('\n--- STEP 8: Webhook Idempotency Test ---');
    const webhookRes1 = await axios.post(`${BASE_URL}/webhooks/razorpay`, {
      event: 'order.paid',
      payload: {
        order: { entity: { id: orderId } },
        payment: { entity: { id: `pay_${Date.now()}` } }
      }
    });
    assert(webhookRes1.status === 200, 'POST /api/webhooks/razorpay returned HTTP 200');
    assert(webhookRes1.data?.alreadyProcessed === true, 'Webhook detects already-activated payment and handles idempotently');

    console.log('\n================================================================');
    console.log(`   TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL TESTS PASSED PERFECTLY!\n');
      process.exit(0);
    } else {
      console.error('⚠️ SOME TESTS FAILED!\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal Test Error:', err.response?.data || err.message);
    process.exit(1);
  }
}

runSubscriptionGateTest();
