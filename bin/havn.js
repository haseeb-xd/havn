#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const { version } = require('../package.json');
const path        = require('path');
const os          = require('os');
const fs          = require('fs');

const HAVN_DIR = path.join(os.homedir(), '.havn');
const PID_FILE = path.join(HAVN_DIR, 'havn.pid');

program
  .name('havn')
  .description('Local development dashboard — see every running service at a glance')
  .version(version);

program
  .command('start')
  .description('Start the havn dashboard')
  .option('-p, --port <number>', 'Port to run havn on', '1111')
  .option('--no-open', 'Do not auto-open browser')
  .action(async (opts) => {
    const { start } = require('../src/server');
    await start(parseInt(opts.port, 10), opts.open !== false);
  });

program
  .command('stop')
  .description('Stop a running havn instance')
  .action(() => {
    if (!fs.existsSync(PID_FILE)) {
      console.log('  havn is not running');
      process.exit(0);
    }
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    try {
      if (process.platform === 'win32') {
        require('child_process').execSync(`taskkill /F /PID ${pid} 2>nul`);
      } else {
        process.kill(pid, 'SIGTERM');
      }
      try { fs.unlinkSync(PID_FILE); } catch {}
      console.log(`  havn stopped (PID ${pid})`);
    } catch {
      console.log(`  havn: process ${pid} not found (already stopped)`);
      try { fs.unlinkSync(PID_FILE); } catch {}
    }
  });

program
  .command('status')
  .description('Show whether havn is running')
  .action(() => {
    if (!fs.existsSync(PID_FILE)) {
      console.log('  havn: not running');
      process.exit(0);
    }
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    try {
      process.kill(pid, 0); // signal 0 = check only, no actual signal
      console.log(`  havn: running (PID ${pid})`);
    } catch {
      console.log('  havn: not running (stale PID file)');
      try { fs.unlinkSync(PID_FILE); } catch {}
    }
  });

// Default: if called as just `havn` (or `havn --flag`), run start
const firstArg = process.argv[2];
if (!firstArg || firstArg.startsWith('-')) {
  process.argv.splice(2, 0, 'start');
}

program.parse(process.argv);
