// Business Club: an optional, members-only directory of members' own businesses.
// Completely separate from poker: nothing here reads or writes tournaments, points, prizes or ratings,
// and nothing from poker is shown on a business page.
//
// Storage (additive kv keys, nothing existing changes):
//   biz:<uid>      the member's business profile (draft or published)
//   bizlogo:<uid>  { v, data } small JPEG logo, base64 (same limits as avatars)
//   bizpref:<uid>  { introDismissed } the member hid the "Introduce your business" prompt
//   bizSpotlight   { uid, at, by } the one business the club owner features, or absent
//   bizDemoSeeded  staging only: fake demo businesses were added once
const store = require('./store');

const CATEGORIES = [
  ['realestate', 'Real estate'], ['trades', 'Construction & trades'], ['home', 'Home services'], ['food', 'Food & drink'],
  ['health', 'Health & wellness'], ['beauty', 'Beauty & personal care'], ['fitness', 'Fitness & sports'],
  ['professional', 'Legal & accounting'], ['finance', 'Finance & insurance'], ['tech', 'Tech & IT'],
  ['creative', 'Marketing & design'], ['retail', 'Retail & shopping'], ['auto', 'Automotive'],
  ['events', 'Events & entertainment'], ['education', 'Education & tutoring'], ['travel', 'Travel & hospitality'], ['other', 'Other']
];
const CAT = Object.fromEntries(CATEGORIES);
const CONTACTS = ['website', 'instagram', 'email', 'phone', 'address'];
const MAX = { name: 60, fullName: 60, jobTitle: 60, categoryOther: 30, description: 400, services: 300, area: 60, website: 200, email: 120, phone: 24, address: 160 };
const MAX_LOGO = 60000, NEW_DAYS = 30;
const SAVE_MAX = +process.env.BIZ_SAVE_MAX || 20, SAVE_WINDOW = 10 * 60000;

const fail = (status, msg) => Object.assign(new Error(msg), { status });
const bad = msg => fail(400, msg);
const isOwner = u => !!u && u.role === 'owner';
function member(u){ if(!u) throw fail(401, 'Sign in first.'); const x = store.get('user:' + u.id); if(!x || x.removed) throw fail(401, 'Sign in first.'); return x; }
function ownerOnly(u){ member(u); if(!isOwner(u)) throw fail(403, 'Only the club director can do that.'); }

// per-member limit on saves, publishes and deletes
const saves = new Map();
function rate(uid){
  const now = Date.now(), r = (saves.get(uid) || []).filter(t => now - t < SAVE_WINDOW);
  if(r.length >= SAVE_MAX) throw fail(429, 'You saved a lot of changes in a short time. Wait a few minutes and try again.');
  r.push(now); saves.set(uid, r);
}

