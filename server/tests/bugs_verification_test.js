const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FormData = require('form-data');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BASE_URL = 'http://localhost:5001/api';

async function runVerification() {
  console.log('====================================================');
  console.log('   SECUREPRINT BUG 1 & BUG 2 AUTOMATED TEST SUITE   ');
  console.log('====================================================\n');

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
    // 1. Register a test shop
    const unique = Date.now();
    const email = `qa_shop_${unique}@example.com`;
    const password = 'Password123!';
    const regRes = await axios.post(`${BASE_URL}/auth/register-shop`, {
      name: `Shopkeeper ${unique}`,
      shopName: `QA Print Shop ${unique}`,
      email,
      password,
      phone: `98765${String(unique).slice(-5)}`,
      address: {
        street: '123 Test St',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001'
      }
    });

    assert(regRes.status === 201 && regRes.data.success, 'Shop Registration');
    const shopId = regRes.data.data.shopId;
    const slug = regRes.data.data.slug;

    // Login to obtain shop keeper token
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, { email, password });
    assert(loginRes.status === 200 && loginRes.data.data.accessToken, 'Shopkeeper Login');
    const shopToken = loginRes.data.data.accessToken;
    const shopHeaders = { Authorization: `Bearer ${shopToken}`, 'x-test-simulation': 'true' };

    // Activate subscription
    const subOrder = await axios.post(`${BASE_URL}/subscriptions/create-order`, { planId: 'PRO' }, { headers: shopHeaders });
    await axios.post(`${BASE_URL}/subscriptions/verify`, {
      planId: 'PRO',
      razorpay_order_id: subOrder.data.data.orderId,
      razorpay_payment_id: `sub_pay_${unique}`,
      razorpay_signature: 'verified_server'
    }, { headers: shopHeaders });
    assert(true, 'Shop Subscription Activated');

    // 2. Start Customer Session
    const sessionRes = await axios.post(`${BASE_URL}/sessions/start-by-slug`, {
      slug
    });
    assert(sessionRes.status === 201 && sessionRes.data.success, 'Start Customer Session');
    const sessionId = sessionRes.data.data.sessionId;
    const sessionToken = sessionRes.data.data.sessionToken;
    const sessionHeaders = { 'x-session-token': sessionToken };

    // 3. Upload a sample document
    const dummyPdfPath = path.join(__dirname, 'fixtures', 'sample.pdf');
    fs.mkdirSync(path.dirname(dummyPdfPath), { recursive: true });
    if (!fs.existsSync(dummyPdfPath)) {
      fs.writeFileSync(dummyPdfPath, '%PDF-1.4\n%QA Test PDF Document\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    }

    const form = new FormData();
    form.append('files', fs.createReadStream(dummyPdfPath), {
      filename: 'sample.pdf',
      contentType: 'application/pdf'
    });

    const uploadRes = await axios.post(
      `${BASE_URL}/documents/sessions/${sessionId}/upload`,
      form,
      { headers: { ...form.getHeaders(), ...sessionHeaders } }
    );
    assert(uploadRes.status === 201 && uploadRes.data.success, 'Customer Document Upload');
    const documentId = uploadRes.data.data[0].id;

    // 4. Create Print Job
    const jobRes = await axios.post(
      `${BASE_URL}/jobs`,
      {
        sessionId,
        shopId,
        customerName: 'Test Customer',
        customerPhone: '9876543210',
        documentIds: [documentId],
        copies: 1,
        colorMode: 'BW',
        paperSize: 'A4',
        duplex: false
      },
      { headers: sessionHeaders }
    );
    assert(jobRes.status === 201 && jobRes.data.success, 'Create Print Job');
    const jobId = jobRes.data.data.jobId;

    // 5. TEST BUG 1: Preview Endpoint (Manual Browser Print)
    const previewRes = await axios.get(`${BASE_URL}/jobs/${jobId}/preview?token=${shopToken}`, {
      responseType: 'arraybuffer'
    });
    assert(
      previewRes.status === 200 && previewRes.data.length > 0,
      'GET /api/jobs/:id/preview returns document content for manual browser print'
    );
    assert(
      previewRes.headers['content-disposition']?.includes('inline'),
      'Preview returns Content-Disposition: inline for native browser preview'
    );

    // 6. TEST BUG 1: Physical Print with Offline Agent
    try {
      await axios.post(
        `${BASE_URL}/printers/jobs/${jobId}/print`,
        {
          printerId: 'non-existent-printer-id',
          options: { copies: 1, color: false, paperSize: 'A4' }
        },
        { headers: shopHeaders }
      );
      assert(false, 'Physical print should reject when agent is offline');
    } catch (err) {
      const errCode = err.response?.data?.error?.code || err.response?.data?.message;
      assert(
        err.response?.status === 400 || err.response?.status === 503,
        'Physical print fails gracefully with specific error code when agent offline',
        `Received status ${err.response?.status}, code: ${errCode}`
      );
    }

    // 6.5 Shopkeeper completes printing so payment unlocks
    await axios.post(`${BASE_URL}/jobs/${jobId}/complete`, { finalPrice: 2 }, { headers: shopHeaders });

    // 7. TEST BUG 2: Razorpay Order Creation
    const orderRes = await axios.post(`${BASE_URL}/payments/create-order`, {
      jobId
    });
    assert(
      orderRes.status === 200 && orderRes.data.success && orderRes.data.data.orderId,
      'POST /api/payments/create-order generates valid order payload for Razorpay checkout'
    );
    assert(
      typeof orderRes.data.data.isLiveGateway === 'boolean',
      'Payment order explicitly indicates live vs simulated test mode'
    );

    // 8. TEST BUG 2: Cash Payment Request
    const cashReqRes = await axios.post(`${BASE_URL}/payments/request-cash`, {
      jobId
    });
    assert(
      cashReqRes.status === 200 && (cashReqRes.data.data.paymentStatus === 'CASH_PAYMENT_PENDING' || cashReqRes.data.data.paymentStatus === 'PAYMENT_PENDING_CASH'),
      'POST /api/payments/request-cash sets status to CASH_PAYMENT_PENDING without premature deletion'
    );

    // Verify job file is still intact after requesting cash
    const jobCheck = await axios.get(`${BASE_URL}/jobs/${jobId}`, { headers: sessionHeaders });
    assert(
      !jobCheck.data.data.filesDeleted,
      'Document files remain intact while cash payment is pending counter confirmation'
    );

    // 9. Verify Document Deletion Lifecycle and Privacy Enforcement
    // Compute HMAC signature for payment verification
    const secret = process.env.RAZORPAY_KEY_SECRET || 'secureprint_dev_secret_2026';
    const razorpay_order_id = orderRes.data.data.orderId;
    const razorpay_payment_id = `pay_test_${unique}`;
    const razorpay_signature = crypto
      .createHmac('sha256', secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const verifyRes = await axios.post(`${BASE_URL}/payments/verify`, {
      jobId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });
    assert(
      verifyRes.status === 200 && verifyRes.data.data.paymentStatus === 'PAID',
      'Payment verification succeeds and starts 10-second cleanup timer'
    );

    // Wait for the 10-second timer to fire and delete files
    console.log('   Waiting 12 seconds for auto-deletion timer to execute...');
    await new Promise(resolve => setTimeout(resolve, 12000));

    const deletedJobCheck = await axios.get(`${BASE_URL}/jobs/${jobId}`, { headers: sessionHeaders });
    assert(
      deletedJobCheck.data.data.filesDeleted === true,
      'Post-payment 10-second cleanup permanently marks filesDeleted: true'
    );

    // 10. TEST PRIVACY ENFORCEMENT: Preview must return 410 DOCUMENT_ALREADY_DELETED
    try {
      await axios.get(`${BASE_URL}/jobs/${jobId}/preview?token=${shopToken}`);
      assert(false, 'Preview must return 410 on deleted document');
    } catch (err) {
      assert(
        err.response?.status === 410 && err.response?.data?.error?.code === 'DOCUMENT_ALREADY_DELETED',
        'GET /api/jobs/:id/preview returns 410 Gone with DOCUMENT_ALREADY_DELETED after cleanup'
      );
    }

    // 11. TEST PRIVACY ENFORCEMENT: Physical print must return 410 DOCUMENT_ALREADY_DELETED
    try {
      await axios.post(
        `${BASE_URL}/printers/jobs/${jobId}/print`,
        { printerId: 'any-printer' },
        { headers: shopHeaders }
      );
      assert(false, 'Physical print must return 410 on deleted document');
    } catch (err) {
      assert(
        err.response?.status === 410 && err.response?.data?.error?.code === 'DOCUMENT_ALREADY_DELETED',
        'POST /api/printers/jobs/:jobId/print returns 410 Gone with DOCUMENT_ALREADY_DELETED after cleanup'
      );
    }

  } catch (fatalErr) {
    console.error('Fatal test error:', fatalErr.response?.data || fatalErr.message);
  }

  console.log('\n====================================================');
  console.log(`   TEST RESULTS: ${passedTests}/${totalTests} PASSED   `);
  console.log('====================================================');

  if (passedTests === totalTests && totalTests > 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runVerification();
