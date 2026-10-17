// Opportunity Club: members-only "I need help" / "I can help" listings inside Business Club, with short
// private contact requests. Completely separate from poker: nothing here reads or writes tournaments,
// points, prizes, ratings or results, and nothing from poker is shown or used here. No payments, no ads.
//
// Storage (additive kv keys, nothing existing changes):
//   opp:<id>        a listing { id, uid, type: need|offer, title, details, category, area, status: open|closed,
//                   expiresAt, createdAt, updatedAt, closedAt, modHidden, autoHidden [, demo] }
//   oppreq:<id>     a contact request { id, oppId, from, to, message, status: sent|shared|declined,
//                   shared: { email?, phone?, note? } (only after the poster chose to share), createdAt, answeredAt }
//   oppreport:<id>  a report { id, oppId, by, reason, note, createdAt, reviewed }
//   opplimit:<uid>  { listings: [time], requests: [time] } creation times inside the spam windows
//   oppDemoSeeded   staging only: fake demo listings were added once
const crypto = require('crypto');
const store = require('./store');
const business = require('./business');
const content = require('./content');

const CAT = Object.fromEntries(business.CATEGORIES);
const TYPES = { need: 'I need help', offer: 'I can help' };
const REASONS = [['spam', 'Spam or advertising'], ['scam', 'Scam or misleading'], ['offensive', 'Offensive or harassing'],
  ['private', "Shares someone's private info"], ['offtopic', 'Not a real request'], ['other', 'Something else']];
const REASON = Object.fromEntries(REASONS);
const MAX = { title: 80, details: 600, area: 60, message: 500, note: 300, shareNote: 200 };
const DAY = 864e5, HOUR = 36e5;
const DEFAULT_DAYS = 30, MAX_DAYS = 90, MAX_OPEN = 5, AUTO_HIDE = 3;
const DAY_MAX = +process.env.OPP_DAY_MAX || 10, REQ_HOUR_MAX = +process.env.OPP_REQ_HOUR_MAX || 10;
const WRITE_MAX = +process.env.OPP_WRITE_MAX || 40, WRITE_WINDOW = 10 * 60000;

const fail = (status, msg) => Object.assign(new Error(msg), { status });
const bad = msg => fail(400, msg);
const isOwner = u => !!u && u.role === 'owner';
function member(u){ if(!u) throw fail(401, 'Sign in first.'); const x = store.get('user:' + u.id); if(!x || x.removed) throw fail(401, 'Sign in first.'); return x; }
function ownerOnly(u){ member(u); if(!isOwner(u)) throw fail(403, 'Only the club director can do that.'); }
const newId = () => 'o' + crypto.randomBytes(8).toString('hex');
const ID = /^o[0-9a-f]{16}$/;

// edits, closes, deletes, replies and reports: a per-member limit (memory only, like Business Club saves)
const writes = new Map();
function rate(uid){
  const now = Date.now(), r = (writes.get(uid) || []).filter(t => now - t < WRITE_WINDOW);
  if(r.length >= WRITE_MAX) throw fail(429, 'You made a lot of changes in a short time. Wait a few minutes and try again.');
  r.push(now); writes.set(uid, r);
}
// new listings per day and contact requests per hour: kept in storage so a restart does not reset them
function limit(uid, kind, max, win, msg){
  const now = Date.now(), cur = store.get('opplimit:' + uid) || {};
  const list = (cur[kind] || []).filter(t => now - t < win);
  if(list.length >= max) throw fail(429, msg);
  return () => { const c = store.get('opplimit:' + uid) || {}; store.set('opplimit:' + uid, { ...c, [kind]: [...(c[kind] || []).filter(t => now - t < DAY), now] }); };
}

// ---------- validation ----------
// no web addresses, emails, social handles or phone numbers in what members type (server/content.js): members reach each other
// through contact requests, and the poster chooses whether to share contact details
const WHERE = 'Members reach you through a private request, and you choose whether to share your contact details.';
function text(v, key, label, opts = {}){
  // Business Club's cleaner (NFC, control/zero-width/direction characters removed, whitespace collapsed); our own caps
  const s = business.validate.text(v, 'opp', label, !!opts.multi);
  if(s.length > MAX[key]) throw bad(`${label} is too long (${MAX[key]} characters at most).`);
  if(opts.contact !== false) content.check(s, label, opts.where || WHERE, bad, opts.contact);
  return s;
}
function days(v){
  if(v == null || v === '') return DEFAULT_DAYS;
  const n = Number(v);
  if(!Number.isInteger(n) || n < 1 || n > MAX_DAYS) throw bad(`Pick how long it stays up: 1 to ${MAX_DAYS} days.`);
  return n;
}

