const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Agent = require('../models/Agent');
const Printer = require('../models/Printer');
const PrintAttempt = require('../models/PrintAttempt');
const PrintJob = require('../models/PrintJob');
const Document = require('../models/Document');
const Shop = require('../models/Shop');
const { authenticate, requireShopkeeper } = require('../middleware/auth');
const { logEvent, getRequestMeta } = require('../utils/audit');
const { getFileBuffer } = require('../utils/storage');

const AGENT_JWT_SECRET = process.env.JWT_SECRET || 'secureprint-jwt-secret-dev-change-in-prod-2026';
const PAIRING_CODE_VALIDITY_MS = 10 * 60 * 1000; // 10 minutes

// Middleware: Authenticate agent by Bearer token
const authenticateAgent = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Agent authorization token required.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, AGENT_JWT_SECRET);
    if (!decoded.agentId || !decoded.shopId) {
      return res.status(401).json({ success: false, message: 'Invalid agent token payload.' });
    }

    const agent = await Agent.findOne({ agentId: decoded.agentId, shopId: decoded.shopId });
    if (!agent) {
      return res.status(401).json({ success: false, message: 'Agent device not recognized.' });
    }

    req.agent = agent;
    req.shopId = decoded.shopId;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Agent token verification failed.' });
  }
};

const findShopPrinter = async (idOrPrinterId, shopId, populateAgent = false) => {
  if (!idOrPrinterId) return null;
  const isObjectId = mongoose.Types.ObjectId.isValid(idOrPrinterId);
  const query = {
    shopId,
    $or: [
      { printerId: idOrPrinterId },
      ...(isObjectId ? [{ _id: idOrPrinterId }] : [])
    ]
  };
  let q = Printer.findOne(query);
  if (populateAgent) q = q.populate('agentId');
  return await q;
};

// ── 1. GET /api/printers — List printers for authenticated shop
router.get('/', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user._id });
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const [printers, agents] = await Promise.all([
      Printer.find({ shopId: shop._id }).populate('agentId', 'computerName os status lastSeenAt appVersion'),
      Agent.find({ shopId: shop._id }).sort({ lastSeenAt: -1 })
    ]);

    res.json({
      success: true,
      data: {
        printers,
        agents
      }
    });
  } catch (err) {
    next(err);
  }
});

// ── 2. POST /api/printers/pairing-code — Generate 6-digit code for shop computer
router.post('/pairing-code', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user._id });
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    // Generate random 6-digit code (e.g. 482913)
    const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
    const pairingExpiresAt = new Date(Date.now() + PAIRING_CODE_VALIDITY_MS);

    // Save temporary pairing agent record
    const tempAgentId = `agent_${uuidv4().slice(0, 8)}`;
    const agent = new Agent({
      shopId: shop._id,
      agentId: tempAgentId,
      computerName: req.body.computerName || 'Counter Computer',
      status: 'OFFLINE',
      pairingCode,
      pairingExpiresAt
    });
    await agent.save();

    await logEvent('AGENT_PAIRING_INITIATED', {
      shopId: shop._id,
      userId: req.user._id,
      metadata: { pairingCode, tempAgentId }
    });

    res.json({
      success: true,
      data: {
        pairingCode,
        expiresInSeconds: 600,
        expiresAt: pairingExpiresAt
      }
    });
  } catch (err) {
    next(err);
  }
});

