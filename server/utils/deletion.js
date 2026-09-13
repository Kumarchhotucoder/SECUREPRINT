const Document = require('../models/Document');
const PrintSession = require('../models/PrintSession');
const PrintJob = require('../models/PrintJob');
const { deleteFile, deleteSessionDirectory, verifyFileDeleted } = require('./storage');
const { logEvent } = require('./audit');

/**
 * Atomic and immediate file deletion for a PrintJob upon completion or cancellation.
 * 
 * 1. Identifies all documents uploaded for the job's session.
 * 2. Unlinks actual physical files from private storage.
 * 3. Verifies physical file removal from disk.
 * 4. Removes session storage directory.
 * 5. Marks documents as deleted (deletedAt = NOW).
 * 6. Updates PrintSession (status = DELETED, filesDeleted = true, deletedAt = NOW).
 * 7. Updates PrintJob (filesDeleted = true, deletedAt = NOW, cleanupStatus = 'SUCCESS').
 * 8. Broadcasts real-time events to customer and shopkeeper rooms.
 */
const deleteJobFiles = async (jobId, reason = 'COMPLETED', io = null) => {
  let job;
  try {
    job = await PrintJob.findById(jobId);
    if (!job) {
      console.warn(`[DELETION] Job ${jobId} not found.`);
      return { success: false, message: 'Job not found' };
    }

    // Idempotent guard: if already deleted successfully, return current state
    if (job.filesDeleted && job.cleanupStatus === 'SUCCESS') {
      console.log(`[DELETION] Job ${jobId} files already deleted at ${job.deletedAt}`);
      return { success: true, deletedCount: 0, filesDeleted: true, deletedAt: job.deletedAt };
    }

    console.log(`[DELETION] Starting immediate file deletion for Job ${jobId} (Session: ${job.sessionId}), reason: ${reason}`);

    job.cleanupStatus = 'CLEANING';
    await job.save();

    // 1. Fetch all documents for this session (including storagePath)
    const docs = await Document.find({ sessionId: job.sessionId }).select('+storagePath');
    let deletedCount = 0;
    const failedFiles = [];

    for (const doc of docs) {
      if (doc.storagePath) {
        const deleted = deleteFile(doc.storagePath);
        const verified = verifyFileDeleted(doc.storagePath);

        if (!verified) {
          console.error(`[DELETION ERROR] Could not verify physical deletion of ${doc.storagePath}`);
          failedFiles.push(doc.originalFilename || doc.storagePath);
        } else {
          deletedCount++;
        }
      }

      // Mark document record as deleted (revokes any API access)
      doc.deletedAt = new Date();
      await doc.save();

      await logEvent('DOCUMENT_DELETED', {
        sessionId: job.sessionId,
        documentId: doc._id,
        metadata: { filename: doc.originalFilename, reason }
      });
    }

    // 2. Remove session folder from storage
    if (job.sessionId) {
      deleteSessionDirectory(job.sessionId.toString());
    }

    // If any physical file failed to delete, mark as failed and log
    if (failedFiles.length > 0) {
      const errMsg = `Failed to physically delete files: ${failedFiles.join(', ')}`;
      console.error(`[DELETION] ${errMsg}`);
      job.filesDeleted = false;
      job.cleanupStatus = 'FAILED';
      job.cleanupError = errMsg;
      await job.save();

      if (io) {
        io.to(`job-${job._id}`).emit('job-status', {
          jobId: job._id.toString(),
          status: job.status,
          filesDeleted: false,
          cleanupStatus: 'FAILED',
          cleanupError: errMsg
        });
      }

      return { success: false, error: errMsg };
    }

    // 3. Mark deletion success in database
    const now = new Date();

    // Update Session
    await PrintSession.findByIdAndUpdate(job.sessionId, {
      status: 'DELETED',
      filesDeleted: true,
      deletedAt: now
    });

    // Update PrintJob
    job.filesDeleted = true;
    job.deletedAt = now;
    job.cleanupStatus = 'SUCCESS';
    job.cleanupError = null;
    await job.save();

    await logEvent('JOB_FILES_DELETED', {
      jobId: job._id,
      shopId: job.shopId,
      metadata: { deletedCount, deletedAt: now, reason }
    });

    console.log(`[DELETION] Successfully deleted ${deletedCount} files for Job ${jobId} at ${now.toISOString()}`);

    // 4. Emit Real-time Socket.IO notifications
    if (io) {
      // Customer job room
      io.to(`job-${job._id}`).emit('job-files-deleted', {
        jobId: job._id.toString(),
        filesDeleted: true,
        deletedAt: now,
        message: 'Your uploaded documents have been permanently removed.'
      });

      io.to(`job-${job._id}`).emit('job-status', {
        jobId: job._id.toString(),
        status: job.status,
        filesDeleted: true,
        deletedAt: now,
        completedAt: job.completedAt
      });

      // Shopkeeper room (to update queue/history cards in real time)
      const targetShopId = (job.shopId?._id || job.shopId)?.toString();
      if (targetShopId) {
        io.to(`shop-${targetShopId}`).emit('job-updated', {
          jobId: job._id.toString(),
          jobNumber: job.jobNumber,
          status: job.status,
          filesDeleted: true,
          deletedAt: now
        });

        io.to(`shop-${targetShopId}`).emit('job-files-deleted', {
          jobId: job._id.toString(),
          jobNumber: job.jobNumber,
          filesDeleted: true,
          deletedAt: now
        });
      }

      // Session room
      io.to(`session-${job.sessionId}`).emit('session-deleted', {
        sessionId: job.sessionId.toString(),
        filesDeleted: true,
        deletedAt: now,
        reason
      });
    }

    return {
      success: true,
      deletedCount,
      filesDeleted: true,
      deletedAt: now
    };

  } catch (err) {
    console.error(`[DELETION ERROR] Unexpected failure deleting files for Job ${jobId}:`, err);
    if (job) {
      job.filesDeleted = false;
      job.cleanupStatus = 'FAILED';
      job.cleanupError = err.message;
      await job.save();

      if (io) {
        io.to(`job-${job._id}`).emit('job-status', {
          jobId: job._id.toString(),
          status: job.status,
          filesDeleted: false,
          cleanupStatus: 'FAILED',
          cleanupError: err.message
        });
      }
    }
    return { success: false, error: err.message };
  }
};

