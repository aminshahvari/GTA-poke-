// Player profiles: avatars, lifetime play stats and a skill rating everyone at the club can see.
// Stats are counted from every hand a player finishes, so they outlive the 80 hands kept for review.
const store = require('./store');
const coach = require('./coach');

// Gallery avatars: an emoji on a colored disc. Ids are what gets stored on the user.
const GALLERY = {
  lion: ['🦁', '#c9822b'], wolf: ['🐺', '#55657d'], fox: ['🦊', '#c2562a'], tiger: ['🐯', '#d38b1f'], eagle: ['🦅', '#6b4f2e'],
  bear: ['🐻', '#7a5236'], panda: ['🐼', '#4b5566'], shark: ['🦈', '#2e6bcf'], dragon: ['🐉', '#2f8a5f'], octopus: ['🐙', '#9b4f8f'],
  owl: ['🦉', '#6d5a3e'], frog: ['🐸', '#3e8a3a'], cowboy: ['🤠', '#a0632a'], cool: ['😎', '#3a6fb6'], robot: ['🤖', '#5b6b85'],
  alien: ['👽', '#3f8f7f'], ghost: ['👻', '#5d5f8f'], ninja: ['🥷', '#2a2f3a'], crown: ['👑', '#b8862a'], spade: ['♠️', '#d9dee8'],
  heart: ['♥️', '#8f2a35'], diamond: ['♦️', '#2a4f8f'], club: ['♣️', '#a9d8bd'], dice: ['🎲', '#6a3fa0']
};

// Skill tiers, lowest first. min = rating needed; hands/played = sample needed before a tier is trusted.
const TIERS = [
  { id: 'rookie', name: 'Rookie', min: 0, color: '#8b95a8' },
  { id: 'regular', name: 'Regular', min: 40, color: '#38b2ac' },
  { id: 'solid', name: 'Solid', min: 56, color: '#4a90f5' },
  { id: 'shark', name: 'Shark', min: 70, color: '#f2a93b', hands: 80, played: 2 },
  { id: 'pro', name: 'Pro', min: 82, color: '#b57cff', hands: 150, played: 3 }
];
const NEW = { id: 'new', name: 'New', color: '#6b7385', min: 0 };
const MIN_HANDS = 30;

// Extra throwables unlocked by playing well.
const PERKS = { shark: ['shark'], pro: ['shark', 'crown', 'diamond'] };

function recordHand(uid, h){
  const s = store.get('pstat:' + uid) || { hands: 0, vpip: 0, pfr: 0, mistakes: 0, good: 0, mhands: 0 };
  const pre = h.actions.filter(a => a.seat === h.seat && a.st === 0);
  s.hands++;
  if(pre.some(a => a.t === 'raise' || (a.t === 'call' && !(h.pos === 'BB' && a.toCall === 0)))) s.vpip++;
  if(pre.some(a => a.t === 'raise')) s.pfr++;
  const m = h.notes.filter(n => n.kind === 'mistake').length;
  s.mistakes += m; if(m) s.mhands++;
  s.good += h.notes.filter(n => n.kind === 'good').length;
  if(coach.weakHand(h)){ s.weak = (s.weak || 0) + 1; if(!coach.voluntary(h)) s.weakFolds = (s.weakFolds || 0) + 1; }
  if(h.notes.some(n => n.title === 'Tilt check')) s.tilts = (s.tilts || 0) + 1;
  if(h.notes.some(n => n.title === 'Stayed calm')) s.calm = (s.calm || 0) + 1;
  if(h.notes.some(n => n.title === 'Reset' || n.title === 'Bad beat')) s.bigLosses = (s.bigLosses || 0) + 1;
  store.set('pstat:' + uid, s);
}

