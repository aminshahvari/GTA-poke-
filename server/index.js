const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const store = require('./store');
const E = require('./engine');
const coach = require('./coach');
const push = require('./push');
// the club modules (tournaments, rewards, Exchange, stats, fairness records) live in a club context: see server/clubs.js.
// With club switching off there is one context, 'main', made of the normal modules and the plain store.
const clubs = require('./clubs');
const rootStore = store; // the plain store, for shared accounts, inside functions that work on a club's own store
clubs.onNew(wire);
const joinqr = require('./joinqr');
const platform = require('./platform'); // Club Rules, suspend/cancel, Blindrise broadcast (club switching only)

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');

// ---------- accounts ----------
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
const cleanName = s => String(s || '').trim().replace(/\s+/g, ' ');
const validName = s => /^[\p{L}\p{N} ._-]{2,16}$/u.test(s);
const validPin = s => /^\d{4,8}$/.test(String(s || ''));
const owner = () => store.get('owner');
function createUser(name, pin, role){
  const id = 'u' + crypto.randomBytes(6).toString('hex'), salt = crypto.randomBytes(12).toString('hex');
  const u = { id, name, salt, pin: hashPin(pin, salt), role, createdAt: Date.now(), agreedAt: Date.now() };
  store.set('user:' + id, u); store.set('name:' + name.toLowerCase(), id);
  return u;
}
function newSession(uid){ const tok = crypto.randomBytes(24).toString('base64url'); store.set('session:' + sha(tok), { uid, at: Date.now() }); return tok; }
function userByToken(tok){
  if(!tok || typeof tok !== 'string') return null;
  const s = store.get('session:' + sha(tok)); if(!s) return null;
  const u = store.get('user:' + s.uid); return u && !u.removed ? u : null;
}
// sign a user out everywhere: every stored token goes, and open sockets are closed (the app then shows the sign-in screen)
function revokeSessions(uid){
  for(const k of store.keys('session:')) if(store.get(k).uid === uid) store.del(k);
  for(const ws of sockets) if(ws.user && ws.user.id === uid){ ws.user = null; try{ ws.close(4003, 'signed out'); }catch(e){} }
}
const sameCode = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const isOwner = u => u && u.role === 'owner';
// the Blindrise founder: the owner of the main club (an account record from the plain store)
const isFounder = u => !!u && u.id === owner() && !u.noMain && !u.removed;
// Who runs tournaments (owner decision of 2026-10-20, "Blindrise only"): the Blindrise club, the Blindrise Open, clubs
// the founder opened himself, and clubs he has allowed. A club a member opened is their team: members, invites, QR,
// Exchange and chat, but its Director has no tournament form or sponsor pick. A tournament it already has can still be
// cancelled, and one already running plays out.
const hosts = c => !clubs.ON() || c.id === clubs.MAIN || c.id === clubs.EVENTS || (d => !!d && (d.createdBy === owner() || !!d.host))(rootStore.get('clubdef:' + c.id));
const NO_HOST = 'Tournaments are run by Blindrise. Your members play them in the Blindrise Open.';
const founderOnly = u => { if(!isFounder(u)) throw Object.assign(new Error('Only the Blindrise founder can do that.'), { status: 403 }); };
// Who may open a club. These two functions are the one place that decides it (owner decision 2026-10-20, Issue #10):
// - the founder, proved by the setup code, as before (no limit on how many);
// - a "business member": a member of any club whose business is published in that club's Exchange and not hidden by
//   its director (Muse #10 D3: the decision says any member with a published Exchange business, so a club's members can
//   found clubs of their own, not only main's). A suspended club's Exchange does not count, nor does the Blindrise Open,
//   which has none. No setup code; one club per account, counting every club it ever opened, including suspended and
//   cancelled ones, so a cancelled club cannot be opened again by the same account.
// Everything else in createClub (Club Rules, name, the club cap) is the same for both.
const clubsOpenedBy = uid => store.values('clubdef:').filter(d => d && d.createdBy === uid).length;
const listedSomewhere = u => clubs.memberships(u).some(id => id !== clubs.EVENTS && !clubs.suspended(id) && clubs.get(id).business.listed(u.id));
function clubCreateMode(u){
  if(!u || u.removed) return null;
  if(isFounder(u)) return 'founder';
  if(!listedSomewhere(u) || clubsOpenedBy(u.id) >= 1) return null;
  return 'member';
}
// the most clubs one server holds (Muse #10 D2: was a fixed 50); MAX_CLUBS in the environment changes it
const MAX_CLUBS = Math.max(1, Math.floor(+process.env.MAX_CLUBS) || 1000);
function clubCreateGate(u, data){
  if(!u) throw new Error('Sign in first.');
  const mode = clubCreateMode(u);
  if(mode === 'founder'){
    if(!process.env.OWNER_CODE || !sameCode(data.code, process.env.OWNER_CODE)) throw new Error('That setup code is not right.');
    return;
  }
  if(mode === 'member') return;
  const forbid = m => Object.assign(new Error(m), { status: 403 });
  if(listedSomewhere(u) && clubsOpenedBy(u.id) >= 1) throw forbid('You have already opened a club. Each member can open one.');
  throw forbid("To open a club, publish your business in your club's Exchange first.");
}

// simple per-IP rate limit for login attempts
const attempts = new Map();
const failures = ip => (attempts.get(ip) || []).filter(t => Date.now() - t < 10 * 60000);
const blocked = (key, max = 15) => process.env.FAST !== '1' && failures(key).length >= max;
const recordFailure = key => { if(attempts.size > 5000) for(const k of attempts.keys()){ if(!failures(k).length) attempts.delete(k); } attempts.set(key, [...failures(key), Date.now()]); };
// On Render, traffic passes Cloudflare, which sets cf-connecting-ip to the caller's address and overwrites any value the
// caller sent. x-forwarded-for there ends in Render's own internal proxy (same for every player), so it is only a local fallback.
const clientIp = req => String(req.headers['cf-connecting-ip'] || '').trim() || String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean).pop() || req.socket.remoteAddress || '';
// Per-account limit, which no header can get around: 10 wrong tries on one name locks that name for 10 minutes.
// With club switching, an invite link also takes an existing name + PIN (redeem), so it counts against the same lock.
const acctKey = (path, data) => path === '/api/login' || path === '/api/redeem' ? 'acct:' + cleanName(data && data.name).toLowerCase() : null;
// Owner recovery (setup code): 5 wrong codes lock only the address they came from, so a stranger cannot lock the real
// owner out. A club-wide cap of 60 wrong codes per 10 minutes stops guessing spread over many addresses.
// Opening a club (club switching) asks for the same setup code, so it counts against the same limits.
const RECOVERY = ['/api/setup', '/api/resetOwner', '/api/createClub'], RECOVERY_IP = 5, RECOVERY_ALL = 60;

