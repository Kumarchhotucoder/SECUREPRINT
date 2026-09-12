const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const PrintSession = require('../models/PrintSession');
const Document = require('../models/Document');
const Shop = require('../models/Shop');
const { saveFile, getFileStream } = require('../utils/storage');
const { hashToken, hashFileBuffer } = require('../utils/crypto');
const { logEvent, getRequestMeta } = require('../utils/audit');
const { deleteDocument } = require('../utils/deletion');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { authenticate, requireShopkeeper } = require('../middleware/auth');

// Allowed MIME types
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png',
  'image/webp', 'image/tiff',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const MAX_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || '50') * 1024 * 1024;

// Use memory storage — we handle saving ourselves for security
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES, files: 30 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not supported: ${file.mimetype}`));
    }
  }
});

/**
 * Verify session access from X-Session-Token header.
 */
const verifySession = async (req, res) => {
  const rawToken = req.headers['x-session-token'];
  if (!rawToken) {
    res.status(401).json({ success: false, message: 'Session token required.' });
    return null;
  }
  const tokenHash = hashToken(rawToken);
  const session = await PrintSession.findOne({
    _id: req.params.sessionId,
    secureTokenHash: tokenHash
  });
  if (!session) {
    await logEvent('UNAUTHORIZED_ACCESS', { ...getRequestMeta(req), metadata: { reason: 'Invalid session token for upload' } }, 'WARNING');
    res.status(401).json({ success: false, message: 'Invalid session.' });
    return null;
  }
  if (session.isExpired() || ['DELETED', 'CANCELLED'].includes(session.status)) {
    res.status(410).json({ success: false, message: 'Session has expired. Please scan the QR again.', code: 'SESSION_EXPIRED' });
    return null;
  }
  return session;
};

// POST /api/documents/sessions/:sessionId/upload — upload one or more files
router.post('/sessions/:sessionId/upload', uploadLimiter, upload.array('files', 30), async (req, res, next) => {
  try {
    const session = await verifySession(req, res);
    if (!session) return;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded.' });
    }

    // Update session to UPLOADING
    if (session.status === 'CREATED') {
      session.status = 'UPLOADING';
      await session.save();
    }

    const savedDocs = [];
    const currentCount = await Document.countDocuments({ sessionId: session._id, deletedAt: null });

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];

      // Compute SHA-256 hash for integrity
      const sha256Hash = hashFileBuffer(file.buffer);

      // Get page count for PDFs
      let pageCount = 1;
      if (file.mimetype === 'application/pdf') {
        try {
          const pdfParse = require('pdf-parse');
          const pdfData = await pdfParse(file.buffer);
          pageCount = pdfData.numpages || 1;
        } catch (e) {
          pageCount = 1; // fallback
        }
      }

      // Save to secure storage
      const storagePath = await saveFile(file.buffer, file.originalname, session._id.toString());

      // Store in DB — storagePath is never returned to clients
      const doc = await Document.create({
        sessionId: session._id,
        shopId: session.shopId,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        pageCount,
        sha256Hash,
        storagePath,
        displayOrder: currentCount + i
      });

      await logEvent('FILE_UPLOADED', {
        sessionId: session._id,
        documentId: doc._id,
        ...getRequestMeta(req),
        metadata: { filename: file.originalname, size: file.size, pageCount, mimeType: file.mimetype }
      });

      // Return doc without storagePath
      savedDocs.push({
        id: doc._id,
        originalFilename: doc.originalFilename,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        pageCount: doc.pageCount,
        sha256Hash: doc.sha256Hash,
        displayOrder: doc.displayOrder
      });
    }

    // Mark session READY after upload
    session.status = 'READY';
    await session.save();

    res.status(201).json({ success: true, data: savedDocs });
  } catch (err) {
    if (err.message.includes('File type not supported')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 50}MB.` });
    }
    next(err);
  }
});

// GET /api/documents/:docId/preview — stream file to authorized client
// Customer can preview their own session's docs
// Shopkeeper can preview docs belonging to their shop's active jobs
router.get('/:docId/preview', async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.docId).select('+storagePath');
    if (!doc || doc.deletedAt) {
      return res.status(404).json({ success: false, message: 'Document not found or has been deleted.' });
    }

    const { verifyFileDeleted } = require('../utils/storage');
    if (!doc.storagePath || verifyFileDeleted(doc.storagePath)) {
      return res.status(404).json({ success: false, message: 'Document file has been permanently deleted from storage.' });
    }

    // Authorization: customer path (session token)
    const rawSessionToken = req.headers['x-session-token'];
    if (rawSessionToken) {
      const tokenHash = hashToken(rawSessionToken);
      const session = await PrintSession.findOne({
        _id: doc.sessionId,
        secureTokenHash: tokenHash
      });
      if (!session || session.isExpired() || ['DELETED', 'CANCELLED'].includes(session.status)) {
        await logEvent('UNAUTHORIZED_ACCESS', { ...getRequestMeta(req), documentId: doc._id }, 'WARNING');
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    } else {
      // Shopkeeper path: must be authenticated + own this shop
      const { verifyAccessToken, extractBearerToken } = require('../utils/jwt');
      const token = extractBearerToken(req);
      if (!token) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }
      let decoded;
      try { decoded = verifyAccessToken(token); }
      catch { return res.status(401).json({ success: false, message: 'Invalid token.' }); }

      const shop = await Shop.findOne({ _id: doc.shopId, ownerId: decoded.userId });
      if (!shop) {
        await logEvent('UNAUTHORIZED_ACCESS', { ...getRequestMeta(req), documentId: doc._id }, 'WARNING');
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      // Session must be active
      const session = await PrintSession.findById(doc.sessionId);
      if (!session || session.status === 'DELETED') {
        return res.status(404).json({ success: false, message: 'Session no longer active.' });
      }
    }

    // Set headers to discourage caching and direct download
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', 'inline'); // inline = display, not download
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = getFileStream(doc.storagePath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/documents/:docId — customer removes a file from their session
router.delete('/:docId', async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.docId);
    if (!doc || doc.deletedAt) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    // Verify session ownership
    const rawToken = req.headers['x-session-token'];
    if (!rawToken) return res.status(401).json({ success: false, message: 'Session token required.' });

    const tokenHash = hashToken(rawToken);
    const session = await PrintSession.findOne({ _id: doc.sessionId, secureTokenHash: tokenHash });
    if (!session || ['DELETED', 'CANCELLED'].includes(session.status) || session.isExpired()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    await deleteDocument(doc._id);
    res.json({ success: true, message: 'File removed.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
