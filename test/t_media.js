// The media lab (owner GO 2026-10-21: preview only, local storage, test data):
//  - off unless MEDIA_LAB=1, and never on the production database
//  - uploads go to a signed, short-lived link and are checked again by the server: size, type, no EXIF in a photo,
//    a video's length from its MP4 header
//  - reads need a signed link, which only a member of that club is given; a changed link opens nothing
//  - the R2 signing (for the production step, not used yet) matches AWS's published example
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const M = require('../server/media');
const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };

// test files: a JPEG with and without an EXIF block, and an MP4 whose header says how long it is
const SOF = Buffer.from([0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
const jpeg = (exif, pad = 2000) => Buffer.concat([Buffer.from([0xff, 0xd8]), exif ? Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x10]), Buffer.from('Exif\0\0'), Buffer.alloc(8)]) : Buffer.alloc(0), SOF, Buffer.alloc(pad)]);
const box = (t, body) => { const b = Buffer.alloc(8); b.writeUInt32BE(8 + body.length); b.write(t, 4, 'latin1'); return Buffer.concat([b, body]); };
function mp4(seconds, pad = 5000, where){
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(Math.round(seconds * 1000), 16);
  // where: a location box as an iPhone writes it (udta/©xyz in the movie, and a keys/ilst meta inside a track)
  const loc = where ? [box('udta', box('\xa9xyz', Buffer.from('+43.6532-079.3832/', 'latin1'))), box('trak', box('meta', Buffer.from('com.apple.quicktime.location.ISO6709')))] : [];
  return Buffer.concat([box('ftyp', Buffer.from('isom\0\0\0\0isomavc1')), box('moov', Buffer.concat([box('mvhd', mvhd), ...loc])), box('mdat', Buffer.alloc(pad, 7))]);
}
const MP4META = require('../public/lab/mp4meta');
// a fragmented MP4 as Safari's MediaRecorder writes it: the header says 0 s; the fragments carry the sample durations
function fmp4(seconds, perSample){
  const full = (t, vf, body) => box(t, Buffer.concat([Buffer.from([0, (vf >> 16) & 255, (vf >> 8) & 255, vf & 255]), body]));
  const u = (...n) => { const b = Buffer.alloc(4 * n.length); n.forEach((x, k) => b.writeUInt32BE(x, 4 * k)); return b; };
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12);
  const tkhd = full('tkhd', 0, Buffer.concat([u(0, 0, 1), Buffer.alloc(72)])), mdhd = full('mdhd', 0, u(0, 0, 600, 0, 0));
  const frames = Math.round(seconds * 30), half = Math.floor(frames / 2);
  const trun = (n) => perSample ? full('trun', 0x100, Buffer.concat([u(n), ...Array.from({ length: n }, () => u(20))])) : full('trun', 0, u(n));
  const moof = n => box('moof', box('traf', Buffer.concat([full('tfhd', 8, u(1, 20)), trun(n)])));
  return Buffer.concat([box('ftyp', Buffer.from('mp42\0\0\0\0mp42isom')), box('moov', Buffer.concat([box('mvhd', mvhd), box('trak', Buffer.concat([tkhd, box('mdia', mdhd)])), box('mvex', full('trex', 0, u(1, 1, 0, 0, 0)))])),
    moof(half), box('mdat', Buffer.alloc(1000)), moof(frames - half), box('mdat', Buffer.alloc(1000))]);
}

