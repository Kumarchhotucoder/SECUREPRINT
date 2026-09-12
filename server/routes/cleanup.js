const express = require('express');
const router = express.Router();
const { cleanupExpiredSessions } = require('../utils/deletion');

// POST /api/cleanup/expired — trigger expired session cleanup
// In production this should be called by a cron job or internal scheduler
// Protected by a simple secret to prevent public access
router.post('/expired', async (req, res, next) => {
  try {
    const secret = req.headers['x-cleanup-secret'];
    if (secret !== process.env.JWT_SECRET) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }
    const io = req.app.get('io');
    const result = await cleanupExpiredSessions(io);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