// ── 3. POST /api/printers/pair — Print Agent enters 6-digit code to pair
router.post('/pair', async (req, res, next) => {
  try {
    const { pairingCode, computerName, os, osVersion, appVersion } = req.body;
    if (!pairingCode) {
      return res.status(400).json({ success: false, message: 'Pairing code is required.' });
    }

    const agent = await Agent.findOne({
      pairingCode: pairingCode.trim(),
      pairingExpiresAt: { $gt: new Date() }
    }).select('+pairingCode +pairingExpiresAt');

    if (!agent) {
      return res.status(400).json({ success: false, message: 'Invalid or expired pairing code.' });
    }

    const shop = await Shop.findById(agent.shopId);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Associated shop not found.' });
    }

    // Issue permanent agent credentials
    const agentToken = jwt.sign(
      { agentId: agent.agentId, shopId: shop._id.toString() },
      AGENT_JWT_SECRET,
      { expiresIn: '365d' }
    );

    agent.computerName = computerName || agent.computerName || 'Counter Computer';
    agent.os = (os || 'WINDOWS').toString();
    agent.osVersion = osVersion || '';
    agent.appVersion = appVersion || '1.0.0';
    agent.status = 'ONLINE';
    agent.lastSeenAt = new Date();
    agent.pairingCode = undefined; // Single-use consumption
    agent.pairingExpiresAt = undefined;
    await agent.save();

    await logEvent('AGENT_PAIRED_SUCCESSFULLY', {
      shopId: shop._id,
      metadata: { agentId: agent.agentId, computerName: agent.computerName, os: agent.os }
    });

    // Notify shop dashboard in real time
    const io = req.app.get('io');
    if (io) {
      io.to(`shop-${shop._id.toString()}`).emit('agent-connected', {
        agentId: agent.agentId,
        computerName: agent.computerName,
        status: 'ONLINE',
        lastSeenAt: agent.lastSeenAt
      });
    }

    res.json({
      success: true,
      data: {
        agentId: agent.agentId,
        shopId: shop._id,
        shopName: shop.name,
        agentToken,
        message: 'Print Agent paired successfully!'
      }
    });
  } catch (err) {
    next(err);
  }
});

// ── 4. POST /api/printers/sync — Agent syncs discovered OS printers
router.post('/sync', authenticateAgent, async (req, res, next) => {
  try {
    const { printers = [] } = req.body;
    const shopId = req.shopId;
    const agent = req.agent;

    agent.status = 'ONLINE';
    agent.lastSeenAt = new Date();
    await agent.save();

    const registeredPrinters = [];
    for (const p of printers) {
      const systemPrinterName = p.systemPrinterName || p.name;
      if (!systemPrinterName) continue;

      let printer = await Printer.findOne({ agentId: agent._id, systemPrinterName });
      if (!printer) {
        printer = new Printer({
          printerId: `prn_${uuidv4().slice(0, 10)}`,
          shopId,
          agentId: agent._id,
          systemPrinterName,
          name: p.name || systemPrinterName,
          connectionType: p.connectionType || 'WINDOWS_INSTALLED',
          isColorCapable: Boolean(p.isColorCapable),
          supportsDuplex: Boolean(p.supportsDuplex),
          paperSizes: p.paperSizes && p.paperSizes.length ? p.paperSizes : ['A4', 'Letter'],
          isDefault: Boolean(p.isDefault),
          status: p.status || 'READY',
          statusDetails: p.statusDetails || '',
          lastSeenAt: new Date()
        });
      } else {
        printer.status = p.status || 'READY';
        printer.statusDetails = p.statusDetails || '';
        printer.connectionType = p.connectionType || printer.connectionType;
        if (p.isColorCapable !== undefined) printer.isColorCapable = Boolean(p.isColorCapable);
        if (p.supportsDuplex !== undefined) printer.supportsDuplex = Boolean(p.supportsDuplex);
        if (p.paperSizes && p.paperSizes.length) printer.paperSizes = p.paperSizes;
        printer.lastSeenAt = new Date();
      }
      await printer.save();
      registeredPrinters.push(printer);
    }

    // Broadcast update to shop dashboard
    const io = req.app.get('io');
    if (io) {
      io.to(`shop-${shopId.toString()}`).emit('printers-updated', {
        agentId: agent.agentId,
        computerName: agent.computerName,
        printers: registeredPrinters
      });
    }

    res.json({
      success: true,
      data: {
        syncedCount: registeredPrinters.length,
        printers: registeredPrinters
      }
    });
  } catch (err) {
    next(err);
  }
});

// ── 5. PATCH /api/printers/:id — Update printer configuration
router.patch('/:id', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user._id });
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const printer = await findShopPrinter(req.params.id, shop._id);
    if (!printer) return res.status(404).json({ success: false, message: 'Printer not found.' });

    const { name, isDefault, isEnabled, isColorCapable, supportsDuplex } = req.body;
    if (name) printer.name = name.trim();
    if (isEnabled !== undefined) printer.isEnabled = Boolean(isEnabled);
    if (isColorCapable !== undefined) printer.isColorCapable = Boolean(isColorCapable);
    if (supportsDuplex !== undefined) printer.supportsDuplex = Boolean(supportsDuplex);

    if (isDefault) {
      await Printer.updateMany({ shopId: shop._id }, { isDefault: false });
      printer.isDefault = true;
    }

    await printer.save();
    res.json({ success: true, data: printer });
  } catch (err) {
    next(err);
  }
});

