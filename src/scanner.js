'use strict';

const net        = require('net');
const { execSync } = require('child_process');
const fs         = require('fs');
const path       = require('path');
const http       = require('http');

// ─── Known services (port → metadata) ────────────────────────────────────────

const KNOWN_SERVICES = {
  // ── Databases ─────────────────────────────────────────────────────────────
  5432:  { name: 'PostgreSQL',       icon: '🐘', category: 'database', color: '#336791' },
  5433:  { name: 'PostgreSQL (alt)', icon: '🐘', category: 'database', color: '#336791' },
  3306:  { name: 'MySQL',            icon: '🐬', category: 'database', color: '#4479A1' },
  3307:  { name: 'MySQL (alt)',      icon: '🐬', category: 'database', color: '#4479A1' },
  1433:  { name: 'SQL Server',       icon: '🗄️',  category: 'database', color: '#CC2927' },
  1521:  { name: 'Oracle DB',        icon: '🔶', category: 'database', color: '#F80000' },
  27017: { name: 'MongoDB',          icon: '🍃', category: 'database', color: '#47A248' },
  27018: { name: 'MongoDB (shard)',  icon: '🍃', category: 'database', color: '#47A248' },
  5984:  { name: 'CouchDB',          icon: '🛋️',  category: 'database', color: '#E42528' },
  7474:  { name: 'Neo4j',            icon: '🕸️',  category: 'database', color: '#018BFF' },
  7687:  { name: 'Neo4j Bolt',       icon: '🕸️',  category: 'database', color: '#018BFF' },
  9042:  { name: 'Cassandra',        icon: '👁️',  category: 'database', color: '#1287B1' },
  8123:  { name: 'ClickHouse',       icon: '🖱️',  category: 'database', color: '#FFCC01' },
  26257: { name: 'CockroachDB',      icon: '🪳', category: 'database', color: '#6933FF' },
  // ── Cache / key-value ─────────────────────────────────────────────────────
  6379:  { name: 'Redis',            icon: '🔴', category: 'cache',    color: '#DC382D' },
  6380:  { name: 'Redis (replica)',  icon: '🔴', category: 'cache',    color: '#DC382D' },
  11211: { name: 'Memcached',        icon: '🧊', category: 'cache',    color: '#00B2C7' },
  // ── Search ────────────────────────────────────────────────────────────────
  9200:  { name: 'Elasticsearch',    icon: '🔍', category: 'search',   color: '#FEC514' },
  9300:  { name: 'Elasticsearch (transport)', icon: '🔍', category: 'search', color: '#FEC514' },
  // ── Message queues ────────────────────────────────────────────────────────
  5672:  { name: 'RabbitMQ',         icon: '🐇', category: 'queue',    color: '#FF6600' },
  9092:  { name: 'Kafka',            icon: '📨', category: 'queue',    color: '#231F20' },
  9093:  { name: 'Kafka (SSL)',       icon: '📨', category: 'queue',    color: '#231F20' },
  // ── Infra / coordination ──────────────────────────────────────────────────
  2181:  { name: 'Zookeeper',        icon: '🦁', category: 'infra',    color: '#E95420' },
  2375:  { name: 'Docker API',       icon: '🐳', category: 'infra',    color: '#2496ED' },
  2376:  { name: 'Docker TLS',       icon: '🐳', category: 'infra',    color: '#2496ED' },
  8200:  { name: 'Vault',            icon: '🔐', category: 'infra',    color: '#FFD814' },
  8500:  { name: 'Consul',           icon: '🏛️',  category: 'infra',    color: '#CA2171' },
  2379:  { name: 'etcd',             icon: '⚙️',  category: 'infra',    color: '#419EDA' },
  // ── App servers (well-known) ──────────────────────────────────────────────
  80:    { name: 'HTTP',             icon: '🌐', category: 'web',      color: '#61DAFB' },
  443:   { name: 'HTTPS',            icon: '🔒', category: 'web',      color: '#61DAFB' },
  8080:  { name: 'App Server',       icon: '☕', category: 'app',      color: '#6DB33F' },
  8443:  { name: 'App Server SSL',   icon: '☕', category: 'app',      color: '#6DB33F' },
  // ── Frontend dev servers ──────────────────────────────────────────────────
  3000:  { name: 'Dev Server',       icon: '🟢', category: 'app',      color: '#339933' },
  3001:  { name: 'Dev Server',       icon: '🟢', category: 'app',      color: '#339933' },
  5173:  { name: 'Vite',             icon: '⚡', category: 'app',      color: '#646CFF' },
  5174:  { name: 'Vite',             icon: '⚡', category: 'app',      color: '#646CFF' },
  4200:  { name: 'Angular',          icon: '🔺', category: 'app',      color: '#DD0031' },
  8000:  { name: 'Dev Server',       icon: '🐍', category: 'app',      color: '#3776AB' },
  4000:  { name: 'Dev Server',       icon: '🔷', category: 'app',      color: '#00ADD8' },
  // ── Monitoring / observability ────────────────────────────────────────────
  9000:  { name: 'Portainer / App',  icon: '🐳', category: 'infra',    color: '#2496ED' },
  9090:  { name: 'Prometheus',       icon: '📊', category: 'monitoring', color: '#E6522C' },
  3100:  { name: 'Grafana / Loki',   icon: '📈', category: 'monitoring', color: '#F46800' },
  9411:  { name: 'Zipkin',           icon: '🔭', category: 'monitoring', color: '#FF4242' },
  16686: { name: 'Jaeger UI',        icon: '🔭', category: 'monitoring', color: '#60C8E8' },
  15672: { name: 'RabbitMQ UI',      icon: '🐇', category: 'infra',    color: '#FF6600' },
  // ── Data / notebooks ──────────────────────────────────────────────────────
  8888:  { name: 'Jupyter',          icon: '📓', category: 'data',     color: '#F37626' },
  4040:  { name: 'Spark UI',         icon: '⚡', category: 'data',     color: '#E25A1C' },
  // ── AI / LLM ──────────────────────────────────────────────────────────────
  11434: { name: 'Ollama',           icon: '🦙', category: 'ai',       color: '#FF6B35' },
  // ── Dev tooling ───────────────────────────────────────────────────────────
  35729: { name: 'LiveReload',       icon: '🔄', category: 'infra',    color: '#4F7FFF' },
};

