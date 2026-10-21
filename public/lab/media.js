// Media lab (preview only, owner GO 2026-10-21). Everything heavy happens on this phone:
//  - a photo is decoded, drawn at 1080 px on its long side and saved as a JPEG, plus a 400 px thumbnail. Drawing it
//    afresh leaves the camera's EXIF behind, GPS included; the server refuses any JPEG that still has EXIF
//  - a video plays once into a 720p canvas that MediaRecorder encodes (H.264 + AAC in an MP4), at most 15 s,
//    plus a poster frame
// then each file goes to a signed upload link and is committed; the server checks it again before listing it.
// The page measures every step and turns the averages into a monthly cost (see costTable).
'use strict';
const $ = id => document.getElementById(id);
const token = (() => { try{ return JSON.parse(localStorage.getItem('stacked:token')); }catch(e){ return null; } })();
const club = (() => { try{ return JSON.parse(localStorage.getItem('stacked:club')); }catch(e){ return null; } })();
const KB = n => (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB', MB = n => (n / 1048576).toFixed(2) + ' MB';
const size = n => n >= 1048576 ? MB(n) : KB(n);
const results = [];
let LIMITS = null;

async function call(name, body){
  const r = await fetch('/media/api/' + name, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({})); if(!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j;
}
async function upload(kind, blob, group, w, h){
  const s = await call('slot', { kind, bytes: blob.size, group });
  const r = await fetch(s.put, { method: 'PUT', headers: { 'content-type': s.type }, body: blob });
  if(!r.ok) throw new Error('upload ' + r.status);
  return call('commit', { key: s.key, w, h });
}
const status = t => { $('status').textContent = t; };

// ---------- EXIF: is there any, and does it hold a GPS position (tag 0x8825 in the first directory)? ----------
function exifOf(u8){
  if(!(u8[0] === 0xff && u8[1] === 0xd8)){   // not a JPEG (HEIC and others): look for an Exif block anywhere
    const s = new TextDecoder('latin1').decode(u8.subarray(0, Math.min(u8.length, 262144)));
    return { exif: s.includes('Exif\0\0'), gps: null };
  }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  for(let i = 2; i + 4 <= u8.length && u8[i] === 0xff;){
    const mk = u8[i + 1], len = dv.getUint16(i + 2);
    if(mk === 0xda) break;
    if(mk === 0xe1 && String.fromCharCode(...u8.subarray(i + 4, i + 10)) === 'Exif\0\0'){
      const t = i + 10, le = u8[t] === 0x49, g16 = o => dv.getUint16(t + o, le), g32 = o => dv.getUint32(t + o, le);
      try{ const ifd = g32(4), n = g16(ifd); for(let k = 0; k < n; k++) if(g16(ifd + 2 + k * 12) === 0x8825) return { exif: true, gps: true }; }catch(e){}
      return { exif: true, gps: false };
    }
    i += 2 + len;
  }
  return { exif: false, gps: false };
}

// ---------- photos ----------
const loadImg = file => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('This photo could not be opened here.')); im.src = URL.createObjectURL(file); });
function drawAt(src, sw, sh, long){
  const k = Math.min(1, long / Math.max(sw, sh)), w = Math.round(sw * k), h = Math.round(sh * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h);
  return c;
}
const jpeg = (c, q) => new Promise(ok => c.toBlob(ok, 'image/jpeg', q));
// structural similarity of the saved photo against the same pixels before saving (luma, 8x8 windows): 1 is identical
async function ssim(ref, blob){
  const im = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = ref.width; c.height = ref.height;
  c.getContext('2d').drawImage(im, 0, 0, ref.width, ref.height);
  const A = ref.getContext('2d').getImageData(0, 0, ref.width, ref.height).data, B = c.getContext('2d').getImageData(0, 0, ref.width, ref.height).data;
  const Y = (d, i) => .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2], C1 = 6.5025, C2 = 58.5225, W = ref.width;
  let sum = 0, n = 0;
  for(let y = 0; y + 8 <= ref.height; y += 8) for(let x = 0; x + 8 <= W; x += 8){
    let ma = 0, mb = 0, va = 0, vb = 0, cv = 0;
    for(let j = 0; j < 8; j++) for(let i = 0; i < 8; i++){ const p = ((y + j) * W + x + i) * 4, a = Y(A, p), b = Y(B, p); ma += a; mb += b; va += a * a; vb += b * b; cv += a * b; }
    ma /= 64; mb /= 64; va = va / 64 - ma * ma; vb = vb / 64 - mb * mb; cv = cv / 64 - ma * mb;
    sum += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
  }
  return n ? sum / n : 1;
}
async function doPhoto(file, i){
  const t0 = performance.now(), u8 = new Uint8Array(await file.arrayBuffer()), before = exifOf(u8);
  const im = await loadImg(file), big = drawAt(im, im.naturalWidth, im.naturalHeight, 1080);
  let q = .82, photo = await jpeg(big, q);
  while(photo.size > 300 * 1024 && q > .6){ q -= .08; photo = await jpeg(big, q); }
  const thumb = await jpeg(drawAt(big, big.width, big.height, 400), .78);
  const ms = performance.now() - t0;
  const after = exifOf(new Uint8Array(await photo.arrayBuffer())), quality = await ssim(big, photo);
  const r = { i, kind: 'photo', origBytes: file.size, origW: im.naturalWidth, origH: im.naturalHeight, outBytes: photo.size, outW: big.width, outH: big.height, q: +q.toFixed(2), thumbBytes: thumb.size, ms: Math.round(ms), ssim: +quality.toFixed(4), exifBefore: before.exif, gpsBefore: before.gps, exifAfter: after.exif };
  const group = 'p' + Date.now().toString(36) + i;
  try{ await upload('photo', photo, group, big.width, big.height); await upload('thumb', thumb, group); r.server = 'accepted'; }catch(e){ r.server = 'refused: ' + e.message; }
  URL.revokeObjectURL(im.src);
  return r;
}

