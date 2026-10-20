// Club switching off (production) must behave exactly as before, and today's data must load unchanged with it on.
// 1. Runs one scripted session (setup, invites, sign-ups, sign-in, tournament, Exchange, Director settings) against the
//    base release (PARITY_BASE, default 61411c5 = stabilization candidate 8eee0a5 + invite privacy 06e6e9c) and against
//    this tree with club switching off, and compares every HTTP answer and socket message (ids, codes, tokens and times
//    normalised).
// 2. Starts this tree with CLUB_SWITCHING=1 on the data file the base release wrote: every account is in the main club,
//    every view equals the base view (apart from the added club fields) and no stored key was renamed or removed.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const BASE_SHA = process.env.PARITY_BASE || '61411c5';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_club_parity_'));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };

// the base release's server, unpacked next to this repo's node_modules
const baseDir = path.join(tmp, 'base');
fs.mkdirSync(baseDir);
execSync(`git archive ${BASE_SHA} server public package.json | tar -x -C ${baseDir}`, { cwd: ROOT });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(baseDir, 'node_modules'));

function start(dir, data, extra){
  const port = 4400 + Math.floor(Math.random() * 500);
  const p = spawn('node', ['server/index.js'], { cwd: dir, env: { ...process.env, PORT: port, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: data, FAST: '', STAGING: '', CLUBS_DEFAULT: '', CLUB_SWITCHING: '', ...extra }, stdio: 'ignore' });
  return { p, base: 'http://localhost:' + port };
}
async function up(s){ for(let i = 0; i < 60; i++){ try{ if((await fetch(s.base + '/healthz')).ok) return; }catch(e){} await sleep(150); } throw new Error('server did not start'); }
async function stop(s){ s.p.kill('SIGTERM'); await new Promise(r => s.p.on('exit', r)); }