// ─── Port list to scan ────────────────────────────────────────────────────────

function range(start, count) {
  return Array.from({ length: count }, (_, i) => start + i);
}

const SCAN_PORTS = [...new Set([
  ...Object.keys(KNOWN_SERVICES).map(Number),
  // Custom app port ranges (dev servers, APIs, microservices)
  ...range(3002, 22),  // 3002-3023
  ...range(4001, 10),  // 4001-4010
  ...range(8081, 10),  // 8081-8090
  // Other common ports
  5000, 5001, 5050, 5051,
  7000, 7001, 7070,
  9001, 9002,
  4321, 6006,
  3030, 3031, 3032,
])];

// ─── Stack fingerprint signatures ────────────────────────────────────────────
// Ordered by specificity (more specific first)

const STACK_SIGNATURES = [
  { files: ['next.config.js', 'next.config.ts', 'next.config.mjs'],
    framework: 'Next.js',      language: 'TypeScript', icon: '▲', color: '#000000', badge: 'NEXT' },
  { files: ['nuxt.config.js', 'nuxt.config.ts'],
    framework: 'Nuxt.js',      language: 'JavaScript', icon: '💚', color: '#00DC82', badge: 'NUXT' },
  { files: ['svelte.config.js', 'svelte.config.ts'],
    framework: 'SvelteKit',    language: 'Svelte',     icon: '🔥', color: '#FF3E00', badge: 'SVELTE' },
  { files: ['angular.json'],
    framework: 'Angular',      language: 'TypeScript', icon: '🔺', color: '#DD0031', badge: 'NG' },
  { files: ['vite.config.js', 'vite.config.ts'],
    framework: 'Vite',         language: 'JavaScript', icon: '⚡', color: '#646CFF', badge: 'VITE' },
  { files: ['remix.config.js', 'remix.config.ts'],
    framework: 'Remix',        language: 'TypeScript', icon: '💿', color: '#121212', badge: 'REMIX' },
  { files: ['astro.config.mjs', 'astro.config.js'],
    framework: 'Astro',        language: 'Astro',      icon: '🚀', color: '#FF5D01', badge: 'ASTRO' },
  { files: ['pom.xml'],
    framework: 'Spring Boot',  language: 'Java',       icon: '☕', color: '#6DB33F', badge: 'JAVA' },
  { files: ['build.gradle', 'build.gradle.kts'],
    framework: 'Gradle / Java', language: 'Java',      icon: '☕', color: '#6DB33F', badge: 'JAVA' },
  { files: ['manage.py'],
    framework: 'Django',       language: 'Python',     icon: '🐍', color: '#0C4B33', badge: 'DJANGO' },
  { files: ['pyproject.toml', 'requirements.txt'],
    framework: 'Python App',   language: 'Python',     icon: '🐍', color: '#3776AB', badge: 'PYTHON' },
  { files: ['go.mod'],
    framework: 'Go App',       language: 'Go',         icon: '🐹', color: '#00ADD8', badge: 'GO' },
  { files: ['Cargo.toml'],
    framework: 'Rust App',     language: 'Rust',       icon: '🦀', color: '#CE422B', badge: 'RUST' },
  { files: ['Gemfile'],
    framework: 'Ruby on Rails', language: 'Ruby',      icon: '💎', color: '#CC342D', badge: 'RAILS' },
  { files: ['composer.json', 'artisan'],
    framework: 'Laravel',      language: 'PHP',        icon: '🐘', color: '#777BB4', badge: 'LARAVEL' },
  { files: ['mix.exs'],
    framework: 'Elixir / Phoenix', language: 'Elixir', icon: '💜', color: '#6E4A7E', badge: 'ELIXIR' },
  { files: ['pubspec.yaml'],
    framework: 'Dart / Flutter', language: 'Dart',     icon: '🎯', color: '#0175C2', badge: 'DART' },
  { files: ['package.json'],
    framework: 'Node.js',      language: 'JavaScript', icon: '🟢', color: '#339933', badge: 'NODE' },
];

