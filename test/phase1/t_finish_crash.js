// 2. finish_crash (EXPECTED TO FAIL today)
// finish() sets `history:<id>` and then `tourney` {status:'finished'} (server/club.js:436-437), but the Postgres store
// flushes dirty keys in Set insertion order (server/store.js:41) and `tourney` is already dirty from afterHand's
// saveT (club.js:337/341), so `tourney` (finished) reaches the database BEFORE `history:`. A crash in between leaves
// a finished tournament with no result.
// Case A: SIGKILL right after the finished `tourney` row lands. Case B: SIGKILL right after `history:` lands.
// After each restart: history for the tournament exists exactly once, and every member's earned points = sum of
// their history pts.
const L = require('./lib');
const NAME = 'finish_crash', EXPECT_FAIL = true;
const procs = []; let clients = [];

async function runCase(label, fault){
  const dbDir = L.tmpdir('fincrash' + label);
  const a = await L.startServer({ mode: 'pg', dbDir, fault, label: label + '1' }); procs.push(a);
  const tokens = await L.setupClub(a.base, 3);
  clients = await Promise.all(tokens.map((t, i) => L.connect(a.port, t, { i, policy: 'shove' })));
  await L.runTourney(clients[0], clients);
  const tid = clients[0].club.tourney.id;
  const ex = await Promise.race([a.exited, L.sleep(20000).then(() => null)]);
  L.closeAll(clients); clients = [];
  if(!ex) throw new Error(label + ': fault never fired');
  const db = L.readDb(dbDir);
  const order = Object.keys(db).filter(k => k === 'tourney' || k.startsWith('history:'));
  const b = await L.startServer({ mode: 'pg', dbDir, label: label + '2' }); procs.push(b);
  const resumed = /resumed running tournament/.test(b.log);
  const viewers = await Promise.all(tokens.map((t, i) => L.connect(b.port, t, { i, policy: 'shove' })));
  clients = viewers;
  // if the restart resumed play, let it finish
  if(resumed) await L.waitFor(() => viewers[0].club.tourney && viewers[0].club.tourney.status === 'finished', 15000, 'resumed tourney to finish').catch(() => {});
  await L.sleep(200);
  const hist = (viewers[0].club.history || []).filter(h => h.id === tid);
  const issues = [];
  if(hist.length !== 1) issues.push(`${label}: history for ${tid} exists ${hist.length} times (tourney.status=${viewers[0].club.tourney && viewers[0].club.tourney.status})`);
  for(const v of viewers){
    const sum = (v.club.history || []).flatMap(h => h.results).filter(r => r.uid === v.id).reduce((s, r) => s + r.pts, 0);
    if(v.club.shop.earned !== sum) issues.push(`${label}: ${v.id} earned ${v.club.shop.earned} != history sum ${sum}`);
  }
  const winnerBefore = db['history:' + tid] ? db['history:' + tid].results[0].uid : null;
  const winnerAfter = hist[0] ? hist[0].results[0].uid : null;
  if(winnerBefore && winnerAfter && winnerBefore !== winnerAfter) issues.push(`${label}: winner changed across restart (${winnerBefore} -> ${winnerAfter})`);
  L.closeAll(viewers); clients = [];
  await L.stop(b);
  return { issues, note: `${label}: died ${JSON.stringify(ex)}; db had tourney.status=${db.tourney && db.tourney.status}, history row=${!!db['history:' + tid]}, live row=${!!db.live}; restart resumed=${resumed}; history rows after=${hist.length}` };
}

L.guard(NAME, EXPECT_FAIL, async () => {
  const A = await runCase('A', { match: { key: 'tourney', status: 'finished' }, action: 'kill' });
  const B = await runCase('B', { match: { prefix: 'history:' }, action: 'kill' });
  const issues = [...A.issues, ...B.issues];
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL,
    reason: issues.length ? issues.join('; ') : 'result recorded exactly once in both crash points',
    notes: [A.note, B.note, 'flush order = Set insertion order of dirty keys (server/store.js:41); no transaction across history:/tourney/live (server/club.js:436-438)'] });
}, () => { L.closeAll(clients); procs.forEach(p => L.stop(p)); });
