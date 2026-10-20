// Domino engine, pure: rule fixtures (docs/domino/RULES.md), the match event log (scoring, blocked hands, team
// scoring, undo and corrections, idempotent taps, concurrent phones, dual confirmation, disputes, director override,
// match time) and the bracket (seeding, byes, idempotent advancement, pods and standings). No server.
const assert = require('assert');
const rules = require('../server/domino/rules');
const M = require('../server/domino/match');
const B = require('../server/domino/bracket');
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
const throws = (fn, re, msg) => { let e = null; try{ fn(); }catch(x){ e = x; } check(e && re.test(e.message), msg + (e ? ` ("${e.message}")` : ' (did not throw)')); return e; };
let ids = 0; const op = (o) => ({ opId: 'op' + String(++ids).padStart(8, '0'), ...o });

// ---------- rule fixtures ----------
const AF = rules.make({ preset: 'allfives', format: 'hu' }), BL = rules.make({ preset: 'block', format: 'hu' }), DR2 = rules.make({ preset: 'draw', format: 'pairs' });
check(AF.target === 150 && BL.target === 100 && DR2.perSide === 2 && AF.handEnd === 'round5', 'presets: All Fives to 150, Block and Draw to 100, partnership has 2 a side');
check([[12, 10], [13, 15], [15, 15], [17, 15], [18, 20], [0, 0], [2, 0], [3, 5]].every(([a, b]) => rules.round5(a) === b), 'All Fives hand-end points round to the nearest 5, halves up (12->10, 13->15, 2->0, 3->5)');
const hu = [['a'], ['b']], pr = [['a', 'c'], ['b', 'd']];
// F1 Block, domino: a goes out, b holds 23 -> a scores 23
let h = rules.handResult(BL, hu, 'domino', { a: 0, b: 23 }, 'a');
check(h.side === 0 && h.points === 23, 'F1 Block: going out scores the opponent\'s pips exactly (23)');
// F2 All Fives, domino: b holds 23 -> 25
h = rules.handResult(AF, hu, 'domino', { a: 0, b: 23 }, 'a');
check(h.side === 0 && h.points === 25, 'F2 All Fives: going out scores the opponent\'s pips rounded to 5 (23 -> 25)');
// F3 blocked, opponents rule: a 8, b 14 -> a scores 14
h = rules.handResult(BL, hu, 'blocked', { a: 8, b: 14 });
check(h.side === 0 && h.points === 14, 'F3 blocked hand: the lower hand scores the other hand (8 v 14 -> 14)');
// F4 blocked, difference rule
const BLd = rules.make({ preset: 'block', format: 'hu', blocked: 'difference' });
h = rules.handResult(BLd, hu, 'blocked', { a: 8, b: 14 });
check(h.side === 0 && h.points === 6, 'F4 blocked hand, difference option: 14 - 8 = 6');
// F5 blocked tie: nobody scores
h = rules.handResult(BL, hu, 'blocked', { a: 9, b: 9 });
check(h.side === null && h.points === 0, 'F5 blocked tie: nobody scores');
// F6 partnership, domino: a goes out; partner c holds 5 (does not count); b 10 + d 12 = 22
h = rules.handResult(DR2, pr, 'domino', { a: 0, c: 5, b: 10, d: 12 }, 'a');
check(h.side === 0 && h.points === 22 && h.totals[0] === 5, 'F6 partnership: going out scores both opponents (10 + 12 = 22); the partner\'s 5 does not count');
// F7 partnership blocked: team totals decide (a 3 + c 20 = 23 v b 9 + d 10 = 19) -> side 1 scores 23
h = rules.handResult(DR2, pr, 'blocked', { a: 3, c: 20, b: 9, d: 10 });
check(h.side === 1 && h.points === 23, 'F7 partnership blocked: the side with the lower team total (19 v 23) scores the other team\'s 23');
// F8 All Fives blocked rounding: a 4, b 18 -> a scores 20
h = rules.handResult(AF, hu, 'blocked', { a: 4, b: 18 });
check(h.side === 0 && h.points === 20, 'F8 All Fives blocked: 18 rounds to 20');
throws(() => rules.handResult(BL, hu, 'domino', { a: 3, b: 23 }, 'a'), /no pips left/, 'whoever went out must have 0 pips');
throws(() => rules.handResult(BL, hu, 'domino', { a: 0, b: 85 }, 'a'), /0 to 84/, 'a hand cannot hold more than 84 pips');
throws(() => rules.handResult(DR2, pr, 'blocked', { a: 84, c: 84, b: 1, d: 0 }), /more pips than a double-six set/, 'hands cannot add up to more than the set (168)');
throws(() => rules.handResult(BL, hu, 'domino', { a: 0, b: 2.5 }, 'a'), /whole number/, 'pips are whole numbers');
throws(() => rules.handResult(BL, hu, 'domino', { a: 0, b: 2, z: 1 }, 'a'), /not in this match/, 'no pips for someone outside the match');
throws(() => rules.countPoints(AF, 7), /5, 10, 15/, 'a scoring play is a multiple of 5');
throws(() => rules.countPoints(AF, 65), /up to 60/, 'a scoring play is at most 60');
throws(() => rules.countPoints(BL, 10), /no scoring plays/, 'Block has no scoring plays');
throws(() => rules.make({ preset: 'allfives', format: 'hu', target: 7 }), /target/, 'targets come from the list');

