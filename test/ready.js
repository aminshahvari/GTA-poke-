// Shared start-up readiness wait for tests that spawn `node server/index.js`.
//
// A test must not make its first request until the server answers GET /healthz with 200
// (server/index.js sets `ready` in its listen callback; /healthz is 503 until then).
// We poll every 100 ms with a bounded overall timeout (15 s by default, READY_TIMEOUT_MS
// overrides). On timeout, or if the server process exits first, we print a diagnostic
// (port, elapsed, last error, server stderr tail), kill the server and exit the test non-zero.
//
// Usage:
//   const { watchServer, waitReady } = require('./ready');      // '../ready' from test/ui
//   const srv = spawn('node', ['server/index.js'], { ..., stdio: ['ignore', 'ignore', 'pipe'] });
//   watchServer(srv);                 // keeps a tail of stderr (pass { forward: true } to also echo it)
//   await waitReady(BASE, srv);       // before the first request
'use strict';

const TAIL_MAX = 4000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Attach a stderr (and optionally stdout) tail collector to a spawned server. The stream is
// always drained, so a piped stderr can never fill up and block the server.
function watchServer(srv, { forward = false } = {}){
  if(srv.__readyTail !== undefined) return srv;
  srv.__readyTail = '';
  const keep = b => { srv.__readyTail = (srv.__readyTail + b).slice(-TAIL_MAX); };
  if(srv.stderr){ srv.stderr.on('data', b => { keep(b); if(forward) process.stderr.write(b); }); }
  return srv;
}

function tailOf(srv){
  if(!srv) return '(no server handle)';
  if(srv.__readyTail === undefined) return '(server stderr not captured)';
  return srv.__readyTail.trim() || '(empty)';
}

// Resolves with the elapsed ms once GET base+path returns 200. Never resolves after the deadline:
// prints the diagnostic and exits the process with code 1.
// With { fatal: false } it instead resolves null on failure (no output, server left alone) so a caller can retry.
async function waitReady(base, srv, { timeoutMs = Number(process.env.READY_TIMEOUT_MS) || 15000, intervalMs = 100, path = '/healthz', label, fatal = true } = {}){
  const t0 = Date.now(), deadline = t0 + timeoutMs;
  let lastErr = 'no attempt yet', exited = null;
  if(srv && srv.exitCode !== null) exited = `exit code ${srv.exitCode}`;
  const onExit = (code, sig) => { exited = sig ? `killed by ${sig}` : `exit code ${code}`; };
  if(srv) srv.once('exit', onExit);
  try{
    while(!exited && Date.now() < deadline){
      try{
        const left = Math.max(50, deadline - Date.now());
        const r = await fetch(base + path, { signal: AbortSignal.timeout(Math.min(2000, left)) });
        if(r.status === 200){ await r.arrayBuffer().catch(() => {}); return Date.now() - t0; }
        lastErr = `HTTP ${r.status}`; await r.arrayBuffer().catch(() => {});
      }catch(e){ lastErr = (e && e.cause && e.cause.code) || (e && (e.code || e.name || e.message)) || String(e); }
      if(exited) break;
      await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    }
  } finally { if(srv) srv.removeListener('exit', onExit); }
  if(!fatal) return null;
  const port = (() => { try{ return new URL(base).port; }catch(e){ return '?'; } })();
  const name = label || (require.main && require('path').basename(require.main.filename)) || 'test';
  console.error([
    `FAIL ${name}: server not ready ${exited ? '(server process ended: ' + exited + ')' : 'within ' + timeoutMs + ' ms'}`,
    `  url:     ${base + path}`,
    `  port:    ${port}`,
    `  elapsed: ${Date.now() - t0} ms`,
    `  last error: ${lastErr}`,
    `  server stderr tail:`,
    tailOf(srv).split('\n').map(l => '    | ' + l).join('\n')
  ].join('\n'));
  try{ if(srv && srv.exitCode === null) srv.kill(); }catch(e){}
  process.exit(1);
}

module.exports = { watchServer, waitReady, tailOf };
