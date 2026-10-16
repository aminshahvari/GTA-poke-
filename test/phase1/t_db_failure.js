// 1. db_failure (EXPECTED TO FAIL today)
// The Postgres store writes each key separately and asynchronously (server/store.js:37-50). After a bust,
// afterHand() writes `tourney` (places) and then `live` (seats) as two independent upserts (server/club.js:337,347).
// Here the database goes down right after the first such `tourney` write lands, the process is then killed, and the
// server restarts against what the database actually holds.
// Asserts: no player is both in places and seated, places has unique uids, chips are conserved.
const L = require('./lib');
const NAME = 'db_failure', EXPECT_FAIL = true;
let srv, srv2, clients = [];
L.guard(NAME, EXPECT_FAIL, async () => {
  const dbDir = L.tmpdir('dbfail');
  srv = await L.startServer({ mode: 'pg', dbDir, fault: { match: { key: 'tourney', minPlaces: 1, status: 'running' }, action: 'down' }, label: 'A' });
  const tokens = await L.setupClub(srv.base, 8);
  clients = await Promise.all(tokens.map((t, i) => L.connect(srv.port, t, { i, policy: 'shove' })));
  await L.runTourney(clients[0], clients, { tableSize: 6 });
  await L.waitFor(() => srv.log.includes('P1FAULT fired'), 20000, 'first bust written to the db');
  // let the store retry loop try (and fail) to write the remaining keys, then the instance dies
  await L.waitFor(() => srv.log.includes('store write failed'), 5000, 'a failed write');
  const failedKeys = [...new Set([...srv.log.matchAll(/store write failed (\S+)/g)].map(m => m[1]))];
  await L.stop(srv); L.closeAll(clients); clients = [];
  const persisted = L.readDb(dbDir);
  const c1 = L.consistency(persisted);
  // restart against the same database (now healthy)
  srv2 = await L.startServer({ mode: 'pg', dbDir, label: 'B' });
  await L.sleep(300);
  const d = await L.chips(srv2.base);
  const seatedNow = (d.detail || []).flatMap(tb => tb.seats.map(s => s[1]));
  const placesNow = (persisted.tourney.places || []).map(r => r.uid);
  const issues = [...c1.issues];
  const bothNow = seatedNow.filter(u => placesNow.includes(u));
  if(bothNow.length && !c1.issues.some(x => x.startsWith('in places'))) issues.push('after restart seated AND in places: ' + bothNow.join(','));
  if(d.expected != null && d.chips !== d.expected) issues.push(`after restart chips ${d.chips} != ${d.expected}`);
  // finish the tournament on the restarted server and look at the recorded result
  let fin = 'not finished';
  if(/resumed running tournament/.test(srv2.log)){
    clients = await Promise.all(tokens.map((t, i) => L.connect(srv2.port, t, { i, policy: 'shove' })));
    try{
      await L.waitFor(() => (clients[0].club.history || []).length, 15000, 'tournament to finish after restart');
      const h = clients[0].club.history[0], uids = h.results.map(r => r.uid);
      const dup = uids.filter((u, i) => uids.indexOf(u) !== i);
      fin = `final results rows=${uids.length} for entrants=${h.entrants}, duplicate uids=${dup.length}`;
      if(dup.length || uids.length !== h.entrants) issues.push(`final history has ${uids.length} rows for ${h.entrants} entrants (${dup.length} duplicate uids)`);
    }catch(e){ fin = e.message; }
  }
  const pass = issues.length === 0;
  L.result(NAME, { pass, expectFail: EXPECT_FAIL,
    reason: pass ? 'state after db outage + restart is consistent' : issues.join('; '),
    notes: [`writes that failed while db was down: ${failedKeys.join(', ') || 'none'}`,
      `persisted tourney.places=${JSON.stringify(placesNow)} remaining=${persisted.tourney.remaining}; live seated=${JSON.stringify(c1.seated)} (sum ${c1.sum})`,
      `restarted server resumed=${/resumed running tournament/.test(srv2.log)}; seated now=${seatedNow.length} chips=${d.chips}/${d.expected}`, fin,
      'cause: per-key async upserts with no transaction (server/store.js:39-47); tourney and live written separately (server/club.js:337 then :347)'] });
}, () => { L.closeAll(clients); L.stop(srv); L.stop(srv2); });
