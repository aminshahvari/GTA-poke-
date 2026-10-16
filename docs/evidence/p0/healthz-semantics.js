// C2: observe /healthz in each server state, locally, against the real server/index.js + store.js (fake pg via
// test/phase1/pgstub.js). Prints one line per state. Never touches DATABASE_URL or any remote host.
const L = require('../../../test/phase1/lib');
const hz = async s => { try{ const r = await fetch(s.base + '/healthz'); return `${r.status} ${await r.text()}`; }catch(e){ return 'no answer (' + (e.cause && e.cause.code || e.message) + ')'; } };
const root = async s => { try{ const r = await fetch(s.base + '/'); return String(r.status); }catch(e){ return 'no answer'; } };
(async () => {
  const dbDir = L.tmpdir('hz');
  const A = await L.startServer({ mode: 'pg', dbDir, label: 'A' });
  console.log('1 leader, healthy          /healthz', await hz(A), '| / ', await root(A));
  const B = await L.startServer({ mode: 'pg', dbDir, label: 'B' });
  await L.sleep(3500); // one heartbeat
  console.log('2 A after B took the lease /healthz', await hz(A), '| / ', await root(A), '| A alive:', !A.exit);
  console.log('2 B new leader             /healthz', await hz(B));
  await L.stop(A, 'SIGTERM'); await L.stop(B, 'SIGKILL');
  // database unreachable right after the first member is saved (owner setup writes a user: key)
  const dbDir2 = L.tmpdir('hz2');
  const C = await L.startServer({ mode: 'pg', dbDir: dbDir2, fault: { match: { prefix: 'user:' }, action: 'down' }, label: 'C' });
  await L.post(C.base, '/api/setup', { code: 'p1-secret', name: 'Hz Director', pin: '246810', agree: true });
  await L.sleep(7000);
  console.log('3 leader, database down    /healthz', await hz(C));
  // SIGTERM while holding the lease, database down: final save waits up to 10 s
  C.proc.kill('SIGTERM'); await L.sleep(300);
  console.log('4 SIGTERM, final save      /healthz', await hz(C));
  console.log('  C exit', JSON.stringify(await C.exited));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
