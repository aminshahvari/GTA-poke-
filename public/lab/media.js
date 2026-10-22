// Media lab (preview only, owner GO 2026-10-21). Everything heavy happens on this phone:
//  - a photo is decoded, drawn 1080 px on its short side (1440 at most on the long) and saved as a JPEG, plus a
//    400 px thumbnail for grids; the feed loads the full photo on sharp screens. Drawing it
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

// the preview's accounts are wiped on every deploy, so a saved sign-in can stop working: say so plainly, before any work
function signedOut(){ $('lab').hidden = true; $('signin').hidden = false; window.scrollTo(0, 0); }
async function call(name, body){
  const r = await fetch('/media/api/' + name, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({})); if(r.status === 401) signedOut(); if(!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j;
}
// the picture's average colour, shown in the feed while the thumbnail or poster loads
function tint(src){
  try{ const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.drawImage(src, 0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data; return '#' + [d[0], d[1], d[2]].map(n => n.toString(16).padStart(2, '0')).join(''); }catch(e){ return null; }
}
async function upload(kind, blob, group, w, h, c){
  const s = await call('slot', { kind, bytes: blob.size, group });
  const r = await fetch(s.put, { method: 'PUT', headers: { 'content-type': s.type }, body: blob });
  if(!r.ok) throw new Error('upload ' + r.status);
  return call('commit', { key: s.key, w, h, c });
}
const status = t => { $('status').textContent = t; };
const vstatus = t => { $('vstatus').textContent = t; };

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
// long: the long side's cap; short (optional): the short side's target. A big camera photo is halved step by step
// first, which keeps fine detail (hair, fabric) sharp where one big jump would alias it
function drawAt(src, sw, sh, long, short){
  const k = Math.min(1, long / Math.max(sw, sh), short ? short / Math.min(sw, sh) : 1), w = Math.round(sw * k), h = Math.round(sh * k);
  let cur = src, cw = sw, ch = sh;
  while(cw / 2 >= w * 1.5){
    const half = document.createElement('canvas'); half.width = Math.round(cw / 2); half.height = Math.round(ch / 2);
    const hx = half.getContext('2d'); hx.imageSmoothingEnabled = true; hx.imageSmoothingQuality = 'high'; hx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half; cw = half.width; ch = half.height;
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h);
  return c;
}
// Safari's own JPEG encoder writes a small EXIF block (colour space, size) into every photo it saves. Before upload the
// phone drops every metadata segment (APP1 EXIF/XMP, APP3-15, comments) and keeps only the image, JFIF (APP0) and the
// colour profile (APP2), so the server's no-EXIF check holds for any phone. Returns the bytes and what was removed.
function stripMeta(u8){
  if(!(u8[0] === 0xff && u8[1] === 0xd8)) return { out: u8, removed: 0 };
  const keep = [u8.subarray(0, 2)]; let i = 2, removed = 0;
  while(i + 4 <= u8.length && u8[i] === 0xff){
    const mk = u8[i + 1];
    if(mk === 0xda) break;                                     // start of scan: the image itself follows
    const len = (u8[i + 2] << 8) | u8[i + 3], seg = u8.subarray(i, i + 2 + len);
    if((mk >= 0xe1 && mk <= 0xef && mk !== 0xe2) || mk === 0xfe) removed += seg.length; else keep.push(seg);
    i += 2 + len;
  }
  keep.push(u8.subarray(i));
  const out = new Uint8Array(keep.reduce((n, s) => n + s.length, 0)); let o = 0; for(const s of keep){ out.set(s, o); o += s.length; }
  return { out, removed };
}
let encoderExif = null, encoderGps = null, metaRemoved = 0;   // what Safari's encoder wrote, for the report
const jpeg = (c, q) => new Promise(ok => c.toBlob(ok, 'image/jpeg', q)).then(async b => {
  const u8 = new Uint8Array(await b.arrayBuffer()), e = exifOf(u8), s = stripMeta(u8);
  encoderExif = encoderExif || e.exif; encoderGps = encoderGps || e.gps; metaRemoved += s.removed;
  return new Blob([s.out], { type: 'image/jpeg' });
});
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
  encoderExif = encoderGps = null; metaRemoved = 0;
  const t0 = performance.now(), u8 = new Uint8Array(await file.arrayBuffer()), before = exifOf(u8);
  const im = await loadImg(file), big = drawAt(im, im.naturalWidth, im.naturalHeight, 1440, 1080);
  let q = .85, photo = await jpeg(big, q);
  while(photo.size > 450 * 1024 && q > .65){ q -= .05; photo = await jpeg(big, q); }
  const thumb = await jpeg(drawAt(big, big.width, big.height, 400), .78);
  const ms = performance.now() - t0;
  const after = exifOf(new Uint8Array(await photo.arrayBuffer())), quality = await ssim(big, photo);
  const r = { i, kind: 'photo', origBytes: file.size, origW: im.naturalWidth, origH: im.naturalHeight, outBytes: photo.size, outW: big.width, outH: big.height, q: +q.toFixed(2), thumbBytes: thumb.size, ms: Math.round(ms), ssim: +quality.toFixed(4), exifBefore: before.exif, gpsBefore: before.gps, exifAfter: after.exif, encoderExif, encoderGps, metaRemoved };
  encoderExif = encoderGps = null; metaRemoved = 0;
  const group = 'p' + Date.now().toString(36) + i;
  // candidates to measure (not uploaded): JPEG 0.78 and WebP 0.75, with the type the canvas really returned
  const c78 = await jpeg(big, .78), webp = await new Promise(ok => big.toBlob(ok, 'image/webp', .75));
  r.jpeg78 = { bytes: c78.size, ssim: +(await ssim(big, c78)).toFixed(4) };
  r.webp75 = webp ? { type: webp.type, bytes: webp.size, ssim: +(await ssim(big, webp)).toFixed(4) } : null;
  try{ await upload('photo', photo, group, big.width, big.height, tint(big)); await upload('thumb', thumb, group); r.server = 'accepted'; }catch(e){ r.server = 'refused: ' + e.message; }
  URL.revokeObjectURL(im.src);
  return r;
}

// ---------- videos ----------
const once = (el, ev) => new Promise(ok => el.addEventListener(ev, ok, { once: true }));
const MIMES = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
let actx = null;
let MBP = null; const mb = () => MBP || (MBP = import('/vendor/mediabunny-1.61.1/mediabunny.min.js'));
// which H.264 encoder settings this phone's WebCodecs accepts at this size (High, Main, Baseline), for the report
async function ladder(w, h){
  if(!window.VideoEncoder) return [];
  const ok = [];
  for(const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e01f']){
    try{ if((await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate: 3e6, framerate: 30 })).supported) ok.push(codec); }catch(e){}
  }
  return ok;
}
async function doVideo(file, i){
  const v = document.createElement('video'); v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
  v.setAttribute('playsinline', ''); v.muted = false;
  // on screen, not hidden: Safari stops presenting frames of a video it cannot see, and the recording would stall
  $('vprev').innerHTML = ''; $('vprev').appendChild(v); $('vprev').hidden = false;
  // still inside the tap: Safari allows playing with sound (and so recording it) only here, then on this element later
  actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume();
  const first = v.play().then(() => null, e => e);
  if(v.readyState < 1){
    // a clip this phone cannot open fires 'error' rather than 'loadedmetadata': say so instead of waiting forever
    const why = await Promise.race([once(v, 'loadedmetadata').then(() => null), once(v, 'error').then(() => 'this phone could not open the clip' + (v.error ? ' (code ' + v.error.code + ')' : '')),
      new Promise(ok => setTimeout(() => ok('the clip did not open within 15 s'), 15000))]);
    if(why){ v.remove(); $('vprev').hidden = true; throw new Error(why); }
  }
  const blocked = await first; v.pause();
  if(blocked){ v.remove(); $('vprev').hidden = true; throw new Error('This browser would not play the video: ' + blocked.message); }
  const W0 = v.videoWidth, H0 = v.videoHeight, dur = v.duration, k = Math.min(1, 1280 / Math.max(W0, H0));
  const w = Math.round(W0 * k / 2) * 2, h = Math.round(H0 * k / 2) * 2, limit = Math.min(dur, 15);
  const r = { i, kind: 'video', origBytes: file.size, origW: W0, origH: H0, origSeconds: +dur.toFixed(2), outW: w, outH: h, exifBefore: null, gpsBefore: null };
  // Video, in order (Muse's rulings on #27, Oct 21):
  //  1. passthrough: already H.264, at most 15 s, 10 MB and 5 Mbit/s, SDR, AAC or no sound: remuxed as it is by
  //     Mediabunny with the index (moov) first and no metadata tags; nothing is re-encoded, so it is near-instant
  //  2. WebCodecs: the picture re-encoded by the phone's hardware H.264 encoder (faster than real time where it works);
  //     the sound is copied as it is, never re-encoded (Safari before 26 has no AudioEncoder). HDR is drawn to an
  //     8-bit canvas on the way, so it comes out SDR (BT.709)
  //  3. MediaRecorder, real time, as before: the fallback for a phone or clip where 1 and 2 cannot run
  // Every result is cleaned of metadata boxes again and checked by the server (length, metadata, moov first).
  const t00 = performance.now(), group = 'v' + Date.now().toString(36) + i;
  r.srcKbps = Math.round(file.size * 8 / dur / 1000);
  let out = null, M = null;
  try{ M = await mb(); }catch(e){ r.mbError = 'Mediabunny did not load: ' + e.message; }
  if(M) try{
    const input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS });
    const vt = await input.getPrimaryVideoTrack(), at = await input.getPrimaryAudioTrack();
    r.vcodec = vt && vt.codec; r.acodec = at ? at.codec : 'none';
    r.tracks = (await input.getTracks()).map(t => t.type + ':' + (t.codec || 'unknown')).join(' ');
    r.hdr = vt ? await vt.hasHighDynamicRange() : null; r.color = vt ? JSON.stringify(await vt.getColorSpace()) : null;
    const pass = r.vcodec === 'avc' && dur <= 15.5 && file.size <= 10 * 1048576 && r.srcKbps <= 5000 && !r.hdr && (!at || r.acodec === 'aac');
    r.ladder = (await ladder(w, h)).join(' ') || 'none';
    // the sound is only ever copied: a clip whose sound is not AAC skips this path (Safari 26 could re-encode it; we do not)
    if(pass || (r.ladder !== 'none' && (!at || r.acodec === 'aac'))){
      const output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new M.BufferTarget() });
      const hdrToSdr = r.hdr ? (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
        return { process: smp => { smp.draw(x, 0, 0, w, h); return c; }, processedWidth: w, processedHeight: h }; })() : {};
      // 'primary': only the main picture and sound. An iPhone 16 clip also carries a Spatial Audio track (APAC) that
      // nothing can copy; with every track, that one track sent the whole clip to the slow fallback
      const conv = await M.Conversion.init({ input, output, tracks: 'primary', tags: {}, showWarnings: false, trim: dur > 15 ? { start: 0, end: 15 } : undefined,
        video: pass ? {} : { width: w, height: h, fit: 'contain', codec: 'avc', bitrate: 3e6, forceTranscode: true, hardwareAcceleration: 'prefer-hardware', ...hdrToSdr },
        audio: { codec: 'aac' } });
      if(!conv.isValid || conv.discardedTracks.length){
        r.mbDiscarded = conv.discardedTracks.map(d => d.track.type + ': ' + d.reason).join(', ') || 'not valid';
      }else{
        conv.onProgress = q => vstatus(`Video ${i}: ${pass ? 'packing' : 'encoding'} ${Math.round(q * 100)}%`);
        await conv.execute();
        out = new Uint8Array(output.target.buffer); r.path = pass ? 'original' : 'webcodecs';
      }
    }
  }catch(e){ r.mbError = e.message; }
  if(!out && !M){
    // no Mediabunny at all: the earlier passthrough (metadata boxes blanked in place), only when the index is first
    const raw = new Uint8Array(await file.arrayBuffer()), sc = MP4META.scan(raw);
    if(sc.codecs.includes('avc1') && sc.moovFirst && dur <= 15.5 && file.size <= 10 * 1048576 && r.srcKbps <= 5000){ out = raw; r.path = 'original-inplace'; }
  }
  if(out){
    const cl = MP4META.clean(out); r.metaAfter = cl.removed; r.moovFirst = MP4META.scan(cl.out).moovFirst;
    const blob = new Blob([cl.out], { type: 'video/mp4' });
    r.ms = Math.round(performance.now() - t00); r.outBytes = blob.size; r.outSeconds = +Math.min(dur, 15).toFixed(2); r.kbps = Math.round(blob.size * 8 / r.outSeconds / 1000);
    if(r.path === 'original' || r.path === 'original-inplace'){ r.outW = W0; r.outH = H0; }
    v.pause(); v.currentTime = Math.min(.5, dur / 2); await once(v, 'seeked');
    const poster = await jpeg(drawAt(v, W0, H0, 720), .8); r.thumbBytes = poster.size;
    try{ const done = await upload('video', blob, group, r.outW, r.outH, tint(v)); r.serverSeconds = done.seconds; await upload('poster', poster, group, r.outW, r.outH); r.server = 'accepted'; }catch(e){ r.server = 'refused: ' + e.message; }
    URL.revokeObjectURL(v.src); v.remove(); $('vprev').hidden = true;
    return r;
  }
  r.path = 'mediarecorder';
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
  await new Promise((done, fail) => {
    let last = -1, still = performance.now();
    const step = () => {
      x.drawImage(v, 0, 0, w, h);
      if(v.ended || v.currentTime >= limit) return done();
      if(v.currentTime !== last){ last = v.currentTime; still = performance.now(); }
      else if(performance.now() - still > 6000) return fail(new Error(`stalled at ${v.currentTime.toFixed(1)} s (the video stopped playing)`));
      vstatus(`Video ${i}: preparing ${v.currentTime.toFixed(1)} of ${limit.toFixed(1)} s`);
      requestAnimationFrame(step);   // a timer on the page, not the video's own frame callback, so a paused video cannot hang it
    };
    step();
  }).catch(e => { v.pause(); try{ rec.stop(); }catch(_){} $('vprev').hidden = true; v.remove(); throw e; });
  v.pause(); const stopped = once(rec, 'stop'); rec.stop(); await stopped;
  const rec8 = MP4META.clean(new Uint8Array(await new Blob(chunks).arrayBuffer())); r.metaAfter = rec8.removed;
  const recOut = new Blob([rec8.out], { type: mime.split(';')[0] });
  r.ms = Math.round(performance.now() - t0); r.outBytes = recOut.size; r.outSeconds = +limit.toFixed(2); r.kbps = Math.round(recOut.size * 8 / limit / 1000);
  // the poster: a frame from half a second in, 720 px on its long side
  v.currentTime = Math.min(.5, dur / 2); await once(v, 'seeked');
  const poster = await jpeg(drawAt(v, W0, H0, 720), .8); r.thumbBytes = poster.size;
  try{
    const done = await upload('video', recOut, group, w, h, tint(v)); r.serverSeconds = done.seconds;
    await upload('poster', poster, group, w, h); r.server = 'accepted';
  }catch(e){ r.server = 'refused: ' + e.message; }
  URL.revokeObjectURL(v.src); v.remove(); $('vprev').hidden = true;
  return r;
}

