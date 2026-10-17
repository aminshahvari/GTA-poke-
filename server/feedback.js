// Feedback Hub: members send a bug report, an idea or a UX note (with an optional screenshot) from anywhere in the app,
// and only the owner (club director) can read them, move them through New -> Reviewing -> In progress -> Resolved, and
// delete them. Members never see anyone's feedback, including their own after sending. Nothing here reads or writes poker,
// Business Club or Opportunity Club data, and nothing here starts a timer or broadcasts: every call is request/response.
//
// What is stored is only what the member typed plus a small, fixed context: the server's own app version, which part of
// the app they were in (a fixed list), a device class worked out from the user-agent (e.g. "iPhone · Safari"; the raw
// user-agent text is not kept) and the screen size. Never PINs, tokens, chat, cards, hands, chips or anything else from
// gameplay: the client sends no such fields and the server would drop them. Nothing here logs.
//
// Off switch: FEEDBACK=off in the environment turns the whole Hub off (every endpoint answers 404, no buttons). The owner
// can also close it to members from the Director tab (settings.feedbackOff): members' buttons go and sending is refused,
// while the owner keeps the inbox.
//
// Storage (additive kv keys, nothing existing changes):
//   fb:<id>        { id, uid, cat: bug|idea|ux, text, ctx: { version, section, device, vw, vh }, status, shot, createdAt, updatedAt }
//   fbshot:<id>    { data } the screenshot, a JPEG data URL re-checked and stripped of metadata by the server
//   fblimit:<uid>  { sent: [time], shots: [time] } send times inside the limit windows (kept in storage, survives restarts)
const crypto = require('crypto');
const store = require('./store');

