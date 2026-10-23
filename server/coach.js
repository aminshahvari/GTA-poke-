// Hand history + coaching notes.
// The table loop feeds events in; at the end of each hand every player gets a private copy of the hand
// (their own cards, plus only the cards that were shown) with notes on their decisions.
const E = require('./engine');

const KEEP = 80; // hands kept per player

// ---------- hand strength (Chen formula: a simple, well-known preflop score) ----------
function chen(cards){
  let [a, b] = cards.map(E.rankOf);
  if(b > a) [a, b] = [b, a];
  const hi = r => r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2;
  let s = hi(a);
  if(a === b) return Math.max(5, s * 2);
  if(E.suitOf(cards[0]) === E.suitOf(cards[1])) s += 2;
  const gap = a - b - 1;
  s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if(gap <= 1 && a < 12) s += 1;
  return Math.ceil(s);
}
function handName(cards){
  let [a, b] = cards; if(E.rankOf(b) > E.rankOf(a)) [a, b] = [b, a];
  const r = c => E.RANKS[E.rankOf(c) - 2];
  return r(a) + r(b) + (E.rankOf(a) === E.rankOf(b) ? '' : E.suitOf(a) === E.suitOf(b) ? 's' : 'o');
}

// ---------- positions ----------
const LABELS = ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN'];
function positions(g, h){
  const out = {};
  const ps = h.players; // ordered starting left of the button
  if(ps.length === 2){ out[g.sb] = 'SB'; out[g.bb] = 'BB'; return out; }
  const rest = ps.filter(p => p.seat !== g.sb && p.seat !== g.bb);
  const lab = LABELS.slice(LABELS.length - rest.length);
  // with a dead button the last player before the blinds is still the "button" position
  rest.forEach((p, i) => out[p.seat] = lab[i]);
  if(g.sb !== g.bb && g.seats[g.sb]) out[g.sb] = 'SB';
  out[g.bb] = 'BB';
  return out;
}
const group = pos => ['UTG', 'UTG+1', 'UTG+2'].includes(pos) ? 'early' : ['LJ', 'HJ'].includes(pos) ? 'middle' : ['CO', 'BTN'].includes(pos) ? 'late' : 'blinds';
const OPEN_MIN = { early: 8, middle: 7, late: 6, SB: 6 };   // first-in raise, deep stacks
const SHOVE_MIN = { early: 9, middle: 8, late: 7, SB: 6 };  // first-in all-in, 10 BB or less
const minFor = (tbl, pos) => tbl[pos === 'SB' ? 'SB' : group(pos)] ?? 99;

// ---------- recorder ----------
function recorder(ctx){
  // ctx: { tourneyInfo() -> {left, paid}, save(uid, hand) }
  let rec = null, pending = null;
  return function event(type, g, data){
    const h = g.hand;
    if(type === 'deal'){
      const pos = positions(g, h), info = ctx.tourneyInfo();
      rec = { no: h.no, ts: Date.now(), sb: h.sbAmt, bb: h.bbAmt, ante: h.anteAmt, left: info.left, paid: info.paid, name: info.name,
        players: h.players.map(p => ({ uid: p.uid, name: p.name, seat: p.seat, pos: pos[p.seat] || '', start: p.start, cards: p.cards.slice() })),
        actions: [], board: [] };
      return;
    }
    if(!rec || !h || h.no !== rec.no) return;
    if(type === 'turn'){
      const { p, L } = data;
      pending = { seat: p.seat, st: h.street, pot: E.potTotal(h), toCall: L.toCall, stack: p.stack, bet: p.bet, cur: h.currentBet, raises: h.raiseCount,
        board: h.board.slice(), live: h.players.filter(q => !q.folded).length };
    } else if(type === 'action'){
      const { p, a } = data;
      const base = pending && pending.seat === p.seat ? pending : { seat: p.seat, st: h.street, pot: 0, toCall: 0, stack: p.stack, bet: 0, cur: 0, raises: 0, board: h.board.slice(), live: 0 };
      // (auto: the table acted for an absent player, a dead hand or a timed-out turn; the coach says nothing about it)
      rec.actions.push({ ...base, t: a.t, to: p.bet, allIn: !!p.allIn, ...(p.away ? { auto: true } : {}) });
      pending = null;
    } else if(type === 'showdown'){
      rec.board = h.board.slice();
      const res = h.result;
      rec.showdown = !!res.showdown;
      rec.players.forEach(rp => {
        const p = h.players.find(q => q.seat === rp.seat);
        rp.end = p.stack; rp.won = p.won || 0; rp.folded = p.folded; rp.shown = !!(p.shown && !p.folded);
        rp.hand = rp.shown && p.val ? E.describe(p.val) : '';
      });
      rec.pots = res.pots.map(q => ({ amt: q.amt, winners: q.winners.slice(), contested: (q.elig || []).length > 1 }));
      for(const rp of rec.players) if(rp.uid) ctx.save(rp.uid, personal(rec, rp.uid));
      rec = null;
    }
  };
}