// ---------- results, summary and cost ----------
function row(r){
  const tr = document.createElement('tr'), yes = b => b == null ? '—' : b ? 'yes' : 'no';
  const cells = [r.i, r.kind, `${size(r.origBytes)}<br><span class="note">${r.origW}×${r.origH}${r.origSeconds ? ' · ' + r.origSeconds + ' s' : ''}</span>`,
    r.outBytes ? `${size(r.outBytes)}<br><span class="note">${r.outW}×${r.outH}${r.kbps ? ' · ' + r.kbps + ' kbps' : ''}${r.path ? ' · ' + ({ original: 'sent as is', 'original-inplace': 'sent as is', webcodecs: 're-made (WebCodecs)', mediarecorder: 're-made (real time)' }[r.path] || r.path) : ''}${r.q ? ' · q' + r.q : ''}</span>` : '—',
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
  $('summary').innerHTML = `<p><b style="color:var(--text)">Photos ${s.photos}</b>: average ${size(s.photoAvg)} (largest ${size(s.photoMax)}), thumbnail ${size(s.thumbAvg)}, ${s.photoMs} ms each, quality SSIM ${s.ssimAvg || '—'} (lowest ${s.ssimMin ?? '—'}). GPS in ${s.gpsBefore} originals, EXIF left in ${s.exifAfter} results.</p>
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
    ? `<div class="post"><img style="background:${g.photo.c || '#0a1420'};aspect-ratio:${g.photo.w || 3}/${g.photo.h || 4}" src="${g.thumb.url}" srcset="${g.thumb.url} 400w, ${g.photo.url} ${g.photo.w || 1080}w" sizes="(max-width: 760px) 100vw, 728px" data-full="${g.photo.url}" loading="lazy" decoding="async" width="${g.photo.w || 400}" height="${g.photo.h || 300}" alt="Test photo"><div class="meta">Thumbnail ${size(g.thumb.bytes)} · full photo ${size(g.photo.bytes)} (tap)</div></div>`
    : g.video && g.poster ? `<div class="post"><div class="vid"><video style="background:${g.video.c || '#000'};aspect-ratio:${g.video.w || 9}/${g.video.h || 16}" preload="none" playsinline controls poster="${g.poster.url}" width="${g.video.w}" height="${g.video.h}" src="${g.video.url}"></video></div><div class="meta">Poster ${size(g.poster.bytes)} · video ${size(g.video.bytes)}${g.video.seconds ? ' · ' + g.video.seconds.toFixed(1) + ' s' : ''} (loads only when played)</div></div>` : '').join('');
  $('feed').querySelectorAll('img[data-full]').forEach(im => im.onclick = () => { $('viewer').innerHTML = `<img src="${im.dataset.full}" alt="Test photo, full size">`; $('viewer').hidden = false; });
}
$('viewer').onclick = () => { $('viewer').hidden = true; $('viewer').innerHTML = ''; };
// bytes the feed actually downloaded so far (thumbnails, posters, opened photos and played videos)
setInterval(() => {
  const e = performance.getEntriesByType('resource').filter(x => x.name.includes('/media/f/'));
  if(e.length) $('loadstats').textContent = `Feed downloads so far: ${e.length} files, ${size(e.reduce((s, x) => s + (x.transferSize || x.encodedBodySize || 0), 0))}.`;
}, 2000);

// which formats this phone's canvas can actually write (Safari answers an unknown type with a PNG)
let encoders = null;
async function probe(){
  const c = document.createElement('canvas'); c.width = c.height = 16; const x = {};
  for(const t of ['image/webp', 'image/avif']) x[t.slice(6)] = await new Promise(ok => c.toBlob(b => ok(!!b && b.type === t), t, .7));
  encoders = x;
}
probe();
function report(){
  return { at: new Date().toISOString(), encoders, ua: navigator.userAgent, screen: `${screen.width}x${screen.height}@${devicePixelRatio}`, limits: LIMITS, summary: summary(),
    files: results.map(r => ({ ...r })) };   // measurements only: a result never holds a file name or picture data
}
$('send').onclick = async () => {
  const b = $('send'), n = results.length; b.disabled = true; b.textContent = 'Sending…'; $('sendstate').textContent = '';
  try{
    await call('report', { report: report() });
    b.textContent = 'Sent ✓'; $('sendstate').className = 'ok'; $('sendstate').textContent = `Sent ${n} results at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Claude has them now.`;
  }catch(e){ b.textContent = 'Send results to Claude'; $('sendstate').className = 'no'; $('sendstate').textContent = 'Not sent: ' + e.message + '. Tap again.'; }
  setTimeout(() => { b.disabled = false; b.textContent = 'Send results to Claude'; }, 4000);
};
$('copy').onclick = async () => { const t = JSON.stringify(report(), null, 1); try{ await navigator.clipboard.writeText(t); status('Copied.'); }catch(e){ status('Copy did not work here.'); } };
$('clear').onclick = async () => { try{ const r = await call('clear'); status(`Removed ${r.removed} files.`); feed(); }catch(e){ status(e.message); } };

$('photos').onchange = async e => {
  const files = [...e.target.files].slice(0, 20); e.target.value = ''; awake(true);
  for(const [k, f] of files.entries()){
    const i = results.length + 1; status(`Photo ${k + 1} of ${files.length}…`);
    try{ const r = await doPhoto(f, i); results.push(r); row(r); }catch(x){ const r = { i, kind: 'photo', origBytes: f.size, server: x.message }; results.push(r); row(r); }
    summary();
  }
  status(`${files.length} photos done.`); awake(false); feed();
};
// one video per tap: Safari lets a page play sound (needed to record it) only right after a tap
let queue = [];
// keep the screen on while the phone works (iOS 16.4+); a refusal changes nothing else
let wake = null;
document.addEventListener('visibilitychange', () => { if(document.hidden) wake = null; else if(busy) awake(true); });
let busy = false;
async function awake(on){ busy = on; try{ if(on && !wake && navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); else if(!on && wake){ await wake.release(); wake = null; } }catch(e){} }
async function nextVideo(){
  const f = queue.shift(); $('nextVideo').disabled = true; if(!f) return;
  const i = results.length + 1; vstatus(`Video ${i}: opening…`); awake(true);
  let r;
  try{ r = await doVideo(f, i); }catch(x){ r = { i, kind: 'video', origBytes: f.size, server: x.message }; }
  results.push(r); row(r); summary();
  const ok = /^accepted/.test(r.server || '');
  vstatus(`Video ${i}: ${ok ? `ready, ${size(r.outBytes)} in ${(r.ms / 1000).toFixed(1)} s` : 'not prepared: ' + r.server}. ${queue.length ? `${queue.length} more: tap "Prepare next video".` : 'All videos done.'}`);
  $('nextVideo').disabled = false; $('nextVideo').hidden = !queue.length; if(!queue.length) awake(false); feed();
}
$('videos').onchange = e => { queue = [...e.target.files].slice(0, 20); e.target.value = ''; $('nextVideo').hidden = !queue.length; vstatus(`${queue.length} videos chosen: tap "Prepare next video" for each, and keep this screen on.`); };
$('nextVideo').onclick = nextVideo;

(async () => {
  if(!token){ $('signin').hidden = false; return; }
  $('lab').hidden = false;
  try{ LIMITS = (await call('list')).limits; feed(); }catch(e){ if(/Sign in/.test(e.message)) signedOut(); else status(e.message); }
})();
