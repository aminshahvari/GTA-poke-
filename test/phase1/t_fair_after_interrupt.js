// 7. fair_after_interrupt
// kill -9 after the flop of a hand, restart, finish the tournament, then run the browser verifier
// (public/fair-verify.js, which mirrors server/fair.js) on the published report. Policy (R2-B5): the deal is saved at
// deal time (fair.saveDeal), and on resume a deal cut off by the restart is kept as its own record marked
// void: 'interrupted' while the hand is replayed under the same number with a new deck. Gameplay is unchanged.
// Asserts: seal + every deck verify (void ones included), non-void hand numbers per table are 1..N with no gaps or
// duplicates, and the interrupted deal (the hole cards a player saw) is in the report, verifies, and is marked void.
const fs = require('fs'), path = require('path'), vm = require('vm');
const L = require('./lib');
const { cardStr } = require(path.join(L.ROOT, 'server', 'engine.js')); // card ints -> the strings players are sent
const NAME = 'fair_after_interrupt', EXPECT_FAIL = false;
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
  rep.hands.filter(h => !h.void).forEach(h => (byTable[h.tid] = byTable[h.tid] || []).push(h.hand));
  for(const [tid, ns] of Object.entries(byTable)){
    const max = Math.max(...ns), set = new Set(ns);
    const gaps = []; for(let i = 1; i <= max; i++) if(!set.has(i)) gaps.push(i);
    const dups = ns.filter((n, i) => ns.indexOf(n) !== i);
    if(gaps.length) issues.push(`${tid}: hand numbers missing ${gaps.join(',')}`);
    if(dups.length) issues.push(`${tid}: hand numbers recorded twice ${[...new Set(dups)].join(',')}`);
  }
  if(!seen.length) throw new Error('no player saw hole cards for the interrupted hand');
  const recs = out.hands.filter(h => h.tid === cut.tid && h.hand === cut.hand);
  const deal = recs.find(r => seen.every(cs => r.players.some(p => String(p.cards.map(cardStr)) === String(cs))));
  if(!deal) issues.push(`interrupted deal (hand ${cut.hand}, cards players saw before the crash) is not in the report; hand ${cut.hand} has ${recs.length} record(s) with different cards`);
  else {
    if(!deal.match) issues.push(`interrupted deal (hand ${cut.hand}) does not verify against its deck`);
    if(deal.void !== 'interrupted') issues.push(`interrupted deal (hand ${cut.hand}) is not marked void: 'interrupted' (got ${JSON.stringify(deal.void)})`);
    if(String(deal.board.map(cardStr)) !== String(cut.board)) issues.push(`interrupted deal board ${deal.board.map(cardStr)} != board seen ${cut.board}`);
    if(!recs.some(r => r !== deal && !r.void)) issues.push(`hand ${cut.hand} has no replayed (non-void) record`);
  }
  const voids = rep.hands.filter(h => h.void);
  if(voids.length !== 1) issues.push(`expected exactly 1 void record, got ${voids.length}`);
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL,
    reason: issues.length ? issues.join('; ') : 'report verifies, non-void hand numbers contiguous, interrupted deal recorded as void and verifies',
    notes: [`verifier: sealOk=${out.sealOk} ok=${out.ok} bad=${out.bad} void=${out.void} (all beacons local: NO_BEACON); ${rep.hands.length} hand records`,
      `killed on ${cut.tid} hand ${cut.hand} after board ${cut.board.join(' ')}; restart replays it as hand ${cut.hand} with a new deck; old deal kept as void`] });
}, () => { L.closeAll(clients); L.stop(A); L.stop(B); });
