// Checks a finished tournament's shuffle in the player's own browser. Mirrors server/fair.js exactly.
(function(){
  const enc = new TextEncoder();
  const sha = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');

  async function deckFrom(key){
    let ctr = 0, buf = null, off = 32;
    const next = async () => {
      if(off + 4 > 32){ buf = await sha(key + '|' + ctr++); off = 0; }
      const v = ((buf[off] << 24) >>> 0) + (buf[off + 1] << 16) + (buf[off + 2] << 8) + buf[off + 3]; off += 4; return v;
    };
    const d = [...Array(52).keys()];
    for(let i = 51; i > 0; i--){
      const n = i + 1, lim = Math.floor(0x100000000 / n) * n;
      let v; do v = await next(); while(v >= lim);
      const j = v % n; [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  // Deal the deck the way the table does: two passes of hole cards from the small blind round, then burn-and-turn.
  function dealt(deck, nPlayers, boardLen){
    const d = deck.slice(), hole = Array.from({ length: nPlayers }, () => []);
    for(let r = 0; r < 2; r++) for(let i = 0; i < nPlayers; i++) hole[i].push(d.pop());
    const board = [];
    if(boardLen >= 3){ d.pop(); board.push(d.pop(), d.pop(), d.pop()); }
    if(boardLen >= 4){ d.pop(); board.push(d.pop()); }
    if(boardLen >= 5){ d.pop(); board.push(d.pop()); }
    return { hole, board };
  }

  async function verify(rep, onProgress){
    const out = { sealOk: false, hands: [], ok: 0, bad: 0, local: 0, void: 0 };
    if(!rep || !rep.seed || !rep.seal) return out;
    out.sealOk = hex(await sha(rep.seed)) === rep.seal;
    for(let k = 0; k < rep.hands.length; k++){
      const h = rep.hands[k];
      const deck = await deckFrom(`${rep.seed}|${h.beacon}|${h.tid}|${h.hand}`);
      const exp = dealt(deck, h.players.length, h.board.length);
      const match = h.players.every((p, i) => p.cards[0] === exp.hole[i][0] && p.cards[1] === exp.hole[i][1])
        && h.board.every((c, i) => c === exp.board[i]);
      out.hands.push({ ...h, match });
      if(match) out.ok++; else out.bad++;
      if(!h.round) out.local++;
      if(h.void) out.void++; // a deal cut off mid-hand (void: 'interrupted'): verified the same way, replayed under its number
      if(onProgress && k % 10 === 9) onProgress(k + 1, rep.hands.length);
    }
    return out;
  }

  // Ask drand directly whether a hand's beacon value is the real public value for that round.
  async function checkBeacon(rep, h){
    if(!h.round) return null;
    try{ const r = await fetch(rep.beaconUrl + h.round); const j = await r.json(); return j.randomness === h.beacon; }catch(e){ return null; }
  }

  window.FAIR = { verify, checkBeacon, deckFrom };
})();
