// Independent fairness checks for the table extras (Muse, overnight audit Area 4).
// Plays the 3,000-tournament random-action stress twice with identical seeds: once with the extras off (no
// GAMEPLAY_OPTIONS), once with show-or-muck and rabbit hunt on, running the club's real post-hand code and the real
// public table snapshot after every event. Then checks:
//  1. outcomes and chips are identical: every hand's stacks, pots, board, busts and places hash the same both ways;
//  2. the public table view is identical except the extras' own fields (rabbit, showOffer, and the cards players chose to show);
//  3. no hole card leaks: with the extras on, a card is face up only if today's rules show it (showdown or all-in) or
//     its holder (folded or not) chose to show exactly that card after the pot was awarded; never before the result;
//  4. every rabbit card is the sealed deck's next position (burn, card) and verifies against the seal (SHA-256 of seed).
// Usage: node test/t_extras_parity.js [tournaments=3000]
const crypto = require('crypto');
const E = require('../server/engine');
const fair = require('../server/fair');
const store = require('../server/store');
const club = require('../server/club');

const N = +process.argv[2] || 3000;
let problems = 0; const P = m => { problems++; if(problems < 15) console.log('PROBLEM', m); };
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const styles = ['tight', 'tight', 'loose', 'loose', 'aggro', 'aggro', 'cautious', 'cautious', 'tight'];
// public/fair-verify.js dealing
function dealt(deck, n, boardLen){
  const d = deck.slice(), hole = Array.from({ length: n }, () => []);
  for(let r = 0; r < 2; r++) for(let i = 0; i < n; i++) hole[i].push(d.pop());
  const board = [];
  if(boardLen >= 3){ d.pop(); board.push(d.pop(), d.pop(), d.pop()); }
  if(boardLen >= 4){ d.pop(); board.push(d.pop()); }
  if(boardLen >= 5){ d.pop(); board.push(d.pop()); }
  return { hole, board };
}
// the extras' own fields, removed so the rest of the view can be compared with the extras-off view
function strip(snap, chosen){
  const s = { ...snap }; delete s.rabbit; delete s.showOffer;
  s.seats = s.seats.map(x => x && chosen[x.uid] && chosen[x.uid].length && snap.result ? { ...x, shown: null } : x);
  return JSON.stringify(s);
}
let rabbitHands = 0, shows = 0, foldedShows = 0, offers = 0, views = 0;