// ---------- videos ----------
const once = (el, ev) => new Promise(ok => el.addEventListener(ev, ok, { once: true }));
const MIMES = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
let actx = null;
async function doVideo(file, i){
  const v = document.createElement('video'); v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
  v.setAttribute('playsinline', ''); v.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px'; document.body.appendChild(v);
  // still inside the tap: Safari allows playing with sound (and so recording it) only here, then on this element later
  actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume();
  const first = v.play().then(() => null, e => e);
  if(v.readyState < 1) await once(v, 'loadedmetadata');
  const blocked = await first; v.pause();
  if(blocked){ v.remove(); throw new Error('This browser would not play the video: ' + blocked.message); }
  const W0 = v.videoWidth, H0 = v.videoHeight, dur = v.duration, k = Math.min(1, 1280 / Math.max(W0, H0));
  const w = Math.round(W0 * k / 2) * 2, h = Math.round(H0 * k / 2) * 2, limit = Math.min(dur, 15);
  const r = { i, kind: 'video', origBytes: file.size, origW: W0, origH: H0, origSeconds: +dur.toFixed(2), outW: w, outH: h, exifBefore: null, gpsBefore: null };
  const mime = window.MediaRecorder && MIMES.find(m => MediaRecorder.isTypeSupported(m));
  if(!mime || !HTMLCanvasElement.prototype.captureStream){ r.server = 'not supported on this browser (no MP4 recording)'; v.remove(); return r; }
  r.mime = mime;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const stream = c.captureStream(30);
  try{
    await actx.resume();
    const dest = actx.createMediaStreamDestination(); actx.createMediaElementSource(v).connect(dest);
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  }catch(e){ r.audio = 'none: ' + e.message; }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3000000, audioBitsPerSecond: 96000 }), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const t0 = performance.now();
  v.currentTime = 0; await v.play();
  rec.start(1000);
  await new Promise(done => {
    const step = () => {
      x.drawImage(v, 0, 0, w, h);
      if(v.ended || v.currentTime >= limit) return done();
      status(`Video ${i}: ${v.currentTime.toFixed(1)} of ${limit.toFixed(1)} s`);
      v.requestVideoFrameCallback ? v.requestVideoFrameCallback(step) : requestAnimationFrame(step);
    };
    step();
  });
  v.pause(); const stopped = once(rec, 'stop'); rec.stop(); await stopped;
  const out = new Blob(chunks, { type: mime.split(';')[0] });
  r.ms = Math.round(performance.now() - t0); r.outBytes = out.size; r.outSeconds = +limit.toFixed(2); r.kbps = Math.round(out.size * 8 / limit / 1000);
  // the poster: a frame from half a second in, 720 px on its long side
  v.currentTime = Math.min(.5, dur / 2); await once(v, 'seeked');
  const poster = await jpeg(drawAt(v, W0, H0, 720), .8); r.thumbBytes = poster.size;
  const group = 'v' + Date.now().toString(36) + i;
  try{
    const done = await upload('video', out, group, w, h); r.serverSeconds = done.seconds;
    await upload('poster', poster, group, w, h); r.server = 'accepted';
  }catch(e){ r.server = 'refused: ' + e.message; }
  URL.revokeObjectURL(v.src); v.remove();
  return r;
}