// ---------- the match event log ----------
const A = { uid: 'a' }, Bp = { uid: 'b' }, D = { uid: 'dir', director: true }, X = { uid: 'x' };
const T0 = 1e12;
let m = M.start(M.create({ id: 'm1', tid: 't1', sides: hu, rules: AF }), T0, 0);
const go = (o, who = A, now = T0) => { m = M.apply(m, o, who, now).match; return m; };
go(op({ type: 'count', side: 0, points: 10, base: 0 }));
go(op({ type: 'count', side: 1, points: 15, base: 1 }), Bp);
go(op({ type: 'hand', end: 'domino', out: 'a', pips: { a: 0, b: 23 }, base: 2 }));
check(JSON.stringify(M.score(m)) === JSON.stringify({ scores: [35, 15], hands: 1 }), 'All Fives: plays 10 and 15, then a goes out on 23 (25): 35 v 15, one hand');
// idempotent: the same tap twice
const tap = op({ type: 'count', side: 0, points: 5, base: 3 });
const r1 = M.apply(m, tap, A, T0); const r2 = M.apply(r1.match, tap, A, T0);
check(!r1.dup && r2.dup && r2.match.events.length === r1.match.events.length, 'the same tap sent twice is recorded once (idempotent)');
throws(() => M.apply(r1.match, tap, Bp, T0), /already used by someone else/, 'a tap id reused by another player is refused');
m = r1.match;
// concurrent phones: both saw seq 4; the second is refused with the current count
const p1 = op({ type: 'count', side: 0, points: 5, base: 4 }), p2 = op({ type: 'count', side: 1, points: 10, base: 4 });
go(p1);
const e409 = throws(() => M.apply(m, p2, Bp, T0), /changed on another phone/, 'two phones scoring from the same view: the second gets a conflict, nothing is lost or doubled');
check(e409.status === 409 && e409.current === 5, 'the conflict carries the current event count (5)');
check(M.score(m).scores[0] === 45, 'the score is 45 after the first phone\'s play only');
// undo and correct
go(op({ type: 'undo', target: 5, base: 5 }));
check(M.score(m).scores[0] === 40 && m.events.length === 6, 'undo takes a play back but keeps it in the record (6 events)');
throws(() => go(op({ type: 'undo', target: 5, base: 6 })), /already taken back/, 'an entry cannot be undone twice');
go(op({ type: 'correct', target: 3, with: { type: 'hand', end: 'domino', out: 'a', pips: { a: 0, b: 32 } }, base: 6 }), D);
check(M.score(m).scores[0] === 45 && M.view(m, T0).events[2].undone, 'the director corrects the hand (23 -> 32 pips, 30 points): 45, the old entry shows as replaced');
throws(() => go(op({ type: 'count', side: 0, points: 5, base: 7 }), X), /Only the players/, 'someone outside the match cannot record anything');
go(op({ type: 'count', side: 0, points: 5, base: 7, total: 999, scores: [999, 0] }));
check(M.score(m).scores[0] === 50, 'a total sent by the client is ignored: the server folds the events (50)');
// reach the target -> review -> both confirm -> final
for(let i = 0; i < 2; i++) go(op({ type: 'hand', end: 'domino', out: 'a', pips: { a: 0, b: 50 }, base: m.events.length }));
check(m.status === 'review' && m.result.winner === 0 && m.result.by === 'target' && M.score(m).scores[0] === 150, 'reaching 150 moves the match to review with a provisional winner');
throws(() => go(op({ type: 'confirm' }), D), /Only the players confirm/, 'the director does not confirm for the players');
go(op({ type: 'confirm' }));
throws(() => go(op({ type: 'confirm' })), /already confirmed/, 'one side confirms once');
check(m.status === 'review' && m.confirm[0] && !m.confirm[1], 'one side confirmed: still in review');
go(op({ type: 'confirm' }), Bp);
check(m.status === 'final', 'both sides confirmed: final');
throws(() => go(op({ type: 'count', side: 1, points: 5, base: m.events.length }), Bp), /final/, 'a final match takes no more scores');
// a score change in review clears confirmations
let m2 = M.start(M.create({ id: 'm2', sides: hu, rules: BL }), T0, 0);
const g2 = (o, who = A, now = T0) => { m2 = M.apply(m2, o, who, now).match; };
g2(op({ type: 'hand', end: 'domino', out: 'a', pips: { a: 0, b: 84 }, base: 0 }));
g2(op({ type: 'hand', end: 'domino', out: 'a', pips: { a: 0, b: 20 }, base: 1 }));
check(m2.status === 'review', 'Block: 104 reaches 100, review');
g2(op({ type: 'confirm' }));
g2(op({ type: 'undo', target: 2, base: 3 }), Bp);
check(m2.status === 'live' && !m2.confirm[0] && !m2.result, 'a score change in review goes back to live and clears the confirmation');
// dispute -> director override with reason, audit kept
g2(op({ type: 'hand', end: 'domino', out: 'a', pips: { a: 0, b: 30 }, base: 4 }));
g2(op({ type: 'dispute', reason: 'b had 13 not 30' }), Bp);
check(m2.status === 'disputed' && m2.dispute.side === 1, 'a side disputes: the match waits for the director');
throws(() => g2(op({ type: 'count', side: 0, points: 5, base: 6 })), /disputed/, 'players cannot score while disputed');
throws(() => g2(op({ type: 'override', winner: 1, reason: '' }), D), /reason/, 'an override needs a reason');
throws(() => g2(op({ type: 'override', winner: 1, reason: 'x' }), A), /Only the director/, 'only the director overrides');
g2(op({ type: 'override', winner: 1, reason: 'Recount at the table: b won' }), D);
const ov = m2.events[m2.events.length - 1];
check(m2.status === 'final' && m2.result.winner === 1 && m2.result.by === 'override' && ov.reason && ov.was === 0 && ov.by === 'dir' && m2.dispute.resolved, 'override: final, winner b; the reason, the director and the earlier winner (a) are kept in the record; dispute resolved');
// match time: time runs out mid-hand, the hand finishes, the leader wins; level score plays another hand
let m3 = M.start(M.create({ id: 'm3', sides: hu, rules: BL }), T0, 20);
const g3 = (o, who, now) => { m3 = M.apply(m3, o, who || A, now).match; };
g3(op({ type: 'hand', end: 'blocked', pips: { a: 5, b: 15 }, base: 0 }), A, T0 + 60000);
check(M.tick(m3, T0 + 21 * 60000).status === 'review' && M.tick(m3, T0 + 21 * 60000).result.by === 'time', 'time up after a finished hand with a leader: review, won on time');
g3(op({ type: 'hand', end: 'blocked', pips: { a: 15, b: 0 }, base: 1 }), Bp, T0 + 19 * 60000);
check(M.score(m3).scores[0] === 15 && M.score(m3).scores[1] === 15, 'level at 15 each');
check(M.tick(m3, T0 + 21 * 60000).status === 'live', 'time up with a level score: they play another hand (sudden death)');
g3(op({ type: 'hand', end: 'domino', out: 'b', pips: { a: 7, b: 0 }, base: 2 }), Bp, T0 + 23 * 60000);
check(m3.status === 'review' && m3.result.winner === 1 && m3.result.by === 'time', 'the next hand breaks the tie: b wins on time');
// stale base after reconnect: client refetches and resends with the new base
let m4 = M.start(M.create({ id: 'm4', sides: hu, rules: AF }), T0, 0);
const tapR = op({ type: 'count', side: 0, points: 10, base: 0 });
m4 = M.apply(m4, tapR, A, T0).match; // the response was lost on the way back
check(M.apply(m4, tapR, A, T0).dup && M.score(m4).scores[0] === 10, 'reconnect: resending a tap whose answer was lost does not count it twice');