/**
 * Delete a session and any associated print jobs.
 */
const deleteSession = async (sessionId, reason = 'COMPLETED', io = null) => {
  try {
    console.log(`[DELETION] Triggering deleteSession for session: ${sessionId}, reason: ${reason}`);

    // Check if there is an associated job
    const job = await PrintJob.findOne({ sessionId });
    if (job) {
      return await deleteJobFiles(job._id, reason, io);
    }

    // Otherwise clean up documents and session directly
    const docs = await Document.find({ sessionId }).select('+storagePath');
    let deletedCount = 0;
    for (const doc of docs) {
      if (doc.storagePath) {
        deleteFile(doc.storagePath);
        deletedCount++;
      }
      doc.deletedAt = new Date();
      await doc.save();
    }

    deleteSessionDirectory(sessionId.toString());

    const now = new Date();
    await PrintSession.findByIdAndUpdate(sessionId, {
      status: 'DELETED',
      filesDeleted: true,
      deletedAt: now
    });

    if (io) {
      io.to(`session-${sessionId}`).emit('session-deleted', {
        sessionId: sessionId.toString(),
        filesDeleted: true,
        deletedAt: now,
        reason
      });
    }

    return { success: true, deletedCount, deletedAt: now };
  } catch (err) {
    console.error(`[DELETION] Error deleting session ${sessionId}:`, err);
    return { success: false, error: err.message };
  }
};

/**
 * Delete a single document and its physical file.
 */
const deleteDocument = async (documentId) => {
  const doc = await Document.findById(documentId).select('+storagePath');
  if (!doc || doc.deletedAt) return false;

  doc.deletedAt = new Date();
  await doc.save();

  if (doc.storagePath) {
    deleteFile(doc.storagePath);
  }

  await logEvent('DOCUMENT_DELETED', {
    sessionId: doc.sessionId,
    documentId: doc._id,
    metadata: { filename: doc.originalFilename }
  });

  return true;
};

/**
 * Cleanup expired sessions — called by cron or cleanup endpoint.
 */
const cleanupExpiredSessions = async (io = null) => {
  try {
    const expired = await PrintSession.find({
      status: { $in: ['CREATED', 'UPLOADING', 'READY'] },
      expiresAt: { $lt: new Date() }
    });

    console.log(`[CLEANUP] Found ${expired.length} expired sessions`);

    let cleaned = 0;
    for (const session of expired) {
      await deleteSession(session._id, 'EXPIRED', io);
      await PrintJob.updateMany(
        { sessionId: session._id, status: { $in: ['CREATED', 'READY', 'RECEIVED'] } },
        { status: 'EXPIRED' }
      );
      cleaned++;
    }

    return { cleaned };
  } catch (err) {
    console.error('[CLEANUP] Error:', err);
    return { cleaned: 0, error: err.message };
  }
};

/**
 * ⚡️ Schedule the mandatory 10-second post-payment cleanup.
 * 
 * Flow:
 * 1. Only called AFTER payment verification succeeds (paymentStatus === 'PAID').
 * 2. Sets cleanupScheduledAt = Date.now() + 10000.
 * 3. Broadcasts real-time countdown event to customer and shopkeeper.
 * 4. Server-side setTimeout executes exact physical deletion after 10 seconds.
 * 5. Persistent cleanupScheduledAt in database ensures resilience across server restarts.
 */
