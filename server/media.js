// Media lab: photos and short videos for the club feed, made small on the member's phone and stored as files.
// Owner GO, 2026-10-21: preview only, local storage, test data. No R2, no paid service, no production change.
// MEDIA_LAB=1 turns it on, and never on the production database, whatever the environment says.
//
// The flow is the one R2 will use, so moving to it later changes only the store:
//  1. the app asks for an upload slot (POST /media/api/slot): the server checks the kind, the size and the quota,
//     and answers with a signed, short-lived upload URL
//  2. the phone sends the file straight to that URL (PUT): on preview it is this server's /media/put/, with R2 it
//     would be the bucket, and the bytes never pass through the JSON API
//  3. the app commits it (POST /media/api/commit): the server checks the file itself (type, size, no EXIF in a
//     photo, a video's length from its MP4 header) and only then lists it
//  4. a member of that club gets signed read links (POST /media/api/list); the signature changes once a day, so a
//     cache can keep a file for the day, and a link from one club opens nothing for another club's member
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const LIMITS = {   // provisional (owner, 2026-10-21): final only after the device measurements and the owner's approval
  photo: { max: 600 * 1024, type: 'image/jpeg', ext: 'jpg' },     // 1080 px wide (1080x1440 portrait)
  thumb: { max: 80 * 1024, type: 'image/jpeg', ext: 'jpg' },      // 400 px, for the feed
  poster: { max: 150 * 1024, type: 'image/jpeg', ext: 'jpg' },    // a video's first look, 720 px
  video: { max: 10 * 1024 * 1024, type: 'video/mp4', ext: 'mp4', seconds: 15.5 }
};
const PER_DAY = 80;                    // files a member may add to the lab in a day
const DISK_MAX = 600 * 1024 * 1024;    // the lab's whole folder on the preview server
const PUT_TTL = 10 * 60000;            // an upload link lasts ten minutes
const DAY = 864e5;

