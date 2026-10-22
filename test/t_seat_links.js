// Seating keeps linked players apart: same household (set by the director) is worst, then same device, then same
// internet, then only the same cluster (linked through someone else); ties go to fewer links, then fewer players.
// Linked players form clusters: A–B household and B–C same internet keep all three apart when tables allow, at the
// start, on late registration and on a table break.
// Regressions: a newcomer whose household partner sat at one table and who shared an IP with someone at the other was
// seated with the partner (both tables counted as "linked", the tie fell to table order); three players from one place,
// linked only in a chain, sat at one table.
const path = require('path'), fs = require('fs'), os = require('os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tseat-'));
process.env.DATA_FILE = path.join(dir, 'club.json'); process.env.NO_BEACON = '1'; delete process.env.DATABASE_URL;
process.on('exit', () => { try{ fs.rmSync(dir, { recursive: true, force: true }); }catch(e){} });
const store = require('../server/store');
const club = require('../server/club');

let fails = 0, oks = 0;
const ok = (c, m) => { if(c) oks++; else { fails++; console.log('FAIL', m); } };
const links = {}; // 'a|b' -> reason
const link = (a, b, r) => { links[a + '|' + b] = links[b + '|' + a] = r; };
club.setLinker((a, b) => links[a + '|' + b] || null);

let tno = 0;
// fresh running tournament with the given tables (lists of uids); returns the tables in that order
function setup(layout){
  tno++; club.tables.clear(); for(const k of Object.keys(links)) delete links[k];
  store.set('tourney', { id: 'ts' + tno, status: 'running', level: 0, lateLevels: 4, paused: false, stack: 10000, regs: layout.flat(), entrants: layout.flat().length, remaining: layout.flat().length, places: [], levelMin: 10, levelEndsAt: Date.now() + 6e5 });
  return layout.map((us, i) => {
    const tb = club._seat.newTable('ts' + tno + '-' + (i + 1), i + 1);
    us.forEach((u, k) => { store.set('user:' + u, { id: u, name: u }); tb.g.seats[k * 2] = { id: u, uid: u, name: u, isHero: true, stack: 10000, seat: k * 2, cards: [] }; });
    return tb;
  });
}
const at = uid => club.tableOf(uid);
const user = u => store.set('user:' + u, { id: u, name: u });

