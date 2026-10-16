// Content-Security-Policy header as actually served, at three commits (evidence item 7). Local only.
// For each commit: a temporary detached `git worktree` in the OS temp folder (node_modules symlinked from this
// checkout), a local server (STAGING=1, throwaway DATA_FILE), GET / and POST /api/status, print the security headers,
// then the server is stopped and the temporary worktree removed. Also lists every <script>/<link> origin in index.html.
//
// Usage (from the repository root): node docs/evidence/2026-10-16/scripts/csp-headers.js [commit ...]
//   default commits: 1e6953f (before BC1)  18bb929 (BC1)  a3c67e9 (staging tip, audited)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const L = require('./lib');
const COMMITS = process.argv.slice(2).length ? process.argv.slice(2) : ['1e6953f', '18bb929', 'a3c67e9'];
const LABEL = { '1e6953f': 'before BC1 (B0 on staging)', '18bb929': 'BC1 app commit', 'a3c67e9': 'staging tip (audited)' };
const git = (...a) => execFileSync('git', a, { cwd: L.ROOT, encoding: 'utf8' }).trim();

(async () => {
  const out = [];
  for(const c of COMMITS){
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-' + c + '-'));
    fs.rmSync(dir, { recursive: true, force: true });
    git('worktree', 'add', '--detach', dir, c);
    fs.symlinkSync(path.join(L.ROOT, 'node_modules'), path.join(dir, 'node_modules'));
    try{
      const srv = await L.startServer({ cwd: dir });
      const g = await fetch(srv.base + '/');
      const html = await g.text();
      const p = await fetch(srv.base + '/api/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const origins = [...html.matchAll(/<(script|link)[^>]+(?:src|href)="([^"]+)"/g)].map(m => m[1] + ' ' + m[2]).filter(s => /https?:\/\//.test(s));
      const row = { commit: git('rev-parse', '--short', c), label: LABEL[c] || '', csp: g.headers.get('content-security-policy'),
        xContentTypeOptions: g.headers.get('x-content-type-options'), referrerPolicy: g.headers.get('referrer-policy'),
        apiCsp: p.headers.get('content-security-policy'), externalTagsInIndexHtml: origins, vendorDir: fs.existsSync(path.join(dir, 'public', 'vendor')) };
      out.push(row);
      console.log(`\n== ${row.commit} ${row.label}`);
      console.log('GET / Content-Security-Policy:', row.csp);
      console.log('POST /api/status Content-Security-Policy identical:', row.apiCsp === row.csp);
      console.log('X-Content-Type-Options:', row.xContentTypeOptions, '| Referrer-Policy:', row.referrerPolicy);
      console.log('external <script>/<link> in index.html:', origins.length ? origins.join(' ; ') : 'none');
      console.log('public/vendor/ present:', row.vendorDir);
      L.stopAll(); await L.sleep(300);
    } finally {
      git('worktree', 'remove', '--force', dir);
    }
  }
  fs.writeFileSync(path.join(L.EVID, 'raw', 'csp-headers.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('\nsaved raw/csp-headers.json; temporary worktrees removed:', git('worktree', 'list').split('\n').filter(l => l.includes('csp-')).length === 0);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); L.stopAll(); process.exit(2); });
