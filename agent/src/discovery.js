/**
 * SecurePrint Desktop Print Agent - Hardware & OS Printer Discovery Engine
 * Supports:
 * - Windows (Win32_Printer WMI / CIM via PowerShell)
 * - macOS & Linux (CUPS lpstat -p -d -v)
 * Honest reporting: Real hardware statuses, connection types, and color capability.
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * Determine connection type from Windows port name or Unix device URI
 */
function parseConnectionType(portOrUri = '') {
  const str = (portOrUri || '').toLowerCase();
  if (str.includes('usb') || str.includes('dot4')) {
    return 'USB';
  }
  if (str.includes('ipp://') || str.includes('ipps://') || str.includes('socket://') || str.includes('lpd://')) {
    if (str.includes('wifi') || str.includes('wireless') || str.includes('wlan') || str.includes('dnssd') || str.includes('mdns')) {
      return 'WIFI';
    }
    return 'LAN';
  }
  if (str.startsWith('\\\\')) {
    return 'SHARED';
  }
  if (str.includes('wsd') || str.includes('192.168.') || str.includes('10.') || str.includes('172.')) {
    return 'WIFI';
  }
  return 'WINDOWS_INSTALLED';
}

/**
 * Infer color capability based on printer name / driver if WMI/PPD doesn't explicitly declare
 */
function inferColorCapability(name = '', driver = '') {
  const text = `${name} ${driver}`.toLowerCase();
  if (text.includes('color') || text.includes('colour') || text.includes('tank') || text.includes('deskjet') || text.includes('inkjet') || text.includes('photo') || text.includes('pixma') || text.includes('ecotank')) {
    return true;
  }
  if (text.includes('mono') || text.includes('m1005') || text.includes('hl-') || text.includes('1020') || text.includes('laserjet pro m') || text.includes('black')) {
    return false;
  }
  // Default to false for enterprise laser printers unless marked color
  return false;
}

function extractManufacturerAndModel(name = '', driver = '') {
  const combined = `${name} ${driver}`;
  const known = ['HP', 'Hewlett-Packard', 'Epson', 'Canon', 'Brother', 'Xerox', 'Ricoh', 'Samsung', 'Lexmark', 'Konica', 'Kyocera', 'Pantum', 'Zebra'];
  for (const brand of known) {
    const regex = new RegExp(`\\b${brand}\\b`, 'i');
    if (regex.test(combined)) {
      const cleanBrand = brand === 'Hewlett-Packard' ? 'HP' : brand;
      const model = name.replace(regex, '').trim() || driver.replace(regex, '').trim();
      return { manufacturer: cleanBrand, model: model || name };
    }
  }
  return { manufacturer: 'Generic / Windows Driver', model: name };
}

/**
 * Windows Discovery via PowerShell CimInstance
 */
async function discoverWindowsPrinters() {
  const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Printer | Select-Object Name, PortName, DriverName, Default, PrinterStatus, ExtendedPrinterStatus, DetectedErrorState, WorkOffline, Color, Duplex, DeviceID | ConvertTo-Json -Compress"`;
  try {
    const { stdout } = await execAsync(cmd, { timeout: 10000 });
    if (!stdout.trim()) return [];
    
    let raw = JSON.parse(stdout.trim());
    if (!Array.isArray(raw)) {
      raw = [raw];
    }

    return raw.map((p) => {
      // Determine physical / spooler status
      let status = 'READY';
      let statusDetails = '';

      if (p.WorkOffline || p.PrinterStatus === 7 || p.ExtendedPrinterStatus === 7) {
        status = 'OFFLINE';
      } else if (p.DetectedErrorState === 5) {
        status = 'PAPER_OUT';
        statusDetails = 'Out of paper';
      } else if (p.DetectedErrorState === 9) {
        status = 'PAPER_JAM';
        statusDetails = 'Paper jam detected';
      } else if (p.DetectedErrorState === 6) {
        status = 'LOW_TONER';
        statusDetails = 'Toner/Ink low';
      } else if (p.PrinterStatus === 4 || p.ExtendedPrinterStatus === 4) {
        status = 'PRINTING';
      } else if (p.PrinterStatus === 5 || p.ExtendedPrinterStatus === 5) {
        status = 'WARMUP';
      } else if (p.ExtendedPrinterStatus === 9) {
        status = 'ERROR';
        statusDetails = 'Printer error';
      }

      const connectionType = parseConnectionType(p.PortName);
      const { manufacturer, model } = extractManufacturerAndModel(p.Name, p.DriverName);
      const isColorCapable = p.Color !== null && p.Color !== undefined 
        ? Boolean(p.Color) 
        : inferColorCapability(p.Name, p.DriverName);

      return {
        name: p.Name,
        systemPrinterName: p.Name,
        manufacturer,
        model,
        deviceIdentifier: p.PortName || p.DeviceID || p.Name,
        connectionType,
        status,
        statusDetails,
        isDefault: Boolean(p.Default),
        isColorCapable,
        supportsDuplex: Boolean(p.Duplex),
        paperSizes: ['A4', 'Letter', 'Legal'],
        deviceUri: p.PortName || ''
      };
    });
  } catch (err) {
    console.warn('[Discovery] Windows printer discovery error:', err.message);
    return [];
  }
}

