const E = require('../server/engine.js');
const styles = ['tight','tight','loose','loose','aggro','aggro','cautious','cautious','tight'];
let problems = 0; const P = m => { problems++; if(problems < 10) console.log('PROBLEM', m); };
async function tourney(mode){
  const g = E.newGame({ players: styles.map((s,i) => ({ name:'P'+i, style:s, isHero: mode === 'random' })) , levelMs: 1000 });
  const io = { rng: Math.random, event: async (t) => {
      const h = g.hand; if(!h || t === 'level') return;
      const sum = g.seats.reduce((s,p)=>s+(p?p.stack:0),0) + (t === 'showdown' ? 0 : E.potTotal(h));
      if(t !== 'showdown' && sum !== g.totalChips) P('chips ' + t + ' ' + sum);
      for(const p of h.players) if(p.stack < 0 || p.bet < 0) P('negative');
    }, think: async () => {},
    heroAction: async (p, L) => { // random but legal-ish, including junk sizes
      const r = Math.random();
      if(r < .2) return { t:'fold' }; if(r < .55) return { t:'call' }; if(r < .65) return { t:'check' };
      if(r < .8) return { t:'raise', to: L.minTo + Math.floor(Math.random()*5)*100 - 300 };
      if(r < .9) return { t:'raise', to: L.maxTo };
      return { t:'raise', to: Math.random()*L.maxTo*1.5 };
    } };
  let hands = 0;
  while(!g.over){
    g.levelMsLeft -= mode === 'random' ? 60 : 50; // ~20 hands per level
    await E.playHand(g, io); hands++;
    const sum = g.seats.reduce((s,p)=>s+(p?p.stack:0),0);
    if(sum !== g.totalChips) P('after hand chips ' + sum);
    if(hands > 3000){ P('too long'); break; }
  }
  const places = g.busts.map(b => b.place).sort((a,b)=>a-b).join();
  if(places !== '1,2,3,4,5,6,7,8,9') P('places ' + places);
  return { hands, winner: g.busts.find(b=>b.place===1), busts: g.busts };
}
(async () => {
  let t0 = Date.now(), tot = 0;
  for(let i = 0; i < 3000; i++){ const r = await tourney('random'); tot += r.hands; }
  console.log(`random-action stress: 3000 tournaments, ${tot} hands, ${(Date.now()-t0)/1000}s, problems ${problems}`);
  t0 = Date.now(); tot = 0; const wins = {}, itm = {}; let bubbleHands = 0;
  const N = +process.argv[2] || 40;
  for(let i = 0; i < N; i++){ const r = await tourney('bots'); tot += r.hands; const s = styles[+r.winner.name.slice(1)]; wins[s] = (wins[s]||0)+1;
    r.busts.filter(b=>b.place<=3).forEach(b => { const st = styles[+b.name.slice(1)]; itm[st] = (itm[st]||0)+1; }); }
  console.log(`AI tournaments: ${N}, avg ${Math.round(tot/N)} hands, ${(Date.now()-t0)/1000}s, wins by style`, wins, 'top-3 by style', itm, 'problems', problems);
})();
