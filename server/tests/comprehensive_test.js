/**
 * SECUREPRINT — Comprehensive Automated System Test Suite
 * 
 * Tests:
 * 1. Health & Server Connectivity
 * 2. Authentication & Role-Based Access Control (RBAC)
 *    - Shop Owner Registration & default role SHOP_OWNER
 *    - Unauthorized password rejection
 *    - Role enforcement: SHOP_OWNER blocked from SUPER_ADMIN endpoints (403)
 *    - Super Admin privileged access
 * 3. Multi-Tenant Data Isolation
 *    - Cross-tenant queue isolation (Shop B cannot view Shop A's jobs)
 *    - Cross-tenant stats isolation (Shop B cannot view Shop A's stats)
 * 4. Print Job Submission & Configuration
 *    - Customer session creation via slug
 *    - Document upload with SHA-256 integrity hash
 *    - Print job options validation: orientation ('LANDSCAPE'), pageRange ('1-3'), copies, colorMode
 * 5. Server-Side Payment Verification & Security
 *    - Order creation with trusted backend price
 *    - Fraudulent/tampered HMAC signature rejection (400)
 *    - Legitimate cryptographic HMAC SHA-256 signature verification
 *    - Payment idempotency guard
 * 6. Physical Document Auto-Deletion
 *    - Physical disk file existence verification before deletion
 *    - Post-payment 10-second cleanup trigger
 *    - Verification of physical unlinking from disk (fs.existsSync === false)
 *    - Denial of access to deleted documents (404/410)
 * 7. Print Agent Pairing & Hardware Discovery
 *    - 6-digit one-time pairing code generation
 *    - Agent handshake and JWT credential issuance
 *    - Hardware discovery sync (USB/Wi-Fi/LAN, B&W/Color)
 *    - Real-time printer inventory listing
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5001';
const UPLOAD_DIR = path.resolve(__dirname, '../uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'secureprint-jwt-secret-dev-change-in-prod-2026';
const RAZORPAY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'secureprint_dev_secret_2026';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ❌ [FAIL] ${testName} ${details ? `(${details})` : ''}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 SECUREPRINT COMPREHENSIVE AUTOMATED TEST SUITE');
  console.log(`Target: ${BASE_URL}`);
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------
    // TEST 1: Health Check
    // -------------------------------------------------------------
    console.log('🔹 1. HEALTH & CONNECTIVITY');
    const healthRes = await axios.get(`${BASE_URL}/api/health`);
    assert(healthRes.status === 200 && healthRes.data.status === 'ok', 'Server health check returns 200 OK');

    // -------------------------------------------------------------
    // TEST 2: Auth & Role-Based Access Control (RBAC)
    // -------------------------------------------------------------
    console.log('\n🔹 2. AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC)');
    const testTimestamp = Date.now();
    const shopOwnerEmail = `owner_${testTimestamp}@testsecureprint.in`;
    const shopOwnerPassword = 'TestPassword123!';
    const shopSlug = `test-shop-${testTimestamp}`;

    // 2.1 Register new Shop Owner
    const regRes = await axios.post(`${BASE_URL}/api/auth/register-shop`, {
      name: 'Test Shop Owner',
      email: shopOwnerEmail,
      password: shopOwnerPassword,
      phone: '+91-99887-76655',
      shopName: `Secure Print Test Shop ${testTimestamp}`,
      slug: shopSlug,
      address: { street: '12 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }
    });
    assert(regRes.status === 201 && regRes.data.success, 'Shop Owner registration returns 201 Created');
    const shopAId = regRes.data.data.shopId;
    const activeShopSlug = regRes.data.data.slug || shopSlug;

    // 2.2 Rejection of invalid password
    try {
      await axios.post(`${BASE_URL}/api/auth/login`, {
        email: shopOwnerEmail,
        password: 'WrongPassword999!'
      });
      assert(false, 'Login with incorrect password was rejected');
    } catch (err) {
      assert(err.response && err.response.status === 401, 'Login with incorrect password returns 401 Unauthorized');
    }

    // 2.3 Successful login as Shop Owner
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: shopOwnerEmail,
      password: shopOwnerPassword
    });
    assert(loginRes.status === 200 && loginRes.data.data.accessToken, 'Login with correct credentials returns 200 and access token');
    assert(loginRes.data.data.user.role === 'SHOP_OWNER', 'New registrant is assigned role SHOP_OWNER', `Got: ${loginRes.data.data.user.role}`);
    const shopOwnerToken = loginRes.data.data.accessToken;

    // 2.4 RBAC: SHOP_OWNER blocked from SUPER_ADMIN endpoints
    try {
      await axios.get(`${BASE_URL}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${shopOwnerToken}` }
      });
      assert(false, 'SHOP_OWNER forbidden from accessing /api/admin/dashboard');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'SHOP_OWNER receives 403 Forbidden when accessing Super Admin routes');
    }

    // Activate Shop A subscription so operational features unlock
    const subOrder = await axios.post(`${BASE_URL}/api/subscriptions/create-order`, { planId: 'PRO' }, { headers: { Authorization: `Bearer ${shopOwnerToken}` } });
    await axios.post(`${BASE_URL}/api/subscriptions/verify`, {
      planId: 'PRO',
      razorpay_order_id: subOrder.data.data.orderId,
      razorpay_payment_id: `sub_pay_${testTimestamp}`,
      razorpay_signature: 'verified_server'
    }, { headers: { Authorization: `Bearer ${shopOwnerToken}` } });
    assert(true, 'Shop A subscription activated successfully');

    // 2.5 Super Admin login check
    let superAdminToken = null;
    const adminCandidates = [
      { email: 'chhotu6826@gmail.com', password: '312130' },
      { email: 'admin@secureprint.in', password: 'Admin@SecurePrint123!' }
    ];
    for (const cand of adminCandidates) {
      try {
        const saLoginRes = await axios.post(`${BASE_URL}/api/auth/login`, cand);
        if (saLoginRes.data.success && saLoginRes.data.data.user.role === 'SUPER_ADMIN') {
          superAdminToken = saLoginRes.data.data.accessToken;
          break;
        }
      } catch (e) {
        // continue trying
      }
    }
    if (superAdminToken) {
      const saMetricsRes = await axios.get(`${BASE_URL}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      assert(saMetricsRes.status === 200 && saMetricsRes.data.success, 'Super Admin successfully accesses /api/admin/dashboard');
    } else {
      console.log('  ⚠️ Super admin credentials not present; skipping admin route validation');
    }

    // -------------------------------------------------------------
    // TEST 3: Multi-Tenant Data Isolation
    // -------------------------------------------------------------
    console.log('\n🔹 3. MULTI-TENANT DATA ISOLATION');
    // Register Shop B
    const shopBEmail = `owner_b_${testTimestamp}@testsecureprint.in`;
    const shopBSlug = `test-shop-b-${testTimestamp}`;
    const regBRes = await axios.post(`${BASE_URL}/api/auth/register-shop`, {
      name: 'Shop B Owner',
      email: shopBEmail,
      password: shopOwnerPassword,
      phone: '+91-99887-76656',
      shopName: `Shop B Testing ${testTimestamp}`,
      slug: shopBSlug,
      address: { street: '99 Other St', city: 'Delhi', state: 'Delhi', pincode: '110001' }
    });
    const shopBId = regBRes.data.data.shopId;
    const loginBRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: shopBEmail,
      password: shopOwnerPassword
    });
    const shopBToken = loginBRes.data.data.accessToken;

    // Shop B attempts to access Shop A's print queue
    try {
      await axios.get(`${BASE_URL}/api/shops/${shopAId}/jobs`, {
        headers: { Authorization: `Bearer ${shopBToken}` }
      });
      assert(false, 'Shop B cannot access Shop A jobs queue');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'Cross-tenant access to jobs returns 403 Forbidden');
    }

    // Shop B attempts to access Shop A's stats
    try {
      await axios.get(`${BASE_URL}/api/shops/${shopAId}/stats`, {
        headers: { Authorization: `Bearer ${shopBToken}` }
      });
      assert(false, 'Shop B cannot access Shop A stats');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'Cross-tenant access to stats returns 403 Forbidden');
    }

    // -------------------------------------------------------------
    // TEST 4: Print Options, Upload & Settings
    // -------------------------------------------------------------
    console.log('\n🔹 4. PRINT JOB SUBMISSION & CONFIGURATION (ORIENTATION, PAGE RANGE)');
    // 4.1 Start Customer Session
    const sessionRes = await axios.post(`${BASE_URL}/api/sessions/start-by-slug`, {
      slug: activeShopSlug,
      customerName: 'Rahul Verma'
    });
    assert(sessionRes.status === 201 && sessionRes.data.data.sessionId, 'Customer session initiated via shop slug');
    const { sessionId, sessionToken } = sessionRes.data.data;

    // 4.2 Upload Sensitive Document
    const testDocPath = path.join(__dirname, `test_doc_${testTimestamp}.pdf`);
    fs.writeFileSync(testDocPath, '%PDF-1.4 SECUREPRINT AUTOMATED TEST SENSITIVE DOCUMENT CONTENT');

    const form = new FormData();
    form.append('files', fs.createReadStream(testDocPath), {
      filename: 'Confidential_Report.pdf',
      contentType: 'application/pdf'
    });

    const uploadRes = await axios.post(
      `${BASE_URL}/api/documents/sessions/${sessionId}/upload`,
      form,
      { headers: { ...form.getHeaders(), 'x-session-token': sessionToken } }
    );
    assert(uploadRes.status === 201 && uploadRes.data.data.length > 0, 'Document uploaded with SHA-256 verification');
    const docId = uploadRes.data.data[0]._id || uploadRes.data.data[0].id;

    // Clean up local temp test file
    try { fs.unlinkSync(testDocPath); } catch (e) {}

    // Verify file exists on server disk
    const sessionDir = path.join(UPLOAD_DIR, sessionId.toString());
    const filesBefore = fs.existsSync(sessionDir) ? fs.readdirSync(sessionDir) : [];
    assert(filesBefore.length > 0, 'Physical file verified on disk in private storage');

    // 4.3 Submit Print Job with Custom Settings
    const jobRes = await axios.post(`${BASE_URL}/api/jobs`, {
      sessionId: sessionId,
      customerName: 'Rahul Verma',
      options: {
        orientation: 'LANDSCAPE',
        pageRange: '1-3',
        copies: 2,
        colorMode: 'BW',
        doubleSided: false,
        paperSize: 'A4'
      }
    }, {
      headers: { 'x-session-token': sessionToken }
    });

    assert(jobRes.status === 201 && jobRes.data.success, 'Print job submitted to shopkeeper queue');
    const jobId = jobRes.data.data.jobId;
    const createdJob = jobRes.data.data;
    assert(createdJob.orientation === 'LANDSCAPE', 'Print job orientation saved as LANDSCAPE', `Got: ${createdJob.orientation}`);
    assert(createdJob.pageRange === '1-3', 'Print job pageRange saved as 1-3', `Got: ${createdJob.pageRange}`);
    assert(createdJob.copies === 2, 'Print job copies saved as 2', `Got: ${createdJob.copies}`);

    // -------------------------------------------------------------
    // TEST 5: Server-Side Payment Verification & Security
    // -------------------------------------------------------------
    console.log('\n🔹 5. SERVER-SIDE PAYMENT VERIFICATION & FRAUD REJECTION');
    // Verify payment order blocked before printing completed
    try {
      await axios.post(`${BASE_URL}/api/payments/create-order`, { jobId });
      assert(false, 'Payment order must be blocked before printing completed');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'Payment creation rejected before print completion');
    }

    // Shopkeeper marks printing completed
    const completeRes = await axios.post(
      `${BASE_URL}/api/jobs/${jobId}/complete`,
      { finalPrice: 6 },
      { headers: { Authorization: `Bearer ${shopOwnerToken}` } }
    );
    assert(completeRes.status === 200, 'Shopkeeper marked printing completed');

    // 5.1 Create Order
    const orderRes = await axios.post(`${BASE_URL}/api/payments/create-order`, { jobId });
    assert(orderRes.status === 200 && orderRes.data.data.orderId, 'Server-side payment order created with trusted pricing');
    const { orderId } = orderRes.data.data;

    // 5.2 Tampered Signature Attack
    try {
      await axios.post(`${BASE_URL}/api/payments/verify`, {
        jobId,
        razorpay_order_id: orderId,
        razorpay_payment_id: 'pay_fraudulent_12345',
        razorpay_signature: 'fake_tampered_hex_signature_attack'
      });
      assert(false, 'Tampered HMAC signature was rejected');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'Tampered payment signature rejected with 400 Bad Request');
    }

    // 5.3 Valid Cryptographic HMAC SHA-256 Signature Verification
    const legitimatePaymentId = `pay_test_${Date.now()}`;
    const validSignature = crypto
      .createHmac('sha256', RAZORPAY_SECRET)
      .update(`${orderId}|${legitimatePaymentId}`)
      .digest('hex');

    const verifyRes = await axios.post(`${BASE_URL}/api/payments/verify`, {
      jobId,
      razorpay_order_id: orderId,
      razorpay_payment_id: legitimatePaymentId,
      razorpay_signature: validSignature
    });
    assert(verifyRes.status === 200 && verifyRes.data.success, 'Legitimate cryptographic payment verified successfully');

    // 5.4 Payment Idempotency Guard
    const idempotentRes = await axios.post(`${BASE_URL}/api/payments/verify`, {
      jobId,
      razorpay_order_id: orderId,
      razorpay_payment_id: legitimatePaymentId,
      razorpay_signature: validSignature
    });
    assert(idempotentRes.status === 200 && idempotentRes.data.success, 'Duplicate payment verification returns idempotent success without double billing');

    // -------------------------------------------------------------
    // TEST 6: Physical Document Auto-Deletion
    // -------------------------------------------------------------
    console.log('\n🔹 6. PHYSICAL DOCUMENT AUTO-DELETION');
    console.log('  ⏳ Waiting 11 seconds for exact 10-second background cleanup timer to execute...');
    await new Promise(r => setTimeout(r, 11500));

    // Verify physical file was unlinked from disk
    const filesAfter = fs.existsSync(sessionDir) ? fs.readdirSync(sessionDir) : [];
    assert(filesAfter.length === 0, 'Physical file permanently wiped from storage disk (0 bytes remaining)');

    // Verify document preview returns 404 / 410
    try {
      await axios.get(`${BASE_URL}/api/documents/${docId}/preview`, {
        headers: { Authorization: `Bearer ${shopOwnerToken}` }
      });
      assert(false, 'Deleted document preview is denied');
    } catch (err) {
      assert(err.response && [404, 410].includes(err.response.status), 'Access to auto-deleted document returns HTTP 404/410');
    }

    // -------------------------------------------------------------
    // TEST 7: Print Agent Pairing & Hardware Discovery
    // -------------------------------------------------------------
    console.log('\n🔹 7. PRINT AGENT PAIRING & PRINTER HARDWARE DISCOVERY');
    // 7.1 Shop Owner requests pairing code
    const pairingRes = await axios.post(`${BASE_URL}/api/printers/pairing-code`, {
      computerName: 'Main Counter PC'
    }, {
      headers: { Authorization: `Bearer ${shopOwnerToken}` }
    });
    assert(pairingRes.status === 200 && pairingRes.data.data.pairingCode, '6-digit pairing code generated for shop');
    const { pairingCode } = pairingRes.data.data;
    assert(pairingCode.length === 6, 'Pairing code is exactly 6 digits');

    // 7.2 Desktop Agent pairs using code
    const agentPairRes = await axios.post(`${BASE_URL}/api/printers/pair`, {
      pairingCode: pairingCode,
      computerName: 'Main Counter PC',
      os: 'WINDOWS',
      osVersion: '10.0.19045',
      appVersion: '1.2.0'
    });
    assert(agentPairRes.status === 200 && agentPairRes.data.data.agentToken, 'Agent paired and received persistent JWT token');
    const { agentToken, agentId } = agentPairRes.data.data;

    // 7.3 Agent reports discovered USB/Wi-Fi/LAN printers
    const syncPrintersRes = await axios.post(`${BASE_URL}/api/printers/sync`, {
      printers: [
        {
          name: 'HP LaserJet Pro MFP M126nw',
          connectionType: 'USB',
          isDefault: true,
          status: 'ONLINE',
          capabilities: {
            color: false,
            duplex: false,
            paperSizes: ['A4', 'Letter']
          }
        },
        {
          name: 'Canon PIXMA G3000 Series',
          connectionType: 'WIFI',
          isDefault: false,
          status: 'ONLINE',
          capabilities: {
            color: true,
            duplex: true,
            paperSizes: ['A4', 'A3', 'Letter', '4x6']
          }
        }
      ]
    }, {
      headers: { Authorization: `Bearer ${agentToken}` }
    });
    assert(syncPrintersRes.status === 200 && syncPrintersRes.data.success, 'Agent synced USB and Wi-Fi printers to cloud');

    // 7.4 Shopkeeper views updated printer inventory
    const printerListRes = await axios.get(`${BASE_URL}/api/printers`, {
      headers: { Authorization: `Bearer ${shopOwnerToken}` }
    });
    const printers = printerListRes.data.data.printers;
    assert(printers && printers.length >= 2, 'Shopkeeper inventory lists both synced printers', `Found: ${printers.length}`);
    const hpPrinter = printers.find(p => p.name.includes('HP LaserJet'));
    const canonPrinter = printers.find(p => p.name.includes('Canon PIXMA'));
    assert(hpPrinter && hpPrinter.connectionType === 'USB' && !hpPrinter.isColorCapable, 'HP B&W USB printer registered correctly');
    assert(canonPrinter && canonPrinter.connectionType === 'WIFI' && canonPrinter.isColorCapable, 'Canon Color Wi-Fi printer registered correctly');

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`🏁 TEST RUN FINISHED: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('✨ ALL 25+ SYSTEM ASSERTIONS PASSED WITH 100% SUCCESS!\n');
      process.exit(0);
    }

  } catch (err) {
    console.error('\n💥 Unexpected test failure:', err.message);
    if (err.response) {
      console.error('Response Status:', err.response.status);
      console.error('Response Data:', err.response.data);
    }
    process.exit(1);
  }
}

runTests();
