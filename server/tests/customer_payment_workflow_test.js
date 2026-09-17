const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:5001/api';

async function runPaymentWorkflowTest() {
  console.log('================================================================');
  console.log('   SECUREPRINT COMPLETE CUSTOMER PAYMENT WORKFLOW TEST SUITE   ');
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
    // 1. Setup Active Shop with Subscription
    // -------------------------------------------------------------
    console.log('--- STEP 1: Setup Test Shop & Activate Subscription ---');
    const unique = Date.now();
    const shopOwnerEmail = `pay_shop_${unique}@test.com`;
    const shopOwnerPassword = 'ShopkeeperPass123!';

    const regRes = await axios.post(`${BASE_URL}/auth/register-shop`, {
      name: `Pay Owner ${unique}`,
      shopName: `Speedy Print ${unique}`,
      email: shopOwnerEmail,
      password: shopOwnerPassword,
      phone: '9876543210',
      address: { street: '123 Market St', city: 'Delhi', state: 'Delhi', pincode: '110001' }
    });
    assert(regRes.status === 201, 'Shop registered successfully');
    const shopId = regRes.data.data.shopId;
    const slug = regRes.data.data.slug;

    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: shopOwnerEmail,
      password: shopOwnerPassword
    });
    const shopToken = loginRes.data.data.accessToken;
    const shopHeaders = { Authorization: `Bearer ${shopToken}` };

    // Activate subscription
    const subOrder = await axios.post(`${BASE_URL}/subscriptions/create-order`, { planId: 'PRO' }, { headers: shopHeaders });
    await axios.post(`${BASE_URL}/subscriptions/verify`, {
      planId: 'PRO',
      razorpay_order_id: subOrder.data.data.orderId,
      razorpay_payment_id: `sub_pay_${unique}`,
      razorpay_signature: 'verified_server'
    }, { headers: shopHeaders });
    assert(true, 'Shop subscription activated');

    // -------------------------------------------------------------
    // 2. Customer Session, Upload & Print Job Submission
    // -------------------------------------------------------------
    console.log('\n--- STEP 2: Customer Uploads Document & Submits Job ---');
    const sessionRes = await axios.post(`${BASE_URL}/sessions/start-by-slug`, { slug });
    assert(sessionRes.status === 201, 'Customer session started');
    const sessionId = sessionRes.data.data.sessionId;
    const sessionToken = sessionRes.data.data.sessionToken;
    const sessionHeaders = { 'x-session-token': sessionToken };

    // Upload sample PDF
    const dummyPdfPath = path.join(__dirname, 'fixtures', 'sample.pdf');
    fs.mkdirSync(path.dirname(dummyPdfPath), { recursive: true });
    if (!fs.existsSync(dummyPdfPath)) {
      fs.writeFileSync(dummyPdfPath, '%PDF-1.4\n%Test Document\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    }

    const form = new FormData();
    form.append('files', fs.createReadStream(dummyPdfPath), {
      filename: 'invoice.pdf',
      contentType: 'application/pdf'
    });

    const uploadRes = await axios.post(
      `${BASE_URL}/documents/sessions/${sessionId}/upload`,
      form,
      { headers: { ...form.getHeaders(), ...sessionHeaders } }
    );
    assert(uploadRes.status === 201, 'Customer document uploaded');
    const documentId = uploadRes.data.data[0].id;

    const jobRes = await axios.post(
      `${BASE_URL}/jobs`,
      {
        sessionId,
        copies: 2,
        colorMode: 'BW',
        paperSize: 'A4',
        customerName: 'Kunal'
      },
      { headers: sessionHeaders }
    );
    assert(jobRes.status === 201, 'Print job submitted');
    const jobId = jobRes.data.data.jobId;

    // -------------------------------------------------------------
    // 3. Strict Pre-Completion Payment Gating Verification
    // -------------------------------------------------------------
    console.log('\n--- STEP 3: Verify Payment Controls Blocked Before Printing Completed ---');

    // 3.1 Try creating online payment order before printing completed
    try {
      await axios.post(`${BASE_URL}/payments/create-order`, { jobId }, { headers: sessionHeaders });
      assert(false, 'Online payment blocked before printing completed', 'Expected 400 Bad Request');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.message?.includes('not available until'),
        'POST /payments/create-order blocked with clear wait message',
        err.response?.data?.message
      );
    }

    // 3.2 Try requesting cash payment before printing completed
    try {
      await axios.post(`${BASE_URL}/payments/request-cash`, { jobId }, { headers: sessionHeaders });
      assert(false, 'Cash payment blocked before printing completed', 'Expected 400 Bad Request');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.message?.includes('cannot be requested until'),
        'POST /payments/request-cash blocked with clear wait message',
        err.response?.data?.message
      );
    }

    // 3.3 Shopkeeper receives job
    const receiveRes = await axios.post(`${BASE_URL}/jobs/${jobId}/receive`, {}, { headers: shopHeaders });
    assert(receiveRes.status === 200, 'Shopkeeper receives document (status = RECEIVED)');

    // Still blocked from payment
    try {
      await axios.post(`${BASE_URL}/payments/create-order`, { jobId }, { headers: sessionHeaders });
      assert(false, 'Online payment blocked in RECEIVED status', 'Expected 400');
    } catch (err) {
      assert(err.response?.status === 400, 'Payment remains locked after shopkeeper receives document');
    }

    // 3.4 Shopkeeper starts printing
    const printRes = await axios.post(`${BASE_URL}/jobs/${jobId}/print`, {}, { headers: shopHeaders });
    assert(printRes.status === 200, 'Shopkeeper starts printing (status = PRINTING)');

    // Still blocked from payment
    try {
      await axios.post(`${BASE_URL}/payments/create-order`, { jobId }, { headers: sessionHeaders });
      assert(false, 'Online payment blocked in PRINTING status', 'Expected 400');
    } catch (err) {
      assert(err.response?.status === 400, 'Payment remains locked while printing is in progress');
    }

    // -------------------------------------------------------------
    // 4. Shopkeeper Marks "MARK PRINTING COMPLETED"
    // -------------------------------------------------------------
    console.log('\n--- STEP 4: Shopkeeper Marks PRINTING COMPLETED ---');
    const completeRes = await axios.post(
      `${BASE_URL}/jobs/${jobId}/complete`,
      { finalPrice: 20 },
      { headers: shopHeaders }
    );
    assert(completeRes.status === 200, 'POST /jobs/:id/complete returned HTTP 200');
    assert(completeRes.data.data.status === 'PRINTING_COMPLETED', 'Job status updated to PRINTING_COMPLETED');
    assert(completeRes.data.data.paymentStatus === 'AWAITING_PAYMENT', 'Payment status updated to AWAITING_PAYMENT');
    assert(completeRes.data.data.finalPrice === 20, 'Final price locked to ₹20');

    // Verify Customer Status Query reflects unlocked payment
    const checkJobRes = await axios.get(`${BASE_URL}/jobs/${jobId}`, { headers: sessionHeaders });
    assert(checkJobRes.data.data.status === 'PRINTING_COMPLETED', 'Customer query confirms PRINTING_COMPLETED');
    assert(checkJobRes.data.data.paymentStatus === 'AWAITING_PAYMENT', 'Customer query confirms AWAITING_PAYMENT');
    assert(!!checkJobRes.data.data.shopId.upiId, 'Shop response includes configured upiId', `UPI ID: ${checkJobRes.data.data.shopId.upiId}`);

    // -------------------------------------------------------------
    // 5. Cash Payment Workflow & Shopkeeper Authorization Guard
    // -------------------------------------------------------------
    console.log('\n--- STEP 5: Cash Payment Flow & Confirmation Security ---');

    // Customer requests cash payment
    const cashReqRes = await axios.post(`${BASE_URL}/payments/request-cash`, { jobId }, { headers: sessionHeaders });
    assert(cashReqRes.status === 200, 'POST /payments/request-cash returned HTTP 200');
    assert(cashReqRes.data.data.paymentStatus === 'CASH_PAYMENT_PENDING', 'Payment status is CASH_PAYMENT_PENDING');

    // Security check: Unauthenticated or customer cannot confirm own cash
    try {
      await axios.post(`${BASE_URL}/payments/confirm-cash`, { jobId }, { headers: sessionHeaders });
      assert(false, 'Customer blocked from confirming own cash payment', 'Expected 401 Unauthorized');
    } catch (err) {
      assert(err.response?.status === 401, 'Customer prevented from self-confirming cash payment (HTTP 401)');
    }

    // Security check: Cross-tenant shopkeeper cannot confirm cash
    const otherUnique = Date.now() + 1;
    const regBRes = await axios.post(`${BASE_URL}/auth/register-shop`, {
      name: `Shop B Owner ${otherUnique}`,
      shopName: `Competitor Print ${otherUnique}`,
      email: `other_${otherUnique}@test.com`,
      password: 'Password123!',
      phone: '9999999999'
    });
    const loginBRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: `other_${otherUnique}@test.com`,
      password: 'Password123!'
    });
    const shopBHeaders = { Authorization: `Bearer ${loginBRes.data.data.accessToken}` };
    const subBOrder = await axios.post(`${BASE_URL}/subscriptions/create-order`, { planId: 'PRO' }, { headers: shopBHeaders });
    await axios.post(`${BASE_URL}/subscriptions/verify`, {
      planId: 'PRO',
      razorpay_order_id: subBOrder.data.data.orderId,
      razorpay_payment_id: `sub_pay_${otherUnique}`,
      razorpay_signature: 'verified_server'
    }, { headers: shopBHeaders });

    try {
      await axios.post(`${BASE_URL}/payments/confirm-cash`, { jobId }, { headers: shopBHeaders });
      assert(false, 'Cross-tenant cash confirmation blocked', 'Expected 403 Forbidden');
    } catch (err) {
      assert(err.response?.status === 403, 'Cross-tenant shopkeeper blocked from confirming cash (HTTP 403)');
    }

    // Authorized shopkeeper confirms cash payment
    const confirmRes = await axios.post(`${BASE_URL}/payments/confirm-cash`, { jobId }, { headers: shopHeaders });
    assert(confirmRes.status === 200, 'Authorized shopkeeper confirms cash payment');
    assert(confirmRes.data.data.paymentStatus === 'PAID', 'Job paymentStatus updated to PAID');
    assert(confirmRes.data.data.status === 'PAYMENT_SUCCESS', 'Job status updated to PAYMENT_SUCCESS');

    // -------------------------------------------------------------
    // 6. Resilient 10-Second Physical Deletion & Privacy Protection
    // -------------------------------------------------------------
    console.log('\n--- STEP 6: 10-Second Physical File Deletion & Reprint Blocking ---');
    console.log('   Waiting 12 seconds for resilient background file unlinking...');
    await new Promise(r => setTimeout(r, 12000));

    const finalJobRes = await axios.get(`${BASE_URL}/jobs/${jobId}`, { headers: sessionHeaders });
    assert(finalJobRes.data.data.filesDeleted === true, 'Database confirms filesDeleted: true');

    // Attempt to access preview of deleted file
    try {
      await axios.get(`${BASE_URL}/jobs/${jobId}/preview`, { headers: sessionHeaders });
      assert(false, 'Preview of deleted file blocked', 'Expected 410 Gone');
    } catch (err) {
      assert(
        err.response?.status === 410 && err.response?.data?.error?.code === 'DOCUMENT_ALREADY_DELETED',
        'GET /jobs/:id/preview returns 410 Gone after auto-deletion'
      );
      assert(
        err.response?.data?.error?.message?.includes('deleted for privacy'),
        'Preview error includes privacy deletion message',
        err.response?.data?.error?.message
      );
    }

    // -------------------------------------------------------------
    // 7. Online Payment Gateway (Razorpay Flow) on Second Job
    // -------------------------------------------------------------
    console.log('\n--- STEP 7: Online Payment Gateway & Verification Flow ---');

    // Customer starts a fresh session to print another document (Section 24)
    const session2Res = await axios.post(`${BASE_URL}/sessions/start-by-slug`, { slug });
    assert(session2Res.status === 201, 'Customer starts fresh session for new document');
    const session2Id = session2Res.data.data.sessionId;
    const session2Token = session2Res.data.data.sessionToken;
    const session2Headers = { 'x-session-token': session2Token };

    // Create a second job for online payment test
    const form2 = new FormData();
    form2.append('files', fs.createReadStream(dummyPdfPath), {
      filename: 'thesis.pdf',
      contentType: 'application/pdf'
    });
    const uploadRes2 = await axios.post(
      `${BASE_URL}/documents/sessions/${session2Id}/upload`,
      form2,
      { headers: { ...form2.getHeaders(), ...session2Headers } }
    );
    const jobRes2 = await axios.post(
      `${BASE_URL}/jobs`,
      { sessionId: session2Id, copies: 1, colorMode: 'COLOR', customerName: 'Aarav' },
      { headers: session2Headers }
    );
    const job2Id = jobRes2.data.data.jobId;

    // Shopkeeper prints and marks complete
    await axios.post(`${BASE_URL}/jobs/${job2Id}/receive`, {}, { headers: shopHeaders });
    await axios.post(`${BASE_URL}/jobs/${job2Id}/print`, {}, { headers: shopHeaders });
    await axios.post(`${BASE_URL}/jobs/${job2Id}/complete`, { finalPrice: 15 }, { headers: shopHeaders });

    // Customer creates online payment order
    const orderRes = await axios.post(`${BASE_URL}/payments/create-order`, { jobId: job2Id }, { headers: sessionHeaders });
    assert(orderRes.status === 200, 'POST /payments/create-order succeeds after print completion');
    assert(orderRes.data.data.amount === 15, 'Order amount strictly matches server finalPrice (₹15)');
    const orderId2 = orderRes.data.data.orderId;

    // Tampered signature rejection
    try {
      await axios.post(`${BASE_URL}/payments/verify`, {
        jobId: job2Id,
        razorpay_order_id: orderId2,
        razorpay_payment_id: 'pay_fraud_123',
        razorpay_signature: 'invalid_tampered_signature_999'
      }, { headers: sessionHeaders });
      assert(false, 'Tampered payment signature rejected', 'Expected 400 Bad Request');
    } catch (err) {
      assert(err.response?.status === 400, 'Tampered signature rejected with HTTP 400');
    }

    // Legitimate signature verification
    const verifyRes2 = await axios.post(`${BASE_URL}/payments/verify`, {
      jobId: job2Id,
      razorpay_order_id: orderId2,
      razorpay_payment_id: `pay_legit_${unique}`,
      razorpay_signature: 'verified_server'
    }, { headers: sessionHeaders });
    assert(verifyRes2.status === 200, 'Legitimate payment verified successfully');
    assert(verifyRes2.data.data.paymentStatus === 'PAID', 'Job 2 paymentStatus updated to PAID');

    console.log('\n================================================================');
    console.log(`   TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL CUSTOMER PAYMENT WORKFLOW TESTS PASSED PERFECTLY!\n');
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

runPaymentWorkflowTest();
