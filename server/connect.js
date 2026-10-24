// The board's player profile sheet (UI_BOARD only: Step-0 spec §8, phase B7). What one member is shown of another when
// they tap a seat or an avatar, the member's own choices about it, and connection requests between members.
// Nothing here runs with the board off: server/index.js answers 404 for every call and adds nothing to the club view.
// Separate from poker: nothing here reads or writes tournaments, points, prizes, ratings or results.
//
// Consent (on the shared account record, field `pro`; every choice is OFF until the member turns it on):
//   photo    "Show my photo": other members see the member's photo. Off, they see the initials disc (a gallery avatar,
//            which is not a photo, still shows). The member always sees their own.
//   table    "Show About and Business at tables": the About segment (area, job title) and the Business segment (the
//            member's published Exchange card, with that card's own show{} contact rules) on the sheet.
//   connect  "Open to Connect": the sheet says so, and other members may send a connection request.
//   area, job: the About fields, typed by the member (no contact details allowed, as everywhere in the Exchange)
// With table and connect off the sheet carries the photo (if shown), the name and the chips at the table only.
// Every field is left out on the server: a member's phone never receives what the other member did not choose to show.
//
// Storage (additive, in the club's own store, like the Bulletin's oppreq):
//   conn:<id>       { id, from, to, status: sent|accepted|declined, shared: { email?, phone?, note? } (only after the
//                   receiver accepted and chose what to share), createdAt, answeredAt }
//   connlimit:<uid> { sends: [time] } request times inside the hour, so a restart does not reset the limit
const crypto = require('crypto');
const store = require('./store');
const business = require('./business');
const content = require('./content');

const HOUR = 36e5, DAY = 864e5;
const SEND_MAX = +process.env.CONN_HOUR_MAX || 10, WRITE_MAX = +process.env.CONN_WRITE_MAX || 40, WRITE_WINDOW = 10 * 60000;
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const bad = msg => fail(400, msg);
const UID = /^u[0-9a-f]{12}$/, ID = /^n[0-9a-f]{16}$/;
const newId = () => 'n' + crypto.randomBytes(8).toString('hex');
const userOf = uid => { const x = typeof uid === 'string' && UID.test(uid) ? store.get('user:' + uid) : null; return x && !x.removed ? x : null; };
function member(u){ if(!u) throw fail(401, 'Sign in first.'); const x = userOf(u.id); if(!x) throw fail(401, 'Sign in first.'); return x; }

// ---------- the member's own choices ----------
const prefsOf = x => { const p = (x && x.pro) || {}; return { photo: p.photo === true, table: p.table === true, connect: p.connect === true, area: typeof p.area === 'string' ? p.area : '', job: typeof p.job === 'string' ? p.job : '' }; };
const WHERE = 'Members reach you through a connection request, and you choose what to share when you accept.';
// a new set of choices from what the app sent (fields left out keep their value)
function cleanPrefs(d, cur){
  d = d && typeof d === 'object' ? d : {};
  const out = { ...prefsOf(cur) };
  for(const k of ['photo', 'table', 'connect']) if(k in d) out[k] = d[k] === true;
  if('area' in d) out.area = content.check(business.validate.text(d.area, 'area', 'Area'), 'Area', WHERE, bad);
  if('job' in d) out.job = content.check(business.validate.text(d.job, 'jobTitle', 'Job title'), 'Job title', WHERE, bad);
  return out;
}
// the picture other members may see: a photo only with consent (a gallery avatar is not a photo)
const shownAv = x => { const av = x && x.av || null; return av && av.startsWith('p:') && !prefsOf(x).photo ? null : av; };

// ---------- limits ----------
const writes = new Map();
function rate(uid){
  const now = Date.now(), r = (writes.get(uid) || []).filter(t => now - t < WRITE_WINDOW);
  if(r.length >= WRITE_MAX) throw fail(429, 'You made a lot of changes in a short time. Wait a few minutes and try again.');
  r.push(now); writes.set(uid, r);
}
function sendLimit(uid){
  const now = Date.now(), cur = store.get('connlimit:' + uid) || {}, list = (cur.sends || []).filter(t => now - t < HOUR);
  if(list.length >= SEND_MAX) throw fail(429, `You can send ${SEND_MAX} connection requests an hour. Try again a bit later.`);
  return () => { const c = store.get('connlimit:' + uid) || {}; store.set('connlimit:' + uid, { ...c, sends: [...(c.sends || []).filter(t => now - t < DAY), now] }); };
}

// ---------- requests ----------
const all = () => store.values('conn:');
const between = (a, b, list = all()) => list.filter(r => (r.from === a && r.to === b) || (r.from === b && r.to === a)).sort((x, y) => y.createdAt - x.createdAt);
const nameOf = uid => (userOf(uid) || {}).name || 'Former member';
// a request as one of its two members sees it; the shared contact goes to the sender only, and only once accepted
function asSeen(r, uid){
  const out = r.from === uid ? { id: r.id, dir: 'out', uid: r.to, name: nameOf(r.to), status: r.status, createdAt: r.createdAt, answeredAt: r.answeredAt || null }
    : { id: r.id, dir: 'in', uid: r.from, name: nameOf(r.from), status: r.status, createdAt: r.createdAt, answeredAt: r.answeredAt || null };
  if(r.status === 'accepted' && r.shared) out.shared = r.shared;
  return out;
}