// ---------- views ----------
const userOf = uid => { const x = store.get('user:' + uid); return x && !x.removed ? x : null; };
const nameOf = uid => (userOf(uid) || {}).name || 'Former member';
const expired = o => o.expiresAt <= Date.now();
const hidden = o => !!(o.modHidden || o.autoHidden);
const live = o => !!o && o.status === 'open' && !expired(o) && !hidden(o) && !!userOf(o.uid);
const getOpp = id => typeof id === 'string' && ID.test(id) ? store.get('opp:' + id) || null : null;
const reqsOf = id => store.values('oppreq:').filter(r => r.oppId === id);
const reportsOf = id => store.values('oppreport:').filter(r => r.oppId === id);
const openReports = id => reportsOf(id).filter(r => !r.reviewed).length;
// a published, visible business profile of the poster (a link to it is shown; nothing else from it)
function bizOf(uid){ const b = store.get('biz:' + uid); return b && b.published && !b.modHidden ? { uid, name: b.name } : null; }
function stateOf(o){ return hidden(o) ? (o.modHidden ? 'hidden' : 'review') : o.status === 'closed' ? 'closed' : expired(o) ? 'expired' : 'open'; }
// what any member sees of a listing
function card(o, u){
  const out = { id: o.id, type: o.type, typeLabel: TYPES[o.type], title: o.title, details: o.details, category: o.category, categoryLabel: CAT[o.category] || 'Other',
    area: o.area, member: nameOf(o.uid), business: bizOf(o.uid), createdAt: o.createdAt, updatedAt: o.updatedAt, expiresAt: o.expiresAt, state: stateOf(o), mine: o.uid === u.id };
  if(o.uid !== u.id){
    const r = store.values('oppreq:').find(r => r.oppId === o.id && r.from === u.id);
    out.myRequest = r ? { id: r.id, status: r.status } : null;
  }
  if(o.demo) out.demo = true;
  return out;
}
function matches(o, q, type, category){
  if(type && o.type !== type) return false;
  if(category && o.category !== category) return false;
  if(!q) return true;
  const hay = [o.title, o.details, o.area, CAT[o.category], TYPES[o.type], nameOf(o.uid)].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}
const byNew = (a, b) => b.createdAt - a.createdAt;
const openCount = uid => store.values('opp:').filter(o => o.uid === uid && o.status === 'open' && !expired(o)).length;
// incoming request as the poster sees it: the sender's club name and message; never anything else about them
const incoming = r => ({ id: r.id, from: nameOf(r.from), message: r.message, status: r.status, shared: r.status === 'shared' ? r.shared : null, createdAt: r.createdAt, answeredAt: r.answeredAt || null });
function sentView(r, u){
  const o = store.get('opp:' + r.oppId);
  const can = o && (live(o) || o.uid === u.id || (o.status === 'closed' || expired(o)) && !hidden(o) && userOf(o.uid));
  return { id: r.id, oppId: r.oppId, listing: can ? { id: o.id, type: o.type, title: o.title, member: nameOf(o.uid), state: stateOf(o) } : null,
    message: r.message, status: r.status, shared: r.status === 'shared' ? r.shared : null, createdAt: r.createdAt, answeredAt: r.answeredAt || null };
}
function delOpp(id){
  store.del('opp:' + id);
  for(const r of reqsOf(id)) store.del('oppreq:' + r.id);
  for(const r of reportsOf(id)) store.del('oppreport:' + r.id);
}

