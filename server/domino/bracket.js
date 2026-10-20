// Tournament structure for domino: single-elimination brackets and round-robin pods. Pure functions over plain data.
// An entrant is a team: { id, members: [uid] } (one member heads-up, two in a partnership), in seed order.
// A match here is only its place in the structure ({ id, round, slot, teams: [teamId|null, teamId|null], next }); the
// scoring lives in server/domino/match.js under the same id.
const fail = (status, msg) => Object.assign(new Error(msg), { status });

// ---------- single elimination ----------
// Bracket size is the next power of two; the top seeds get the byes. Round 1 pairs seed 1 with the lowest seed,
// in the standard order (1v8, 4v5, 3v6, 2v7 for eight), so the top two seeds can only meet in the final.
function seedOrder(size){
  let order = [1];
  while(order.length < size){ const n = order.length * 2 + 1; order = order.flatMap(s => [s, n - s]); }
  return order;
}
function elimination(teams, prefix = 'e'){
  if(teams.length < 2) throw fail(400, 'At least 2 teams are needed.');
  let size = 2; while(size < teams.length) size *= 2;
  const rounds = Math.log2(size), order = seedOrder(size), matches = [];
  for(let r = 1; r <= rounds; r++){
    const count = size >> r;
    for(let s = 0; s < count; s++) matches.push({ id: `${prefix}${r}-${s + 1}`, round: r, slot: s, teams: [null, null],
      next: r < rounds ? { id: `${prefix}${r + 1}-${(s >> 1) + 1}`, pos: s & 1 } : null, bye: false });
  }
  matches.filter(m => m.round === 1).forEach((m, s) => {
    const a = teams[order[s * 2] - 1], b = teams[order[s * 2 + 1] - 1];
    m.teams = [a ? a.id : null, b ? b.id : null];
    if(!a || !b) m.bye = true;
  });
  return { rounds, matches };
}
// Put a match winner into the next match. Idempotent: the same winner twice changes nothing. A different winner (a
// director's override) may replace the earlier one only while the next match has not started.
// started(id) tells whether a match has started; returns the updated next match, or null if this was the final.
function advance(matches, id, winnerTeam, started){
  const m = matches.find(x => x.id === id); if(!m) throw fail(404, 'No such match.');
  if(!m.teams.includes(winnerTeam)) throw fail(400, 'That team is not in this match.');
  if(!m.next) return null;
  const n = matches.find(x => x.id === m.next.id), cur = n.teams[m.next.pos];
  if(cur === winnerTeam) return n;
  if(cur && started(n.id)) throw fail(409, 'The next match already started with the earlier winner. Reset it first.');
  n.teams[m.next.pos] = winnerTeam;
  return n;
}
// byes: a round-1 match with one team sends it straight on
function byes(matches, started){
  for(const m of matches.filter(x => x.round === 1 && x.bye)){ const t = m.teams.find(Boolean); if(t) advance(matches, m.id, t, started); }
}

// ---------- round-robin pods ----------
// Teams go into pods by seed, snake order (pod A gets seeds 1, 6, 7 ... with three pods), so pods are even.
// Each pod plays every pairing once, scheduled in rounds by the circle method (one team sits out a round when the pod
// is odd). size: teams per pod, 3 to 8.
function pods(teams, size, prefix = 'p'){
  if(!(size >= 3 && size <= 8)) throw fail(400, 'A pod has 3 to 8 teams.');
  if(teams.length < 3) throw fail(400, 'At least 3 teams are needed for pods.');
  const count = Math.ceil(teams.length / size), out = Array.from({ length: count }, (_, i) => ({ id: String.fromCharCode(65 + i), teams: [] }));
  teams.forEach((t, i) => { const lap = Math.floor(i / count), k = i % count; out[lap % 2 ? count - 1 - k : k].teams.push(t.id); });
  const matches = [];
  for(const p of out){
    const ids = [...p.teams]; if(ids.length % 2) ids.push(null);
    const n = ids.length;
    for(let r = 0; r < n - 1; r++){
      for(let i = 0; i < n / 2; i++){
        const a = ids[i], b = ids[n - 1 - i];
        if(a && b) matches.push({ id: `${prefix}${p.id}${r + 1}-${i + 1}`, pod: p.id, round: r + 1, slot: i, teams: [a, b], next: null, bye: false });
      }
      ids.splice(1, 0, ids.pop()); // rotate everyone but the first
    }
  }
  return { pods: out, matches };
}
// Pod standings from finished matches ({ teams, winner: 0|1, scores: [a, b] }): wins, then head-to-head between the
// tied teams (only when exactly two are tied), then points difference, then points scored, then seed.
function standings(pod, finished, seedOf){
  const row = id => ({ id, played: 0, wins: 0, losses: 0, pf: 0, pa: 0 });
  const t = Object.fromEntries(pod.teams.map(id => [id, row(id)]));
  for(const m of finished){
    const [a, b] = m.teams; if(!t[a] || !t[b]) continue;
    const w = m.teams[m.winner], l = m.teams[1 - m.winner];
    t[a].played++; t[b].played++; t[w].wins++; t[l].losses++;
    t[a].pf += m.scores[0]; t[a].pa += m.scores[1]; t[b].pf += m.scores[1]; t[b].pa += m.scores[0];
  }
  const h2h = (x, y) => { const m = finished.find(f => f.teams.includes(x) && f.teams.includes(y)); return m ? (m.teams[m.winner] === x ? -1 : 1) : 0; };
  const rows = Object.values(t);
  return rows.sort((x, y) => (y.wins - x.wins)
    || (rows.filter(r => r.wins === x.wins).length === 2 ? h2h(x.id, y.id) : 0)
    || ((y.pf - y.pa) - (x.pf - x.pa)) || (y.pf - x.pf) || (seedOf(x.id) - seedOf(y.id)));
}

module.exports = { seedOrder, elimination, advance, byes, pods, standings };
