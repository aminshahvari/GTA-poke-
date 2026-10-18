const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const store = require('./store');
const rewards = require('./rewards');
const club = require('./club');
const E = require('./engine');
const fair = require('./fair');
const players = require('./players');
const coach = require('./coach');
const push = require('./push');
const business = require('./business');
const opportunity = require('./opportunity');

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

// simple per-IP rate limit for login attempts
const attempts = new Map();
const failures = ip => (attempts.get(ip) || []).filter(t => Date.now() - t < 10 * 60000);
const blocked = (key, max = 15) => process.env.FAST !== '1' && failures(key).length >= max;
const recordFailure = key => { if(attempts.size > 5000) for(const k of attempts.keys()){ if(!failures(k).length) attempts.delete(k); } attempts.set(key, [...failures(key), Date.now()]); };
// On Render, traffic passes Cloudflare, which sets cf-connecting-ip to the caller's address and overwrites any value the
// caller sent. x-forwarded-for there ends in Render's own internal proxy (same for every player), so it is only a local fallback.
const clientIp = req => String(req.headers['cf-connecting-ip'] || '').trim() || String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean).pop() || req.socket.remoteAddress || '';
// Per-account limit, which no header can get around: 10 wrong tries on one name locks that name for 10 minutes.
const acctKey = (path, data) => path === '/api/login' ? 'acct:' + cleanName(data && data.name).toLowerCase() : null;
// Owner recovery (setup code): 5 wrong codes lock only the address they came from, so a stranger cannot lock the real
// owner out. A club-wide cap of 60 wrong codes per 10 minutes stops guessing spread over many addresses.
const RECOVERY = ['/api/setup', '/api/resetOwner'], RECOVERY_IP = 5, RECOVERY_ALL = 60;

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
    const inv = store.get('invite:' + code);
    const dead = !inv || inv.revoked || (inv.multi ? (inv.uses || []).length >= inv.max || Date.now() > inv.expiresAt : inv.usedBy);
    if(inv && !dead && inv.by && inv.by !== store.get('owner') && !membersInvite()) throw new Error('Member invites are switched off right now. Ask the organizer for a link.');
    if(dead) throw new Error(inv && inv.multi ? 'This group link is full, expired or was cancelled. Ask the organizer for a new one.' : 'This invite link has already been used or was cancelled. Ask for a new one.');
    name = cleanName(name);
    if(!validName(name)) throw new Error('Pick a name with 2 to 16 letters or numbers.');
    if(store.get('name:' + name.toLowerCase())) throw new Error('That name is taken. Try another.');
    if(!validPin(pin)) throw new Error('Pick a PIN of 4 to 8 digits.');
    if(agree !== true) throw new Error('Please confirm you are 19 or older and agree to the club rules.');
    const u = createUser(name, pin, 'member');
    if(inv.by) store.set('user:' + u.id, { ...u, invitedBy: inv.by });
    // the link is usually sent for a tournament: sign the new player up for it straight away
    const t = club.T();
    if(t && (t.status === 'registering' || (t.status === 'running' && club.lateOpen()))) try{ club.join(u.id); }catch(e){}
    store.set('invite:' + code, inv.multi ? { ...inv, uses: [...(inv.uses || []), u.id] } : { ...inv, usedBy: u.id, usedAt: Date.now() });
    broadcastClub();
    return { token: newSession(u.id) };
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
  invite(_, u){ return { code: inviteCode(u) }; },
  status(){ return { hasOwner: !!owner() }; },
  pushKey(){ return { key: push.publicKey() }; },
  push(sub, u){ if(!u) throw new Error('Sign in first.'); push.subscribe(u.id, sub); broadcastClub(); return { ok: true }; },
  unpush({ endpoint }, u){ if(u) push.unsubscribe(u.id, String(endpoint || '')); return { ok: true }; },
  // your own picture: a gallery avatar or a small photo the phone has already shrunk
  avatar(a, u){
    if(!u) throw new Error('Sign in first.');
    store.set('user:' + u.id, players.setAvatar(store.get('user:' + u.id), a));
    broadcastClub();
    return { ok: true };
  },
  // Business Club (members-only directory, separate from poker): see server/business.js
  ...business.api,
  // Opportunity Club ("I need help" / "I can help" listings inside Business Club): see server/opportunity.js
  ...opportunity.api
};
// Business Club + Opportunity Club: closed to members until the owner opens them in the Director tab (the owner can always use them).
// Staging opens them by default so they can be tested; CLUBS_DEFAULT=on does the same for local test runs.
const clubsOn = () => { const s = store.get('settings') || {}; return typeof s.clubsOn === 'boolean' ? s.clubsOn : process.env.STAGING === '1' || process.env.CLUBS_DEFAULT === 'on'; };
const clubsClosedFor = u => !!u && !isOwner(u) && !clubsOn();
const GROUP_MAX = 100, GROUP_DAYS = 30, MEMBER_DAYS = 7;
// Members can invite friends too (the owner can switch that off). A member's link joins at most MEMBER_MAX people,
// and asking again hands back the member's open link instead of piling up new ones.
const MEMBER_MAX = 10;
const membersInvite = () => (store.get('settings') || {}).membersInvite !== false;
const openInvite = i => !i.revoked && (i.multi ? Date.now() < i.expiresAt && (i.uses || []).length < i.max : !i.usedBy);
function inviteCode(u, group){
  if(!isOwner(u)){
    if(!membersInvite()) throw new Error('The organizer has turned off member invites. Ask them for a link.');
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
const invitedCount = uid => store.values('user:').filter(x => !x.removed && x.invitedBy === uid).length;

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
  if(process.env.FAST === '1' && url.pathname === '/debug/chips'){ const t = club.T(); return send(res, 200, { chips: club.totalChips(), expected: t && t.status === 'running' ? t.stack * t.entrants : null, tables: club.tablesSummary(), hfh: club.hfhState(), detail: process.env.DEBUG_CHIPS ? [...club.tables.values()].map(tb => ({ tid: tb.tid, broken: tb.broken, toBreak: tb.toBreak, inHand: tb.inHand, seats: tb.g.seats.map((p, i) => p && [i, p.uid, p.stack, p.start]).filter(Boolean), hp: tb.g.hand ? tb.g.hand.players.map(p => [p.seat, p.uid, p.start]) : [] })) : undefined }); }
  if(req.method === 'POST' && url.pathname.startsWith('/api/')){
    const ip = 'ip:' + clientIp(req);
    let body = '';
    const limit = url.pathname === '/api/avatar' || url.pathname === '/api/bizSave' ? 70000 : 10000;
    const extra = url.pathname.startsWith('/api/biz') || url.pathname.startsWith('/api/opp') ? NOINDEX : undefined;
    req.on('data', c => { body += c; if(body.length > limit) req.destroy(); });
    req.on('end', () => {
      let acct = null;
      try{
        const name = url.pathname.slice(5), fn = Object.hasOwn(api, name) && api[name];
        if(!fn) return send(res, 404, { error: 'Not found' });
        if(blocked(ip, 30)) return send(res, 429, { error: 'Too many tries. Wait a few minutes.' });
        const data = body ? JSON.parse(body) : {};
        acct = acctKey(url.pathname, data);
        if(acct && blocked(acct, 10)) return send(res, 429, { error: 'Too many tries. Wait a few minutes.' });
        if(RECOVERY.includes(url.pathname) && (blocked('rec' + ip, RECOVERY_IP) || blocked('rec:all', RECOVERY_ALL))) return send(res, 429, { error: 'Too many tries. Wait a few minutes.' });
        const u = userByToken(req.headers.authorization?.replace(/^Bearer /, ''));
        if(extra && clubsClosedFor(u)) return send(res, 403, { error: 'Business Club opens soon.' }, undefined, extra);
        send(res, 200, fn(data, u), undefined, extra);
      }catch(e){ if(['/api/setup', '/api/redeem', '/api/login', '/api/resetOwner'].includes(url.pathname)){ recordFailure(ip); if(acct) recordFailure(acct); if(RECOVERY.includes(url.pathname) && /setup code/.test(e.message)){ recordFailure('rec' + ip); recordFailure('rec:all'); } } send(res, [401, 403, 404, 429].includes(e.status) ? e.status : 400, { error: e.message || 'Something went wrong.' }, undefined, extra); }
    });
    return;
  }
  if(req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  const av = /^\/avatar\/(u[0-9a-f]{12})$/.exec(url.pathname);
  if(av){
    const buf = players.photo(av[1]); if(!buf) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=604800, immutable', ...SECURITY }); return res.end(buf);
  }
  // Business Club logos: only with the member's token (sent by fetch, not a plain <img> link)
  const bl = /^\/bizlogo\/(u[0-9a-f]{12})$/.exec(url.pathname);
  if(bl){
    const lu = userByToken(req.headers.authorization?.replace(/^Bearer /, ''));
    const r = clubsClosedFor(lu) ? { status: 404 } : business.logoFor(bl[1], lu);
    if(r.status !== 200) return send(res, r.status, 'Not found', 'text/plain', NOINDEX);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', ...SECURITY, ...NOINDEX }); return res.end(r.buf);
  }
  let file = url.pathname === '/' || url.pathname === '/login' || url.pathname.startsWith('/join/') ? 'index.html' : url.pathname.slice(1);
  if(file === 'engine.js') return fs.readFile(path.join(__dirname, 'engine.js'), (err, buf) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, buf, TYPES['.js']));
  const full = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if(!full.startsWith(PUBLIC)) return send(res, 404, 'Not found', 'text/plain');
  // pinned third-party files (public/vendor/<name>-<version>/): never change at a given path, so phones may keep them for a year.
  // eng.traineddata.gz goes out as plain bytes with no Content-Encoding; the card reader unzips it itself.
  const cache = url.pathname.startsWith('/vendor/') ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : undefined;
  fs.readFile(full, (err, buf) => {
    if(err) return send(res, 404, 'Not found', 'text/plain');
    // app files: the phone keeps a copy but asks every time ("no-cache"); an unchanged file costs a 304 instead of the whole file
    const tag = '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"';
    const fresh = cache || { 'Cache-Control': 'no-cache', ETag: tag };
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
const linkCache = new Map();
function linkReason(a, b){
  if(a === b) return null;
  const k = a < b ? a + '|' + b : b + '|' + a, c = linkCache.get(k);
  if(c && Date.now() - c.at < 5000) return c.r;
  const ua = store.get('user:' + a), ub = store.get('user:' + b);
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
club.setLinker(linkReason);
function conflictPairs(){
  const t = club.T(), out = [], pairs = groups => groups.forEach(([where, us]) => { for(let i = 0; i < us.length; i++) for(let j = i + 1; j < us.length; j++){ const r = linkReason(us[i], us[j]); if(r) out.push({ a: us[i], b: us[j], reason: r, where }); } });
  if(t && t.status === 'registering') pairs([['registered', t.regs]]);
  else if(t && t.status === 'running') pairs([...club.tables.values()].filter(x => !x.broken).map(x => ['Table ' + x.n, x.g.seats.filter(Boolean).map(p => p.uid)]));
  return out;
}

let memo = null;
function membersView(){
  if(memo && Date.now() - memo.at < 200) return memo;
  const history = store.values('history:').sort((a, b) => b.endedAt - a.endedAt);
  const members = store.values('user:').filter(x => !x.removed).map(x => {
    const pr = players.profile(x.id, history);
    return { id: x.id, name: x.name, role: x.role, createdAt: x.createdAt, invitedBy: x.invitedBy || null, av: x.av || null, tier: pr.tier, color: pr.color, score: pr.score };
  });
  memo = { at: Date.now(), members, history: history.slice(0, 200), all: history };
  return memo;
}
function clubView(u){
  const t = club.T();
  const { members, history } = membersView();
  const view = {
    me: { id: u.id, name: u.name, owner: isOwner(u) },
    tourney: t ? { id: t.id, status: t.status, name: t.name, stack: t.stack, levelMin: t.levelMin, startAt: t.startAt, repeat: t.repeat, regs: t.regs,
      level: t.level, levelEndsAt: t.levelEndsAt, paused: t.paused, pausedLeft: t.pausedLeft, entrants: t.entrants, remaining: t.remaining,
      places: t.places, note: t.note, anteMode: t.anteMode || 'bb', actSec: t.actSec || 20, tableSize: t.tableSize || 9, helper: t.helper !== false, lateLevels: t.lateLevels || 0, lateOpen: club.lateOpen(), payouts: t.entrants ? club.payoutPcts(t.entrants) : null, seal: t.fairSeal || null } : null,
    tables: club.tablesSummary(), myTable: club.tableOf(u.id),
    // who invited whom is for the owner only: a member's payload carries no inviter for anyone (Muse P10)
    members: isOwner(u) ? members : members.map(m => m.invitedBy ? { ...m, invitedBy: null } : m),
    history, now: Date.now(), shop: rewards.view(u.id, isOwner(u)),
    features: { clubs: clubsOn() }, chatOff: !!(store.get('settings') || {}).chatOff, muted: !!u.muted, version: VERSION,
    pushOn: push.hasPush(u.id), membersInvite: membersInvite(), invitedCount: invitedCount(u.id), myInvite: (() => { const i = store.values('invite:').find(x => x.by === u.id && x.multi && openInvite(x)); return i ? { used: (i.uses || []).length, max: i.max, expiresAt: i.expiresAt } : null; })()
  };
  if(isOwner(u)){
    view.invites = store.values('invite:').filter(openInvite)
      .map(i => ({ code: i.code, createdAt: i.createdAt, multi: !!i.multi, used: (i.uses || []).length, max: i.max, expiresAt: i.expiresAt, by: i.by }));
    view.conflicts = conflictPairs();
    const hh = Object.fromEntries(store.values('user:').filter(x => !x.removed && x.household).map(x => [x.id, x.household]));
    view.households = hh;
    view.mutedIds = store.values('user:').filter(x => !x.removed && x.muted).map(x => x.id);
  }
  return view;
}
const VERSION = (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || null;

// ---------- table chat and throwables ----------
const THROWS = ['tomato', 'rose', 'beer', 'egg', 'fish', 'clap', 'cake', 'fire'];
const chatLogs = new Map(), chatRate = new Map();
function chatTo(tid, msg){
  for(const ws of sockets) if(ws.user && (ws.watch === tid || club.tableOf(ws.user.id) === tid)) sendWS(ws, msg);
}
function chat(ws, u, m){
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
    const allowed = THROWS.includes(m.item) || players.perksFor(players.profile(u.id, membersView().all).tier).includes(m.item);
    if(!allowed || typeof m.to !== 'string' || m.to === u.id || club.tableOf(m.to) !== tid) return;
    body = { kind: 'throw', item: m.item, to: m.to };
  }
  r.push(now); chatRate.set(u.id, r);
  const entry = { id: crypto.randomBytes(6).toString('hex'), tid, from: u.id, name: u.name, ts: now, ...body };
  const log = chatLogs.get(tid) || []; log.push(entry); if(log.length > 40) log.shift(); chatLogs.set(tid, log);
  chatTo(tid, { t: 'chat', msg: entry });
}
const chatLogFor = (ws, tid) => { if(tid) sendWS(ws, { t: 'chatlog', tid, log: chatLogs.get(tid) || [] }); };

let clubTimer = null;
function broadcastClub(){
  memo = null;
  if(clubTimer) return;
  clubTimer = setTimeout(() => { clubTimer = null; for(const ws of sockets) if(ws.user) sendWS(ws, { t: 'club', club: clubView(ws.user) }); }, 60);
}
function pushTable(tid){
  const tb = club.tables.get(tid); if(!tb) return;
  const snap = club.snapshot(tb), uids = new Set(snap.seats.filter(Boolean).map(s => s.uid));
  for(const ws of sockets){
    if(!ws.user) continue;
    const seatedHere = uids.has(ws.user.id);
    if(!seatedHere && ws.watch !== tid) continue;
    sendWS(ws, { t: 'table', table: snap, you: seatedHere ? club.cardsFor(tid, ws.user.id) : null });
  }
}
const clock = ms => new Date(ms).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: process.env.CLUB_TZ || 'America/Toronto' });
const dayOf = ms => { const tz = process.env.CLUB_TZ || 'America/Toronto', f = d => new Date(d).toLocaleDateString('en-CA', { timeZone: tz });
  const hour = +new Date(ms).toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: tz });
  return f(ms) === f(Date.now()) ? (hour >= 17 ? 'tonight' : 'today') : 'on ' + new Date(ms).toLocaleDateString('en-CA', { weekday: 'long', timeZone: tz }); };
function notice(kind, t){
  if(!t) return;
  const members = store.values('user:').filter(x => !x.removed).map(x => x.id);
  if(kind === 'open') push.notify(members, { title: t.startAt ? `${t.name} ${dayOf(t.startAt)} at ${clock(t.startAt)}` : `${t.name} is open`, body: 'Registration is open. Tap to join.', tag: 'open-' + t.id, ttl: 6 * 3600 }).catch(() => {});
  if(kind === 'soon'){
    push.notify(t.regs, { title: `${t.name} starts in 15 minutes`, body: "You're registered. Open the app a few minutes early to take your seat.", tag: 'soon-' + t.id, ttl: 900 }).catch(() => {});
    push.notify(members.filter(id => !t.regs.includes(id)), { title: `${t.name} starts in 15 minutes`, body: 'There is still time to join. Tap to register.', tag: 'soon-' + t.id, ttl: 900 }).catch(() => {});
  }
  if(kind === 'start') push.notify(t.regs, { title: `${t.name} is starting!`, body: 'Cards are in the air. Tap to take your seat.', tag: 'start-' + t.id, ttl: 600 }).catch(() => {});
}
club.setHooks({ onNotice: notice, onCoach: (uid, h) => { const msg = { t: 'coach', hand: { no: h.no, net: h.net, bb: h.bb, cards: h.cards, weakFold: coach.weakHand(h) && !coach.voluntary(h), played: coach.voluntary(h), notes: h.notes.filter(n => n.kind !== 'info') } }; for(const ws of sockets) if(ws.user && ws.user.id === uid) sendWS(ws, msg); }, onClub: broadcastClub, onTable: pushTable, onTableClosed: tid => { chatLogs.delete(tid); for(const ws of sockets) if(ws.user) sendWS(ws, { t: 'closed', tid }); broadcastClub(); } });

wss.on('connection', (ws, req) => {
  if(stopping){ try{ ws.close(4001, 'server moved'); }catch(e){} return; }
  const origin = req.headers.origin;
  let originHost = null; try{ originHost = origin && new URL(origin).host; }catch(e){}
  if(origin && originHost !== req.headers.host){ ws.close(1008, 'origin'); return; }
  sockets.add(ws);
  ws.ip = ipOf(req);
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);
  ws.on('close', () => sockets.delete(ws));
  ws.on('message', raw => {
    if(stopping) return; // shutting down: no more actions
    let m; try{ m = JSON.parse(raw); }catch(e){ return; }
    if(!m || typeof m !== 'object') return;
    if(m.t === 'hello'){
      const u = userByToken(m.token);
      if(!u) return sendWS(ws, { t: 'auth', ok: false });
      ws.user = u; ws.sess = sha(m.token); remember(u, ws.ip, typeof m.device === 'string' ? m.device.slice(0, 40) : ''); sendWS(ws, { t: 'auth', ok: true });
      sendWS(ws, { t: 'club', club: clubView(u) });
      const mine = club.tableOf(u.id); if(mine){ pushTable(mine); chatLogFor(ws, mine); }
      return;
    }
    const u = ws.user && store.get('session:' + ws.sess) && store.get('user:' + ws.user.id);
    if(!u || u.removed) return sendWS(ws, { t: 'auth', ok: false });
    ws.user = u;
    try{
      switch(m.t){
        case 'watch': ws.watch = typeof m.tid === 'string' ? m.tid : null; if(ws.watch){ pushTable(ws.watch); chatLogFor(ws, ws.watch); } break;
        case 'act': club.act(u.id, m); break;
        case 'extend': club.extend(u.id); break;
        case 'chat': case 'throw': chat(ws, u, m); break;
        case 'fair': { const id = String(m.id || ''), cur = club.T(), h = store.get('history:' + id);
          const t = cur && cur.id === id ? cur : h ? { ...h, status: 'finished' } : null;
          sendWS(ws, { t: 'fair', report: t ? fair.report(t) : null }); } break;
        case 'clubs': own(u); store.set('settings', { ...(store.get('settings') || {}), clubsOn: !!m.on }); broadcastClub(); break;
        case 'chatOff': own(u); store.set('settings', { ...(store.get('settings') || {}), chatOff: !!m.off }); broadcastClub(); break;
        case 'mute': own(u); { const x = store.get('user:' + m.uid); if(x && x.role !== 'owner') store.set('user:' + x.id, { ...x, muted: !!m.muted }); broadcastClub(); } break;
        case 'back': club.back(u.id); break;
        case 'join': club.join(u.id); break;
        case 'hands': sendWS(ws, { t: 'hands', hands: club.handsFor(u.id) }); break;
        case 'report': { const h = store.get('history:' + String(m.id || '')); if(!h) break;
          const me = h.results.find(r => r.uid === u.id);
          const hands = club.handsFor(u.id).filter(x => x.ts >= (h.startedAt || 0) - 60000 && x.ts <= h.endedAt + 60000);
          sendWS(ws, { t: 'report', report: { id: h.id, name: h.name, at: h.endedAt, entrants: h.entrants, place: me ? me.place : null, pts: me ? me.pts : 0, ...(coach.reportCard(hands) || { hands: 0 }) } }); } break;
        case 'profile': { const x = store.get('user:' + m.uid); if(x && !x.removed) sendWS(ws, { t: 'profile', profile: { ...players.profile(x.id, membersView().all), name: x.name, av: x.av || null, since: x.createdAt, perks: players.perksFor(players.profile(x.id, membersView().all).tier) } }); } break;
        case 'avatarClear': own(u); { const x = store.get('user:' + m.uid); if(x){ store.set('user:' + x.id, players.setAvatar(x, { kind: 'none' })); memo = null; broadcastClub(); } } break;
        case 'leave': club.leave(u.id); break;
        // owner controls
        case 'create': own(u); club.create(m); break;
        case 'edit': own(u); club.edit(m); break;
        case 'start': own(u); club.start(); break;
        case 'cancel': own(u); club.cancel(); break;
        case 'pause': own(u); club.pause(); break;
        case 'resume': own(u); club.unpause(); break;
        case 'kick': own(u); { const t = club.T(); if(t && t.status === 'registering') store.set('tourney', { ...t, regs: t.regs.filter(x => x !== m.uid) }); broadcastClub(); } break;
        case 'household': own(u); {
          const x = store.get('user:' + m.uid), y = m.with ? store.get('user:' + m.with) : null;
          if(!x) break;
          if(!y){ store.set('user:' + x.id, { ...x, household: null }); }
          else { const gid = y.household || x.household || ('h' + Date.now().toString(36)); store.set('user:' + x.id, { ...x, household: gid }); store.set('user:' + y.id, { ...store.get('user:' + y.id), household: gid }); }
          linkCache.clear(); broadcastClub();
        } break;
        case 'skillq': sendWS(ws, { t: 'skillq', rid: m.rid, q: rewards.question(u.id, String(m.rid || '')) }); break;
        case 'claim': rewards.claim(u.id, String(m.rid || ''), m.answer); sendWS(ws, { t: 'claimed' }); broadcastClub(); break;
        case 'addReward': own(u); rewards.addReward(m); broadcastClub(); break;
        case 'removeReward': own(u); rewards.removeReward(String(m.id || '')); broadcastClub(); break;
        case 'redeemStatus': own(u); rewards.setStatus(String(m.id || ''), m.status); broadcastClub(); break;
        case 'invite': { const code = inviteCode(u, !!m.group); sendWS(ws, { t: 'invite', code, group: !isOwner(u) || !!m.group, max: store.get('invite:' + code).max || 1 }); broadcastClub(); } break;
        case 'membersInvite': own(u); store.set('settings', { ...(store.get('settings') || {}), membersInvite: !!m.on }); broadcastClub(); break;
        case 'revoke': own(u); { const inv = store.get('invite:' + m.code); if(inv) store.set('invite:' + m.code, { ...inv, revoked: true }); broadcastClub(); } break;
        case 'remove': own(u); { const x = store.get('user:' + m.uid); if(x && x.role !== 'owner'){ store.set('user:' + x.id, { ...x, removed: true }); store.del('name:' + x.name.toLowerCase()); revokeSessions(x.id); club.leave(x.id); business.removeUser(x.id); opportunity.removeUser(x.id); } broadcastClub(); } break;
      }
    }catch(e){ sendWS(ws, { t: 'error', error: e.message }); }
  });
});
function own(u){ if(!isOwner(u)) throw new Error('Only the club owner can do that.'); }
setInterval(() => { for(const ws of sockets){ if(!ws.isAlive){ ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000);

// Staging must never point at the production database: refuse to start if it does.
const PROD_DB_HOST = 'dpg-db81kuom7kps73cmh9dg-a';
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
  club.stopAll(); store.freeze();
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
      for(let i = 1; i <= 12; i++) api.redeem({ code: inviteCode(dir), name: 'Test Player ' + String(i).padStart(2, '0'), pin: '1357' + String(i % 10).repeat(2), agree: true });
      console.log('staging: seeded Test Director and 12 fake members');
    }catch(e){ console.error('staging seed failed', e.message); }
  }
  // Staging only: a few fake demo businesses for the fake Test Player accounts (once; never in production)
  if(process.env.STAGING === '1'){ const n = business.seedDemo(); if(n) console.log(`staging: seeded ${n} fake demo businesses`); const k = opportunity.seedDemo(); if(k) console.log(`staging: seeded ${k} fake demo opportunity listings`); }
  if(stopping) return;
  if(club.resume()) console.log('resumed running tournament');
  server.listen(PORT, () => { ready = true; console.log(`Blindrise poker club on :${PORT}`); });
  if(!process.env.NO_BEACON) fair.probe();
})();
module.exports = { server };
