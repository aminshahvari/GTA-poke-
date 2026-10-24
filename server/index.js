const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
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
// the onboarding funnel (Issue #39): counts only, board design only; see server/funnel.js
const funnel = require('./funnel')({ store, clubs, on: () => boardUI() });

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
let seeding = false;   // the staging seed is creating its fake members
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
    // the board design's first visit (UI_BOARD only): a new account sees the welcome once (onb 1), then the First steps
    // card on Home until it is done or dismissed (onb 2); 3 is finished. Off, nothing is stored.
    // The funnel counts the account as a new member and keeps its one field (fn) for counting each step once.
    if(boardUI() && !seeding) store.set('user:' + u.id, { ...store.get('user:' + u.id), onb: 1, fn: funnel.start(c, u) });
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
  invite(_, u, c){ const code = inviteCode(c, u); if(u) funnel.mark(u.id, 'invite', c); return { code }; },
  status(){ return clubs.ON() ? { hasOwner: !!owner(), clubSwitching: true } : { hasOwner: !!owner() }; },
  pushKey(){ return { key: push.publicKey() }; },
  push(sub, u){ if(!u) throw new Error('Sign in first.'); push.subscribe(u.id, sub); broadcastAll(); return { ok: true }; },
  unpush({ endpoint }, u){ if(u) push.unsubscribe(u.id, String(endpoint || '')); return { ok: true }; },
  // your own picture: a gallery avatar or a small photo the phone has already shrunk
  avatar(a, u){
    if(!u) throw new Error('Sign in first.');
    store.set('user:' + u.id, clubs.get(clubs.MAIN).players.setAvatar(store.get('user:' + u.id), a)); // pictures are part of the shared account
    if((store.get('user:' + u.id) || {}).av) funnel.mark(u.id, 'picture', null);
    broadcastAll();
    return { ok: true };
  },
  // ---------- the board's player profile sheet (UI_BOARD only, Step-0 spec §8, phase B7): see server/connect.js ----------
  // With the board off every one of these answers 404, as an unknown call does.
  // the member's own choices (account-level: one set for every club): Show my photo, Show About and Business at tables,
  // Open to Connect, and the About fields. All off until the member turns them on.
  profilePrefs(d, u){
    boardOnly();
    if(!u) throw Object.assign(new Error('Sign in first.'), { status: 401 });
    const x = store.get('user:' + u.id), pro = clubs.get(clubs.MAIN).connect.cleanPrefs(d, x);
    store.set('user:' + u.id, { ...x, pro });
    broadcastAll(); // (the members list carries the picture each member may see)
    return { ok: true, pro };
  },
  // one member as the caller may see them: what the member chose to show, and nothing else
  memberCard(d, u, c){
    boardOnly();
    return c.connect.card(d, u, { exchange: c.id !== clubs.EVENTS && !clubsClosedFor(c, u), events: c.id === clubs.EVENTS });
  },
  connSend(d, u, c){ return connCall('connSend', d, u, c); },
  connReply(d, u, c){ return connCall('connReply', d, u, c); },
  connWithdraw(d, u, c){ return connCall('connWithdraw', d, u, c); },
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
      if(data.action === 'suspend'){ c.club.pause(); const S = {}, json = new Map(); for(const ws of sockets) if(ws.ctx === c && ws.user) sendClub(ws, viewFor(c, ws, S), json, false); }
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
const boardOnly = () => { if(!boardUI()) throw Object.assign(new Error('Not found'), { status: 404 }); };
// connection requests: board only, and never in the Blindrise Open (members of every club, no Exchange); both members
// get their new club view
function connCall(name, d, u, c){
  boardOnly();
  if(c.id === clubs.EVENTS) throw Object.assign(new Error('Not found'), { status: 404 });
  const out = c.connect.api[name](d, u);
  broadcastClub(c);
  return out;
}
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
const ACCOUNT_API = ['avatar', 'profilePrefs', 'push', 'unpush', 'joinInvite', 'createClub', 'joinInfo', 'joinClub', 'clubModerate', 'platformPost', 'platformUnpost', 'eventsOpen', 'eventLeave'];
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
  if(t && (t.status === 'registering' || (t.status === 'running' && c.club.lateOpen()))) try{
    c.club.join(uid);
    // board design: the account record says this invite signed them up for this game (invReg, '<club>/<tournament>'), so
    // the Next game card and welcome card 3 can say so on every device; cleared when they unregister or are taken off
    if(boardUI()){ const x = rootStore.get('user:' + uid); if(x) rootStore.set('user:' + uid, { ...x, invReg: c.id + '/' + t.id }); funnel.mark(uid, 'game', c); }
  }catch(e){}
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
  // media-src data: is for the tiny silent video that keeps phone screens on at the table (app.js noSleep).
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' data:; connect-src 'self' wss:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
};
// Business Club data is for signed-in members only and must never be indexed
const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
function send(res, code, body, type = 'application/json', extra){
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
// App files (not /vendor/) go out brotli- or gzip-compressed when the browser accepts it: about 670 KB of
// script and style becomes about 150 KB, which is most of a first visit's wait on a phone.
// Each file is compressed once per version (ETag) in the background and kept in memory, so a request costs no compression.
// JSON API answers stay uncompressed: they are small, made per request, and can carry tokens next to text the caller sent.
const PACK = new Set(['.js', '.css', '.html', '.svg', '.json', '.webmanifest']);
const packed = new Map(); // file path -> { tag, br: Promise<Buffer|null>, gzip: Promise<Buffer|null> }
function packedFor(full, buf, tag){
  let p = packed.get(full);
  if(!p || p.tag !== tag){
    const z = (fn, opt) => new Promise(ok => fn(buf, opt, (e, out) => ok(e || out.length >= buf.length ? null : out)));
    const C = zlib.constants;
    p = { tag, br: z(zlib.brotliCompress, { params: { [C.BROTLI_PARAM_QUALITY]: 11, [C.BROTLI_PARAM_MODE]: C.BROTLI_MODE_TEXT, [C.BROTLI_PARAM_SIZE_HINT]: buf.length } }), gzip: z(zlib.gzip, { level: 9 }) };
    packed.set(full, p);
  }
  return p;
}
// the encodings the browser takes, best first ("br", then "gzip"); q=0 refuses one
function encodingsFor(req){
  const ok = new Set();
  for(const part of String(req.headers['accept-encoding'] || '').toLowerCase().split(',')){
    const [name, ...params] = part.trim().split(';');
    const q = params.map(x => /^\s*q=([\d.]+)\s*$/.exec(x)).find(Boolean);
    if(name && (!q || Number(q[1]) > 0)) ok.add(name.trim());
  }
  return ['br', 'gzip'].filter(e => ok.has(e) || ok.has('*'));
}
const tagFor = (tag, enc) => enc ? tag.slice(0, -1) + '-' + (enc === 'gzip' ? 'gz' : enc) + '"' : tag;
// compress the app files ahead of the first visitor (in the background; requests that come first wait for it)
function warmPack(){
  const files = [path.join(__dirname, 'engine.js')];
  try{ for(const f of fs.readdirSync(PUBLIC)) if(PACK.has(path.extname(f))) files.push(path.join(PUBLIC, f)); }catch(e){}
  for(const full of files) fs.readFile(full, (err, buf) => { if(!err) packedFor(full, buf, '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"'); });
}
warmPack();
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
        const out = typeof fn === 'string' ? clubApi(fn, c)(data, u) : fn(data, u, c, clientIp(req));
        if(name === 'bizPublish' && u && data.on === true && c.business.listed(u.id)) funnel.mark(u.id, 'business', c);   // (board only)
        send(res, 200, out, undefined, extra);
      }catch(e){ if(['/api/setup', '/api/redeem', '/api/login', '/api/resetOwner', '/api/joinClub', '/api/createClub'].includes(url.pathname)){ recordFailure(ip); if(acct) recordFailure(acct); if(RECOVERY.includes(url.pathname) && /setup code/.test(e.message)){ recordFailure('rec' + ip); recordFailure('rec:all'); } } send(res, [401, 403, 404, 409, 429].includes(e.status) ? e.status : 400, { error: e.message || 'Something went wrong.', ...(e.status === 409 && e.current != null ? { current: e.current } : {}) }, undefined, extra); }
    });
    return;
  }
  if(req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  const av = /^\/avatar\/(u[0-9a-f]{12})$/.exec(url.pathname);
  // the board (UI_BOARD only, spec §8, Muse condition 1): a photo needs a signed-in member's token (sent by fetch, as the
  // Exchange's logos are), and goes to another member only if its owner turned on "Show my photo". Off, as before.
  if(av && boardUI()){
    const vr = userByToken(req.headers.authorization?.replace(/^Bearer /, ''));
    if(!vr) return send(res, 401, 'Not found', 'text/plain', NOINDEX);
    const x = store.get('user:' + av[1]), may = !!x && !x.removed && (x.id === vr.id || clubs.get(clubs.MAIN).connect.prefsOf(x).photo);
    const buf = may && clubs.get(clubs.MAIN).players.photo(av[1]); if(!buf) return send(res, 404, 'Not found', 'text/plain', NOINDEX);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', Vary: 'Authorization', ...SECURITY, ...NOINDEX }); return res.end(buf);
  }
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
    // the app asks for /bizlogo/<uid>?v=<logoV>: a new logo is a new URL, so the browser may keep this one for a day
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', Vary: 'Authorization, X-Club', ...SECURITY, ...NOINDEX }); return res.end(r.buf);
  }
  let file = url.pathname === '/lab/media' ? 'lab/media.html' : url.pathname === '/' || url.pathname === '/login' || url.pathname.startsWith('/join/') ? 'index.html' : url.pathname.slice(1);
  // /engine.js is the shared rules file in server/; it is served like any app file
  const full = file === 'engine.js' ? path.join(__dirname, 'engine.js') : path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if(file !== 'engine.js' && !full.startsWith(PUBLIC)) return notFound(res, file);
  // pinned third-party files (public/vendor/<name>-<version>/): never change at a given path, so phones may keep them for a year.
  // eng.traineddata.gz goes out as plain bytes with no Content-Encoding; the card reader unzips it itself.
  const cache = url.pathname.startsWith('/vendor/') ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : undefined;
  fs.readFile(full, (err, buf) => {
    if(err) return notFound(res, file);
    if(file === 'index.html' && boardUI()) buf = shellPage(boardPage(buf));
    else if(file === 'index.html' && quietUI()) buf = shellPage(quietPage(buf));
    // app files: the phone keeps a copy but asks every time ("no-cache"); an unchanged file costs a 304 instead of the whole file
    const tag = '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"';
    const type = TYPES[path.extname(full)] || 'application/octet-stream';
    if(cache) return send(res, 200, buf, type, cache);
    // app files: brotli or gzip when the browser takes it; each encoding has its own ETag ("<tag>-br", "<tag>-gz")
    const p = PACK.has(path.extname(full)) && buf.length > 1024 ? packedFor(full, buf, tag) : null;
    const encs = p ? encodingsFor(req) : [];
    (async () => {
      let enc = null, body = buf;
      for(const e of encs){ const out = await p[e]; if(out){ enc = e; body = out; break; } }
      const fresh = { 'Cache-Control': 'no-cache', ETag: tagFor(tag, enc), ...(p ? { Vary: 'Accept-Encoding' } : {}) };
      // the media lab plays the chosen clip from the phone's memory (a blob: link) before preparing it; only that page may
      if(file === 'lab/media.html') fresh['Content-Security-Policy'] = SECURITY['Content-Security-Policy'].replace("media-src 'self' data:", "media-src 'self' data: blob:");
      // an unchanged file answers 304, whichever encoding the browser's copy came in
      const seen = String(req.headers['if-none-match'] || '').split(',').map(t => t.trim().replace(/^W\//, ''));
      if(seen.some(t => t === tag || t === tagFor(tag, 'br') || t === tagFor(tag, 'gzip'))){ res.writeHead(304, { ...SECURITY, ...fresh }); return res.end(); }
      send(res, 200, body, type, enc ? { ...fresh, 'Content-Encoding': enc } : fresh);
    })().catch(() => { if(!res.headersSent) send(res, 500, 'Server error', 'text/plain'); });
  });
});