// ---------- results, summary and cost ----------
function row(r){
  const tr = document.createElement('tr'), yes = b => b == null ? '—' : b ? 'yes' : 'no';
  const cells = [r.i, r.kind, `${size(r.origBytes)}<br><span class="note">${r.origW}×${r.origH}${r.origSeconds ? ' · ' + r.origSeconds + ' s' : ''}</span>`,
    r.outBytes ? `${size(r.outBytes)}<br><span class="note">${r.outW}×${r.outH}${r.kbps ? ' · ' + r.kbps + ' kbps' : ''}${r.q ? ' · q' + r.q : ''}</span>` : '—',
    r.thumbBytes ? size(r.thumbBytes) : '—', r.outBytes ? Math.round(100 * (1 - (r.outBytes + (r.thumbBytes || 0)) / r.origBytes)) + '% smaller' : '—',
    r.ms != null ? (r.ms / 1000).toFixed(1) + ' s' : '—', r.ssim ? 'SSIM ' + r.ssim : r.outSeconds ? r.outSeconds + ' s' : '—',
    r.kind === 'photo' ? `${yes(r.exifBefore)} / ${yes(r.gpsBefore)}` : '—', r.kind === 'photo' ? (r.exifAfter ? '<span class="no">EXIF left</span>' : '<span class="ok">clean</span>') : '—',
    /^accepted/.test(r.server || '') ? '<span class="ok">accepted</span>' : `<span class="no">${r.server || ''}</span>`];
  tr.innerHTML = cells.map(c => `<td>${c}</td>`).join(''); $('results').tBodies[0].appendChild(tr);
}
const avg = (a, f) => a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : 0;
function summary(){
  const P = results.filter(r => r.kind === 'photo' && r.outBytes), V = results.filter(r => r.kind === 'video' && r.outBytes);
  const s = {
    photos: P.length, photoAvg: Math.round(avg(P, r => r.outBytes)), photoMax: Math.max(0, ...P.map(r => r.outBytes)), thumbAvg: Math.round(avg(P, r => r.thumbBytes)),
    photoMs: Math.round(avg(P, r => r.ms)), ssimAvg: +avg(P, r => r.ssim).toFixed(4), ssimMin: P.length ? Math.min(...P.map(r => r.ssim)) : null,
    gpsBefore: P.filter(r => r.gpsBefore).length, exifAfter: P.filter(r => r.exifAfter).length,
    videos: V.length, videoAvg: Math.round(avg(V, r => r.outBytes)), videoMax: Math.max(0, ...V.map(r => r.outBytes)), posterAvg: Math.round(avg(V, r => r.thumbBytes)),
    videoMsPerSec: +avg(V, r => r.ms / 1000 / r.outSeconds).toFixed(2), kbpsAvg: Math.round(avg(V, r => r.kbps)),
    refused: results.filter(r => !/^accepted/.test(r.server || '')).length
  };
  $('summary').innerHTML = `<p><b style="color:var(--text)">Photos ${s.photos}</b>: average ${size(s.photoAvg)} (largest ${size(s.photoMax)}), thumbnail ${size(s.thumbAvg)}, ${(s.photoMs / 1000).toFixed(1)} s each, quality SSIM ${s.ssimAvg || '—'} (lowest ${s.ssimMin ?? '—'}). GPS in ${s.gpsBefore} originals, EXIF left in ${s.exifAfter} results.</p>
    <p><b style="color:var(--text)">Videos ${s.videos}</b>: average ${size(s.videoAvg)} (largest ${size(s.videoMax)}), ${s.kbpsAvg || '—'} kbps, poster ${size(s.posterAvg)}, ${s.videoMsPerSec || '—'} s of work per second of video.</p>
    <p class="note">Refused by the server: ${s.refused}.</p>`;
  $('costs').innerHTML = costTable(s); $('send').disabled = $('copy').disabled = false;
  return s;
}
// The monthly cost model (assumptions as filed on Issue #27, sizes from the measurements above):
// 20% of members post 4 times a month; half the posts carry 2 photos, 10% a video. Each member scrolls 300 feed
// items (a thumbnail or poster each), opens 60 photos and plays 2 videos. Photos are kept 12 months, videos 90 days.
// R2 list prices: $0.015 per GB-month over 10 GB, $4.50 per million writes over 1M, $0.36 per million reads over 10M,
// no charge for downloads. No processing service: the phone does it. Render, for comparison: $0.15 per GB over 25 GB.
function costTable(s){
  const ph = (s.photoAvg || 200 * 1024) + (s.thumbAvg || 30 * 1024), vd = (s.videoAvg || 7 * 1048576) + (s.posterAvg || 80 * 1024), GB = 1073741824;
  const rows = [100, 1000, 10000].map(n => {
    const posts = n * .2 * 4, photos = posts * .5 * 2, videos = posts * .1;
    const newBytes = photos * ph + videos * vd, kept = photos * ph * 12 + videos * vd * 3;
    const writes = photos * 2 + videos * 2, reads = n * (300 + 60 + 2);
    const down = n * (300 * avg([s.thumbAvg || 30720, s.posterAvg || 81920], x => x) + 60 * (s.photoAvg || 204800) + 2 * (s.videoAvg || 7340032));
    const r2 = Math.max(0, kept / GB - 10) * .015 + Math.max(0, writes - 1e6) / 1e6 * 4.5 + Math.max(0, reads - 1e7) / 1e6 * .36;
    return { n, newGB: newBytes / GB, keptGB: kept / GB, writes, reads, downGB: down / GB, r2, render: Math.max(0, down / GB - 25) * .15 };
  });
  const f = (x, d = 2) => x < .01 && x > 0 ? '<0.01' : x.toFixed(d);
  return `<table><thead><tr><th>Active members</th><th>New media / month</th><th>Stored (steady)</th><th>Uploads</th><th>Reads</th><th>Downloads</th><th>R2 cost</th><th>If served by Render</th></tr></thead><tbody>${rows.map(r =>
    `<tr><td>${r.n.toLocaleString('en-US')}</td><td>${f(r.newGB)} GB</td><td>${f(r.keptGB)} GB</td><td>${Math.round(r.writes).toLocaleString('en-US')}</td><td>${Math.round(r.reads).toLocaleString('en-US')}</td><td>${f(r.downGB, 1)} GB</td><td><b>$${f(r.r2)}</b></td><td>$${f(r.render)}</td></tr>`).join('')}</tbody></table>
    <p class="note">R2 list prices as filed on Issue #27, to be confirmed on the day of any GO. Processing on the phone: $0. Reads counted with no cache at all (the worst case).</p>`;
}

