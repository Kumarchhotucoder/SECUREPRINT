const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function runLiveTest() {
  // Use public HTTPS domain
  const publicBase = 'https://dohym-152-59-27-80.run.pinggy-free.link';
  console.log(`\n==================================================`);
  console.log(`🚀 Testing SecurePrint Live Public HTTPS Flow:`);
  console.log(`Target: ${publicBase}`);
  console.log(`==================================================\n`);

  try {
    // 1. Resolve shop by slug
    console.log(`1️⃣ Resolving shop via public domain: /shop/abc-digital-center...`);
    const shopRes = await axios.get(`${publicBase}/api/shops/by-slug/abc-digital-center`);
    const shop = shopRes.data.data || shopRes.data.shop;
    console.log(`   ✅ Shop found: "${shop.name}" (ID: ${shop.id || shop._id})`);
    console.log(`   Permanent QR Target: ${shop.permanentQrTargetUrl || `${publicBase}/shop/${shop.slug}`}`);

    // 2. Start Customer Session
    console.log(`\n2️⃣ Creating Customer Session for "Sneha Verma"...`);
    const sessionRes = await axios.post(`${publicBase}/api/sessions/start-by-slug`, {
      slug: 'abc-digital-center',
      customerName: 'Sneha Verma'
    });
    const session = sessionRes.data.data;
    console.log(`   ✅ Session created! ID: ${session.sessionId}`);

    // 3. Upload a document
    console.log(`\n3️⃣ Uploading a test document...`);
    const testFilePath = path.join(__dirname, 'test_document.pdf');
    fs.writeFileSync(testFilePath, '%PDF-1.4 Mock PDF file for testing SecurePrint live flow');

    const form = new FormData();
    form.append('files', fs.createReadStream(testFilePath), {
      filename: 'College_Assignment_Sneha.pdf',
      contentType: 'application/pdf'
    });

    const uploadRes = await axios.post(
      `${publicBase}/api/documents/sessions/${session.sessionId}/upload`,
      form,
      { headers: { ...form.getHeaders(), 'x-session-token': session.sessionToken } }
    );
    const uploadedDocs = uploadRes.data.data;
    console.log(`   ✅ Document uploaded successfully!`);
    console.log(`   Files uploaded: ${uploadedDocs.length}, First: ${uploadedDocs[0].originalFilename}`);

    // 4. Submit Print Job
    const shopId = shop.id || shop._id;
    console.log(`\n4️⃣ Submitting Print Job ("SEND TO SHOP")...`);
    const jobRes = await axios.post(`${publicBase}/api/jobs`, {
      sessionId: session.sessionId,
      shopId: shopId,
      customerName: 'Sneha Verma',
      options: {
        colorMode: 'BW',
        copies: 2,
        pageRange: 'ALL'
      }
    }, {
      headers: { 'x-session-token': session.sessionToken }
    });
    const createdJob = jobRes.data.data;
    console.log(`   ✅ Print job created! Job ID: ${createdJob.jobId}, Status: ${createdJob.status}`);

    // 5. Shopkeeper Login & Queue Check
    console.log(`\n5️⃣ Authenticating as Shopkeeper (ABC Digital Center)...`);
    const loginRes = await axios.post(`${publicBase}/api/auth/login`, {
      email: 'shopkeeper@secureprint.in',
      password: 'Shop@SecurePrint123!'
    });
    const token = loginRes.data.data.accessToken;
    console.log(`   ✅ Shopkeeper authenticated!`);

    console.log(`\n6️⃣ Fetching Shopkeeper Queue...`);
    const queueRes = await axios.get(`${publicBase}/api/shops/${shopId}/jobs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const jobs = queueRes.data.data;
    const foundJob = jobs.find(j => j._id.toString() === createdJob.jobId.toString());
    if (foundJob) {
      console.log(`   ✅ Job located in Shopkeeper Queue!`);
      console.log(`   Customer: ${foundJob.customerName}, Files: ${foundJob.documents?.length || 1}, Status: ${foundJob.status}`);
    } else {
      throw new Error(`Job not found in shopkeeper queue!`);
    }

    // 7. Mark Job Completed
    console.log(`\n7️⃣ Shopkeeper clicks "MARK COMPLETED"...`);
    const completeRes = await axios.post(
      `${publicBase}/api/jobs/${createdJob.jobId}/complete`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log(`   ✅ Job marked completed! New Status: ${completeRes.data.data.status}`);

    console.log(`\n🎉 ALL 7 STEPS OVER PUBLIC HTTPS DOMAIN PASSED 100% SUCCESFULLY!\n`);

    // Clean up local temp file
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);

  } catch (err) {
    console.error(`❌ Error during live public flow test:`, err.response?.data || err.message);
    process.exit(1);
  }
}

runLiveTest();
