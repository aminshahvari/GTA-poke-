// 6. reconnect (server side expected to PASS today; the client-side loss is not testable here)
// A player's socket drops while it is their turn and reconnects before the deadline. Server side: on `hello` the
// server pushes the current table snapshot (server/index.js:299), which should carry the pending turn (actUid, seq,
// legal, deadline) and the player's hole cards, and an act sent on the new socket with that seq must be applied.
// Also records whether the server acknowledges acts at all (it does not: rejected acts are dropped silently,
// server/club.js:254-260), which is why an act sent into a dead socket is lost without the client knowing.
const L = require('./lib');
const NAME = 'reconnect', EXPECT_FAIL = false;
let srv, clients = [], re;
L.guard(NAME, EXPECT_FAIL, async () => {
  const dir = L.tmpdir('recon');
  srv = await L.startServer({ dataFile: dir + '/club.json', env: { TIME_BANK_MS: '5000' }, label: 'A' });
  const tokens = await L.setupClub(srv.base, 3);
  let turn = null;
  const freeze = (c, tb) => { if(!turn) turn = { tid: tb.tid, hand: tb.handNo, seq: tb.seq, deadline: tb.deadline, at: Date.now() }; return null; };
  clients = await Promise.all(tokens.map((t, i) => L.connect(srv.port, t, { i, policy: i === 1 ? freeze : 'call' })));
  const p = clients[1];
  await L.runTourney(clients[0], clients);
  await L.waitFor(() => turn, 8000, 'player 1 to get a turn');
  const cardsBefore = p.cards[turn.tid + '#' + turn.hand];
  // the act sent as the connection dies: terminate first, then try to send (what a phone does when it loses signal)
  p.ws.terminate();
  let sendErr = null; try{ p.ws.send(JSON.stringify({ t: 'act', tid: turn.tid, hand: turn.hand, seq: turn.seq, a: { t: 'call' } })); }catch(e){ sendErr = e.message; }
  await L.sleep(400);
  re = await L.connect(srv.port, tokens[1], { i: 1, policy: 'none' });
  await L.waitFor(() => re.lastTable, 2000, 'table snapshot after reconnect');
  const snap = re.lastTable, issues = [];
  if(snap.actUid !== re.id) issues.push(`after reconnect actUid=${snap.actUid}, not the reconnecting player`);
  if(snap.seq !== turn.seq || snap.handNo !== turn.hand) issues.push(`turn changed: seq ${turn.seq}->${snap.seq}, hand ${turn.hand}->${snap.handNo}`);
  if(!snap.legal) issues.push('no legal actions re-sent');
  if(!(snap.deadline > Date.now())) issues.push('deadline already passed');
  const cardsAfter = re.cards[snap.tid + '#' + snap.handNo];
  if(!cardsAfter || String(cardsAfter) !== String(cardsBefore)) issues.push('hole cards not re-sent after reconnect');
  // a rejected (stale) act: does the server say anything?
  const before = re.msgs.length;
  re.send({ t: 'act', tid: snap.tid, hand: snap.handNo, seq: snap.seq - 1, a: { t: 'fold' } });
  await L.sleep(150);
  const replies = re.msgs.slice(before).map(m => m.t);
  // now act for real on the new socket
  re.send({ t: 'act', tid: snap.tid, hand: snap.handNo, seq: snap.seq, a: snap.legal && snap.legal.canCheck ? { t: 'check' } : { t: 'call' } });
  const applied = await L.waitFor(() => re.lastTable.seq !== snap.seq || re.lastTable.handNo !== snap.handNo, 2000, 'act applied').then(() => true).catch(() => false);
  if(!applied) issues.push('act on the reconnected socket was not applied');
  const timedOut = (re.lastTable.seats.find(s => s && s.uid === re.id) || {}).away;
  if(timedOut) issues.push('player was marked away (turn timed out) despite acting');
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL,
    reason: issues.length ? issues.join('; ') : 'server re-sent turn (same seq, legal, deadline) and cards on reconnect; act on new socket applied',
    notes: [`send on dead socket: ${sendErr ? 'threw "' + sendErr + '"' : 'returned without error and the act went nowhere'}; deadline kept (not reset): ${snap.deadline === turn.deadline}`,
      `server reply to a rejected act: ${replies.length ? replies.join(',') : 'none - no ack/nack for act (server/index.js:309), so a client cannot tell a lost act from a slow one'}`] });
}, () => { L.closeAll(clients); re && L.closeAll([re]); L.stop(srv); });