// The copy a player keeps: other players' cards only if they were shown.
function personal(rec, uid){
  const me = rec.players.find(p => p.uid === uid);
  const players = rec.players.map(p => ({ ...p, cards: p.uid === uid || p.shown ? p.cards.map(E.cardStr) : null }));
  const notes = analyze(rec, me);
  return { id: rec.ts + '-' + rec.no + '-' + me.seat, ts: rec.ts, tourney: rec.name, no: rec.no, sb: rec.sb, bb: rec.bb, ante: rec.ante, left: rec.left, paid: rec.paid,
    seat: me.seat, pos: me.pos, cards: me.cards.map(E.cardStr), start: me.start, end: me.end, net: me.end - me.start, board: rec.board.map(E.cardStr),
    showdown: rec.showdown, players: players.map(({ uid: _u, ...p }) => ({ ...p, me: p.seat === me.seat })),
    actions: rec.actions.map(a => ({ seat: a.seat, st: a.st, t: a.t, to: a.to, allIn: a.allIn, toCall: a.toCall, pot: a.pot })), pots: rec.pots, notes };
}

// ---------- equity when all the money went in (exact on flop/turn, sampled preflop) ----------
function allInEquity(myCards, oppCards, board){
  const used = new Set([...myCards, ...oppCards, ...board]), deck = [];
  for(let c = 0; c < 52; c++) if(!used.has(c)) deck.push(c);
  const need = 5 - board.length;
  let win = 0, n = 0;
  const score = b => { const m = E.evaluate(myCards.concat(b)), o = E.evaluate(oppCards.concat(b)); return m > o ? 1 : m === o ? .5 : 0; };
  if(need === 0) return score(board);
  if(need === 1){ for(const c of deck){ win += score(board.concat(c)); n++; } return win / n; }
  if(need === 2){ for(let i = 0; i < deck.length; i++) for(let j = i + 1; j < deck.length; j++){ win += score(board.concat(deck[i], deck[j])); n++; } return win / n; }
  for(let it = 0; it < 4000; it++){
    for(let k = 0; k < need; k++){ const j = k + Math.floor(Math.random() * (deck.length - k)); [deck[k], deck[j]] = [deck[j], deck[k]]; }
    win += score(board.concat(deck.slice(0, need))); n++;
  }
  return win / n;
}

