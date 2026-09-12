const express = require('express');
const router = express.Router();
const PrintSession = require('../models/PrintSession');
const PrintJob = require('../models/PrintJob');
const Document = require('../models/Document');
const Shop = require('../models/Shop');
const { hashToken, hashFileBuffer } = require('../utils/crypto');
const { calculatePrice } = require('../utils/pricing');
const { deleteSession, deleteJobFiles } = require('../utils/deletion');
const { logEvent, getRequestMeta } = require('../utils/audit');
const { authenticate, requireShopkeeper } = require('../middleware/auth');
const { getFileBuffer } = require('../utils/storage');

/**
 * Verify customer session access.
 */
const verifyCustomerSession = async (req, res) => {
  const rawToken = req.headers['x-session-token'];
  if (!rawToken) {
    res.status(401).json({ success: false, message: 'Session token required.' });
    return null;
  }
  const tokenHash = hashToken(rawToken);
  const sessionId = req.body.sessionId || req.params.sessionId;
  if (!sessionId) {
    res.status(400).json({ success: false, message: 'Session ID is required.' });
    return null;
  }
  const session = await PrintSession.findOne({ _id: sessionId, secureTokenHash: tokenHash });
  if (!session) {
    await logEvent('UNAUTHORIZED_ACCESS', { ...getRequestMeta(req), metadata: { reason: 'Token mismatch for job creation' } }, 'WARNING');
    res.status(401).json({ success: false, message: 'Invalid session.' });
    return null;
  }
  if (session.isExpired() || ['DELETED', 'CANCELLED', 'EXPIRED'].includes(session.status)) {
    res.status(410).json({ success: false, message: 'Session expired.', code: 'SESSION_EXPIRED' });
    return null;
  }
  return session;
};

