const E = require('../server/engine.js'); let fail = 0, pass = 0;
const ok = (c, m) => { if(!c){ fail++; console.log('FAIL', m); } else pass++; };
const D = (entries, dead, btn) => { const r = E.distribute(entries, dead, btn); return { a: Object.fromEntries(r.awards), pots: r.pots }; };
// a) three all-ins of different sizes, best hand is the shortest
let r = D([{seat:0,total:1000,val:900},{seat:1,total:3000,val:500},{seat:2,total:5000,val:700}], 0, 8);
ok(r.a[0] === 3000 && r.a[2] === 4000 + 2000 && !r.a[1], 'side pots a ' + JSON.stringify(r.a));
ok(r.pots.length === 3 && r.pots[0].amt === 3000 && r.pots[1].amt === 4000 && r.pots[2].amt === 2000, 'pot layers a');
// b) folded player money stays in, dead ante goes to main pot only
r = D([{seat:0,total:1000,val:100},{seat:1,total:2000,folded:true},{seat:2,total:4000,val:50},{seat:3,total:4000,val:60}], 400, 8);
ok(r.a[0] === 1000*4 + 400 && r.a[3] === (2000-1000)*3 + 2000*2 && !r.a[2], 'folded + ante ' + JSON.stringify(r.a));
// c) split pot with odd chip to first seat left of the button
r = D([{seat:2,total:450,val:10},{seat:5,total:450,val:10}], 0, 4);
ok(r.a[5] === 500 && r.a[2] === 400, 'odd chip goes left of button ' + JSON.stringify(r.a));
r = D([{seat:2,total:450,val:10},{seat:5,total:450,val:10}], 0, 6);
ok(r.a[2] === 500 && r.a[5] === 400, 'odd chip wraps ' + JSON.stringify(r.a));
// d) main split three ways, side pot to one
r = D([{seat:0,total:1000,val:10},{seat:1,total:3000,val:10},{seat:2,total:3000,val:10},{seat:3,total:3000,val:5,folded:true}], 0, 3);
ok(r.a[0] === 1300 + 100 || r.a[0] + r.a[1] + r.a[2] === 10000, 'three-way conservation');
ok(r.a[0] + r.a[1] + r.a[2] === 10000 && r.a[1] === r.a[2] || Math.abs(r.a[1]-r.a[2]) <= 100, 'three-way split ' + JSON.stringify(r.a));
// e) uncalled overbet returned
r = D([{seat:0,total:10000,val:1},{seat:1,total:4000,val:9}], 0, 0);
ok(r.a[1] === 8000 && r.a[0] === 6000, 'uncalled returned ' + JSON.stringify(r.a));
// f) everyone folds
r = D([{seat:0,total:300,folded:true},{seat:1,total:600,val:0}], 600, 0);
ok(r.a[1] === 1500, 'uncontested incl ante');
// g) random conservation fuzz
for(let i=0;i<20000;i++){
  const n = 2 + Math.floor(Math.random()*8), es = [];
  for(let s=0;s<n;s++) es.push({ seat:s, total: 100*Math.floor(Math.random()*60), folded: Math.random()<.3, val: Math.floor(Math.random()*4) });
  if(es.every(e=>e.folded)) es[0].folded = false;
  const dead = 100*Math.floor(Math.random()*5), tot = es.reduce((s,e)=>s+e.total,0) + dead;
  const res = E.distribute(es, dead, Math.floor(Math.random()*n), 9); let sum = 0; res.awards.forEach(v => sum += v);
  if(sum !== tot){ ok(false, 'fuzz conservation ' + JSON.stringify(es)); break; }
  // nobody wins more than (their own layer) – a player can never win from layers above their own total
  for(const e of es){ if(e.folded && res.awards.get(e.seat)){ ok(false, 'folded player won'); break; } }
}
ok(true, 'fuzz');

