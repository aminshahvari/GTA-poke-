const Engine = (() => {
'use strict';
// ---------- cards ----------
const RANKS = '23456789TJQKA', SUITS = '♠♥♦♣';
const rankOf = c => (c >> 2) + 2, suitOf = c => c & 3;
const P5 = 15 ** 5;
const cardStr = c => RANKS[rankOf(c) - 2] + 'shdc'[suitOf(c)];
const parse = s => s.trim().split(/\s+/).map(t => (RANKS.indexOf(t[0].toUpperCase()) << 2) | 'shdc'.indexOf(t[1].toLowerCase()));

// ---------- hand evaluation (5 to 7 cards) ----------
function code(cat, ks){ let v = cat; for(let i = 0; i < 5; i++) v = v * 15 + (ks[i] || 0); return v; }
function straightHigh(bits){
  if(bits & (1 << 14)) bits |= 2; // ace plays low in the wheel
  for(let h = 14; h >= 5; h--){ const m = 0b11111 << (h - 4); if((bits & m) === m) return h; }
  return 0;
}
function evaluate(cards){
  const rc = new Array(15).fill(0), sc = [0,0,0,0], sb = [0,0,0,0]; let bits = 0;
  for(const c of cards){ const r = rankOf(c), s = suitOf(c); rc[r]++; sc[s]++; sb[s] |= 1 << r; bits |= 1 << r; }
  let fs = -1; for(let s = 0; s < 4; s++) if(sc[s] >= 5) fs = s;
  if(fs >= 0){ const sh = straightHigh(sb[fs]); if(sh) return code(8, [sh]); }
  const quads = [], trips = [], pairs = [], singles = [];
  for(let r = 14; r >= 2; r--){ const n = rc[r]; if(n === 4) quads.push(r); else if(n === 3) trips.push(r); else if(n === 2) pairs.push(r); else if(n === 1) singles.push(r); }
  if(quads.length){ let k = 0; for(let r = 14; r >= 2; r--) if(r !== quads[0] && rc[r]){ k = r; break; } return code(7, [quads[0], k]); }
  if(trips.length && (trips.length > 1 || pairs.length)) return code(6, [trips[0], Math.max(trips[1] || 0, pairs[0] || 0)]);
  if(fs >= 0){ const ks = []; for(let r = 14; r >= 2 && ks.length < 5; r--) if(sb[fs] & (1 << r)) ks.push(r); return code(5, ks); }
  const sh = straightHigh(bits); if(sh) return code(4, [sh]);
  if(trips.length) return code(3, [trips[0], ...singles.slice(0, 2)]);
  if(pairs.length >= 2) return code(2, [pairs[0], pairs[1], Math.max(pairs[2] || 0, singles[0] || 0)]);
  if(pairs.length) return code(1, [pairs[0], ...singles.slice(0, 3)]);
  return code(0, singles.slice(0, 5));
}
function bestFive(cards){
  let best = -1, pick = null; const n = cards.length;
  for(let a = 0; a < n; a++) for(let b = a+1; b < n; b++) for(let c = b+1; c < n; c++) for(let d = c+1; d < n; d++) for(let e = d+1; e < n; e++){
    const five = [cards[a], cards[b], cards[c], cards[d], cards[e]], v = evaluate(five);
    if(v > best){ best = v; pick = five; }
  }
  return { val: best, cards: pick };
}
const CAT = ['High Card','Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'];
const ONE = {2:'Two',3:'Three',4:'Four',5:'Five',6:'Six',7:'Seven',8:'Eight',9:'Nine',10:'Ten',11:'Jack',12:'Queen',13:'King',14:'Ace'};
const MANY = {2:'Twos',3:'Threes',4:'Fours',5:'Fives',6:'Sixes',7:'Sevens',8:'Eights',9:'Nines',10:'Tens',11:'Jacks',12:'Queens',13:'Kings',14:'Aces'};
const category = v => Math.floor(v / P5);
function digits(v){ const d = []; for(let i = 0; i < 5; i++){ d.unshift(v % 15); v = Math.floor(v / 15); } return d; }
function describe(v){
  const cat = category(v), k = digits(v);
  switch(cat){
    case 0: return `${ONE[k[0]]} High`;
    case 1: return `Pair of ${MANY[k[0]]}`;
    case 2: return `Two Pair, ${MANY[k[0]]} and ${MANY[k[1]]}`;
    case 3: return `Three of a Kind, ${MANY[k[0]]}`;
    case 4: return `Straight, ${ONE[k[0]]} High`;
    case 5: return `Flush, ${ONE[k[0]]} High`;
    case 6: return `Full House, ${MANY[k[0]]} full of ${MANY[k[1]]}`;
    case 7: return `Four of a Kind, ${MANY[k[0]]}`;
    default: return k[0] === 14 ? 'Royal Flush' : `Straight Flush, ${ONE[k[0]]} High`;
  }
}

// ---------- equity (Monte Carlo) ----------
function equity(hole, board, nOpp, iters){
  const used = new Set([...hole, ...board]), deck = [];
  for(let c = 0; c < 52; c++) if(!used.has(c)) deck.push(c);
  const need = 2 * nOpp + (5 - board.length); let win = 0;
  for(let it = 0; it < iters; it++){
    for(let k = 0; k < need; k++){ const j = k + Math.floor(Math.random() * (deck.length - k)); const t = deck[k]; deck[k] = deck[j]; deck[j] = t; }
    const b = board.concat(deck.slice(2 * nOpp, need));
    const me = evaluate(hole.concat(b)); let best = 0, ties = 0;
    for(let o = 0; o < nOpp; o++){ const v = evaluate([deck[2*o], deck[2*o+1], ...b]); if(v > best){ best = v; ties = 0; } else if(v === best) ties++; }
    if(me > best) win++; else if(me === best) win += 1 / (ties + 2);
  }
  return win / iters;
}
const pfCache = {};
function preflopStrength(cards){
  let [a, b] = cards; if(rankOf(b) > rankOf(a)) [a, b] = [b, a];
  const key = RANKS[rankOf(a)-2] + RANKS[rankOf(b)-2] + (rankOf(a) === rankOf(b) ? '' : suitOf(a) === suitOf(b) ? 's' : 'o');
  if(pfCache[key] == null) pfCache[key] = equity(cards, [], 1, 900);
  return pfCache[key];
}

// ---------- pots ----------
// entries: {seat, total, folded, val}. dead = antes (main pot only). btn = button seat, for odd chips.
function distribute(entries, dead, btn, seatsN = 9){
  const cont = entries.filter(e => !e.folded);
  const dist = e => ((e.seat - btn + seatsN) % seatsN) || seatsN;
  const awards = new Map(), pots = [];
  const add = (seat, a) => awards.set(seat, (awards.get(seat) || 0) + a);
  const total = entries.reduce((s, e) => s + e.total, 0) + dead;
  if(cont.length === 1){ add(cont[0].seat, total); pots.push({ amt: total, winners: [cont[0].seat], elig: [cont[0].seat] }); return { awards, pots }; }
  const levels = [...new Set(entries.map(e => e.total).filter(t => t > 0))].sort((a, b) => a - b);
  let prev = 0;
  for(const L of levels){
    const amt = entries.reduce((s, e) => s + Math.max(0, Math.min(e.total, L) - prev), 0);
    const elig = cont.filter(e => e.total >= L);
    prev = L;
    if(!amt) continue;
    const last = pots[pots.length - 1];
    if(!elig.length){ if(last) last.amt += amt; else pots.push({ amt, elig: cont, key: '*' }); continue; }
    const key = elig.map(e => e.seat).join(',');
    if(last && last.key === key) last.amt += amt; else pots.push({ amt, elig, key });
  }
  if(pots.length) pots[0].amt += dead; else pots.push({ amt: dead, elig: cont, key: '' });
  for(const p of pots){
    const best = Math.max(...p.elig.map(e => e.val));
    const ws = p.elig.filter(e => e.val === best).sort((a, b) => dist(a) - dist(b));
    const unit = p.amt % 100 === 0 && p.amt / 100 >= ws.length ? 100 : 1;
    const share = Math.floor(p.amt / ws.length / unit) * unit; let rem = p.amt - share * ws.length;
    ws.forEach(w => { const odd = Math.min(rem, unit); add(w.seat, share + odd); rem -= odd; });
    if(rem > 0) add(ws[0].seat, rem);
    p.winners = ws.map(w => w.seat); p.elig = p.elig.map(e => e.seat); delete p.key;
  }
  return { awards, pots };
}

// ---------- structure ----------
// WSOP Main Event structure (2025): big blind ante from level 1
const LEVELS = [[100,200,200],[200,300,300],[200,400,400],[300,500,500],[300,600,600],[400,800,800],[500,1000,1000],[600,1200,1200],[1000,1500,1500],[1000,2000,2000],[1000,2500,2500],[1500,3000,3000],[2000,4000,4000],[3000,5000,5000],[3000,6000,6000],[4000,8000,8000],[5000,10000,10000],[6000,12000,12000],[10000,15000,15000],[10000,20000,20000],[10000,25000,25000],[15000,30000,30000],[20000,40000,40000],[25000,50000,50000],[30000,60000,60000],[40000,80000,80000],[50000,100000,100000],[60000,120000,120000],[100000,150000,150000],[100000,200000,200000],[125000,250000,250000],[150000,300000,300000],[200000,400000,400000],[250000,500000,500000],[300000,600000,600000],[400000,800000,800000],[500000,1000000,1000000],[600000,1200000,1200000],[800000,1600000,1600000],[1000000,2000000,2000000],[1250000,2500000,2500000],[1500000,3000000,3000000],[2000000,4000000,4000000],[2500000,5000000,5000000],[3000000,6000000,6000000],[4000000,8000000,8000000],[5000000,10000000,10000000]];
const levelAt = i => LEVELS[Math.min(i, LEVELS.length - 1)];
// 'each': every player antes about 1/8 of the big blind (online style). Otherwise the big blind antes for the table (WSOP/WPT live).
const niceAnte = bb => { const a = bb / 8, st = a < 50 ? 5 : a < 200 ? 25 : a < 2000 ? 100 : 1000; return Math.max(st, Math.round(a / st) * st); };
const levelFor = (i, mode) => { const [sb, bb, an] = levelAt(i); return mode === 'each' && an ? [sb, bb, niceAnte(bb)] : [sb, bb, an]; };
const PAYOUT = [0.5, 0.3, 0.2];
const STYLES = {
  tight:    { label:'Tight',      open:.585, three:.69, callAdj:.04,  aggr:.6,  bluff:.07, push:0 },
  loose:    { label:'Loose',      open:.53,  three:.72, callAdj:-.06, aggr:.35, bluff:.05, push:-.015 },
  aggro:    { label:'Aggressive', open:.515, three:.64, callAdj:0,    aggr:.9,  bluff:.24, push:-.03 },
  cautious: { label:'Cautious',   open:.61,  three:.73, callAdj:.08,  aggr:.3,  bluff:.02, push:.03 },
};

// ---------- game state ----------
function newGame({ players, stack = 30000, levelMs = 20 * 60000 }){
  const seats = players.map((p, i) => ({ id: i, name: p.name, style: p.style || null, isHero: !!p.isHero, stack, color: p.color || null }));
  while(seats.length < 9) seats.push(null);
  return { seats, entrants: players.length, stack, totalChips: stack * players.length, level: 0, levelMs, levelMsLeft: levelMs,
    handNo: 0, btn: -1, sb: -1, bb: -1, busts: [], over: false, hand: null };
}
const remaining = g => g.seats.filter(Boolean).length;
const liveIdx = g => g.seats.map((p, i) => p && p.stack > 0 ? i : -1).filter(i => i >= 0);
function nextLive(g, i){ for(let k = 1; k <= 9; k++){ const j = (i + k) % 9; const p = g.seats[j]; if(p && p.stack > 0) return j; } return -1; }
function setPositions(g, rng){
  const live = liveIdx(g);
  if(g.btn < 0){
    g.btn = live[Math.floor(rng() * live.length)];
    if(live.length === 2){ g.sb = g.btn; g.bb = nextLive(g, g.btn); }
    else { g.sb = nextLive(g, g.btn); g.bb = nextLive(g, g.sb); }
    return;
  }
  // Dead button rule: the big blind always moves forward to the next live player.
  const prevSB = g.sb, prevBB = g.bb, newBB = nextLive(g, prevBB);
  if(live.length === 2){ g.bb = newBB; g.btn = g.sb = live.find(i => i !== newBB); }
  else { g.bb = newBB; g.sb = prevBB; g.btn = prevSB; }
}
const canAct = p => !p.folded && !p.allIn;
const live = h => h.players.filter(p => !p.folded);
function put(p, amt){ amt = Math.max(0, Math.min(amt, p.stack)); p.stack -= amt; p.bet += amt; p.total += amt; if(p.stack === 0) p.allIn = true; return amt; }
const potTotal = h => h.players.reduce((s, p) => s + p.total, 0) + h.dead;
function nextIn(h, seat){ for(let k = 1; k <= 9; k++){ const s = (seat + k) % 9; const p = h.players.find(q => q.seat === s && !q.folded); if(p) return p; } return null; }
function shuffled(rng){ const d = [...Array(52).keys()]; for(let i = 51; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }

function legal(h, p){
  const owe = h.currentBet - p.bet, toCall = Math.max(0, Math.min(owe, p.stack));
  const others = h.players.filter(q => q !== p && canAct(q));
  const reopened = !p.acted || (h.currentBet - p.facedBet >= h.minRaise);
  const canRaise = p.stack > owe && others.length > 0 && reopened;
  const maxTo = p.bet + p.stack, minTo = Math.min(h.currentBet + h.minRaise, maxTo);
  return { toCall, canCheck: owe <= 0, canRaise, minTo, maxTo, isBet: h.currentBet === 0 };
}
function normalize(a, L, h){
  if(a && a.t === 'fold' && a.dead) return { t:'fold' }; // dead hand (player away): TDA 32
  if(!a || a.t === 'fold') return L.canCheck ? { t:'check' } : { t:'fold' };
  if(a.t === 'check') return L.canCheck ? a : { t:'fold' };
  if(a.t === 'call') return L.canCheck ? { t:'check' } : a;
  if(!L.canRaise) return L.canCheck ? { t:'check' } : { t:'call' };
  let to = Math.round(a.to); to = Math.max(L.minTo, Math.min(L.maxTo, to));
  if(to <= h.currentBet) return L.canCheck ? { t:'check' } : { t:'call' };
  return { t:'raise', to };
}
function applyAction(h, p, a){
  if(a.t === 'fold'){ p.folded = true; p.act = 'Fold'; }
  else if(a.t === 'check'){ p.act = 'Check'; }
  else if(a.t === 'call'){ put(p, h.currentBet - p.bet); p.act = p.allIn ? 'All-in' : 'Call'; }
  else {
    const prev = h.currentBet; put(p, a.to - p.bet);
    if(a.to - prev >= h.minRaise) h.minRaise = a.to - prev; // full raise sets the new minimum; a short all-in does not
    h.currentBet = a.to; h.raiseCount++;
    p.act = p.allIn ? 'All-in' : prev === 0 ? 'Bet' : 'Raise';
    h.lastAggr = p.seat;
  }
  p.acted = true; p.facedBet = h.currentBet; p.lastAmt = p.bet;
}

async function bettingRound(g, h, io, first){
  if(!first) return;
  const order = []; for(let k = 0; k < 9; k++){ const s = (first.seat + k) % 9; const p = h.players.find(q => q.seat === s && !q.folded); if(p) order.push(p); }
  const needs = new Set(order.filter(canAct));
  let i = 0, guard = 0;
  while(needs.size){
    if(++guard > 1000) throw new Error('betting loop');
    if(live(h).length <= 1) break;
    const p = order[i++ % order.length];
    if(!needs.has(p)) continue;
    if(!canAct(p)){ needs.delete(p); continue; }
    if(!order.some(q => q !== p && canAct(q)) && p.bet >= h.currentBet){ needs.delete(p); continue; }
    const L = legal(h, p);
    h.acting = p.seat; await io.event('turn', { p, L });
    let a;
    if(p.isHero && !g.heroAuto) a = await io.heroAction(p, L);
    else { await io.think(p); a = botDecide(g, h, p, L); }
    if(g.aborted) return;
    a = normalize(a, L, h);
    applyAction(h, p, a);
    needs.delete(p);
    order.forEach(q => { if(q !== p && canAct(q) && q.bet < h.currentBet) needs.add(q); });
    h.acting = -1; await io.event('action', { p, a });
  }
}

async function playHand(g, io){
  const rng = io.rng || Math.random;
  let leveled = false;
  while(g.levelMsLeft <= 0){ g.level++; g.levelMsLeft += g.levelMs; leveled = true; }
  if(leveled) await io.event('level', {});
  const [SB, BB, ANTE] = levelFor(g.level, g.anteMode);
  setPositions(g, rng);
  const players = [];
  for(let k = 1; k <= 9; k++){ const s = (g.btn + k) % 9, p = g.seats[s]; if(p && p.stack > 0) players.push(p); }
  players.forEach(p => Object.assign(p, { seat: g.seats.indexOf(p), cards: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, facedBet: 0, act: '', start: p.stack, shown: false, best: null, val: 0, won: 0, ante: 0 }));
  const deck = (io.deck && await io.deck(g.handNo + 1)) || shuffled(rng);
  const h = g.hand = { no: g.handNo + 1, players, board: [], deck, currentBet: 0, minRaise: BB, bbAmt: BB, sbAmt: SB, anteAmt: ANTE, dead: 0, street: 0, raiseCount: 0, acting: -1, result: null };
  if(ANTE && g.anteMode === 'each') for(const p of players){ const a = Math.min(ANTE, p.stack); p.stack -= a; p.ante = a; p.total += a; if(p.stack === 0) p.allIn = true; } // antes count toward side pots, not toward the bet to call
  const sbP = g.sb !== g.bb ? g.seats[g.sb] : null, bbP = g.seats[g.bb];
  if(sbP && sbP.stack > 0){ put(sbP, SB); sbP.act = 'SB'; }
  put(bbP, BB); bbP.act = 'BB';
  if(ANTE && g.anteMode !== 'each'){ const a = Math.min(ANTE, bbP.stack); bbP.stack -= a; bbP.ante = a; h.dead += a; if(bbP.stack === 0) bbP.allIn = true; } // blind takes priority over the ante
  h.currentBet = BB; h.minRaise = BB;
  for(let r = 0; r < 2; r++) for(const p of players) p.cards.push(h.deck.pop());
  await io.event('deal', {});
  await bettingRound(g, h, io, nextIn(h, g.bb));
  for(let st = 1; st <= 3 && !g.aborted; st++){
    if(live(h).length <= 1) break;
    await io.event('collect', {});
    players.forEach(p => { p.bet = 0; p.acted = false; p.facedBet = 0; if(!p.folded && !p.allIn) p.act = ''; });
    h.currentBet = 0; h.minRaise = BB; h.raiseCount = 0; h.lastAggr = -1;
    h.deck.pop(); // burn
    const n = st === 1 ? 3 : 1; for(let i = 0; i < n; i++) h.board.push(h.deck.pop());
    h.street = st;
    if(live(h).filter(canAct).length <= 1){ live(h).forEach(p => p.shown = true); h.tabled = true; } // all-in: hands are tabled
    await io.event('board', {});
    if(live(h).filter(canAct).length >= 2) await bettingRound(g, h, io, nextIn(h, g.btn));
  }
  if(g.aborted) return;
  await io.event('collect', {});
  players.forEach(p => p.bet = 0);
  const cont = live(h);
  if(cont.length > 1){
    cont.forEach(p => { const b = bestFive(p.cards.concat(h.board)); p.val = b.val; p.best = b.cards; });
    if(h.tabled) cont.forEach(p => p.shown = true);
  }
  const { awards, pots } = distribute(players.map(p => ({ seat: p.seat, total: p.total, folded: p.folded, val: p.val })), h.dead, g.btn);
  if(cont.length > 1 && !h.tabled){
    // TDA 18 / WSOP 70: the last river aggressor shows first (else the first live seat left of the button).
    // Winners of a contested pot always show; other losing hands are mucked automatically.
    const first = h.lastAggr >= 0 && cont.some(p => p.seat === h.lastAggr) ? h.lastAggr : (nextIn(h, g.btn) || cont[0]).seat;
    const winners = new Set(pots.filter(q => q.elig.length > 1).flatMap(q => q.winners));
    cont.forEach(p => p.shown = p.seat === first || winners.has(p.seat));
  }
  awards.forEach((amt, seat) => { const p = g.seats[seat]; p.stack += amt; p.won = amt; });
  h.result = { pots, awards, showdown: cont.length > 1 };
  await io.event('showdown', {});
  return afterHand(g);
}

function afterHand(g){
  const h = g.hand, rem = remaining(g);
  const eff = p => p.start - (p.ante || 0); // TDA 22: stack at the start of the hand, after the big blind ante
  const busted = g.seats.filter(p => p && p.stack <= 0).sort((a, b) => eff(a) - eff(b) || a.seat - b.seat);
  const out = busted.map((p, k) => { const place = rem - k; const b = { name: p.name, uid: p.uid, start: p.start, eff: eff(p), isHero: p.isHero, place, hand: h.no, style: p.style }; g.busts.push(b); g.seats[p.seat] = null; return b; });
  g.handNo++;
  if(remaining(g) === 1 && !g.multi){ const w = g.seats.find(Boolean); g.busts.push({ name: w.name, isHero: w.isHero, place: 1, hand: h.no, style: w.style }); g.over = true; }
  return out;
}

// ---------- AI ----------
const r100 = x => Math.max(100, Math.round(x / 100) * 100);
function botDecide(g, h, p, L){
  const st = STYLES[p.style] || STYLES.tight, bb = h.bbAmt, r = Math.random();
  const lv = live(h), nOpp = lv.length - 1, pot = potTotal(h);
  const rem = remaining(g), avg = g.totalChips / rem;
  const stacks = g.seats.filter(Boolean).map(q => q.start ?? q.stack);
  const bubble = rem === PAYOUT.length + 1;
  const bully = p.start > 1.5 * avg && p.start >= Math.max(...stacks);
  const shortest = p.start <= Math.min(...stacks);
  let tight = 0;
  if(bubble && !bully) tight += shortest ? 0 : .045;
  if(bully) tight -= bubble ? .07 : .03;
  const maxOther = Math.max(0, ...lv.filter(q => q !== p).map(q => q.stack + q.bet));
  const effBB = Math.min(p.stack + p.bet, maxOther) / bb;
  const odds = L.toCall > 0 ? L.toCall / (pot + L.toCall) : 0;
  const raise = to => { to = r100(to); if(to > .55 * L.maxTo) to = L.maxTo; return { t:'raise', to }; };
  const passive = () => L.canCheck ? { t:'check' } : { t:'fold' };

  if(h.street === 0){
    const s = preflopStrength(p.cards);
    const order = []; let q = nextIn(h, g.bb);
    for(let k = 0; k < 9 && q && !order.includes(q); k++){ order.push(q); q = nextIn(h, q.seat); }
    const behind = order.slice(order.indexOf(p) + 1).filter(canAct).length;
    const unopened = h.raiseCount === 0;
    if(effBB <= 12){
      if(unopened){
        const thr = .48 + effBB * .01 + st.push + tight + (behind - 2) * .004;
        return s >= thr ? { t:'raise', to: L.maxTo } : passive();
      }
      const eqR = .5 + (s - .52) * 1.45; // equity against a wide shoving/raising range
      if(s >= st.three - .04 + tight) return { t:'raise', to: L.maxTo };
      return eqR >= odds + .03 + st.callAdj / 2 + tight * 1.5 ? { t:'call' } : passive();
    }
    if(unopened){
      const thr = st.open + (behind - 3) * .005 + tight;
      if(s >= thr || (behind <= 2 && r < st.bluff * .5)) return raise(bb * (2.2 + r * .6) + (h.currentBet - bb));
      if(L.canCheck) return { t:'check' };
      if(L.toCall <= bb / 2 && s >= thr - .06) return { t:'call' };
      return { t:'fold' };
    }
    const three = h.raiseCount >= 2;
    const eqR = three ? .5 + (s - .66) * 1.8 : .5 + (s - .6) * 1.6;
    const committed = L.toCall > .4 * p.stack;
    if(L.canRaise && s >= st.three + tight + (three ? .06 : 0)) return raise(h.currentBet * 3);
    if(L.canRaise && !three && !committed && r < st.bluff * .18) return raise(h.currentBet * 3);
    return eqR >= odds + .05 + st.callAdj + tight + (committed ? .03 : 0) ? { t:'call' } : passive();
  }

  const eq = equity(p.cards, h.board, Math.max(1, Math.min(nOpp, 4)), 220);
  if(L.canCheck){
    const value = .64 - st.aggr * .06 + (nOpp - 1) * .05;
    if(eq >= value && L.canRaise) return raise(Math.max(bb, pot * (.5 + .3 * r)));
    if(L.canRaise && r < st.bluff * (nOpp === 1 ? 1 : .35) * (h.street === 3 ? .7 : 1)) return raise(Math.max(bb, pot * .5));
    return { t:'check' };
  }
  const ratio = L.toCall / Math.max(1, pot - L.toCall);
  const eqA = eq - .1 * Math.min(1.5, ratio) - (h.raiseCount > 1 ? .08 : 0);
  if(L.canRaise && eqA >= .8 - st.aggr * .05) return raise(h.currentBet * 2.5 + pot * .2);
  const need = odds + st.callAdj * .6 + (bubble && !bully ? .05 : 0);
  if(eqA >= need) return { t:'call' };
  if(L.canRaise && h.street < 3 && r < st.bluff * .1) return raise(h.currentBet * 2.6);
  return { t:'fold' };
}

const api = { RANKS, SUITS, rankOf, suitOf, cardStr, parse, evaluate, bestFive, describe, category, CAT, equity, preflopStrength, distribute,
  LEVELS, levelAt, levelFor, PAYOUT, STYLES, newGame, remaining, setPositions, nextLive, legal, normalize, applyAction, playHand, afterHand, potTotal, botDecide, canAct };
if(typeof module !== 'undefined') module.exports = api;
return api;
})();