// Tournament record from finished tournaments.
function results(uid, history){
  const r = { played: 0, wins: 0, cashes: 0, top3: 0, best: null, pts: 0, pctl: 0, recent: [] };
  for(const h of history){
    const me = h.results.find(x => x.uid === uid); if(!me) continue;
    r.played++; r.pts += me.pts || 0;
    if(me.place === 1) r.wins++;
    if(me.place <= 3) r.top3++;
    if(h.payouts && h.payouts[me.place - 1]) r.cashes++;
    if(r.best == null || me.place < r.best) r.best = me.place;
    r.pctl += h.entrants > 1 ? 1 - (me.place - 1) / (h.entrants - 1) : 1;
    r.recent.push({ id: h.id, name: h.name, at: h.endedAt, place: me.place, of: h.entrants, pts: me.pts || 0, cashed: !!(h.payouts && h.payouts[me.place - 1]) });
  }
  if(r.played) r.pctl /= r.played;
  r.recent.sort((a, b) => b.at - a.at); r.recent = r.recent.slice(0, 10);
  return r;
}

// 0 to 100. Mostly how well someone decides (from the coach's notes and their preflop habits), plus results once there are enough.
function rating(s, r){
  if(s.hands < MIN_HANDS && r.played < 2) return null;
  let play = 100;
  if(s.hands){
    const mrate = s.mhands / s.hands, vp = s.vpip / s.hands * 100, ratio = s.vpip ? s.pfr / s.vpip : 0;
    play -= Math.min(60, mrate * 350);                       // 10% of hands with a mistake costs 35
    play -= Math.min(25, Math.max(0, 14 - vp, vp - 34) * 1.4); // too tight or too loose
    if(s.vpip >= 5 && ratio < .5) play -= Math.min(15, (.5 - ratio) * 40); // calls a lot, raises little
    play += Math.min(8, s.good / s.hands * 150);
    play -= Math.min(15, (s.tilts || 0) / s.hands * 400);   // mistakes right after a big loss count extra
  } else play = 55;
  const res = r.played ? r.pctl * 70 + (r.cashes / r.played) * 30 : 50;
  const w = Math.min(r.played, 10) / 10 * .4;
  return Math.max(0, Math.min(100, Math.round(play * (1 - w) + res * w)));
}
function tierFor(score, s, r){
  if(score == null) return NEW;
  let t = TIERS[0];
  for(const x of TIERS) if(score >= x.min && (!x.hands || s.hands >= x.hands) && (!x.played || r.played >= x.played)) t = x;
  return t;
}

function profile(uid, history){
  const s = store.get('pstat:' + uid) || { hands: 0, vpip: 0, pfr: 0, mistakes: 0, good: 0, mhands: 0 };
  const r = results(uid, history), score = rating(s, r), t = tierFor(score, s, r);
  return { uid, score, tier: t.id, tierName: t.name, color: t.color,
    hands: s.hands, vpip: s.hands ? Math.round(s.vpip / s.hands * 100) : 0, pfr: s.hands ? Math.round(s.pfr / s.hands * 100) : 0,
    clean: s.hands ? Math.round((1 - s.mhands / s.hands) * 100) : 0, good: s.good,
    patience: s.weak >= 5 ? Math.round(s.weakFolds / s.weak * 100) : null, tilts: s.tilts || 0, calm: s.calm || 0, bigLosses: s.bigLosses || 0, ...r, pctl: Math.round(r.pctl * 100) };
}
const perksFor = tier => PERKS[tier] || [];

// ---------- avatars ----------
const MAX_PHOTO = 60000;
function setAvatar(u, a){
  if(!a || a.kind === 'none'){ store.del('avatar:' + u.id); return { ...u, av: null }; }
  if(a.kind === 'gallery'){
    if(!GALLERY[a.id]) throw new Error('Pick one of the avatars shown.');
    store.del('avatar:' + u.id); return { ...u, av: 'g:' + a.id };
  }
  if(a.kind === 'photo'){
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(a.data || ''));
    if(!m || a.data.length > MAX_PHOTO) throw new Error('That photo could not be used. Try another one.');
    const buf = Buffer.from(m[1], 'base64');
    if(buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('That photo could not be used. Try another one.');
    const v = Date.now().toString(36);
    store.set('avatar:' + u.id, { v, data: m[1] });
    return { ...u, av: 'p:' + v };
  }
  throw new Error('Unknown avatar.');
}
function photo(uid){ const a = store.get('avatar:' + uid); return a ? Buffer.from(a.data, 'base64') : null; }

module.exports = { GALLERY, TIERS, NEW, PERKS, perksFor, recordHand, results, rating, tierFor, profile, setAvatar, photo };