// ---------- API (POST /api/<name>, signed-in members only) ----------
const api = {
  // the feed: open, current, not hidden listings, newest first. The director can ask for everything.
  oppList({ q, type, category, all } = {}, u){
    member(u);
    const qs = typeof q === 'string' ? q.slice(0, 80) : '', t = TYPES[type] ? type : '', c = typeof category === 'string' && CAT[category] ? category : '';
    const everything = all === true && isOwner(u);
    const items = store.values('opp:').filter(o => (everything ? !!userOf(o.uid) : live(o)) && matches(o, qs, t, c)).sort(byNew).map(o => card(o, u));
    if(everything) items.forEach((x, i) => { x.reports = openReports(x.id); });
    return { items, categories: business.CATEGORIES, types: TYPES, reasons: REASONS, canModerate: isOwner(u),
      pending: store.values('oppreq:').filter(r => r.to === u.id && r.status === 'sent' && userOf(r.from)).length,
      queue: isOwner(u) ? queue().length : undefined, limits: { open: MAX_OPEN, openNow: openCount(u.id), maxDays: MAX_DAYS, defaultDays: DEFAULT_DAYS } };
  },
  oppGet({ id } = {}, u){
    member(u);
    const o = getOpp(id);
    if(!o || !(live(o) || o.uid === u.id || (isOwner(u) && userOf(o.uid)))) throw fail(404, 'This listing is not available any more.');
    const out = { item: card(o, u), canModerate: isOwner(u), reasons: REASONS };
    if(o.uid !== u.id) out.reported = store.values('oppreport:').some(r => r.oppId === o.id && r.by === u.id);
    if(isOwner(u)) out.reports = openReports(o.id);
    return out;
  },
  // create (no id) or edit (own listing only). Does not need a business profile.
  oppSave(d, u){
    member(u); d = d && typeof d === 'object' ? d : {};
    const cur = d.id != null ? getOpp(d.id) : null;
    if(d.id != null && (!cur || cur.uid !== u.id)) throw fail(404, 'That listing was not found.');
    const o = {
      type: String(d.type || ''),
      title: text(d.title, 'title', 'Title'),
      details: text(d.details, 'details', 'Details', { multi: true }),
      category: String(d.category || ''),
      area: text(d.area, 'area', 'Area')
    };
    if(!TYPES[o.type]) throw bad('Choose "I need help" or "I can help".');
    if(o.title.length < 3) throw bad('Add a short title (at least 3 characters).');
    if(!CAT[o.category]) throw bad('Pick a category from the list.');
    const keepExpiry = cur && (d.expiresInDays == null || d.expiresInDays === '');
    const n = keepExpiry ? 0 : days(d.expiresInDays);
    const now = Date.now();
    if(cur){
      rate(u.id);
      const next = { ...cur, ...o, expiresAt: keepExpiry ? cur.expiresAt : now + n * DAY, updatedAt: now };
      if(next.status === 'open' && !expired(next) && (cur.status !== 'open' || expired(cur)) && openCount(u.id) >= MAX_OPEN) throw bad(`You can have ${MAX_OPEN} open listings at a time. Close one first.`);
      store.set('opp:' + cur.id, next);
      return { ok: true, item: card(next, u) };
    }
    if(openCount(u.id) >= MAX_OPEN) throw bad(`You can have ${MAX_OPEN} open listings at a time. Close one first.`);
    const done = limit(u.id, 'listings', DAY_MAX, DAY, `You can post ${DAY_MAX} new listings a day. Try again tomorrow.`);
    const x = { id: newId(), uid: u.id, ...o, status: 'open', expiresAt: now + n * DAY, createdAt: now, updatedAt: now, closedAt: null, modHidden: false, autoHidden: false };
    store.set('opp:' + x.id, x); done();
    return { ok: true, item: card(x, u) };
  },
  // close (or reopen) your own listing
  oppClose({ id, closed } = {}, u){
    member(u);
    const o = getOpp(id); if(!o || o.uid !== u.id) throw fail(404, 'That listing was not found.');
    rate(u.id);
    const close = closed !== false, now = Date.now();
    if(!close){
      if(expired(o)) throw bad('This listing has expired. Edit it and choose a new end date to put it up again.');
      if(o.status !== 'open' && openCount(u.id) >= MAX_OPEN) throw bad(`You can have ${MAX_OPEN} open listings at a time. Close one first.`);
    }
    const next = { ...o, status: close ? 'closed' : 'open', closedAt: close ? now : null, updatedAt: now };
    store.set('opp:' + o.id, next);
    return { ok: true, item: card(next, u) };
  },
  oppDelete({ id } = {}, u){
    member(u);
    const o = getOpp(id); if(!o || o.uid !== u.id) throw fail(404, 'That listing was not found.');
    rate(u.id); delOpp(o.id);
    return { ok: true };
  },
  // my listings with the requests people sent me, and the requests I sent
  oppMine(_, u){
    member(u);
    const listings = store.values('opp:').filter(o => o.uid === u.id).sort(byNew).map(o => ({ ...card(o, u),
      requests: reqsOf(o.id).filter(r => userOf(r.from)).sort((a, b) => b.createdAt - a.createdAt).map(incoming) }));
    const sent = store.values('oppreq:').filter(r => r.from === u.id).sort((a, b) => b.createdAt - a.createdAt).map(r => sentView(r, u));
    const biz = store.get('biz:' + u.id);
    // suggestions for the share-contact form: only the member's own business email/phone, only shown to themselves
    const suggest = biz ? { email: biz.email || '', phone: biz.phone || '' } : { email: '', phone: '' };
    return { listings, sent, suggest, categories: business.CATEGORIES, types: TYPES,
      limits: { open: MAX_OPEN, openNow: openCount(u.id), maxDays: MAX_DAYS, defaultDays: DEFAULT_DAYS } };
  },
  // a small number for the Business tab: requests waiting for my answer
  oppBadge(_, u){
    member(u);
    return { pending: store.values('oppreq:').filter(r => r.to === u.id && r.status === 'sent' && userOf(r.from) && store.get('opp:' + r.oppId)).length };
  },
  // "I can help" / "I'm interested": a short private message to the poster. No contact details are exchanged.
  oppRequest({ id, message } = {}, u){
    member(u);
    const o = getOpp(id);
    if(!o || !live(o)) throw fail(404, 'This listing is not available any more.');
    if(o.uid === u.id) throw bad('This is your own listing.');
    const msg = text(message, 'message', 'Message', { multi: true, where: 'The member can share contact details with you when they reply.' });
    if(msg.length < 2) throw bad('Write a short message to the member.');
    const prev = store.values('oppreq:').find(r => r.oppId === o.id && r.from === u.id);
    if(prev) throw bad(prev.status === 'sent' ? 'You already sent a request for this listing.' : 'You already contacted this member about this listing.');
    const done = limit(u.id, 'requests', REQ_HOUR_MAX, HOUR, `You can send ${REQ_HOUR_MAX} requests an hour. Try again a bit later.`);
    const r = { id: newId(), oppId: o.id, from: u.id, to: o.uid, message: msg, status: 'sent', shared: null, createdAt: Date.now(), answeredAt: null };
    store.set('oppreq:' + r.id, r); done();
    return { ok: true, request: sentView(r, u) };
  },
  // the poster answers: share the contact details they choose, or decline. Nothing is shared automatically.
  oppReply({ id, action, email, phone, note } = {}, u){
    member(u);
    const r = typeof id === 'string' && ID.test(id) ? store.get('oppreq:' + id) : null;
    if(!r || r.to !== u.id || !userOf(r.from)) throw fail(404, 'That request was not found.');
    if(r.status !== 'sent') throw bad('You already answered this request.');
    let next;
    if(action === 'decline') next = { ...r, status: 'declined', answeredAt: Date.now() };
    else if(action === 'share'){
      const shared = {};
      const e = business.validate.email(email), p = business.validate.phone(phone), n = text(note, 'shareNote', 'Note', { multi: true, contact: ['link'], where: 'Share an email or phone number above instead.' });
      if(e) shared.email = e; if(p) shared.phone = p; if(n) shared.note = n;
      if(!e && !p) throw bad('Add the email or phone number you want to share.');
      next = { ...r, status: 'shared', shared, answeredAt: Date.now() };
    } else throw bad('Choose to share your contact details or decline.');
    rate(u.id);
    store.set('oppreq:' + r.id, next);
    return { ok: true, request: incoming(next) };
  },
  // the sender deletes their own request (the poster no longer sees it)
  oppRequestDelete({ id } = {}, u){
    member(u);
    const r = typeof id === 'string' && ID.test(id) ? store.get('oppreq:' + id) : null;
    if(!r || r.from !== u.id) throw fail(404, 'That request was not found.');
    rate(u.id); store.del('oppreq:' + r.id);
    return { ok: true };
  },
  // any member can report a listing once; 3 open reports hide it until the director looks
  oppReport({ id, reason, note } = {}, u){
    member(u);
    const o = getOpp(id);
    if(!o || !live(o)) throw fail(404, 'This listing is not available any more.');
    if(o.uid === u.id) throw bad('This is your own listing.');
    if(!REASON[reason]) throw bad('Pick a reason.');
    if(store.values('oppreport:').some(r => r.oppId === o.id && r.by === u.id)) throw bad('You already reported this listing. Thank you.');
    const n = text(note, 'note', 'Note', { multi: true, contact: false }); // only the director reads it, and it may quote the listing
    rate(u.id);
    const rep = { id: newId(), oppId: o.id, by: u.id, reason, note: n, createdAt: Date.now(), reviewed: false };
    store.set('oppreport:' + rep.id, rep);
    if(!o.autoHidden && !o.modHidden && openReports(o.id) >= AUTO_HIDE) store.set('opp:' + o.id, { ...o, autoHidden: true });
    return { ok: true };
  },
  // director: listings with reports waiting, auto-hidden ones and the ones they hid
  oppReports(_, u){
    ownerOnly(u);
    return { items: queue(), reasons: REASONS };
  },
  // director: hide, show again (clears the reports), dismiss reports, or delete
  oppModerate({ id, action } = {}, u){
    ownerOnly(u);
    const o = getOpp(id); if(!o) throw fail(404, 'That listing was not found.');
    const review = () => { for(const r of reportsOf(o.id)) if(!r.reviewed) store.set('oppreport:' + r.id, { ...r, reviewed: true }); };
    if(action === 'hide') store.set('opp:' + o.id, { ...o, modHidden: true, autoHidden: false });
    else if(action === 'unhide' || action === 'dismiss'){ review(); store.set('opp:' + o.id, { ...o, modHidden: false, autoHidden: false }); }
    else if(action === 'delete') delOpp(o.id);
    else throw bad('Unknown action.');
    return { ok: true, queue: queue().length };
  }
};
function queue(){
  return store.values('opp:').filter(o => userOf(o.uid) && (hidden(o) || openReports(o.id) > 0)).sort((a, b) => (b.autoHidden - a.autoHidden) || (openReports(b.id) - openReports(a.id)) || b.createdAt - a.createdAt)
    .map(o => ({ id: o.id, type: o.type, typeLabel: TYPES[o.type], title: o.title, details: o.details, categoryLabel: CAT[o.category] || 'Other', member: nameOf(o.uid), state: stateOf(o),
      createdAt: o.createdAt, reports: reportsOf(o.id).filter(r => !r.reviewed).sort((a, b) => a.createdAt - b.createdAt)
        .map(r => ({ reason: r.reason, reasonLabel: REASON[r.reason], note: r.note, by: nameOf(r.by), at: r.createdAt })) }));
}