// ─── System process names — these are OS internals, never dev services ────────
// Cross-platform: Windows system procs, macOS launchd daemons, Linux init procs.

// OS / system-level process names — never dev services
const SYSTEM_PROCESS_NAMES = new Set([
  // Windows kernel & core services
  'system', 'system idle process', 'memory compression', 'secure system',
  'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe',
  'services.exe', 'lsass.exe', 'svchost.exe', 'spoolsv.exe', 'dashost.exe',
  'sihost.exe', 'taskhostw.exe', 'fontdrvhost.exe', 'dllhost.exe',
  'conhost.exe', 'searchhost.exe', 'runtimebroker.exe', 'audiodg.exe',
  'wudfhost.exe', 'wmiprvse.exe', 'msdtc.exe', 'lsm.exe',
  // macOS system daemons
  'launchd', 'kernel_task', 'configd', 'notifyd', 'diskarbitrationd',
  'mdnsresponder', 'bluetoothd', 'airportd', 'locationd', 'mds', 'mds_stores',
  // Linux init / system daemons
  'systemd', 'init', 'kthreadd', 'networkmanager', 'dbus-daemon',
  'avahi-daemon', 'cupsd', 'rsyslogd',
]);

// Allowlist of process names that are known dev runtimes, servers, or tooling.
// Anything NOT in this list (and not on a KNOWN_SERVICES port) is hidden.
const DEV_PROCESS_ALLOWLIST = new Set([
  // JS runtimes
  'node', 'node.exe', 'bun', 'bun.exe', 'deno', 'deno.exe',
  // JVM
  'java', 'java.exe',
  // Python
  'python', 'python.exe', 'python3', 'python3.exe',
  // Ruby
  'ruby', 'ruby.exe',
  // Go
  'go', 'go.exe',
  // .NET / C#
  'dotnet', 'dotnet.exe',
  // PHP
  'php', 'php.exe', 'php-fpm',
  // Rust
  'cargo', 'cargo.exe',
  // Dart / Flutter
  'dart', 'dart.exe',
  // Elixir / Erlang
  'beam', 'beam.smp', 'elixir',
  // Databases
  'redis-server', 'redis',
  'postgres', 'postgres.exe',
  'mysqld', 'mysqld.exe',
  'mongod', 'mongod.exe',
  'elasticsearch',
  'cassandra',
  'influxd',
  'etcd',
  'cockroach', 'cockroach.exe',
  'couchdb',
  // Message queues
  'kafka', 'zookeeper',
  // Web servers / proxies
  'nginx', 'nginx.exe',
  'apache2', 'httpd', 'httpd.exe',
  'caddy', 'caddy.exe',
  'traefik', 'traefik.exe',
  'haproxy',
  // Containers / orchestration
  'docker', 'docker.exe', 'com.docker.backend', 'dockerd',
  // Dev tooling / infra
  'vault', 'vault.exe',
  'consul', 'consul.exe',
  'minio', 'minio.exe',
  'prometheus', 'prometheus.exe',
  'grafana', 'grafana-server',
  'jaeger',
]);