// ── 6. POST /api/printers/jobs/:jobId/print — Command print to physical printer
router.post('/jobs/:jobId/print', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const { printerId, copies = 1, colorMode = 'BW', paperSize = 'A4', duplex = false, orientation = 'PORTRAIT', pageRange = 'ALL' } = req.body;

    const shop = await Shop.findOne({ ownerId: req.user._id });
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    // Validate shop subscription
    if (shop.subscription?.status === 'EXPIRED') {
      return res.status(403).json({
        success: false,
        message: 'Your SecurePrint subscription has expired. Please renew your plan to send physical prints.'
      });
    }

    // Validate job
    const job = await PrintJob.findOne({ _id: req.params.jobId, shopId: shop._id });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found in this shop.' });

    // Validate printer
    let printer;
    if (printerId) {
      printer = await findShopPrinter(printerId, shop._id, true);
    } else {
      // Pick default or first enabled printer
      printer = await Printer.findOne({ shopId: shop._id, isEnabled: true, isDefault: true }).populate('agentId')
        || await Printer.findOne({ shopId: shop._id, isEnabled: true }).populate('agentId');
    }

    if (!printer) {
      return res.status(400).json({
        success: false,
        message: 'No printer connected. Please connect a computer with SecurePrint Print Agent or use manual print fallback.'
      });
    }

    const agent = printer.agentId;
    if (!agent) {
      return res.status(400).json({ success: false, message: 'Print agent associated with this printer was not found.' });
    }

    // Enforce color capability
    const finalColorMode = (!printer.isColorCapable && colorMode === 'COLOR') ? 'BW' : colorMode;

    // Idempotency: Create PrintAttempt
    const attemptId = `att_${uuidv4()}`;
    const attempt = new PrintAttempt({
      attemptId,
      jobId: job._id,
      shopId: shop._id,
      agentId: agent._id,
      printerId: printer._id,
      status: 'QUEUED',
      printSettings: {
        copies: Math.min(Math.max(1, Number(copies)), 50),
        colorMode: finalColorMode,
        paperSize: paperSize || 'A4',
        duplex: Boolean(duplex),
        orientation: orientation || 'PORTRAIT',
        pageRange: pageRange || 'ALL'
      }
    });
    await attempt.save();

    // Update job status to PRINTING
    job.status = 'PRINTING';
    job.statusHistory.push({ status: 'PRINTING', timestamp: new Date(), note: `Sent to ${printer.name}` });
    await job.save();

    // Generate short-lived signed file download token (valid 5 min)
    const fileToken = jwt.sign(
      { jobId: job._id.toString(), attemptId, shopId: shop._id.toString() },
      AGENT_JWT_SECRET,
      { expiresIn: '5m' }
    );

    // Build print command payload
    const printInstruction = {
      attemptId,
      jobId: job._id.toString(),
      jobNumber: job.jobNumber,
      customerName: job.customerName,
      printerId: printer.printerId,
      systemPrinterName: printer.systemPrinterName,
      printer: {
        name: printer.name,
        systemPrinterName: printer.systemPrinterName,
        connectionType: printer.connectionType
      },
      downloadUrl: `/api/printers/download-job/${job._id}?token=${fileToken}`,
      fileDownloadUrl: `/api/printers/download-job/${job._id}?token=${fileToken}`,
      options: {
        copies,
        color: finalColorMode === 'COLOR',
        paperSize,
        duplex
      },
      printSettings: attempt.printSettings
    };

    // Emit print instruction to Print Agent via Socket.io
    const io = req.app.get('io');
    let dispatchedViaSocket = false;
    if (io) {
      io.to(`agent-${agent.agentId}`).emit('print-job', printInstruction);
      io.to(`agent-${agent.agentId}`).emit('print-command', printInstruction);
      dispatchedViaSocket = true;

      // Broadcast update to shopkeeper dashboard
      io.to(`shop-${shop._id.toString()}`).emit('job-updated', {
        jobId: job._id.toString(),
        status: 'PRINTING',
        printerName: printer.name
      });
      // Notify customer status page
      io.to(`job-${job._id}`).emit('job-status', {
        jobId: job._id.toString(),
        status: 'PRINTING',
        message: `Your documents are printing on ${printer.name}`
      });
    }

    await logEvent('PRINT_JOB_DISPATCHED', {
      jobId: job._id,
      shopId: shop._id,
      metadata: { attemptId, printerName: printer.name, colorMode: finalColorMode, copies }
    });

    res.json({
      success: true,
      data: {
        attemptId,
        jobId: job._id,
        printerName: printer.name,
        systemPrinterName: printer.systemPrinterName,
        status: 'QUEUED',
        colorMode: finalColorMode,
        dispatchedViaSocket,
        message: `Print command sent to ${printer.name}.`
      }
    });
  } catch (err) {
    next(err);
  }
});

