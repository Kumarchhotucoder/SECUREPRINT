#!/usr/bin/env node
/**
 * SecurePrint Print Agent - Command Line Runner
 * Usage:
 *   node cli.js pair <6-digit-code> [serverUrl]
 *   node cli.js start [serverUrl]
 *   node cli.js status
 *   node cli.js printers
 *   node cli.js unpair
 */

const readline = require('readline');
const AgentConnection = require('./src/connection');
const { discoverPrinters } = require('./src/discovery');

const DEFAULT_SERVER_URL = process.env.SECUREPRINT_URL || 'http://localhost:5001';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';

  console.log('=====================================================');
  console.log('  🖨️  SECUREPRINT DESKTOP PRINT AGENT (v1.0.0)');
  console.log('=====================================================\n');

  if (command === 'printers' || command === 'discovery') {
    console.log('[CLI] Scanning local hardware & OS printers...');
    const printers = await discoverPrinters();
    console.log(`\nFound ${printers.length} printer(s):\n`);
    printers.forEach((p, idx) => {
      console.log(`${idx + 1}. ${p.name}`);
      console.log(`   - System Name: ${p.systemPrinterName}`);
      console.log(`   - Connection:  ${p.connectionType}`);
      console.log(`   - Status:      ${p.status}`);
      console.log(`   - Color:       ${p.isColorCapable ? 'Yes 🎨' : 'Black & White only ⬛'}`);
      console.log(`   - Duplex:      ${p.supportsDuplex ? 'Yes' : 'No'}`);
      console.log(`   - Default:     ${p.isDefault ? 'Yes' : 'No'}`);
      console.log('');
    });
    process.exit(0);
  }

  const serverUrl = args[2] || args[1] || DEFAULT_SERVER_URL;
  const agent = new AgentConnection(serverUrl);

  if (command === 'status') {
    if (agent.isPaired()) {
      console.log('Status: PAIRED');
      console.log(`Shop: ${agent.config.shopName} (ID: ${agent.config.shopId})`);
      console.log(`Agent ID: ${agent.config.agentId}`);
      console.log(`Paired At: ${agent.config.pairedAt}`);
      console.log(`Server: ${agent.config.serverUrl || serverUrl}`);
    } else {
      console.log('Status: NOT PAIRED');
      console.log('Run "node cli.js pair <6-digit-code>" to pair this computer with your shop.');
    }
    process.exit(0);
  }

  if (command === 'unpair') {
    agent.unpair();
    console.log('Computer unpaired successfully.');
    process.exit(0);
  }

  if (command === 'pair') {
    let pairingCode = args[1];
    if (!pairingCode) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      pairingCode = await new Promise((resolve) => {
        rl.question('Enter 6-digit Pairing Code from SecurePrint Dashboard: ', (ans) => {
          rl.close();
          resolve(ans.trim());
        });
      });
    }

    if (!pairingCode) {
      console.error('Error: Pairing code is required.');
      process.exit(1);
    }

    try {
      console.log(`Attempting pairing with server: ${serverUrl}...`);
      await agent.pair(pairingCode);
      console.log('Pairing complete! Starting print agent daemon...\n');
      await agent.start();
    } catch (err) {
      console.error('\n❌ Pairing failed:', err.response?.data?.message || err.message);
      process.exit(1);
    }
    return;
  }

  if (command === 'start') {
    if (!agent.isPaired()) {
      console.log('⚠️  This computer is not paired with any SecurePrint shop yet.');
      console.log('Please obtain a 6-digit code from Shopkeeper Dashboard -> Printers, then run:');
      console.log('  node cli.js pair <CODE>\n');
      process.exit(1);
    }

    try {
      await agent.start();
      console.log('🟢 Print Agent is active and listening for cloud print jobs...');
      console.log('Press Ctrl+C to stop.\n');
    } catch (err) {
      console.error('❌ Failed to start agent:', err.message);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('Fatal agent error:', err);
  process.exit(1);
});
