// Local reproduction of the staging deploy "lease ping-pong" (evidence item 2). Local only: two server processes share
// one fake Postgres (test/phase1/pgstub.js, which runs the REAL server/store.js Postgres code path). No app code changes.
//
// What it simulates: a Render deploy overlap. OLD is running; NEW boots and takes the lease. A tiny supervisor plays
// Render's part: while the overlap window is open, any process that exits is restarted in the SAME instance (same
// RENDER_INSTANCE_ID, new pid), as the staging logs show (pid suffix :82 -> :70, :82 -> :64). At the end of the window the
// supervisor sends SIGTERM to OLD (Render retiring the old instance) and stops restarting it.
// Expected with today's code (a3c67e9): the restarted OLD process claims a newer epoch, NEW loses the lease and exits,
// gets restarted and claims it back, and so on until OLD is retired.
//
// Usage (from the repository root): node docs/evidence/2026-10-16/scripts/race-repro.js [overlapSeconds=14] [restartDelayMs=1500]
const path = require('path');
const P = require(path.resolve(__dirname, '..', '..', '..', '..', 'test', 'phase1', 'lib.js'));
const OVERLAP = (+process.argv[2] || 14) * 1000, RESTART_MS = +process.argv[3] || 1500;
const t0 = Date.now(), ts = () => ((Date.now() - t0) / 1000).toFixed(2).padStart(6) + 's';
const events = [];
const ev = (who, what) => { events.push([ts(), who, what]); console.log(`${ts()}  ${who.padEnd(4)} ${what}`); };

(async () => {
  const dbDir = P.tmpdir('race');
  const procs = { OLD: null, NEW: null };
  const ports = { OLD: await P.freePort(), NEW: await P.freePort() };
  const ids = { OLD: 'srv-hibernate-6d7675c4d4-ckzdq', NEW: 'srv-hibernate-6dd5c78cb7-9mhp7' };
  let windowOpen = true, retired = false, restarts = { OLD: 0, NEW: 0 };
  async function boot(who){
    const s = await P.startServer({ mode: 'pg', dbDir, port: ports[who], label: who, env: { RENDER_INSTANCE_ID: ids[who] } });
    procs[who] = s;
    const line = (s.log.match(/store: postgres[^\n]*/) || ['?'])[0];
    ev(who, `boot pid ${s.proc.pid}: "${line}"`);
    s.exited.then(async x => {
      const lost = (s.log.match(/shutting down: [^\n]*/) || [''])[0], fin = (s.log.match(/final save [^\n]*/) || [''])[0];
      ev(who, `exit ${JSON.stringify(x)} | ${lost} | ${fin}`);
      if(who === 'OLD' && retired) return;
      if(windowOpen || who === 'NEW'){
        restarts[who]++;
        await P.sleep(RESTART_MS);
        if(who === 'OLD' && retired) return;
        ev(who, `supervisor restarts ${who} in the same instance (restart #${restarts[who]})`);
        await boot(who).catch(e => ev(who, 'restart failed: ' + e.message));
      }
    });
    return s;
  }
  await boot('OLD');
  const tokens = await P.setupClub(procs.OLD.base, 2);
  const client = await P.connect(ports.OLD, tokens[1], { i: 1 });
  ev('OLD', 'a member is connected to OLD over the websocket');
  await P.sleep(500);
  ev('NEW', 'deploy: NEW instance boots while OLD is still running');
  await boot('NEW');
  // watch the lease row
  let lastEpoch = null;
  const watch = setInterval(() => { const db = P.readDb(dbDir); const l = db.lease || {}; if(l.epoch !== lastEpoch){ lastEpoch = l.epoch; ev('db', `lease row: epoch ${l.epoch} held by ${l.instance}`); } }, 50);
  await P.sleep(OVERLAP);
  windowOpen = false; retired = true;
  ev('OLD', 'end of overlap: supervisor sends SIGTERM to OLD and stops restarting it');
  if(procs.OLD && !procs.OLD.exit) procs.OLD.proc.kill('SIGTERM');
  await P.sleep(5000);
  clearInterval(watch);
  const h = await fetch(procs.NEW.base + '/healthz').then(r => r.json()).catch(e => ({ error: e.message }));
  ev('NEW', 'final /healthz: ' + JSON.stringify(h));
  ev('cli', `the member connected to the first OLD process was closed with code ${client.closeCode} "${client.closeReason}"`);
  console.log(`\nsummary: lease epoch went from 1 to ${lastEpoch} (${lastEpoch - 1} handovers for what should have been 1); restarts OLD=${restarts.OLD} NEW=${restarts.NEW}`);
  console.log(restarts.OLD > 0 ? 'REPRODUCED: a restarted OLD process re-claimed the lease during the overlap (ping-pong).' : 'NOT REPRODUCED');
  console.log('(test cleanup: the script now SIGKILLs its own servers)');
  P.stop(procs.OLD); P.stop(procs.NEW);
  setTimeout(() => process.exit(0), 200);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
