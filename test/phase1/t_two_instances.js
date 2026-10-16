// 5. two_instances (passes since B1: the lease/epoch in server/store.js fences out the old instance)
// During a Render deploy the new instance boots against the same Postgres while the old one keeps serving for
// ~60-90 s. On boot, store.init() loads everything and club.resume() restarts any running tournament
// (server/index.js:392-393, server/club.js:148-163) with no lock or lease, so both processes deal the same tables and
// both write `tourney` / `live` / `fair:` rows. Players stay connected to the old instance (A); the new one (B) is
// watched by one extra socket. TIME_BANK_MS=400 keeps the test short.
// Asserts: only one instance deals hands, the persisted `live` hand numbers never go backwards (no clobbering), and
// the old instance (A) closes its sockets with 4001 and exits once B holds the lease.
const L = require('./lib');
const NAME = 'two_instances', EXPECT_FAIL = false;
let A, B, clients = [], obsB;
L.guard(NAME, EXPECT_FAIL, async () => {
  const dbDir = L.tmpdir('two');
  A = await L.startServer({ mode: 'pg', dbDir, env: { TIME_BANK_MS: '400' }, label: 'A' });
  const tokens = await L.setupClub(A.base, 6);
  clients = await Promise.all(tokens.map((t, i) => L.connect(A.port, t, { i, policy: 'call' })));
  const handsA = {}, handsB = {};
  clients[0].events.push(tb => { handsA[tb.tid] = Math.max(handsA[tb.tid] || 0, tb.handNo); });
  await L.runTourney(clients[0], clients, { stack: 100000 });
  await L.waitFor(() => Object.values(handsA).some(n => n >= 2), 8000, 'A to deal a couple of hands');
  // the "new deploy" starts on the same database while A keeps running
  B = await L.startServer({ mode: 'pg', dbDir, env: { TIME_BANK_MS: '400' }, label: 'B' }); // short clock so B's absent players time out quickly
  const bResumed = /resumed running tournament/.test(B.log);
  obsB = await L.connect(B.port, tokens[0], { i: 99, policy: 'call' });
  obsB.events.push(tb => { handsB[tb.tid] = Math.max(handsB[tb.tid] || 0, tb.handNo); });
  const tid = clients[0].club.myTable;
  if(tid) obsB.send({ t: 'watch', tid });
  // sample the shared database while both run
  const samples = [];
  const startA = { ...handsA };
  const t0 = Date.now();
  while(Date.now() - t0 < 6000){
    const db = L.readDb(dbDir);
    if(db.live) samples.push({ at: Date.now() - t0, hands: Object.fromEntries(db.live.tables.map(t => [t.tid, t.handNo])), places: (db.tourney.places || []).length });
    await L.sleep(50);
  }
  const issues = [];
  const aDealt = Object.keys(handsA).some(k => handsA[k] > (startA[k] || 0));
  const bDealt = Object.values(handsB).some(n => n > 0) && /resumed/.test(B.log);
  if(aDealt && bDealt) issues.push('both instances dealt hands for the same tournament');
  let backwards = 0, last = {};
  for(const s of samples) for(const [k, n] of Object.entries(s.hands)){ if(last[k] != null && n < last[k]) backwards++; last[k] = n; }
  if(backwards) issues.push(`persisted live.handNo went backwards ${backwards} times (instances overwrite each other)`);
  if(!A.exit) issues.push('old instance A still running after B took over');
  const codes = [...new Set(clients.map(c => c.closeCode))];
  if(A.exit && codes.join() !== '4001') issues.push('A closed player sockets with ' + codes.join());
  const dA = await L.chips(A.base).catch(() => ({ tables: [], chips: 'n/a (exited)' })), dB = await L.chips(B.base);
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL,
    reason: issues.length ? issues.join('; ') : 'only one instance dealt; state not clobbered',
    notes: [`B resumed the running tournament on boot: ${bResumed}; A exit=${JSON.stringify(A.exit)}, A said: ${(A.log.match(/lease lost[^\n]*/) || ['(no lease message)'])[0]}`,
      `hand numbers seen: A ${JSON.stringify(startA)} -> ${JSON.stringify(handsA)}; B ${JSON.stringify(handsB)}`,
      `both report live tables: A ${dA.tables.length} tables ${dA.chips} chips, B ${dB.tables.length} tables ${dB.chips} chips; ${samples.length} db samples`,
      'before B1, players on A kept playing while B timed them out (away -> folds) and both wrote tourney/live rows'] });
}, () => { L.closeAll(clients); obsB && L.closeAll([obsB]); L.stop(A); L.stop(B); });
