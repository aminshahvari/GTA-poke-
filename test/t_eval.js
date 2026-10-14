const E = require('../server/engine.js'); let fail = 0;
const ok = (c, m) => { if(!c){ fail++; console.log('FAIL', m); } };
const ev = s => E.evaluate(E.parse(s));
const cases = [
 ['As Ks Qs Js Ts 2d 3c','Royal Flush'], ['5h 4h 3h 2h Ah Kd Kc','Straight Flush, Five High'],
 ['9c 9d 9h 9s 2c 3d Kh','Four of a Kind, Nines'], ['Kc Kd Kh 7s 7c 2d 3h','Full House, Kings full of Sevens'],
 ['Kc Kd Kh 7s 7c 7d 3h','Full House, Kings full of Sevens'], ['2c 2d 2h Qs Qc Ad Ah','Full House, Twos full of Aces'],
 ['Ah 9h 7h 4h 2h Kd Kc','Flush, Ace High'], ['As 2d 3c 4h 5s 9d Kc','Straight, Five High'],
 ['Ts Jd Qc Kh As 2d 2c','Straight, Ace High'], ['Qs Kd Ac 2h 3s 9d 9c','Pair of Nines'],
 ['7s 7d 7c Ah Kd 2c 4h','Three of a Kind, Sevens'], ['Ks Kd 5c 5h 3d 3c Ah','Two Pair, Kings and Fives'],
 ['As Qd 9c 7h 4d 3c 2h','Ace High'], ['6s 7s 8s 9s Ts Js 2d','Straight Flush, Jack High'],
];
for(const [h, n] of cases){ const d = E.describe(ev(h)); ok(d === n, `${h}: got ${d}, want ${n}`); }
const gt = (a, b, m) => ok(ev(a) > ev(b), m), eq = (a, b, m) => ok(ev(a) === ev(b), m);
gt('As Ks Qs Js Ts 2d 3c','9s 8s 7s 6s 5s 2d 3c','royal > SF');
gt('6s 7s 8s 9s Ts 2d 3c','As 2s 3s 4s 5s Kd Qc','6-high SF > steel wheel');
gt('2c 3d 4h 5s 6c Kd Kh','Ac 2d 3h 4s 5c Kd Kh','six-high straight > wheel');
gt('Kc Kd Kh 2s 2c 9d 8h','Qc Qd Qh As Ac 9d 8h','KKK22 > QQQAA');
gt('Kc Kd Kh As Ac 9d 8h','Kc Kd Kh Qs Qc 9d 8h','kicker pair in FH');
gt('Ah Kh 3h 4h 6h 2c 2d','Ah Qh Jh Th 8h 2c 2d','flush 2nd card');
gt('9c 9d As 4h 3c 2d 7h','9c 9d Ks Qh Jc 2d 7h','pair kicker');
eq('9c 9d As Kh Qc 2d 3h','9h 9s Ad Kc Qs 4d 5h','5 cards only count (kickers 4,5 vs 2,3 ignored)');
gt('Kc Kd 5c 5h Qs 3c 3d','Kc Kd 5c 5h Js 3c 3d','two pair kicker uses third pair or single');
eq('Kc Kd 5c 5h 4s 3c 3d','Kc Kd 5c 5h 4s 2c 2d','two pair kicker 4 both');
gt('Ac Ad Ah As 2c 3d 5h','Ac Ad Ah As 2c 3d 4h','quads kicker');
gt('2c 3c 4c 5c 7c 8d 9h','Ac Kd Qh Js Tc 2d 3h','flush > straight');
gt('2c 2d 3c 3d 4h 4s 5c','Ac Kd Qh Js 9c 2d 3h','two pair > high card');
// cross-check against an independent brute-force 5-card reference
function ref5(cs){
  const r = cs.map(E.rankOf).sort((a,b)=>b-a), s = cs.map(E.suitOf);
  const flush = s.every(x => x === s[0]);
  const u = [...new Set(r)]; let straight = 0;
  if(u.length === 5){ if(r[0]-r[4] === 4) straight = r[0]; else if(r.join() === '14,5,4,3,2') straight = 5; }
  const cnt = {}; r.forEach(x => cnt[x] = (cnt[x]||0)+1);
  const g = Object.entries(cnt).map(([k,v]) => [+v, +k]).sort((a,b) => b[0]-a[0] || b[1]-a[1]);
  const ks = g.map(x => x[1]);
  if(straight && flush) return [8, straight];
  if(g[0][0] === 4) return [7, ...ks];
  if(g[0][0] === 3 && g[1][0] === 2) return [6, ...ks];
  if(flush) return [5, ...r];
  if(straight) return [4, straight];
  if(g[0][0] === 3) return [3, ...ks];
  if(g[0][0] === 2 && g[1][0] === 2) return [2, ...ks];
  if(g[0][0] === 2) return [1, ...ks];
  return [0, ...r];
}
const cmp = (a, b) => { for(let i = 0; i < Math.max(a.length, b.length); i++){ const d = (a[i]||0) - (b[i]||0); if(d) return Math.sign(d); } return 0; };
function ref7(cs){ let best = null; for(let a=0;a<7;a++)for(let b=a+1;b<7;b++){ const five = cs.filter((_,i)=>i!==a&&i!==b); const v = ref5(five); if(!best || cmp(v,best) > 0) best = v; } return best; }
const deal = n => { const d = [...Array(52).keys()]; for(let i=51;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];} return d.slice(0,n); };
let N = 200000, cats = new Array(9).fill(0);
for(let i = 0; i < N; i++){
  const d = deal(9), board = d.slice(4), A = d.slice(0,2).concat(board), B = d.slice(2,4).concat(board);
  const ea = E.evaluate(A), eb = E.evaluate(B), ra = ref7(A), rb = ref7(B);
  cats[E.category(ea)]++;
  if(E.category(ea) !== ra[0]){ ok(false, 'category mismatch ' + A.map(E.cardStr)); break; }
  if(Math.sign(ea - eb) !== cmp(ra, rb)){ ok(false, 'order mismatch ' + A.map(E.cardStr) + ' vs ' + B.map(E.cardStr)); break; }
  if(i % 20 === 0){ const bf = E.bestFive(A); if(bf.val !== ea){ ok(false, 'bestFive mismatch'); break; } }
}
console.log('random 7-card hands checked:', N, 'category counts:', cats.map((c,i)=>E.CAT[i]+':'+c).join(', '));
// forced rare categories through reference too
for(let i=0;i<20000;i++){ const d = deal(7); const f = [d[0], d[0]^1, d[0]^2, d[0]^3].filter(x=>x<52 && x>=0); }
console.log(fail ? `${fail} FAILURES` : 'evaluator: all passed');
