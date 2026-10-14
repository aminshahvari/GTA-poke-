const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const store = require('./store');
const club = require('./club');
const E = require('./engine');

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
  const u = { id, name, salt, pin: hashPin(pin, salt), role, createdAt: Date.now() };
  store.set('user:' + id, u); store.set('name:' + name.toLowerCase(), id);
  return u;
}
function newSession(uid){ const tok = crypto.randomBytes(24).toString('base64url'); store.set('session:' + sha(tok), { uid, at: Date.now() }); return tok; }
function userByToken(tok){
  if(!tok || typeof tok !== 'string') return null;
  const s = store.get('session:' + sha(tok)); if(!s) return null;
  const u = store.get('user:' + s.uid); return u && !u.removed ? u : null;
}
const isOwner = u => u && u.role === 'owner';

// simple per-IP rate limit for login attempts
const attempts = new Map();
const failures = ip => (attempts.get(ip) || []).filter(t => Date.now() - t < 10 * 60000);
const blocked = ip => process.env.FAST !== '1' && failures(ip).length >= 15;
const recordFailure = ip => attempts.set(ip, [...failures(ip), Date.now()]);

const api = {
  // first-time setup of the club owner, guarded by OWNER_CODE from the environment
  setup({ code, name, pin }){
    if(owner()) throw new Error('This club already has an owner.');
    if(!process.env.OWNER_CODE || code !== process.env.OWNER_CODE) throw new Error('That setup code is not right.');
    name = cleanName(name);
    if(!validName(name)) throw new Error('Pick a name with 2 to 16 letters or numbers.');
    if(!validPin(pin)) throw new Error('Pick a PIN of 4 to 8 digits.');
    const u = createUser(name, pin, 'owner'); store.set('owner', u.id);
    return { token: newSession(u.id) };
  },
  redeem({ code, name, pin }){
    const inv = store.get('invite:' + code);
    if(!inv || inv.usedBy || inv.revoked) throw new Error('This invite link has already been used or was cancelled. Ask for a new one.');
    name = cleanName(name);
    if(!validName(name)) throw new Error('Pick a name with 2 to 16 letters or numbers.');
    if(store.get('name:' + name.toLowerCase())) throw new Error('That name is taken. Try another.');
    if(!validPin(pin)) throw new Error('Pick a PIN of 4 to 8 digits.');
    const u = createUser(name, pin, 'member');
    store.set('invite:' + code, { ...inv, usedBy: u.id, usedAt: Date.now() });
    broadcastClub();
    return { token: newSession(u.id) };
  },
  login({ name, pin }){
    const id = store.get('name:' + cleanName(name).toLowerCase()), u = id && store.get('user:' + id);
    if(!u || u.removed || hashPin(pin, u.salt) !== u.pin) throw new Error('Name or PIN is not right.');
    return { token: newSession(u.id) };
  },
  invite(_, u){ return { code: inviteCode(u) }; },
  status(){ return { hasOwner: !!owner() }; }
};
function inviteCode(u){
  if(!isOwner(u)) throw new Error('Only the club owner can invite people.');
  const code = crypto.randomBytes(9).toString('base64url');
  store.set('invite:' + code, { code, createdAt: Date.now(), by: u.id });
  return code;
}

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const SECURITY = {
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
};
function send(res, code, body, type = 'application/json'){
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if(req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
  if(process.env.FAST === '1' && url.pathname === '/debug/chips'){ const t = club.T(); return send(res, 200, { chips: club.totalChips(), expected: t && t.status === 'running' ? t.stack * t.entrants : null, tables: club.tablesSummary() }); }
  if(req.method === 'POST' && url.pathname.startsWith('/api/')){
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    let body = '';
    req.on('data', c => { body += c; if(body.length > 10000) req.destroy(); });
    req.on('end', () => {
      try{
        const fn = api[url.pathname.slice(5)];
        if(!fn) return send(res, 404, { error: 'Not found' });
        if(blocked(ip)) return send(res, 429, { error: 'Too many tries. Wait a few minutes.' });
        const data = body ? JSON.parse(body) : {};
        const u = userByToken(req.headers.authorization?.replace(/^Bearer /, ''));
        send(res, 200, fn(data, u));
      }catch(e){ recordFailure(ip); send(res, 400, { error: e.message || 'Something went wrong.' }); }
    });
    return;
  }
  if(req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  let file = url.pathname === '/' || url.pathname.startsWith('/join/') ? 'index.html' : url.pathname.slice(1);
  if(file === 'engine.js') return fs.readFile(path.join(__dirname, 'engine.js'), (err, buf) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, buf, TYPES['.js']));
  const full = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if(!full.startsWith(PUBLIC)) return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(full, (err, buf) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, buf, TYPES[path.extname(full)] || 'application/octet-stream'));
});

