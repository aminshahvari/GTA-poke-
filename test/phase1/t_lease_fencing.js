// 5b. lease_fencing (B1)
// A owns the database (lease epoch 1). B boots on the same database and takes the lease (epoch 2). A's next save is a
// stale-epoch flush: it must be rolled back (nothing A changed after the takeover reaches the database), A must close
// its sockets with 4001 'server moved' and exit, and /healthz on B must report the new epoch.
const L = require('./lib');
const NAME = 'lease_fencing', EXPECT_FAIL = false;
let A, B, clients = [];
L.guard(NAME, EXPECT_FAIL, async () => {
  const dbDir = L.tmpdir('lease');
  A = await L.startServer({ mode: 'pg', dbDir, label: 'A' });
  const hA = await (await fetch(A.base + '/healthz')).json();
  const tokens = await L.setupClub(A.base, 2);
  clients = await Promise.all(tokens.map((t, i) => L.connect(A.port, t, { i })));
  await L.sleep(100);
  B = await L.startServer({ mode: 'pg', dbDir, label: 'B' });
  const before = L.readDb(dbDir);
  // a write on A after the takeover: a new invite (store.set('invite:...')) through A's HTTP API
  const inv = await L.post(A.base, '/api/invite', {}, tokens[0]).catch(e => ({ error: e.message }));
  const ex = await Promise.race([A.exited, L.sleep(8000).then(() => null)]);
  const after = L.readDb(dbDir), issues = [];
  const newKeys = Object.keys(after).filter(k => !(k in before));
  const changed = Object.keys(before).filter(k => k !== 'lease' && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if(newKeys.length || changed.length) issues.push(`stale instance wrote after takeover: new ${newKeys.join(',') || '-'}, changed ${changed.join(',') || '-'}`);
  if(!ex) issues.push('A did not exit after losing the lease');
  if(!/lease lost/.test(A.log)) issues.push('A never reported a lost lease');
  const codes = [...new Set(clients.map(c => c.closeCode))];
  if(codes.join() !== '4001') issues.push('A closed sockets with ' + codes.join());
  const hB = await (await fetch(B.base + '/healthz')).json();
  if(hA.epoch !== 1 || hB.epoch !== 2 || after.lease.epoch !== 2) issues.push(`epochs A ${hA.epoch} B ${hB.epoch} db ${after.lease.epoch}`);
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL,
    reason: issues.length ? issues.join('; ') : 'stale-epoch flush rolled back; old instance closed sockets (4001) and exited without writing',
    notes: [`invite on A answered ${JSON.stringify(inv).slice(0, 80)}; A exit=${JSON.stringify(ex)}; healthz A ${JSON.stringify(hA)} B ${JSON.stringify(hB)}`,
      `A said: ${(A.log.match(/lease lost[^\n]*/) || ['-'])[0]}`] });
}, () => { L.closeAll(clients); L.stop(A); L.stop(B); });
