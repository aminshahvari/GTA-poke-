// Blindrise platform layer (club switching only): what the founder, the owner of the main Blindrise club, does for the
// platform as a whole, as opposed to running his own club. Owner decisions of 2026-10-20 (Issue #10):
// - Club Rules: shown verbatim to whoever opens a club, accepted actively; the acceptance { uid, at, v } is kept on the
//   club's definition, and a club cannot be opened without accepting the current version (fail closed).
// - Moderation: the founder can suspend, restore or cancel another club, and allow or stop its tournaments (clubs that
//   members open don't run their own unless he allows it). Every use is logged (who, when, club, action,
//   reason). There is no browsing of another club's members or emails: the founder sees aggregate counts only.
// - Broadcast: one-way Blindrise announcements and events, posted once and shown in every club, badged Blindrise. A post
//   carries only what the founder typed (no author id, no member data), and nothing ever flows back from a club.
const crypto = require('crypto');
const store = require('./store');

// ---------- Club Rules ----------
// The text is the owner's, word for word. Any change to it must raise RULES_V, so new clubs accept the new version.
const RULES_V = 1;
const RULES_TITLE = 'BLINDRISE CLUB RULES — for club owners';
const RULES = [
  '1. Your club, your responsibility: you are responsible for your club, its members, its events and its content, and for complying with the laws that apply to you and your club.',
  '2. Lawful use only: no illegal activity, no fraud, no harassment, no hate or abusive content, and nothing that infringes anyone\'s rights, through your club.',
  '3. Consent-based communication: contact members and email sign-ups only with their consent, only about your club, and stop when they opt out. No spam, ever.',
  '4. Member data stays in your club: do not sell, share or misuse your members\' information, and never use another club\'s data — you cannot see it, by design.',
  '5. Platform broadcasts: Blindrise may show official Blindrise announcements and events inside every club, including yours. This is a condition of operating a club on the platform.',
  '6. Fair use: no impersonation of Blindrise or another business, no misleading claims (including false sponsorship or prize claims), and no abuse of the platform\'s systems or limits.',
  '7. Enforcement: if a club breaks these rules or the law, Blindrise may suspend or cancel the club, with or without notice in serious cases. Suspension stops the club\'s activity and its QR joins; cancellation ends the club.',
  '8. These rules may be updated; material changes will be announced, and continuing to operate your club means accepting the current version.'
];
const rules = () => ({ v: RULES_V, title: RULES_TITLE, items: RULES });
// fail closed: only an explicit true for exactly the current version counts
function acceptance(data, uid){
  if(!data || data.acceptRules !== true || data.rulesV !== RULES_V) throw new Error('Please read the Blindrise Club Rules and tick the box to accept them, then try again.');
  return { uid, at: Date.now(), v: RULES_V };
}

// ---------- moderation ----------
const MAIN = 'main';
const ACTIONS = ['suspend', 'unsuspend', 'cancel', 'host', 'unhost'];
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// The log is append-only: one key per entry (platform:modlog:<time>-<random>), written once, never changed or deleted,
// and no API edits or removes entries.
const LOG = 'platform:modlog:';
const log = () => store.values(LOG).sort((a, b) => a.at - b.at);
const append = e => store.set(LOG + String(e.at).padStart(15, '0') + '-' + crypto.randomBytes(4).toString('hex'), e);
// a club's state for the founder: active, suspended or cancelled
const statusOf = d => d.removed ? 'cancelled' : d.suspended ? 'suspended' : 'active';
// the change itself; the caller (server/index.js) checks who asks, halts the club's tournament and tells its clients
function moderate({ club: id, action, reason }, by){
  if(!ACTIONS.includes(action)) throw fail(400, 'Pick suspend, restore, cancel, or allow or stop tournaments.');
  if(id === MAIN) throw fail(400, 'The Blindrise club cannot be suspended or cancelled.');
  const d = typeof id === 'string' && /^[a-z0-9]{3,24}$/.test(id) ? store.get('clubdef:' + id) : null;
  if(!d) throw fail(404, 'That club was not found.');
  if(d.removed) throw fail(400, 'That club was cancelled and is closed for good.');
  if(action === 'suspend' && d.suspended) throw fail(400, 'That club is already suspended.');
  if(action === 'unsuspend' && !d.suspended) throw fail(400, 'That club is not suspended.');
  if(action === 'host' && d.host) throw fail(400, 'That club can already run tournaments.');
  if(action === 'unhost' && !d.host) throw fail(400, 'That club cannot run tournaments.');
  const rec = { by: by.id, at: Date.now(), reason: clean(reason, 300) || null };
  let next;
  if(action === 'suspend') next = { ...d, suspended: rec };
  else if(action === 'unsuspend'){ const { suspended, ...rest } = d; next = rest; }
  else if(action === 'host') next = { ...d, host: rec };
  else if(action === 'unhost'){ const { host, ...rest } = d; next = rest; }
  else { const { suspended, ...rest } = d; next = { ...rest, removed: true, cancelled: rec }; }
  store.set('clubdef:' + id, next);
  append({ at: rec.at, by: by.id, byName: by.name, club: id, clubName: d.name, action, reason: rec.reason });
  return next;
}
// aggregate counts only, never names or emails (Decision 1)
function overview(){
  const users = store.values('user:');
  return store.values('clubdef:').filter(d => d && d.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map(d => ({
    id: d.id, name: d.name, status: statusOf(d), createdAt: d.createdAt || null, host: !!d.host,
    members: users.filter(u => !u.removed && u.clubs && u.clubs[d.id] && !u.clubs[d.id].removed).length,
    signups: store.keys('joinlead:' + d.id + ':').length
  }));
}

// ---------- broadcast ----------
const POSTS = 'platform:posts', POSTS_MAX = 30, SHOWN = 5;
const posts = () => store.get(POSTS) || [];
function post({ kind, title, body, when }){
  kind = kind === 'event' ? 'event' : 'announcement';
  title = clean(title, 80); body = clean(body, 600);
  if(title.length < 3) throw fail(400, 'Give the post a title (3 to 80 characters).');
  if(body.length < 3) throw fail(400, 'Write a few words for the post (up to 600 characters).');
  let at = null;
  if(when != null && when !== ''){
    at = +when;
    if(!Number.isFinite(at) || Math.abs(at - Date.now()) > 2 * 365 * 864e5) throw fail(400, 'Pick a date within the next two years.');
  }
  if(kind === 'event' && !at) throw fail(400, 'An event needs a date and time.');
  const p = { id: 'b' + crypto.randomBytes(6).toString('hex'), kind, title, body, when: at, at: Date.now() };
  store.set(POSTS, [p, ...posts()].slice(0, POSTS_MAX));
  return p;
}
function unpost({ id }){
  const all = posts();
  if(!all.some(p => p.id === id)) throw fail(404, 'That post was not found.');
  store.set(POSTS, all.filter(p => p.id !== id));
}
// what every club shows: the latest few posts, exactly the fields the founder typed
const feed = () => posts().slice(0, SHOWN).map(({ id, kind, title, body, when, at }) => ({ id, kind, title, body, when, at }));

module.exports = { RULES_V, rules, acceptance, moderate, overview, log, statusOf, post, unpost, feed };
