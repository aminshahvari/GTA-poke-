// P0 deploy race: sigterm_after_loss
// After A has lost the lease and is fenced, SIGTERM (Render retiring the old instance) must make it exit with code 0
// within 1 s, without attempting a final save and without writing anything.
const L = require('./lib');
const NAME = 'sigterm_after_loss', EXPECT_FAIL = false;
let A, B;
L.guard(NAME, EXPECT_FAIL, async () => {
  const dbDir = L.tmpdir('sigterm-loss');
  A = await L.startServer({ mode: 'pg', dbDir, label: 'A' });
  await L.setupClub(A.base, 2);
  B = await L.startServer({ mode: 'pg', dbDir, label: 'B' });
  await L.waitFor(() => /staying up and answering 503/.test(A.log), 8000, 'A fenced');
  const snap = L.readDb(dbDir), issues = [];
  const t0 = Date.now();
  A.proc.kill('SIGTERM');
  const ex = await Promise.race([A.exited, L.sleep(1000).then(() => null)]);
  const ms = Date.now() - t0;
  if(!ex) issues.push('A still running 1 s after SIGTERM');
  else if(ex.code !== 0) issues.push('A exit ' + JSON.stringify(ex));
  if(/final save done/.test(A.log)) issues.push('A reported a final save');
  if((A.log.match(/final save/g) || []).length > 1) issues.push('A tried a second final save');
  const after = L.readDb(dbDir);
  const changed = [...new Set([...Object.keys(snap), ...Object.keys(after)])].filter(k => k !== 'lease' && JSON.stringify(snap[k]) !== JSON.stringify(after[k]));
  if(changed.length) issues.push('database changed: ' + changed.join(','));
  if(after.lease.epoch !== 2 || !/:/.test(after.lease.instance || '')) issues.push('lease ' + JSON.stringify(after.lease));
  const hB = await fetch(B.base + '/healthz').then(r => r.status);
  if(hB !== 200) issues.push('B /healthz ' + hB);
  L.result(NAME, { pass: !issues.length, expectFail: EXPECT_FAIL,
    reason: issues.length ? issues.join('; ') : `fenced A exited 0 in ${ms} ms on SIGTERM, no final save, nothing written; B healthy`,
    notes: [`exit ${JSON.stringify(ex)} after ${ms} ms`] });
}, () => { L.stop(A); L.stop(B); });
