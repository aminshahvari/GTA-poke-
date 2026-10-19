// Club switching, store layer: a club's scoped store must never lose membership fields on a partial write.
// Regression for Muse's verdict on 06f8662, Condition 1: a scoped set('user:...') for a non-main club rebuilt the
// membership from only the fields in the value passed, so set({ muted: true }) wiped role, joinedAt and invitedBy
// (worst case: a club owner loses the owner role and is locked out of their own Director).
process.env.DATA_FILE = require('os').tmpdir() + '/t_club_store_' + process.pid + '.json';
const assert = require('assert');
const fs = require('fs');
const store = require('../server/store');
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
(async () => {
  await store.init();
  const id = 'u0000000000a1', k = 'user:' + id;
  const ownerB = { role: 'owner', joinedAt: 1700000000000, invitedBy: 'u0000000000b2' };
  const memberC = { role: 'member', joinedAt: 1700000000500, muted: true };
  store.set(k, { id, name: 'Sara', salt: 's', pin: 'p', role: 'member', createdAt: 1, invitedBy: 'u0000000000m9',
    clubs: { cB: { ...ownerB }, cC: { ...memberC } } });
  const B = store.scoped('cB'), C = store.scoped('cC'), M = store.scoped('main');

  // Muse's probe, exactly: one partial write of { muted: true } through club B
  B.set(k, { muted: true });
  const raw = store.get(k);
  check(raw.clubs.cB.role === 'owner', 'partial write keeps the club role (owner stays owner)');
  check(raw.clubs.cB.joinedAt === ownerB.joinedAt, 'partial write keeps joinedAt');
  check(raw.clubs.cB.invitedBy === ownerB.invitedBy, 'partial write keeps invitedBy');
  check(raw.clubs.cB.muted === true, 'partial write applies the field it carries (muted)');
  check(B.get(k).role === 'owner' && B.get(k).muted === true, "club B's view shows the merged membership");

  // the write touched nothing outside club B's membership
  check(JSON.stringify(raw.clubs.cC) === JSON.stringify(memberC), "club C's membership is untouched");
  check(raw.role === 'member' && raw.invitedBy === 'u0000000000m9' && raw.name === 'Sara' && raw.pin === 'p',
    'main-club fields and identity are untouched');

  // a partial write cannot plant identity or non-membership fields in the membership
  B.set(k, { name: 'Hacker', pin: 'x', noMain: true, clubs: { cC: { role: 'owner' } }, household: 'h1' });
  const r2 = store.get(k);
  check(r2.name === 'Sara' && r2.pin === 'p' && !r2.noMain, 'identity fields in a club write are ignored');
  check(r2.clubs.cC.role === 'member', "a club write cannot reach another club's membership");
  check(Object.keys(r2.clubs.cB).sort().join() === 'household,invitedBy,joinedAt,muted,role', 'only membership fields are stored for the club');

  // clearing still works: null (as the household action does) and an own property set to undefined
  B.set(k, { ...B.get(k), household: null });
  check(store.get(k).clubs.cB.household === null, 'null clears a field (household)');
  B.set(k, { muted: undefined });
  check(!('muted' in store.get(k).clubs.cB) && store.get(k).clubs.cB.role === 'owner', 'an explicit undefined removes the field, nothing else');

  // the usual caller pattern (spread a scoped get, change one field) round-trips exactly
  const before = JSON.stringify(store.get(k));
  B.set(k, { ...B.get(k) });
  check(JSON.stringify(store.get(k)) === before, 'spread-get-set round-trips byte-identically');
  B.set(k, { ...B.get(k), removed: true });
  check(store.get(k).clubs.cB.removed === true && store.get(k).clubs.cB.role === 'owner' && store.get(k).clubs.cB.joinedAt === ownerB.joinedAt,
    'remove (spread + removed) keeps role and joinedAt');

  // still refused for a non-member, and the main club path is unchanged
  let threw = false; try{ store.scoped('cZ').set(k, { muted: true }); }catch(e){ threw = /Not a member/.test(e.message); }
  check(threw && !store.get(k).clubs.cZ, 'a club the account is not in cannot write it');
  M.set(k, { ...M.get(k), muted: true });
  check(store.get(k).muted === true && store.get(k).clubs.cB.role === 'owner', 'main-club write keeps the clubs map');

  await store.flush();
  try{ fs.unlinkSync(process.env.DATA_FILE); }catch(e){}
  console.log(`\n${n} ok / 0 failed`);
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); try{ fs.unlinkSync(process.env.DATA_FILE); }catch(x){} process.exit(1); });