// ---------- realtime ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const sockets = new Set();
// ---------- the connection log (2026-10-24: two players' screens froze at a live game and nothing on the server said
// when their connections went quiet, closed or came back). One short line per socket in (signed in), socket out (with
// its close code and how long it lasted), ping left unanswered (the seat shows Disconnected), socket ended by the
// server, and act received with what became of it; plus one summary line a minute while anyone is connected.
// Account ids, club ids, tables and hand numbers only: never names, PINs, tokens or IP addresses. CONN_LOG=0 turns it off.
// About 40 players: a few hundred act lines and one summary a minute; the app's heartbeat ('hb') is never logged.
const CONN_LOG = process.env.CONN_LOG !== '0';
const clog = line => { if(CONN_LOG) console.log(line); };
let sockSeq = 0;
const cstat = () => ({ conns: 0, drops: 0, gone: 0, kills: 0, acts: 0, applied: 0, stale: 0, rejected: 0, handle: [], rtt: [], art: [] });
let CS = cstat();
const handling = new Map();   // tid -> { at, s }: an act that was applied, until that table's next update goes out
const sample = (a, v) => { if(Number.isFinite(v) && v >= 0 && v < 120000 && a.length < 5000) a.push(Math.round(v)); };
const pct = (a, q) => { if(!a.length) return '-'; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
const sockTag = ws => `s=${ws.sid} uid=${ws.user ? ws.user.id : '-'} club=${ws.ctx ? ws.ctx.id : '-'}`;
// where a player is right now: table, hand and the turn's seq ('-' when not seated)
function spotOf(c, uid){
  const tid = c && c.club.tableOf(uid), tb = tid && c.club.tables.get(tid);
  return tb ? `tid=${tid} hand=${tb.g.hand ? tb.g.hand.no : tb.g.handNo} seq=${tb.acting ? tb.acting.seq : tb.seq}` : 'tid=-';
}
setInterval(() => {
  const open = [...sockets].filter(ws => ws.user).length, x = CS;
  CS = cstat();
  if(!open && !x.conns && !x.drops && !x.acts) return;
  clog(`ws min open=${open} in=${x.conns} out=${x.drops} gone=${x.gone} kill=${x.kills} acts=${x.acts} applied=${x.applied} stale=${x.stale} rejected=${x.rejected}`
    + ` handle_ms_p50=${pct(x.handle, .5)} p95=${pct(x.handle, .95)} hb_rtt_ms_p50=${pct(x.rtt, .5)} p95=${pct(x.rtt, .95)} act_rtt_ms_p50=${pct(x.art, .5)} p95=${pct(x.art, .95)}`);
}, process.env.FAST === '1' && +process.env.CONN_SUMMARY_MS || 60000).unref();
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
    // (the board: a photo only if its member turned on "Show my photo"; their own comes to them in me.av)
    return { id: x.id, name: x.name, role: x.role, createdAt: x.createdAt, invitedBy: x.invitedBy || null, av: boardUI() ? c.connect.shownAv(x) : x.av || null, tier: pr.tier, color: pr.color, score: pr.score };
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
      startedAt: t.startedAt || null, breaks: club.breaksOn(), breakEvery: club.BREAK_EVERY, breakMin: t.breakMin || 5, breakUntil: club.onBreak(t) ? t.breakUntil : null, breakAt: club.onBreak(t) ? t.breakAt || null : null, breakPending: !!t.breakPending && !t.paused,
      pausedBreakLeft: t.paused ? t.pausedBreakLeft || 0 : 0, sponsor: c.business.sponsorCard(t.sponsor), sponsorSec: t.sponsorSec || 8, prize: t.prize || '' }; };
