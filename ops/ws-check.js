#!/usr/bin/env node
// WebSocket handshake probe with no dependencies: does GET <url> with Upgrade: websocket answer 101?
//   node ws-check.js https://staging.example.com/ws [--connect 127.0.0.1] [--timeout 5000]
// --connect dials that address instead of resolving the host (TLS still uses the URL's host name for SNI and the
// certificate check), so the box can test its own Caddy + certificate without leaving the machine.
// Sends an Origin equal to the URL's origin (the app closes sockets whose Origin host differs from Host).
// Prints one line "ws 101 <ms>ms" and exits 0, or "ws FAIL <reason>" and exits 1. Never prints the URL.
'use strict';
const http = require('http'), https = require('https'), crypto = require('crypto');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const target = args.find(a => /^(https?|wss?):\/\//.test(a));
if(!target){ console.log('ws FAIL usage: ws-check.js <url> [--connect ip] [--timeout ms]'); process.exit(1); }
const u = new URL(target.replace(/^ws/, 'http'));
const tls = u.protocol === 'https:';
const key = crypto.randomBytes(16).toString('base64');
const t0 = Date.now(), timeout = +opt('--timeout', 5000);
const req = (tls ? https : http).request({
  host: opt('--connect', u.hostname), servername: u.hostname, port: u.port || (tls ? 443 : 80), path: u.pathname + u.search,
  headers: { Host: u.host, Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key, Origin: u.origin },
  timeout
});
const done = (ok, msg) => { console.log(ok ? `ws 101 ${Date.now() - t0}ms` : `ws FAIL ${msg}`); process.exit(ok ? 0 : 1); };
req.on('upgrade', (res, socket) => {
  const want = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.destroy();
  done(res.headers['sec-websocket-accept'] === want, 'bad Sec-WebSocket-Accept');
});
req.on('response', res => done(false, `HTTP ${res.statusCode} instead of 101`));
req.on('timeout', () => { req.destroy(); done(false, `timeout after ${timeout} ms`); });
req.on('error', e => done(false, e.code || 'error'));
req.end();