// ---------- realtime ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const sockets = new Set();
function sendWS(ws, msg){ if(ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function clubView(u){
  const t = club.T();
  const members = store.values('user:').filter(x => !x.removed).map(x => ({ id: x.id, name: x.name, role: x.role, createdAt: x.createdAt }));
  const history = store.values('history:').sort((a, b) => b.endedAt - a.endedAt).slice(0, 200);
  const view = {
    me: { id: u.id, name: u.name, owner: isOwner(u) },
    tourney: t ? { id: t.id, status: t.status, name: t.name, stack: t.stack, levelMin: t.levelMin, startAt: t.startAt, repeat: t.repeat, regs: t.regs,
      level: t.level, levelEndsAt: t.levelEndsAt, paused: t.paused, pausedLeft: t.pausedLeft, entrants: t.entrants, remaining: t.remaining,
      places: t.places, note: t.note, payouts: t.entrants ? club.payoutPcts(t.entrants) : null } : null,
    tables: club.tablesSummary(), myTable: club.tableOf(u.id),
    members, history, now: Date.now()
  };
  if(isOwner(u)) view.invites = store.values('invite:').filter(i => !i.usedBy && !i.revoked).map(i => ({ code: i.code, createdAt: i.createdAt }));
  return view;
}
let clubTimer = null;
function broadcastClub(){
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
club.setHooks({ onClub: broadcastClub, onTable: pushTable, onTableClosed: tid => { for(const ws of sockets) sendWS(ws, { t: 'closed', tid }); broadcastClub(); } });

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  if(origin && new URL(origin).host !== req.headers.host){ ws.close(1008, 'origin'); return; }
  sockets.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);
  ws.on('close', () => sockets.delete(ws));
  ws.on('message', raw => {
    let m; try{ m = JSON.parse(raw); }catch(e){ return; }
    if(!m || typeof m !== 'object') return;
    if(m.t === 'hello'){
      const u = userByToken(m.token);
      if(!u) return sendWS(ws, { t: 'auth', ok: false });
      ws.user = u; sendWS(ws, { t: 'auth', ok: true });
      sendWS(ws, { t: 'club', club: clubView(u) });
      const mine = club.tableOf(u.id); if(mine) pushTable(mine);
      return;
    }
    const u = ws.user && store.get('user:' + ws.user.id);
    if(!u || u.removed) return sendWS(ws, { t: 'auth', ok: false });
    ws.user = u;
    try{
      switch(m.t){
        case 'watch': ws.watch = typeof m.tid === 'string' ? m.tid : null; if(ws.watch) pushTable(ws.watch); break;
        case 'act': club.act(u.id, m); break;
        case 'back': club.back(u.id); break;
        case 'join': club.join(u.id); break;
        case 'leave': club.leave(u.id); break;
        // owner controls
        case 'create': own(u); club.create(m); break;
        case 'start': own(u); club.start(); break;
        case 'cancel': own(u); club.cancel(); break;
        case 'pause': own(u); club.pause(); break;
        case 'resume': own(u); club.unpause(); break;
        case 'kick': own(u); { const t = club.T(); if(t && t.status === 'registering') store.set('tourney', { ...t, regs: t.regs.filter(x => x !== m.uid) }); broadcastClub(); } break;
        case 'invite': own(u); sendWS(ws, { t: 'invite', code: inviteCode(u) }); broadcastClub(); break;
        case 'revoke': own(u); { const inv = store.get('invite:' + m.code); if(inv) store.set('invite:' + m.code, { ...inv, revoked: true }); broadcastClub(); } break;
        case 'remove': own(u); { const x = store.get('user:' + m.uid); if(x && x.role !== 'owner'){ store.set('user:' + x.id, { ...x, removed: true }); store.del('name:' + x.name.toLowerCase()); for(const k of store.keys('session:')) if(store.get(k).uid === x.id) store.del(k); club.leave(x.id); } broadcastClub(); } break;
      }
    }catch(e){ sendWS(ws, { t: 'error', error: e.message }); }
  });
});
function own(u){ if(!isOwner(u)) throw new Error('Only the club owner can do that.'); }
setInterval(() => { for(const ws of sockets){ if(!ws.isAlive){ ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000);

(async () => {
  await store.init();
  if(club.resume()) console.log('resumed running tournament');
  server.listen(PORT, () => console.log(`Stacked poker club on :${PORT}`));
})();
module.exports = { server };