// Returns true if this port should be hidden from the dashboard
function isSystemPort(port, processName) {
  if (processName) {
    const name = processName.toLowerCase();
    // Always hide OS internals
    if (SYSTEM_PROCESS_NAMES.has(name)) return true;
    // Hide if the process is not a known dev tool AND the port is not a known service
    if (!DEV_PROCESS_ALLOWLIST.has(name) && !KNOWN_SERVICES[port]) return true;
  } else {
    // No process info — only show ports we explicitly know about
    if (!KNOWN_SERVICES[port]) return true;
  }
  // Windows ephemeral ports (49152–65535) that aren't an explicitly known service
  if (port > 49151 && !KNOWN_SERVICES[port]) return true;
  return false;
}

// ─── Process name → display name (covers Linux and Windows .exe names) ───────

const PROCESS_NAME_MAP = {
  node:           'Node.js',
  'node.exe':     'Node.js',
  bun:            'Bun',
  'bun.exe':      'Bun',
  deno:           'Deno',
  'deno.exe':     'Deno',
  java:           'Java',
  'java.exe':     'Java',
  python:         'Python',
  'python.exe':   'Python',
  python3:        'Python',
  'python3.exe':  'Python',
  ruby:           'Ruby',
  'ruby.exe':     'Ruby',
  go:             'Go',
  dotnet:         '.NET',
  'dotnet.exe':   '.NET',
  php:            'PHP',
  'php.exe':      'PHP',
  'php-fpm':      'PHP',
  redis:          'Redis',
  'redis-server': 'Redis',
  postgres:       'PostgreSQL',
  'postgres.exe': 'PostgreSQL',
  mongod:         'MongoDB',
  'mongod.exe':   'MongoDB',
  nginx:          'Nginx',
  'nginx.exe':    'Nginx',
  apache2:        'Apache',
  httpd:          'Apache',
  caddy:          'Caddy',
  'caddy.exe':    'Caddy',
  traefik:        'Traefik',
  'traefik.exe':  'Traefik',
  beam:           'Elixir / Erlang',
  'beam.smp':     'Elixir / Erlang',
  elixir:         'Elixir',
};

// ─── Cache ────────────────────────────────────────────────────────────────────

let cachedProcessMap  = null;
let processCacheTime  = 0;

// ─── TCP port check ───────────────────────────────────────────────────────────

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (result) => {
      if (!done) { done = true; socket.destroy(); resolve(result); }
    };

    socket.setTimeout(150);
    socket.on('connect', () => finish(true));
    socket.on('error',   () => finish(false));
    socket.on('timeout', () => finish(false));
    socket.connect(port, '127.0.0.1');
  });
}

// ─── Parallel port scan (all ports at once) ───────────────────────────────────

async function scanPorts(ports) {
  const results = await Promise.all(
    ports.map(async (port) => ({ port, open: await isPortOpen(port) }))
  );
  return results.filter(r => r.open).map(r => r.port);
}