const api = {
  // first-time setup of the club owner, guarded by OWNER_CODE from the environment
  setup({ code, name, pin, agree }){
    if(agree !== true) throw new Error('Please confirm you are 19 or older and agree to the club rules.');
    if(owner()) throw new Error('This club already has an owner.');
    if(!process.env.OWNER_CODE || !sameCode(code, process.env.OWNER_CODE)) throw new Error('That setup code is not right.');
    name = cleanName(name);
    if(!validName(name)) throw new Error('Pick a name with 2 to 16 letters or numbers.');
    if(!validPin(pin)) throw new Error('Pick a PIN of 4 to 8 digits.');
    const u = createUser(name, pin, 'owner'); store.set('owner', u.id);
    return { token: newSession(u.id) };
  },
  redeem({ code, name, pin, agree }){
    const c = inviteClub(code), inv = c.store.get('invite:' + code);
    inviteCheck(c, inv);
    name = cleanName(name);
    if(!validName(name)) throw new Error('Pick a name with 2 to 16 letters or numbers.');
    const taken = store.get('name:' + name.toLowerCase());
    if(taken && clubs.ON()){
      // club switching: someone who already has a Blindrise account joins this club with their own name and PIN
      const x = store.get('user:' + taken);
      if(!x || x.removed || !validPin(pin) || hashPin(pin, x.salt) !== x.pin) throw new Error('That name is taken. If it is yours, enter your PIN to join with your account.');
      if(agree !== true) throw new Error('Please confirm you are 19 or older and agree to the club rules.');
      if(!clubs.memberships(x).includes(c.id)){ clubs.addMember(c, x.id, inv.by); joined(c, x.id, code, inv); }
      return { token: newSession(x.id), club: c.id };
    }
    if(taken) throw new Error('That name is taken. Try another.');
    if(!validPin(pin)) throw new Error('Pick a PIN of 4 to 8 digits.');
    if(agree !== true) throw new Error('Please confirm you are 19 or older and agree to the club rules.');
    const u = createUser(name, pin, 'member');
    if(c.id !== clubs.MAIN) store.set('user:' + u.id, { ...u, noMain: true, clubs: { [c.id]: { role: 'member', joinedAt: Date.now(), ...(inv.by ? { invitedBy: inv.by } : {}) } } });
    else if(inv.by) store.set('user:' + u.id, { ...u, invitedBy: inv.by });
    joined(c, u.id, code, inv);
    return clubs.ON() ? { token: newSession(u.id), club: c.id } : { token: newSession(u.id) };
  },
  // club switching only: a signed-in member opens another club's invite link and joins it with the same account
  joinInvite({ code }, u){
    if(!clubs.ON()) throw Object.assign(new Error('Not found'), { status: 404 });
    if(!u) throw new Error('Sign in first.');
    const c = inviteClub(code), inv = c.store.get('invite:' + code);
    if(clubs.memberships(u).includes(c.id)) return { club: c.id };
    inviteCheck(c, inv);
    clubs.addMember(c, u.id, inv.by); joined(c, u.id, code, inv);
    return { club: c.id };
  },
  // club switching only: open a new club. Who may: clubCreateGate. The Blindrise Club Rules must be accepted, in their
  // current version, or no club is made (fail closed); the acceptance is kept on the club's definition.
  createClub(data, u){
    if(!clubs.ON()) throw Object.assign(new Error('Not found'), { status: 404 });
    clubCreateGate(u, data);
    const rules = platform.acceptance(data, u.id);
    const name = cleanName(data.name);
    if(!/^[\p{L}\p{N} .&'-]{2,40}$/u.test(name)) throw new Error('Pick a club name of 2 to 40 letters or numbers.');
    if(store.keys('clubdef:').length >= MAX_CLUBS) throw new Error(`This server already has ${MAX_CLUBS} clubs.`);
    const c = clubs.create(name, u.id, { rules });
    // the founder is told when a member opens a club (decision of 2026-10-20, Muse #10 D4): a notification, and the
    // club is in his Director list from now on. Only the club's name, never the member's details.
    if(!isFounder(u) && owner()) push.notify([owner()], { title: 'A new club opened', body: `${name} was opened on Blindrise.`, tag: 'club-' + c.id, ttl: 24 * 3600 }).catch(() => {});
    broadcastAll();
    return { club: c.id };
  },
  login({ name, pin }){
    const id = store.get('name:' + cleanName(name).toLowerCase()), u = id && store.get('user:' + id);
    if(!u || u.removed || hashPin(pin, u.salt) !== u.pin) throw new Error('Name or PIN is not right.');
    return { token: newSession(u.id) };
  },
  // the owner forgot their PIN: the setup code from the server settings proves it's them
  resetOwner({ code, pin }){
    const id = owner(), u = id && store.get('user:' + id);
    if(!u || !process.env.OWNER_CODE || !sameCode(code, process.env.OWNER_CODE)) throw new Error('That setup code is not right.');
    if(!validPin(pin)) throw new Error('Pick a PIN of 4 to 8 digits.');
    const salt = crypto.randomBytes(12).toString('hex');
    store.set('user:' + id, { ...u, salt, pin: hashPin(pin, salt) });
    revokeSessions(id); // a new PIN signs out every device that used the old one
    return { token: newSession(id), name: u.name };
  },
  invite(_, u, c){ return { code: inviteCode(c, u) }; },
  status(){ return clubs.ON() ? { hasOwner: !!owner(), clubSwitching: true } : { hasOwner: !!owner() }; },
  pushKey(){ return { key: push.publicKey() }; },
  push(sub, u){ if(!u) throw new Error('Sign in first.'); push.subscribe(u.id, sub); broadcastAll(); return { ok: true }; },
  unpush({ endpoint }, u){ if(u) push.unsubscribe(u.id, String(endpoint || '')); return { ok: true }; },
  // your own picture: a gallery avatar or a small photo the phone has already shrunk
  avatar(a, u){
    if(!u) throw new Error('Sign in first.');
    store.set('user:' + u.id, clubs.get(clubs.MAIN).players.setAvatar(store.get('user:' + u.id), a)); // pictures are part of the shared account
    broadcastAll();
    return { ok: true };
  },
  // club join page and QR code (/join/<club-slug>): see server/joinqr.js. Account-level: a lead is kept per club id.
  ...joinqr.api,
  // ---------- Blindrise platform (founder only, club switching only): see server/platform.js ----------
  // suspend, restore or cancel another club. It acts on a live club at once: its tournament is paused (suspend) or
  // cancelled (cancel), its members' screens switch to the notice, and its join page and QR sign-ups stop.
  clubModerate(data, u){
    founderOnly(u);
    const id = data && data.club, c = typeof id === 'string' && id !== clubs.MAIN ? clubs.get(id) : null;
    const d = platform.moderate(data || {}, u);
    if(c){
      if(data.action === 'suspend'){ c.club.pause(); for(const ws of sockets) if(ws.ctx === c && ws.user) sendWS(ws, { t: 'club', club: viewFor(c, ws) }); }
      if(data.action === 'cancel'){ c.club.cancel(); leaveClub(c); }
      c.memo = null;
    }
    broadcastAll();
    return { club: d.id, status: platform.statusOf(d) };
  },
  // ---------- the Blindrise Open (club switching only): Blindrise tournaments for members of every club ----------
  // The founder runs them from the events context (server/clubs.js); this makes him its director and takes him there.
  eventsOpen(_, u){
    founderOnly(u);
    const e = clubs.get(clubs.EVENTS), x = rootStore.get('user:' + u.id), cur = (x.clubs || {})[clubs.EVENTS];
    if(!cur || cur.removed || cur.role !== 'owner') rootStore.set('user:' + u.id, { ...x, clubs: { ...(x.clubs || {}), [clubs.EVENTS]: { role: 'owner', joinedAt: Date.now() } } });
    e.store.set('owner', u.id); e.memo = null;
    broadcastAll();
    return { club: clubs.EVENTS };
  },
  // a member of any club registers for the open Blindrise tournament, from their own club (c). Registering is what
  // makes them a member of the Blindrise Open; the club they came from is kept only to tell look-alike names apart.
  eventJoin(_, u, c){
    if(!u) throw new Error('Sign in first.');
    const e = clubs.get(clubs.EVENTS), t = e.club.T();
    if(!t || !(t.status === 'registering' || (t.status === 'running' && e.club.lateOpen()))) throw new Error('Registration for the Blindrise Open is closed.');
    const x = rootStore.get('user:' + u.id), cur = (x.clubs || {})[clubs.EVENTS], fresh = !cur || cur.removed;
    if(fresh) rootStore.set('user:' + u.id, { ...x, clubs: { ...(x.clubs || {}), [clubs.EVENTS]: { ...(cur && cur.role === 'owner' ? cur : { role: 'member', joinedAt: Date.now() }), removed: false, home: c.id === clubs.EVENTS ? (cur && cur.home) || clubs.MAIN : c.id } } });
    try{ e.club.join(u.id); }
    catch(err){ if(fresh) dropEvent(u.id); throw err; }
    broadcastAll();
    return { ok: true };
  },
  // unregister before it starts: someone who never played a Blindrise Open stops being a member of it
  eventLeave(_, u){
    if(!u) throw new Error('Sign in first.');
    const e = clubs.get(clubs.EVENTS), t = e.club.T();
    if(!t || t.status !== 'registering') throw new Error('You can only unregister before the tournament starts.');
    e.club.leave(u.id);
    if(!e.store.values('history:').some(h => h.results.some(r => r.uid === u.id))) dropEvent(u.id);
    broadcastAll();
    return { ok: true };
  },
  // one-way Blindrise posts shown in every club
  platformPost(data, u){ founderOnly(u); const p = platform.post(data || {}); broadcastAll(); return { id: p.id }; },
  platformUnpost(data, u){ founderOnly(u); platform.unpost(data || {}); broadcastAll(); return { ok: true }; }
};
const PLATFORM_API = ['clubModerate', 'platformPost', 'platformUnpost', 'eventsOpen', 'eventJoin', 'eventLeave'];
// end a Blindrise Open membership (never the founder's)
function dropEvent(uid){
  const x = rootStore.get('user:' + uid), cur = x && (x.clubs || {})[clubs.EVENTS];
  if(cur && cur.role !== 'owner') rootStore.set('user:' + uid, { ...x, clubs: { ...x.clubs, [clubs.EVENTS]: { ...cur, removed: true } } });
}
// Business Club (members-only directory, separate from poker): see server/business.js
// Opportunity Club ("I need help" / "I can help" listings inside Business Club): see server/opportunity.js
// Both run inside the caller's club context, so each club has its own Exchange.
const CLUB_API = new Set([...Object.keys(clubs.get(clubs.MAIN).business.api), ...Object.keys(clubs.get(clubs.MAIN).opportunity.api), ...Object.keys(clubs.get(clubs.MAIN).domino.api)]);
// Domino tournaments and the Smart Scorepad (server/domino/): off unless DOMINO=1, and then a 404 for every call
const DOMINO = () => process.env.DOMINO === '1';
const DOMINO_API = new Set(Object.keys(clubs.get(clubs.MAIN).domino.api));
const clubApi = (name, c) => DOMINO_API.has(name) ? c.domino.api[name] : Object.hasOwn(c.opportunity.api, name) ? c.opportunity.api[name] : c.business.api[name];
// calls that act on the shared account, not on a club
const ACCOUNT_API = ['avatar', 'push', 'unpush', 'joinInvite', 'createClub', 'joinInfo', 'joinClub', 'clubModerate', 'platformPost', 'platformUnpost', 'eventsOpen', 'eventLeave'];
// which club an invite code belongs to (main when club switching is off)
function inviteClub(code){
  if(clubs.ON() && typeof code === 'string') for(const c of clubs.all()) if(c.store.get('invite:' + code)) return c;
  return clubs.get(clubs.MAIN);
}
function inviteCheck(c, inv){
  if(clubs.suspended(c.id)) throw new Error('This club is suspended by Blindrise right now, so its invite links do not work.');
  const dead = !inv || inv.revoked || (inv.multi ? (inv.uses || []).length >= inv.max || Date.now() > inv.expiresAt : inv.usedBy);
  if(inv && !dead && inv.by && inv.by !== c.store.get('owner') && !membersInvite(c)) throw new Error('Member invites are switched off right now. Ask the organizer for a link.');
  if(dead) throw new Error(inv && inv.multi ? 'This group link is full, expired or was cancelled. Ask the organizer for a new one.' : 'This invite link has already been used or was cancelled. Ask for a new one.');
}
// after an invite was used: sign the player up for the open tournament, record the use, tell the club
function joined(c, uid, code, inv){
  // the link is usually sent for a tournament: sign the new player up for it straight away
  const t = c.club.T();
  if(t && (t.status === 'registering' || (t.status === 'running' && c.club.lateOpen()))) try{ c.club.join(uid); }catch(e){}
  c.store.set('invite:' + code, inv.multi ? { ...inv, uses: [...(inv.uses || []), uid] } : { ...inv, usedBy: uid, usedAt: Date.now() });
  broadcastClub(c);
}
// Business Club + Opportunity Club: closed to members until the owner opens them in the Director tab (the owner can always use them).
// Staging opens them by default so they can be tested; CLUBS_DEFAULT=on does the same for local test runs.
const clubsOn = c => { if(c.id === clubs.EVENTS) return false; const s = c.store.get('settings') || {}; return typeof s.clubsOn === 'boolean' ? s.clubsOn : process.env.STAGING === '1' || process.env.CLUBS_DEFAULT === 'on'; };
const clubsClosedFor = (c, u) => !!u && !isOwner(u) && !clubsOn(c);
const GROUP_MAX = 100, GROUP_DAYS = 30, MEMBER_DAYS = 7;
// Members can invite friends too (the owner can switch that off). A member's link joins at most MEMBER_MAX people,
// and asking again hands back the member's open link instead of piling up new ones.
const MEMBER_MAX = 10;
const membersInvite = c => c.id !== clubs.EVENTS && (c.store.get('settings') || {}).membersInvite !== false;
const openInvite = i => !i.revoked && (i.multi ? Date.now() < i.expiresAt && (i.uses || []).length < i.max : !i.usedBy);
function inviteCode(c, u, group){
  if(c.id === clubs.EVENTS) throw new Error('The Blindrise Open has no invite links: members of every club register from their own club.');
  const store = c.store;
  if(!isOwner(u)){
    if(!membersInvite(c)) throw new Error('The organizer has turned off member invites. Ask them for a link.');
    const mine = store.values('invite:').find(i => i.by === u.id && i.multi && openInvite(i));
    if(mine) return mine.code;
    group = true;
  }
  // the organizer's group link stays the same until it fills up, expires or is cancelled, so one link can be shared all day
  if(group && isOwner(u)){ const cur = store.values('invite:').find(i => i.by === u.id && i.multi && openInvite(i)); if(cur) return cur.code; }
  const code = crypto.randomBytes(9).toString('base64url');
  const max = isOwner(u) ? GROUP_MAX : MEMBER_MAX;
  store.set('invite:' + code, group ? { code, createdAt: Date.now(), by: u.id, multi: true, max, uses: [], expiresAt: Date.now() + (isOwner(u) ? GROUP_DAYS : MEMBER_DAYS) * 864e5 }
    : { code, createdAt: Date.now(), by: u.id });
  return code;
}
const invitedCount = (c, uid) => c.store.values('user:').filter(x => !x.removed && x.invitedBy === uid).length;

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.gz': 'application/octet-stream' };
const SECURITY = {
  // Everything the app runs comes from this server. 'wasm-unsafe-eval' lets the on-phone business card reader
  // (Tesseract.js, served from /vendor/) compile its WebAssembly; it does not allow eval() of JavaScript.
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' wss:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
};
// Business Club data is for signed-in members only and must never be indexed
const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
function send(res, code, body, type = 'application/json', extra){
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  // 503 until the lease is held and state is loaded, and again while shutting down (Render routes only to 200s)
  if(req.method === 'GET' && url.pathname === '/healthz'){ const ok = ready && !stopping; return send(res, ok ? 200 : 503, { ok, ...store.health() }); }
  if(stopping) return send(res, 503, { error: 'Server is restarting. Try again in a moment.' });
  // the media lab (preview only, see server/media.js): its API, signed uploads, signed reads and its page
  if(url.pathname.startsWith('/media/')) return media.ON() ? media.handle(req, res, url, mediaWho, SECURITY) : send(res, 404, 'Not found', 'text/plain');
  if(url.pathname.startsWith('/lab/') && !media.ON()) return send(res, 404, 'Not found', 'text/plain');
  if(process.env.FAST === '1' && url.pathname === '/debug/chips'){ const club = clubs.get(clubs.MAIN).club, t = club.T(); return send(res, 200, { chips: club.totalChips(), expected: t && t.status === 'running' ? t.stack * t.entrants : null, tables: club.tablesSummary(), hfh: club.hfhState(), detail: process.env.DEBUG_CHIPS ? [...club.tables.values()].map(tb => ({ tid: tb.tid, broken: tb.broken, toBreak: tb.toBreak, inHand: tb.inHand, seats: tb.g.seats.map((p, i) => p && [i, p.uid, p.stack, p.start]).filter(Boolean), hp: tb.g.hand ? tb.g.hand.players.map(p => [p.seat, p.uid, p.start]) : [] })) : undefined }); }
  if(req.method === 'POST' && url.pathname.startsWith('/api/')){
    const ip = 'ip:' + clientIp(req);
    let body = '';
    const limit = url.pathname === '/api/avatar' || url.pathname === '/api/bizSave' ? 70000 : 10000;
    const extra = url.pathname.startsWith('/api/biz') || url.pathname.startsWith('/api/opp') ? NOINDEX : undefined;
    req.on('data', c => { body += c; if(body.length > limit) req.destroy(); });
    req.on('end', () => {
      let acct = null;
      try{
        const name = url.pathname.slice(5), fn = Object.hasOwn(api, name) ? api[name] : CLUB_API.has(name) && name;
        if(!fn || (!clubs.ON() && (name === 'joinInvite' || name === 'createClub' || PLATFORM_API.includes(name))) || (DOMINO_API.has(name) && !DOMINO())) return send(res, 404, { error: 'Not found' });
        if(blocked(ip, 30)) return send(res, 429, { error: 'Too many tries. Wait a few minutes.' });
        const data = body ? JSON.parse(body) : {};
        acct = acctKey(url.pathname, data);
        if(acct && blocked(acct, 10)) return send(res, 429, { error: 'Too many tries. Wait a few minutes.' });
        if(RECOVERY.includes(url.pathname) && (blocked('rec' + ip, RECOVERY_IP) || blocked('rec:all', RECOVERY_ALL))) return send(res, 429, { error: 'Too many tries. Wait a few minutes.' });
        const ur = userByToken(req.headers.authorization?.replace(/^Bearer /, ''));
        // the club this call is about: the one the app says it is showing (x-club), only if the caller belongs to it
        const c = clubs.ON() && !ACCOUNT_API.includes(name) ? ctxFor(ur, req.headers['x-club']) : clubs.get(clubs.MAIN);
        if(!c) return send(res, 403, { error: 'You are not a member of that club.' }, undefined, extra);
        if(ur && !ACCOUNT_API.includes(name) && clubs.suspended(c.id)) return send(res, 403, { error: SUSPENDED }, undefined, extra);
        const u = clubs.ON() && ur && !ACCOUNT_API.includes(name) ? c.store.get('user:' + ur.id) || null : ur;
        if(extra && c.id === clubs.EVENTS) return send(res, 404, { error: 'Not found' }, undefined, extra); // no Exchange in the Blindrise Open
        if(extra && clubsClosedFor(c, u)) return send(res, 403, { error: 'Business Club opens soon.' }, undefined, extra);
        send(res, 200, typeof fn === 'string' ? clubApi(fn, c)(data, u) : fn(data, u, c, clientIp(req)), undefined, extra);
      }catch(e){ if(['/api/setup', '/api/redeem', '/api/login', '/api/resetOwner', '/api/joinClub', '/api/createClub'].includes(url.pathname)){ recordFailure(ip); if(acct) recordFailure(acct); if(RECOVERY.includes(url.pathname) && /setup code/.test(e.message)){ recordFailure('rec' + ip); recordFailure('rec:all'); } } send(res, [401, 403, 404, 409, 429].includes(e.status) ? e.status : 400, { error: e.message || 'Something went wrong.', ...(e.status === 409 && e.current != null ? { current: e.current } : {}) }, undefined, extra); }
    });
    return;
  }
  if(req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  const av = /^\/avatar\/(u[0-9a-f]{12})$/.exec(url.pathname);
  if(av){
    const buf = clubs.get(clubs.MAIN).players.photo(av[1]); if(!buf) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=604800, immutable', ...SECURITY }); return res.end(buf);
  }
  // Business Club logos: only with the member's token (sent by fetch, not a plain <img> link)
  const bl = /^\/bizlogo\/(u[0-9a-f]{12})$/.exec(url.pathname);
  if(bl){
    const lr = userByToken(req.headers.authorization?.replace(/^Bearer /, ''));
    const c = clubs.ON() ? ctxFor(lr, req.headers['x-club']) : clubs.get(clubs.MAIN);
    const lu = clubs.ON() && lr && c ? c.store.get('user:' + lr.id) || null : lr;
    const r = !c || c.id === clubs.EVENTS || clubs.suspended(c.id) || clubsClosedFor(c, lu) ? { status: 404 } : c.business.logoFor(bl[1], lu);
    if(r.status !== 200) return send(res, r.status, 'Not found', 'text/plain', NOINDEX);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', ...SECURITY, ...NOINDEX }); return res.end(r.buf);
  }
  let file = url.pathname === '/lab/media' ? 'lab/media.html' : url.pathname === '/' || url.pathname === '/login' || url.pathname.startsWith('/join/') ? 'index.html' : url.pathname.slice(1);
  if(file === 'engine.js') return fs.readFile(path.join(__dirname, 'engine.js'), (err, buf) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, buf, TYPES['.js']));
  const full = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if(!full.startsWith(PUBLIC)) return send(res, 404, 'Not found', 'text/plain');
  // pinned third-party files (public/vendor/<name>-<version>/): never change at a given path, so phones may keep them for a year.
  // eng.traineddata.gz goes out as plain bytes with no Content-Encoding; the card reader unzips it itself.
  const cache = url.pathname.startsWith('/vendor/') ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : undefined;
  fs.readFile(full, (err, buf) => {
    if(err) return send(res, 404, 'Not found', 'text/plain');
    if(file === 'index.html' && quietUI()) buf = quietPage(buf);
    // app files: the phone keeps a copy but asks every time ("no-cache"); an unchanged file costs a 304 instead of the whole file
    const tag = '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"';
    const fresh = cache || { 'Cache-Control': 'no-cache', ETag: tag };
    // the media lab plays the chosen clip from the phone's memory (a blob: link) before preparing it; only that page may
    if(file === 'lab/media.html') fresh['Content-Security-Policy'] = SECURITY['Content-Security-Policy'] + "; media-src 'self' blob:";
    if(!cache && req.headers['if-none-match'] === tag){ res.writeHead(304, { ...SECURITY, ...fresh }); return res.end(); }
    send(res, 200, buf, TYPES[path.extname(full)] || 'application/octet-stream', fresh);
  });
});

// ---------- realtime ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const sockets = new Set();
function sendWS(ws, msg){ if(ws.readyState === 1) ws.send(JSON.stringify(msg)); }

// ---------- keeping players who share a home, internet connection or device apart ----------
const ipOf = req => String(req.headers['cf-connecting-ip'] || req.headers['true-client-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0]).trim() || req.socket.remoteAddress || '';
function remember(u, ip, dev){
  const x = store.get('user:' + u.id); if(!x) return;
  const now = Date.now(), seen = x.seen || { ips: {}, devs: {} };
  const keep = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6));
  if(ip) seen.ips = keep({ ...seen.ips, [ip]: now });
  if(dev) seen.devs = keep({ ...seen.devs, [dev]: now });
  store.set('user:' + u.id, { ...x, seen });
}
function linkReason(cx, a, b){
  if(a === b) return null;
  const linkCache = cx.linkCache;
  const k = a < b ? a + '|' + b : b + '|' + a, c = linkCache.get(k);
  if(c && Date.now() - c.at < 5000) return c.r;
  const ua = cx.store.get('user:' + a), ub = cx.store.get('user:' + b);
  let r = null;
  if(ua && ub){
    const now = Date.now(), recent = (o, days) => Object.entries(o || {}).filter(([, t]) => now - t < days * 864e5).map(([v]) => v);
    const share = (x, y) => x.some(v => y.includes(v));
    if(ua.household && ua.household === ub.household) r = 'same household';
    else if(share(recent(ua.seen && ua.seen.devs, 60), recent(ub.seen && ub.seen.devs, 60))) r = 'same device';
    else if(share(recent(ua.seen && ua.seen.ips, 14), recent(ub.seen && ub.seen.ips, 14))) r = 'same internet';
  }
  linkCache.set(k, { r, at: Date.now() });
  return r;
}
function conflictPairs(c){
  const club = c.club, t = club.T(), out = [], pairs = groups => groups.forEach(([where, us]) => { for(let i = 0; i < us.length; i++) for(let j = i + 1; j < us.length; j++){ const r = linkReason(c, us[i], us[j]); if(r) out.push({ a: us[i], b: us[j], reason: r, where }); } });
  if(t && t.status === 'registering') pairs([['registered', t.regs]]);
  else if(t && t.status === 'running') pairs([...club.tables.values()].filter(x => !x.broken).map(x => ['Table ' + x.n, x.g.seats.filter(Boolean).map(p => p.uid)]));
  return out;
}

function membersView(c){
  const { store, players } = c;
  if(c.memo && Date.now() - c.memo.at < 200) return c.memo;
  const history = store.values('history:').sort((a, b) => b.endedAt - a.endedAt);
  const members = store.values('user:').filter(x => !x.removed).map(x => {
    const pr = players.profile(x.id, history);
    return { id: x.id, name: x.name, role: x.role, createdAt: x.createdAt, invitedBy: x.invitedBy || null, av: x.av || null, tier: pr.tier, color: pr.color, score: pr.score };
  });
  c.memo = { at: Date.now(), members, history: history.slice(0, 200), all: history };
  return c.memo;
}
const SUSPENDED = 'This club is suspended by Blindrise. Its members and data are kept, but nothing in it can be used until it is restored.';
// what a member of a suspended club gets instead of the club: the notice, their clubs, and Blindrise posts. No members,
// tournament, tables or anything else of the club.
function suspendedView(c, u){
  return { suspended: true, notice: SUSPENDED, me: { id: u.id, name: u.name, owner: false }, clubSwitching: true, club: { id: c.id, name: clubs.def(c.id).name, suspended: true },
    clubs: clubList(u), blindrise: platform.feed(), members: [], history: [], tables: [], tourney: null, myTable: null, now: Date.now(), version: VERSION, features: { clubs: false } };
}
const clubList = u => clubs.memberships(rootStore.get('user:' + u.id)).map(id => ({ id, name: clubs.def(id).name, ...(clubs.suspended(id) ? { suspended: true } : {}) }));
// the tournament as the club's screens show it (the club view, and a spectator's view of a platform club)
const tourneyOf = (c, t) => { const club = c.club; return { id: t.id, status: t.status, name: t.name, stack: t.stack, levelMin: t.levelMin, startAt: t.startAt, repeat: t.repeat, regs: t.regs,
      level: t.level, levelEndsAt: t.levelEndsAt, paused: t.paused, pausedLeft: t.pausedLeft, entrants: t.entrants, remaining: t.remaining,
      places: t.places, note: t.note, anteMode: t.anteMode || 'bb', actSec: t.actSec || 20, tableSize: t.tableSize || 9, helper: t.helper !== false, lateLevels: t.lateLevels || 0, lateOpen: club.lateOpen(), payouts: t.entrants ? club.payoutPcts(t.entrants) : null, seal: t.fairSeal || null,
      ...(club.gp() ? { showMuck: t.showMuck === true, rabbit: t.rabbit === true, handPause: t.handPause || 0 } : {}),
      startedAt: t.startedAt || null, breaks: club.breaksOn(), breakEvery: club.BREAK_EVERY, breakMin: t.breakMin || 5, breakUntil: club.onBreak(t) ? t.breakUntil : null, breakPending: !!t.breakPending && !t.paused,
      pausedBreakLeft: t.paused ? t.pausedBreakLeft || 0 : 0, sponsor: c.business.sponsorCard(t.sponsor), sponsorSec: t.sponsorSec || 8 }; };
function clubView(c, u){
  if(clubs.ON() && clubs.suspended(c.id)) return suspendedView(c, u);
  const { store, club, rewards } = c;
  const t = club.T();
  const { members, history } = membersView(c);
  const view = {
    me: { id: u.id, name: u.name, owner: isOwner(u) },
    tourney: t ? tourneyOf(c, t) : null,
    ...(isOwner(u) && hosts(c) ? { sponsors: c.business.sponsorOptions() } : {}), hosts: hosts(c),
    tables: club.tablesSummary(), myTable: club.tableOf(u.id),
    // who invited whom is for the owner only: a member's payload carries no inviter for anyone (Muse P10)
    members: isOwner(u) ? members : members.map(m => m.invitedBy ? { ...m, invitedBy: null } : m),
    history, now: Date.now(), shop: c.id === clubs.EVENTS ? null : rewards.view(u.id, isOwner(u)), // no rewards shop in the Blindrise Open
    features: { clubs: clubsOn(c), ...(club.gp() ? { tableExtras: true } : {}), ...(club.breaksOn() ? { breaks: true } : {}) }, chatOff: !!(store.get('settings') || {}).chatOff, muted: !!u.muted, version: VERSION,
    pushOn: push.hasPush(u.id), membersInvite: membersInvite(c), invitedCount: invitedCount(c, u.id), myInvite: (() => { const i = store.values('invite:').find(x => x.by === u.id && x.multi && openInvite(x)); return i ? { used: (i.uses || []).length, max: i.max, expiresAt: i.expiresAt } : null; })()
  };
  if(isOwner(u)){
    view.invites = store.values('invite:').filter(openInvite)
      .map(i => ({ code: i.code, createdAt: i.createdAt, multi: !!i.multi, used: (i.uses || []).length, max: i.max, expiresAt: i.expiresAt, by: i.by }));
    view.conflicts = conflictPairs(c);
    const hh = Object.fromEntries(store.values('user:').filter(x => !x.removed && x.household).map(x => [x.id, x.household]));
    view.households = hh;
    view.mutedIds = store.values('user:').filter(x => !x.removed && x.muted).map(x => x.id);
  }
  if(clubs.ON()){
    // club switching: which club this is, and the clubs this account belongs to (names only)
    view.clubSwitching = true;
    view.club = { id: c.id, name: clubs.def(c.id).name };
    view.clubs = clubList(u);
    view.canCreateClub = c.id === clubs.MAIN && isOwner(u) && rootStore.get('owner') === u.id;
    // a business member who may open their own club (see clubCreateMode) gets the offer and the Club Rules in their clubs
    if(c.id !== clubs.EVENTS && !view.canCreateClub && clubCreateMode(rootStore.get('user:' + u.id)) === 'member') view.openClub = { rules: platform.rules() };
    // Blindrise posts, in every club, to every member (only what the founder typed)
    view.blindrise = platform.feed();
    // the Blindrise Open: inside it, say so; in every other club, its card for this member (counts only, no names)
    if(c.id === clubs.EVENTS) view.events = true;
    else { const ev = eventCard(u.id); if(ev) view.bevent = ev; }
    // every member club: the Live at Blindrise headline (Issue #25)
    if(c.id !== clubs.EVENTS && c.id !== clubs.MAIN) view.live = liveCard(u.id);
    if(c.id === clubs.MAIN && view.canCreateClub) view.canRunEvents = true;
    // the founder, in his own club's Director: the Club Rules new clubs accept, every club with counts only (no names or
    // emails), the moderation log and the posts
    if(view.canCreateClub && isFounder(rootStore.get('user:' + u.id))) view.platform = { rules: platform.rules(), clubs: platform.overview().map(x => ({ ...x, mine: (rootStore.get('clubdef:' + x.id) || {}).createdBy === owner() })), log: platform.log().slice(-30).reverse() };
  }
  // the join page and QR code of this club, if this account owns it, with this club's email sign-ups only
  const jq = joinqr.ownerView(rootStore.get('user:' + u.id), rootStore.get('owner')).filter(x => x.id === c.id);
  if(jq.length) view.joinQr = jq;
  if(DOMINO()) view.domino = true; // dominoes are on: the app shows them (their state comes in 'domino' messages)
  return view;
}
// The Blindrise Open as every other club shows it: what it is, when, how many have registered, and whether this member
// is in it. Never who registered: the registration list belongs to Blindrise (owner decision, Issue #10).
function eventCard(uid){
  const e = clubs.get(clubs.EVENTS), t = e && e.club.T();
  if(!t || (t.status !== 'registering' && t.status !== 'running')) return null;
  const tid = e.club.tableOf(uid), late = t.status === 'running' && e.club.lateOpen();
  return { id: t.id, name: t.name, status: t.status, startAt: t.startAt || null, stack: t.stack, levelMin: t.levelMin,
    count: t.status === 'running' ? t.entrants || 0 : t.regs.length, remaining: t.status === 'running' ? t.remaining || 0 : null,
    registered: t.regs.includes(uid) || !!tid, playing: !!tid, open: t.status === 'registering' || late };
}
// Live at Blindrise (Issue #25, owner directives of 2026-10-20): the top of every member club's home shows the platform's
// games, the Blindrise club's tournament and its dominoes (the Blindrise Open has its own card, bevent, shown there too).
// Only their public state (what, when, how many, which level) and this account's own place in them: never who
// registered, and nothing of the Blindrise club's members, chat, Exchange or Bulletin.
function pokerCard(uid){
  const m = clubs.get(clubs.MAIN), t = m.club.T();
  if(!t || (t.status !== 'registering' && t.status !== 'running')) return null;
  const tid = uid ? m.club.tableOf(uid) : null, live = t.status === 'running';
  return { id: t.id, name: t.name, status: t.status, startAt: t.startAt || null, stack: t.stack, levelMin: t.levelMin, level: live ? t.level : null, paused: !!t.paused,
    count: live ? t.entrants || 0 : t.regs.length, remaining: live ? t.remaining || 0 : null, tables: live ? m.club.tablesSummary().length : 0,
    registered: !!uid && (t.regs.includes(uid) || !!tid), playing: !!tid, open: t.status === 'registering' || (live && m.club.lateOpen()),
    // while it plays, what a broadcast shows (owner's design brief, 2026-10-21): the chip leader of the whole field and of
    // each table (the table names their seats already show anyone watching), the seats taken, and how many are watching
    ...(live ? (f => ({ leader: f.shown.leader, watchers: f.shown.watchers, size: t.tableSize || 9, tableList: f.tableList })) (fieldOf(m)) : {}) };
}
const liveCard = uid => ({ member: clubs.memberships(rootStore.get('user:' + uid)).includes(clubs.MAIN), poker: pokerCard(uid), domino: DOMINO() ? clubs.get(clubs.MAIN).domino.card(uid) : null });
// the Blindrise club's games changed: member clubs get a new view only when what their headline shows changed (status,
// counts, level, who is seated), not on every hand
let liveSig = '', liveAt = 0, liveTimer = null;
const LIVE_MS = process.env.FAST === '1' ? 300 : 3000; // the live card follows the play, at most every few seconds
function liveChanged(){
  if(!clubs.ON() || liveTimer) return;
  liveTimer = setTimeout(liveCheck, Math.max(0, liveAt + LIVE_MS - Date.now()));
}
function liveCheck(){
  liveTimer = null;
  const m = clubs.get(clubs.MAIN), seated = [...m.club.tables.values()].filter(x => !x.broken).flatMap(x => x.g.seats.filter(Boolean).map(p => p.uid)).sort().join();
  const sig = JSON.stringify([pokerCard(null), m.club.T() && m.club.T().regs, seated, DOMINO() ? m.domino.card(null) : null, DOMINO() ? m.domino.entrants() : null]);
  if(sig !== liveSig){ liveSig = sig; liveAt = Date.now(); for(const x of clubs.all()) if(x.id !== clubs.MAIN && x.id !== clubs.EVENTS) broadcastClub(x); }
}
// Watching a platform game from any club (Issue #25): a spectator's socket is in the Blindrise club or the Blindrise
// Open without being a member of it. It gets the tournament, the list of tables and the table it watches, read-only,
// exactly as a player who is not seated sees it, and the domino board. Nothing else: no members, results, chat, coach,
// Exchange, sponsor or prizes, and every message except 'watch' is ignored.
function spectatorView(c, u, home){
  const t = c.club.T(), club = c.club;
  return { spectate: true, me: { id: u.id, name: u.name, owner: false }, clubSwitching: true, club: { id: c.id, name: clubs.def(c.id).name }, home: { id: home, name: (clubs.def(home) || {}).name || 'your club' },
    clubs: [], tourney: t ? { ...tourneyOf(c, t), regs: [], regCount: t.regs.length, note: null, sponsor: null } : null, hosts: false,
    tables: club.tablesSummary(), myTable: null, members: [], history: [], now: Date.now(), shop: null,
    features: { clubs: false, ...(club.gp() ? { tableExtras: true } : {}), ...(club.breaksOn() ? { breaks: true } : {}) }, chatOff: true, muted: true, version: VERSION,
    ...(DOMINO() && c.id === clubs.MAIN ? { domino: true } : {}) };
}
const viewFor = (c, ws) => ws.spectator ? spectatorView(c, ws.user, ws.home) : clubView(c, ws.user);
// the domino board a spectator sees: the tournament as members see it, without the club's rankings or anyone's stats
const dominoBoard = c => ({ ...c.domino.view(null), ranking: null, stats: null });
// the club an account is using: the one asked for if they belong to it, otherwise their first club (main first);
// null when they asked for a club they do not belong to, or belong to none
function ctxFor(ur, want){
  // signed out (sign in, invite links, setup, the join page): the club header a phone kept from before is ignored,
  // or a member who signed out could never sign in again ("You are not a member of that club.")
  if(!ur) return clubs.get(clubs.MAIN);
  const mine = clubs.memberships(store.get('user:' + ur.id));
  if(want) return mine.includes(want) ? clubs.get(want) : null;
  return mine.length ? clubs.get(mine[0]) : null;
}
const VERSION = (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || null;

// ---------- table chat and throwables ----------
const THROWS = ['tomato', 'rose', 'beer', 'egg', 'fish', 'clap', 'cake', 'fire'];
const chatRate = new Map();
function chatTo(c, tid, msg){
  for(const ws of sockets) if(ws.user && ws.ctx === c && !ws.spectator && (ws.watch === tid || c.club.tableOf(ws.user.id) === tid)) sendWS(ws, msg);
}
function chat(c, ws, u, m){
  const { store, club, players, chatLogs } = c;
  const fail = error => sendWS(ws, { t: 'chaterr', error });
  if((store.get('settings') || {}).chatOff && !isOwner(u)) return fail('The organizer has turned table chat off.');
  if(u.muted) return fail('The organizer has muted your chat.');
  const tid = club.tableOf(u.id) || (isOwner(u) && ws.watch && club.tables.has(ws.watch) ? ws.watch : null);
  if(!tid) return fail('Sit at a table to chat.');
  const now = Date.now(), r = (chatRate.get(u.id) || []).filter(x => now - x < 20000);
  if(r.length >= 8 || (r.length && now - r[r.length - 1] < 800)) return fail('Slow down a little.');
  let body;
  if(m.t === 'chat'){
    const text = String(m.text || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    if(!text) return;
    body = { kind: 'text', text };
  } else {
    const allowed = THROWS.includes(m.item) || players.perksFor(players.profile(u.id, membersView(c).all).tier).includes(m.item);
    if(!allowed || typeof m.to !== 'string' || m.to === u.id || club.tableOf(m.to) !== tid) return;
    body = { kind: 'throw', item: m.item, to: m.to };
  }
  r.push(now); chatRate.set(u.id, r);
  const entry = { id: crypto.randomBytes(6).toString('hex'), tid, from: u.id, name: u.name, ts: now, ...body };
  const log = chatLogs.get(tid) || []; log.push(entry); if(log.length > 40) log.shift(); chatLogs.set(tid, log);
  chatTo(c, tid, { t: 'chat', msg: entry });
}
const chatLogFor = (c, ws, tid) => { if(tid) sendWS(ws, { t: 'chatlog', tid, log: c.chatLogs.get(tid) || [] }); };

// a club's own sockets get that club's view (each socket is in one club at a time)
function broadcastClub(c){
  c.memo = null;
  if(c.clubTimer) return;
  c.clubTimer = setTimeout(() => { c.clubTimer = null; for(const ws of sockets) if(ws.user && ws.ctx === c) sendWS(ws, { t: 'club', club: viewFor(c, ws) }); }, 60);
}
// a new email sign-up shows up in its club owner's QR card straight away
joinqr.setOnJoin(j => { const c = clubs.get(j.id); if(c) broadcastClub(c); });
// an account changed (picture, push): every club it may appear in
const broadcastAll = () => clubs.all().forEach(broadcastClub);
function pushTable(c, tid){
  const club = c.club;
  const tb = club.tables.get(tid); if(!tb || clubs.suspended(c.id)) return; // suspended: no table data at all
  const snap = club.snapshot(tb), uids = new Set(snap.seats.filter(Boolean).map(s => s.uid)), field = fieldOf(c);
  for(const ws of sockets){
    if(!ws.user || ws.ctx !== c) continue;
    const seatedHere = !ws.spectator && uids.has(ws.user.id);
    if(!seatedHere && ws.watch !== tid) continue;
    // a seated player also gets their place among everyone still playing (1 = chip leader)
    const mine = ws.spectator ? null : field.chips.get(ws.user.id);
    sendWS(ws, { t: 'table', table: snap, you: seatedHere ? club.cardsFor(tid, ws.user.id) : null, field: { ...field.shown, rank: mine == null ? null : 1 + field.stacks.filter(x => x > mine).length } });
  }
  if(c.id === clubs.MAIN) liveChanged(); // the chip leaders on the other clubs' live card
}
// the whole tournament as every table shows it (players' feedback, 2026-10-21): how many are still playing and at how
// many tables, each player's place among all of them, the chip leader of all tables (the same name and chip count their seat shows), and how many people are watching: everyone looking at a table who is not seated in the tournament, and
// everyone watching from another club. A count only, never who.
function fieldOf(c){
  let players = 0, tables = 0, leader = null;
  const chips = new Map(), tableList = [];
  for(const tb of c.club.tables.values()){
    if(tb.broken) continue;
    tables++;
    let seated = 0, top = null;
    for(const p of tb.g.seats){
      if(!p) continue;
      players++; seated++;
      const n = p.stack;
      chips.set(p.uid, n);
      if(!leader || n > leader.stack) leader = { name: p.name, stack: n, table: tb.n };
      if(!top || n > top.stack) top = { name: p.name, stack: n };
    }
    tableList.push({ n: tb.n, seated, leader: top });
  }
  const watching = new Set();
  for(const ws of sockets) if(ws.user && ws.ctx === c && (ws.spectator || (ws.watch && !c.club.tableOf(ws.user.id)))) watching.add(ws.user.id);
  return { shown: { players, tables, leader, watchers: watching.size }, chips, stacks: [...chips.values()], tableList: tableList.sort((a, b) => a.n - b.n) };
}
const clock = ms => new Date(ms).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: process.env.CLUB_TZ || 'America/Toronto' });
const dayOf = ms => { const tz = process.env.CLUB_TZ || 'America/Toronto', f = d => new Date(d).toLocaleDateString('en-CA', { timeZone: tz });
  const hour = +new Date(ms).toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: tz });
  return f(ms) === f(Date.now()) ? (hour >= 17 ? 'tonight' : 'today') : 'on ' + new Date(ms).toLocaleDateString('en-CA', { weekday: 'long', timeZone: tz }); };
