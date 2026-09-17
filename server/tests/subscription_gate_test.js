const axios = require('axios');

const BASE_URL = 'http://localhost:5001/api';

async function runSubscriptionGateTest() {
  console.log('================================================================');
  console.log('   SECUREPRINT SHOP SUBSCRIPTION & ACCESS GATING TEST SUITE    ');
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
    // 1. Super Admin Login
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
    // 2. Super Admin Creates New Shop (Initial State Must Be PENDING_PAYMENT)
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
    // 3. Shopkeeper Login & Operational Gating Checks (403 Expected)
    // -------------------------------------------------------------
    console.log('\n--- STEP 3: Shopkeeper Login & Access Gating (Expect 403 SUBSCRIPTION_REQUIRED) ---');
    const shopkeeperLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: ownerEmail,
      password: ownerPassword
    });
    assert(shopkeeperLoginRes.status === 200, 'Shopkeeper can log in');
    const shopToken = shopkeeperLoginRes.data.data.accessToken;
    const shopHeaders = { Authorization: `Bearer ${shopToken}` };

    // Try accessing shop jobs (should be blocked)
    try {
      await axios.get(`${BASE_URL}/shops/${shopId}/jobs`, { headers: shopHeaders });
      assert(false, 'GET /shops/:id/jobs blocked for inactive shop', 'Expected 403 but got 200');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'SUBSCRIPTION_REQUIRED',
        'GET /shops/:id/jobs returned 403 SUBSCRIPTION_REQUIRED',
        `Status: ${err.response?.status}, Code: ${err.response?.data?.code}`
      );
    }

    // Try generating printer pairing code (should be blocked)
    try {
      await axios.post(`${BASE_URL}/printers/pairing-code`, {}, { headers: shopHeaders });
      assert(false, 'POST /printers/pairing-code blocked for inactive shop', 'Expected 403 but got 200');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'SUBSCRIPTION_REQUIRED',
        'POST /printers/pairing-code returned 403 SUBSCRIPTION_REQUIRED',
        `Status: ${err.response?.status}, Code: ${err.response?.data?.code}`
      );
    }

    // Try updating shop settings (should be blocked)
    try {
      await axios.put(`${BASE_URL}/shops/my`, { phone: '9999999999' }, { headers: shopHeaders });
      assert(false, 'PUT /shops/my blocked for inactive shop', 'Expected 403 but got 200');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'SUBSCRIPTION_REQUIRED',
        'PUT /shops/my returned 403 SUBSCRIPTION_REQUIRED',
        `Status: ${err.response?.status}, Code: ${err.response?.data?.code}`
      );
    }

    // Try generating QR code (should be blocked)
    try {
      await axios.post(`${BASE_URL}/shops/${shopId}/qr`, {}, { headers: shopHeaders });
      assert(false, 'POST /shops/:id/qr blocked for inactive shop', 'Expected 403 but got 200');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'SUBSCRIPTION_REQUIRED',
        'POST /shops/:id/qr returned 403 SUBSCRIPTION_REQUIRED',
        `Status: ${err.response?.status}, Code: ${err.response?.data?.code}`
      );
    }

    // -------------------------------------------------------------
    // 4. Customer Page & Session Blocking on Unpaid Shop
    // -------------------------------------------------------------
    console.log('\n--- STEP 4: Customer Flow on Inactive Shop ---');
    const customerShopRes = await axios.get(`${BASE_URL}/shops/by-slug/${slug}`);
    assert(
      customerShopRes.data?.data?.isInactive === true,
      'GET /shops/by-slug/:slug returns isInactive: true for unpaid shop'
    );
    assert(
      customerShopRes.data?.data?.message?.includes('not accepting print requests'),
      'GET /shops/by-slug/:slug returns standard not accepting prints message',
      `Message: ${customerShopRes.data?.data?.message}`
    );

    // Try starting session as customer (should fail with 503 SHOP_INACTIVE)
    try {
      await axios.post(`${BASE_URL}/sessions/start-by-slug`, { slug });
      assert(false, 'POST /sessions/start-by-slug blocked for unpaid shop', 'Expected 503 but got 200/201');
    } catch (err) {
      assert(
        err.response?.status === 503 && err.response?.data?.code === 'SHOP_INACTIVE',
        'POST /sessions/start-by-slug returns 503 SHOP_INACTIVE',
        `Status: ${err.response?.status}, Code: ${err.response?.data?.code}`
      );
    }

    // -------------------------------------------------------------
    // 5. Tokenized Subscription Payment Flow
    // -------------------------------------------------------------
    console.log('\n--- STEP 5: Tokenized Subscription Payment Flow ---');
    // Retrieve shop info via payment token
    const tokenInfoRes = await axios.get(`${BASE_URL}/subscriptions/by-token/${paymentToken}`);
    assert(tokenInfoRes.status === 200 && tokenInfoRes.data?.data?.shopName, 'Public payment token resolution succeeds');

    // Create subscription order via payment token (amount determined server-side for PRO plan: ₹999)
    const orderRes = await axios.post(`${BASE_URL}/subscriptions/create-order`, {
      token: paymentToken,
      planId: 'PRO'
    });
    assert(orderRes.status === 200, 'POST /subscriptions/create-order returned HTTP 200');
    assert(orderRes.data.data.amount === 999, 'Order amount strictly matches server PRO plan price (₹999)', `Amount: ${orderRes.data.data.amount}`);
    const orderId = orderRes.data.data.orderId;

    // Verify subscription payment (server-side transition)
    const verifyRes = await axios.post(`${BASE_URL}/subscriptions/verify`, {
      token: paymentToken,
      planId: 'PRO',
      razorpay_order_id: orderId,
      razorpay_payment_id: `sub_pay_${Date.now()}`,
      razorpay_signature: 'verified_server'
    });

    assert(verifyRes.status === 200, 'POST /subscriptions/verify returned HTTP 200');
    assert(verifyRes.data.data.shopStatus === 'ACTIVE', 'Shop status transitioned to ACTIVE', `Got: ${verifyRes.data.data.shopStatus}`);
    assert(verifyRes.data.data.subscriptionStatus === 'ACTIVE', 'Subscription status transitioned to ACTIVE', `Got: ${verifyRes.data.data.subscriptionStatus}`);

    // -------------------------------------------------------------
    // 6. Post-Payment Operational Verification (All Gates Open)
    // -------------------------------------------------------------
    console.log('\n--- STEP 6: Post-Payment Operational Verification ---');

    // Check subscription status endpoint
    const statusRes = await axios.get(`${BASE_URL}/subscriptions/status`, { headers: shopHeaders });
    assert(statusRes.status === 200 && statusRes.data.data.subscription?.status === 'ACTIVE', 'Subscription status endpoint confirms ACTIVE');

    // Shopkeeper accessing jobs now succeeds (HTTP 200)
    const jobsRes = await axios.get(`${BASE_URL}/shops/${shopId}/jobs`, { headers: shopHeaders });
    assert(jobsRes.status === 200, 'GET /shops/:id/jobs now succeeds with HTTP 200');

    // Shopkeeper generating pairing code now succeeds (HTTP 200)
    const pairingRes = await axios.post(`${BASE_URL}/printers/pairing-code`, {}, { headers: shopHeaders });
    assert(pairingRes.status === 200 && pairingRes.data.data.pairingCode, 'POST /printers/pairing-code now succeeds');

    // Customer page now active
    const customerActiveShopRes = await axios.get(`${BASE_URL}/shops/by-slug/${slug}`);
    assert(
      !customerActiveShopRes.data?.data?.isInactive,
      'GET /shops/by-slug/:slug now reflects ACTIVE shop (isInactive is falsy)'
    );

    // Customer session now successfully created (HTTP 201)
    const sessionRes = await axios.post(`${BASE_URL}/sessions/start-by-slug`, { slug });
    assert(sessionRes.status === 201 && sessionRes.data?.data?.sessionId, 'POST /sessions/start-by-slug now succeeds (HTTP 201)');

    console.log('\n================================================================');
    console.log(`   TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL SUBSCRIPTION GATING & ONBOARDING TESTS PASSED PERFECTLY!\n');
      process.exit(0);
    } else {
      console.error('⚠️ SOME TESTS FAILED!\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal Test Execution Error:', err.response?.data || err.message);
    process.exit(1);
  }
}

runSubscriptionGateTest();