// The board's Home (UI_BOARD only, Step-0 spec §7, phase B6): who sits in each seat of this club's tables, so a live
// table's mini felt shows its seated avatars. Seat order, null for an empty seat. A member of this club gets it (the
// same seats any member sees when they tap Watch); a spectator from another club never does (spectatorView).
const seatsOf = club => Object.fromEntries([...club.tables.values()].filter(x => !x.broken).map(x => [x.tid, x.g.seats.map(p => p ? p.uid : null)]));
// S: what one club update shares between its sockets (built for the first socket that needs it, then reused, so the
// same object goes into every view and is turned into JSON once; see clubOut)
const once = (S, k, f) => k in S ? S[k] : (S[k] = f());
function clubView(c, u, S = {}){
  if(clubs.ON() && clubs.suspended(c.id)) return suspendedView(c, u);
  const { store, club, rewards } = c;
  const t = club.T();
  const { members, history } = once(S, 'mv', () => membersView(c));
  const invites = once(S, 'invs', () => store.values('invite:')), users = once(S, 'users', () => store.values('user:'));
  const view = {
    me: { id: u.id, name: u.name, owner: isOwner(u), ...(boardUI() && u.onb ? { onb: u.onb } : {}), ...(boardUI() && t && u.invReg === c.id + '/' + t.id && t.regs.includes(u.id) ? { byInvite: true } : {}), ...(boardUI() ? boardMe(u) : {}) },
    tourney: t ? once(S, 'tourney', () => tourneyOf(c, t)) : null,
    ...(isOwner(u) && hosts(c) ? { sponsors: once(S, 'sponsors', () => c.business.sponsorOptions()) } : {}), hosts: hosts(c),
    tables: once(S, 'tables', () => club.tablesSummary()), myTable: club.tableOf(u.id), ...(boardUI() ? { seats: once(S, 'seats', () => seatsOf(club)) } : {}),
    // who invited whom is for the owner only: a member's payload carries no inviter for anyone (Muse P10)
    members: isOwner(u) ? members : once(S, 'mmembers', () => members.map(m => m.invitedBy ? { ...m, invitedBy: null } : m)),
    history, now: Date.now(), shop: c.id === clubs.EVENTS ? null : rewards.view(u.id, isOwner(u)), // no rewards shop in the Blindrise Open
    features: once(S, 'features', () => ({ clubs: clubsOn(c), ...(club.gp() ? { tableExtras: true } : {}), ...(club.breaksOn() ? { breaks: true } : {}) })), chatOff: !!(store.get('settings') || {}).chatOff, muted: !!u.muted, version: VERSION,
    pushOn: push.hasPush(u.id), membersInvite: membersInvite(c),
    invitedCount: once(S, 'invited', () => { const n = new Map(); users.forEach(x => { if(!x.removed && x.invitedBy) n.set(x.invitedBy, (n.get(x.invitedBy) || 0) + 1); }); return n; }).get(u.id) || 0,
    myInvite: (() => { const i = invites.find(x => x.by === u.id && x.multi && openInvite(x)); return i ? { used: (i.uses || []).length, max: i.max, expiresAt: i.expiresAt } : null; })()
  };
  // the board's connection requests (B7): this member's own, built for them alone (never one object for everyone)
  if(boardUI() && c.id !== clubs.EVENTS) view.conn = c.connect.view(u.id, once(S, 'conns', () => c.connect.all()));
  if(isOwner(u)){
    view.invites = invites.filter(openInvite)
      .map(i => ({ code: i.code, createdAt: i.createdAt, multi: !!i.multi, used: (i.uses || []).length, max: i.max, expiresAt: i.expiresAt, by: i.by }));
    view.conflicts = once(S, 'conflicts', () => conflictPairs(c));
    const hh = Object.fromEntries(users.filter(x => !x.removed && x.household).map(x => [x.id, x.household]));
    view.households = hh;
    view.mutedIds = users.filter(x => !x.removed && x.muted).map(x => x.id);
    // the onboarding funnel (board design only): counts per week of joining, no names
    if(boardUI() && c.id !== clubs.EVENTS) view.funnel = funnel.view(c) || [];
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
    view.blindrise = once(S, 'feed', () => platform.feed());
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
// the board (B7): the member's own picture and choices, read from the account as it is now (the socket's copy can be
// older than a change made since), for this member only
function boardMe(u){
  const x = rootStore.get('user:' + u.id) || u;
  return { av: x.av || null, pro: clubs.get(clubs.MAIN).connect.prefsOf(x) };
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
function spectatorView(c, u, home, S = {}){
  const t = c.club.T(), club = c.club;
  return { spectate: true, me: { id: u.id, name: u.name, owner: false }, clubSwitching: true, club: { id: c.id, name: clubs.def(c.id).name }, home: { id: home, name: (clubs.def(home) || {}).name || 'your club' },
    clubs: [], tourney: t ? once(S, 'stourney', () => spectatorTourney(c, t)) : null, hosts: false,
    tables: once(S, 'tables', () => club.tablesSummary()), myTable: null, members: [], history: [], now: Date.now(), shop: null,
    features: { clubs: false, ...(club.gp() ? { tableExtras: true } : {}), ...(club.breaksOn() ? { breaks: true } : {}) }, chatOff: true, muted: true, version: VERSION,
    ...(DOMINO() && c.id === clubs.MAIN ? { domino: true } : {}) };
}
const spectatorTourney = (c, t) => ({ ...tourneyOf(c, t), regs: [], regCount: t.regs.length, note: null, sponsor: null, prize: '' });
const viewFor = (c, ws, S) => ws.spectator ? spectatorView(c, ws.user, ws.home, S) : clubView(c, ws.user, S);
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

// ---------- the club view on the wire ----------
// (2026-10-24, measured: the whole club view, every member and up to 200 past tournaments, went to every socket of the
// club on every hand that ended at any table, built again for each socket; with more tables that grew about with the
// cube of the table count, and every phone redrew its table for it.) Now:
// - an app that says so in its hello (delta: 1) gets the whole view when it connects, and after that only the parts that
//   changed, by top-level key: { t: 'club', d: 1, club: { the changed keys }, gone: [keys no longer in the view] }.
//   When nothing changed, nothing is sent. A socket that does not say so (an older app still cached on a phone, a
//   script) gets the whole view each time, as before.
// - a hand that ended sends only what play changes (the tournament's places, players left and level, the tables, which
//   table is mine, the owner's seating conflicts), at most once every PLAY_MS. The members list goes with it only when
//   a tier the app shows (a ring, a badge) moved for a player of that hand; the skill score inside it, which no screen
//   reads from this list, follows with the next whole update.
// - everything else (registration, a level or a break, settings, members, results) is a whole update, gathered for
//   60 ms as before, and the parts every socket shares are built once for all of them.
const PLAY_MS = process.env.FAST === '1' ? (+process.env.CLUB_PLAY_MS || 250) : 2500;
function broadcastClub(c){
  c.memo = null;
  clearTimeout(c.playTimer); c.playTimer = null; // (a whole update carries what play changed too)
  if(c.clubTimer) return;
  c.clubTimer = setTimeout(() => { c.clubTimer = null; clubOut(c, false); }, 60);
}
function playClub(c, uids){
  (uids || []).forEach(x => c.playUids.add(x));
  if(c.clubTimer || c.playTimer) return;
  c.playTimer = setTimeout(() => { c.playTimer = null; c.playAt = Date.now(); clubOut(c, true); }, Math.max(60, c.playAt + PLAY_MS - Date.now()));
}
// did a tier the app shows move for a player of the hands just played (their stats changed)? Then the members list goes too.
function tiersMoved(c){
  const was = c.sentMembers, uids = [...c.playUids]; c.playUids.clear();
  if(!was) return true;
  return uids.some(uid => { const m = was.list.find(x => x.id === uid); if(!m) return false; const p = c.players.profile(uid, was.all); return p.tier !== m.tier || p.color !== m.color; });
}
function clubOut(c, play){
  const S = {}, json = new Map();
  if(play && clubs.ON() && clubs.suspended(c.id)) play = false;
  if(play && tiersMoved(c)){ c.memo = null; play = false; }
  if(!play) c.playUids.clear();
  for(const ws of sockets){
    if(!ws.user || ws.ctx !== c) continue;
    if(play && ws.delta) sendClub(ws, playView(c, ws, S), json, true);
    else sendClub(ws, viewFor(c, ws, S), json, false);
  }
  // (what the apps that ask for changes now have: only a whole update sends them the members list)
  if(!play && S.mv) c.sentMembers = { list: S.mv.members, all: S.mv.all };
}
// what a hand that ended can change in the view (the same values the whole view has for these keys)
function playView(c, ws, S){
  const club = c.club, t = club.T(), u = ws.user;
  if(ws.spectator) return { tourney: t ? once(S, 'stourney', () => spectatorTourney(c, t)) : null, tables: once(S, 'tables', () => club.tablesSummary()), now: Date.now() };
  return { tourney: t ? once(S, 'tourney', () => tourneyOf(c, t)) : null, tables: once(S, 'tables', () => club.tablesSummary()), myTable: club.tableOf(u.id),
    ...(boardUI() ? { seats: once(S, 'seats', () => seatsOf(club)) } : {}), ...(isOwner(u) ? { conflicts: once(S, 'conflicts', () => conflictPairs(c)) } : {}), now: Date.now() };
}
// One club view to one socket. json: this update's JSON of the objects the views share (each turned into JSON once).
// part: the view holds some keys only (a hand ended): the others stay as the app has them.
function sendClub(ws, view, json, part){
  if(ws.readyState !== 1) return;
  if(!ws.delta){ ws.send(JSON.stringify({ t: 'club', club: view })); return; }
  const js = v => { if(!v || typeof v !== 'object') return JSON.stringify(v); let x = json.get(v); if(x === undefined){ x = JSON.stringify(v); json.set(v, x); } return x; };
  const full = !ws.sent, sent = ws.sent || (ws.sent = new Map()), out = [];
  for(const k of Object.keys(view)){
    if(k === 'now' || view[k] === undefined) continue;
    const x = js(view[k]);
    if(!full && sent.get(k) === x) continue;
    sent.set(k, x); out.push(JSON.stringify(k) + ':' + x);
  }
  const gone = full || part ? [] : [...sent.keys()].filter(k => view[k] === undefined);
  gone.forEach(k => sent.delete(k));
  if(!full && !out.length && !gone.length) return;
  if(view.now !== undefined) out.push('"now":' + view.now);
  ws.send(full ? `{"t":"club","club":{${out.join(',')}}}` : `{"t":"club","d":1,"club":{${out.join(',')}}${gone.length ? ',"gone":' + JSON.stringify(gone) : ''}}`);
}
// the whole view, to this socket only, as the first thing after its hello (an app that asks for changes starts over from it)
const helloClub = (ws, view) => { ws.sent = null; sendClub(ws, view, new Map(), false); };
// a new email sign-up shows up in its club owner's QR card straight away
joinqr.setOnJoin(j => { const c = clubs.get(j.id); if(c) broadcastClub(c); });
// an account changed (picture, push): every club it may appear in
const broadcastAll = () => clubs.all().forEach(broadcastClub);
function pushTable(c, tid){
  const club = c.club;
  const tb = club.tables.get(tid); if(!tb || clubs.suspended(c.id)) return; // suspended: no table data at all
  const snap = club.snapshot(tb), uids = new Set(snap.seats.filter(Boolean).map(s => s.uid)), field = fieldOf(c), watchers = watchersOf(c, tid).size;
  for(const ws of sockets){
    if(!ws.user || ws.ctx !== c) continue;
    const seatedHere = !ws.spectator && uids.has(ws.user.id);
    if(!seatedHere && ws.watch !== tid) continue;
    // a seated player also gets their place among everyone still playing (1 = chip leader)
    const mine = ws.spectator ? null : field.chips.get(ws.user.id);
    sendWS(ws, { t: 'table', table: snap, you: seatedHere ? club.cardsFor(tid, ws.user.id) : null, field: { ...field.shown, watchers, rank: mine == null ? null : 1 + field.stacks.filter(x => x > mine).length } });
  }
  // (the connection log: how long an applied act took to come back out as this table's next update)
  const h = handling.get(tid); if(h){ handling.delete(tid); sample(CS.handle, Date.now() - h.at); }
  if(c.id === clubs.MAIN) liveChanged(); // the chip leaders on the other clubs' live card
}
// the whole tournament as every table shows it (players' feedback, 2026-10-21): how many are still playing and at how
// many tables, each player's place among all of them, the chip leader of all tables (the same name and chip count their
// seat shows), and how many people are watching. A count only, never who.
// Who is watching a table (Issue #32 item 11): every account with a socket on that table (a member, or a member of
// another club watching the Blindrise game) that is not seated at it. Counted from the sockets as they are now, each time
// a table is sent; a player seated at one table who looks at another counts there (before, anyone seated anywhere in the
// tournament was left out, so the owner watching a table while seated at his own read "0 watching"). Each table's update
// carries its own count; the whole tournament's (the live card) is everyone watching some table.
function watchersOf(c, tid){
  const who = new Set();
  for(const ws of sockets) if(ws.user && ws.ctx === c && ws.watch === tid && (ws.spectator || c.club.tableOf(ws.user.id) !== tid)) who.add(ws.user.id);
  return who;
}
// a socket started or stopped watching a table (or closed): that table's watchers get the new count straight away
// (gathered for a moment, so a crowd arriving sends one update)
const watchTimers = new Map();
function watchersChanged(c, tid){
  if(!c || !tid || watchTimers.has(c.id + ':' + tid)) return;
  watchTimers.set(c.id + ':' + tid, setTimeout(() => { watchTimers.delete(c.id + ':' + tid); if(c.club.tables.has(tid)) pushTable(c, tid); }, 150));
}
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
  for(const tb of c.club.tables.values()) if(!tb.broken) for(const u of watchersOf(c, tb.tid)) watching.add(u);
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
    if(ws.goneLogged !== ws.probed){ ws.goneLogged = ws.probed; CS.gone++; clog(`ws gone ${sockTag(ws)} quiet_ms=${now - ws.heard} ${spotOf(c, uid)}`); }
  }
  return false;
}
// the Blindrise Open changed: its own members get its view; the other clubs only when what their card shows changed
// (status, counts, times, or who is seated), not on every hand
let eventsSig = '';
function eventsChanged(e, kind, uids){
  if(kind === 'hand') playClub(e, uids); else broadcastClub(e);
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
  c.memo = null; c.clubTimer = null; c.playTimer = null; c.playAt = 0; c.playUids = new Set(); c.sentMembers = null; c.chatLogs = new Map(); c.linkCache = new Map();
  c.club.setLinker((a, b) => linkReason(c, a, b));
  c.domino.setHooks({ isOwner, canHost: () => hosts(c), changed: () => dominoPush(c) });
  const halted = () => { const d = clubs.ON() && c.id !== clubs.MAIN ? rootStore.get('clubdef:' + c.id) : null; return d && (d.removed || d.suspended) ? (d.removed ? 'This club was cancelled by Blindrise.' : 'This club is suspended by Blindrise.') : null; };
  c.club.setHooks({ halted, hosts: () => hosts(c), isConnected: uid => online(c, uid), onNotice: (kind, t) => notice(c, kind, t), onCoach: (uid, h) => { if(halted()) return; const msg = { t: 'coach', hand: { no: h.no, net: h.net, bb: h.bb, cards: h.cards, weakFold: coach.weakHand(h) && !coach.voluntary(h), played: coach.voluntary(h), notes: h.notes.filter(n => n.kind !== 'info') } }; for(const ws of sockets) if(ws.user && ws.ctx === c && !ws.spectator && ws.user.id === uid) sendWS(ws, msg); }, onClub: (kind, uids) => { if(c.id === clubs.EVENTS) return eventsChanged(c, kind, uids); if(kind === 'hand') playClub(c, uids); else broadcastClub(c); if(c.id === clubs.MAIN) liveChanged(); }, onTable: tid => pushTable(c, tid), onTableClosed: tid => { c.chatLogs.delete(tid); for(const ws of sockets) if(ws.user && ws.ctx === c) sendWS(ws, { t: 'closed', tid }); broadcastClub(c); } });
}
clubs.get(clubs.MAIN);

wss.on('connection', (ws, req) => {
  if(stopping){ try{ ws.close(4001, 'server moved'); }catch(e){} return; }
  const origin = req.headers.origin;
  let originHost = null; try{ originHost = origin && new URL(origin).host; }catch(e){}
  if(origin && originHost !== req.headers.host){ ws.close(1008, 'origin'); return; }
  sockets.add(ws);
  ws.ip = ipOf(req);
  ws.isAlive = true; ws.heard = Date.now(); ws.sid = ++sockSeq; ws.born = ws.heard;
  ws.on('pong', () => { ws.isAlive = true; ws.heard = Date.now(); });
  // a closing socket of the player to act gives them their disconnect protection straight away (Issue #9)
  ws.on('close', code => {
    sockets.delete(ws);
    if(ws.user){ CS.drops++; clog(`ws out ${sockTag(ws)} code=${code} dur_s=${Math.round((Date.now() - ws.born) / 1000)} quiet_ms=${Date.now() - ws.heard}${ws.spectator ? ' spectator' : ''}`); }
    if(ws.user && ws.ctx && !ws.spectator) ws.ctx.club.offline(ws.user.id);
    if(ws.user && ws.ctx && ws.watch) watchersChanged(ws.ctx, ws.watch);
  });
  ws.on('message', raw => {
    ws.heard = Date.now();
    if(stopping) return; // shutting down: no more actions
    let m; try{ m = JSON.parse(raw); }catch(e){ return; }
    if(!m || typeof m !== 'object') return;
    // the app's heartbeat (its connection watchdog): echoed at once, so the app knows this socket still carries messages
    // both ways. It may carry the app's own timings for the connection log (round trips in ms, clamped).
    if(m.t === 'hb'){
      sendWS(ws, { t: 'hb', n: Number(m.n) || 0 });
      if(ws.user){ sample(CS.rtt, Number(m.rtt)); if(Array.isArray(m.art)) m.art.slice(0, 20).forEach(v => sample(CS.art, Number(v))); }
      return;
    }
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
          if(!ws.logged){ ws.logged = true; CS.conns++; clog(`ws in ${sockTag(ws)} spectator`); }
          ws.delta = m.delta === 1; helloClub(ws, spectatorView(c, ws.user, ws.home));
          if(DOMINO() && c.id === clubs.MAIN) sendWS(ws, { t: 'domino', v: dominoBoard(c) });
          return;
        }
      }
      // club switching: the app says which club it shows; an unknown or foreign club falls back to the account's first club
      const c = clubs.ON() ? (typeof m.club === 'string' && ctxFor(ur, m.club)) || ctxFor(ur, null) : clubs.get(clubs.MAIN);
      const u = c && c.store.get('user:' + ur.id);
      // signed in, but in no club any more (the only club was cancelled): say so, so the app can explain
      if(!u) return sendWS(ws, { t: 'auth', ok: false, ...(clubs.ON() && !c ? { reason: 'noclub' } : {}) });
      ws.ctx = c; ws.user = u; ws.sess = sha(m.token); remember(ur, ws.ip, typeof m.device === 'string' ? m.device.slice(0, 40) : ''); funnel.back(rootStore.get('user:' + ur.id)); sendWS(ws, { t: 'auth', ok: true });
      if(!ws.logged){ ws.logged = true; CS.conns++; clog(`ws in ${sockTag(ws)} ${spotOf(c, u.id)}`); }
      ws.delta = m.delta === 1; helloClub(ws, clubView(c, u));
      if(clubs.suspended(c.id)) return;
      const mine = c.club.tableOf(u.id); if(mine){ pushTable(c, mine); chatLogFor(c, ws, mine); }
      if(DOMINO()) sendWS(ws, { t: 'domino', v: c.domino.view(u) }); // a reconnect gets the whole scorepad state again
      return;
    }
    if(ws.spectator){
      // still signed in, and still a member of some club; then only 'watch', of a table that is playing
      const x = ws.user && store.get('session:' + ws.sess) && store.get('user:' + ws.user.id);
      if(!x || x.removed || !clubs.memberships(x).length){ ws.user = null; return sendWS(ws, { t: 'auth', ok: false }); }
      if(m.t === 'watch'){ const tb = typeof m.tid === 'string' && ws.ctx.club.tables.get(m.tid), was = ws.watch; ws.watch = tb && !tb.broken ? m.tid : null; if(ws.watch) pushTable(ws.ctx, ws.watch); if(was && was !== ws.watch) watchersChanged(ws.ctx, was); }
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
        case 'watch': { const was = ws.watch; ws.watch = typeof m.tid === 'string' ? m.tid : null; if(ws.watch){ pushTable(c, ws.watch); chatLogFor(c, ws, ws.watch); } if(was && was !== ws.watch) watchersChanged(c, was); } break;
        case 'act': {
          const t0 = process.hrtime.bigint(), a = m.a && typeof m.a === 'object' ? m.a : {};
          const res = !['fold', 'check', 'call', 'raise'].includes(a.t) ? 'rejected' : club.act(u.id, m) ? 'applied' : 'stale';
          CS.acts++; CS[res]++;
          if(res === 'applied' && typeof m.tid === 'string') handling.set(m.tid, { at: Date.now() });
          clog(`act ${sockTag(ws)} tid=${String(m.tid).slice(0, 24)} hand=${Number(m.hand)} seq=${Number(m.seq)} a=${String(a.t).slice(0, 8)} res=${res} ms=${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)}${res === 'applied' ? '' : ' now=' + spotOf(c, u.id).replace(/ /g, ',')}`);
        } break;
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
        case 'join': { const was = ((club.T() || {}).regs || []).includes(u.id); club.join(u.id); if(!was){ funnel.mark(u.id, 'game', c); funnel.mark(u.id, 'gameSelf', c); } } break;
        case 'hands': sendWS(ws, { t: 'hands', hands: club.handsFor(u.id) }); break;
        case 'report': { const h = c.store.get('history:' + String(m.id || '')); if(!h) break;
          const me = h.results.find(r => r.uid === u.id);
          const hands = club.handsFor(u.id).filter(x => x.ts >= (h.startedAt || 0) - 60000 && x.ts <= h.endedAt + 60000);
          sendWS(ws, { t: 'report', report: { id: h.id, name: h.name, at: h.endedAt, entrants: h.entrants, place: me ? me.place : null, pts: me ? me.pts : 0, ...(coach.reportCard(hands) || { hands: 0 }) } }); } break;
        case 'profile': { const x = c.store.get('user:' + m.uid); if(x && !x.removed) sendWS(ws, { t: 'profile', profile: { ...players.profile(x.id, membersView(c).all), name: x.name, av: boardUI() && x.id !== u.id ? c.connect.shownAv(x) : x.av || null, since: x.createdAt, perks: players.perksFor(players.profile(x.id, membersView(c).all).tier) } }); } break;
        // a picture belongs to the shared account, so only the main organizer can clear one
        case 'avatarClear': own(u); if(c.id !== clubs.MAIN) throw new Error('Only the Blindrise organizer can remove a picture.'); { const x = c.store.get('user:' + m.uid); if(x){ c.store.set('user:' + x.id, players.setAvatar(x, { kind: 'none' })); c.memo = null; broadcastAll(); } } break;
        case 'leave': club.leave(u.id); if(u.invReg && !((club.T() || {}).regs || []).includes(u.id)){ const x = rootStore.get('user:' + u.id); if(x){ const { invReg, ...rest } = x; rootStore.set('user:' + u.id, rest); } } break;
        // the board's first visit: the welcome seen (2), the First steps card done or dismissed (3); it only moves forward.
        // Kept on the account record (one account, every club and device).
        case 'onb': if(boardUI() && u.onb && (m.step === 2 || m.step === 3) && m.step > u.onb){ const raw = store.get('user:' + u.id); if(raw) store.set('user:' + u.id, { ...raw, onb: m.step });
          // the funnel: the welcome closed from card 3 ("done") or before it ("skip")
          if(u.onb === 1 && m.step === 2 && (m.how === 'done' || m.how === 'skip')) funnel.mark(u.id, m.how === 'done' ? 'welcomeDone' : 'welcomeSkipped', null);
          for(const s of sockets) if(!s.spectator && s.user && s.user.id === u.id) s.user = { ...s.user, onb: m.step }; } break;
        // owner controls
        case 'create': own(u); if(!hosts(c)) throw new Error(NO_HOST); club.create(m); break;
        case 'edit': own(u); if(!hosts(c)) throw new Error(NO_HOST); club.edit(m); break;
        case 'start': own(u); if(!hosts(c)) throw new Error(NO_HOST); club.start(); break;
        case 'cancel': own(u); club.cancel(); break;
        case 'pause': own(u); club.pause(); break;
        case 'resume': own(u); club.unpause(); break;
        case 'kick': own(u); { const t = club.T(); if(t && t.status === 'registering'){ c.store.set('tourney', { ...t, regs: t.regs.filter(x => x !== m.uid) }); const x = typeof m.uid === 'string' && rootStore.get('user:' + m.uid); if(x && x.invReg){ const { invReg, ...rest } = x; rootStore.set('user:' + m.uid, rest); } } broadcastClub(c); } break;
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
        case 'invite': { const code = inviteCode(c, u, !!m.group); funnel.mark(u.id, 'invite', c); sendWS(ws, { t: 'invite', code, group: !isOwner(u) || !!m.group, max: c.store.get('invite:' + code).max || 1 }); broadcastClub(c); } break;
        case 'membersInvite': own(u); c.store.set('settings', { ...(c.store.get('settings') || {}), membersInvite: !!m.on }); broadcastClub(c); break;
        case 'revoke': own(u); { const inv = c.store.get('invite:' + m.code); if(inv) c.store.set('invite:' + m.code, { ...inv, revoked: true }); broadcastClub(c); } break;
        // removing someone from the main club closes their account (as before); removing them from another club only ends
        // that membership: their name, PIN and other clubs stay, and only this club's open screens are closed
        case 'remove': own(u); { const store = c.store, x = store.get('user:' + m.uid); if(x && x.role !== 'owner'){ store.set('user:' + x.id, { ...x, removed: true }); if(c.id === clubs.MAIN){ store.del('name:' + x.name.toLowerCase()); revokeSessions(x.id); } else leaveClub(c, x.id); club.leave(x.id); business.removeUser(x.id); opportunity.removeUser(x.id); c.connect.removeUser(x.id); } broadcastClub(c); } break;
      }
    }catch(e){ sendWS(ws, { t: 'error', error: e.message }); }
  });
});
function own(u){ if(!isOwner(u)) throw new Error('Only the club owner can do that.'); }
// uid left out: everyone in that club (it was cancelled)
function leaveClub(c, uid){ for(const ws of sockets) if(ws.user && ws.ctx === c && (uid === undefined || ws.user.id === uid)){ ws.user = null; try{ ws.close(4004, 'removed from club'); }catch(e){} } }
setInterval(() => { for(const ws of sockets){ if(!ws.isAlive){ if(ws.user){ CS.kills++; clog(`ws kill ${sockTag(ws)} quiet_ms=${Date.now() - ws.heard}`); } ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000);

// Staging must never point at the production database: refuse to start if it does.
const PROD_DB_HOST = 'dpg-db81kuom7kps73cmh9dg-a';
// The quiet-luxury design (owner GO for preview/development only, 2026-10-21): UI_QUIET=1 marks the page and adds
// public/quiet.css, whose rules all sit under html[data-ui="quiet"]. Unset, the page is byte for byte what it was.
// Never on the production database, whatever the environment says.
const quietUI = () => process.env.UI_QUIET === '1' && !String(process.env.DATABASE_URL || '').includes(PROD_DB_HOST);
const quietPage = buf => Buffer.from(String(buf).replace('<html lang="en">', '<html lang="en" data-ui="quiet">').replace('</head>', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">\n<link rel="stylesheet" href="/quiet.css">\n</head>'));
// The Quiet Luxury board (Issue #32, owner direction 2026-10-21: preview only): UI_BOARD=1 marks the page
// html[data-ui="board"] and adds public/board.css, whose rules all sit under that marker. It takes the place of
// UI_QUIET when both are set (one design at a time: no quiet marker, no quiet.css). Unset, the page is byte for byte
// what it was. Never on the production database, whatever the environment says. With either design on, the app shell
// gets its branded first paint and a styled not-found page (server/shell.js).
const shell = require('./shell');
const boardUI = () => shell.boardOn(process.env, PROD_DB_HOST);
const { boardPage, shellPage } = shell;
if(process.env.UI_QUIET === '1') console.log(!quietUI() ? 'UI_QUIET ignored: this is the production database' : boardUI() ? 'UI_QUIET ignored: UI_BOARD is on and takes its place' : 'UI_QUIET: the quiet design is on (preview)');
if(process.env.UI_BOARD === '1') console.log(boardUI() ? 'UI_BOARD: the board design is on' : 'UI_BOARD ignored: this is the production database (it also needs UI_BOARD_LIVE=1)');
// an unknown page: with a design on, a page-like address (no file extension) gets the styled page; files keep the plain 404
function notFound(res, file){
  const mode = boardUI() ? 'board' : quietUI() ? 'quiet' : '';
  if(!mode || /\.[a-z0-9]+$/i.test(file)) return send(res, 404, 'Not found', 'text/plain');
  send(res, 404, shell.notFoundPage(mode), TYPES['.html'], NOINDEX);
}
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
      seeding = true;   // (the seeded accounts are not newcomers: no first visit)
      for(let i = 1; i <= 12; i++) api.redeem({ code: inviteCode(clubs.get(clubs.MAIN), dir), name: 'Test Player ' + String(i).padStart(2, '0'), pin: '1357' + String(i % 10).repeat(2), agree: true });
      console.log('staging: seeded Test Director and 12 fake members');
    }catch(e){ console.error('staging seed failed', e.message); }
    seeding = false;
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