function notice(c, kind, t){
  if(!t) return;
  const members = c.store.values('user:').filter(x => !x.removed).map(x => x.id);
  if(kind === 'open') push.notify(members, { title: t.startAt ? `${t.name} ${dayOf(t.startAt)} at ${clock(t.startAt)}` : `${t.name} is open`, body: 'Registration is open. Tap to join.', tag: 'open-' + t.id, ttl: 6 * 3600 }).catch(() => {});
  if(kind === 'soon'){
    push.notify(t.regs, { title: `${t.name} starts in 15 minutes`, body: "You're registered. Open the app a few minutes early to take your seat.", tag: 'soon-' + t.id, ttl: 900 }).catch(() => {});
    push.notify(members.filter(id => !t.regs.includes(id)), { title: `${t.name} starts in 15 minutes`, body: 'There is still time to join. Tap to register.', tag: 'soon-' + t.id, ttl: 900 }).catch(() => {});
  }
  if(kind === 'start') push.notify(t.regs, { title: `${t.name} is starting!`, body: 'Cards are in the air. Tap to take your seat.', tag: 'start-' + t.id, ttl: 600 }).catch(() => {});
  // a Blindrise game (the Blindrise club's tournament or the Blindrise Open) also reaches the members of every other
  // club (owner request of 2026-10-21): when it opens, and when it starts, so they can watch it live from their club
  if(clubs.ON() && (c.id === clubs.MAIN || c.id === clubs.EVENTS) && (kind === 'open' || kind === 'start')){
    const told = new Set(kind === 'open' ? members : t.regs), rest = everyone().filter(id => !told.has(id));
    const open = c.id === clubs.EVENTS ? 'Registration is open to every club. Tap to register from your club.' : 'Watch it live from your club, on the Live at Blindrise card.';
    if(kind === 'open') push.notify(rest, { title: t.startAt ? `${t.name} ${dayOf(t.startAt)} at ${clock(t.startAt)}` : `${t.name} is open`, body: open, tag: 'open-' + t.id, ttl: 6 * 3600 }).catch(() => {});
    else push.notify(rest, { title: `${t.name} is live now`, body: 'Tap to watch it from your club.', tag: 'start-' + t.id, ttl: 1800 }).catch(() => {});
  }
}
// every account that belongs to a club now
const everyone = () => rootStore.values('user:').filter(x => x && clubs.memberships(x).length).map(x => x.id);
// dominoes in the Blindrise club: everyone is told when a tournament opens and when it starts (once each; see boot)
let domTold = '';
function dominoNotice(m){
  const d = m.domino.card(null), k = d ? d.id + ':' + d.status : '';
  if(!d || k === domTold) return;
  domTold = k;
  if(d.status === 'registering') push.notify(everyone(), { title: `Dominoes: ${d.name}`, body: 'Registration is open. Tap to see it.', tag: 'dom-open-' + d.id, ttl: 6 * 3600 }).catch(() => {});
  if(d.status === 'running') push.notify(everyone(), { title: `Dominoes: ${d.name} has started`, body: 'Tap to watch the board live.', tag: 'dom-start-' + d.id, ttl: 1800 }).catch(() => {});
}
// Is this player connected to this club right now (for disconnect protection, Issue #9)? A closed socket is caught at once
// (see the close handler below). A dropped phone connection can leave its socket looking open for up to a minute, so a
// socket we have not heard from lately is pinged, and one that leaves that ping unanswered for a few seconds counts as gone.
// (tests, FAST=1 only, can shorten that with DC_GONE_MS)
const GONE_MS = process.env.FAST === '1' && +process.env.DC_GONE_MS || 5000, QUIET_MS = Math.min(2000, GONE_MS / 3);
function online(c, uid){
  const now = Date.now();
  for(const ws of sockets){
    if(!ws.user || ws.ctx !== c || ws.spectator || ws.user.id !== uid || ws.readyState !== 1) continue;
    if(!(ws.probed > ws.heard) && now - ws.heard > QUIET_MS){ ws.probed = now; try{ ws.ping(); }catch(e){} }
    if(!(ws.probed > ws.heard) || now - ws.probed < GONE_MS) return true;
  }
  return false;
}
// the Blindrise Open changed: its own members get its view; the other clubs only when what their card shows changed
// (status, counts, times, or who is seated), not on every hand
let eventsSig = '';
function eventsChanged(e){
  broadcastClub(e);
  const t = e.club.T(), seated = [...e.club.tables.values()].filter(x => !x.broken).flatMap(x => x.g.seats.filter(Boolean).map(p => p.uid)).sort().join();
  const sig = t ? JSON.stringify([t.id, t.status, t.regs.length, t.entrants, t.remaining, e.club.lateOpen(), t.name, t.startAt, t.stack, t.levelMin, seated]) : '';
  if(sig !== eventsSig){ eventsSig = sig; for(const x of clubs.all()) if(x !== e) broadcastClub(x); }
}
// domino: every member of the club with the app open gets the new state (one small view each: it marks their own match)
function dominoPush(c){
  if(!DOMINO()) return;
  let board = null;
  for(const ws of sockets) if(ws.ctx === c && ws.user && !clubs.suspended(c.id)){
    if(ws.spectator){ sendWS(ws, { t: 'domino', v: board || (board = dominoBoard(c)) }); continue; }
    const u = c.store.get('user:' + ws.user.id); if(u) sendWS(ws, { t: 'domino', v: c.domino.view(u) });
  }
  if(c.id === clubs.MAIN){ if(clubs.ON()) dominoNotice(c); liveChanged(); }
}
// the match clocks: every few seconds, matches whose time ran out move on (server/domino/match.js tick)
setInterval(() => { if(DOMINO()) for(const c of clubs.all()) if(!clubs.suspended(c.id)) c.domino.sweep(); }, process.env.FAST === '1' ? 300 : 5000).unref();
// every club context (only 'main' with club switching off) gets its own live state and hooks
function wire(c){
  c.memo = null; c.clubTimer = null; c.chatLogs = new Map(); c.linkCache = new Map();
  c.club.setLinker((a, b) => linkReason(c, a, b));
  c.domino.setHooks({ isOwner, canHost: () => hosts(c), changed: () => dominoPush(c) });
  const halted = () => { const d = clubs.ON() && c.id !== clubs.MAIN ? rootStore.get('clubdef:' + c.id) : null; return d && (d.removed || d.suspended) ? (d.removed ? 'This club was cancelled by Blindrise.' : 'This club is suspended by Blindrise.') : null; };
  c.club.setHooks({ halted, hosts: () => hosts(c), isConnected: uid => online(c, uid), onNotice: (kind, t) => notice(c, kind, t), onCoach: (uid, h) => { if(halted()) return; const msg = { t: 'coach', hand: { no: h.no, net: h.net, bb: h.bb, cards: h.cards, weakFold: coach.weakHand(h) && !coach.voluntary(h), played: coach.voluntary(h), notes: h.notes.filter(n => n.kind !== 'info') } }; for(const ws of sockets) if(ws.user && ws.ctx === c && !ws.spectator && ws.user.id === uid) sendWS(ws, msg); }, onClub: () => { if(c.id === clubs.EVENTS) return eventsChanged(c); broadcastClub(c); if(c.id === clubs.MAIN) liveChanged(); }, onTable: tid => pushTable(c, tid), onTableClosed: tid => { c.chatLogs.delete(tid); for(const ws of sockets) if(ws.user && ws.ctx === c) sendWS(ws, { t: 'closed', tid }); broadcastClub(c); } });
}
clubs.get(clubs.MAIN);

