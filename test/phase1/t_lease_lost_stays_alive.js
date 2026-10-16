// P0 deploy race: lease_lost_stays_alive
// A owns the database; B boots and takes the lease. A must NOT exit (a supervisor such as Render restarts processes that
// exit, and a restarted old process would claim the lease back). For 10 s A must stay up and fenced: /healthz 503 with
// leaseLost, every API call 503, its sockets closed with 4001, new websockets closed with 4001, and nothing written.
const L = require('./lib');
const WebSocket = require('ws');
const NAME = 'lease_lost_stays_alive', EXPECT_FAIL = false;
let A, B, clients = [];
L.guard(NAME, EXPECT_FAIL, async () => {
  const dbDir = L.tmpdir('alive');
  A = await L.startServer({ mode: 'pg', dbDir, label: 'A' });
  const tokens = await L.setupClub(A.base, 2);
  clients = await Promise.all(tokens.map((t, i) => L.connect(A.port, t, { i })));
  B = await L.startServer({ mode: 'pg', dbDir, label: 'B' });
  await L.waitFor(() => /lease lost/.test(A.log), 8000, 'A notices the lost lease');
  const snap = L.readDb(dbDir), issues = [];
  const ex = await Promise.race([A.exited, L.sleep(10000).then(() => null)]);
  if(ex) issues.push('A exited ' + JSON.stringify(ex));
  const h = await fetch(A.base + '/healthz').then(async r => ({ status: r.status, ...(await r.json()) })).catch(e => ({ error: e.message }));
  if(h.status !== 503 || h.leaseLost !== true) issues.push('A /healthz ' + JSON.stringify(h));
  const calls = await Promise.all([['/api/invite', {}, tokens[0]], ['/api/login', { name: 'Owner', pin: '1234' }], ['/api/status', {}]]
    .map(([p, b, t]) => L.post(A.base, p, b, t).then(r => r.status).catch(e => 'error ' + e.message)));
  if(calls.some(c => c !== 503)) issues.push('A API answered ' + calls.join(','));
  const codes = [...new Set(clients.map(c => c.closeCode))];
  if(codes.join() !== '4001') issues.push('A closed open sockets with ' + codes.join());
  const fresh = await new Promise(res => { const ws = new WebSocket(`ws://127.0.0.1:${A.port}/ws`); ws.on('close', c => res(c)); ws.on('error', e => res('error ' + e.message)); setTimeout(() => res('still open'), 3000); });
  if(fresh !== 4001) issues.push('new websocket to A: ' + fresh);
  const after = L.readDb(dbDir);
  const changed = [...new Set([...Object.keys(snap), ...Object.keys(after)])].filter(k => k !== 'lease' && JSON.stringify(snap[k]) !== JSON.stringify(after[k]));
  if(changed.length) issues.push('database changed while A was fenced: ' + changed.join(','));
  if(after.lease.epoch !== 2) issues.push('lease epoch ' + after.lease.epoch);
  if(!/staying up and answering 503/.test(A.log)) issues.push('A did not log the fenced state');
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL,
    reason: issues.length ? issues.join('; ') : 'A stayed up 10 s after losing the lease: healthz 503 leaseLost, API 503, sockets 4001, nothing written',
    notes: [`healthz ${JSON.stringify(h)}; API ${calls.join(',')}; new ws ${fresh}`] });
}, () => { L.closeAll(clients); L.stop(A); L.stop(B); });
