// 8. sessions_owner_reset (EXPECTED TO FAIL today)
// Runs without FAST so the login rate limits are live (server/index.js:42 disables them under FAST).
// a) setup + login create tokens; resetOwner with OWNER_CODE must invalidate the owner's older tokens
//    (resetOwner only adds a new session, server/index.js:84-91 - expected FAIL).
// b) wrong setup codes are rate limited (acct:#owner, 10 per 10 min, server/index.js:48 + :167).
// c) a removed member's sessions are deleted, but an already-open socket keeps ws.user and still receives every club
//    broadcast (broadcastClub sends to any socket with ws.user, server/index.js:242-246 - expected FAIL).
const WebSocket = require('ws');
const L = require('./lib');
const NAME = 'sessions_owner_reset', EXPECT_FAIL = true;
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
  const reset = await L.post(srv.base, '/api/resetOwner', { code: 'p1-secret', pin: '5678' });
  if(!reset.token) throw new Error('resetOwner failed ' + JSON.stringify(reset));
  const oldA = await hello(srv.port, tokSetup), oldB = await hello(srv.port, tokLogin), fresh = await hello(srv.port, reset.token);
  if(oldA || oldB) issues.push(`owner tokens from before resetOwner still valid (setup token=${oldA}, login token=${oldB})`);
  if(!fresh) issues.push('new token from resetOwner rejected');
  if((await L.post(srv.base, '/api/login', { name: 'Owner', pin: '1234' })).token) issues.push('old PIN still logs in after reset');
  // c) removed member keeps receiving club broadcasts on an open socket
  const owner = await L.connect(srv.port, reset.token, { i: 0, policy: 'none' });
  owner.send({ t: 'remove', uid: member.id });
  await L.waitFor(() => owner.club.members.every(m => m.id !== member.id), 2000, 'member removed');
  const n0 = member.msgs.filter(m => m.t === 'club').length;
  owner.send({ t: 'create', name: 'After removal' });
  await L.sleep(400);
  const after = member.msgs.filter(m => m.t === 'club').length - n0;
  if(after > 0) issues.push(`removed member's open socket got ${after} club broadcast(s) after removal (sees tourney "${member.club.tourney && member.club.tourney.name}")`);
  if(await hello(srv.port, tokMember)) issues.push('removed member token still authenticates');
  L.closeAll([owner, member]);
  // b) wrong owner code is rate limited (10 per account, spread over many IPs so the per-IP limit is not what trips)
  const codes = [];
  for(let i = 0; i < 12; i++) codes.push((await postIp(srv.base, '/api/resetOwner', { code: 'wrong' + i, pin: '9999' }, '203.0.113.' + (i + 1))).status);
  const limitedAt = codes.indexOf(429);
  if(limitedAt < 0) issues.push('wrong resetOwner codes never rate limited: ' + codes.join(','));
  else notes.push(`wrong codes: statuses ${codes.join(',')} (limited from attempt ${limitedAt + 1})`);
  const legit = await postIp(srv.base, '/api/resetOwner', { code: 'p1-secret', pin: '2468' }, '198.51.100.7');
  notes.push(`after the lockout the real owner with the correct code gets ${legit.status} ${legit.error || ''} - anyone can lock the owner out of recovery for 10 min`);
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL, reason: issues.length ? issues.join('; ') : 'sessions behave', notes });
}, () => { open.forEach(w => { try{ w.terminate(); }catch(e){} }); L.stop(srv); });
