// App files go out brotli- or gzip-compressed (by Accept-Encoding), decode to the exact file, keep their 304s,
// and the pinned /vendor/ files (above all eng.traineddata.gz) still go out as stored bytes with no Content-Encoding.
const assert = require('assert');
const fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
const { spawn } = require('child_process');
const PORT = 4300 + Math.floor(Math.random() * 50);
const DATA = require('os').tmpdir() + '/t_compress_' + process.pid + '.json';
const ROOT = path.join(__dirname, '..');
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// raw GET (fetch would decode the body itself and hide what went over the wire)
const get = (p, headers = {}) => new Promise((ok, no) => http.get({ host: 'localhost', port: PORT, path: p, headers }, res => {
  const parts = []; res.on('data', c => parts.push(c)); res.on('end', () => ok({ status: res.statusCode, h: res.headers, body: Buffer.concat(parts) }));
}).on('error', no));
let n = 0; const ok = m => console.log('ok', ++n, m);

(async () => {
  for(let i = 0; i < 40; i++){ try{ if((await get('/healthz')).status === 200) break; }catch(e){} await sleep(150); }
  const files = { '/app.js': 'public/app.js', '/style.css': 'public/style.css', '/engine.js': 'server/engine.js', '/join/blindrise': 'public/index.html', '/': 'public/index.html' };
  const tags = {};
  for(const [p, f] of Object.entries(files)){
    const raw = fs.readFileSync(path.join(ROOT, f));
    const br = await get(p, { 'accept-encoding': 'gzip, deflate, br' });
    assert.strictEqual(br.status, 200, p);
    assert.strictEqual(br.h['content-encoding'], 'br', 'brotli when offered: ' + p);
    assert.strictEqual(br.h.vary, 'Accept-Encoding', p);
    assert.strictEqual(br.h['cache-control'], 'no-cache', p);
    assert.ok(br.h['content-security-policy'] && br.h['x-content-type-options'] === 'nosniff', 'security headers kept: ' + p);
    assert.ok(br.body.length < raw.length / 2, 'smaller: ' + p);
    assert.ok(zlib.brotliDecompressSync(br.body).equals(raw), 'brotli decodes to the file: ' + p);
    const gz = await get(p, { 'accept-encoding': 'gzip' });
    assert.strictEqual(gz.h['content-encoding'], 'gzip', 'gzip when br is not offered: ' + p);
    assert.ok(zlib.gunzipSync(gz.body).equals(raw), 'gzip decodes to the file: ' + p);
    const plain = await get(p);
    assert.strictEqual(plain.h['content-encoding'], undefined, 'no encoding asked, none sent: ' + p);
    assert.ok(plain.body.equals(raw), 'plain bytes: ' + p);
    const refused = await get(p, { 'accept-encoding': 'br;q=0, gzip' });
    assert.strictEqual(refused.h['content-encoding'], 'gzip', 'q=0 refuses br: ' + p);
    assert.strictEqual(br.h['content-type'], plain.h['content-type'], 'same type: ' + p);
    assert.ok(new Set([br.h.etag, gz.h.etag, plain.h.etag]).size === 3, 'each encoding has its own ETag: ' + p);
    tags[p] = { br: br.h.etag, gz: gz.h.etag, plain: plain.h.etag };
    ok('compressed and exact: ' + p + ' (' + raw.length + ' -> br ' + br.body.length + ', gzip ' + gz.body.length + ')');
  }
  // 304: the copy the browser holds is still good, whichever encoding it came in
  const t = tags['/app.js'];
  for(const [have, ae] of [[t.br, 'br'], [t.gz, 'gzip'], [t.plain, ''], [t.br, 'gzip'], ['W/' + t.br, 'br'], ['"old", ' + t.gz, 'gzip, br']]){
    const r = await get('/app.js', { 'if-none-match': have, 'accept-encoding': ae });
    assert.strictEqual(r.status, 304, 'unchanged app.js answers 304 for ' + have + ' / ' + ae);
    assert.strictEqual(r.body.length, 0);
    assert.strictEqual(r.h['cache-control'], 'no-cache');
  }
  assert.strictEqual((await get('/app.js', { 'if-none-match': '"old"', 'accept-encoding': 'br' })).status, 200, 'a stale tag gets the file');
  ok('304 still works for every encoding');
  // small files and images are left alone
  const png = await get('/icon-180.png', { 'accept-encoding': 'br, gzip' });
  assert.strictEqual(png.status, 200); assert.strictEqual(png.h['content-encoding'], undefined, 'images are not re-compressed');
  assert.ok(png.body.equals(fs.readFileSync(path.join(ROOT, 'public/icon-180.png'))));
  ok('images go out as stored');
  // pinned vendor files: stored bytes, no Content-Encoding, year-long cache (the card reader unzips eng.traineddata.gz itself)
  for(const rel of ['tessdata-eng-1.0.0/eng.traineddata.gz', 'qrcode-generator-2.0.4/qrcode.js']){
    const r = await get('/vendor/' + rel, { 'accept-encoding': 'gzip, deflate, br' });
    assert.strictEqual(r.status, 200, rel);
    assert.strictEqual(r.h['content-encoding'], undefined, 'no Content-Encoding: ' + rel);
    assert.strictEqual(r.h['cache-control'], 'public, max-age=31536000, immutable', rel);
    assert.ok(r.body.equals(fs.readFileSync(path.join(ROOT, 'public/vendor', rel))), 'stored bytes: ' + rel);
  }
  const gzData = (await get('/vendor/tessdata-eng-1.0.0/eng.traineddata.gz', { 'accept-encoding': 'gzip' })).body;
  assert.ok(gzData[0] === 0x1f && gzData[1] === 0x8b, 'language data arrives still gzipped (once)');
  ok('vendor files stay unencoded');
  // API answers are unchanged (not compressed)
  const r = await fetch('http://localhost:' + PORT + '/api/joinInfo', { method: 'POST', headers: { 'content-type': 'application/json', 'accept-encoding': 'br, gzip' }, body: JSON.stringify({ slug: 'blindrise' }) });
  assert.strictEqual(r.headers.get('content-encoding'), null, 'API JSON not compressed');
  assert.strictEqual(r.headers.get('cache-control'), 'no-store');
  ok('API answers unchanged');
  assert.strictEqual((await get('/../server/index.js')).status, 404, 'no path traversal');
  assert.strictEqual((await get('/nope.js', { 'accept-encoding': 'br' })).status, 404);
  ok('404s unchanged');
  console.log('t_compress: ' + n + ' passed');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){} });