// ---------- bracket ----------
check(JSON.stringify(B.seedOrder(8)) === JSON.stringify([1, 8, 4, 5, 2, 7, 3, 6]), 'seed order for 8: 1v8, 4v5, 2v7, 3v6');
const teams = n => Array.from({ length: n }, (_, i) => ({ id: 'T' + (i + 1) }));
let br = B.elimination(teams(6));
const r1m = br.matches.filter(x => x.round === 1);
check(br.rounds === 3 && r1m.length === 4 && r1m.filter(x => x.bye).length === 2 && r1m.filter(x => x.bye).every(x => ['T1', 'T2'].includes(x.teams.find(Boolean))), '6 teams: an 8 bracket, seeds 1 and 2 get the byes');
const started = new Set(), isStarted = id => started.has(id);
B.byes(br.matches, isStarted);
const sf = br.matches.filter(x => x.round === 2);
check(sf.filter(x => x.teams.includes('T1') || x.teams.includes('T2')).length === 2, 'byes move seeds 1 and 2 into round 2, in different halves');
const m45 = r1m.find(x => x.teams.includes('T4'));
B.advance(br.matches, m45.id, 'T4', isStarted); B.advance(br.matches, m45.id, 'T4', isStarted);
const nx = br.matches.find(x => x.id === m45.next.id);
check(nx.teams.filter(t => t === 'T4').length === 1, 'advancing the same winner twice places it once (no double advancement)');
started.add(nx.id);
throws(() => B.advance(br.matches, m45.id, 'T5', isStarted), /already started/, 'a changed winner cannot replace one whose next match started');
started.delete(nx.id); B.advance(br.matches, m45.id, 'T5', isStarted);
check(nx.teams.includes('T5') && !nx.teams.includes('T4'), 'before it starts, an overridden winner replaces the earlier one');
throws(() => B.advance(br.matches, m45.id, 'T1', isStarted), /not in this match/, 'only a team from the match can advance');
// pods
const pd = B.pods(teams(9), 3);
check(pd.pods.length === 3 && pd.pods.every(p => p.teams.length === 3) && JSON.stringify(pd.pods[0].teams) === JSON.stringify(['T1', 'T6', 'T7']), '9 teams in pods of 3, snake seeded (A: 1, 6, 7)');
check(pd.matches.filter(x => x.pod === 'A').length === 3, 'a pod of 3 plays every pairing once (3 matches)');
const p4 = B.pods(teams(4), 4);
const pairs = new Set(p4.matches.map(x => [...x.teams].sort().join('-')));
check(p4.matches.length === 6 && pairs.size === 6 && Math.max(...p4.matches.map(x => x.round)) === 3, 'a pod of 4: 6 different pairings over 3 rounds');
const fin = [{ teams: ['T1', 'T6'], winner: 0, scores: [100, 40] }, { teams: ['T6', 'T7'], winner: 0, scores: [100, 90] }, { teams: ['T1', 'T7'], winner: 1, scores: [80, 100] }];
const st = B.standings(pd.pods[0], fin, id => +id.slice(1));
check(st.every(r => r.wins === 1) && st[0].id === 'T1', 'a three-way tie on wins goes to points difference (T1 +40, T6 -50, T7 +10)');
console.log(`t_domino_engine: ${n} ok, 0 failed`);