// POST /api/jobs — create a print job from a session
router.post('/', async (req, res, next) => {
  try {
    const { sessionId, copies, colorMode, paperSize, duplex, pagesPerSheet } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'Session ID is required.' });

    const session = await verifyCustomerSession(req, res);
    if (!session) return;

    // Get all documents in this session
    const docs = await Document.find({ sessionId: session._id, deletedAt: null });
    if (docs.length === 0) {
      return res.status(400).json({ success: false, message: 'No documents found in session.' });
    }

    const shop = await Shop.findById(session.shopId);
    const totalPages = docs.reduce((sum, d) => sum + d.pageCount, 0);

    const pricing = calculatePrice({
      totalPages,
      colorMode: colorMode || 'BW',
      copies: copies || 1,
      duplex: duplex || false,
      pagesPerSheet: pagesPerSheet || 1,
      shopPricing: shop?.pricing
    });

    const customerName = session.customerName || req.body.customerName || 'Customer';

    const job = await PrintJob.create({
      sessionId: session._id,
      shopId: session.shopId,
      customerName,
      copies: copies || 1,
      colorMode: colorMode || 'BW',
      paperSize: paperSize || 'A4',
      duplex: duplex || false,
      pagesPerSheet: pagesPerSheet || 1,
      totalFiles: docs.length,
      totalPages,
      estimatedPrice: pricing.estimatedPrice,
      status: 'READY',
      statusHistory: [{ status: 'READY', timestamp: new Date() }]
    });

    await logEvent('JOB_CREATED', {
      sessionId: session._id,
      shopId: session.shopId,
      jobId: job._id,
      ...getRequestMeta(req),
      metadata: { customerName, totalFiles: docs.length, totalPages, estimatedPrice: pricing.estimatedPrice }
    });

    // Notify shop dashboard via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`shop-${session.shopId}`).emit('new-job', {
        jobId: job._id,
        jobNumber: job.jobNumber,
        customerName: job.customerName,
        totalFiles: job.totalFiles,
        totalPages: job.totalPages,
        status: job.status,
        createdAt: job.createdAt
      });
    }

    res.status(201).json({
      success: true,
      data: {
        jobId: job._id,
        jobNumber: job.jobNumber,
        customerName: job.customerName,
        status: job.status,
        totalFiles: job.totalFiles,
        totalPages: job.totalPages,
        estimatedPrice: job.estimatedPrice,
        currency: pricing.currency
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id — get job details
router.get('/:id', async (req, res, next) => {
  try {
    const job = await PrintJob.findById(req.params.id)
      .populate('sessionId', 'expiresAt status customerSessionId')
      .populate('shopId', 'name verificationStatus');

    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    // Authorization: customer (via session token) OR shopkeeper (via JWT)
    const rawToken = req.headers['x-session-token'];
    const authHeader = req.headers['authorization'];

    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      const session = await PrintSession.findOne({ _id: job.sessionId._id || job.sessionId, secureTokenHash: tokenHash });
      if (!session) return res.status(403).json({ success: false, message: 'Access denied.' });
    } else if (authHeader) {
      const { verifyAccessToken, extractBearerToken } = require('../utils/jwt');
      const token = extractBearerToken(req);
      try {
        const decoded = verifyAccessToken(token);
        if (decoded.role !== 'SUPER_ADMIN') {
          const shop = await Shop.findOne({ _id: job.shopId._id || job.shopId, ownerId: decoded.userId });
          if (!shop) return res.status(403).json({ success: false, message: 'Access denied: You do not have permission to access jobs for another tenant.' });
        }
      } catch {
        return res.status(401).json({ success: false, message: 'Invalid token.' });
      }
    } else {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    // Get documents metadata (not content)
    const docs = await Document.find({ sessionId: job.sessionId._id || job.sessionId, deletedAt: null })
      .select('-storagePath').sort({ displayOrder: 1 });

    await logEvent('JOB_ACCESSED', { jobId: job._id, ...getRequestMeta(req) });

    res.json({
      success: true,
      data: {
        ...job.toObject(),
        documents: docs
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:id/receive — shopkeeper marks job as RECEIVED
router.post('/:id/receive', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const job = await PrintJob.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    const shop = await Shop.findOne({ _id: job.shopId, ownerId: req.user._id });
    if (!shop) return res.status(403).json({ success: false, message: 'Access denied.' });

    if (job.status !== 'READY') {
      return res.status(400).json({ success: false, message: `Cannot receive job in ${job.status} status.` });
    }

    job.status = 'RECEIVED';
    job.statusHistory.push({ status: 'RECEIVED', timestamp: new Date() });
    await job.save();

    // Notify customer
    const io = req.app.get('io');
    if (io) {
      io.to(`job-${job._id}`).emit('job-status', { jobId: job._id, status: 'RECEIVED', shopName: shop.name });
    }

    res.json({ success: true, data: { status: job.status } });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:id/print — shopkeeper starts printing
router.post('/:id/print', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const job = await PrintJob.findById(req.params.id).populate('sessionId');
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    const shop = await Shop.findOne({ _id: job.shopId, ownerId: req.user._id });
    if (!shop) return res.status(403).json({ success: false, message: 'Access denied.' });

    if (!['READY', 'RECEIVED'].includes(job.status)) {
      return res.status(400).json({ success: false, message: `Cannot print job in ${job.status} status.` });
    }

    // Integrity check: verify document hashes haven't changed
    const docs = await Document.find({ sessionId: job.sessionId._id, deletedAt: null }).select('+storagePath');
    const integrityErrors = [];

    for (const doc of docs) {
      try {
        const buffer = getFileBuffer(doc.storagePath);
        const currentHash = hashFileBuffer(buffer);
        if (currentHash !== doc.sha256Hash) {
          integrityErrors.push(doc.originalFilename);
        }
      } catch (e) {
        integrityErrors.push(doc.originalFilename);
      }
    }

    if (integrityErrors.length > 0) {
      await logEvent('JOB_FAILED', {
        jobId: job._id,
        shopId: shop._id,
        metadata: { reason: 'Integrity check failed', files: integrityErrors }
      }, 'CRITICAL');
      return res.status(409).json({
        success: false,
        message: 'Document integrity check failed. The job has been flagged and stopped for security.',
        flaggedFiles: integrityErrors
      });
    }

    job.status = 'PRINTING';
    job.statusHistory.push({ status: 'PRINTING', timestamp: new Date() });
    await job.save();

    await logEvent('JOB_PRINT_STARTED', { jobId: job._id, shopId: shop._id, ...getRequestMeta(req) });

    const io = req.app.get('io');
    if (io) {
      io.to(`job-${job._id}`).emit('job-status', { jobId: job._id, status: 'PRINTING', shopName: shop.name });
    }

    res.json({ success: true, data: { status: job.status } });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:id/complete — shopkeeper marks job complete
router.post('/:id/complete', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const { finalPrice, note } = req.body || {};
    const job = await PrintJob.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    const shop = await Shop.findOne({ _id: job.shopId, ownerId: req.user._id });
    if (!shop) return res.status(403).json({ success: false, message: 'Access denied.' });

    if (!['READY', 'PRINTING'].includes(job.status)) {
      return res.status(400).json({ success: false, message: `Job must be in READY or PRINTING status to complete.` });
    }

    const completionTime = new Date();
    job.status = 'AWAITING_PAYMENT';
    job.completedAt = completionTime;
    job.finalPrice = finalPrice || job.estimatedPrice;
    job.paymentStatus = job.paymentStatus || 'PENDING';
    job.filesDeleted = false;
    if (note) job.shopNote = note;
    job.statusHistory.push({ status: 'AWAITING_PAYMENT', timestamp: completionTime, note: 'Printing completed. Awaiting customer payment.' });
    await job.save();

    await logEvent('JOB_PRINTING_COMPLETED', { jobId: job._id, shopId: shop._id, ...getRequestMeta(req) });

    const io = req.app.get('io');
    if (io) {
      // Notify customer status page to show [ PAY NOW ]
      io.to(`job-${job._id}`).emit('job-status', {
        jobId: job._id.toString(),
        status: 'AWAITING_PAYMENT',
        shopName: shop.name,
        finalPrice: job.finalPrice,
        completedAt: job.completedAt,
        paymentStatus: 'PENDING',
        filesDeleted: false,
        message: 'Your printing is completed. Please complete the payment to the shop.'
      });

      // Update shopkeeper dashboard card
      io.to(`shop-${job.shopId}`).emit('job-updated', {
        jobId: job._id.toString(),
        status: 'AWAITING_PAYMENT',
        paymentStatus: 'PENDING',
        completedAt: job.completedAt,
        finalPrice: job.finalPrice,
        filesDeleted: false
      });
    }

    res.json({
      success: true,
      data: {
        jobId: job._id,
        jobNumber: job.jobNumber,
        status: job.status,
        completedAt: job.completedAt,
        paymentStatus: job.paymentStatus,
        filesDeleted: job.filesDeleted,
        finalPrice: job.finalPrice,
        message: 'Printing marked as completed. Waiting for customer payment.'
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:id/cleanup-retry — safely retry physical file deletion if previously failed
router.post('/:id/cleanup-retry', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const job = await PrintJob.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    const shop = await Shop.findOne({ _id: job.shopId, ownerId: req.user._id });
    if (!shop) return res.status(403).json({ success: false, message: 'Access denied.' });

    const io = req.app.get('io');
    const result = await deleteJobFiles(job._id, 'RETRY', io);

    res.json({ success: result.success, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:id/cancel — cancel a job
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const job = await PrintJob.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    if (['COMPLETED', 'CANCELLED', 'DELETED'].includes(job.status)) {
      return res.status(400).json({ success: false, message: 'Job cannot be cancelled in its current state.' });
    }

    // Verify customer or shopkeeper
    const rawToken = req.headers['x-session-token'];
    const authHeader = req.headers['authorization'];

    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      const session = await PrintSession.findOne({ _id: job.sessionId, secureTokenHash: tokenHash });
      if (!session) return res.status(403).json({ success: false, message: 'Access denied.' });
    } else if (authHeader) {
      const { verifyAccessToken, extractBearerToken } = require('../utils/jwt');
      const token = extractBearerToken(req);
      try {
        const decoded = verifyAccessToken(token);
        const shop = await Shop.findOne({ _id: job.shopId, ownerId: decoded.userId });
        if (!shop) return res.status(403).json({ success: false, message: 'Access denied.' });
      } catch {
        return res.status(401).json({ success: false, message: 'Invalid token.' });
      }
    } else {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const cancelTime = new Date();
    job.status = 'CANCELLED';
    job.statusHistory.push({ status: 'CANCELLED', timestamp: cancelTime });
    await job.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`job-${job._id}`).emit('job-status', { jobId: job._id.toString(), status: 'CANCELLED' });
    }

    // Trigger immediate physical file deletion
    await deleteJobFiles(job._id, 'CANCELLED', io);

    res.json({ success: true, data: { status: 'CANCELLED' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