// ---------- the sheet ----------
// opts.exchange: this viewer may see this club's Exchange (closed to members until the director opens it)
// opts.events: the Blindrise Open (members of every club, no Exchange): the sheet carries the name and picture only
function card({ uid } = {}, u, opts = {}){
  const me = member(u), x = userOf(uid);
  if(!x) throw fail(404, 'This member is not in the club.');
  const p = prefsOf(x), self = x.id === me.id;
  const out = { uid: x.id, name: x.name, av: self ? x.av || null : shownAv(x), self };
  if(opts.events) return out;
  if(p.table){
    out.about = { area: p.area, job: p.job };
    const b = opts.exchange ? business.cardOf(x.id) : null;
    out.business = b;
  }
  if(p.connect) out.connect = true;
  if(!self){
    const r = between(me.id, x.id)[0];
    if(r) out.request = asSeen(r, me.id);
  }
  return out;
}
const api = {
  // a request to a member who is Open to Connect; one per pair: a request waiting or answered is not sent again
  connSend({ uid } = {}, u){
    const me = member(u), x = userOf(uid);
    if(!x) throw fail(404, 'This member is not in the club.');
    if(x.id === me.id) throw bad('This is you.');
    const prev = between(me.id, x.id)[0];
    if(prev){
      if(prev.from === x.id && prev.status === 'sent') throw bad(`${x.name} already sent you a request. You can answer it under Profile, Connection requests.`);
      throw bad(prev.status === 'sent' ? 'You already sent this member a request.' : prev.status === 'accepted' ? 'You are already connected.' : 'You already asked this member to connect.');
    }
    if(!prefsOf(x).connect) throw fail(403, 'This member is not taking connection requests.');
    const done = sendLimit(me.id);
    rate(me.id);
    const r = { id: newId(), from: me.id, to: x.id, status: 'sent', shared: null, createdAt: Date.now(), answeredAt: null };
    store.set('conn:' + r.id, r); done();
    return { ok: true, request: asSeen(r, me.id) };
  },
  // the receiver answers: accept, sharing the email and/or phone they choose (and a short note), or decline
  connReply({ id, action, email, phone, note } = {}, u){
    const me = member(u);
    const r = typeof id === 'string' && ID.test(id) ? store.get('conn:' + id) : null;
    if(!r || r.to !== me.id || !userOf(r.from)) throw fail(404, 'That request was not found.');
    if(r.status !== 'sent') throw bad('You already answered this request.');
    let next;
    if(action === 'decline') next = { ...r, status: 'declined', answeredAt: Date.now() };
    else if(action === 'accept'){
      const shared = {}, e = business.validate.email(email), p = business.validate.phone(phone);
      const n = content.check(business.validate.text(note, 'description', 'Note', true), 'Note', 'Share an email or phone number above instead.', bad, ['link']);
      if(n.length > 200) throw bad('Note is too long (200 characters at most).');
      if(e) shared.email = e; if(p) shared.phone = p; if(n) shared.note = n;
      if(!e && !p) throw bad('Add the email or phone number you want to share.');
      next = { ...r, status: 'accepted', shared, answeredAt: Date.now() };
    } else throw bad('Choose to accept or decline.');
    rate(me.id);
    store.set('conn:' + r.id, next);
    return { ok: true, request: asSeen(next, me.id) };
  },
  // the sender takes back a request that is still waiting
  connWithdraw({ id } = {}, u){
    const me = member(u);
    const r = typeof id === 'string' && ID.test(id) ? store.get('conn:' + id) : null;
    if(!r || r.from !== me.id) throw fail(404, 'That request was not found.');
    if(r.status !== 'sent') throw bad('This request was already answered.');
    rate(me.id); store.del('conn:' + r.id);
    return { ok: true };
  }
};
// the member's requests for their club view (built for each member on its own: it is never shared between members).
// list: this update's conn: records (read once per update). suggest: the member's own Exchange email and phone, for the
// accept form, only while a request waits for their answer.
function view(uid, list = all()){
  const mine = list.filter(r => (r.from === uid || r.to === uid) && userOf(r.from === uid ? r.to : r.from)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map(r => asSeen(r, uid));
  const out = { list: mine };
  if(mine.some(r => r.dir === 'in' && r.status === 'sent')){ const b = store.get('biz:' + uid); out.suggest = { email: b && b.email || '', phone: b && b.phone || '' }; }
  return out;
}
// a member left the club (or was removed): their requests, both ways, and their limit go
function removeUser(uid){
  for(const r of all()) if(r.from === uid || r.to === uid) store.del('conn:' + r.id);
  store.del('connlimit:' + uid);
  writes.delete(uid);
}
module.exports = { api, card, view, all, removeUser, prefsOf, cleanPrefs, shownAv };