// ---------- the feed preview: lazy thumbnails, posters first ----------
async function feed(){
  const { items } = await call('list'), groups = new Map();
  for(const it of items){ if(!it.group) continue; const g = groups.get(it.group) || {}; g[it.kind] = it; groups.set(it.group, g); }
  $('feed').innerHTML = [...groups.values()].map(g => g.thumb && g.photo
    ? `<div class="post"><img src="${g.thumb.url}" data-full="${g.photo.url}" loading="lazy" decoding="async" width="${g.photo.w || 400}" height="${g.photo.h || 300}" alt="Test photo"><div class="meta">Thumbnail ${size(g.thumb.bytes)} · full photo ${size(g.photo.bytes)} (tap)</div></div>`
    : g.video && g.poster ? `<div class="post"><div class="vid"><video preload="none" playsinline controls poster="${g.poster.url}" width="${g.video.w}" height="${g.video.h}" src="${g.video.url}"></video></div><div class="meta">Poster ${size(g.poster.bytes)} · video ${size(g.video.bytes)}${g.video.seconds ? ' · ' + g.video.seconds.toFixed(1) + ' s' : ''} (loads only when played)</div></div>` : '').join('');
  $('feed').querySelectorAll('img[data-full]').forEach(im => im.onclick = () => { $('viewer').innerHTML = `<img src="${im.dataset.full}" alt="Test photo, full size">`; $('viewer').hidden = false; });
}
$('viewer').onclick = () => { $('viewer').hidden = true; $('viewer').innerHTML = ''; };
// bytes the feed actually downloaded so far (thumbnails, posters, opened photos and played videos)
setInterval(() => {
  const e = performance.getEntriesByType('resource').filter(x => x.name.includes('/media/f/'));
  if(e.length) $('loadstats').textContent = `Feed downloads so far: ${e.length} files, ${size(e.reduce((s, x) => s + (x.transferSize || x.encodedBodySize || 0), 0))}.`;
}, 2000);

