// Club join links and QR codes. Every club, now and later, gets a public join page at /join/<club-slug>; its owner
// gets a QR code of that address in Director (drawn on the phone, nothing stored for it). A visitor leaves an email
// with consent, and it is kept for that one club only: joinlead:<clubId>:<sha256(email)>. Nobody else can read it,
// and another club's owner never sees it. The same email joining twice keeps one record and gets the same answer.
// Consent fails closed, as on the Celestia path: the join must carry the token the page got with the consent text.
const crypto = require('crypto');
const store = require('./store');

const MAIN = 'main';
const CONSENT_V = 1, CONSENT_KEY = crypto.randomBytes(32);
const consentText = name => `${name} may email me about club events. I can ask the club owner to remove my email at any time.`;
const consentToken = c => 'j' + CONSENT_V + '.' + crypto.createHmac('sha256', CONSENT_KEY).update(c.slug + '|' + c.id + '|' + CONSENT_V).digest('base64url');
const sameToken = (a, b) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// the clubs this server has: the main club, plus, while club switching is on, every club opened with it (clubdef:<id>).
// With club switching off only the main club has a join page, as only the main club exists for members then.
const defs = () => [{ id: MAIN, name: (store.get('settings') || {}).clubName || 'Blindrise' },
  ...(store.switching && store.switching() ? store.keys('clubdef:') : []).map(k => store.get(k)).filter(d => d && /^[a-z0-9]{3,24}$/.test(d.id || '') && !d.removed)];

// A club's slug comes from its name the first time it is needed and then stays the same, so a printed code keeps working.
// Invite codes on /join/ are always 12 characters, so a slug is never 12 characters long.
function slugify(name){
  const s = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/, '');
  return s.length >= 3 ? s : (s ? s + '-club' : 'club');
}
function clubs(){
  const map = store.get('joinslugs') || {}, used = new Set(Object.values(map));
  let changed = false;
  const out = defs().map(d => {
    let slug = map[d.id];
    if(!slug){
      const base = slugify(d.name);
      for(let n = 1; !slug || used.has(slug) || slug.length === 12; n++) slug = n === 1 ? base : base + '-' + n;
      map[d.id] = slug; used.add(slug); changed = true;
    }
    return { id: d.id, name: d.name, slug, createdBy: d.createdBy || null };
  });
  if(changed) store.set('joinslugs', map);
  return out;
}
const bySlug = slug => typeof slug === 'string' && /^[a-z0-9-]{3,40}$/.test(slug) ? clubs().find(c => c.slug === slug) || null : null;
const initials = name => (String(name).match(/[\p{L}\p{N}]+/gu) || ['?']).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const leads = id => store.values('joinlead:' + id + ':').sort((a, b) => b.at - a.at);

// who owns a club: the main owner owns the main club; another club belongs to the account that made it or is its owner there
function owns(u, c, mainOwner){
  if(!u) return false;
  if(c.id === MAIN) return u.id === mainOwner;
  return c.createdBy === u.id || !!(u.clubs && u.clubs[c.id] && u.clubs[c.id].role === 'owner');
}
const memberCount = c => store.values('user:').filter(x => !x.removed && (c.id === MAIN ? !x.noMain : x.clubs && x.clubs[c.id] && !x.clubs[c.id].removed)).length;

// the owner's QR card data: only the clubs this account owns, each with only its own sign-ups.
// live: the join page is open. There is no switch to close it (owner decision: every club has one), so it is always true.
function ownerView(u, mainOwner){
  return clubs().filter(c => owns(u, c, mainOwner)).map(c => ({ id: c.id, name: c.name, slug: c.slug, path: '/join/' + c.slug,
    members: memberCount(c), live: true, leads: leads(c.id).map(l => ({ email: l.email, at: l.at })) }));
}

// at most JOIN_IP_HOUR new sign-ups per connection per hour (a repeat of the same email does not count)
const JOIN_IP_HOUR = +process.env.JOIN_IP_HOUR || 10;
const joinsByIp = new Map();
const recent = ip => (joinsByIp.get(ip) || []).filter(t => Date.now() - t < 3600e3);
const notFound = () => { const e = new Error('This club link is not active.'); e.status = 404; return e; };
const validEmail = s => s.length <= 254 && /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(s);

const api = {
  // the join page: the club's name and the consent text, and a token proving this page showed that text
  joinInfo({ slug }){
    const c = bySlug(slug);
    if(!c) return { club: false };
    return { club: true, slug: c.slug, name: c.name, initials: initials(c.name), consent: { v: CONSENT_V, text: consentText(c.name) }, token: consentToken(c) };
  },
  // ip comes fourth: the server passes (data, user, club context, ip)
  joinClub({ slug, email, agree, token }, _, __, ip){
    const c = bySlug(slug);
    if(!c) throw notFound();
    // fail closed: no ticked box or no valid token for this club, no sign-up
    if(agree !== true || !sameToken(token, consentToken(c))) throw new Error('Please tick the box to agree, then tap Join again. If it still fails, reload the page.');
    email = String(email || '').trim().toLowerCase();
    if(!validEmail(email)) throw new Error('Please enter a valid email address.');
    const key = 'joinlead:' + c.id + ':' + sha(email);
    if(store.get(key)) return { ok: true, name: c.name };
    if(recent(ip).length >= JOIN_IP_HOUR) throw Object.assign(new Error('Too many sign-ups from this connection. Try again in an hour.'), { status: 429 });
    if(joinsByIp.size > 5000) for(const k of joinsByIp.keys()) if(!recent(k).length) joinsByIp.delete(k);
    joinsByIp.set(ip, [...recent(ip), Date.now()]);
    store.set(key, { email, club: c.id, at: Date.now(), consent: { v: CONSENT_V, text: consentText(c.name), at: Date.now() } });
    if(onJoin) onJoin(c);
    return { ok: true, name: c.name };
  }
};
let onJoin = null;
module.exports = { api, ownerView, clubs, slugify, setOnJoin: f => { onJoin = f; } };
