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
  const s = store.scoped(id);
  const fair = fresh('fair.js', { './store': s });
  const players = fresh('players.js', { './store': s });
  const rewards = fresh('rewards.js', { './store': s });
  const business = fresh('business.js', { './store': s });
  const opportunity = fresh('opportunity.js', { './store': s, './business': business });
  const club = fresh('club.js', { './store': s, './fair': fair, './players': players });
  return { id, store: s, club, rewards, business, opportunity, players, fair };
}

const ctxs = new Map();
const validId = id => typeof id === 'string' && /^[a-z0-9]{3,24}$/.test(id);
const def = id => id === MAIN ? { id: MAIN, name: (store.get('settings') || {}).clubName || 'Blindrise' } : store.get('clubdef:' + id) || null;
function get(id){
  if(!ON() || id === MAIN || id == null) id = MAIN;
  else if(!validId(id) || !def(id)) return null;
  if(!ctxs.has(id)){ const c = build(id); ctxs.set(id, c); if(onNew) onNew(c); }
  return ctxs.get(id);
}
let onNew = null;
// every club this deployment has, main first
const all = () => [MAIN, ...(ON() ? store.keys('clubdef:').map(k => k.slice(8)).sort() : [])].map(get).filter(Boolean);
// the clubs an account belongs to (raw account record from the plain store)
function memberships(u){
  if(!u || u.removed) return []; // removed: the account was closed (from main), so it is in no club at all
  if(!ON()) return u.noMain ? [] : [MAIN]; // noMain: only in another club, never in main
  const out = [];
  if(!u.noMain) out.push(MAIN);
  for(const [id, m] of Object.entries(u.clubs || {})) if(m && !m.removed && def(id)) out.push(id);
  return out;
}
function create(name, ownerId){
  const id = 'c' + require('crypto').randomBytes(5).toString('hex');
  store.set('clubdef:' + id, { id, name, createdAt: Date.now(), createdBy: ownerId });
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
module.exports = { ON, MAIN, get, all, def, memberships, create, addMember, validId, onNew: f => { onNew = f; } };