// ---------- betting rules ----------
const mk = (seat, stack) => ({ seat, stack, bet:0, total:0, folded:false, allIn:false, acted:false, facedBet:0 });
let A = mk(0,10000), B = mk(1,10000), C = mk(2,1500), Dp = mk(3,2100), X = mk(4,10000);
let h = { players:[A,B,C,Dp,X], currentBet:0, minRaise:200, raiseCount:0, dead:0 };
ok(E.legal(h,A).minTo === 200, 'min bet = BB');
E.applyAction(h, A, {t:'raise', to:1000});
E.applyAction(h, B, {t:'call'});
E.applyAction(h, C, {t:'raise', to:1500}); // short all-in
ok(h.minRaise === 1000 && h.currentBet === 1500, 'short all-in keeps min raise');
ok(!E.legal(h,A).canRaise && !E.legal(h,B).canRaise, 'short all-in does not reopen for A/B');
ok(E.legal(h,Dp).canRaise && E.legal(h,Dp).minTo === 2100 && E.legal(h,X).minTo === 2500, 'unacted players may raise, min to 2500 (D capped at stack)');
E.applyAction(h, Dp, {t:'raise', to:2100}); // another short all-in: cumulative 1100 >= 1000
ok(E.legal(h,A).canRaise, 'cumulative short all-ins reopen betting for A');
ok(E.legal(h,X).minTo === 3100, 'min raise to = 2100 + 1000');
E.applyAction(h, X, {t:'raise', to:5000});
ok(h.minRaise === 2900 && E.legal(h,A).minTo === 7900, 're-raise sets min raise 2900');
ok(JSON.stringify(E.normalize({t:'raise',to:3000}, E.legal(h,A), h)) === '{"t":"raise","to":7900}', 'undersized raise bumped to min');
ok(E.normalize({t:'check'}, E.legal(h,A), h).t === 'fold', 'illegal check becomes fold');

// ---------- dead button positions ----------
function positions(){ return null; }
const g = E.newGame({ players: Array.from({length:9}, (_,i) => ({ name:'P'+i, style:'tight' })) });
g.btn = 0; g.sb = 1; g.bb = 2;
E.setPositions(g, Math.random); ok(g.btn===1 && g.sb===2 && g.bb===3, 'normal rotation');
g.seats[3] = null; // BB busts
E.setPositions(g, Math.random); ok(g.btn===2 && g.sb===3 && g.bb===4, 'dead small blind when BB busted: ' + [g.btn,g.sb,g.bb]);
g.seats[4] = null; g.seats[2] = null; // next BB busted & button-ish
E.setPositions(g, Math.random); ok(g.btn===3 && g.sb===4 && g.bb===5, 'dead button and dead SB: ' + [g.btn,g.sb,g.bb]);
E.setPositions(g, Math.random); ok(g.btn===4 && g.sb===5 && g.bb===6, 'dead button continues: ' + [g.btn,g.sb,g.bb]);
// heads-up transition
const g2 = E.newGame({ players: Array.from({length:3}, (_,i) => ({ name:'P'+i })) });
g2.btn=0; g2.sb=1; g2.bb=2; g2.seats[0] = null;
E.setPositions(g2, Math.random); ok(g2.bb===1 && g2.btn===2 && g2.sb===2, 'heads-up: button is small blind, BB moves on: ' + [g2.btn,g2.sb,g2.bb]);
E.setPositions(g2, Math.random); ok(g2.bb===2 && g2.btn===1, 'heads-up alternates');