// ─── Process map: ONE system call for all ports ───────────────────────────────

function getProcessMap() {
  const now = Date.now();
  if (cachedProcessMap && now - processCacheTime < 5000) return cachedProcessMap;

  const map = new Map(); // port → { pid, name, cwd }

  try {
    const platform = process.platform;

    // ── macOS / Linux: lsof ───────────────────────────────────────────────
    if (platform === 'darwin' || platform === 'linux') {
      let output = '';
      try {
        output = execSync('lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null', {
          timeout: 3000, encoding: 'utf8',
        });
      } catch { /* lsof not available */ }

      for (const line of output.trim().split('\n').slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 9) continue;

        const name = parts[0];
        const pid  = parseInt(parts[1], 10);
        const addr = parts[8]; // e.g. "*:8080" or "127.0.0.1:3000"
        const port = parseInt(addr.split(':').pop(), 10);

        if (!isNaN(port) && !map.has(port)) {
          let cwd = null;
          try {
            // Fast path on Linux: /proc/<pid>/cwd symlink
            cwd = fs.realpathSync(`/proc/${pid}/cwd`);
          } catch {
            try {
              cwd = execSync(`lsof -p ${pid} -a -d cwd -Fn 2>/dev/null`, {
                timeout: 500, encoding: 'utf8',
              }).split('\n').find(l => l.startsWith('n'))?.slice(1) || null;
            } catch { /* ignore */ }
          }
          map.set(port, { pid, name, cwd });
        }
      }

    // ── Windows: netstat + tasklist + wmic ───────────────────────────────
    } else if (platform === 'win32') {

      // Step 1: port → PID from netstat
      const portToPid = new Map();
      try {
        const out = execSync('netstat -ano -p TCP 2>nul', {
          timeout: 3000, encoding: 'utf8',
        });
        for (const line of out.split('\n')) {
          if (!line.includes('LISTENING')) continue;
          const parts = line.trim().split(/\s+/);
          if (parts.length < 5) continue;
          const port = parseInt(parts[1].split(':').pop(), 10);
          const pid  = parseInt(parts[4], 10);
          if (!isNaN(port) && !isNaN(pid) && !portToPid.has(port)) {
            portToPid.set(port, pid);
          }
        }
      } catch { /* ignore */ }

      // Step 2: PID → process name from tasklist (fast, built-in)
      const pidToName = new Map();
      try {
        const out = execSync('tasklist /FO CSV /NH 2>nul', {
          timeout: 3000, encoding: 'utf8',
        });
        for (const line of out.split('\n')) {
          // Format: "node.exe","12345","Console","1","45,232 K"
          const m = line.match(/"([^"]+)","(\d+)"/);
          if (m) {
            pidToName.set(parseInt(m[2], 10), m[1].toLowerCase());
          }
        }
      } catch { /* ignore */ }

      // Step 3: PID → WorkingDirectory from wmic (best-effort, may be deprecated)
      const pidToCwd = new Map();
      try {
        const out = execSync(
          'wmic process get ProcessId,WorkingDirectory /FORMAT:CSV 2>nul',
          { timeout: 5000, encoding: 'utf8' }
        );
        const lines = out.trim().split('\n').filter(l => l.trim());
        if (lines.length >= 2) {
          // Parse header to find column indices
          const header = lines[0].split(',').map(h => h.trim().toLowerCase());
          const pidIdx = header.indexOf('processid');
          const cwdIdx = header.indexOf('workingdirectory');
          if (pidIdx !== -1 && cwdIdx !== -1) {
            for (const line of lines.slice(1)) {
              const parts = line.split(',');
              if (parts.length <= Math.max(pidIdx, cwdIdx)) continue;
              const pid = parseInt(parts[pidIdx]?.trim(), 10);
              const cwd = parts[cwdIdx]?.trim().replace(/\r$/, '');
              if (!isNaN(pid) && cwd && cwd.length > 2) {
                pidToCwd.set(pid, cwd);
              }
            }
          }
        }
      } catch { /* wmic not available or deprecated */ }

      // Build final map: port → { pid, name, cwd }
      for (const [port, pid] of portToPid) {
        map.set(port, {
          pid,
          name: pidToName.get(pid) || 'unknown',
          cwd:  pidToCwd.get(pid)  || null,
        });
      }
    }
  } catch { /* ignore all errors */ }

  cachedProcessMap = map;
  processCacheTime = Date.now();
  return map;
}