wss.on('connection', (ws, req) => {
  if(stopping){ try{ ws.close(4001, 'server moved'); }catch(e){} return; }
  const origin = req.headers.origin;
  let originHost = null; try{ originHost = origin && new URL(origin).host; }catch(e){}
  if(origin && originHost !== req.headers.host){ ws.close(1008, 'origin'); return; }
  sockets.add(ws);
  ws.ip = ipOf(req);
  ws.isAlive = true; ws.heard = Date.now();
  ws.on('pong', () => { ws.isAlive = true; ws.heard = Date.now(); });
  // a closing socket of the player to act gives them their disconnect protection straight away (Issue #9)
  ws.on('close', () => { sockets.delete(ws); if(ws.user && ws.ctx && !ws.spectator) ws.ctx.club.offline(ws.user.id); });
  ws.on('message', raw => {
    ws.heard = Date.now();
    if(stopping) return; // shutting down: no more actions
    let m; try{ m = JSON.parse(raw); }catch(e){ return; }
    if(!m || typeof m !== 'object') return;
    if(m.t === 'hello'){
      const ur = userByToken(m.token);
      if(!ur) return sendWS(ws, { t: 'auth', ok: false });
      // watching a platform game (Issue #25): any member of any club, in the Blindrise club or the Blindrise Open, read-only
      if(clubs.ON() && (m.spectate === clubs.MAIN || m.spectate === clubs.EVENTS)){
        const home = (typeof m.club === 'string' && ctxFor(ur, m.club)) || ctxFor(ur, null);
        if(home){
          const c = clubs.get(m.spectate);
          ws.ctx = c; ws.spectator = true; ws.home = home.id; ws.user = { id: ur.id, name: ur.name, role: 'spectator' }; ws.sess = sha(m.token); ws.watch = null;
          sendWS(ws, { t: 'auth', ok: true });
          sendWS(ws, { t: 'club', club: spectatorView(c, ws.user, ws.home) });
          if(DOMINO() && c.id === clubs.MAIN) sendWS(ws, { t: 'domino', v: dominoBoard(c) });
          return;
        }
      }
      // club switching: the app says which club it shows; an unknown or foreign club falls back to the account's first club
      const c = clubs.ON() ? (typeof m.club === 'string' && ctxFor(ur, m.club)) || ctxFor(ur, null) : clubs.get(clubs.MAIN);
      const u = c && c.store.get('user:' + ur.id);
      // signed in, but in no club any more (the only club was cancelled): say so, so the app can explain
      if(!u) return sendWS(ws, { t: 'auth', ok: false, ...(clubs.ON() && !c ? { reason: 'noclub' } : {}) });
      ws.ctx = c; ws.user = u; ws.sess = sha(m.token); remember(ur, ws.ip, typeof m.device === 'string' ? m.device.slice(0, 40) : ''); sendWS(ws, { t: 'auth', ok: true });
      sendWS(ws, { t: 'club', club: clubView(c, u) });
      if(clubs.suspended(c.id)) return;
      const mine = c.club.tableOf(u.id); if(mine){ pushTable(c, mine); chatLogFor(c, ws, mine); }
      if(DOMINO()) sendWS(ws, { t: 'domino', v: c.domino.view(u) }); // a reconnect gets the whole scorepad state again
      return;
    }
    if(ws.spectator){
      // still signed in, and still a member of some club; then only 'watch', of a table that is playing
      const x = ws.user && store.get('session:' + ws.sess) && store.get('user:' + ws.user.id);
      if(!x || x.removed || !clubs.memberships(x).length){ ws.user = null; return sendWS(ws, { t: 'auth', ok: false }); }
      if(m.t === 'watch'){ const tb = typeof m.tid === 'string' && ws.ctx.club.tables.get(m.tid); ws.watch = tb && !tb.broken ? m.tid : null; if(ws.watch) pushTable(ws.ctx, ws.watch); }
      return;
    }
    const c = ws.ctx, { club, rewards, players, fair, business, opportunity } = c || {};
    const u = ws.user && store.get('session:' + ws.sess) && c.store.get('user:' + ws.user.id);
    if(!u || u.removed) return sendWS(ws, { t: 'auth', ok: false });
    ws.user = u;
    if(clubs.suspended(c.id)) return; // a suspended club: nothing can be done in it (the app shows the notice)
    try{
      if(c.id === clubs.EVENTS && ['skillq', 'claim', 'addReward', 'removeReward', 'redeemStatus'].includes(m.t)) throw new Error('The Blindrise Open has no rewards.');
      switch(m.t){
        case 'watch': ws.watch = typeof m.tid === 'string' ? m.tid : null; if(ws.watch){ pushTable(c, ws.watch); chatLogFor(c, ws, ws.watch); } break;
        case 'act': club.act(u.id, m); break;
        case 'extend': club.extend(u.id); break;
        case 'show': club.show(u.id, m); break;
        case 'chat': case 'throw': chat(c, ws, u, m); break;
        case 'fair': { const id = String(m.id || ''), cur = club.T(), h = c.store.get('history:' + id);
          const t = cur && cur.id === id ? cur : h ? { ...h, status: 'finished' } : null;
          sendWS(ws, { t: 'fair', report: t ? fair.report(t) : null }); } break;
        case 'clubs': own(u); c.store.set('settings', { ...(c.store.get('settings') || {}), clubsOn: !!m.on }); broadcastClub(c); break;
        case 'chatOff': own(u); c.store.set('settings', { ...(c.store.get('settings') || {}), chatOff: !!m.off }); broadcastClub(c); break;
        case 'mute': own(u); { const x = c.store.get('user:' + m.uid); if(x && x.role !== 'owner') c.store.set('user:' + x.id, { ...x, muted: !!m.muted }); broadcastClub(c); } break;
        case 'back': club.back(u.id); break;
        case 'join': club.join(u.id); break;
        case 'hands': sendWS(ws, { t: 'hands', hands: club.handsFor(u.id) }); break;
        case 'report': { const h = c.store.get('history:' + String(m.id || '')); if(!h) break;
          const me = h.results.find(r => r.uid === u.id);
          const hands = club.handsFor(u.id).filter(x => x.ts >= (h.startedAt || 0) - 60000 && x.ts <= h.endedAt + 60000);
          sendWS(ws, { t: 'report', report: { id: h.id, name: h.name, at: h.endedAt, entrants: h.entrants, place: me ? me.place : null, pts: me ? me.pts : 0, ...(coach.reportCard(hands) || { hands: 0 }) } }); } break;
        case 'profile': { const x = c.store.get('user:' + m.uid); if(x && !x.removed) sendWS(ws, { t: 'profile', profile: { ...players.profile(x.id, membersView(c).all), name: x.name, av: x.av || null, since: x.createdAt, perks: players.perksFor(players.profile(x.id, membersView(c).all).tier) } }); } break;
        // a picture belongs to the shared account, so only the main organizer can clear one
        case 'avatarClear': own(u); if(c.id !== clubs.MAIN) throw new Error('Only the Blindrise organizer can remove a picture.'); { const x = c.store.get('user:' + m.uid); if(x){ c.store.set('user:' + x.id, players.setAvatar(x, { kind: 'none' })); c.memo = null; broadcastAll(); } } break;
        case 'leave': club.leave(u.id); break;
        // owner controls
        case 'create': own(u); if(!hosts(c)) throw new Error(NO_HOST); club.create(m); break;
        case 'edit': own(u); if(!hosts(c)) throw new Error(NO_HOST); club.edit(m); break;
        case 'start': own(u); if(!hosts(c)) throw new Error(NO_HOST); club.start(); break;
        case 'cancel': own(u); club.cancel(); break;
        case 'pause': own(u); club.pause(); break;
        case 'resume': own(u); club.unpause(); break;
        case 'kick': own(u); { const t = club.T(); if(t && t.status === 'registering') c.store.set('tourney', { ...t, regs: t.regs.filter(x => x !== m.uid) }); broadcastClub(c); } break;
        case 'household': own(u); {
          const store = c.store;
          const x = store.get('user:' + m.uid), y = m.with ? store.get('user:' + m.with) : null;
          if(!x) break;
          if(!y){ store.set('user:' + x.id, { ...x, household: null }); }
          else { const gid = y.household || x.household || ('h' + Date.now().toString(36)); store.set('user:' + x.id, { ...x, household: gid }); store.set('user:' + y.id, { ...store.get('user:' + y.id), household: gid }); }
          c.linkCache.clear(); broadcastClub(c);
        } break;
        case 'skillq': sendWS(ws, { t: 'skillq', rid: m.rid, q: rewards.question(u.id, String(m.rid || '')) }); break;
        case 'claim': rewards.claim(u.id, String(m.rid || ''), m.answer); sendWS(ws, { t: 'claimed' }); broadcastClub(c); break;
        case 'addReward': own(u); rewards.addReward(m); broadcastClub(c); break;
        case 'removeReward': own(u); rewards.removeReward(String(m.id || '')); broadcastClub(c); break;
        case 'redeemStatus': own(u); rewards.setStatus(String(m.id || ''), m.status); broadcastClub(c); break;
        case 'invite': { const code = inviteCode(c, u, !!m.group); sendWS(ws, { t: 'invite', code, group: !isOwner(u) || !!m.group, max: c.store.get('invite:' + code).max || 1 }); broadcastClub(c); } break;
        case 'membersInvite': own(u); c.store.set('settings', { ...(c.store.get('settings') || {}), membersInvite: !!m.on }); broadcastClub(c); break;
        case 'revoke': own(u); { const inv = c.store.get('invite:' + m.code); if(inv) c.store.set('invite:' + m.code, { ...inv, revoked: true }); broadcastClub(c); } break;
        // removing someone from the main club closes their account (as before); removing them from another club only ends
        // that membership: their name, PIN and other clubs stay, and only this club's open screens are closed
        case 'remove': own(u); { const store = c.store, x = store.get('user:' + m.uid); if(x && x.role !== 'owner'){ store.set('user:' + x.id, { ...x, removed: true }); if(c.id === clubs.MAIN){ store.del('name:' + x.name.toLowerCase()); revokeSessions(x.id); } else leaveClub(c, x.id); club.leave(x.id); business.removeUser(x.id); opportunity.removeUser(x.id); } broadcastClub(c); } break;
      }
    }catch(e){ sendWS(ws, { t: 'error', error: e.message }); }
  });
});
function own(u){ if(!isOwner(u)) throw new Error('Only the club owner can do that.'); }
// uid left out: everyone in that club (it was cancelled)
function leaveClub(c, uid){ for(const ws of sockets) if(ws.user && ws.ctx === c && (uid === undefined || ws.user.id === uid)){ ws.user = null; try{ ws.close(4004, 'removed from club'); }catch(e){} } }
setInterval(() => { for(const ws of sockets){ if(!ws.isAlive){ ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000);

// Staging must never point at the production database: refuse to start if it does.
const PROD_DB_HOST = 'dpg-db81kuom7kps73cmh9dg-a';
// The quiet-luxury design (owner GO for preview/development only, 2026-10-21): UI_QUIET=1 marks the page and adds
// public/quiet.css, whose rules all sit under html[data-ui="quiet"]. Unset, the page is byte for byte what it was.
// Never on the production database, whatever the environment says.
const quietUI = () => process.env.UI_QUIET === '1' && !String(process.env.DATABASE_URL || '').includes(PROD_DB_HOST);
const quietPage = buf => Buffer.from(String(buf).replace('<html lang="en">', '<html lang="en" data-ui="quiet">').replace('</head>', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">\n<link rel="stylesheet" href="/quiet.css">\n</head>'));
if(process.env.UI_QUIET === '1') console.log(quietUI() ? 'UI_QUIET: the quiet design is on (preview)' : 'UI_QUIET ignored: this is the production database');
// The media lab (owner GO 2026-10-21: preview only, local storage, test data): MEDIA_LAB=1, never on the production database
const media = require('./media').create({ prodHost: PROD_DB_HOST });
// who is asking, for the media lab: the signed-in member and the club they are showing (as the JSON API decides it)
function mediaWho(req){
  const ur = userByToken(req.headers.authorization?.replace(/^Bearer /, '')); if(!ur) return {};
  const c = clubs.ON() ? ctxFor(ur, req.headers['x-club']) : clubs.get(clubs.MAIN);
  if(!c || clubs.suspended(c.id)) return {};
  return { u: clubs.ON() ? c.store.get('user:' + ur.id) || null : ur, club: c };
}
if(process.env.MEDIA_LAB === '1') console.log(media.ON() ? 'MEDIA_LAB: the media lab is on (preview, local storage)' : 'MEDIA_LAB ignored: this is the production database');
if(process.env.STAGING === '1' && String(process.env.DATABASE_URL || '').includes(PROD_DB_HOST)){
  console.error('STAGING=1 but DATABASE_URL points at the production database. Refusing to start.');
  process.exit(1);
}

// ---------- single writer / shutdown ----------
// Render sent SIGTERM: stop the game, save once, tell clients to reconnect (4001 lands them on the new instance) and
// exit well inside Render's 30 s grace.
// A newer instance took the lease (deploy): stop the game and freeze the store the same way, but do NOT exit. Render
// restarts a process that exits, even inside an instance it is about to retire, and a restarted old process would
// claim the lease back from the new one (lease ping-pong, evidence 2026-10-16 item 02). Instead stay alive as a
// fenced-off husk: every request gets 503, /healthz is 503, websockets are closed with 4001, nothing is written and
// the lease is never claimed again. The process only exits on SIGTERM, when Render retires the old instance.
let ready = false, stopping = false, fenced = false;
async function shutdown(why, leaseLost){
  if(stopping) return; stopping = true; fenced = !!leaseLost;
  console.log('shutting down:', why);
  for(const c of clubs.all()) c.club.stopAll(); store.freeze();
  const saved = leaseLost ? false : await Promise.race([store.flush(), new Promise(r => setTimeout(r, 10000, false))]);
  console.log('final save', saved ? 'done' : 'skipped or incomplete', JSON.stringify(store.health()));
  for(const ws of sockets) try{ ws.close(4001, 'server moved'); }catch(e){}
  if(leaseLost){
    console.log('lease lost: staying up and answering 503 until SIGTERM; this process will not claim the lease again');
    setInterval(() => {}, 60000); // keep the event loop alive even if nothing else is listening
    if(!server.listening) server.listen(PORT);
    return;
  }
  server.close();
  setTimeout(() => process.exit(0), 300);
}
// SIGTERM on a fenced process: nothing to save (it lost the lease and wrote nothing since), so exit at once
const onSignal = sig => { if(fenced){ console.log(sig + ' after lease loss: exiting'); process.exit(0); } shutdown(sig); };
store.onLost(e => shutdown(e.message, true));
process.on('SIGTERM', () => onSignal('SIGTERM'));
process.on('SIGINT', () => onSignal('SIGINT'));

(async () => {
  await store.init();
  // Staging only: on an empty database, create a test director and fake members so there is something to test with.
  if(process.env.STAGING === '1' && !owner() && process.env.OWNER_CODE){
    try{
      const tok = api.setup({ code: process.env.OWNER_CODE, name: 'Test Director', pin: '246810', agree: true }).token, dir = userByToken(tok);
      for(let i = 1; i <= 12; i++) api.redeem({ code: inviteCode(clubs.get(clubs.MAIN), dir), name: 'Test Player ' + String(i).padStart(2, '0'), pin: '1357' + String(i % 10).repeat(2), agree: true });
      console.log('staging: seeded Test Director and 12 fake members');
    }catch(e){ console.error('staging seed failed', e.message); }
  }
  // Staging only: a few fake demo businesses for the fake Test Player accounts (once; never in production)
  if(process.env.STAGING === '1'){ const { business, opportunity } = clubs.get(clubs.MAIN); const n = business.seedDemo(); if(n) console.log(`staging: seeded ${n} fake demo businesses`); const k = opportunity.seedDemo(); if(k) console.log(`staging: seeded ${k} fake demo opportunity listings`); }
  if(stopping) return;
  { const d = DOMINO() && clubs.get(clubs.MAIN).domino.card(null); if(d) domTold = d.id + ':' + d.status; } // no second notice after a restart
  for(const c of clubs.all()) if(c.club.resume()) console.log(c.id === clubs.MAIN ? 'resumed running tournament' : `resumed running tournament in club ${c.id}`);
  server.listen(PORT, () => { ready = true; console.log(`Blindrise poker club on :${PORT}`); });
  if(!process.env.NO_BEACON) clubs.get(clubs.MAIN).fair.probe();
})();
module.exports = { server };
