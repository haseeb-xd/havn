'use strict';

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');
const { scan }  = require('./scanner');

// ─── PID file ─────────────────────────────────────────────────────────────────

const HAVN_DIR = path.join(os.homedir(), '.havn');
const PID_FILE = path.join(HAVN_DIR, 'havn.pid');

function writePid() {
  try {
    if (!fs.existsSync(HAVN_DIR)) fs.mkdirSync(HAVN_DIR, { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch { /* ignore */ }
}

function removePid() {
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
}

// ─── State ────────────────────────────────────────────────────────────────────

let lastScan       = null;
let scanDuration   = 0;
let scanCount      = 0;
let startTime      = Date.now();
let history        = []; // up to 30 data points for the sparkline
let isPaused       = false;
let scanIntervalMs = 4000; // configurable via /api/interval
let scanTimer      = null; // recursive setTimeout handle

// ─── Scan loop ────────────────────────────────────────────────────────────────

async function runScan() {
  try {
    const result = await scan();
    lastScan     = result.services;
    scanDuration = result.duration;
    scanCount++;

    history.push({ t: Date.now(), count: result.services.length });
    if (history.length > 30) history.shift();

    return result.services;
  } catch (err) {
    console.error('[havn] scan error:', err.message);
    return lastScan || [];
  }
}

// ─── Broadcast to all WebSocket clients ──────────────────────────────────────

function broadcast(wss, data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// ─── Build standard payload ───────────────────────────────────────────────────

function buildPayload(type) {
  const services = lastScan || [];
  return {
    type,
    services,
    insights:      buildInsights(services),
    scanDuration,  scanCount,
    serviceCount:  services.length,
    history,
    isPaused,
    scanIntervalMs,
  };
}

// ─── Insights builder ────────────────────────────────────────────────────────

function buildInsights(services) {
  if (!services || services.length === 0) return [];

  const insights = [];
  const appPorts = services.filter(s => s.category === 'app');
  const hasApp   = appPorts.length > 0;
  const hasDbs   = services.some(s => s.category === 'database');

  // Many app servers
  if (appPorts.length >= 3) {
    insights.push({
      type: 'info', icon: '📡',
      title: `${appPorts.length} app servers running`,
      message: `Ports: ${appPorts.map(s => s.port).join(', ')}`,
    });
  }

  // App running but no database
  if (hasApp && !hasDbs) {
    insights.push({
      type: 'warning', icon: '⚠️',
      title: 'No database detected',
      message: 'Your app is running but no local DB is connected',
    });
  }

  // Ollama detected
  if (services.some(s => s.port === 11434)) {
    insights.push({
      type: 'ai', icon: '🦙',
      title: 'Ollama running locally',
      message: 'Local LLM available at port 11434',
    });
  }

  // Spring Boot detected
  const spring = services.find(s => s.framework?.includes('Spring'));
  if (spring) {
    insights.push({
      type: 'tip', icon: '☕',
      title: 'Spring Boot detected',
      message: `Actuator may be at :${spring.port}/actuator/health`,
    });
  }

  // Multiple Node processes
  const nodeApps = services.filter(s => {
    const n = (s.processName || '').toLowerCase().replace(/\.exe$/, '');
    return n === 'node' || n === 'bun' || n === 'deno';
  });
  if (nodeApps.length >= 2) {
    insights.push({
      type: 'info', icon: '🟢',
      title: `${nodeApps.length} Node processes running`,
      message: `Ports: ${nodeApps.map(s => s.port).join(', ')}`,
    });
  }

  // Redis without app
  if (services.some(s => s.port === 6379) && !hasApp) {
    insights.push({
      type: 'info', icon: '🔴',
      title: 'Redis running, no app detected',
      message: 'Redis is up but no app server is running yet',
    });
  }

  // Docker API exposed
  if (services.some(s => s.port === 2375)) {
    insights.push({
      type: 'warning', icon: '🐳',
      title: 'Docker API exposed (port 2375)',
      message: 'Unauthenticated Docker API is accessible locally',
    });
  }

  return insights.slice(0, 4);
}

// ─── Server factory ───────────────────────────────────────────────────────────

function createServer() {
  const app    = express();
  const server = http.createServer(app);
  const wss    = new WebSocket.Server({ server });

  // Serve the dashboard from public/
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // REST: full state snapshot
  app.get('/api/state', (_req, res) => {
    res.json({ ...buildPayload('state'), uptime: Math.floor((Date.now() - startTime) / 1000) });
  });

  // REST: trigger manual rescan
  app.post('/api/scan', async (_req, res) => {
    const services = await runScan();
    broadcast(wss, buildPayload('update'));
    res.json({ ok: true, count: services.length, duration: scanDuration });
  });

  // REST: pause / resume / set interval
  app.post('/api/pause', (_req, res) => {
    isPaused = true;
    broadcast(wss, { type: 'status', isPaused, scanIntervalMs });
    res.json({ ok: true, isPaused });
  });

  app.post('/api/resume', (_req, res) => {
    isPaused = false;
    broadcast(wss, { type: 'status', isPaused, scanIntervalMs });
    res.json({ ok: true, isPaused });
  });

  app.post('/api/interval', express.json(), (req, res) => {
    const ms = parseInt(req.body?.ms, 10);
    if (!ms || ms < 1000 || ms > 300000) {
      return res.status(400).json({ error: 'ms must be between 1000 and 300000' });
    }
    scanIntervalMs = ms;
    broadcast(wss, { type: 'status', isPaused, scanIntervalMs });
    res.json({ ok: true, scanIntervalMs });
  });

  // WebSocket: push live updates
  wss.on('connection', (ws) => {
    if (lastScan) ws.send(JSON.stringify(buildPayload('init')));

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch { /* ignore */ }
    });
  });

  return { app, server, wss };
}

// ─── Start function ───────────────────────────────────────────────────────────

async function start(port = 1111, openBrowser = true) {
  writePid();

  const { server, wss } = createServer();

  // Run first scan before opening the browser
  process.stdout.write('[havn] scanning ports...');
  await runScan();
  process.stdout.write(` ${lastScan.length} service${lastScan.length !== 1 ? 's' : ''} found\n`);

  server.listen(port, '127.0.0.1', async () => {
    const url = `http://localhost:${port}`;
    console.log(`
  ┌──────────────────────────────────────┐
  │  ⚓ havn  v${require('../package.json').version}                     │
  │                                      │
  │  ${url}             │
  │  ${lastScan.length} service${lastScan.length !== 1 ? 's' : ' '} detected                   │
  │                                      │
  │  Ctrl+C to stop  ·  havn stop        │
  └──────────────────────────────────────┘
`);

    if (openBrowser) {
      try { await require('open')(url); } catch { /* not critical */ }
    }
  });

  // Auto-scan loop — recursive setTimeout so interval is always current
  function scheduleScan() {
    scanTimer = setTimeout(async () => {
      if (!isPaused) {
        await runScan();
        broadcast(wss, buildPayload('update'));
      }
      scheduleScan();
    }, scanIntervalMs);
  }
  scheduleScan();

  // Graceful shutdown: remove PID file
  const cleanup = () => { removePid(); server.close(); process.exit(0); };
  process.on('SIGINT',  cleanup);
  process.on('SIGTERM', cleanup);
}

module.exports = { start };
