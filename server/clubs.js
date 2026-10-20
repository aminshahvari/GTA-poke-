// Club contexts. With club switching off (production: no CLUB_SWITCHING, no STAGING) there is exactly one context,
// 'main', built from the normal modules and the plain store, so behaviour is exactly as before.
// With it on, every club gets its own copies of the club modules (tournament director, rewards, Exchange, stats,
// fairness records), each loaded with a store scoped to that club (store.scoped), so a club's code can only see its
// own data and its own members. Engine, coach and content rules hold no data and are shared.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const store = require('./store');

const ON = store.switching; // CLUB_SWITCHING=1 or STAGING=1 (server/store.js)
const MAIN = 'main';
// The Blindrise Open (owner decisions of 2026-10-20, Issue #10): Blindrise tournaments that members of every club can
// join. They run in a context of their own, 'events', directed by the founder, so the registration list, tables and
// results belong to Blindrise and to no club. A member of any club becomes a member here only by registering
// (membership role 'member', plus home: the club they registered from). Players appear under their table name, never
// a real name; two names that would look alike get their home club's name added (aliasStore below).
const EVENTS = 'events', EVENTS_NAME = 'Blindrise Open';

// load a fresh copy of one of our server files, with some of its requires replaced
function fresh(file, overrides){
  const full = path.join(__dirname, file);
  const m = new Module(full, module);
  m.filename = full; m.paths = Module._nodeModulePaths(__dirname);
  const req = m.require.bind(m);
  m.require = id => Object.hasOwn(overrides, id) ? overrides[id] : req(id);
  m._compile(fs.readFileSync(full, 'utf8'), full);
  return m.exports;
}
function build(id){
  if(!ON()) return { id: MAIN, store, club: require('./club'), rewards: require('./rewards'), business: require('./business'), opportunity: require('./opportunity'), players: require('./players'), fair: require('./fair') };
  const s = id === EVENTS ? aliasStore(store.scoped(id)) : store.scoped(id);
  const fair = fresh('fair.js', { './store': s });
  const players = fresh('players.js', { './store': s });
  const rewards = fresh('rewards.js', { './store': s });
  const business = fresh('business.js', { './store': s });
  const opportunity = fresh('opportunity.js', { './store': s, './business': business });
  const club = fresh('club.js', { './store': s, './fair': fair, './players': players });
  return { id, store: s, club, rewards, business, opportunity, players, fair };
}
// Names in the Blindrise Open: every name the events context reads (seats, chat, standings, results, members) comes
// through here. Account names are unique, but two can still look alike (Ali and AIi, J.Doe and JDoe): those get a short
// tag of the club they registered from, "Ali (BLI)" and "AIi (HC)", short so it still shows on a seat, and if that is the
// same club too, the last characters of their account id as well, so no two players ever show the same name.
// A name is only ever the table name: there is no other name to show.
const look = n => String(n || '').normalize('NFKC').toLowerCase().replace(/[\s._-]+/g, '').replace(/0/g, 'o').replace(/[1i|!]/g, 'l').replace(/5/g, 's');
// "Harbour Club" -> HC, "Blindrise" -> BLI
const tagOf = name => { const w = String(name || '').match(/[\p{L}\p{N}]+/gu) || ['?']; return (w.length > 1 ? w.slice(0, 3).map(x => x[0]).join('') : w[0].slice(0, 3)).toUpperCase(); };
function aliasStore(s){
  let memo = null;
  const roster = () => {
    if(memo && Date.now() - memo.at < 250) return memo.m;
    const m = new Map();
    for(const k of s.keys('user:')){ const u = s.get(k); if(!u || u.removed) continue; const n = look(u.name); m.set(n, [...(m.get(n) || []), u]); }
    memo = { at: Date.now(), m };
    return m;
  };
  const homeTag = u => { const d = u.home && def(u.home); return tagOf(d ? d.name : (def(MAIN) || {}).name || 'Blindrise'); };
  const shown = u => {
    const alike = (roster().get(look(u.name)) || []).filter(x => x.id !== u.id);
    if(!alike.length) return u.name;
    const tag = homeTag(u), same = alike.filter(x => homeTag(x) === tag);
    if(!same.length) return u.name + ' (' + tag + ')';
    let k = 2; while(k < u.id.length && same.some(x => x.id.slice(-k) === u.id.slice(-k))) k++; // as many characters as it takes
    return u.name + ' (' + tag + '·' + u.id.slice(-k) + ')';
  };
  const w = Object.assign({}, s, {
    get: k => { const v = s.get(k); return v && k.startsWith('user:') ? { ...v, name: shown(v) } : v; },
    set: (k, v) => { memo = null; return s.set(k, v); },
    values: prefix => s.keys(prefix).map(k => w.get(k))
  });
  return w;
}

