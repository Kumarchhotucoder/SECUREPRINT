require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');

// Route imports
const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shops');
const sessionRoutes = require('./routes/sessions');
const documentRoutes = require('./routes/documents');
const jobRoutes = require('./routes/jobs');
const adminRoutes = require('./routes/admin');
const cleanupRoutes = require('./routes/cleanup');
const paymentRoutes = require('./routes/payments');
const subscriptionRoutes = require('./routes/subscriptions');
const printerRoutes = require('./routes/printers');
const Agent = require('./models/Agent');
const Printer = require('./models/Printer');
const { resumePendingCleanups } = require('./utils/deletion');

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
const httpServer = http.createServer(app);

// Socket.IO for real-time job status
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Attach io to app for use in routes
app.set('io', io);

// Security middleware
app.set('trust proxy', 1); // Trust first proxy for correct IP resolution
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.PUBLIC_APP_URL,
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token', 'x-session-token']
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ⚠️ NEVER serve raw uploads directly — all file access goes through authenticated API routes
// app.use('/uploads', express.static(uploadDir));  // INTENTIONALLY DISABLED

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cleanup', cleanupRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/printers', printerRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'SecurePrint API' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);

  // Handle Mongoose Validation Errors → 400
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message).join(', ');
    return res.status(400).json({ success: false, message: messages });
  }

  // Handle Mongoose Duplicate Key Errors → 409
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `${field} already exists.` });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'An unexpected error occurred. Please try again.'
  });
});

// Socket.IO connection
io.on('connection', (socket) => {
  socket.on('join-job', (jobId) => {
    socket.join(`job-${jobId}`);
  });
  socket.on('join-shop', (shopId) => {
    socket.join(`shop-${shopId}`);
  });
  socket.on('join-session', (sessionId) => {
    socket.join(`session-${sessionId}`);
  });

  // Agent connection handler
  socket.on('join-agent', async ({ agentId, shopId }) => {
    if (!agentId || !shopId) return;

    // Verify shop subscription state machine
    try {
      const Shop = require('./models/Shop');
      const shop = await Shop.findById(shopId);
      if (!shop || shop.status !== 'ACTIVE' || !shop.isActive || shop.subscription?.status !== 'ACTIVE') {
        console.warn(`[AGENT REJECTED] Connection rejected for Agent ${agentId} — Shop ${shopId} subscription inactive.`);
        socket.emit('agent-error', {
          code: 'AGENT_CONNECTION_REJECTED',
          reason: 'SUBSCRIPTION_REQUIRED',
          message: 'Your SecurePrint subscription is inactive. Please complete your subscription payment.'
        });
        socket.disconnect(true);
        return;
      }

      socket.agentId = agentId;
      socket.shopId = shopId;
      socket.join(`agent-${agentId}`);

      await Agent.findOneAndUpdate(
        { agentId, shopId },
        { status: 'ONLINE', lastSeenAt: new Date() }
      );
      io.to(`shop-${shopId}`).emit('agent-status-changed', {
        agentId,
        status: 'ONLINE',
        lastSeenAt: new Date()
      });
      console.log(`[AGENT CONNECTED] Agent ${agentId} online for Shop ${shopId}`);
    } catch (e) {
      console.error('[AGENT SOCKET ERROR]', e.message);
    }
  });

  socket.on('agent-heartbeat', async ({ agentId, shopId }) => {
    if (!agentId) return;
    try {
      await Agent.findOneAndUpdate(
        { agentId },
        { status: 'ONLINE', lastSeenAt: new Date() }
      );
    } catch (e) {}
  });

  socket.on('disconnect', async () => {
    if (socket.agentId && socket.shopId) {
      const { agentId, shopId } = socket;
      try {
        const agent = await Agent.findOneAndUpdate(
          { agentId, shopId },
          { status: 'OFFLINE', lastSeenAt: new Date() },
          { new: true }
        );

        if (agent) {
          // Mark this agent's printers as OFFLINE
          await Printer.updateMany(
            { agentId: agent._id },
            { status: 'OFFLINE', lastSeenAt: new Date() }
          );

          io.to(`shop-${shopId}`).emit('agent-status-changed', {
            agentId,
            status: 'OFFLINE',
            lastSeenAt: new Date()
          });
          console.log(`[AGENT DISCONNECTED] Agent ${agentId} offline for Shop ${shopId}`);
        }
      } catch (e) {
        console.error('[AGENT DISCONNECT ERROR]', e.message);
      }
    }
  });
});

// Connect DB then start
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`\n🔒 SecurePrint server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   MongoDB: connected`);
    console.log(`   Upload dir: ${path.resolve(uploadDir)}\n`);

    // Check for any cleanups pending across restart
    resumePendingCleanups(io);
  });
}).catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

module.exports = { app, io };
