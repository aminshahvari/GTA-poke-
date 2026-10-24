// Seating at the start, cheaper but the same: club.js seatGroups (weights kept per player and table, the repair pass skipped
// when nobody is linked) and clustersOf (union-find over the linked pairs), with server/links.js linkPairs (linked pairs found
// through household / device / address buckets), must seat exactly as the code before them (copied below from 946e4c5:
// clustersOf, pairW, the greedy placement and the repair pass in start(), linkReason in index.js). The old code is
// deterministic once the field is shuffled, so for the same shuffled field and the same links the tables must be identical,
// seat for seat. Randomized fields (seeded; SEED=... to replay), with no links, sparse links, households, shared devices, one
// shared address for many, chains, a linker that answers true, unknown reasons; table sizes 6, 8 and 9. Also: linkPairs gives
// every pair the old linkReason links, with the same reason, and honours an answer kept in the 5 s cache; clustersOf
// gives the old clusters; and the cost at 500 players stays small.
const path = require('path'), fs = require('fs'), os = require('os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tseatfast-'));
process.env.DATA_FILE = path.join(dir, 'club.json'); process.env.NO_BEACON = '1'; delete process.env.DATABASE_URL;
process.on('exit', () => { try{ fs.rmSync(dir, { recursive: true, force: true }); }catch(e){} });
const club = require('../server/club');
const { linkReason, linkPairs } = require('../server/links');