// ── 7. GET /api/printers/download-job/:jobId — Agent securely downloads file using short-lived token
router.get('/download-job/:jobId', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Download token required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, AGENT_JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Expired or invalid download token.' });
    }

    if (decoded.jobId !== req.params.jobId) {
      return res.status(403).json({ success: false, message: 'Token does not match requested job.' });
    }

    const job = await PrintJob.findById(req.params.jobId).populate('sessionId');
    if (!job || job.filesDeleted) {
      return res.status(404).json({ success: false, message: 'Job file not found or already deleted.' });
    }

    const doc = await Document.findOne({ sessionId: job.sessionId._id, deletedAt: null }).select('+storagePath');
    if (!doc || !doc.storagePath) {
      return res.status(404).json({ success: false, message: 'Document storage record missing.' });
    }

    const fileBuffer = getFileBuffer(doc.storagePath);
    res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.originalFilename || 'print.pdf'}"`);
    res.send(fileBuffer);
  } catch (err) {
    next(err);
  }
});

// ── 8. POST /api/printers/attempts/:attemptId/status — Agent reports physical execution status
router.post('/attempts/:attemptId/status', authenticateAgent, async (req, res, next) => {
  try {
    const { status, errorMessage } = req.body;
    const attempt = await PrintAttempt.findOne({ attemptId: req.params.attemptId, shopId: req.shopId });
    if (!attempt) return res.status(404).json({ success: false, message: 'Print attempt not found.' });

    attempt.status = status;
    if (errorMessage) attempt.errorMessage = errorMessage;
    if (status === 'SUBMITTED') attempt.submittedAt = new Date();
    if (status === 'PRINT_COMPLETED') attempt.completedAt = new Date();
    await attempt.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`shop-${req.shopId.toString()}`).emit('print-attempt-update', {
        attemptId: attempt.attemptId,
        jobId: attempt.jobId.toString(),
        status,
        errorMessage
      });
    }

    res.json({ success: true, data: attempt });
  } catch (err) {
    next(err);
  }
});

// ── 9. POST /api/printers/:id/test-print — Generate branded test print
router.post('/:id/test-print', authenticate, requireShopkeeper, async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user._id });
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const printer = await findShopPrinter(req.params.id, shop._id, true);
    if (!printer) return res.status(404).json({ success: false, message: 'Printer not found.' });

    const agent = printer.agentId;
    if (!agent) {
      return res.status(400).json({ success: false, message: 'Associated print agent not found.' });
    }

    const attemptId = `test_${uuidv4().slice(0, 8)}`;
    const testPayload = {
      attemptId,
      isTestPrint: true,
      shopName: shop.name,
      printerName: printer.name,
      systemPrinterName: printer.systemPrinterName,
      printedAt: new Date().toLocaleString('en-IN'),
      printSettings: {
        copies: 1,
        colorMode: printer.isColorCapable ? 'COLOR' : 'BW',
        paperSize: 'A4',
        duplex: false
      }
    };

    const io = req.app.get('io');
    if (io) {
      io.to(`agent-${agent.agentId}`).emit('test-print-command', testPayload);
    }

    res.json({
      success: true,
      data: {
        attemptId,
        printerName: printer.name,
        message: `Test print sent to ${printer.name} via ${agent.computerName}.`
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
