// 4. duplicate_actions (expected to PASS today)
// One player sends every action twice, and before each real action fires two stale "fold"s: one with the previous
// decision's seq and one with the current seq but the previous hand number. The player only ever checks/calls, so a
// single fold on the table means a duplicate or stale act was applied. Server guard: server/club.js:254-260.
// Then the FAST tournament runs to the end and every member's points balance must equal the sum of their history pts,
// with one history row per tournament and one result row per entrant.
const L = require('./lib');
const NAME = 'duplicate_actions', EXPECT_FAIL = false;
let srv, clients = [];
L.guard(NAME, EXPECT_FAIL, async () => {
  const dir = L.tmpdir('dup');
  srv = await L.startServer({ dataFile: dir + '/club.json', label: 'A' });
  const tokens = await L.setupClub(srv.base, 5);
  let prevTurn = null, turns = 0, sent = 0;
  const dupPlayer = (c, tb) => {
    const a = tb.legal.canCheck ? { t: 'check' } : { t: 'call' };
    if(prevTurn){
      c.send({ t: 'act', tid: prevTurn.tid, hand: prevTurn.hand, seq: prevTurn.seq, a: { t: 'fold' } });            // stale seq
      c.send({ t: 'act', tid: tb.tid, hand: tb.handNo - 1, seq: tb.seq, a: { t: 'fold' } });                        // stale hand
      c.send({ t: 'act', tid: tb.tid, hand: String(tb.handNo), seq: tb.seq, a: { t: 'fold' } });                    // wrong type
    }
    prevTurn = { tid: tb.tid, hand: tb.handNo, seq: tb.seq }; turns++;
    setTimeout(() => { const m = { t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a }; c.send(m); c.send(m); sent += 2; }, 15);
    return null;
  };
  const other = (c, tb) => { const L2 = tb.legal; // nobody shoves until the dup player has made 8 decisions
    return L2.canRaise && turns >= 8 && Math.random() < .3 ? { t: 'raise', to: L2.maxTo } : L2.canCheck ? { t: 'check' } : { t: 'call' }; };
  clients = await Promise.all(tokens.map((t, i) => L.connect(srv.port, t, { i, policy: i === 1 ? dupPlayer : other })));
  const dup = clients[1];
  let folds = 0;
  dup.events.push(tb => { const s = tb.seats.find(x => x && x.uid === dup.id); if(s && s.inHand && s.folded) folds++; });
  await L.runTourney(clients[0], clients);
  await L.waitFor(() => (clients[0].club.history || []).length === 1 && clients.every(c => c.club.history && c.club.history.length === 1), 25000, 'tournament to finish', 50);
  // poke a finished tournament: these must not award anything again
  clients[0].send({ t: 'start' });
  dup.send({ t: 'act', tid: prevTurn.tid, hand: prevTurn.hand, seq: prevTurn.seq, a: { t: 'call' } });
  await L.sleep(300);
  const issues = [];
  if(folds) issues.push(`a duplicate/stale act was applied (${folds} fold snapshots for a player who never folds)`);
  const hist = clients[0].club.history;
  const ids = hist.map(h => h.id);
  if(new Set(ids).size !== ids.length) issues.push('history has duplicate tournament ids');
  for(const h of hist){ const u = h.results.map(r => r.uid); if(new Set(u).size !== u.length || u.length !== h.entrants) issues.push(`history ${h.id}: ${u.length} rows for ${h.entrants} entrants`); }
  for(const c of clients){
    const sum = hist.flatMap(h => h.results).filter(r => r.uid === c.id).reduce((s, r) => s + r.pts, 0);
    if(c.club.shop.earned !== sum || c.club.shop.balance !== sum) issues.push(`${c.id}: earned=${c.club.shop.earned} balance=${c.club.shop.balance} vs history pts ${sum}`);
  }
  const totalPts = hist.flatMap(h => h.results).reduce((s, r) => s + r.pts, 0);
  L.result(NAME, { pass: !issues.length && turns >= 5, expectFail: EXPECT_FAIL,
    reason: issues.length ? issues.join('; ') : turns >= 5 ? `${turns} decisions, ${sent} duplicate sends + stale acts all ignored; points = history pts for all ${clients.length} members` : `dup player got only ${turns} turns`,
    notes: [`total pts awarded ${totalPts} across ${hist[0].results.length} results; a rejected act gets no reply from the server (club.act returns false silently, server/index.js:309)`] });
}, () => { L.closeAll(clients); L.stop(srv); });
