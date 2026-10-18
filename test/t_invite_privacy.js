// Who invited whom: the owner sees it for every member; a member sees only their own inviter, never anyone else's.
const assert = require('assert');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 4300 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_invite_privacy_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', CLUBS_DEFAULT: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ok(p, body, tok){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) });
  const b = await r.json().catch(() => ({})); assert.strictEqual(r.status, 200, `${p}: ${JSON.stringify(b)}`); return b;
}
function clubView(tok){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok })));
    ws.on('message', m => { m = JSON.parse(m); if(m.t === 'auth' && !m.ok) rej(new Error('auth')); if(m.t === 'club'){ ws.close(); res(m.club); } });
    ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000);
  });
}
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
(async () => {
  for(let i = 0; i < 40; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const A = (await ok('redeem', { code: (await ok('invite', {}, O)).code, name: 'Alex', pin: '1111', agree: true })).token;
  const C = (await ok('redeem', { code: (await ok('invite', {}, O)).code, name: 'Cyrus', pin: '3333', agree: true })).token;
  const B = (await ok('redeem', { code: (await ok('invite', {}, A)).code, name: 'Bita', pin: '2222', agree: true })).token;
  const ownerV = await clubView(O), id = name => ownerV.members.find(m => m.name === name).id, by = (v, name) => v.members.find(m => m.name === name).invitedBy;
  const [oid, aid] = [ownerV.me.id, id('Alex')];

  check(by(ownerV, 'Alex') === oid && by(ownerV, 'Cyrus') === oid && by(ownerV, 'Bita') === aid, 'owner sees every member\'s inviter');
  const bV = await clubView(B);
  check(by(bV, 'Bita') === aid, 'a member sees their own inviter');
  check(by(bV, 'Alex') === null && by(bV, 'Cyrus') === null, 'a member does not see other members\' inviters');
  const cV = await clubView(C);
  check(by(cV, 'Bita') === null && by(cV, 'Alex') === null, 'an unrelated member sees no inviter for anyone else');
  check(!cV.members.some(m => m.id !== cV.me.id && m.invitedBy), 'no other member\'s inviter in a member payload at all');
  const aV = await clubView(A);
  check(by(aV, 'Bita') === null && aV.invitedCount === 1, 'the inviter sees only a count of who joined through them, not the names');
  check(cV.members.length === ownerV.members.length, 'members still see the full member list');
  console.log(`${n} ok, 0 failed`);
  srv.kill(); try{ require('fs').unlinkSync(DATA); }catch(e){} process.exit(0);
})().catch(e => { console.error('FAIL', e.message); srv.kill(); process.exit(1); });