// ---------- the coach ----------
const pct = x => Math.round(x * 100) + '%';
const STREET = ['Preflop', 'Flop', 'Turn', 'River'];
function analyze(rec, me){
  const notes = [], bb = rec.bb, hn = handName(me.cards), score = chen(me.cards);
  const mine = rec.actions.filter(a => a.seat === me.seat && !a.auto);
  const startBB = me.start / bb;
  const nearBubble = rec.paid > 0 && rec.left > rec.paid && rec.left <= rec.paid + Math.max(2, Math.ceil(rec.paid * 0.15));
  const add = (st, kind, title, text) => notes.push({ st, kind, title, text });
  const n = rec.players.length, shortHanded = n <= 3, adj = n <= 5 ? 1 : 0; // fewer players: wider ranges

  for(const a of mine){
    const stackBB = (a.stack + a.bet) / bb;
    if(a.st === 0){
      const firstIn = a.raises === 0 && a.cur === bb;
      const limpers = rec.actions.some(x => x.st === 0 && x.seat !== me.seat && x.t === 'call' && x.raises === 0 && rec.actions.indexOf(x) < rec.actions.indexOf(a));
      const unopened = firstIn && !limpers && me.pos !== 'BB';
      const shove = a.allIn || (a.t === 'raise' && a.to >= (a.stack + a.bet) * 0.9);
      // limping
      if(a.raises === 0 && a.t === 'call' && me.pos !== 'BB' && !shortHanded){
        add(0, 'mistake', 'Limped in', me.pos === 'SB'
          ? `You completed from the small blind with ${hn}. In tournaments it's usually better to raise or fold, so you either win the blinds right away or save your chips.`
          : `You just called the big blind with ${hn}. Limping lets the big blind see a free flop and gives you no way to win the pot now. Raise if the hand is good enough to play from ${me.pos}, otherwise fold.`);
      }
      // opening too loose
      if(unopened && (a.t === 'raise') && !shove && stackBB > 12 && !shortHanded && score < minFor(OPEN_MIN, me.pos) - adj){
        add(0, 'mistake', 'Opened a weak hand', `${hn} is too weak to open from ${me.pos} (${group(me.pos) === 'early' ? 'early position, with most of the table still to act' : 'this position'}). Patience: fold it and wait for a stronger hand or a later position.`);
      }
      // short stack: shove or fold
      if(unopened && a.t === 'raise' && !shove && stackBB <= 12){
        add(0, 'mistake', 'Small raise with a short stack', `With about ${Math.round(stackBB)} big blinds, a normal raise commits you anyway. Go all-in or fold, so opponents can't see a flop cheaply and you get full fold equity.`);
      }
      if(unopened && shove && stackBB <= 12 && score >= minFor(SHOVE_MIN, me.pos) - adj){
        add(0, 'good', 'Good all-in', `All-in with ${hn} and about ${Math.round(stackBB)} BB from ${me.pos} is a solid push.`);
      }
      if(unopened && shove && stackBB > 25 && score < 10){
        add(0, 'tip', 'Big over-shove', `You moved all-in for about ${Math.round(stackBB)} BB with ${hn}. With a deep stack a normal raise (2 to 2.5 BB) risks far less and gets called only by better hands less often.`);
      }
      // missed shove
      if(firstIn && !limpers && a.t === 'fold' && stackBB <= 10 && ['CO', 'BTN', 'SB'].includes(me.pos) && score >= minFor(SHOVE_MIN, me.pos) - adj + 1){
        add(0, 'tip', 'Missed an all-in', `With only about ${Math.round(stackBB)} BB and ${hn} on the ${me.pos}, pushing all-in is usually right. Every orbit the blinds eat about 1.5 BB, so waiting too long hurts.`);
      }
      // calling a raise
      if(a.raises >= 1 && (a.t === 'call' || (a.allIn && a.t !== 'fold'))){
        const share = a.toCall / Math.max(1, a.stack + a.bet);
        if(share >= 0.25 && score < 9){
          add(0, 'mistake', nearBubble ? 'Risky call near the bubble' : 'Called off with a weak hand',
            `You put ${pct(share)} of your stack in with ${hn}. Calling big raises needs a strong hand (like 99+, AQ+)${nearBubble ? '. This close to the money, survival is worth extra: fold medium hands and let the short stacks bust first' : ''}.`);
        } else if(me.pos !== 'BB' && score < 7 && share < 0.25){
          add(0, 'tip', 'Called a raise with a weak hand', `Calling raises with hands like ${hn} costs chips over time: you'll often miss, or hit and still be behind. Fold, or 3-bet your strong hands.`);
        }
      }
    } else {
      // postflop: what did I have?
      const cards = me.cards.concat(a.board);
      const cat = cards.length >= 5 ? E.category(E.evaluate(cards)) : 0;
      const boardRanks = a.board.map(E.rankOf), holeRanks = me.cards.map(E.rankOf);
      const usesHole = holeRanks[0] === holeRanks[1] || holeRanks.some(r => boardRanks.includes(r));
      const price = a.toCall / Math.max(1, a.pot + a.toCall);
      if(a.t === 'call' && a.st === 3 && cat === 0 && a.toCall >= a.pot * 0.33){
        add(3, 'mistake', 'Paid off with nothing', `On the river you called ${Math.round(a.toCall / bb)} BB with only high card. A river call needs to beat something: with no pair, you only win if your opponent is bluffing with an even worse hand.`);
      }
      if(a.t === 'fold' && price <= 0.2 && cat >= 1 && usesHole){
        add(a.st, 'mistake', 'Folded for a small price', `You folded a ${E.CAT[cat].toLowerCase()} on the ${STREET[a.st].toLowerCase()} when you only had to call ${Math.round(a.toCall / bb * 10) / 10} BB into a ${Math.round(a.pot / bb)} BB pot. You needed to win just ${pct(price)} of the time.`);
      }
      if(a.t === 'raise' && a.allIn && a.st <= 2 && cat === 0 && a.live >= 3){
        add(a.st, 'tip', 'All-in bluff into a crowd', `Bluffing all-in into ${a.live - 1} opponents rarely works: someone usually has a piece of it.`);
      }
    }
  }

  // all-in and called: was it a good decision or just luck?
  const opp = rec.players.filter(p => p.seat !== me.seat && p.shown && !p.folded);
  const allInAct = rec.actions.find(a => a.allIn);
  if(rec.showdown && opp.length === 1 && !me.folded && allInAct){
    const st = allInAct.st, board = rec.board.slice(0, st === 0 ? 0 : st + 2);
    const eq = allInEquity(me.cards, opp[0].cards, board);
    const net = me.end - me.start;
    if(eq >= 0.6 && net < 0) add(st, 'luck', 'Bad beat', `When the chips went in you were a ${pct(eq)} favorite against ${opp[0].name}. You played it right and lost to the cards. That's poker; keep making that play.`);
    else if(eq <= 0.4 && net > 0) add(st, 'luck', 'Got lucky', `When the chips went in you had only ${pct(eq)} equity against ${opp[0].name}, and you won anyway. Don't count on that next time.`);
    else add(st, 'info', 'All-in equity', `When the chips went in you had ${pct(eq)} equity against ${opp[0].name}.`);
  }
  return notes;
}

