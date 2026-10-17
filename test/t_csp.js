// Content-Security-Policy and the self-hosted card reader files (public/vendor/). No browser needed;
// test/browser/scan_csp.js does the in-browser check.
const assert = require('assert');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const PORT = 4200 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_csp_' + process.pid + '.json';
const ROOT = path.join(__dirname, '..');
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', CLUBS_DEFAULT: 'on' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' wss:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const YEAR = 'public, max-age=31536000, immutable';

(async () => {
  for(let i = 0; i < 40; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  for(const p of ['/', '/join/abc', '/app.js', '/business.js', '/style.css']){
    const r = await fetch(BASE + p);
    assert.strictEqual(r.status, 200, p);
    assert.strictEqual(r.headers.get('content-security-policy'), CSP, 'CSP on ' + p);
    assert.strictEqual(r.headers.get('cache-control'), 'no-store', 'app files are not cached long: ' + p);
    assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  }
  assert.ok(!/jsdelivr|unpkg|cdnjs/.test(CSP), 'no CDN in the CSP');
  // no third-party script or worker URL left in the app code
  for(const f of ['index.html', 'app.js', 'business.js', 'cardparse.js', 'sw.js'])
    assert.ok(!/cdn\.jsdelivr\.net|unpkg\.com|cdnjs/.test(fs.readFileSync(path.join(ROOT, 'public', f), 'utf8')), 'no CDN reference in ' + f);

  // vendored files: pinned by sha256, right type, served as stored bytes, cached for a year
  const sums = fs.readFileSync(path.join(ROOT, 'public/vendor/SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split(/\s+/));
  assert.ok(sums.length >= 9, 'all vendored files listed');
  const want = { '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.gz': 'application/octet-stream' };
  for(const [sum, rel] of sums){
    const r = await fetch(BASE + '/vendor/' + rel), buf = Buffer.from(await r.arrayBuffer());
    assert.strictEqual(r.status, 200, rel);
    assert.strictEqual(crypto.createHash('sha256').update(buf).digest('hex'), sum, 'served bytes match the pinned sha256: ' + rel);
    assert.strictEqual(r.headers.get('cache-control'), YEAR, 'long cache: ' + rel);
    assert.strictEqual(r.headers.get('content-encoding'), null, 'no Content-Encoding (the reader unzips the data itself): ' + rel);
    assert.strictEqual(buf.length, fs.statSync(path.join(ROOT, 'public/vendor', rel)).size, 'full file: ' + rel);
    const ext = path.extname(rel);
    if(want[ext]) assert.strictEqual(r.headers.get('content-type'), want[ext], 'type of ' + rel);
  }
  const gz = Buffer.from(await (await fetch(BASE + '/vendor/tessdata-eng-1.0.0/eng.traineddata.gz')).arrayBuffer());
  assert.ok(gz[0] === 0x1f && gz[1] === 0x8b, 'language data arrives still gzipped');
  // the paths business.js asks for exist
  const biz = fs.readFileSync(path.join(ROOT, 'public/business.js'), 'utf8');
  for(const f of ['tesseract.min.js', 'worker.min.js', 'tesseract-core-simd-lstm.js', 'tesseract-core-lstm.js']) assert.ok(biz.includes(f) && sums.some(([, rel]) => rel === 'tesseract-5.1.1/' + f), 'business.js and vendor agree on ' + f);
  assert.ok(biz.includes("'/vendor/tessdata-eng-1.0.0'") && biz.includes('workerBlobURL: false'), 'language path and no blob: worker');
  // the year-long cache is only for /vendor/, and only for files that exist
  assert.strictEqual((await fetch(BASE + '/vendor/nope.js')).status, 404);
  assert.notStrictEqual((await fetch(BASE + '/vendor/nope.js')).headers.get('cache-control'), YEAR);
  assert.strictEqual((await fetch(BASE + '/vendor/../../server/index.js')).status, 404, 'no path traversal');
  assert.strictEqual((await fetch(BASE + '/vendor/%2e%2e/%2e%2e/server/index.js')).status, 404, 'no encoded path traversal');
  console.log('csp + vendor test passed');
  srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