function report(){
  return { at: new Date().toISOString(), ua: navigator.userAgent, screen: `${screen.width}x${screen.height}@${devicePixelRatio}`, limits: LIMITS, summary: summary(),
    files: results.map(({ i, kind, origBytes, origW, origH, origSeconds, outBytes, outW, outH, q, thumbBytes, ms, ssim, exifBefore, gpsBefore, exifAfter, mime, kbps, outSeconds, serverSeconds, server, audio }) =>
      ({ i, kind, origBytes, origW, origH, origSeconds, outBytes, outW, outH, q, thumbBytes, ms, ssim, exifBefore, gpsBefore, exifAfter, mime, kbps, outSeconds, serverSeconds, server, audio })) };
}
$('send').onclick = async () => { try{ await call('report', { report: report() }); status('Sent. Claude reads it from the preview server\'s log.'); }catch(e){ status('Not sent: ' + e.message); } };
$('copy').onclick = async () => { const t = JSON.stringify(report(), null, 1); try{ await navigator.clipboard.writeText(t); status('Copied.'); }catch(e){ status('Copy did not work here.'); } };
$('clear').onclick = async () => { try{ const r = await call('clear'); status(`Removed ${r.removed} files.`); feed(); }catch(e){ status(e.message); } };

$('photos').onchange = async e => {
  const files = [...e.target.files].slice(0, 20); e.target.value = '';
  for(const [k, f] of files.entries()){
    const i = results.length + 1; status(`Photo ${k + 1} of ${files.length}…`);
    try{ const r = await doPhoto(f, i); results.push(r); row(r); }catch(x){ const r = { i, kind: 'photo', origBytes: f.size, server: x.message }; results.push(r); row(r); }
    summary();
  }
  status(`${files.length} photos done.`); feed();
};
// one video per tap: Safari lets a page play sound (needed to record it) only right after a tap
let queue = [];
async function nextVideo(){
  const f = queue.shift(); $('nextVideo').hidden = true; if(!f) return;
  const i = results.length + 1;
  try{ const r = await doVideo(f, i); results.push(r); row(r); }catch(x){ const r = { i, kind: 'video', origBytes: f.size, server: x.message }; results.push(r); row(r); }
  summary(); $('nextVideo').hidden = !queue.length; status(queue.length ? `${queue.length} more: tap "Prepare next video".` : 'Videos done.'); feed();
}
$('videos').onchange = e => { queue = [...e.target.files].slice(0, 20); e.target.value = ''; $('nextVideo').hidden = !queue.length; status(`${queue.length} videos chosen: tap "Prepare next video" for each.`); };
$('nextVideo').onclick = nextVideo;

(async () => {
  if(!token){ $('signin').hidden = false; return; }
  $('lab').hidden = false;
  try{ LIMITS = (await call('list')).limits; feed(); }catch(e){ status(e.message); }
})();