function create({ prodHost, dir = process.env.MEDIA_DIR || path.join(os.tmpdir(), 'blindrise-media'), secret = process.env.MEDIA_SECRET || crypto.randomBytes(32).toString('hex'), now = () => Date.now() } = {}){
  const ON = () => process.env.MEDIA_LAB === '1' && !String(process.env.DATABASE_URL || '').includes(prodHost);
  const items = new Map();   // key -> { key, club, by, kind, bytes, w, h, seconds, at, group }
  const daily = new Map();   // uid:day -> count
  const sign = s => crypto.createHmac('sha256', secret).update(s).digest('base64url');
  const safeClub = id => String(id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'x';
  const fileOf = key => path.join(dir, key.replace(/\//g, '_'));
  const used = () => [...items.values()].reduce((a, x) => a + x.bytes, 0);
  const err = (status, message) => Object.assign(new Error(message), { status });
  // a read link for one file, the same for everyone all day: it expires at the end of tomorrow (UTC)
  const readUrl = key => { const exp = (Math.floor(now() / DAY) + 2) * DAY; return `/media/f/${key}?e=${exp}&s=${sign('get:' + key + ':' + exp)}`; };

  const api = {
    slot({ kind, bytes, group }, u, club){
      const L = LIMITS[kind]; if(!L) throw err(400, 'Unknown kind.');
      if(!(bytes > 0) || bytes > L.max) throw err(400, `Too big: a ${kind} may be at most ${Math.round(L.max / 1024)} KB.`);
      const dkey = u.id + ':' + Math.floor(now() / DAY), n = daily.get(dkey) || 0;
      if(n >= PER_DAY) throw err(429, 'That is the lab\'s limit for today.');
      if(used() + bytes > DISK_MAX) throw err(507, 'The lab\'s storage on preview is full. Clear some files.');
      daily.set(dkey, n + 1);
      const key = `${safeClub(club.id)}/${kind}/${crypto.randomBytes(16).toString('hex')}.${L.ext}`, exp = now() + PUT_TTL;
      pending.set(key, { key, club: club.id, by: u.id, kind, bytes, group: String(group || '').slice(0, 40), exp });
      return { key, put: `/media/put/${key}?e=${exp}&s=${sign('put:' + key + ':' + exp)}`, type: L.type };
    },
    commit({ key, w, h }, u, club){
      const p = pending.get(key);
      if(!p || p.by !== u.id || p.club !== club.id) throw err(404, 'No such upload.');
      let buf; try{ buf = fs.readFileSync(fileOf(key)); }catch(e){ throw err(400, 'The file has not arrived.'); }
      const fail = m => { pending.delete(key); try{ fs.unlinkSync(fileOf(key)); }catch(e){} throw err(400, m); };
      const L = LIMITS[p.kind];
      if(buf.length > L.max) fail('Too big.');
      let seconds = null;
      if(L.type === 'image/jpeg'){
        if(!(buf[0] === 0xff && buf[1] === 0xd8)) fail('Not a JPEG.');
        if(hasExif(buf)) fail('The photo still carries EXIF data (camera details, maybe its location). It must be re-encoded on the phone.');
      }else{
        if(buf.toString('latin1', 4, 8) !== 'ftyp') fail('Not an MP4 file.');
        seconds = mp4Seconds(buf);
        if(MP4META.scan(buf).meta.length) fail('The video still carries metadata (maybe where it was filmed). It must be cleaned on the phone.');
        if(seconds == null) fail('The video\'s length could not be read.');
        if(seconds > L.seconds) fail(`Too long: ${seconds.toFixed(1)} s (at most ${L.seconds - 0.5} s).`);
      }
      pending.delete(key);
      const it = { key, club: p.club, by: u.id, kind: p.kind, bytes: buf.length, w: Math.round(+w) || null, h: Math.round(+h) || null, seconds, at: now(), group: p.group };
      items.set(key, it);
      return { ok: true, bytes: buf.length, seconds, url: readUrl(key) };
    },
    // this club's lab files, with today's read links (a member of another club gets that club's, never these)
    list(_, u, club){
      return { items: [...items.values()].filter(x => x.club === club.id).sort((a, b) => b.at - a.at)
        .map(x => ({ key: x.key, kind: x.kind, bytes: x.bytes, w: x.w, h: x.h, seconds: x.seconds, group: x.group, mine: x.by === u.id, url: readUrl(x.key) })),
        used: used(), limits: Object.fromEntries(Object.entries(LIMITS).map(([k, v]) => [k, { max: v.max, seconds: v.seconds }])) };
    },
    clear(_, u, club){
      let n = 0; for(const x of [...items.values()]) if(x.by === u.id && x.club === club.id){ items.delete(x.key); try{ fs.unlinkSync(fileOf(x.key)); }catch(e){} n++; }
      return { removed: n };
    },
    // the measurement summary, logged for the record (no file contents, no names: sizes, timings and the device)
    report({ report }, u){
      const s = JSON.stringify(report || {}); if(s.length > 30000) throw err(400, 'Report too large.');
      console.log('MEDIA_LAB report ' + s);
      return { ok: true };
    }
  };
  const pending = new Map();

  // the HTTP side: /media/api/<name> (JSON, signed in), /media/put/<key> (the signed upload), /media/f/<key> (read)
  function handle(req, res, url, who, headers){
    const out = (code, body, type = 'application/json', extra) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers, ...extra }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
    const m = /^\/media\/(api|put|f)\/(.+)$/.exec(url.pathname); if(!m) return out(404, { error: 'Not found' });
    if(m[1] === 'api'){
      if(req.method !== 'POST' || !Object.hasOwn(api, m[2])) return out(404, { error: 'Not found' });
      let body = ''; req.on('data', c => { body += c; if(body.length > 40000) req.destroy(); });
      req.on('end', () => {
        try{
          const { u, club } = who(req); if(!u || !club) return out(401, { error: 'Sign in first.' });
          out(200, api[m[2]](body ? JSON.parse(body) : {}, u, club));
        }catch(e){ out(e.status || 400, { error: e.message || 'Something went wrong.' }); }
      });
      return;
    }
    const key = m[2], e = +url.searchParams.get('e'), s = url.searchParams.get('s') || '';
    if(!/^[A-Za-z0-9_-]+\/(photo|thumb|poster|video)\/[0-9a-f]{32}\.(jpg|mp4)$/.test(key)) return out(404, 'Not found', 'text/plain');
    const good = (what) => e > now() && s.length === 43 && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(sign(what + ':' + key + ':' + e)));
    if(m[1] === 'put'){
      if(req.method !== 'PUT') return out(405, 'Method not allowed', 'text/plain');
      const p = pending.get(key); if(!p || !good('put')) return out(403, 'Forbidden', 'text/plain');
      const max = Math.min(LIMITS[p.kind].max, p.bytes), chunks = []; let n = 0;   // no more than the slot was asked for
      req.on('data', c => { n += c.length; if(n > max){ out(413, 'Too large', 'text/plain'); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { if(n > max) return; fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(fileOf(key), Buffer.concat(chunks)); out(200, { ok: true }); });
      return;
    }
    // read: GET, with byte ranges (Safari asks for a video in ranges and will not play it otherwise)
    if(req.method !== 'GET' && req.method !== 'HEAD') return out(405, 'Method not allowed', 'text/plain');
    const it = items.get(key); if(!it || !good('get')) return out(404, 'Not found', 'text/plain');
    let st; try{ st = fs.statSync(fileOf(key)); }catch(x){ return out(404, 'Not found', 'text/plain'); }
    const type = LIMITS[it.kind].type, cache = { 'Cache-Control': `private, max-age=${Math.max(0, Math.floor((e - now()) / 1000))}, immutable`, 'Accept-Ranges': 'bytes' };
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let a = 0, b = st.size - 1, code = 200;
    if(r){ a = r[1] ? +r[1] : st.size - +r[2]; b = r[1] && r[2] ? Math.min(+r[2], st.size - 1) : st.size - 1; code = 206;
      if(!(a >= 0 && a <= b)) return out(416, '', 'text/plain', { 'Content-Range': `bytes */${st.size}` }); }
    res.writeHead(code, { 'Content-Type': type, 'Content-Length': b - a + 1, ...(code === 206 ? { 'Content-Range': `bytes ${a}-${b}/${st.size}` } : {}), ...headers, ...cache });
    if(req.method === 'HEAD') return res.end();
    fs.createReadStream(fileOf(key), { start: a, end: b }).pipe(res);
  }
  return { ON, handle, api, LIMITS, _items: items };
}

// EXIF in a JPEG: an APP1 segment that starts "Exif\0\0" (camera, time and, when the phone recorded it, GPS)
function hasExif(buf){
  let i = 2;
  while(i + 4 <= buf.length && buf[i] === 0xff){
    const mk = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if(mk === 0xda) break;                                   // start of scan: no more headers
    if(mk === 0xe1 && buf.toString('latin1', i + 4, i + 10) === 'Exif\0\0') return true;
    i += 2 + len;
  }
  return false;
}
// an MP4's length: the movie header (mvhd), else mehd, else, in a fragmented file such as Safari's MediaRecorder writes
// (its header says 0), the sum of every fragment's sample durations per track over that track's timescale. null when
// nothing says
function mp4Seconds(buf){
  let scale = 0, dur = 0, frag = 0, curTrack = 0, curTraf = 0, trafDefault = 0;
  const tracks = new Map(), T = id => { if(!tracks.has(id)) tracks.set(id, { scale: 0, mdhd: 0, def: 0, ticks: 0 }); return tracks.get(id); };
  const walk = (a, b) => {
    for(let i = a; i + 8 <= b;){
      let size = buf.readUInt32BE(i); const t = buf.toString('latin1', i + 4, i + 8); let h = 8;
      if(size === 1){ size = Number(buf.readBigUInt64BE(i + 8)); h = 16; } else if(size === 0) size = b - i;
      if(size < h || i + size > b) break;
      const p = i + h, v = buf[p];
      if(['moov', 'mvex', 'trak', 'mdia', 'moof', 'traf'].includes(t)) walk(p, i + size);
      else if(t === 'mvhd'){ scale = v ? buf.readUInt32BE(p + 20) : buf.readUInt32BE(p + 12); dur = v ? Number(buf.readBigUInt64BE(p + 24)) : buf.readUInt32BE(p + 16); }
      else if(t === 'mehd') frag = v ? Number(buf.readBigUInt64BE(p + 4)) : buf.readUInt32BE(p + 4);
      else if(t === 'tkhd') curTrack = buf.readUInt32BE(p + (v ? 20 : 12));
      else if(t === 'mdhd'){ const x = T(curTrack); x.scale = buf.readUInt32BE(p + (v ? 20 : 12)); x.mdhd = v ? Number(buf.readBigUInt64BE(p + 24)) : buf.readUInt32BE(p + 16); }
      else if(t === 'trex') T(buf.readUInt32BE(p + 4)).def = buf.readUInt32BE(p + 12);
      else if(t === 'tfhd'){
        const f = buf.readUIntBE(p + 1, 3); curTraf = buf.readUInt32BE(p + 4); let o = p + 8;
        if(f & 1) o += 8; if(f & 2) o += 4; trafDefault = f & 8 ? buf.readUInt32BE(o) : T(curTraf).def;
      }
      else if(t === 'trun'){
        const f = buf.readUIntBE(p + 1, 3), n = buf.readUInt32BE(p + 4); let o = p + 8;
        if(f & 1) o += 4; if(f & 4) o += 4;
        const per = ((f & 0x100) ? 4 : 0) + ((f & 0x200) ? 4 : 0) + ((f & 0x400) ? 4 : 0) + ((f & 0x800) ? 4 : 0);
        let ticks = 0;
        if(f & 0x100) for(let k = 0; k < n && o + 4 <= i + size; k++, o += per) ticks += buf.readUInt32BE(o);
        else ticks = n * trafDefault;
        T(curTraf).ticks += ticks;
      }
      i += size;
    }
  };
  try{ walk(0, buf.length); }catch(e){}
  if(scale && (dur || frag)) return (dur || frag) / scale;
  let best = null;
  for(const x of tracks.values()) if(x.scale && (x.ticks || x.mdhd)){ const sec = (x.ticks || x.mdhd) / x.scale; best = Math.max(best || 0, sec); }
  return best;
}

// R2 (or any S3 store): a presigned URL, AWS Signature Version 4 in the query string. Written for the production
// step and tested against AWS's published example; nothing calls it until the owner opens R2 and gives the GO.
function presign({ method = 'GET', host, key, region = 'auto', accessKey, secretKey, expires = 600, date = new Date() }){
  const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const amz = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), day = amz.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const q = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${accessKey}/${scope}`, 'X-Amz-Date': amz, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host' };
  const qs = Object.keys(q).sort().map(k => enc(k) + '=' + enc(q[k])).join('&');
  const pathPart = '/' + key.split('/').map(enc).join('/');
  const canonical = [method, pathPart, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, crypto.createHash('sha256').update(canonical).digest('hex')].join('\n');
  const h = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
  const kSign = h(h(h(h('AWS4' + secretKey, day), region), 's3'), 'aws4_request');
  return `https://${host}${pathPart}?${qs}&X-Amz-Signature=${crypto.createHmac('sha256', kSign).update(toSign).digest('hex')}`;
}

const MP4META = require('../public/lab/mp4meta');
module.exports = { create, hasExif, mp4Seconds, presign, LIMITS };