// ─── HTTP fingerprinting + HTML title extraction ──────────────────────────────

// Titles that are useless as service names
const TITLE_SKIP = /^(localhost|127\.|webpack|vite(\s*(dev)?\s*server)?|development|index(\.\w+)?|home|welcome|react\s*app|my\s*app|app|\d+|redirecting\.*)$/i;

// Extract a same-host redirect path from a Location header (or return null)
function parseRedirectPath(location) {
  if (!location) return null;
  if (location.startsWith('/')) return location; // relative path, always safe
  try {
    const u = new URL(location);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      return u.pathname + u.search;
    }
  } catch { /* ignore */ }
  return null;
}

// Extract framework + language from response headers
function detectFrameworkFromHeaders(h) {
  let framework = null;
  let language  = null;

  if (h['x-application-context'] || (h['server'] || '').toLowerCase().includes('tomcat')) {
    framework = 'Spring Boot'; language = 'Java';
  }
  // Spring Boot 3.x: RFC 7807 Problem Details JSON (sent on 4xx/5xx with no HTML)
  if (!framework && (h['content-type'] || '').includes('application/problem+json')) {
    framework = 'Spring Boot'; language = 'Java';
  }
  if (h['x-powered-by'] === 'Express')      { framework = 'Express';       language = 'Node.js'; }
  if (h['x-powered-by']?.startsWith('PHP')) {
    framework = h['x-generator']?.includes('Laravel') ? 'Laravel' : 'PHP';
    language  = 'PHP';
  }
  if (h['x-aspnet-version'] || h['x-aspnetmvc-version']) { framework = 'ASP.NET'; language = 'C#'; }

  if (!framework) {
    const server = (h['server'] || '').toLowerCase();
    if (server.includes('apache'))    framework = 'Apache';
    if (server.includes('nginx'))     framework = 'Nginx';
    if (server.includes('gunicorn'))  { framework = 'Gunicorn';        language = 'Python'; }
    if (server.includes('uvicorn'))   { framework = 'FastAPI/Uvicorn';  language = 'Python'; }
    if (server.includes('puma'))      { framework = 'Rails/Puma';       language = 'Ruby'; }
    if (server.includes('cowboy'))    { framework = 'Phoenix/Cowboy';   language = 'Elixir'; }
    if (server.includes('caddy'))     framework = 'Caddy';
    if (server.includes('openresty')) framework = 'OpenResty';
  }

  return { framework, language };
}

// Make one HTTP GET request and return { framework, language, statusCode, title, location }
function httpGet(port, path, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done  = (r) => { if (!settled) { settled = true; resolve(r); } };
    const timer = setTimeout(() => done(null), timeoutMs);

    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers: { 'User-Agent': 'havn/1.0' } },
      (res) => {
        const { framework, language } = detectFrameworkFromHeaders(res.headers);
        const statusCode = res.statusCode;
        const location   = res.headers['location'] || null;
        const isRedirect = statusCode >= 300 && statusCode < 400;

        const chunks  = [];
        let   bodyLen = 0;
        res.on('data', (chunk) => {
          if (bodyLen < 4096) { chunks.push(chunk); bodyLen += chunk.length; }
          else res.destroy();
        });
        res.on('end', () => {
          clearTimeout(timer);
          let title = null;
          // Don't parse titles from redirect bodies — they're always "Redirecting..."
          if (!isRedirect) {
            try {
              const body = Buffer.concat(chunks).toString('utf8', 0, 4096);
              const m    = body.match(/<title[^>]*>([^<]{1,80})<\/title>/i);
              if (m) {
                const t = m[1].trim().replace(/\s+/g, ' ');
                if (t.length > 1 && !TITLE_SKIP.test(t)) title = t.slice(0, 50);
              }
            } catch { /* ignore */ }
          }
          done({ framework, language, statusCode, title, location });
        });
        res.on('error', () => { clearTimeout(timer); done(null); });
      }
    );
    req.setTimeout(timeoutMs - 50, () => { req.destroy(); });
    req.on('error', () => { clearTimeout(timer); done(null); });
    req.end();
  });
}