const CATS = { bug: 'Bug', idea: 'Idea', ux: 'UX' };
const STATUSES = { new: 'New', reviewing: 'Reviewing', progress: 'In progress', resolved: 'Resolved' };
const SECTIONS = ['home', 'poker', 'learn', 'business', 'opportunity', 'director', 'other'];
const MIN_TEXT = 5, MAX_TEXT = 2000, MAX_UA = 300;
const MAX_SHOT = 140000;   // data URL characters (about 100 KB of JPEG); the HTTP body limit for /api/fbSend sits just above
const SHOT_MAX = +process.env.FB_SHOT_MAX || 200;   // screenshots kept at once across the club (the store lives in memory)
const WIN = 36e5, DAY = 864e5;   // 5 an hour, 20 a day per member
const WIN_MAX = +process.env.FB_WIN_MAX || 5, DAY_MAX = +process.env.FB_DAY_MAX || 20, SHOT_DAY_MAX = +process.env.FB_SHOT_DAY_MAX || 5;
const LIST_MAX = 500;
const VERSION = (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || null;

const fail = (status, msg) => Object.assign(new Error(msg), { status });
const bad = msg => fail(400, msg);
const isOwner = u => !!u && u.role === 'owner';
function member(u){ if(!u) throw fail(401, 'Sign in first.'); const x = store.get('user:' + u.id); if(!x || x.removed) throw fail(401, 'Sign in first.'); return x; }
function ownerOnly(u){ member(u); if(!isOwner(u)) throw fail(403, 'Only the club director can do that.'); }
const newId = () => 'f' + crypto.randomBytes(8).toString('hex');
const ID = /^f[0-9a-f]{16}$/;
const envOff = () => process.env.FEEDBACK === 'off';
const enabled = () => !envOff() && !(store.get('settings') || {}).feedbackOff;
function on(){ if(envOff()) throw fail(404, 'Not found'); }
const pick = (map, v) => typeof v === 'string' && Object.hasOwn(map, v) ? v : null;   // only an exact string key, never an array or object

// ---------- validation ----------
// the same cleaning as Business Club text (server/business.js): NFC, control/zero-width/direction characters removed,
// whitespace collapsed. Input is cut before cleaning so a huge string costs nothing.
const STRIP = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
function clean(v, multi){
  const s = v.slice(0, MAX_TEXT * 2).normalize('NFC').replace(/\r\n?/g, '\n').replace(STRIP, '');
  return multi ? s.replace(/[\t ]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
}
function body(v){
  if(typeof v !== 'string') throw bad('Tell us what happened or what you would like.');
  if(v.length > MAX_TEXT * 2) throw bad(`Your feedback is too long (${MAX_TEXT} characters at most).`);
  const s = clean(v, true);
  if(s.length < MIN_TEXT) throw bad('Add a few more words so we can understand.');
  if(s.length > MAX_TEXT) throw bad(`Your feedback is too long (${MAX_TEXT} characters at most).`);
  return s;
}
const int = v => Number.isInteger(v) && v >= 0 && v <= 10000 ? v : null;
function context(c){
  c = c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  // only these five fields are kept; anything else the client sends is dropped
  return { version: VERSION, section: typeof c.section === 'string' && SECTIONS.includes(c.section) ? c.section : 'other', device: device(c.ua), vw: int(c.vw), vh: int(c.vh) };
}
// a device class from a fixed list, never the raw user-agent text
function device(ua){
  if(typeof ua !== 'string' || !ua) return 'Unknown';
  ua = ua.slice(0, MAX_UA);
  const os = /iPhone|iPod/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet')
    : /CrOS/.test(ua) ? 'Chromebook' : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS|Chromium/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari' : 'Other';
  return os + ' · ' + br;
}

// A screenshot must be a JPEG data URL the phone already shrank. The server checks the bytes really are a JPEG and
// rebuilds it without metadata segments (EXIF/GPS, XMP, comments), so only the picture itself is kept.
function screenshot(data){
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(typeof data === 'string' && data.length <= MAX_SHOT ? data : '');
  if(!m) throw bad('That screenshot could not be used. Use a smaller picture, or send without it.');
  const buf = Buffer.from(m[1], 'base64');
  const out = stripJpeg(buf);
  if(!out) throw bad('That screenshot could not be used. Use a smaller picture, or send without it.');
  return 'data:image/jpeg;base64,' + out.toString('base64');
}
function stripJpeg(buf){
  if(buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) return null;
  const parts = [buf.subarray(0, 2)];
  let i = 2, frame = false;
  while(i + 4 <= buf.length){
    if(buf[i] !== 0xff) return null;
    const mk = buf[i + 1];
    if(mk === 0xff){ i++; continue; }
    if(mk === 0xd8 || mk === 0xd9 || (mk >= 0xd0 && mk <= 0xd7) || mk === 0x01) return null;   // no stray markers before the scan
    const len = buf.readUInt16BE(i + 2);
    if(len < 2 || i + 2 + len > buf.length) return null;
    if(mk === 0xda){ if(!frame) return null; parts.push(buf.subarray(i)); return Buffer.concat(parts); }   // start of scan: the rest is image data
    if(mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) frame = true;
    // keep APP0 (JFIF) and everything that decodes the picture; drop APP1-APP15 (EXIF, GPS, XMP, ICC) and comments
    if(!((mk >= 0xe1 && mk <= 0xef) || mk === 0xfe)) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}

// sends per member: kept in storage so a restart does not reset them
function limits(uid, withShot){
  const now = Date.now(), cur = store.get('fblimit:' + uid) || {};
  const sent = (cur.sent || []).filter(t => now - t < DAY), shots = (cur.shots || []).filter(t => now - t < DAY);
  if(sent.filter(t => now - t < WIN).length >= WIN_MAX) throw fail(429, 'Thanks, we have your recent notes. Wait a few minutes before sending more.');
  if(sent.length >= DAY_MAX) throw fail(429, 'You have sent a lot of feedback today. Thank you! Try again tomorrow.');
  if(withShot && shots.length >= SHOT_DAY_MAX) throw fail(429, 'You have attached a lot of screenshots today. Send this one without it, or try tomorrow.');
  if(withShot && store.keys('fbshot:').length >= SHOT_MAX) throw fail(429, 'Screenshot storage is full right now. Send without it and describe what you saw.');
  return () => store.set('fblimit:' + uid, { sent: [...sent, now], shots: withShot ? [...shots, now] : shots });
}

// ---------- API ----------
const authorName = uid => { const x = store.get('user:' + uid); return x ? (x.removed ? 'Removed member' : x.name) : 'Removed member'; };
const view = f => ({ id: f.id, cat: f.cat, text: f.text, ctx: f.ctx, status: f.status, hasShot: !!f.shot, createdAt: f.createdAt, updatedAt: f.updatedAt,
  author: authorName(f.uid), authorRemoved: !store.get('user:' + f.uid) || !!store.get('user:' + f.uid).removed });

const api = {
  // any signed-in member: one note, then a thank-you. Nothing is returned about other feedback.
  fbSend(d, u){
    on(); member(u);
    if(!enabled()) throw fail(403, 'Feedback is closed right now. Thank you for trying!');
    d = d && typeof d === 'object' ? d : {};
    if(!pick(CATS, d.cat)) throw bad('Pick Bug, Idea or UX.');
    const text = body(d.text);
    const shot = d.shot == null || d.shot === '' ? null : screenshot(d.shot);
    const done = limits(u.id, !!shot);
    const now = Date.now(), id = newId();
    store.set('fb:' + id, { id, uid: u.id, cat: d.cat, text, ctx: context(d.ctx), status: 'new', shot: !!shot, createdAt: now, updatedAt: now });
    if(shot) store.set('fbshot:' + id, { data: shot });
    done();
    return { ok: true };
  },
  // owner only: everything members sent, newest first, optionally filtered by category and status
  fbList(d, u){
    on(); ownerOnly(u);
    d = d && typeof d === 'object' ? d : {};
    const cat = pick(CATS, d.cat), status = pick(STATUSES, d.status);
    const all = store.values('fb:');
    const items = all.filter(f => (!cat || f.cat === cat) && (!status || f.status === status)).sort((a, b) => b.createdAt - a.createdAt).slice(0, LIST_MAX).map(view);
    const counts = Object.fromEntries(Object.keys(STATUSES).map(s => [s, all.filter(f => f.status === s).length]));
    return { items, counts, total: all.length };
  },
  // owner only: move one note to another status
  fbSet(d, u){
    on(); ownerOnly(u);
    d = d && typeof d === 'object' ? d : {};
    if(typeof d.id !== 'string' || !ID.test(d.id)) throw fail(404, 'That feedback was not found.');
    const f = store.get('fb:' + d.id); if(!f) throw fail(404, 'That feedback was not found.');
    if(!pick(STATUSES, d.status)) throw bad('Pick New, Reviewing, In progress or Resolved.');
    store.set('fb:' + f.id, { ...f, status: d.status, updatedAt: Date.now() });
    return { ok: true, item: view(store.get('fb:' + f.id)) };
  },
  // owner only: delete one note and its screenshot for good
  fbDelete(d, u){
    on(); ownerOnly(u);
    d = d && typeof d === 'object' ? d : {};
    if(typeof d.id !== 'string' || !ID.test(d.id) || !store.get('fb:' + d.id)) throw fail(404, 'That feedback was not found.');
    store.del('fb:' + d.id); store.del('fbshot:' + d.id);
    return { ok: true };
  }
};

// GET /fbshot/<id>: the screenshot bytes, for the owner only. Anyone else (or a bad id) gets 404, so ids cannot be probed.
function shotFor(id, u){
  if(envOff() || !ID.test(id) || !u || !isOwner(u)) return { status: 404 };
  const x = store.get('user:' + u.id); if(!x || x.removed) return { status: 404 };
  const s = store.get('fbshot:' + id); if(!s) return { status: 404 };
  return { status: 200, buf: Buffer.from(s.data.slice(s.data.indexOf(',') + 1), 'base64') };
}

// A removed member's feedback is kept for the owner (it may describe a real bug) and shown as from "Removed member";
// their send-limit record is no longer needed.
function removeUser(uid){ store.del('fblimit:' + uid); }

module.exports = { api, shotFor, removeUser, enabled, envOff, CATS, STATUSES, SECTIONS, MAX_SHOT, stripJpeg, device };
