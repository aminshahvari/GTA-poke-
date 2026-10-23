// The onboarding funnel (Issue #39, combined review package of 2026-10-23): how many new members take each first step.
// Board design only (UI_BOARD): with it off nothing here writes anything and the Director shows nothing.
// "New members" are accounts made by an invite while the board is on (the ones that get the welcome: onb on the record).
//
// What is kept, and nothing else:
//  - per club, one key 'funnel' in the club's own store: { v: 1, weeks: { '<Monday YYYY-MM-DD>': { <counter>: n } } },
//    the week being the week the member JOINED (a cohort), in the club's time zone (CLUB_TZ, else America/Toronto);
//    the newest 26 weeks are kept. Counters: joined, welcomeDone, welcomeSkipped, game, gameSelf, picture, business,
//    invite, returned. Numbers only: no names, ids, emails, addresses or times.
//  - per new member, one small field on the account record: fn = { c: <club they joined>, m: <bits> }, so each step is
//    counted once (the bits say which steps were counted, never when). The join time is the record's own createdAt.
// Steps are counted where they happen in the club the member joined (the picture, the welcome and the return belong to
// the account, so they count for that club too). Nothing is counted per hand or on any game path.
const KEY = 'funnel', KEEP = 26, DAY = 864e5, SHOW = 8;
const BIT = { welcomeDone: 1, welcomeSkipped: 2, game: 4, gameSelf: 8, picture: 16, business: 32, invite: 64, returned: 128 };
const TZ = () => process.env.CLUB_TZ || 'America/Toronto';
const ymd = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ() });   // YYYY-MM-DD in the club's zone
// the Monday of that day's week
const weekOf = ms => { const d = new Date(ymd(ms) + 'T00:00:00Z'); return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10); };

module.exports = ({ store, clubs, on }) => {
  function bump(c, week, name){
    const f = c.store.get(KEY) || { v: 1, weeks: {} }, weeks = { ...f.weeks, [week]: { ...(f.weeks[week] || {}), [name]: ((f.weeks[week] || {})[name] || 0) + 1 } };
    c.store.set(KEY, { v: 1, weeks: Object.fromEntries(Object.keys(weeks).sort().slice(-KEEP).map(k => [k, weeks[k]])) });
  }
  // a new account made by an invite (board on): counted as joined; returns the field for its record
  function start(c, u){ if(!on()) return null; bump(c, weekOf(u.createdAt), 'joined'); return { c: c.id, m: 0 }; }
  // a new member took a step, counted once. c: the club it happened in (null for the account's own steps)
  function mark(uid, name, c){
    if(!on() || !BIT[name]) return;
    const u = store.get('user:' + uid);
    if(!u || u.removed || !u.fn || (u.fn.m & BIT[name])) return;
    if((name === 'welcomeDone' || name === 'welcomeSkipped') && (u.fn.m & 3)) return;
    if(c && c.id !== u.fn.c) return;
    const home = c || clubs.get(u.fn.c); if(!home) return;
    store.set('user:' + uid, { ...u, fn: { ...u.fn, m: u.fn.m | BIT[name] } });
    bump(home, weekOf(u.createdAt), name);
  }
  // signed in again (a socket hello): a return is a later day than the join, within 7 days of it
  function back(u, now = Date.now()){
    if(!on() || !u || !u.fn || (u.fn.m & BIT.returned) || now - u.createdAt > 7 * DAY || ymd(now) === ymd(u.createdAt)) return;
    mark(u.id, 'returned');
  }
  // the director's view: the newest weeks, newest first
  function view(c){ const f = on() && c.store.get(KEY); return f ? Object.keys(f.weeks).sort().reverse().slice(0, SHOW).map(week => ({ week, ...f.weeks[week] })) : null; }
  return { start, mark, back, view, weekOf, BIT, KEY };
};