const scheduledTimeouts = new Map();

const schedule10SecondCleanup = async (jobId, io = null) => {
  try {
    const job = await PrintJob.findById(jobId);
    if (!job) return { success: false, message: 'Job not found' };

    if (job.filesDeleted) {
      console.log(`[10S-CLEANUP] Job ${jobId} files already deleted.`);
      return { success: true, filesDeleted: true };
    }

    const scheduledAt = new Date(Date.now() + 10000);
    job.status = 'CLEANUP_COUNTDOWN';
    job.cleanupCountdownSeconds = 10;
    job.cleanupScheduledAt = scheduledAt;
    job.cleanupStatus = 'CLEANING';
    await job.save();

    console.log(`[10S-CLEANUP] Scheduled 10-second physical deletion for Job ${jobId} at ${scheduledAt.toISOString()}`);

    // Broadcast countdown start to customer and shopkeeper
    if (io) {
      io.to(`job-${job._id}`).emit('cleanup-countdown', {
        jobId: job._id.toString(),
        countdownSeconds: 10,
        scheduledAt: scheduledAt.toISOString(),
        paymentStatus: 'PAID',
        message: 'Payment verified! Secure file removal begins in 10 seconds.'
      });

      io.to(`shop-${job.shopId}`).emit('job-updated', {
        jobId: job._id.toString(),
        status: 'CLEANUP_COUNTDOWN',
        paymentStatus: 'PAID',
        cleanupScheduledAt: scheduledAt.toISOString()
      });
    }

    // Clear any existing timer for this job to prevent duplicate deletions
    if (scheduledTimeouts.has(jobId.toString())) {
      clearTimeout(scheduledTimeouts.get(jobId.toString()));
    }

    // Schedule exact 10,000ms server-side deletion
    const timer = setTimeout(async () => {
      scheduledTimeouts.delete(jobId.toString());
      try {
        console.log(`[10S-CLEANUP] Timer fired for Job ${jobId} — deleting physical storage files...`);
        const result = await deleteJobFiles(jobId, 'POST_PAYMENT_10S_CLEANUP', io);
        // Ensure final state is COMPLETED with filesDeleted = true
        await PrintJob.findByIdAndUpdate(jobId, { status: 'COMPLETED' });
        console.log(`[10S-CLEANUP] Completed physical deletion for Job ${jobId}:`, result.success);
      } catch (e) {
        console.error(`[10S-CLEANUP ERROR] Failed deletion for Job ${jobId}:`, e);
      }
    }, 10000);

    scheduledTimeouts.set(jobId.toString(), timer);

    return {
      success: true,
      jobId,
      scheduledAt,
      countdownSeconds: 10
    };
  } catch (err) {
    console.error(`[10S-CLEANUP ERROR] Error scheduling cleanup for Job ${jobId}:`, err);
    return { success: false, error: err.message };
  }
};

/**
 * Startup recovery: resume any pending cleanups across server restarts.
 */
const resumePendingCleanups = async (io = null) => {
  try {
    const pendingJobs = await PrintJob.find({
      paymentStatus: 'PAID',
      filesDeleted: false,
      cleanupScheduledAt: { $ne: null }
    });

    console.log(`[CLEANUP-WORKER] Checking pending post-payment cleanups: ${pendingJobs.length} found.`);

    const now = Date.now();
    for (const job of pendingJobs) {
      const scheduledTime = new Date(job.cleanupScheduledAt).getTime();
      const remainingMs = scheduledTime - now;

      if (remainingMs <= 0) {
        // Cleanup was due while server was restarting — execute immediately
        console.log(`[CLEANUP-WORKER] Past due cleanup for Job ${job._id}, executing immediately.`);
        await deleteJobFiles(job._id, 'RECOVERY_CLEANUP', io);
        await PrintJob.findByIdAndUpdate(job._id, { status: 'COMPLETED' });
      } else {
        // Reschedule remaining time
        console.log(`[CLEANUP-WORKER] Rescheduling cleanup for Job ${job._id} in ${remainingMs}ms.`);
        setTimeout(async () => {
          await deleteJobFiles(job._id, 'RECOVERY_CLEANUP', io);
          await PrintJob.findByIdAndUpdate(job._id, { status: 'COMPLETED' });
        }, remainingMs);
      }
    }
  } catch (err) {
    console.error('[CLEANUP-WORKER] Error in resumePendingCleanups:', err);
  }
};

module.exports = {
  deleteJobFiles,
  deleteSession,
  deleteDocument,
  cleanupExpiredSessions,
  schedule10SecondCleanup,
  resumePendingCleanups
};

