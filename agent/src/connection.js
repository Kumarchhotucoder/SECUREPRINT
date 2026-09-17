/**
 * SecurePrint Desktop Print Agent - Cloud Connection & Socket Manager
 * Handles:
 * - Pairing code exchange (POST /api/printers/pair)
 * - Persistent configuration storage in user home directory
 * - Outbound-only WSS / Socket.IO connection
 * - Automatic hardware printer discovery & synchronization
 * - Bi-directional heartbeat and command dispatch
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const io = require('socket.io-client');
const { discoverPrinters } = require('./discovery');
const PrintEngine = require('./printer-engine');

class AgentConnection {
  constructor(serverUrl, options = {}) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.configFile = path.join(os.homedir(), '.secureprint_agent_config.json');
    this.logger = options.logger || console;
    this.config = this._loadConfig();
    this.socket = null;
    this.printEngine = null;
    this.heartbeatTimer = null;
    this.syncTimer = null;
  }

  _loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      }
    } catch (err) {
      this.logger.warn('[Agent] Could not read existing config:', err.message);
    }
    return {};
  }

  _saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');
      this.logger.info('[Agent] Saved config to:', this.configFile);
    } catch (err) {
      this.logger.error('[Agent] Failed to write config:', err.message);
    }
  }

  isPaired() {
    return Boolean(this.config.agentToken && this.config.agentId && this.config.shopId);
  }

  /**
   * Pair with shop using 6-digit code
   */
  async pair(pairingCode) {
    this.logger.info(`[Agent] Pairing with code "${pairingCode}" on ${this.serverUrl}...`);
    const payload = {
      pairingCode: pairingCode.trim().toUpperCase(),
      computerName: os.hostname(),
      os: `${os.type()} ${os.release()} (${os.arch()})`
    };

    const res = await axios.post(`${this.serverUrl}/api/printers/pair`, payload, {
      timeout: 10000
    });

    if (!res.data || !res.data.success) {
      throw new Error(res.data?.message || 'Pairing failed');
    }

    const { agentToken, agentId, shopId, shopName } = res.data.data;
    this._saveConfig({
      agentToken,
      agentId,
      shopId,
      shopName,
      serverUrl: this.serverUrl,
      pairedAt: new Date().toISOString()
    });

    this.logger.info(`[Agent] Successfully paired with Shop "${shopName}" (ID: ${shopId})!`);
    return res.data.data;
  }

  /**
   * Start Agent connection & Socket.io loop
   */
  async start() {
    if (!this.isPaired()) {
      throw new Error('Agent is not paired yet. Please pair using a 6-digit code first.');
    }

    const { agentToken, agentId, shopId } = this.config;
    this.logger.info(`[Agent] Starting connection to ${this.serverUrl} for Agent ${agentId}...`);

    // Initialize Print Engine
    this.printEngine = new PrintEngine(this.serverUrl, agentToken, { logger: this.logger });

    // Initialize Socket.io connection (Outbound WSS/HTTPS only)
    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      auth: {
        token: agentToken
      }
    });

    this.socket.on('connect', async () => {
      this.logger.info(`[Agent] Connected to SecurePrint Cloud via WebSocket (Socket ID: ${this.socket.id})`);
      
      // Join agent specific room
      this.socket.emit('join-agent', {
        agentId,
        shopId,
        computerName: os.hostname(),
        os: `${os.type()} ${os.release()}`,
        appVersion: '1.0.0'
      });

      // Discover and sync local printers immediately
      await this.syncPrinters();
    });

    this.socket.on('disconnect', (reason) => {
      this.logger.warn(`[Agent] Disconnected from SecurePrint Cloud: ${reason}`);
    });

    this.socket.on('connect_error', (err) => {
      this.logger.error(`[Agent] Connection error: ${err.message}`);
    });

    // Listen for on-demand discovery scan request
    this.socket.on('discover-printers', async (data, callback) => {
      this.logger.info('[Agent] Received on-demand discover-printers request from cloud');
      const printers = await this.syncPrinters();
      if (typeof callback === 'function') {
        callback({ success: true, count: printers.length, printers });
      }
    });

    // Listen for test print command
    this.socket.on('test-print-command', async (testData) => {
      this.logger.info('[Agent] Received test-print-command from cloud:', testData.attemptId);
      if (this.printEngine) {
        await this.printEngine.executeTestPrint(testData);
      }
    });

    // Listen for agent subscription/authorization rejection
    this.socket.on('agent-error', (errData) => {
      if (errData?.reason === 'SUBSCRIPTION_REQUIRED') {
        this.logger.error(`\n[Agent] ====================================================`);
        this.logger.error(`[Agent] ACCESS REJECTED: SUBSCRIPTION REQUIRED`);
        this.logger.error(`[Agent] "${errData.message || 'Your SecurePrint subscription is inactive. Please complete your subscription payment.'}"`);
        this.logger.error(`[Agent] ====================================================\n`);
      } else {
        this.logger.error(`[Agent] Error from cloud:`, errData?.message || errData);
      }
    });

    // Listen for incoming print jobs
    this.socket.on('print-job', (jobData) => {
      this.logger.info(`[Agent] Received print-job event from cloud:`, jobData.attemptId);
      this.printEngine.enqueueJob(jobData);
    });

    // Listen for ping
    this.socket.on('ping-request', () => {
      this.socket.emit('pong-response', {
        agentId,
        timestamp: Date.now()
      });
    });

    // Setup periodic printer sync (every 60 seconds)
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.syncPrinters().catch((err) => {
          this.logger.warn('[Agent] Background printer sync warning:', err.message);
        });
      }
    }, 60000);

    // Setup heartbeat (every 30 seconds)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('agent-heartbeat', {
          agentId,
          timestamp: Date.now()
        });
      }
    }, 30000);
  }

  /**
   * Scan local OS printers and sync to cloud
   */
  async syncPrinters() {
    try {
      this.logger.info('[Agent] Scanning system for connected physical & network printers...');
      const printers = await discoverPrinters();
      this.logger.info(`[Agent] Found ${printers.length} printer(s):`, printers.map(p => `${p.name} [${p.connectionType}, ${p.status}]`));

      const res = await axios.post(
        `${this.serverUrl}/api/printers/sync`,
        { printers },
        {
          headers: {
            Authorization: `Bearer ${this.config.agentToken}`
          },
          timeout: 10000
        }
      );

      if (res.data?.success) {
        this.logger.info('[Agent] Printers successfully synchronized with SecurePrint Cloud.');
      }
      return printers;
    } catch (err) {
      this.logger.error('[Agent] Failed to sync printers to cloud:', err.message);
      return [];
    }
  }

  stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.logger.info('[Agent] Stopped.');
  }

  unpair() {
    this.stop();
    try {
      if (fs.existsSync(this.configFile)) {
        fs.unlinkSync(this.configFile);
      }
      this.config = {};
      this.logger.info('[Agent] Successfully unpaired and cleared local config.');
    } catch (err) {
      this.logger.error('[Agent] Failed to remove config file:', err.message);
    }
  }
}

module.exports = AgentConnection;