/**
 * macOS / Linux Discovery via CUPS lpstat
 */
async function discoverUnixPrinters() {
  try {
    // 1. Get printer device URIs
    let deviceMap = {};
    try {
      const { stdout: vOut } = await execAsync('lpstat -v', { timeout: 5000 });
      const lines = vOut.split('\n');
      for (const line of lines) {
        const match = line.match(/^device for ([^:]+):\s*(.+)$/i);
        if (match) {
          deviceMap[match[1].trim()] = match[2].trim();
        }
      }
    } catch {}

    // 2. Get default printer
    let defaultPrinter = '';
    try {
      const { stdout: dOut } = await execAsync('lpstat -d', { timeout: 5000 });
      const match = dOut.match(/system default destination:\s*(.+)$/i);
      if (match) defaultPrinter = match[1].trim();
    } catch {}

    // 3. Get printer list & status
    const { stdout: pOut } = await execAsync('lpstat -p', { timeout: 5000 });
    const pLines = pOut.split('\n');
    const printers = [];

    for (const line of pLines) {
      const match = line.match(/^printer\s+([^\s]+)\s+(is idle|is printing|disabled)/i);
      if (match) {
        const sysName = match[1].trim();
        const rawState = match[2].toLowerCase();
        let status = 'READY';
        if (rawState.includes('disabled') || rawState.includes('offline')) {
          status = 'OFFLINE';
        } else if (rawState.includes('printing')) {
          status = 'PRINTING';
        }

        const uri = deviceMap[sysName] || '';
        const connectionType = parseConnectionType(uri);
        const displayName = sysName.replace(/_/g, ' ');
        const { manufacturer, model } = extractManufacturerAndModel(displayName, uri);
        const isColorCapable = inferColorCapability(displayName, uri);

        printers.push({
          name: displayName,
          systemPrinterName: sysName,
          manufacturer,
          model,
          deviceIdentifier: uri || sysName,
          connectionType,
          status,
          isDefault: sysName === defaultPrinter,
          isColorCapable,
          supportsDuplex: true,
          paperSizes: ['A4', 'Letter', 'Legal'],
          deviceUri: uri
        });
      }
    }

    return printers;
  } catch (err) {
    console.warn('[Discovery] Unix printer discovery error:', err.message);
    return [];
  }
}

/**
 * Public discovery function: discovers all installed physical/OS printers for current host
 * Strictly NO fake printers: returns empty array if no physical/installed printers exist.
 */
async function discoverPrinters() {
  let printers = [];
  if (process.platform === 'win32') {
    printers = await discoverWindowsPrinters();
  } else {
    printers = await discoverUnixPrinters();
  }

  // Zero fake fallback: return actual hardware discovery results
  return printers;
}

module.exports = {
  discoverPrinters,
  parseConnectionType,
  inferColorCapability,
  extractManufacturerAndModel
};
