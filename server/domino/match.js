// One domino match on the Smart Scorepad, kept as an append-only list of events. Pure functions: apply() takes a match
// and one operation and returns the next match, or throws; nothing is ever edited or removed from the list. The score
// is always folded from the events (score()), so a total sent by a client has nowhere to go.
//
// Operations (op.type), each with op.opId (the client's id for this tap; sending it again changes nothing):
//   count    { side, points }            All Fives scoring play
//   hand     { end, pips, out? }         a hand ended: domino (out = who went out) or blocked; pips = { uid: left }
//   undo     { target }                  takes back one earlier score event (it stays in the list, marked undone)
//   correct  { target, with: {...} }     replaces one earlier score event with a corrected count or hand
//   confirm  {}                          this side agrees with the result (both sides must)
//   dispute  { reason }                  this side does not agree; the director decides
//   override { winner, reason }          director only: sets the result, with a reason, at any time
// count, hand, undo and correct also carry op.base: the event count the sender last saw. If anything was recorded since,
// the operation is refused (409) and the sender gets the current match to look at first, so two phones scoring at
// once can never both land on stale numbers.
//
// Status: ready -> live -> review (someone reached the target, or time ran out with a leader) -> final.
// review -> disputed -> final (override). Any score change in review goes back to live and clears confirmations.
// Time: when endsAt passes, the hand being played finishes; then the side ahead wins. If the score is level, they play
// one more hand, and again, until it isn't (sudden death). See docs/domino/DESIGN.md, "Match time".
const rules = require('./rules');

const SCORE = ['count', 'hand', 'correct'];
const fail = (status, msg, extra) => Object.assign(new Error(msg), { status }, extra || {});
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

function create({ id, tid, round, slot, sides, table, rules: r }){
  return { id, tid, round: round || 1, slot: slot || 0, sides: sides || [[], []], table: table || null, rules: r,
    status: sides && sides[0].length && sides[1].length ? 'ready' : 'waiting', events: [], startedAt: null, endsAt: null,
    confirm: [null, null], dispute: null, result: null };
}
const sideOf = (m, uid) => m.sides[0].includes(uid) ? 0 : m.sides[1].includes(uid) ? 1 : -1;
// the events still in force: score events that nothing undid or replaced
function live(m){
  const gone = new Set(m.events.filter(e => e.type === 'undo' || e.type === 'correct').map(e => e.target));
  return m.events.filter(e => SCORE.includes(e.type) && !gone.has(e.seq));
}
// what a score event is worth, from its raw facts (recomputed every time, never stored as the truth)
function worth(m, e){
  const x = e.type === 'correct' ? e.with : e;
  if(x.type === 'count') return { side: x.side, points: rules.countPoints(m.rules, x.points), hand: false };
  const h = rules.handResult(m.rules, m.sides, x.end, x.pips, x.out);
  return { side: h.side, points: h.points, hand: true };
}
function score(m){
  const s = [0, 0]; let hands = 0;
  for(const e of live(m)){ const w = worth(m, e); if(w.side !== null) s[w.side] += w.points; if(w.hand) hands++; }
  return { scores: s, hands };
}
const timeUp = (m, now) => !!(m.endsAt && now >= m.endsAt);

// a score event's own facts, checked; the stored event keeps only these
function scoreFacts(m, o){
  if(o.type === 'count'){
    if(o.side !== 0 && o.side !== 1) throw fail(400, 'Pick which side scored.');
    return { type: 'count', side: o.side, points: rules.countPoints(m.rules, o.points) };
  }
  if(o.type === 'hand'){
    const pips = {}; for(const uid of m.sides.flat()) pips[uid] = o.pips && o.pips[uid];
    const out = o.end === 'domino' ? o.out : undefined;
    rules.handResult(m.rules, m.sides, o.end, { ...o.pips }, out); // throws on anything that can't be
    return { type: 'hand', end: o.end, pips, ...(out ? { out } : {}) };
  }
  throw fail(400, 'A correction is a scoring play or a hand.');
}

// after a score change: has someone won?
function settle(m, now){
  const { scores } = score(m), t = m.rules.target;
  let winner = null, by = null;
  // first to the target wins; a level score at or past it (possible only after a correction) plays on
  if((scores[0] >= t || scores[1] >= t) && scores[0] !== scores[1]){ winner = scores[0] > scores[1] ? 0 : 1; by = 'target'; }
  else if(timeUp(m, now) && scores[0] !== scores[1] && m.events.length && m.events[m.events.length - 1].type !== 'count'){ winner = scores[0] > scores[1] ? 0 : 1; by = 'time'; }
  if(winner === null) return { ...m, status: 'live', confirm: [null, null], result: null };
  return { ...m, status: 'review', confirm: [null, null], result: { winner, scores, by } };
}

