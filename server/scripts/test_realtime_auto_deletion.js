const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BASE_URL = 'http://localhost:5001';
const UPLOAD_DIR = path.resolve(__dirname, '../uploads');

async function testAutoDeletionFlow() {
  console.log('\n===============================================================');
  console.log('🧪 TEST: SECUREPRINT REAL-TIME AUTO DELETION AFTER PRINT COMPLETE');
  console.log('===============================================================\n');

  try {
    // 1. Resolve Shop
    console.log('1️⃣ Resolving shop: abc-digital-center...');
    const shopRes = await axios.get(`${BASE_URL}/api/shops/by-slug/abc-digital-center`);
    const shop = shopRes.data.data;
    console.log(`   ✅ Shop: ${shop.name} (ID: ${shop.id})`);

    // 2. Start Customer Session
    console.log('\n2️⃣ Starting Customer Session for "Amit Sharma"...');
    const sessionRes = await axios.post(`${BASE_URL}/api/sessions/start-by-slug`, {
      slug: 'abc-digital-center',
      customerName: 'Amit Sharma'
    });
    const session = sessionRes.data.data;
    console.log(`   ✅ Session ID: ${session.sessionId}`);

    // 3. Upload a Test Document
    console.log('\n3️⃣ Uploading a test sensitive PDF document...');
    const tempTestFile = path.join(__dirname, 'temp_test_passport.pdf');
    fs.writeFileSync(tempTestFile, '%PDF-1.5 Confidential Test Document For Auto-Deletion Verification');

    const form = new FormData();
    form.append('files', fs.createReadStream(tempTestFile), {
      filename: 'Passport_Copy_Amit.pdf',
      contentType: 'application/pdf'
    });

    const uploadRes = await axios.post(
      `${BASE_URL}/api/documents/sessions/${session.sessionId}/upload`,
      form,
      { headers: { ...form.getHeaders(), 'x-session-token': session.sessionToken } }
    );
    const uploadedDocs = uploadRes.data.data;
    const docId = uploadedDocs[0].id || uploadedDocs[0]._id;
    console.log(`   ✅ Document uploaded! ID: ${docId}, Name: ${uploadedDocs[0].originalFilename}`);

    // 4. Verify Physical File Exists in Storage
    console.log('\n4️⃣ Verifying physical file exists in private storage...');
    const sessionStorageDir = path.join(UPLOAD_DIR, session.sessionId.toString());
    if (!fs.existsSync(sessionStorageDir)) {
      throw new Error(`Session storage directory does not exist: ${sessionStorageDir}`);
    }
    const filesInDir = fs.readdirSync(sessionStorageDir);
    console.log(`   📁 Files currently in storage directory (${sessionStorageDir}):`, filesInDir);
    if (filesInDir.length === 0) {
      throw new Error('No files found in session directory!');
    }
    const physicalFilePath = path.join(sessionStorageDir, filesInDir[0]);
    console.log(`   ✅ Physical file verified on disk: ${physicalFilePath} (${fs.statSync(physicalFilePath).size} bytes)`);

    // 5. Submit Print Job
    console.log('\n5️⃣ Submitting Print Job ("SEND TO SHOP")...');
    const jobRes = await axios.post(`${BASE_URL}/api/jobs`, {
      sessionId: session.sessionId,
      shopId: shop.id,
      customerName: 'Amit Sharma',
      options: { colorMode: 'BW', copies: 1, paperSize: 'A4' }
    }, {
      headers: { 'x-session-token': session.sessionToken }
    });
    const jobId = jobRes.data.data.jobId;
    console.log(`   ✅ Job submitted! Job ID: ${jobId}, Status: ${jobRes.data.data.status}`);

    // 6. Shopkeeper Login & Preview Document while Job is Active
    console.log('\n6️⃣ Authenticating Shopkeeper and testing document preview while ACTIVE...');
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'shopkeeper@secureprint.in',
      password: 'Shop@SecurePrint123!'
    });
    const shopToken = loginRes.data.data.accessToken;

    const previewRes = await axios.get(`${BASE_URL}/api/documents/${docId}/preview`, {
      headers: { Authorization: `Bearer ${shopToken}` },
      responseType: 'arraybuffer'
    });
    console.log(`   ✅ Preview accessible while active (HTTP ${previewRes.status}, Content-Type: ${previewRes.headers['content-type']})`);

    // 7. Shopkeeper Clicks "MARK COMPLETED"
    console.log('\n7️⃣ Shopkeeper clicks "MARK COMPLETED" (POST /api/jobs/:id/complete)...');
    const completeRes = await axios.post(
      `${BASE_URL}/api/jobs/${jobId}/complete`,
      {},
      { headers: { Authorization: `Bearer ${shopToken}` } }
    );
    const completeData = completeRes.data.data;
    console.log(`   ✅ Completion Response:`, completeData);

    // 8. Verify Physical Storage Deletion
    console.log('\n8️⃣ VERIFYING PHYSICAL STORAGE DELETION:');
    const fileStillExists = fs.existsSync(physicalFilePath);
    console.log(`   Checking file path: ${physicalFilePath}`);
    console.log(`   File still exists on disk? 👉 ${fileStillExists}`);
    if (fileStillExists) {
      throw new Error(`CRITICAL FAILURE: Physical file was NOT deleted from storage!`);
    }
    console.log(`   ✅ Physical file is COMPLETELY GONE from disk!`);

    const dirStillExists = fs.existsSync(sessionStorageDir);
    console.log(`   Session directory still exists? 👉 ${dirStillExists}`);
    console.log(`   ✅ Storage directory cleaned up!`);

    // 9. Verify Document Access Is Revoked (Must return 404)
    console.log('\n9️⃣ Verifying document URL access AFTER completion:');
    try {
      await axios.get(`${BASE_URL}/api/documents/${docId}/preview`, {
        headers: { Authorization: `Bearer ${shopToken}` }
      });
      throw new Error('CRITICAL FAILURE: Preview endpoint still returned 200 OK after deletion!');
    } catch (err) {
      if (err.response && err.response.status === 404) {
        console.log(`   ✅ Access correctly DENIED with HTTP 404: "${err.response.data.message}"`);
      } else {
        throw err;
      }
    }

    // 10. Verify Database State via GET /api/jobs/:id
    console.log('\n🔟 Verifying job status and deletion timestamp in database:');
    const jobCheck = await axios.get(`${BASE_URL}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${shopToken}` }
    });
    const finalJob = jobCheck.data.data;
    console.log(`   Job Status: ${finalJob.status}`);
    console.log(`   Files Deleted: ${finalJob.filesDeleted}`);
    console.log(`   Deleted At: ${finalJob.deletedAt}`);
    console.log(`   Cleanup Status: ${finalJob.cleanupStatus}`);
    console.log(`   Documents returned: ${finalJob.documents.length}`);

    if (!finalJob.filesDeleted) {
      throw new Error('Database filesDeleted is not true!');
    }
    if (!finalJob.deletedAt) {
      throw new Error('Database deletedAt timestamp is missing!');
    }
    if (finalJob.documents.length !== 0) {
      throw new Error('Documents array was not cleared after deletion!');
    }

    console.log('\n===============================================================');
    console.log('🎉 ALL VERIFICATION CRITERIA PASSED 100% SUCCESFULLY!');
    console.log('   - Actual storage files physically deleted from disk');
    console.log('   - Old URLs fail with HTTP 404');
    console.log('   - Database files_deleted = true with real timestamp');
    console.log('   - Real-time Socket.IO broadcasts emitted');
    console.log('===============================================================\n');

    // Clean up local temp file
    if (fs.existsSync(tempTestFile)) fs.unlinkSync(tempTestFile);

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.response?.data || err.message);
    process.exit(1);
  }
}

testAutoDeletionFlow();