// ---------- mindset: tilt, patience and staying calm ----------
// Looks at a finished hand together with the player's previous hands in the same tournament (newest first).
const voluntary = h => h.actions.some(a => a.seat === h.seat && a.st === 0 && (a.t === 'raise' || (a.t === 'call' && !(h.pos === 'BB' && a.toCall === 0))));
const lostBig = h => h.net <= -20 * h.bb || h.notes.some(n => n.title === 'Bad beat');
const hasMistake = h => h.notes.some(n => n.kind === 'mistake');
function mind(h, prev){
  const notes = [], add = (kind, title, text) => notes.push({ st: 0, kind, title, text });
  const loss = prev.slice(0, 2).find(lostBig);
  if(loss && hasMistake(h)){
    const what = h.notes.find(n => n.kind === 'mistake').title.toLowerCase();
    add('mind', 'Tilt check', `${prev[0] === loss ? 'Last hand' : 'Two hands ago'} you lost a big pot, and right after that: ${what}. That's how tilt starts: a loss pushes you into a play you'd normally skip. Pros let the last hand go and judge every hand on its own.`);
  } else if(prev.length >= 3 && lostBig(prev[2]) && !hasMistake(prev[1]) && !hasMistake(prev[0]) && !hasMistake(h)){
    add('good', 'Stayed calm', 'Three hands ago you lost a big pot, and you kept making good decisions since. Not chasing your losses is the hardest skill in poker. Well done.');
  } else if(lostBig(h) && !hasMistake(h) && !h.notes.some(n => n.title === 'Bad beat')){
    add('mind', 'Reset', `That was a big pot to lose. The next hand is a fresh start: don't try to win the chips back right away. Wait for a good hand and a good spot.`);
  }
  return notes;
}
// Was this a weak hand that patience says to fold? (not the big blind, which already paid)
const weakHand = h => h.pos !== 'BB' && !!h.cards && h.cards.length === 2 && chen(h.cards.map(E.parse)) <= 5;

