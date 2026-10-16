// 7. fair_after_interrupt (EXPECTED TO FAIL today)
// kill -9 after the flop of a hand, restart, finish the tournament, then run the browser verifier
// (public/fair-verify.js, which mirrors server/fair.js) on the published report. A fair record is only written once
// a hand completes (server/club.js:313), and on resume the hand is replayed under the same hand number with a fresh
// beacon (club.js:156, fair.js:46-51), so the deal players actually saw before the crash is in no record.
// Asserts: seal + every deck verify, hand numbers per table are 1..N with no gaps or duplicates, and the
// interrupted deal (the hole cards a player saw) is in the report.
const fs = require('fs'), path = require('path'), vm = require('vm');
const L = require('./lib');
const { cardStr } = require(path.join(L.ROOT, 'server', 'engine.js')); // card ints -> the strings players are sent
const NAME = 'fair_after_interrupt', EXPECT_FAIL = true;
let A, B, clients = [];

function loadVerifier(){
  const sandbox = { window: {}, crypto: globalThis.crypto, TextEncoder, Uint8Array, fetch: async () => { throw new Error('offline'); } };
  vm.runInNewContext(fs.readFileSync(path.join(L.ROOT, 'public', 'fair-verify.js'), 'utf8'), sandbox);
  return sandbox.window.FAIR;
}

L.guard(NAME, EXPECT_FAIL, async () => {
  const dbDir = L.tmpdir('fair');
  A = await L.startServer({ mode: 'pg', dbDir, label: 'A' });
  const tokens = await L.setupClub(A.base, 3);
  clients = await Promise.all(tokens.map((t, i) => L.connect(A.port, t, { i, policy: 'call' })));
  let cut = null;
  clients[0].events.push(tb => {
    if(!cut && tb.phase === 'hand' && tb.handNo >= 3 && tb.street >= 1){
      cut = { tid: tb.tid, hand: tb.handNo, board: tb.board.slice() };
      A.proc.kill('SIGKILL');
    }
  });
  await L.runTourney(clients[0], clients, { stack: 100000 });
  const tId = clients[0].club.tourney.id;
  await L.waitFor(() => cut, 10000, 'a flop on hand 3+');
  await A.exited;
  const seen = clients.map(c => c.cards[cut.tid + '#' + cut.hand]).filter(Boolean);
  L.closeAll(clients); clients = [];
  B = await L.startServer({ mode: 'pg', dbDir, label: 'B' });
  clients = await Promise.all(tokens.map((t, i) => L.connect(B.port, t, { i, policy: 'shove' })));
  await L.waitFor(() => (clients[0].club.history || []).some(h => h.id === tId), 15000, 'tournament to finish after restart');
  clients[0].send({ t: 'fair', id: tId });
  await L.waitFor(() => clients[0].fair, 3000, 'fair report');
  const rep = clients[0].fair;
  const out = await loadVerifier().verify(rep);
  const issues = [];
  if(!out.sealOk) issues.push('seal does not match seed');
  if(out.bad) issues.push(`${out.bad} hands fail deck verification`);
  const byTable = {};
  rep.hands.forEach(h => (byTable[h.tid] = byTable[h.tid] || []).push(h.hand));
  for(const [tid, ns] of Object.entries(byTable)){
    const max = Math.max(...ns), set = new Set(ns);
    const gaps = []; for(let i = 1; i <= max; i++) if(!set.has(i)) gaps.push(i);
    const dups = ns.filter((n, i) => ns.indexOf(n) !== i);
    if(gaps.length) issues.push(`${tid}: hand numbers missing ${gaps.join(',')}`);
    if(dups.length) issues.push(`${tid}: hand numbers recorded twice ${[...new Set(dups)].join(',')}`);
  }
  if(!seen.length) throw new Error('no player saw hole cards for the interrupted hand');
  const recs = rep.hands.filter(h => h.tid === cut.tid && h.hand === cut.hand);
  const hasDeal = recs.some(r => seen.every(cs => r.players.some(p => String(p.cards.map(cardStr)) === String(cs))));
  if(!hasDeal) issues.push(`interrupted deal (hand ${cut.hand}, cards players saw before the crash) is not in the report; hand ${cut.hand} has ${recs.length} record(s) with different cards`);
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL,
    reason: issues.length ? issues.join('; ') : 'report verifies, hand numbers contiguous, interrupted deal recorded',
    notes: [`verifier: sealOk=${out.sealOk} ok=${out.ok} bad=${out.bad} (all beacons local: NO_BEACON); ${rep.hands.length} hand records`,
      `killed on ${cut.tid} hand ${cut.hand} after board ${cut.board.join(' ')}; restart replays it as hand ${cut.hand} with a new deck`] });
}, () => { L.closeAll(clients); L.stop(A); L.stop(B); });