// ---------- validation ----------
// control characters, zero-width and text-direction overrides are removed from everything a member types
const STRIP = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
function text(v, key, label, multi){
  if(v == null) v = '';
  if(typeof v !== 'string') throw bad(label + ' must be text.');
  let s = v.normalize('NFC').replace(/\r\n?/g, '\n').replace(STRIP, '');
  s = multi ? s.replace(/[\t ]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  if(s.length > MAX[key]) throw bad(`${label} is too long (${MAX[key]} characters at most).`);
  return s;
}
const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(xn--[a-z0-9-]{2,59}|[a-z]{2,63})$/i;
function website(v){
  let s = text(v, 'website', 'Website'); if(!s) return '';
  if(/\s/.test(s)) throw bad('Website should be a web address like example.com.');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if(scheme && !/^https?:\/\//i.test(s) && !scheme[1].includes('.')) throw bad('Website must start with http:// or https://.');
  if(!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  let url; try{ url = new URL(s); }catch(e){ throw bad('Website should be a web address like example.com.'); }
  if(!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !HOST.test(url.hostname)) throw bad('Website should be a web address like example.com.');
  return url.href;
}
function instagram(v){
  const s = text(v, 'website', 'Instagram'); if(!s) return '';
  let h = s;
  if(/[/:]/.test(s)){
    const m = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:\?.*)?$/i.exec(s);
    if(!m) throw bad('Instagram should be your handle, like @yourbusiness.');
    h = m[1];
  }
  h = h.replace(/^@/, '');
  if(!/^[A-Za-z0-9._]{1,30}$/.test(h) || /^\.+$/.test(h)) throw bad('Instagram should be your handle, like @yourbusiness.');
  return h;
}
function email(v){
  const s = text(v, 'email', 'Email'); if(!s) return '';
  if(!/^[A-Za-z0-9._+-]+@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(s) || /\.\./.test(s)) throw bad('That email address does not look right.');
  return s;
}
function phone(v){
  const s = text(v, 'phone', 'Phone'); if(!s) return '';
  const digits = s.replace(/\D/g, '');
  if(!/^\+?[0-9 ().-]+$/.test(s) || digits.length < 7 || digits.length > 15) throw bad('That phone number does not look right.');
  return s;
}
// a real, small JPEG: same rules as profile photos
function logo(data){
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if(!m || data.length > MAX_LOGO) throw bad('That logo could not be used. Try another picture.');
  const buf = Buffer.from(m[1], 'base64');
  if(buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) throw bad('That logo could not be used. Try another picture.');
  return m[1];
}

// ---------- views ----------
const userOf = uid => { const x = store.get('user:' + uid); return x && !x.removed ? x : null; };
const visible = b => !!b && b.published && !b.modHidden && !!userOf(b.uid);
const label = b => b.category === 'other' && b.categoryOther ? b.categoryOther : CAT[b.category] || 'Other';
const logoV = uid => { const l = store.get('bizlogo:' + uid); return l ? l.v : null; };
const igUrl = h => 'https://instagram.com/' + h;
function telOf(p){ const d = p.replace(/[^\d+]/g, ''); return d.startsWith('+') ? '+' + d.slice(1).replace(/\+/g, '') : d.replace(/\+/g, ''); }
// what other members see: only fields the member chose to show
function card(b){
  const show = b.show || {}, c = {};
  if(show.website && b.website) c.website = b.website;
  if(show.instagram && b.instagram) c.instagram = { handle: b.instagram, url: igUrl(b.instagram) };
  if(show.email && b.email) c.email = b.email;
  if(show.phone && b.phone) c.phone = { text: b.phone, tel: telOf(b.phone) };
  if(show.address && b.address) c.address = b.address;
  const out = { uid: b.uid, member: userOf(b.uid).name, name: b.name, category: b.category, categoryLabel: label(b),
    description: b.description, services: b.services, area: b.area, referrals: !!b.referrals, logoV: logoV(b.uid), publishedAt: b.publishedAt || null, contacts: c };
  if(show.fullName && b.fullName){ out.fullName = b.fullName; if(b.jobTitle) out.jobTitle = b.jobTitle; }
  return out;
}
// the home feed only needs a few fields
const light = b => ({ uid: b.uid, member: userOf(b.uid).name, name: b.name, categoryLabel: label(b), logoV: logoV(b.uid), publishedAt: b.publishedAt || null });
function all(){ return store.values('biz:').filter(visible); }
const byNew = (a, b) => (b.publishedAt || 0) - (a.publishedAt || 0);
const recent = list => list.filter(b => b.publishedAt && Date.now() - b.publishedAt < NEW_DAYS * 864e5).sort(byNew);
function spotlight(){
  const s = store.get('bizSpotlight'); if(!s) return null;
  const b = store.get('biz:' + s.uid);
  if(!visible(b)){ store.del('bizSpotlight'); return null; }
  return b;
}
function clearSpotlightFor(uid){ const s = store.get('bizSpotlight'); if(s && s.uid === uid) store.del('bizSpotlight'); }
function matches(b, q, category){
  if(category && b.category !== category) return false;
  if(!q) return true;
  const hay = [b.name, label(b), b.services, b.description, b.area, userOf(b.uid).name].join(' ').toLowerCase();
  return String(q).toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}
function mine(uid){
  const b = store.get('biz:' + uid); if(!b) return null;
  const { uid: _, ...rest } = b;
  return { ...rest, categoryLabel: label(b), logoV: logoV(uid), spotlight: (store.get('bizSpotlight') || {}).uid === uid && visible(b) };
}

// ---------- API (POST /api/<name>, signed-in members only) ----------
const api = {
  bizMine(_, u){
    member(u);
    return { mine: mine(u.id), categories: CATEGORIES, introDismissed: !!(store.get('bizpref:' + u.id) || {}).introDismissed, canModerate: isOwner(u) };
  },
  // save the profile's fields; publishing is a separate step (bizPublish)
  bizSave(d, u){
    member(u); d = d && typeof d === 'object' ? d : {};
    const cur = store.get('biz:' + u.id);
    const b = {
      uid: u.id,
      name: text(d.name, 'name', 'Business name'),
      fullName: text(d.fullName, 'fullName', 'Full name'),
      jobTitle: text(d.jobTitle, 'jobTitle', 'Job title'),
      category: String(d.category || ''),
      categoryOther: text(d.categoryOther, 'categoryOther', 'Industry'),
      description: text(d.description, 'description', 'Description', true),
      services: text(d.services, 'services', 'Services', true),
      area: text(d.area, 'area', 'Service area'),
      website: website(d.website), instagram: instagram(d.instagram), email: email(d.email), phone: phone(d.phone),
      address: text(d.address, 'address', 'Business address'),
      referrals: d.referrals === true,
      show: {}
    };
    if(b.name.length < 2) throw bad('Add your business name (at least 2 characters).');
    if(!CAT[b.category]) throw bad('Pick an industry from the list.');
    if(b.category !== 'other') b.categoryOther = '';
    const show = d.show && typeof d.show === 'object' ? d.show : {};
    for(const k of [...CONTACTS, 'fullName']) b.show[k] = show[k] === true && !!b[k];
    let logoData;
    if(d.logo && typeof d.logo === 'object') logoData = logo(d.logo.data);
    else if(d.logo !== undefined && d.logo !== null && d.logo !== false) throw bad('That logo could not be used. Try another picture.');
    rate(u.id);
    b.published = !!(cur && cur.published);
    b.publishedAt = cur ? cur.publishedAt || null : null;
    b.modHidden = !!(cur && cur.modHidden);
    b.createdAt = cur ? cur.createdAt : Date.now();
    b.updatedAt = Date.now();
    store.set('biz:' + u.id, b);
    if(logoData) store.set('bizlogo:' + u.id, { v: Date.now().toString(36), data: logoData });
    else if(d.logo === null) store.del('bizlogo:' + u.id);
    return { ok: true, mine: mine(u.id) };
  },
  bizPublish({ on } = {}, u){
    member(u);
    const b = store.get('biz:' + u.id); if(!b) throw bad('Save your business profile first.');
    rate(u.id);
    const pub = on === true;
    store.set('biz:' + u.id, { ...b, published: pub, publishedAt: pub ? b.publishedAt || Date.now() : b.publishedAt || null, updatedAt: Date.now() });
    if(!pub) clearSpotlightFor(u.id);
    return { ok: true, mine: mine(u.id) };
  },
  bizDelete(_, u){
    member(u); rate(u.id);
    removeUser(u.id);
    return { ok: true };
  },
  bizIntro({ dismiss } = {}, u){
    member(u);
    store.set('bizpref:' + u.id, { ...(store.get('bizpref:' + u.id) || {}), introDismissed: dismiss !== false });
    return { ok: true };
  },
  // the whole directory (it is small, so the phone filters it as you type); q/category filter on the server too
  bizList({ q, category } = {}, u){
    member(u);
    const qs = typeof q === 'string' ? q.slice(0, 80) : '', cat = typeof category === 'string' && CAT[category] ? category : '';
    const list = all();
    const out = { items: list.filter(b => matches(b, qs, cat)).sort((a, b) => a.name.localeCompare(b.name)).map(card),
      recent: recent(list).slice(0, 12).map(light), spotlight: (s => s ? card(s) : null)(spotlight()), categories: CATEGORIES, canModerate: isOwner(u) };
    if(isOwner(u)) out.hidden = store.values('biz:').filter(b => b.published && b.modHidden && userOf(b.uid)).map(b => ({ uid: b.uid, member: userOf(b.uid).name, name: b.name }));
    return out;
  },
  bizGet({ uid } = {}, u){
    member(u);
    const b = typeof uid === 'string' && /^u[0-9a-f]{12}$/.test(uid) ? store.get('biz:' + uid) : null;
    if(!visible(b)) throw fail(404, 'This business is not listed.');
    return { business: card(b), spotlight: (store.get('bizSpotlight') || {}).uid === uid, canModerate: isOwner(u) };
  },
  // Home: spotlight first, then newest; and the "New to the Club" list
  bizFeed(_, u){
    member(u);
    const list = all(), s = spotlight();
    const items = [...(s ? [s] : []), ...list.filter(b => !s || b.uid !== s.uid).sort(byNew)].slice(0, 20).map(light);
    const me = store.get('biz:' + u.id);
    return { items, recent: recent(list).slice(0, 12).map(light), spotlight: s ? s.uid : null, total: list.length,
      mine: me ? (visible(me) ? 'published' : me.modHidden && me.published ? 'hidden' : 'draft') : 'none',
      introDismissed: !!(store.get('bizpref:' + u.id) || {}).introDismissed };
  },
  // club director: feature one business at a time, or none
  bizSpotlight({ uid } = {}, u){
    ownerOnly(u);
    if(uid == null || uid === ''){ store.del('bizSpotlight'); return { ok: true, spotlight: null }; }
    const b = typeof uid === 'string' ? store.get('biz:' + uid) : null;
    if(!visible(b)) throw bad('Only a published business can be in the spotlight.');
    store.set('bizSpotlight', { uid: b.uid, at: Date.now(), by: u.id });
    return { ok: true, spotlight: b.uid };
  },
  // club director: hide a published profile from the directory (moderation), or show it again
  bizModerate({ uid, hidden } = {}, u){
    ownerOnly(u);
    const b = typeof uid === 'string' ? store.get('biz:' + uid) : null;
    if(!b) throw bad('That business was not found.');
    store.set('biz:' + uid, { ...b, modHidden: hidden === true });
    if(hidden === true) clearSpotlightFor(uid);
    return { ok: true };
  }
};

// GET /bizlogo/<uid> with the member's token: the logo of a business the caller may see
function logoFor(uid, u){
  if(!u) return { status: 401 };
  const b = store.get('biz:' + uid);
  const may = b && (b.uid === u.id || visible(b) || (isOwner(u) && b.published && userOf(b.uid)));
  const l = may && store.get('bizlogo:' + uid);
  return l ? { status: 200, buf: Buffer.from(l.data, 'base64') } : { status: 404 };
}

// a member was removed from the club, or deleted their own profile: everything goes
function removeUser(uid){
  store.del('biz:' + uid); store.del('bizlogo:' + uid); store.del('bizpref:' + uid);
  clearSpotlightFor(uid);
}

// STAGING ONLY: a few obviously fake businesses for the fake "Test Player NN" accounts, once, so the
// directory can be clicked through. Never runs unless STAGING=1, never touches anyone else.
const DEMO = [
  ['01', { name: 'Northline Plumbing Co.', category: 'trades', description: 'Licensed residential plumbing. Leaks, renovations and water heaters. (Demo profile, not a real business.)', services: 'Repairs, bathroom renos, water heaters', area: 'Toronto & GTA', website: 'https://example.com/northline', email: 'hello@example.com', referrals: true, show: { website: true, email: true } }],
  ['02', { name: 'Maple & Main Realty', category: 'realestate', description: 'Helping first-time buyers find the right home. (Demo profile, not a real business.)', services: 'Buying, selling, first-home advice', area: 'Midtown Toronto', instagram: 'example', referrals: true, show: { instagram: true } }],
  ['03', { name: 'Bluefin Studio', category: 'creative', description: 'Logos, menus and websites for small businesses. (Demo profile, not a real business.)', services: 'Branding, web design, print', area: 'Remote', website: 'https://example.org/bluefin', show: { website: true } }],
  ['04', { name: 'Kettle & Crumb Bakery', category: 'food', description: 'Sourdough, pastries and party trays. (Demo profile, not a real business.)', services: 'Catering, custom cakes', area: 'Leslieville', phone: '416-555-0100', show: { phone: true } }],
  ['05', { name: 'Steady Ledger Bookkeeping', category: 'professional', description: 'Monthly bookkeeping and year-end prep for freelancers. (Demo profile, not a real business.)', services: 'Bookkeeping, payroll, HST filing', area: 'Ontario', email: 'books@example.net', referrals: true, show: { email: true } }]
];
function seedDemo(){
  if(process.env.STAGING !== '1' || store.get('bizDemoSeeded') || store.keys('biz:').length) return 0;
  let n = 0;
  DEMO.forEach(([nn, p], i) => {
    const id = store.get('name:test player ' + nn), x = id && userOf(id);
    if(!x || x.name !== 'Test Player ' + nn) return;
    const at = Date.now() - i * 5 * 864e5;
    store.set('biz:' + id, { uid: id, fullName: '', jobTitle: '', categoryOther: '', website: '', instagram: '', email: '', phone: '', address: '', referrals: false, ...p,
      show: { ...p.show }, published: true, publishedAt: at, modHidden: false, createdAt: at, updatedAt: at, demo: true });
    n++;
  });
  if(n){
    store.set('bizDemoSeeded', { at: Date.now(), n });
    const first = store.get('name:test player 01'); if(first && store.get('biz:' + first)) store.set('bizSpotlight', { uid: first, at: Date.now(), by: 'staging-seed' });
  }
  return n;
}

module.exports = { api, CATEGORIES, logoFor, removeUser, seedDemo, validate: { text, website, instagram, email, phone, logo } };
