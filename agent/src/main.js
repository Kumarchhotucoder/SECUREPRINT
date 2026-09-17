/**
 * SecurePrint Desktop Print Agent - Electron Main Process
 * System Tray + Status Window
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const AgentConnection = require('./connection');

let mainWindow = null;
let tray = null;
let agent = null;

const DEFAULT_SERVER_URL = process.env.SECUREPRINT_URL || 'http://localhost:5001';

function createTray() {
  // Create simple 16x16 tray icon
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open SecurePrint',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Printer Status',
      click: async () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
        if (agent && agent.isPaired()) {
          await agent.syncPrinters();
        }
      }
    },
    {
      label: 'Refresh Printers',
      click: async () => {
        if (agent && agent.isPaired()) {
          await agent.syncPrinters();
        }
      }
    },
    {
      label: 'Reconnect',
      click: async () => {
        if (agent && agent.isPaired()) {
          agent.stop();
          await agent.start();
        }
      }
    },
    {
      label: 'Pause Printing',
      type: 'checkbox',
      checked: false,
      click: (item) => {
        if (agent && agent.printEngine) {
          agent.printEngine.isPaused = item.checked;
        }
      }
    },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Logout / Unpair',
      click: () => {
        if (agent) {
          agent.unpair();
          if (mainWindow) mainWindow.webContents.send('unpaired');
        }
      }
    },
    {
      label: 'Exit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  // Enable auto-start with Windows
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath
    });
  } catch {}

  tray.setToolTip('SecurePrint Desktop Print Agent');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) mainWindow.show();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 680,
    height: 640,
    title: 'SecurePrint Desktop Print Agent',
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

app.whenReady().then(() => {
  createTray();
  createWindow();

  agent = new AgentConnection(DEFAULT_SERVER_URL, {
    logger: {
      info: (...args) => {
        console.log(...args);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent-log', args.join(' '));
        }
      },
      warn: (...args) => {
        console.warn(...args);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent-log', `⚠️ ${args.join(' ')}`);
        }
      },
      error: (...args) => {
        console.error(...args);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent-log', `❌ ${args.join(' ')}`);
        }
      }
    }
  });

  // If already paired, auto-start connection
  if (agent.isPaired()) {
    agent.start().catch((err) => {
      console.error('Failed to auto-start agent:', err);
    });
  }

  // Handle IPC calls
  ipcMain.handle('get-status', () => {
    return {
      isPaired: agent.isPaired(),
      config: agent.config,
      isConnected: Boolean(agent.socket && agent.socket.connected)
    };
  });

  ipcMain.handle('pair-agent', async (event, { pairingCode, serverUrl }) => {
    if (serverUrl) agent.serverUrl = serverUrl;
    const result = await agent.pair(pairingCode);
    await agent.start();
    return result;
  });

  ipcMain.handle('sync-printers', async () => {
    if (!agent.isPaired()) throw new Error('Agent is not paired');
    return await agent.syncPrinters();
  });

  ipcMain.handle('unpair-agent', async () => {
    agent.unpair();
    return true;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in tray
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (agent) agent.stop();
});
