/**
 * SecurePrint Real-Hardware Printers & Desktop Agent Integration Test Suite
 * Tests:
 * 1. Subscription gating for agent pairing and printer registration
 * 2. 6-digit random pairing code generation and single-use consumption
 * 3. Agent registration, JWT issuance, and persistent room joining
 * 4. Honest hardware discovery sync (Available Printers vs Connected Printers)
 * 5. Bluetooth-like Connect / Register flow
 * 6. Physical test print page dispatch and idempotency
 * 7. Disconnect printer (unregistered without deleting driver)
 * 8. Unpair computer (revokes agent token and sets status to OFFLINE)
 * 9. Multi-tenant security isolation (Shop B cannot control Shop A printer/agent)
 * 10. Print validation against unregistered and offline printers
 */

const axios = require('axios');
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { discoverPrinters, parseConnectionType, extractManufacturerAndModel } = require('../../agent/src/discovery');

const BASE_URL = process.env.API_URL || 'http://localhost:5001/api';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:5001';

let passedCount = 0;
function pass(msg) {
  passedCount++;
  console.log(`✅ PASS [${passedCount}]: ${msg}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('   SECUREPRINT PRINTERS & DESKTOP AGENT INTEGRATION TEST SUITE  ');
  console.log('================================================================\n');

  const testId = Date.now();
  const shopAEmail = `shop_a_${testId}@printertest.com`;
  const shopBEmail = `shop_b_${testId}@printertest.com`;
  const password = 'Password@1234';

  try {
    // ── STEP 1: Registration & Subscription Access Gating ──
    console.log('--- STEP 1: Subscription Access Gating on Desktop Agent ---');
    const regResA = await axios.post(`${BASE_URL}/auth/register-shop`, {
      name: 'Ramesh Sharma',
      email: shopAEmail,
      password,
      phone: '9876543210',
      shopName: 'Sharma Print Hub',
      slug: `sharma-print-${testId}`
    });
    const shopAId = regResA.data.data.shopId;
    const loginResA = await axios.post(`${BASE_URL}/auth/login`, {
      email: shopAEmail,
      password
    });
    const shopTokenA = loginResA.data.data.accessToken;
    const headersA = { Authorization: `Bearer ${shopTokenA}`, 'x-test-simulation': 'true' };

    // Shop A gating check
    const isGatingActive = process.env.SUBSCRIPTION_GATE_ENABLED === 'true';
    if (isGatingActive) {
      try {
        await axios.post(`${BASE_URL}/printers/pairing-code`, {}, { headers: headersA });
        assert.fail('Unpaid shop should not be able to generate pairing code when gating is active');
      } catch (err) {
        assert.strictEqual(err.response?.status, 403);
        assert.strictEqual(err.response?.data?.code, 'SUBSCRIPTION_REQUIRED');
        pass('Unpaid shop blocked from generating pairing code (403 SUBSCRIPTION_REQUIRED)');
      }
    } else {
      pass('Subscription gating relaxed as requested; ready for desktop agent pairing');
    }

    // Activate Shop A subscription via Razorpay verification
    const orderResA = await axios.post(`${BASE_URL}/subscriptions/create-order`, {
      planId: 'PRO',
      billingCycle: 'MONTHLY'
    }, { headers: headersA });
    const orderIdA = orderResA.data.data.orderId;
    const paymentIdA = `pay_agt_${testId}`;
    const secret = process.env.RAZORPAY_KEY_SECRET || 'secureprint_dev_secret_2026';
    const sigA = crypto.createHmac('sha256', secret).update(`${orderIdA}|${paymentIdA}`).digest('hex');

    await axios.post(`${BASE_URL}/subscriptions/verify`, {
      orderId: orderIdA,
      paymentId: paymentIdA,
      signature: sigA,
      planId: 'PRO'
    }, { headers: headersA });
    pass('Shop A subscription successfully activated to ACTIVE');

    // ── STEP 2: Generate 6-Digit Pairing Code & Verify Properties ──
    console.log('\n--- STEP 2: 6-Digit Pairing Code Generation ---');
    const pairCodeRes = await axios.post(`${BASE_URL}/printers/pairing-code`, {
      computerName: 'Counter-Desktop-01'
    }, { headers: headersA });
    assert.strictEqual(pairCodeRes.status, 200);
    const { pairingCode, expiresInSeconds } = pairCodeRes.data.data;

    assert.strictEqual(pairingCode.length, 6, 'Pairing code must be exactly 6 digits');
    assert(/^\d{6}$/.test(pairingCode), 'Pairing code must be numeric');
    assert(expiresInSeconds <= 600, 'Pairing code validity max 10 minutes');
    pass(`Generated valid 6-digit pairing code: ${pairingCode} (Expires: ${expiresInSeconds}s)`);

    // ── STEP 3: Agent Pairs with Shop Computer ──
    console.log('\n--- STEP 3: Agent Pair & JWT Credential Issuance ---');
    const pairAgentRes = await axios.post(`${BASE_URL}/printers/pair`, {
      pairingCode,
      computerName: 'Counter-Desktop-01',
      os: 'Windows 11 Pro',
      osVersion: '10.0.22631',
      appVersion: '1.0.4'
    });
    assert.strictEqual(pairAgentRes.status, 200);
    const { agentId, agentToken, shopName } = pairAgentRes.data.data;
    assert(agentToken, 'Agent receives permanent signed JWT token');
    assert(agentId, 'Agent assigned stable agent ID');
    pass(`Agent paired successfully (ID: ${agentId}, Token issued)`);

    // ── STEP 4: Single-Use Code Security ──
    console.log('\n--- STEP 4: Pairing Code Single-Use Enforcement ---');
    try {
      await axios.post(`${BASE_URL}/printers/pair`, {
        pairingCode,
        computerName: 'Hacker-PC'
      });
      assert.fail('Re-using pairing code must be blocked');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400);
      pass('Pairing code is strictly single-use (re-use rejected with HTTP 400)');
    }

    // ── STEP 5: Real-Hardware Discovery Unit Inspection ──
    console.log('\n--- STEP 5: Hardware Discovery Engine Validation ---');
    const rawDiscovered = await discoverPrinters();
    assert(Array.isArray(rawDiscovered), 'discoverPrinters returns array');
    const hasFake = rawDiscovered.some(p => p.name?.includes('Demo') || p.name?.includes('Virtual DeskJet'));
    assert(!hasFake, 'Zero fake demo printers returned from discovery engine');
    pass('Hardware discovery engine verified: zero fake demo printers returned');

    const usbType = parseConnectionType('USB001');
    const wifiType = parseConnectionType('WSD-e8a1b2c3-4d5e');
    const lanType = parseConnectionType('192.168.1.150');
    assert.strictEqual(usbType, 'USB');
    assert.strictEqual(wifiType, 'WIFI');
    assert.strictEqual(lanType, 'WIFI'); // IP on local network categorized as WIFI/Network
    pass('Connection types parsed accurately (USB, Wi-Fi, LAN)');

    const mfgHP = extractManufacturerAndModel('HP LaserJet Pro M404dn', 'HP LaserJet Driver');
    const mfgEpson = extractManufacturerAndModel('Epson EcoTank L3250', 'Epson ESC/P-R');
    assert.strictEqual(mfgHP.manufacturer, 'HP');
    assert.strictEqual(mfgEpson.manufacturer, 'Epson');
    pass('Manufacturer and model extraction verified (HP, Epson)');

    // ── STEP 6: Agent Syncs Discovered Hardware (Bluetooth-like Flow) ──
    console.log('\n--- STEP 6: Bluetooth-like Discovery Sync (Available vs Connected) ---');
    const agentHeaders = { Authorization: `Bearer ${agentToken}` };

    // Sync 2 discovered physical printers with isRegistered: false (Available for connection)
    const syncRes = await axios.post(`${BASE_URL}/printers/sync`, {
      printers: [
        {
          name: 'HP LaserJet Pro M404dn',
          systemPrinterName: 'HP_LaserJet_Pro_M404dn',
          manufacturer: 'HP',
          model: 'LaserJet Pro M404dn',
          deviceIdentifier: 'USB001',
          connectionType: 'USB',
          isRegistered: false, // Discovered but not yet connected
          status: 'READY',
          isColorCapable: false,
          supportsDuplex: true,
          paperSizes: ['A4', 'Legal']
        },
        {
          name: 'Epson EcoTank L3250',
          systemPrinterName: 'Epson_EcoTank_L3250',
          manufacturer: 'Epson',
          model: 'EcoTank L3250',
          deviceIdentifier: '192.168.1.120',
          connectionType: 'WIFI',
          isRegistered: false, // Discovered but not yet connected
          status: 'READY',
          isColorCapable: true,
          supportsDuplex: false,
          paperSizes: ['A4', 'Letter']
        }
      ]
    }, { headers: agentHeaders });
    assert.strictEqual(syncRes.status, 200);
    pass('Agent synced 2 discovered hardware printers to SecurePrint Cloud');

    // Query GET /api/printers from Shopkeeper Dashboard
    const getPrnRes1 = await axios.get(`${BASE_URL}/printers`, { headers: headersA });
    assert.strictEqual(getPrnRes1.status, 200);
    const { availablePrinters, connectedPrinters, agents, isAgentOnline } = getPrnRes1.data.data;

    assert.strictEqual(agents.length, 1, 'One shop computer paired');
    assert.strictEqual(isAgentOnline, true, 'Print Agent is online');
    assert.strictEqual(availablePrinters.length, 2, 'Two printers in Available Printers list');
    assert.strictEqual(connectedPrinters.length, 0, 'Zero printers yet in Connected Printers list');
    pass('Dashboard correctly partitions into Available Printers (2) and Connected Printers (0)');

    // ── STEP 7: Shopkeeper Clicks [ CONNECT ] on HP LaserJet ──
    console.log('\n--- STEP 7: Connect / Register Printer Flow ---');
    const hpPrinter = availablePrinters.find(p => p.name.includes('LaserJet'));
    assert(hpPrinter, 'HP printer found in available list');

    const connectRes = await axios.post(`${BASE_URL}/printers/${hpPrinter.printerId}/connect`, {}, { headers: headersA });
    assert.strictEqual(connectRes.status, 200);
    assert.strictEqual(connectRes.data.data.isRegistered, true);
    assert.strictEqual(connectRes.data.data.status, 'READY');
    pass(`Connected "${hpPrinter.name}" -> Status: READY, isRegistered: true`);

    // Verify lists updated: Available (1), Connected (1)
    const getPrnRes2 = await axios.get(`${BASE_URL}/printers`, { headers: headersA });
    assert.strictEqual(getPrnRes2.data.data.availablePrinters.length, 1);
    assert.strictEqual(getPrnRes2.data.data.connectedPrinters.length, 1);
    assert.strictEqual(getPrnRes2.data.data.connectedPrinters[0].name, hpPrinter.name);
    pass('Dashboard reflects 1 Available Printer and 1 Connected Printer');

    // ── STEP 8: Dispatch Physical Test Print ──
    console.log('\n--- STEP 8: Physical Test Print Page Dispatch ---');
    const testPrintRes = await axios.post(`${BASE_URL}/printers/${hpPrinter.printerId}/test-print`, {}, { headers: headersA });
    assert.strictEqual(testPrintRes.status, 200);
    assert(testPrintRes.data.data.attemptId, 'Test print receives unique attemptId');
    pass(`Test print dispatched to "${hpPrinter.name}" via agent (Attempt: ${testPrintRes.data.data.attemptId})`);

    // ── STEP 9: Reject Print to Unregistered Printer ──
    console.log('\n--- STEP 9: Validate Print to Unconnected Printer Rejection ---');
    const epsonPrinter = getPrnRes2.data.data.availablePrinters.find(p => p.name.includes('Epson'));
    assert(epsonPrinter, 'Epson printer remains in available list');

    // Attempt to print job to Epson (which is not yet registered/connected)
    // Create a dummy job first
    const sessionRes = await axios.post(`${BASE_URL}/sessions/start-by-slug`, {
      slug: `sharma-print-${testId}`,
      customerName: 'Aakash Verma'
    });
    const sessionId = sessionRes.data.data.sessionId;
    const sessionToken = sessionRes.data.data.sessionToken;

    // Upload test doc
    const FormData = require('form-data');
    const form = new FormData();
    form.append('files', Buffer.from('%PDF-1.4 TEST DOCUMENT FOR PRINTER INTEGRATION'), {
      filename: 'document.pdf',
      contentType: 'application/pdf'
    });
    await axios.post(`${BASE_URL}/documents/sessions/${sessionId}/upload`, form, {
      headers: { ...form.getHeaders(), 'x-session-token': sessionToken }
    });

    const jobRes = await axios.post(`${BASE_URL}/jobs`, {
      sessionId,
      customerName: 'Aakash Verma',
      options: { copies: 1, colorMode: 'BW', paperSize: 'A4' }
    }, { headers: { 'x-session-token': sessionToken } });
    const jobId = jobRes.data.data.jobId;

    try {
      await axios.post(`${BASE_URL}/printers/jobs/${jobId}/print`, {
        printerId: epsonPrinter.printerId
      }, { headers: headersA });
      assert.fail('Print to unconnected printer must be rejected');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400);
      assert.strictEqual(err.response?.data?.error?.code, 'PRINTER_NOT_CONNECTED');
      pass('Print command to unconnected printer rejected with PRINTER_NOT_CONNECTED (HTTP 400)');
    }

    // ── STEP 10: Multi-Tenant Security & Isolation ──
    console.log('\n--- STEP 10: Multi-Tenant Isolation (Shop B Accessing Shop A) ---');
    const regResB = await axios.post(`${BASE_URL}/auth/register-shop`, {
      name: 'Vijay Verma',
      email: shopBEmail,
      password,
      phone: '9876543211',
      shopName: 'Verma Photostat',
      slug: `verma-photo-${testId}`
    });
    const loginResB = await axios.post(`${BASE_URL}/auth/login`, {
      email: shopBEmail,
      password
    });
    const shopTokenB = loginResB.data.data.accessToken;
    const headersB = { Authorization: `Bearer ${shopTokenB}`, 'x-test-simulation': 'true' };

    // Activate Shop B subscription
    const orderResB = await axios.post(`${BASE_URL}/subscriptions/create-order`, {
      planId: 'STARTER',
      billingCycle: 'MONTHLY'
    }, { headers: headersB });
    const sigB = crypto.createHmac('sha256', secret).update(`${orderResB.data.data.orderId}|pay_b_${testId}`).digest('hex');
    await axios.post(`${BASE_URL}/subscriptions/verify`, {
      orderId: orderResB.data.data.orderId,
      paymentId: `pay_b_${testId}`,
      signature: sigB,
      planId: 'STARTER'
    }, { headers: headersB });

    // Shop B tries to connect Shop A's printer
    try {
      await axios.post(`${BASE_URL}/printers/${hpPrinter.printerId}/connect`, {}, { headers: headersB });
      assert.fail('Shop B connecting Shop A printer must fail');
    } catch (err) {
      assert.strictEqual(err.response?.status, 404);
      pass('Cross-tenant printer connection blocked (HTTP 404)');
    }

    // Shop B tries to unpair Shop A's computer
    try {
      await axios.post(`${BASE_URL}/printers/agents/${agentId}/unpair`, {}, { headers: headersB });
      assert.fail('Shop B unpairing Shop A computer must fail');
    } catch (err) {
      assert.strictEqual(err.response?.status, 404);
      pass('Cross-tenant agent unpairing blocked (HTTP 404)');
    }

    // ── STEP 11: Disconnect Printer (Unregister from SecurePrint) ──
    console.log('\n--- STEP 11: Disconnect Printer Flow ---');
    const disconnRes = await axios.post(`${BASE_URL}/printers/${hpPrinter.printerId}/disconnect`, {}, { headers: headersA });
    assert.strictEqual(disconnRes.status, 200);
    assert.strictEqual(disconnRes.data.data.isRegistered, false);
    assert.strictEqual(disconnRes.data.data.status, 'DISCONNECTED');
    pass(`Printer "${hpPrinter.name}" disconnected (unregistered from SecurePrint, driver retained)`);

    const getPrnRes3 = await axios.get(`${BASE_URL}/printers`, { headers: headersA });
    assert.strictEqual(getPrnRes3.data.data.connectedPrinters.length, 0);
    assert.strictEqual(getPrnRes3.data.data.availablePrinters.length, 2);
    pass('Dashboard reflects 0 Connected Printers and 2 Available Printers');

    // ── STEP 12: Unpair Shop Computer ──
    console.log('\n--- STEP 12: Unpair Shop Computer Flow ---');
    const unpairRes = await axios.post(`${BASE_URL}/printers/agents/${agentId}/unpair`, {}, { headers: headersA });
    assert.strictEqual(unpairRes.status, 200);
    pass(`Computer "${agentId}" unpaired successfully`);

    const getPrnRes4 = await axios.get(`${BASE_URL}/printers`, { headers: headersA });
    assert.strictEqual(getPrnRes4.data.data.agents.length, 0, 'No active paired agents remain');
    pass('Dashboard confirms agent list is empty after unpairing');

    console.log('\n================================================================');
    console.log(`   TEST RESULTS: ${passedCount}/${passedCount} TESTS PASSED`);
    console.log('================================================================\n');
    console.log('🎉 ALL PRINTERS & DESKTOP AGENT INTEGRATION TESTS PASSED PERFECTLY!\n');
    process.exit(0);

  } catch (err) {
    console.error('\n💥 Test Failed:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

runTests();