// a member was removed from the club: their listings (with the requests and reports on them), the requests
// they sent and the reports they made all go
function removeUser(uid){
  for(const o of store.values('opp:')) if(o.uid === uid) delOpp(o.id);
  for(const r of store.values('oppreq:')) if(r.from === uid || r.to === uid) store.del('oppreq:' + r.id);
  for(const r of store.values('oppreport:')) if(r.by === uid) store.del('oppreport:' + r.id);
  store.del('opplimit:' + uid);
  writes.delete(uid);
}

// STAGING ONLY: a few obviously fake listings for the fake "Test Player NN" accounts, once.
// Never runs unless STAGING=1, never touches anyone else.
const DEMO = [
  ['02', 'need', 'trades', 'Looking for a reliable electrician', 'Need two pot lights and a dimmer installed in a condo. Happy to get a quote first. (Demo listing, not real.)', 'Midtown Toronto', 2],
  ['01', 'offer', 'trades', 'Free plumbing advice for members', 'Not sure if that drip is a big deal? Ask me before you call anyone. (Demo listing, not real.)', 'Toronto & GTA', 5],
  ['03', 'need', 'tech', 'Need help moving my website to a new host', 'Small WordPress site for a bakery. Looking for someone to move it this month. (Demo listing, not real.)', 'Remote', 1],
  ['05', 'offer', 'professional', 'Can review your small-business books', 'Happy to look over a year of bookkeeping and point out what to fix before tax time. (Demo listing, not real.)', 'Ontario', 8],
  ['04', 'need', 'events', 'Recommend a DJ for a 40th birthday?', 'About 60 guests in December. Looking for someone a member has used before. (Demo listing, not real.)', 'Leslieville', 3]
];
function seedDemo(){
  if(process.env.STAGING !== '1' || store.get('oppDemoSeeded') || store.keys('opp:').length) return 0;
  let n = 0;
  for(const [nn, type, category, title, details, area, ago] of DEMO){
    const id = store.get('name:test player ' + nn), x = id && userOf(id);
    if(!x || x.name !== 'Test Player ' + nn) continue;
    const at = Date.now() - ago * HOUR * 7;
    const o = { id: newId(), uid: id, type, title, details, category, area, status: 'open', expiresAt: at + DEFAULT_DAYS * DAY, createdAt: at, updatedAt: at, closedAt: null, modHidden: false, autoHidden: false, demo: true };
    store.set('opp:' + o.id, o); n++;
  }
  if(n) store.set('oppDemoSeeded', { at: Date.now(), n });
  return n;
}

module.exports = { api, removeUser, seedDemo, REASONS };
