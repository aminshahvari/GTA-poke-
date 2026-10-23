// Hand history + coach: every hand is recorded for every player, privately, and the coach never crashes.
const E = require('../server/engine.js');
const C = require('../server/coach.js');
let problems = 0; const P = m => { problems++; if(problems < 15) console.log('PROBLEM', m); };
const eq = (a, b, m) => { if(a !== b) P(`${m}: got ${a}, want ${b}`); };
const near = (a, b, tol, m) => { if(Math.abs(a - b) > tol) P(`${m}: got ${a.toFixed(3)}, want ~${b}`); };

// Chen scores (known values)
eq(C.chen(E.parse('As Ah')), 20, 'AA'); eq(C.chen(E.parse('Ks Kh')), 16, 'KK'); eq(C.chen(E.parse('2s 2h')), 5, '22');
eq(C.chen(E.parse('As Ks')), 12, 'AKs'); eq(C.chen(E.parse('7d 2c')), -1, '72o'); eq(C.chen(E.parse('Jh Th')), 9, 'JTs');
eq(C.handName(E.parse('Td As')), 'ATo', 'name'); eq(C.handName(E.parse('9h 9d')), '99', 'pair name');
// all-in equity
near(C.allInEquity(E.parse('As Ah'), E.parse('Ks Kh'), []), 0.82, 0.03, 'AA vs KK');
near(C.allInEquity(E.parse('As Kd'), E.parse('Qs Qh'), []), 0.43, 0.03, 'AKo vs QQ');
near(C.allInEquity(E.parse('Ah Kh'), E.parse('Qs Qd'), E.parse('2h 7h 9c')), 0.52, 0.04, 'flush draw + overs vs QQ on flop');
eq(C.allInEquity(E.parse('Ah Kh'), E.parse('Qs Qd'), E.parse('2h 7h 9c Qc 3d')), 0, 'river lost');

(async () => {
  const saved = new Map();
  let handsPlayed = 0, notes = 0; const kinds = {};
  for(let t = 0; t < 30; t++){
    const n = 2 + (t % 8);
    const g = E.newGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, style: ['tight','loose','aggro','cautious'][i % 4], isHero: true })), levelMs: 1000 });
    g.multi = false;
    g.seats.forEach((p, i) => { if(p) p.uid = 'u' + t + '_' + i; });
    const rec = C.recorder({ tourneyInfo: () => ({ left: g.seats.filter(Boolean).length, paid: 3, name: 'T' + t }), save: (uid, h) => { if(!saved.has(uid)) saved.set(uid, []); saved.get(uid).push(h); } });
    const io = { rng: Math.random, event: async (type, data) => rec(type, g, data), think: async () => {},
      heroAction: async (p, L) => { const r = Math.random();
        if(r < .5) return E.botDecide(g, g.hand, p, L);
        if(r < .65) return { t: 'fold' }; if(r < .8) return { t: 'call' }; if(r < .9) return { t: 'raise', to: L.minTo }; return { t: 'raise', to: L.maxTo }; } };
    let guard = 0;
    while(!g.over && guard++ < 2000){ g.levelMsLeft -= 60; const before = g.seats.filter(p => p && p.stack > 0).map(p => p.uid);
      await E.playHand(g, io); handsPlayed++;
      for(const uid of before){ const list = saved.get(uid) || []; const h = list[list.length - 1];
        if(!h || h.no !== g.handNo) { P('missing hand for ' + uid + ' hand ' + g.handNo); continue; }
        // privacy: unshown opponents' cards must not be present
        for(const op of h.players) if(!op.me && op.cards && !op.shown) P('leaked cards');
        if(h.cards.length !== 2) P('no hero cards');
        const seat = g.hand.players.find(q => q.uid === uid);
        if(seat && h.net !== seat.stack - seat.start) P('net mismatch');
        if(h.showdown) for(const op of h.players) if(!op.folded && h.pots.some(q => q.contested && q.winners.includes(op.seat)) && !op.shown) P('winner not shown');
        h.notes.forEach(x => { notes++; kinds[x.title] = (kinds[x.title] || 0) + 1; if(!x.text || !x.title || x.text.includes('NaN') || x.text.includes('undefined')) P('bad note ' + JSON.stringify(x)); });
      }
    }
  }
  // an absent player (sitting out / timed out): the table folds their hand dead, and the coach says nothing about it
  // (owner's iPhone, 2026-10-23: "Folded for a small price ... call 0 BB" after an automatic fold)
  let awayNotes = 0, awayHands = 0;
  for(let t = 0; t < 60; t++){
    const g = E.newGame({ players: Array.from({ length: 4 }, (_, i) => ({ name: 'A' + i, style: 'tight', isHero: i === 0 })), levelMs: 1000 });
    g.multi = false; g.seats.forEach((p, i) => { if(p) p.uid = 'a' + t + '_' + i; });
    const got = [];
    const rec = C.recorder({ tourneyInfo: () => ({ left: 4, paid: 2, name: 'A' }), save: (uid, h) => { if(uid === 'a' + t + '_0') got.push(h); } });
    const io = { rng: Math.random, event: async (type, data) => rec(type, g, data), think: async () => {}, heroAction: async (p, L) => {
      // plays preflop, then steps away: from the flop on the table folds the hand dead, even when a check was free
      if(g.hand.street === 0){ p.away = false; return L.canCheck ? { t: 'check' } : { t: 'call' }; }
      p.away = true; return { t: 'fold', dead: true }; } };
    for(let k = 0; k < 25 && !g.over; k++) await E.playHand(g, io);
    awayHands += got.length; got.forEach(h => { const auto = h.notes.filter(x => x.st >= 1); awayNotes += auto.length; if(auto.length) P('coach note on an automatic fold: ' + auto.map(x => x.title).join(', ')); });
  }
  if(!awayHands) P('no hands recorded for the absent player');
  console.log(`absent player: ${awayHands} hands, ${awayNotes} coach notes after the flop (want 0)`);
  console.log(`coach test: ${handsPlayed} hands, ${notes} notes`, kinds);
  if(problems){ console.log(problems + ' problems'); process.exit(1); }
  console.log('coach test passed');
})();