// apply one operation. actor: { uid, director }. Returns { match, dup } (dup: this opId was already applied).
function apply(m, op, actor, now = Date.now()){
  if(!op || typeof op !== 'object') throw fail(400, 'Nothing to record.');
  const opId = op.opId;
  if(typeof opId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(opId)) throw fail(400, 'Every tap needs its own id.');
  const seen = m.events.find(e => e.opId === opId);
  if(seen){
    if(seen.by !== actor.uid) throw fail(409, 'That id was already used by someone else.');
    return { match: m, dup: true };
  }
  const side = sideOf(m, actor.uid), player = side >= 0;
  if(!player && !actor.director) throw fail(403, 'Only the players in this match or the director can record it.');
  const base = { seq: m.events.length + 1, opId, by: actor.uid, at: now };
  const push = (e, next) => ({ match: { ...next, events: [...m.events, { ...base, ...e }] }, dup: false });

  if(op.type === 'override'){
    if(!actor.director) throw fail(403, 'Only the director can set a result.');
    if(m.status === 'waiting') throw fail(400, 'This match has no players yet.');
    if(op.winner !== 0 && op.winner !== 1) throw fail(400, 'Pick the winning side.');
    const reason = clean(op.reason, 300); if(!reason) throw fail(400, 'Give a reason; it is kept in the record.');
    if(m.status === 'final' && m.result && m.result.winner === op.winner) throw fail(400, 'That is already the result.');
    const { scores } = score(m);
    return push({ type: 'override', winner: op.winner, reason, was: m.result ? m.result.winner : null },
      { ...m, status: 'final', dispute: m.dispute ? { ...m.dispute, resolved: now } : null, result: { winner: op.winner, scores, by: 'override' } });
  }
  if(m.status === 'final') throw fail(400, 'This match is final. Only the director can change it.');
  if(m.status === 'waiting') throw fail(400, 'This match has no players yet.');
  if(m.status === 'ready') throw fail(400, 'This match has not started yet.');

  if(op.type === 'confirm' || op.type === 'dispute'){
    if(!player) throw fail(403, 'Only the players confirm or dispute a result.');
    if(m.status !== 'review') throw fail(400, m.status === 'disputed' ? 'This result is disputed; the director decides.' : 'There is no result to confirm yet.');
    if(op.type === 'dispute'){
      const reason = clean(op.reason, 300); if(!reason) throw fail(400, 'Say what is wrong; the director sees it.');
      return push({ type: 'dispute', side, reason }, { ...m, status: 'disputed', dispute: { side, by: actor.uid, reason, at: now } });
    }
    if(m.confirm[side]) throw fail(400, 'Your side already confirmed.');
    const confirm = m.confirm.map((c, i) => i === side ? actor.uid : c);
    return push({ type: 'confirm', side }, { ...m, confirm, status: confirm[0] && confirm[1] ? 'final' : 'review' });
  }

  if(!['count', 'hand', 'undo', 'correct'].includes(op.type)) throw fail(400, 'Unknown action.');
  if(m.status === 'disputed' && !actor.director) throw fail(400, 'This result is disputed; the director decides.');
  if(op.base !== m.events.length) throw fail(409, 'The score changed on another phone. Check it, then try again.', { current: m.events.length });
  let e;
  if(op.type === 'undo' || op.type === 'correct'){
    const t = live(m).find(x => x.seq === op.target);
    if(!t) throw fail(400, 'That entry was already taken back, or is not a score.');
    e = op.type === 'undo' ? { type: 'undo', target: t.seq } : { type: 'correct', target: t.seq, with: scoreFacts(m, op.with || {}) };
  } else e = scoreFacts(m, op);
  const next = { ...m, events: [...m.events, { ...base, ...e }], dispute: null };
  return { match: settle(next, now), dup: false };
}

// start the clock (director, or the round starting): live, with its end time if the round has one
function start(m, now, minutes){
  if(m.status !== 'ready') throw fail(400, m.status === 'waiting' ? 'This match has no players yet.' : 'This match already started.');
  return { ...m, status: 'live', startedAt: now, endsAt: minutes ? now + minutes * 60000 : null };
}
// time ran out with a leader and the last hand finished: the clock alone can move a live match to review
function tick(m, now){
  if(m.status !== 'live' || !timeUp(m, now)) return m;
  const last = m.events[m.events.length - 1];
  if(!last || last.type === 'count') return m; // a hand is still being played
  return settle(m, now);
}
// what the players and director see (raw events included: the scorepad shows the full record)
function view(m, now = Date.now()){
  const { scores, hands } = score(m), gone = new Set(m.events.filter(e => e.type === 'undo' || e.type === 'correct').map(e => e.target));
  return { id: m.id, tid: m.tid, round: m.round, slot: m.slot, sides: m.sides, table: m.table, status: m.status, rules: m.rules,
    scores, hands, seq: m.events.length, startedAt: m.startedAt, endsAt: m.endsAt, timeUp: timeUp(m, now),
    confirm: m.confirm.map(Boolean), dispute: m.dispute, result: m.result,
    events: m.events.map(e => ({ ...e, ...(gone.has(e.seq) ? { undone: true } : {}), ...(SCORE.includes(e.type) && !gone.has(e.seq) ? { worth: worth(m, e) } : {}) })) };
}

module.exports = { create, apply, start, tick, score, view, sideOf };