// normalise: random ids, tokens, codes and clock values become stable placeholders
function normaliser(){
  const alias = new Map(), al = (kind, v) => { const k = kind + ':' + v; if(!alias.has(k)) alias.set(k, kind + (alias.size + 1)); return alias.get(k); };
  const TIME = /^(now|at|ts|createdAt|updatedAt|publishedAt|expiresAt|startAt|endedAt|startedAt|levelEndsAt|usedAt|agreedAt|since|joinedAt|deadline|id)$/;
  const walk = (v, key) => {
    if(Array.isArray(v)) return v.map(x => walk(x));
    if(v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    if(typeof v === 'string'){
      if(/^u[0-9a-f]{12}$/.test(v)) return al('U', v);
      if(key === 'token' || key === 'code' || key === 'seal') return al(key, v);
      if(key === 'id' && /^t\d{13}$/.test(v)) return 'T-ID';
      return v.replace(/u[0-9a-f]{12}/g, m => al('U', m));
    }
    if(typeof v === 'number' && v > 1.5e12 && TIME.test(key || '')) return 'TIME';
    return v;
  };
  return v => walk(v);
}
// one scripted session; returns the transcript of everything the server answered
async function script(s){
  const out = [], norm = normaliser(), rec = (label, v) => out.push([label, norm(v)]);
  const call = async (p, body, tok) => { const r = await fetch(s.base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }); const b = await r.json().catch(() => ({})); rec(p + ' ' + r.status, b); return b; };
  const sock = tok => new Promise((res, rej) => {
    const ws = new WebSocket(s.base.replace('http', 'ws') + '/ws'), msgs = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok })));
    ws.on('message', m => msgs.push(JSON.parse(m)));
    ws.on('error', rej);
    setTimeout(() => res({ ws, msgs, send: m => ws.send(JSON.stringify(m)) }), 400);
  });
  const settle = async (label, so) => { await sleep(350); const last = [...so.msgs].reverse().find(m => m.t === 'club'); rec(label, { types: so.msgs.map(m => m.t), last }); so.msgs.length = 0; };
  await call('status');
  const O = (await call('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const A = (await call('redeem', { code: (await call('invite', {}, O)).code, name: 'Alex', pin: '1111', agree: true })).token;
  const B = (await call('redeem', { code: (await call('invite', {}, A)).code, name: 'Bita', pin: '2222', agree: true })).token;
  await call('redeem', { code: 'nonexistent00', name: 'Cyrus', pin: '3333', agree: true });
  await call('redeem', { code: (await call('invite', {}, O)).code, name: 'Alex', pin: '1111', agree: true });
  await call('login', { name: 'Bita', pin: '2222' }); await call('login', { name: 'Bita', pin: '0000' });
  await call('joinInvite', { code: 'x' }, A); await call('createClub', { name: 'X', code: 'secret' }, O);
  const so = await sock(O), sa = await sock(A), sb = await sock(B);
  await settle('owner hello', so); await settle('alex hello', sa); await settle('bita hello', sb);
  so.send({ t: 'clubs', on: true }); so.send({ t: 'create', name: 'Parity Night', stack: 3000, levelMin: 20, repeat: 'none', tableSize: 9 });
  await settle('owner after create', so); await settle('alex after create', sa);
  sa.send({ t: 'join' }); sb.send({ t: 'join' }); await settle('bita after joins', sb);
  so.send({ t: 'invite', group: true }); await settle('owner group link', so);
  sa.send({ t: 'profile', uid: [...(await sock(O)).msgs].find(m => m.t === 'club').club.me.id }); await settle('alex profile', sa);
  sb.send({ t: 'create', name: 'not allowed' }); await settle('bita not owner', sb);
  await call('bizSave', { name: 'Alex Co', category: 'other', categoryOther: 'Design' }, A);
  await call('bizPublish', { on: true }, A); await call('bizList', {}, B); await call('oppList', {}, B);
  so.send({ t: 'membersInvite', on: false }); so.send({ t: 'chatOff', off: true }); await settle('owner settings', so); await settle('alex settings', sa);
  for(const x of [so, sa, sb]) x.ws.close();
  return out;
}

(async () => {
  // 1. flag off: identical to the base release
  const bData = path.join(tmp, 'base.json'), nData = path.join(tmp, 'new.json');
  let b = start(baseDir, bData); await up(b); const tb = await script(b); await stop(b);
  let s = start(ROOT, nData); await up(s); const ts = await script(s); await stop(s);
  check(tb.length === ts.length && tb.length > 20, `same number of answers (${tb.length})`);
  let diffs = 0;
  tb.forEach((x, i) => { const a = JSON.stringify(x), c = JSON.stringify(ts[i]); if(a !== c){ diffs++; if(diffs < 4) console.log('DIFF', i, '\n base:', a.slice(0, 600), '\n new: ', c.slice(0, 600)); } });
  check(diffs === 0, 'every HTTP answer and socket message is identical with club switching off');
  const kb = Object.keys(JSON.parse(fs.readFileSync(bData, 'utf8'))).map(k => k.replace(/^([a-z]+:).{10,}$/, '$1*')).sort();
  const kn = Object.keys(JSON.parse(fs.readFileSync(nData, 'utf8'))).map(k => k.replace(/^([a-z]+:).{10,}$/, '$1*')).sort();
  if(JSON.stringify(kb) !== JSON.stringify(kn)) console.log('base keys', kb.join(' '), '\nnew keys ', kn.join(' '));
  check(JSON.stringify(kb) === JSON.stringify(kn), 'the same kinds of keys are stored');

  // 2. flag on, on the data file the base release wrote
  const before = JSON.parse(fs.readFileSync(bData, 'utf8'));
  const cData = path.join(tmp, 'compat.json'); fs.copyFileSync(bData, cData);
  s = start(ROOT, cData, { CLUB_SWITCHING: '1' }); await up(s);
  // the base views, again from the base release, to compare with
  b = start(baseDir, path.join(tmp, 'base2.json')); fs.copyFileSync(bData, path.join(tmp, 'base2.json')); await stop(b);
  b = start(baseDir, path.join(tmp, 'base2.json')); await up(b);
  const view = async (srv, name, pin) => {
    const r = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, pin }) });
    const { token } = await r.json();
    return new Promise((res, rej) => { const ws = new WebSocket(srv.base.replace('http', 'ws') + '/ws'); ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token }))); ws.on('message', m => { m = JSON.parse(m); if(m.t === 'club'){ ws.close(); res(m.club); } }); ws.on('error', rej); });
  };
  const strip = v => { const { now, clubSwitching, club, clubs, canCreateClub, ...rest } = v; return JSON.stringify(rest); };
  for(const [name, pin] of [['Director', '1234'], ['Alex', '1111'], ['Bita', '2222']]){
    const on = await view(s, name, pin), off = await view(b, name, pin);
    check(on.club && on.club.id === 'main' && on.clubs.length === 1 && on.clubs[0].id === 'main', `${name} is in the main club only`);
    check(strip(on) === strip(off), `${name}'s view equals the base release's view on the same data`);
  }
  await stop(b); await stop(s);
  const after = JSON.parse(fs.readFileSync(cData, 'utf8'));
  check(Object.keys(before).every(k => k in after), 'no stored key was renamed or removed');
  const changed = Object.keys(before).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]) && !k.startsWith('session:') && !k.startsWith('user:'));
  check(changed.length === 0, 'no club data changed by loading it with club switching on' + (changed.length ? ': ' + changed.join(', ') : ''));
  const userDiff = Object.keys(before).filter(k => k.startsWith('user:')).filter(k => { const { seen: s1, ...a } = before[k], { seen: s2, ...c } = after[k]; return JSON.stringify(a) !== JSON.stringify(c); });
  check(userDiff.length === 0, 'accounts unchanged apart from the last-seen record that signing in always updates');
  check(!Object.keys(after).some(k => k.startsWith('club:') || k.startsWith('clubdef:')), 'nothing club-prefixed was written');
  console.log(`${n} ok, 0 failed`);
  fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
