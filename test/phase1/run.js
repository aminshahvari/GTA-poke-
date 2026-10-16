// Runs the phase-1 robustness tests one after another and prints a summary table.
//   node test/phase1/run.js            all tests
//   node test/phase1/run.js reconnect  only tests whose name contains "reconnect"
// Several tests are EXPECTED to fail against today's code: they document known bugs. Exit code is 1 only when a test
// that is expected to pass fails (or a test crashes); an unexpected PASS is reported so the flag can be flipped.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');

const ORDER = ['db_failure', 'finish_crash', 'sigterm_mid_hand', 'duplicate_actions', 'two_instances', 'lease_fencing', 'reconnect', 'fair_after_interrupt', 'sessions_owner_reset'];
const filter = process.argv[2];
const files = ORDER.map(n => 't_' + n + '.js').filter(f => fs.existsSync(path.join(__dirname, f)) && (!filter || f.includes(filter)));
const rows = [];
for(const f of files){
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 60000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out.split('\n').filter(l => !l.startsWith('P1RESULT ')).join('\n'));
  const line = out.split('\n').find(l => l.startsWith('P1RESULT '));
  const res = line ? JSON.parse(line.slice(9)) : { name: f.slice(2, -3), pass: false, expectFail: null, reason: 'no result line (crashed or timed out)' };
  rows.push({ ...res, secs });
}
const verdict = r => r.expectFail == null ? 'CRASH' : r.pass ? (r.expectFail ? 'UNEXPECTED PASS' : 'ok') : (r.expectFail ? 'known bug' : 'REGRESSION');
const w = [22, 6, 9, 16, 6];
const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + [pad('test', w[0]), pad('result', w[1]), pad('expected', w[2]), pad('verdict', w[3]), pad('secs', w[4]), 'reason'].join(' | '));
console.log('-'.repeat(120));
for(const r of rows) console.log([pad(r.name, w[0]), pad(r.pass ? 'PASS' : 'FAIL', w[1]), pad(r.expectFail ? 'FAIL' : r.expectFail === false ? 'PASS' : '?', w[2]), pad(verdict(r), w[3]), pad(r.secs, w[4]), r.reason.slice(0, 160)].join(' | '));
const bad = rows.filter(r => ['REGRESSION', 'CRASH'].includes(verdict(r)));
console.log(`\n${rows.length} tests: ${rows.filter(r => r.pass).length} pass, ${rows.filter(r => !r.pass).length} fail (${rows.filter(r => !r.pass && r.expectFail).length} expected), ${bad.length} unexpected failures`);
process.exit(bad.length ? 1 : 0);