async function httpFingerprint(port) {
  // First request to /
  const first = await httpGet(port, '/', 800);
  if (!first) return null;

  // Follow one redirect if the response is 3xx and Location is on the same host
  if (first.statusCode >= 300 && first.statusCode < 400) {
    const redirectPath = parseRedirectPath(first.location);
    if (redirectPath && redirectPath !== '/') {
      const followed = await httpGet(port, redirectPath, 600);
      if (followed) {
        return {
          // Keep framework/language from whichever response actually had them
          framework:  followed.framework  || first.framework,
          language:   followed.language   || first.language,
          statusCode: followed.statusCode,
          title:      followed.title,        // title comes from the real page
        };
      }
    }
    // Redirect but couldn't follow — return what we know (no title)
    return { framework: first.framework, language: first.language, statusCode: first.statusCode, title: null };
  }

  return first;
}

// ─── Stack detection from filesystem ─────────────────────────────────────────

function detectStackFromDir(dir) {
  if (!dir) return null;
  try {
    for (const sig of STACK_SIGNATURES) {
      if (!sig.files.some(f => fs.existsSync(path.join(dir, f)))) continue;

      // Try to get a real project name
      let projectName = path.basename(dir);

      // Node: read package.json name
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.name && !pkg.name.startsWith('@')) projectName = pkg.name;
          else if (pkg.name) projectName = pkg.name; // scoped package is still useful
        } catch { /* ignore */ }
      }

      // Java: read pom.xml artifactId
      const pomPath = path.join(dir, 'pom.xml');
      if (fs.existsSync(pomPath)) {
        try {
          const pom   = fs.readFileSync(pomPath, 'utf8');
          const match = pom.match(/<artifactId>([^<]+)<\/artifactId>/);
          if (match) projectName = match[1];
        } catch { /* ignore */ }
      }

      // Go: read go.mod module name (last path segment)
      const goModPath = path.join(dir, 'go.mod');
      if (fs.existsSync(goModPath)) {
        try {
          const mod   = fs.readFileSync(goModPath, 'utf8');
          const match = mod.match(/^module\s+(\S+)/m);
          if (match) projectName = match[1].split('/').pop();
        } catch { /* ignore */ }
      }

      return { ...sig, projectName };
    }
  } catch { /* permission error */ }
  return null;
}

// ─── Database / service health checks ────────────────────────────────────────

function checkRedisHealth(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let   data = '';
    sock.setTimeout(500);
    sock.connect(port, '127.0.0.1', () => {
      sock.write('*1\r\n$4\r\nPING\r\n');
    });
    sock.on('data', (chunk) => {
      data += chunk.toString();
      if (data.includes('+PONG') || data.includes('PONG')) {
        sock.destroy();
        resolve({ healthy: true, detail: 'PONG received' });
      }
    });
    sock.on('error',   () => resolve({ healthy: false, detail: null }));
    sock.on('timeout', () => { sock.destroy(); resolve({ healthy: false, detail: null }); });
  });
}

function checkPostgresHealth(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(500);
    sock.connect(port, '127.0.0.1', () => {
      resolve({ healthy: true, detail: 'Accepting connections' });
      sock.destroy();
    });
    sock.on('error',   () => resolve({ healthy: false, detail: null }));
    sock.on('timeout', () => { sock.destroy(); resolve({ healthy: false, detail: null }); });
  });
}

// ─── Guess framework / language from process name ─────────────────────────────

function guessFromProcess(rawName) {
  if (!rawName) return null;
  const key = rawName.toLowerCase();
  return PROCESS_NAME_MAP[key]
      || PROCESS_NAME_MAP[key.replace(/\.exe$/, '')]
      || null;
}

// ─── Build rich service object for one port ───────────────────────────────────