async function tourney(i, on){
  process.env.GAMEPLAY_OPTIONS = on ? '1' : ''; delete process.env.STAGING;
  store.set('tourney', on ? { id: 'par' + i, status: 'running', level: 0, anteMode: 'each', showMuck: true, rabbit: true } : { id: 'par' + i, status: 'running', level: 0, anteMode: 'each' });
  const rnd = mulberry(1000 + i), pickRnd = mulberry(9000 + i);
  Math.random = rnd; // the random actions and the bots draw from the same seeded stream both ways
  const { seed, seal } = { seed: sha('seed' + i), seal: sha(sha('seed' + i)) };
  const tid = 'par' + i + '-1';
  const g = E.newGame({ players: styles.map((s, k) => ({ name: 'P' + k, style: s, isHero: true })), levelMs: 1000 });
  g.seats.forEach((p, k) => { if(p) p.uid = 'u' + k; }); g.multi = false;
  const tb = { tid, n: 1, g, seq: 0, broken: false, inHand: true, acting: null, handStart: {}, note: '' };
  club.tables.clear(); club.tables.set(tid, tb);
  const out = crypto.createHash('sha256'), viewHash = crypto.createHash('sha256');
  let chosen = {};
  const io = {
    rng: rnd,
    deck: async handNo => fair.deckFrom(`${seed}|${sha('beacon' + i + ':' + handNo)}|${tid}|${handNo}`),
    event: async type => {
      const h = g.hand; if(!h || type === 'level') return;
      if(type === 'deal') chosen = {};
      if(on && type === 'showdown' && h.result){
        club._extras.resultExtras(tb, h);
        if(tb.show && tb.show.hand === h.no){
          offers++;
          if(club.show('nobody', { tid, hand: h.no, cards: [0, 1] })) P('someone not in the hand could show');
          for(const p of h.players){
            const may = !(p.shown && !p.folded);
            const pick = [null, [], [0], [1], [0, 1]][Math.floor(pickRnd() * 5)];
            if(!may){ if(club.show(p.uid, { tid, hand: h.no, cards: [0, 1] })) P('a hand already face up accepted a show'); continue; }
            if(pick === null) continue; // never answers: shows nothing
            if(!club.show(p.uid, { tid, hand: h.no, cards: pick })) P('a player could not answer');
            if((pick.length === 0 || pick.length === 2) && club.show(p.uid, { tid, hand: h.no, cards: [0, 1] })) P('answer after a muck or show-both accepted');
            if(club.show(p.uid, { tid, hand: h.no + 1, cards: [0, 1] })) P('show for another hand accepted');
            if(pick.length){ shows++; if(p.folded) foldedShows++; chosen[p.uid] = pick; }
          }
        }
        if(h.rabbit){
          rabbitHands++;
          const deck = fair.deckFrom(`${seed}|${sha('beacon' + i + ':' + h.no)}|${tid}|${h.no}`);
          if(sha(seed) !== seal) P('seal');
          const full = dealt(deck, h.players.length, 5).board;
          if(h.rabbit.join() !== full.slice(h.board.length).join()) P('rabbit card is not the sealed deck\'s next position, hand ' + h.no);
          if(h.board.length < 3 || h.board.length > 4 || h.result.showdown) P('rabbit on a hand it should not have');
        }
      }
      if(on && type !== 'showdown' && (tb.show && tb.show.hand === h.no && !h.result)) P('offer before the result');
      // the public view everyone (players and watchers) receives
      const snap = club.snapshot(tb); views++;
      viewHash.update(strip(snap, chosen));
      if(on){
        snap.seats.forEach(x => {
          if(!x || !x.shown) return;
          const p = h.players.find(q => q.uid === x.uid);
          const today = p && p.shown && !p.folded; // what the club already shows (showdown, all-in)
          const k = chosen[x.uid], picked = snap.result && k && [0, 1].every(j => k.includes(j) ? x.shown[j] === E.cardStr(p.cards[j]) : x.shown[j] === null);
          if(!today && !picked) P(`hole card face up without a reason: ${type}, hand ${h.no}, ${x.uid}`);
        });
        if(!snap.result && (snap.rabbit || snap.showOffer)) P('extras visible before the result');
      }
      if(type === 'showdown'){
        out.update(JSON.stringify([h.no, g.seats.map(p => p && p.stack), h.board, h.result.pots, [...h.result.awards]]));
        const sum = g.seats.reduce((s, p) => s + (p ? p.stack : 0), 0); if(sum !== g.totalChips) P('chips ' + sum);
      }
    },
    think: async () => {},
    heroAction: async (p, L) => {
      const r = Math.random();
      if(r < .2) return { t: 'fold' }; if(r < .55) return { t: 'call' }; if(r < .65) return { t: 'check' };
      if(r < .8) return { t: 'raise', to: L.minTo + Math.floor(Math.random() * 5) * 100 - 300 };
      if(r < .9) return { t: 'raise', to: L.maxTo };
      return { t: 'raise', to: Math.random() * L.maxTo * 1.5 };
    }
  };
  let hands = 0;
  while(!g.over && hands <= 3000){ g.levelMsLeft -= 60; tb.show = null; await E.playHand(g, io); hands++; }
  out.update(JSON.stringify(g.busts.map(b => [b.name, b.place, b.hand])));
  return { hands, outcome: out.digest('hex'), view: viewHash.digest('hex') };
}

(async () => {
  const t0 = Date.now(); let hands = 0, same = 0, sameView = 0;
  for(let i = 0; i < N; i++){
    const a = await tourney(i, false), b = await tourney(i, true);
    hands += a.hands;
    if(a.hands !== b.hands || a.outcome !== b.outcome) P(`tournament ${i}: outcome differs with the extras on`); else same++;
    if(a.view !== b.view) P(`tournament ${i}: public view differs beyond the extras' fields`); else sameView++;
  }
  if(!rabbitHands || !shows || !offers || !foldedShows) P(`extras never exercised (rabbit ${rabbitHands}, offers ${offers}, shows ${shows}, folded ${foldedShows})`);
  console.log(`extras parity: ${N} tournaments x2, ${hands} hands, ${views} table views; identical outcomes ${same}/${N}, identical views ${sameView}/${N}; ${rabbitHands} rabbit hands verified against the seal; ${offers} show offers, ${shows} shows (${foldedShows} by folded players); ${(Date.now() - t0) / 1000}s, problems ${problems}`);
  process.exit(problems ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
