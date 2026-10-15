// Avatars, lifetime stats and skill tiers.
process.env.DATA_FILE = require('os').tmpdir() + '/t_players_' + process.pid + '.json';
const assert = require('assert');
const store = require('../server/store');
const P = require('../server/players');
(async () => {
  await store.init();
  const u = { id: 'u000000000001', name: 'Ann' };
  // gallery and photo avatars, and bad input
  assert.strictEqual(P.setAvatar(u, { kind: 'gallery', id: 'lion' }).av, 'g:lion');
  assert.throws(() => P.setAvatar(u, { kind: 'gallery', id: 'nope' }));
  assert.throws(() => P.setAvatar(u, { kind: 'photo', data: 'data:image/png;base64,iVBORw0KGgo=' }));
  assert.throws(() => P.setAvatar(u, { kind: 'photo', data: 'data:image/jpeg;base64,' + Buffer.from('notajpeg').toString('base64') }));
  assert.throws(() => P.setAvatar(u, { kind: 'photo', data: 'data:image/jpeg;base64,' + Buffer.alloc(50000, 0xff).toString('base64') }));
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
  const withPhoto = P.setAvatar(u, { kind: 'photo', data: 'data:image/jpeg;base64,' + jpg.toString('base64') });
  assert.ok(withPhoto.av.startsWith('p:')); assert.ok(P.photo(u.id).equals(jpg));
  assert.strictEqual(P.setAvatar(withPhoto, { kind: 'none' }).av, null); assert.strictEqual(P.photo(u.id), null);

  // stats counted per hand
  const hand = (pre, notes = []) => ({ seat: 1, pos: 'CO', actions: pre.map(t => ({ seat: 1, st: 0, t, toCall: 100 })), notes });
  for(let i = 0; i < 20; i++) P.recordHand(u.id, hand(['fold']));
  for(let i = 0; i < 6; i++) P.recordHand(u.id, hand(['raise']));
  for(let i = 0; i < 4; i++) P.recordHand(u.id, hand(['call'], [{ kind: 'mistake' }]));
  const s = store.get('pstat:' + u.id);
  assert.deepStrictEqual([s.hands, s.vpip, s.pfr, s.mhands], [30, 10, 6, 4]);

  // tiers: no rating before enough hands, careful players rate higher than sloppy ones, Pro needs a sample
  const hist = [];
  assert.strictEqual(P.tierFor(P.rating({ hands: 10, vpip: 2, pfr: 2, mhands: 0, good: 0 }, P.results('x', hist)), {}, {}).id, 'new');
  const good = { hands: 400, vpip: 92, pfr: 70, mhands: 12, good: 20 }, bad = { hands: 400, vpip: 220, pfr: 40, mhands: 120, good: 0 };
  const r0 = P.results('x', hist);
  assert.ok(P.rating(good, r0) > P.rating(bad, r0) + 30, 'careful player rates much higher');
  assert.notStrictEqual(P.tierFor(P.rating(good, r0), good, r0).id, 'pro', 'Pro needs finished tournaments');
  const wins = [1, 2, 3].map(i => ({ id: 'h' + i, endedAt: i, entrants: 9, payouts: [50, 30, 20], results: [{ uid: 'x', place: 1, pts: 45 }] }));
  const r3 = P.results('x', wins);
  assert.deepStrictEqual([r3.played, r3.wins, r3.cashes, r3.best], [3, 3, 3, 1]);
  assert.strictEqual(P.tierFor(P.rating(good, r3), good, r3).id, 'pro');
  assert.strictEqual(P.tierFor(P.rating(bad, r3), bad, r3).id === 'pro', false);
  // mindset: tilt after a big loss, staying calm, report card
  const coach = require('../server/coach');
  const H = (net, notes = [], pre = ['fold'], cards = ['7c', '2d'], pos = 'CO') => ({ seat: 1, pos, bb: 100, net, cards, notes: notes.map(k => ({ kind: k, title: k === 'mistake' ? 'Called off with a weak hand' : k })), actions: pre.map(t => ({ seat: 1, st: 0, t, toCall: 100 })) });
  const big = H(-3000);
  assert.strictEqual(coach.mind(H(-200, ['mistake'], ['call']), [big])[0].title, 'Tilt check');
  assert.strictEqual(coach.mind(H(0), [H(0), H(0), big])[0].title, 'Stayed calm');
  assert.strictEqual(coach.mind(H(-3000), [])[0].title, 'Reset');
  assert.strictEqual(coach.mind(H(-100, ['mistake'], ['call']), [H(0)]).length, 0, 'no tilt without a big loss');
  const rc = coach.reportCard([H(0), H(0), H(0), H(-200, ['mistake'], ['call']), H(0, [], ['raise'], ['As', 'Ks'])]);
  assert.strictEqual(rc.hands, 5); assert.strictEqual(rc.clean, 80); assert.strictEqual(rc.weak, 4); assert.strictEqual(rc.weakFolds, 3);
  assert.strictEqual(rc.leak.title, 'Called off with a weak hand'); assert.ok(rc.goal && rc.grade);
  console.log('players test passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