(async () => {
  await store.init();
  // 1. the reported case, both table orders: household partner at one table, IP-sharer at the other, equal counts
  for(const flip of [false, true]){
    const ts = setup(flip ? [['i1', 'x1', 'x2'], ['h1', 'y1', 'y2']] : [['h1', 'y1', 'y2'], ['i1', 'x1', 'x2']]);
    user('n'); link('n', 'h1', 'same household'); link('n', 'i1', 'same internet');
    club.join('n');
    ok(at('n') && at('n') === at('i1') && at('n') !== at('h1'), 'late join: household pair shared a table while another had room (flip ' + flip + ')');
    ok(ts.every(t => t.g.seats.filter(Boolean).length <= 4), 'late join seated once');
  }
  // 2. household beats a fuller table: the newcomer goes to the bigger table rather than sit with the partner
  { setup([['h1'], ['i1', 'x1', 'x2', 'x3']]); user('n'); link('n', 'h1', 'same household'); link('n', 'i1', 'same internet');
    club.join('n'); ok(at('n') === at('i1'), 'late join: household outranks player count'); }
  // 3. device is worse than internet
  { setup([['d1', 'y1'], ['i1', 'x1']]); user('n'); link('n', 'd1', 'same device'); link('n', 'i1', 'same internet');
    club.join('n'); ok(at('n') === at('i1'), 'late join: same device outranks same internet'); }
  // 4. an unlinked table wins over any link
  { setup([['i1', 'x1'], ['z1', 'z2', 'z3']]); user('n'); link('n', 'i1', 'same internet');
    club.join('n'); ok(at('n') === at('z1'), 'late join: unlinked table first'); }
  // 5. same strongest link: fewer linked players first, then fewest players
  { setup([['i1', 'i2'], ['i3', 'x1', 'x2']]); user('n'); link('n', 'i1', 'same internet'); link('n', 'i2', 'same internet'); link('n', 'i3', 'same internet');
    club.join('n'); ok(at('n') === at('i3'), 'late join: fewer linked players first'); }
  { setup([['a1', 'a2', 'a3'], ['b1', 'b2']]); user('n'); club.join('n'); ok(at('n') === at('b1'), 'late join: no links, fewest players (unchanged)'); }
  // 6. old callers: a linker returning true still counts as a link
  { setup([['t1', 'y1'], ['x1', 'x2']]); user('n'); club.setLinker((a, b) => (a === 'n' && b === 't1') || (a === 't1' && b === 'n'));
    club.join('n'); ok(at('n') === at('x1'), 'late join: boolean linker still avoided');
    club.setLinker((a, b) => links[a + '|' + b] || null); }
  // 7. table break: the mover goes to the IP-sharer's table, never the household partner's, both orders
  for(const flip of [false, true]){
    const ts = setup(flip ? [['n', 'q1'], ['i1', 'x1', 'x2'], ['h1', 'y1', 'y2']] : [['n', 'q1'], ['h1', 'y1', 'y2'], ['i1', 'x1', 'x2']]);
    link('n', 'h1', 'same household'); link('n', 'i1', 'same internet');
    club._seat.breakTable(ts[0]);
    ok(at('n') === at('i1') && at('n') !== at('h1'), 'break: household pair seated together (flip ' + flip + ')');
    ok(at('q1') && at('q1') !== ts[0].tid, 'break: everyone moved');
  }
  // 8. clusters. A–B household, B–C same internet (C and A are not linked to each other)
  const chain = () => { link('A', 'B', 'same household'); link('B', 'C', 'same internet'); };
  // late join: C avoids B's table and A's table when a third table has room, even with more players there
  for(const flip of [false, true]){
    setup(flip ? [['z1', 'z2', 'z3', 'z4'], ['B', 'y1'], ['A', 'x1']] : [['A', 'x1'], ['B', 'y1'], ['z1', 'z2', 'z3', 'z4']]); user('C'); chain();
    club.join('C'); ok(at('C') === at('z1'), 'late join: cluster member seated with the cluster (flip ' + flip + ')');
  }
  // late join with 2 tables: C can't avoid both, so it sits with A (same cluster only), never with B (a direct link)
  for(const flip of [false, true]){
    setup(flip ? [['B', 'y1'], ['A', 'x1', 'x2']] : [['A', 'x1', 'x2'], ['B', 'y1']]); user('C'); chain();
    club.join('C'); ok(at('C') === at('A'), 'late join: 2 tables, cluster member sat with its direct link (flip ' + flip + ')');
  }
  // late join: the joiner is B, household with A, IP with C: C's table, never A's
  { setup([['A', 'x1'], ['C', 'y1']]); user('B'); chain(); club.join('B'); ok(at('B') === at('C'), 'late join: household beats IP inside a cluster'); }
  // table break: all three on the breaking table, three other tables: one each
  for(let r = 0; r < 5; r++){
    const ts = setup([['A', 'B', 'C', 'q1'], ['x1', 'x2', 'x3'], ['y1', 'y2', 'y3'], ['z1', 'z2', 'z3']]); chain();
    club._seat.breakTable(ts[0]);
    ok(new Set(['A', 'B', 'C'].map(at)).size === 3 && ['A', 'B', 'C', 'q1'].every(u => at(u) && at(u) !== ts[0].tid), 'break: cluster of 3 not spread over 3 tables');
  }
  // table break: C moves; A and B sit at two tables, a third (within the window) has neither
  for(const flip of [false, true]){
    const ts = setup(flip ? [['C', 'q1'], ['z1', 'z2', 'z3'], ['B', 'y1', 'y2'], ['A', 'x1', 'x2']] : [['C', 'q1'], ['A', 'x1', 'x2'], ['B', 'y1', 'y2'], ['z1', 'z2', 'z3']]); chain();
    club._seat.breakTable(ts[0]); ok(at('C') === at('z1'), 'break: cluster member moved to its cluster (flip ' + flip + ')');
  }
  // table break with 2 tables left: C goes to A (cluster only), not B (direct link)
  { const ts = setup([['C', 'q1'], ['B', 'y1', 'y2'], ['A', 'x1', 'x2']]); chain(); club._seat.breakTable(ts[0]); ok(at('C') === at('A'), 'break: 2 tables, cluster member sat with its direct link'); }
  // tournament start: 3 tables -> A, B, C at three tables; 2 tables -> B alone, A and C together (never A–B or B–C)
  const startWith = (n, linkFn) => {
    club.tables.clear(); for(const k of Object.keys(links)) delete links[k];
    const regs = ['A', 'B', 'C', ...Array.from({ length: n - 3 }, (_, i) => 'p' + i)]; regs.forEach(user); linkFn();
    tno++; store.set('tourney', { id: 'st' + tno, status: 'registering', regs, stack: 10000, levelMin: 10, tableSize: 9, lateLevels: 0, places: [] });
    club.start(); club.stopAll();
    const where = Object.fromEntries(regs.map(u => [u, at(u)]));
    for(const tb of club.tables.values()) tb.broken = true; club.tables.clear();
    return where;
  };
  for(let r = 0; r < 10; r++){
    const w3 = startWith(25, chain); ok(new Set([w3.A, w3.B, w3.C]).size === 3, 'start, 3 tables: chain cluster not spread ' + JSON.stringify([w3.A, w3.B, w3.C]));
    const w2 = startWith(14, chain); ok(w2.A !== w2.B && w2.B !== w2.C && w2.A === w2.C, 'start, 2 tables: A–B or B–C seated together ' + JSON.stringify([w2.A, w2.B, w2.C]));
    // three from one place, all linked by internet only: 3 tables -> one each
    const w4 = startWith(22, () => { link('A', 'B', 'same internet'); link('B', 'C', 'same internet'); link('A', 'C', 'same internet'); });
    ok(new Set([w4.A, w4.B, w4.C]).size === 3, 'start, 3 tables: linked trio not spread');
    // household beats IP at the start: A–B household, A–C and B–C internet, 2 tables -> A and B apart
    const w5 = startWith(12, () => { link('A', 'B', 'same household'); link('A', 'C', 'same internet'); link('B', 'C', 'same internet'); });
    ok(w5.A !== w5.B, 'start, 2 tables: household pair together to split an IP link');
  }
  // 9. table break keeps its fewest-players window: a table 2+ above the smallest is not a destination
  { const ts = setup([['n'], ['h1'], ['x1', 'x2', 'x3']]); link('n', 'h1', 'same household');
    club._seat.breakTable(ts[0]); ok(at('n') === at('h1'), 'break: window of low + 1 kept'); }
  console.log(fails ? `t_seat_links: ${fails} failed, ${oks} passed` : `t_seat_links: all ${oks} passed`);
  await store.flush();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