// What a player did well and what to work on, over one tournament.
const GOALS = {
  'Limped in': 'Never just call the big blind. Raise or fold.',
  'Opened a weak hand': 'Be patient early: fold weak hands from early position and wait.',
  'Called off with a weak hand': 'Only call an all-in with a hand that is ahead of what your opponent shoves.',
  'Risky call near the bubble': 'Near the money, fold medium hands to big bets and let short stacks bust first.',
  'Called a raise with a weak hand': 'Against a raise, fold weak hands or re-raise strong ones. Avoid calling.',
  'Small raise with a short stack': 'With 12 big blinds or less, go all-in or fold.',
  'Paid off with nothing': 'On the river, only call if you beat a bluff.',
  'Folded for a small price': 'When the price is small and you have a pair or better, call.',
  'Tilt check': 'After losing a big pot, take a breath and play the next hands like it never happened.'
};
function reportCard(hands){
  const n = hands.length;
  if(!n) return null;
  const clean = hands.filter(h => !hasMistake(h)).length, weak = hands.filter(weakHand), weakFolds = weak.filter(h => !voluntary(h)).length;
  const vp = hands.filter(voluntary).length, pfr = hands.filter(h => h.actions.some(a => a.seat === h.seat && a.st === 0 && a.t === 'raise')).length;
  const tilts = hands.filter(h => h.notes.some(x => x.title === 'Tilt check')).length, calm = hands.filter(h => h.notes.some(x => x.title === 'Stayed calm')).length;
  const leaks = {}; hands.forEach(h => h.notes.forEach(x => { if(x.kind === 'mistake' || x.title === 'Tilt check') leaks[x.title] = (leaks[x.title] || 0) + 1; }));
  const top = Object.entries(leaks).sort((a, b) => b[1] - a[1])[0];
  const cleanP = Math.round(clean / n * 100), patience = weak.length ? Math.round(weakFolds / weak.length * 100) : null;
  const score = Math.round(cleanP * .6 + (patience ?? cleanP) * .3 + (tilts ? 0 : 10) - tilts * 5);
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 68 ? 'C' : score >= 55 ? 'D' : 'E';
  const good = [];
  if(cleanP >= 85) good.push('Very few mistakes: most of your decisions were right.');
  if(patience != null && patience >= 85 && weak.length >= 4) good.push(`Patient: you folded ${weakFolds} of ${weak.length} weak hands.`);
  if(vp >= 4 && pfr / vp >= .6) good.push('Aggressive in a good way: when you played a hand, you usually raised.');
  if(calm) good.push(`You stayed calm after a big loss ${calm === 1 ? 'once' : calm + ' times'}.`);
  if(!tilts && hands.some(lostBig)) good.push('No tilt: big losses did not change how you played.');
  return { hands: n, clean: cleanP, patience, weak: weak.length, weakFolds, vpip: Math.round(vp / n * 100), pfr: Math.round(pfr / n * 100), tilts, calm, score: Math.max(0, Math.min(100, score)), grade,
    good: good.slice(0, 3), leak: top ? { title: top[0], count: top[1] } : null, goal: top ? GOALS[top[0]] || 'Review your hands marked with a mistake under Learn.' : 'Keep doing exactly this. Next step: study the Lessons under Learn.' };
}

module.exports = { KEEP, chen, handName, positions, recorder, analyze, allInEquity, personal, mind, reportCard, weakHand, voluntary, hasMistake };
