// 8. sessions_owner_reset (B6, fixed in Release 2)
// Runs without FAST so the login rate limits are live (server/index.js disables them under FAST).
// a) setup + login create tokens; resetOwner with OWNER_CODE must invalidate every older owner token, and an owner
//    socket that was open before the reset must be closed and stop receiving club broadcasts.
// b) wrong setup codes are limited per source address: 5 from one address lock that address, but wrong codes from
//    other addresses do not lock the real owner out; a club-wide cap stops guessing spread over many addresses.
// c) a removed member's sessions are deleted and an already-open socket stops receiving club broadcasts (B7).
const WebSocket = require('ws');
const L = require('./lib');
const NAME = 'sessions_owner_reset', EXPECT_FAIL = false;
let srv; const open = [];

const hello = (port, token) => new Promise(res => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); open.push(ws);
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token })));
  ws.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'auth'){ res(m.ok); ws.close(); } });
  setTimeout(() => res(null), 2000);
});
const postIp = async (base, p, body, ip) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };

L.guard(NAME, EXPECT_FAIL, async () => {
  const dir = L.tmpdir('sess');
  srv = await L.startServer({ dataFile: dir + '/club.json', fast: false, label: 'A' });
  const issues = [], notes = [];
  // a) owner tokens across a reset
  const tokSetup = (await L.post(srv.base, '/api/setup', { code: 'p1-secret', name: 'Owner', pin: '1234', agree: true })).token;
  const tokLogin = (await L.post(srv.base, '/api/login', { name: 'Owner', pin: '1234' })).token;
  if(!(await hello(srv.port, tokSetup)) || !(await hello(srv.port, tokLogin))) throw new Error('fresh tokens not accepted');
  // a member who will be removed later, connected before the removal
  const { code } = await L.post(srv.base, '/api/invite', {}, tokSetup);
  const tokMember = (await L.post(srv.base, '/api/redeem', { code, name: 'Member', pin: '4321', agree: true })).token;
  const member = await L.connect(srv.port, tokMember, { i: 5, policy: 'none' });
  const oldOwner = await L.connect(srv.port, tokLogin, { i: 1, policy: 'none' });
  let oldClosed = null; oldOwner.ws.on('close', code => oldClosed = code);
  const reset = await L.post(srv.base, '/api/resetOwner', { code: 'p1-secret', pin: '5678' });
  if(!reset.token) throw new Error('resetOwner failed ' + JSON.stringify(reset));
  const oldA = await hello(srv.port, tokSetup), oldB = await hello(srv.port, tokLogin), fresh = await hello(srv.port, reset.token);
  if(oldA || oldB) issues.push(`owner tokens from before resetOwner still valid (setup token=${oldA}, login token=${oldB})`);
  if(!fresh) issues.push('new token from resetOwner rejected');
  if((await L.post(srv.base, '/api/login', { name: 'Owner', pin: '1234' })).token) issues.push('old PIN still logs in after reset');
  await L.sleep(300);
  if(oldClosed === null) issues.push('owner socket opened before the reset is still open');
  const o0 = oldOwner.msgs.filter(m => m.t === 'club').length;
  // c) removed member keeps receiving club broadcasts on an open socket
  const owner = await L.connect(srv.port, reset.token, { i: 0, policy: 'none' });
  owner.send({ t: 'remove', uid: member.id });
  await L.waitFor(() => owner.club.members.every(m => m.id !== member.id), 2000, 'member removed');
  const n0 = member.msgs.filter(m => m.t === 'club').length;
  owner.send({ t: 'create', name: 'After removal' });
  await L.sleep(400);
  const after = member.msgs.filter(m => m.t === 'club').length - n0;
  const oldAfter = oldOwner.msgs.filter(m => m.t === 'club').length - o0;
  if(oldAfter > 0) issues.push(`owner socket from before the reset got ${oldAfter} club broadcast(s)`);
  if(after > 0) issues.push(`removed member's open socket got ${after} club broadcast(s) after removal (sees tourney "${member.club.tourney && member.club.tourney.name}")`);
  if(await hello(srv.port, tokMember)) issues.push('removed member token still authenticates');
  L.closeAll([owner, member, oldOwner]);
  // b) one address: the 6th wrong code is refused, and so is the right code from that address
  const one = [];
  for(let i = 0; i < 6; i++) one.push((await postIp(srv.base, '/api/resetOwner', { code: 'wrong' + i, pin: '9999' }, '203.0.113.9')).status);
  if(one[5] !== 429 || one.slice(0, 5).some(s => s === 429)) issues.push('one address: expected 5 tries then 429, got ' + one.join(','));
  // wrong codes from 12 other addresses (1 each) must not lock the real owner out
  const spread = [];
  for(let i = 0; i < 12; i++) spread.push((await postIp(srv.base, '/api/resetOwner', { code: 'other' + i, pin: '9999' }, '203.0.113.' + (100 + i))).status);
  if(spread.includes(429)) issues.push('spread wrong codes hit a limit early: ' + spread.join(','));
  const legit = await postIp(srv.base, '/api/resetOwner', { code: 'p1-secret', pin: '2468' }, '198.51.100.7');
  if(legit.status !== 200) issues.push(`real owner locked out of recovery after strangers' wrong codes: ${legit.status} ${legit.error || ''}`);
  notes.push(`one address: ${one.join(',')}; 12 addresses: ${spread.join(',')}; real owner from own address: ${legit.status}`);
  // club-wide cap: 60 wrong codes in 10 minutes (18 so far) stop recovery from every address
  const many = [];
  for(let i = 0; i < 50; i++) many.push((await postIp(srv.base, '/api/resetOwner', { code: 'bulk' + i, pin: '9999' }, '192.0.2.' + (1 + (i >> 2)))).status);
  const capAt = many.indexOf(429);
  if(capAt < 0) issues.push('wrong codes spread over many addresses never capped');
  else notes.push(`club-wide cap reached after ${18 + capAt} wrong codes in total`);
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL, reason: issues.length ? issues.join('; ') : 'sessions behave', notes });
}, () => { open.forEach(w => { try{ w.terminate(); }catch(e){} }); L.stop(srv); });