async function buildServiceInfo(port, processMap) {
  const known    = KNOWN_SERVICES[port];
  const procInfo = processMap.get(port);

  const isDbLike = known && ['database', 'cache', 'queue', 'search'].includes(known.category);

  // Run HTTP fingerprinting and filesystem detection in parallel
  const [httpInfo, stackInfo] = await Promise.all([
    isDbLike ? Promise.resolve(null) : httpFingerprint(port),
    procInfo?.cwd ? Promise.resolve(detectStackFromDir(procInfo.cwd)) : Promise.resolve(null),
  ]);

  // DB health checks (serial, after the parallel block)
  let healthDetail = null;
  if (port === 6379 || port === 6380) {
    const h = await checkRedisHealth(port);
    healthDetail = h.detail;
  } else if (port === 5432 || port === 5433) {
    const h = await checkPostgresHealth(port);
    healthDetail = h.detail;
  }

  // ── Determine display values ────────────────────────────────────────────
  const framework = httpInfo?.framework
                 || stackInfo?.framework
                 || guessFromProcess(procInfo?.name)
                 || known?.name
                 || null;

  const language  = httpInfo?.language || stackInfo?.language || null;
  const icon      = stackInfo?.icon    || known?.icon         || '⚙️';
  const color     = stackInfo?.color   || known?.color        || '#6B7280';
  const badge     = stackInfo?.badge   || null;
  const category  = known?.category    || 'app';

  // Service name: project name (best) → HTML title → known service name → process guess → "Port X"
  const name =
    stackInfo?.projectName
    || httpInfo?.title
    || known?.name
    || guessFromProcess(procInfo?.name)
    || `Port ${port}`;

  return {
    port,
    name,
    framework,
    language,
    icon,
    color,
    badge,
    category,
    pid:         procInfo?.pid    ?? null,
    processName: procInfo?.name   ?? null,
    cwd:         procInfo?.cwd    ?? null,
    status:      'running',
    latency:     null,
    healthDetail,
    statusCode:  httpInfo?.statusCode ?? null,
    lastSeen:    Date.now(),
  };
}

// ─── Category sort order ─────────────────────────────────────────────────────

const CAT_ORDER = {
  app: 0, web: 1, monitoring: 2, data: 3,
  cache: 4, database: 5, search: 6, queue: 7, infra: 8, ai: 9,
};

// ─── Public API ───────────────────────────────────────────────────────────────

async function scan() {
  const t0 = Date.now();

  // 1. ONE system call: get every port the OS reports as LISTENING (cached 5s).
  //    This discovers services on non-standard ports — Docker-mapped ports,
  //    Spring Boot on 8092, custom configs — regardless of what port they chose.
  const processMap = getProcessMap();

  // 2. Build the full probe list:
  //    • OS-discovered ports  → catches everything running right now
  //    • SCAN_PORTS (fallback) → catches services the OS missed due to
  //      permission gaps, Docker network tricks, or running as another user
  const portsToScan = [...new Set([...processMap.keys(), ...SCAN_PORTS])];

  // 3. TCP-verify in parallel — confirms the port is reachable on 127.0.0.1.
  //    This also filters out services bound to non-localhost interfaces only.
  const openPorts = await scanPorts(portsToScan);
  if (openPorts.length === 0) return { services: [], duration: Date.now() - t0 };

  // 4. Drop OS internals: Windows RPC/SMB/COM ports, macOS daemons, etc.
  const devPorts = openPorts.filter(port => {
    const proc = processMap.get(port);
    return !isSystemPort(port, proc?.name);
  });
  if (devPorts.length === 0) return { services: [], duration: Date.now() - t0 };

  // 5. Enrich every dev port in parallel
  const services = await Promise.all(
    devPorts.map(port => buildServiceInfo(port, processMap))
  );

  // 6. Sort: apps first, infra last, then by port number
  services.sort((a, b) => {
    const ac = CAT_ORDER[a.category] ?? 10;
    const bc = CAT_ORDER[b.category] ?? 10;
    return ac !== bc ? ac - bc : a.port - b.port;
  });

  return { services, duration: Date.now() - t0 };
}

module.exports = { scan, isPortOpen };