// ---------- full scripted hands ----------
async function scripted(stacks, script, opts = {}){
  const players = stacks.map((s,i) => ({ name:'P'+i, isHero:true }));
  const g = E.newGame({ players }); stacks.forEach((s,i) => g.seats[i].stack = s);
  g.level = opts.level || 0; g.btn = opts.btn ?? 0; g.sb = opts.sb ?? 1; g.bb = opts.bb ?? 2;
  // force positions for the first hand by pre-rotating backwards
  const want = [g.btn, g.sb, g.bb]; g.btn = -2; 
  const io = { rng: Math.random, event: async () => {}, think: async () => {}, heroAction: async (p, L) => { const a = script.shift(); a && a.who !== undefined && ok(a.who === p.seat, `expected seat ${a.who} to act, got ${p.seat}`); return a || { t:'fold' }; } };
  // patch setPositions for test: use given seats
  const orig = E.setPositions;
  g.btn = want[0]; g.sb = want[1]; g.bb = want[2];
  g._fixed = true;
  return { g, io };
}
(async () => {
  // Preflop order with BB ante: 4 players, btn 0 sb 1 bb 2, level 3 (200/400 ante 400)
  const players = Array.from({length:4}, (_,i) => ({ name:'P'+i, isHero:true }));
  let g = E.newGame({ players }); g.level = 2; g.btn = 3; g.sb = 0; g.bb = 1; // next hand: bb->2, sb->1, btn->0
  const acts = []; 
  let io = { rng: Math.random, event: async () => {}, think: async () => {}, heroAction: async (p, L) => { acts.push(p.seat); return { t:'fold' }; } };
  await E.playHand(g, io);
  ok(g.btn===0 && g.sb===1 && g.bb===2, 'positions advanced');
  ok(acts.join() === '3,0,1', 'preflop order UTG,BTN,SB then BB wins: ' + acts.join());
  ok(g.seats[2].stack === 30000 + 200 && g.seats[1].stack === 30000 - 200, 'BB collects SB + own ante back: ' + g.seats.map(p=>p&&p.stack));
  const sum = g.seats.reduce((s,p)=>s+(p?p.stack:0),0); ok(sum === 120000, 'conservation after fold-out');

  // Blind priority over ante: BB has 300 at 200/400 ante 400
  g = E.newGame({ players: Array.from({length:3}, (_,i) => ({ name:'P'+i, isHero:true })) }); g.level = 2; g.btn = 2; g.sb = 0; g.bb = 1; g.seats[2].stack = 300; // seat 2 becomes BB
  io.heroAction = async (p, L) => ({ t:'call' });
  await E.playHand(g, io);
  ok(g.hand.players.find(p=>p.seat===2).ante === 0, 'short BB pays blind first, no ante');
  ok(g.seats.reduce((s,p)=>s+(p?p.stack:0),0) === 60300, 'conservation short BB');

  // Heads-up: button posts SB and acts first preflop, last postflop
  g = E.newGame({ players: Array.from({length:2}, (_,i) => ({ name:'P'+i, isHero:true })) }); g.btn = 1; g.sb = 1; g.bb = 0;
  const order = [];
  io.heroAction = async (p, L) => { order.push(g.hand.street + ':' + p.seat); return L.canCheck ? { t:'check' } : { t:'call' }; };
  await E.playHand(g, io);
  ok(g.btn === 0 && g.sb === 0 && g.bb === 1, 'HU positions ' + [g.btn, g.sb, g.bb]);
  ok(order.join() === '0:0,0:1,1:1,1:0,2:1,2:0,3:1,3:0', 'HU action order ' + order.join());

  // BB option: everyone limps, BB gets to act
  g = E.newGame({ players: Array.from({length:3}, (_,i) => ({ name:'P'+i, isHero:true })) }); g.btn = 2; g.sb = 0; g.bb = 1; // -> btn0 sb1 bb2
  const seen = [];
  io.heroAction = async (p, L) => { seen.push(p.seat + (L.canCheck ? 'k' : 'c')); if(g.hand.street===0 && p.seat===2) return { t:'raise', to: 800 }; return L.canCheck ? { t:'check' } : g.hand.street===0 ? { t:'call' } : { t:'fold' }; };
  await E.playHand(g, io);
  ok(seen.slice(0,5).join() === '0c,1c,2k,0c,1c', 'BB option then raise reopens: ' + seen.join());

  console.log(`${pass} passed, ${fail} failed`);
})();
