// 3. sigterm_mid_hand (EXPECTED TO FAIL today)
// Render stops an instance with SIGTERM. server/index.js installs no SIGTERM/SIGINT handler, and the Postgres store
// flushes dirty keys one by one in the background (server/store.js:37-50; the file store uses a 150 ms debounce), so
// whatever is still queued when the signal lands is never written. Runs the real Postgres store path against the fake
// pool with a 3 ms round trip per query (a hosted database in the same region).
// Case A: SIGTERM the moment clients are shown a bust. Case B: SIGTERM once the next hand is being dealt.
// After restart: the bust clients saw must still be recorded, that player must not be seated again, places unique,
// chips conserved. Also reports whether the server flushes before exit.
const fs = require('fs'), path = require('path');
const L = require('./lib');
const NAME = 'sigterm_mid_hand', EXPECT_FAIL = true;
const procs = []; let clients = [];

async function runCase(label, immediate){
  const dbDir = L.tmpdir('sigterm' + label.slice(0, 1)), env = { P1_DB_LATENCY_MS: '3' };
  const srv = await L.startServer({ mode: 'pg', dbDir, env, label: label + '1' }); procs.push(srv);
  const tokens = await L.setupClub(srv.base, 4);
  // players 1 and 2 shove every hand, everyone else folds: one bust at a time, the tournament keeps going
  const folder = (c, tb) => tb.legal.canCheck ? { t: 'check' } : { t: 'fold' };
  clients = await Promise.all(tokens.map((t, i) => L.connect(srv.port, t, { i, policy: i === 1 || i === 2 ? 'shove' : folder })));
  const watcher = clients[0];
  let bustSeen = null, termAt = null;
  const done = new Promise(res => {
    let prev = null;
    watcher.events.push(tb => {
      const now = tb.seats.filter(Boolean).map(s => s.uid);
      if(prev && now.length < prev.length && !bustSeen) bustSeen = { at: Date.now(), hand: tb.handNo, busted: prev.filter(u => !now.includes(u)) };
      prev = now;
      if(bustSeen && !termAt && (immediate || (tb.phase === 'hand' && tb.handNo > bustSeen.hand))){ termAt = Date.now(); srv.proc.kill('SIGTERM'); res(); }
    });
  });
  await L.runTourney(watcher, clients);
  await Promise.race([done, L.sleep(15000)]);
  if(!termAt) throw new Error(label + ': never saw a bust');
  const ex = await srv.exited;
  L.closeAll(clients); clients = [];
  const busted = bustSeen.busted, db = L.readDb(dbDir), issues = L.consistency(db).issues.map(x => label + ': ' + x);
  const persisted = (db.tourney && db.tourney.places || []).map(r => r.uid);
  const lost = busted.filter(u => !persisted.includes(u));
  if(lost.length) issues.push(`${label}: bust shown to clients but not persisted (${lost.join(',')})`);
  const srv2 = await L.startServer({ mode: 'pg', dbDir, env, label: label + '2' }); procs.push(srv2);
  await L.sleep(200);
  const d = await L.chips(srv2.base);
  const seatedNow = (d.detail || []).flatMap(tb => tb.seats.map(s => s[1]));
  const back = busted.filter(u => seatedNow.includes(u));
  if(back.length) issues.push(`${label}: busted player seated again after restart`);
  if(d.expected != null && d.chips !== d.expected) issues.push(`${label}: chips ${d.chips} != ${d.expected}`);
  await L.stop(srv2);
  return { issues, note: `${label}: SIGTERM ${termAt - bustSeen.at} ms after bust shown; exit=${JSON.stringify(ex)}; persisted places=${persisted.length}/${busted.length}; restart chips ${d.chips}/${d.expected}` };
}

L.guard(NAME, EXPECT_FAIL, async () => {
  const A = await runCase('A(at bust)', true);
  const B = await runCase('B(next hand)', false);
  const issues = [...A.issues, ...B.issues];
  const hasHandler = /process\.on\(\s*['"]SIG(TERM|INT)/.test(fs.readFileSync(path.join(L.ROOT, 'server', 'index.js'), 'utf8'));
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL,
    reason: issues.length ? issues.join('; ') : 'state after SIGTERM + restart consistent',
    notes: [A.note, B.note,
      `server flushes before exit: ${hasHandler ? 'has a SIGTERM handler' : 'NO - no SIGTERM/SIGINT handler in server/index.js, process dies on the signal and queued writes (server/store.js:39-48) are dropped'}`,
      'an interrupted hand is replayed from starting stacks by design (server/club.js:157); only state not yet flushed is lost'] });
}, () => { L.closeAll(clients); procs.forEach(p => L.stop(p)); });