(async () => {
  // ---------- in process ----------
  check(M.hasExif(jpeg(true)) && !M.hasExif(jpeg(false)), 'EXIF is found in a JPEG that has it, and not in one that does not');
  check(M.mp4Seconds(mp4(12)) === 12 && M.mp4Seconds(mp4(20.5)) === 20.5, 'a video\'s length is read from its MP4 header');
  check(Math.abs(M.mp4Seconds(fmp4(10, true)) - 10) < .01 && Math.abs(M.mp4Seconds(fmp4(20, false)) - 20) < .01, 'and from the fragments of a fragmented MP4 (Safari\'s recordings), with or without per-sample durations');
  const url = M.presign({ host: 'examplebucket.s3.amazonaws.com', key: 'test.txt', region: 'us-east-1', accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', expires: 86400, date: new Date('2013-05-24T00:00:00Z') });
  check(url.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'), 'R2/S3 presigned links match AWS\'s published Signature V4 example');
  // the phone's own cleaning (public/lab/media.js): every metadata block goes, the image and its colour profile stay
  const src = fs.readFileSync(path.join(ROOT, 'public/lab/media.js'), 'utf8'), fn = src.slice(src.indexOf('function stripMeta'), src.indexOf('let encoderExif'));
  const stripMeta = new Function(fn + 'return stripMeta;')();
  const icc = Buffer.from([0xff, 0xe2, 0x00, 0x06, 0x49, 0x43, 0x43, 0x5f]), com = Buffer.from([0xff, 0xfe, 0x00, 0x04, 0x68, 0x69]);
  const dirty = jpeg(true), withIcc = Buffer.concat([dirty.subarray(0, 2), icc, com, dirty.subarray(2)]), cleaned = stripMeta(new Uint8Array(withIcc));
  check(!M.hasExif(Buffer.from(cleaned.out)) && cleaned.removed === 18 + com.length && Buffer.from(cleaned.out).includes(icc) && Buffer.from(cleaned.out).subarray(-SOF.length - 2000).equals(dirty.subarray(-SOF.length - 2000)), 'the phone strips EXIF and comments before upload, keeping the colour profile and the image bytes');
  const env = { ...process.env };
  process.env.MEDIA_LAB = '1'; process.env.DATABASE_URL = 'postgres://u:p@dpg-prod-host-a/db';
  check(!M.create({ prodHost: 'dpg-prod-host-a' }).ON(), 'on the production database the lab stays off, even with MEDIA_LAB=1');
  process.env.DATABASE_URL = '';
  check(M.create({ prodHost: 'dpg-prod-host-a' }).ON(), 'elsewhere MEDIA_LAB=1 turns it on');
  process.env.MEDIA_LAB = ''; check(!M.create({ prodHost: 'x' }).ON(), 'without MEDIA_LAB it is off');
  Object.assign(process.env, env); if(!env.MEDIA_LAB) delete process.env.MEDIA_LAB;
  // one club's files are listed for that club only
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't_media_')), lab = M.create({ prodHost: 'x', dir });
  const A = { id: 'clubA' }, B = { id: 'clubB' }, ua = { id: 'u000000000001' }, ub = { id: 'u000000000002' };
  const s = lab.api.slot({ kind: 'photo', bytes: 2100, group: 'g1' }, ua, A);
  fs.writeFileSync(path.join(dir, s.key.replace(/\//g, '_')), jpeg(false, 2000));
  check(/^clubA\/photo\/[0-9a-f]{32}\.jpg$/.test(s.key), 'a file\'s key carries its club and an unguessable 128-bit name');
  assert.throws(() => lab.api.commit({ key: s.key }, ub, B), /No such upload/); check(true, 'another club\'s member cannot commit someone else\'s upload');
  lab.api.commit({ key: s.key }, ua, A);
  check(lab.api.list({}, ua, A).items.length === 1 && lab.api.list({}, ub, B).items.length === 0, 'a club\'s files are listed only for that club');
  assert.throws(() => lab.api.slot({ kind: 'photo', bytes: 700 * 1024 }, ua, A), /Too big/); check(true, 'an upload slot is refused above the size cap (photo 600 KB)');
  assert.throws(() => lab.api.slot({ kind: 'video', bytes: 11 * 1048576 }, ua, A), /Too big/); check(true, 'and a video above 10 MB');
  fs.rmSync(dir, { recursive: true, force: true });

  // ---------- through the server ----------
  async function serve(extra){
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_media_srv_')), PORT = 6700 + Math.floor(Math.random() * 200);
    const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(tmp, 'data.json'), MEDIA_DIR: path.join(tmp, 'media'), DATABASE_URL: '', STAGING: '', FAST: '1', MEDIA_LAB: '', ...extra }, stdio: 'ignore' });
    const base = 'http://localhost:' + PORT;
    for(let i = 0; i < 60; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(e){} await sleep(150); }
    return { base, stop: async () => { srv.kill(); await sleep(400); fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } };
  }
  let S = await serve({});
  check((await fetch(S.base + '/lab/media')).status === 404 && (await fetch(S.base + '/lab/media.js')).status === 404 && (await fetch(S.base + '/media/api/list', { method: 'POST' })).status === 404, 'switch off: the lab page, its script and its API do not exist');
  await S.stop();

  S = await serve({ MEDIA_LAB: '1' });
  const B0 = S.base, j = (p, body, tok) => fetch(B0 + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) });
  const page = await fetch(B0 + '/lab/media');
  check(page.status === 200 && /Media lab/.test(await page.text()) && /script-src 'self'/.test(page.headers.get('content-security-policy')) && /media-src 'self' blob:/.test(page.headers.get('content-security-policy')), 'switch on: the lab page is served, under the app\'s security policy plus playing the chosen clip (blob:)');
  check(!/media-src/.test((await fetch(B0 + '/')).headers.get('content-security-policy')), 'the app\'s own pages keep their policy unchanged');
  check((await j('/media/api/list')).status === 401, 'the lab API needs a signed-in member');
  const tok = (await (await j('/api/setup', { code: 'secret', name: 'Lab Tester', pin: '246810', agree: true })).json()).token;
  const up = async (kind, buf) => { const sl = await (await j('/media/api/slot', { kind, bytes: buf.length, group: 'g' }, tok)).json(); const put = await fetch(B0 + sl.put, { method: 'PUT', body: buf }); return { sl, put, commit: await j('/media/api/commit', { key: sl.key, c: kind === 'photo' ? '#a1b2c3' : 'red;}' }, tok) }; };
  const ph = await up('photo', jpeg(false));
  const pc = await ph.commit.json();
  check(ph.put.status === 200 && ph.commit.status === 200 && pc.ok, 'a photo goes to its signed upload link and is accepted on commit');
  const got = await fetch(B0 + pc.url);
  check(got.status === 200 && got.headers.get('content-type') === 'image/jpeg' && /private, max-age=\d+, immutable/.test(got.headers.get('cache-control')), 'its signed read link serves it, cacheable for the day');
  const bad = pc.url.replace(/s=(.)/, (m, c) => 's=' + (c === 'A' ? 'B' : 'A'));
  check((await fetch(B0 + bad)).status === 404 && (await fetch(B0 + pc.url.replace(/e=\d+/, 'e=' + (Date.now() - 1000)))).status === 404, 'a changed signature, or an expired link, opens nothing');
  check((await fetch(B0 + '/media/f/' + ph.sl.key)).status === 404, 'and a file without a signed link is not served');
  const ex = await up('photo', jpeg(true));
  check(ex.commit.status === 400 && /EXIF/.test((await ex.commit.json()).error), 'a photo that still carries EXIF (camera details, maybe GPS) is refused');
  const sl2 = await (await j('/media/api/slot', { kind: 'photo', bytes: 2100 }, tok)).json();
  check((await fetch(B0 + sl2.put.replace(/s=[^&]+/, 's=' + 'A'.repeat(43)), { method: 'PUT', body: jpeg(false) })).status === 403, 'an upload with a forged link is refused');
  const big = await fetch(B0 + sl2.put, { method: 'PUT', body: Buffer.alloc(3000) }).then(r => r.status, () => 'cut');
  check(big === 413 || big === 'cut', `an upload larger than its slot asked for is cut off (${big})`);
  check((await j('/media/api/commit', { key: sl2.key }, tok)).status === 400, 'and nothing of it can be committed');
  const long = await up('video', mp4(20));
  check(long.commit.status === 400 && /Too long/.test((await long.commit.json()).error), 'a 20 s video is refused (at most 15 s)');
  const fl = await up('video', fmp4(20, true));
  check(fl.commit.status === 400 && /Too long/.test((await fl.commit.json()).error), 'a 20 s fragmented recording is refused too');
  const late = mp4(10, 3000), mo = late.indexOf(Buffer.from('moov')) - 4, md = late.indexOf(Buffer.from('mdat')) - 4;
  const moovLast = Buffer.concat([late.subarray(0, mo), late.subarray(md), late.subarray(mo, md)]);
  const lt = await up('video', moovLast);
  check(lt.commit.status === 400 && /moov/.test((await lt.commit.json()).error), 'a video whose index (moov) comes after its data is refused: the feed would wait for the whole file');
  const nolen = await up('video', Buffer.concat([box('ftyp', Buffer.from('isom\0\0\0\0isom')), box('moov', box('free', Buffer.alloc(8))), box('mdat', Buffer.alloc(500))]));
  check(nolen.commit.status === 400 && /length/.test((await nolen.commit.json()).error), 'a video whose length cannot be read is refused');
  const placed = await up('video', mp4(10, 3000, true));
  check(placed.commit.status === 400 && /metadata/.test((await placed.commit.json()).error), 'a video that still says where it was filmed is refused');
  const raw = mp4(10, 3000, true), cl = MP4META.clean(new Uint8Array(raw)), clb = Buffer.from(cl.out);
  check(cl.removed === 2 && clb.length === raw.length && !clb.includes(Buffer.from('+43.6532')) && !clb.includes(Buffer.from('ISO6709')) && clb.subarray(-3000).equals(raw.subarray(-3000)) && M.mp4Seconds(clb) === 10,
    'the phone blanks a clip\'s location boxes in place: same size, video bytes and length untouched');
  const sent = await up('video', clb);
  check(sent.commit.status === 200, 'and the cleaned clip is accepted as it is');
  const vid = await up('video', mp4(12, 40000)), vc = await vid.commit.json();
  check(vid.commit.status === 200 && vc.seconds === 12, 'a 12 s video is accepted, its length read by the server');
  const rg = await fetch(B0 + vc.url, { headers: { range: 'bytes=0-99' } });
  check(rg.status === 206 && rg.headers.get('content-range') === `bytes 0-99/${vc.bytes}` && (await rg.arrayBuffer()).byteLength === 100, 'a video is served in byte ranges, as Safari asks for it');
  const list = await (await j('/media/api/list', {}, tok)).json();
  check(list.items.some(x => x.kind === 'photo' && x.c === '#a1b2c3') && list.items.filter(x => x.kind === 'video').every(x => x.c === null), 'a file\'s placeholder colour is kept when it is a plain #rrggbb, and dropped otherwise');
  check(list.items.length === 3 && list.items.every(x => x.url.startsWith('/media/f/')), 'the list holds the three accepted files, with signed links');
  check((await (await j('/media/api/clear', {}, tok)).json()).removed === 3 && (await fetch(B0 + vc.url)).status === 404, 'clearing removes my files and their links stop working');
  await S.stop();
  console.log(`\n${n} checks passed`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