const ctxs = new Map();
const validId = id => typeof id === 'string' && /^[a-z0-9]{3,24}$/.test(id);
// a cancelled club (removed: true, see server/platform.js) no longer exists for anyone; its data stays stored
const def = id => { if(id === EVENTS) return ON() ? { id: EVENTS, name: EVENTS_NAME, events: true } : null; if(id === MAIN) return { id: MAIN, name: (store.get('settings') || {}).clubName || 'Blindrise' }; const d = store.get('clubdef:' + id); return d && !d.removed ? d : null; };
// a suspended club exists (members still see it, with a notice) but nothing in it can be used
const suspended = id => id !== MAIN && !!(def(id) || {}).suspended;
function get(id){
  if(!ON() || id === MAIN || id == null) id = MAIN;
  else if(!validId(id) || !def(id)) return null;
  if(!ctxs.has(id)){ const c = build(id); ctxs.set(id, c); if(onNew) onNew(c); }
  return ctxs.get(id);
}
let onNew = null;
// every club this deployment has, main first
const all = () => [MAIN, ...(ON() ? [...store.keys('clubdef:').map(k => k.slice(8)).sort(), EVENTS] : [])].map(get).filter(Boolean);
// the clubs an account belongs to (raw account record from the plain store)
function memberships(u){
  if(!u || u.removed) return []; // removed: the account was closed (from main), so it is in no club at all
  if(!ON()) return u.noMain ? [] : [MAIN]; // noMain: only in another club, never in main
  const out = [];
  if(!u.noMain) out.push(MAIN);
  for(const [id, m] of Object.entries(u.clubs || {})) if(m && !m.removed && id !== EVENTS && def(id)) out.push(id);
  if(u.clubs && u.clubs[EVENTS] && !u.clubs[EVENTS].removed) out.push(EVENTS); // the Blindrise Open comes last
  return out;
}
// extra: more fields for the club's definition (the Club Rules acceptance, { rules: { uid, at, v } })
function create(name, ownerId, extra){
  const id = 'c' + require('crypto').randomBytes(5).toString('hex');
  store.set('clubdef:' + id, { ...extra, id, name, createdAt: Date.now(), createdBy: ownerId });
  const u = store.get('user:' + ownerId);
  store.set('user:' + ownerId, { ...u, clubs: { ...(u.clubs || {}), [id]: { role: 'owner', joinedAt: Date.now() } } });
  const c = get(id);
  c.store.set('owner', ownerId);
  return c;
}
// add an account to a club as a member (an invite was used)
function addMember(c, uid, invitedBy){
  const u = store.get('user:' + uid);
  if(c.id === MAIN){
    const { noMain, ...rest } = u;
    store.set('user:' + uid, { ...rest, role: rest.role === 'owner' ? 'owner' : 'member', ...(invitedBy && !rest.invitedBy ? { invitedBy } : {}) });
  } else {
    const cur = (u.clubs || {})[c.id];
    store.set('user:' + uid, { ...u, clubs: { ...(u.clubs || {}), [c.id]: { ...(cur && !cur.removed ? cur : { role: 'member', joinedAt: Date.now() }), removed: false, ...(invitedBy && !(cur && !cur.removed) ? { invitedBy } : {}) } } });
  }
}
module.exports = { ON, MAIN, EVENTS, get, all, def, suspended, memberships, create, addMember, validId, onNew: f => { onNew = f; } };