let fails = 0, oks = 0;
const ok = (c, m) => { if(c) oks++; else { fails++; console.log('FAIL', m); } };
const SEED = +(process.env.SEED || Date.now() % 1e9);
let s0 = SEED >>> 0;
const rnd = () => { s0 = (s0 + 0x6D2B79F5) >>> 0; let t = s0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = n => Math.floor(rnd() * n);
const shuffle = a => { for(let i = a.length - 1; i > 0; i--){ const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- the old code (946e4c5), verbatim apart from taking the linker as an argument ----------
function oldSeat(regs, nT, cap, linker, noRepair){
  function clustersOf(uids){
    uids = [...new Set(uids)];
    const up = new Map(uids.map(u => [u, u])), find = u => up.get(u) === u ? u : find(up.get(u));
    for(let i = 0; i < uids.length; i++) for(let j = i + 1; j < uids.length; j++) if(linker(uids[i], uids[j])) up.set(find(uids[i]), find(uids[j]));
    return new Map(uids.map(u => [u, find(u)]));
  }
  const LINK_W = { 'same household': 1e6, 'same device': 1e4, 'same internet': 1e2 };
  const pairW = (a, b, cl) => { if(a === b) return 0; const r = linker(a, b); return r ? LINK_W[r] || 1e6 : cl && cl.has(a) && cl.get(a) === cl.get(b) ? 1 : 0; };
  const groups = Array.from({ length: nT }, () => []);
  const cl = clustersOf(regs), conflicts = (grp, u) => grp.reduce((n, v) => n + pairW(u, v, cl), 0), heavy = new Map(regs.map(u => [u, conflicts(regs, u)]));
  const order = regs.slice().sort((a, b) => heavy.get(b) - heavy.get(a));
  order.forEach(u => {
    const best = groups.filter(gp => gp.length < cap).sort((a, b) => conflicts(a, u) - conflicts(b, u) || a.length - b.length)[0];
    best.push(u);
  });
  const cost = grp => grp.reduce((a, u, i) => a + conflicts(grp.slice(i + 1), u), 0);
  if(noRepair) return { groups, clustersOf }; // (the test's switch: the greedy step alone)
  for(let pass = 0, improved = true; improved && pass < 50; pass++){
    improved = false;
    for(let a = 0; a < groups.length; a++) for(let b = a + 1; b < groups.length; b++){
      for(let i = 0; i < groups[a].length; i++) for(let j = 0; j < groups[b].length; j++){
        const before = cost(groups[a]) + cost(groups[b]);
        [groups[a][i], groups[b][j]] = [groups[b][j], groups[a][i]];
        if(cost(groups[a]) + cost(groups[b]) < before) improved = true;
        else [groups[a][i], groups[b][j]] = [groups[b][j], groups[a][i]];
      }
    }
  }
  return { groups, clustersOf };
}
function oldLinkReason(cx, a, b){
  if(a === b) return null;
  const linkCache = cx.linkCache;
  const k = a < b ? a + '|' + b : b + '|' + a, c = linkCache.get(k);
  if(c && Date.now() - c.at < 5000) return c.r;
  const ua = cx.store.get('user:' + a), ub = cx.store.get('user:' + b);
  let r = null;
  if(ua && ub){
    const now = Date.now(), recent = (o, days) => Object.entries(o || {}).filter(([, t]) => now - t < days * 864e5).map(([v]) => v);
    const share = (x, y) => x.some(v => y.includes(v));
    if(ua.household && ua.household === ub.household) r = 'same household';
    else if(share(recent(ua.seen && ua.seen.devs, 60), recent(ub.seen && ub.seen.devs, 60))) r = 'same device';
    else if(share(recent(ua.seen && ua.seen.ips, 14), recent(ub.seen && ub.seen.ips, 14))) r = 'same internet';
  }
  linkCache.set(k, { r, at: Date.now() });
  return r;
}

// ---------- synthetic fields: user records as index.js keeps them (household, seen.devs, seen.ips with times) ----------
const DAY = 864e5;
function field(n, kind){
  const now = Date.now(), users = new Map(), regs = Array.from({ length: n }, (_, i) => 'u' + String(i).padStart(12, '0'));
  // everyone has an own device and address, some old ones that no longer count (61 / 15 days)
  regs.forEach((u, i) => users.set(u, { id: u, name: u, seen: { devs: { ['dev' + i]: now - ri(30) * DAY, ['olddev' + ri(4)]: now - 61 * DAY }, ips: { ['10.0.' + i]: now - ri(10) * DAY, ['oldip' + ri(4)]: now - 15 * DAY } } }));
  const pick = () => regs[ri(n)];
  const hh = (a, b) => { const g = users.get(a).household || users.get(b).household || 'h' + ri(1e9); users.get(a).household = g; users.get(b).household = g; };
  const dev = (a, b) => { const d = 'sd' + ri(1e9); users.get(a).seen.devs[d] = now - ri(59) * DAY; users.get(b).seen.devs[d] = now - ri(59) * DAY; };
  const ip = (us, v) => { const a = 'sip' + ri(1e9); for(const u of us) users.get(u).seen.ips[a] = now - (v || ri(13)) * DAY; };
  const k = Math.max(1, Math.round(n * (0.02 + rnd() * 0.1)));
  if(kind === 'sparse') for(let i = 0; i < k; i++){ const r = ri(3); r === 0 ? hh(pick(), pick()) : r === 1 ? dev(pick(), pick()) : ip([pick(), pick()]); }
  if(kind === 'households') for(let i = 0; i < k; i++){ const a = pick(), b = pick(), c = pick(); hh(a, b); if(rnd() < 0.3) hh(b, c); }
  if(kind === 'devices') for(let i = 0; i < k; i++) dev(pick(), pick());
  if(kind === 'oneip') ip(regs.filter(() => rnd() < 0.3 + rnd() * 0.7));
  if(kind === 'mixed'){ ip(regs.filter(() => rnd() < 0.25)); for(let i = 0; i < k; i++){ hh(pick(), pick()); dev(pick(), pick()); ip([pick(), pick(), pick()]); } }
  if(kind === 'chain'){ const c = shuffle(regs.slice()).slice(0, Math.min(n, 3 + ri(12))); for(let i = 1; i < c.length; i++) [hh, dev, (a, b) => ip([a, b])][ri(3)](c[i - 1], c[i]); }
  if(kind === 'stale') for(let i = 0; i < k; i++) ip([pick(), pick()], 14 + ri(3)); // shared, but too long ago: no link
  const store = { get: k => users.get(k.slice(5)) };
  return { regs, users, store };
}
const cxOf = f => ({ store: f.store, linkCache: new Map() });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tablesFor = (n, size) => { const nT = Math.ceil(n / size); return [nT, Math.ceil(n / nT)]; };

(async () => {
  console.log('t_seat_fast: SEED=' + SEED);
  const KINDS = ['none', 'sparse', 'households', 'devices', 'oneip', 'mixed', 'chain', 'stale'];
  // 1. linkPairs = every pair the old linkReason links, with the same reason
  for(let r = 0; r < 40; r++){
    const n = 2 + ri(120), f = field(n, KINDS[r % KINDS.length]), cxo = cxOf(f), cxn = cxOf(f), want = new Map();
    for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++){ const x = oldLinkReason(cxo, f.regs[i], f.regs[j]); if(x) want.set(f.regs[i] + '|' + f.regs[j], x); }
    const got = new Map(linkPairs(cxn, shuffle(f.regs.slice())).map(([a, b, x]) => [a < b ? a + '|' + b : b + '|' + a, x]));
    ok(got.size === want.size && [...want].every(([k, x]) => got.get(k) === x), `linkPairs = old linkReason over all pairs (${KINDS[r % KINDS.length]}, n=${n}): ${got.size} vs ${want.size}`);
    ok([...want].every(([k, x]) => { const [a, b] = k.split('|'); return linkReason(cxn, a, b) === x && linkReason(cxn, b, a) === x; }), 'linkReason = old linkReason, both orders');
  }
  // an answer still kept in the cache is honoured by both: a pair asked about a moment ago (not linked) that now shares an
  // address stays unlinked for linkReason and for linkPairs until the 5 s are up, then both see the link
  { const f = field(10, 'none'), cx = cxOf(f), [a, b] = f.regs;
    ok(linkReason(cx, a, b) === null, 'cache: not linked');
    f.users.get(a).seen.ips.shared = Date.now(); f.users.get(b).seen.ips.shared = Date.now();
    ok(linkReason(cx, a, b) === null && !linkPairs(cx, f.regs).length, 'cache: a kept answer is honoured by linkPairs too');
    cx.linkCache.get(a < b ? a + '|' + b : b + '|' + a).at -= 6000;
    ok(linkPairs(cx, f.regs).length === 1 && linkReason(cx, a, b) === 'same internet', 'cache: after 5 s the facts decide, and linkPairs keeps its answer'); }
  // a player with no account record links to nobody (the old code returned null), and a duplicate uid changes nothing
  { const f = field(6, 'oneip'), cx = cxOf(f); ok(same(linkPairs(cx, [...f.regs, 'ughost', f.regs[0]]).length, linkPairs(cxOf(f), f.regs).length), 'linkPairs: unknown and duplicate uids'); }

  // 2. clustersOf: the same partition as the old all-pairs clustering, with and without the linker's index
  for(let r = 0; r < 30; r++){
    const n = 2 + ri(150), f = field(n, KINDS[r % KINDS.length]), cxo = cxOf(f), cxn = cxOf(f);
    const old = oldSeat([], 1, 1, (a, b) => oldLinkReason(cxo, a, b)).clustersOf(f.regs);
    for(const idx of [true, false]){
      club.setLinker((a, b) => linkReason(cxn, a, b), idx ? uids => linkPairs(cxn, uids) : undefined);
      const nw = club._seat.clustersOf(f.regs), part = m => { const g = new Map(); for(const [u, c] of m){ if(!g.has(c)) g.set(c, []); g.get(c).push(u); } return [...g.values()].map(x => x.sort().join()).sort().join(';'); };
      ok(part(nw) === part(old), `clustersOf: same clusters (${KINDS[r % KINDS.length]}, n=${n}, index ${idx})`);
    }
  }

  // 3. seating: identical tables for the same shuffled field and links
  let cases = 0, linkedCases = 0, swapsSeen = 0;
  for(let r = 0; r < 160; r++){
    const kind = KINDS[r % KINDS.length], n = 2 + ri(r < 140 ? 110 : 230), size = [6, 8, 9][ri(3)], [nT, cap] = tablesFor(n, size);
    const f = field(n, kind), regs = shuffle(f.regs.slice()), cxo = cxOf(f), cxn = cxOf(f);
    const want = oldSeat(regs.slice(), nT, cap, (a, b) => oldLinkReason(cxo, a, b)).groups;
    for(const idx of [true, false]){
      club.setLinker((a, b) => linkReason(cxn, a, b), idx ? uids => linkPairs(cxn, uids) : undefined);
      const got = club._seat.seatGroups(regs.slice(), nT, cap);
      ok(same(got, want), `seating identical (${kind}, n=${n}, ${size}-max, index ${idx})${same(got, want) ? '' : '\n  old ' + JSON.stringify(want) + '\n  new ' + JSON.stringify(got)}`);
      ok(got.flat().length === n && new Set(got.flat()).size === n && got.every(g => g.length <= cap), 'everyone seated once, no table over the cap');
    }
    cases++; if(linkPairs(cxOf(f), regs).length) linkedCases++;
    if(!same(oldSeat(regs.slice(), nT, cap, (a, b) => oldLinkReason(cxOf(f), a, b), true).groups, want)) swapsSeen++;
  }
  // 3b. small fields with many links, where the greedy step leaves work for the repair pass
  for(let r = 0; r < 200; r++){
    const n = 8 + ri(50), size = [6, 8, 9][ri(3)], [nT, cap] = tablesFor(n, size), regs = Array.from({ length: n }, (_, i) => 'q' + i), L = new Map();
    const reasons = ['same household', 'same device', 'same internet'];
    for(let k = n + ri(n * 3); k > 0; k--){ const a = regs[ri(n)], b = regs[ri(n)]; if(a !== b && !L.has(a + '|' + b)){ const x = reasons[ri(3)]; L.set(a + '|' + b, x); L.set(b + '|' + a, x); } }
    const lk = (a, b) => L.get(a + '|' + b) || null, pairsOf = us => { const out = []; for(const [k, x] of L){ const [a, b] = k.split('|'); if(a < b && us.includes(a) && us.includes(b)) out.push([b, a, x]); } return shuffle(out); };
    shuffle(regs);
    const want = oldSeat(regs.slice(), nT, cap, lk).groups;
    if(!same(oldSeat(regs.slice(), nT, cap, lk, true).groups, want)) swapsSeen++;
    for(const idx of [true, false]){ club.setLinker(lk, idx ? pairsOf : undefined); ok(same(club._seat.seatGroups(regs.slice(), nT, cap), want), `seating identical, dense links (n=${n}, ${size}-max, ${L.size / 2} links, index ${idx})`); }
  }
  // 4. a linker without an index (old callers, tests) and the weights it may answer: true, an unknown reason, every reason
  for(let r = 0; r < 60; r++){
    const n = 2 + ri(80), [nT, cap] = tablesFor(n, 9), regs = Array.from({ length: n }, (_, i) => 'p' + i), L = new Map();
    const reasons = [true, 'same household', 'same device', 'same internet', 'something else'];
    for(let k = ri(n * (r % 3)); k > 0; k--){ const a = regs[ri(n)], b = regs[ri(n)]; if(a !== b){ const x = reasons[ri(reasons.length)]; L.set(a + '|' + b, x); L.set(b + '|' + a, x); } }
    const lk = (a, b) => L.get(a + '|' + b) || null;
    shuffle(regs);
    club.setLinker(lk);
    const got = club._seat.seatGroups(regs.slice(), nT, cap), want = oldSeat(regs.slice(), nT, cap, lk).groups;
    ok(same(got, want), `seating identical with a plain linker (n=${n}, ${L.size / 2} links)`);
    if(!same(oldSeat(regs.slice(), nT, cap, lk, true).groups, want)) swapsSeen++;
  }
  console.log(`  seating: ${cases} random fields (${linkedCases} with links), 200 small ones with dense links and 60 with a plain linker; the repair pass moved players in ${swapsSeen}`);
  ok(swapsSeen >= 50, 'the repair pass changed the seating in enough of the fields compared (' + swapsSeen + ')');

  // 5. cost at 500: no links, a realistic mix, and everyone on one address (all pairs linked, the worst case)
  for(const kind of ['none', 'households', 'mixed', 'oneip']){
    const f = field(500, kind), cx = cxOf(f), regs = shuffle(f.regs.slice()), [nT, cap] = tablesFor(500, 9);
    if(kind === 'oneip') for(const u of f.regs) f.users.get(u).seen.ips.everyone = Date.now();
    club.setLinker((a, b) => linkReason(cx, a, b), uids => linkPairs(cx, uids));
    const t0 = process.hrtime.bigint(); const g = club._seat.seatGroups(regs, nT, cap); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const t1 = process.hrtime.bigint(); club._seat.clustersOf(f.regs); const cms = Number(process.hrtime.bigint() - t1) / 1e6;
    console.log(`  500 players, ${kind}: seating ${ms.toFixed(1)} ms, clusters ${cms.toFixed(1)} ms`);
    ok(g.flat().length === 500, '500 seated');
    ok(ms < (kind === 'oneip' ? 4000 : 400), `500 players (${kind}) seated in ${ms.toFixed(0)} ms`);
  }
  console.log(fails ? `t_seat_fast: ${fails} failed, ${oks} passed (SEED=${SEED})` : `t_seat_fast: all ${oks} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
