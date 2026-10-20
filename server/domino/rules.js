// Domino scoring rules for the Smart Scorepad (physical play: players play real dominoes at a real table, and the
// scorepad records what happened). Pure functions, no data: the server computes every score from raw facts the
// players enter (who went out, how many pips were left in each hand, the open-end count after a scoring play) and
// never accepts a total from a client. docs/domino/RULES.md lists each preset with its fixtures (test/t_domino_rules.js).
//
// A double-six set: 28 tiles, 168 pips in all. Each player starts with 7 tiles (2 or 4 players).
const SET_PIPS = 168, HAND_TILES = 7, MAX_HAND_PIPS = 12 * HAND_TILES; // 84: seven tiles can never hold more than 6-6 x 7
// round to the nearest multiple of 5, halves up (12 -> 10, 13 -> 15, 15 -> 15): the All Fives custom for hand-end points
const round5 = n => Math.floor((n + 2.5) / 5) * 5;

// Presets. target: points that win the match. counts: scoring plays during the hand (All Fives). blocked: how a blocked
// hand (nobody can play, boneyard empty or not used) is scored: 'opponents' = the side with the lower pip total scores
// the other side's pips; 'difference' = it scores the difference. A tie in a blocked hand scores nothing for anyone.
// handEnd: 'pips' = exact pips, 'round5' = pips rounded to the nearest 5 (All Fives).
const PRESETS = {
  allfives: { id: 'allfives', name: 'All Fives', target: 150, counts: true, draw: true, blocked: 'opponents', handEnd: 'round5' },
  block: { id: 'block', name: 'Block', target: 100, counts: false, draw: false, blocked: 'opponents', handEnd: 'pips' },
  draw: { id: 'draw', name: 'Draw', target: 100, counts: false, draw: true, blocked: 'opponents', handEnd: 'pips' }
};
const TARGETS = [50, 61, 100, 150, 200, 250];
const FORMATS = { hu: { id: 'hu', name: 'Heads-up 1v1', perSide: 1 }, pairs: { id: 'pairs', name: 'Partnership 2v2', perSide: 2 } };

const fail = msg => Object.assign(new Error(msg), { status: 400 });
const isInt = n => Number.isInteger(n);

// the rules a tournament plays: a preset plus the few options a director may change
function make(o = {}){
  const p = PRESETS[o.preset]; if(!p) throw fail('Pick All Fives, Block or Draw.');
  const f = FORMATS[o.format]; if(!f) throw fail('Pick heads-up 1v1 or partnership 2v2.');
  const target = o.target == null ? p.target : +o.target;
  if(!TARGETS.includes(target)) throw fail('Pick a target score from the list.');
  const blocked = o.blocked == null ? p.blocked : o.blocked;
  if(!['opponents', 'difference'].includes(blocked)) throw fail('Pick how a blocked hand is scored.');
  return { preset: p.id, name: p.name, format: f.id, perSide: f.perSide, target, counts: p.counts, draw: p.draw, blocked, handEnd: p.handEnd };
}

// A scoring play in All Fives: the open ends add up to a multiple of 5, and that side scores it at once.
// No layout can show more than 60 on its open ends, so 60 is the cap.
function countPoints(r, points){
  if(!r.counts) throw fail('This game has no scoring plays during the hand.');
  if(!isInt(points) || points < 5 || points > 60 || points % 5) throw fail('A scoring play is 5, 10, 15 ... up to 60.');
  return points;
}

// The end of a hand. sides: [[uid, ...], [uid, ...]]. pips: { uid: pips left in that player's hand }.
// end 'domino': out is the uid who played their last tile (their pips must be 0).
// end 'blocked': nobody can play; each side's total decides.
// Returns { side: 0 | 1 | null, points, totals: [a, b] } (side null: a blocked tie, nobody scores).
function handResult(r, sides, end, pips, out){
  const all = sides.flat();
  if(!pips || typeof pips !== 'object') throw fail('Enter the pips left in every hand.');
  for(const uid of all){
    const v = pips[uid];
    if(!isInt(v) || v < 0 || v > MAX_HAND_PIPS) throw fail('Pips left in a hand are a whole number from 0 to ' + MAX_HAND_PIPS + '.');
  }
  if(Object.keys(pips).some(k => !all.includes(k))) throw fail('Pips were entered for someone not in this match.');
  const totals = sides.map(s => s.reduce((a, uid) => a + pips[uid], 0));
  if(totals[0] + totals[1] > SET_PIPS) throw fail('Those hands add up to more pips than a double-six set has.');
  let side, base;
  if(end === 'domino'){
    if(!all.includes(out)) throw fail('Pick who went out.');
    if(pips[out] !== 0) throw fail('The player who went out has no pips left.');
    side = sides[0].includes(out) ? 0 : 1;
    base = totals[1 - side]; // a partnership scores both opponents' hands; the partner's own pips don't count
  } else if(end === 'blocked'){
    if(totals[0] === totals[1]) return { side: null, points: 0, totals };
    side = totals[0] < totals[1] ? 0 : 1;
    base = r.blocked === 'difference' ? totals[1 - side] - totals[side] : totals[1 - side];
  } else throw fail('A hand ends with someone going out, or blocked.');
  return { side, points: r.handEnd === 'round5' ? round5(base) : base, totals };
}

module.exports = { PRESETS, FORMATS, TARGETS, SET_PIPS, MAX_HAND_PIPS, round5, make, countPoints, handResult };
