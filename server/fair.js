// Provably fair shuffle.
// Each tournament gets a secret server seed. Its SHA-256 "seal" is shown to everyone before the first hand.
// Every hand's deck is drawn from SHA-256(seed | public beacon | table | hand), where the beacon is the
// drand League of Entropy random value at the moment the hand starts: nobody, the club owner included,
// can know or choose it in advance. When the tournament ends the seed is revealed, and any player can
// recompute every deck in their browser and check it against the cards that were dealt.
const crypto = require('crypto');
const store = require('./store');

const CHAIN = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971'; // drand quicknet, a new value every 3 s
const BEACON_URL = `https://api.drand.sh/${CHAIN}/public/`;
const KEEP_TOURNEYS = 12;

const sha = s => crypto.createHash('sha256').update(s).digest();
const hex = s => sha(s).toString('hex');

// Fisher-Yates with unbiased draws from a SHA-256 counter stream. public/fair-verify.js mirrors this exactly.
function deckFrom(key){
  let ctr = 0, buf = null, off = 32;
  const next = () => { if(off + 4 > 32){ buf = sha(key + '|' + ctr++); off = 0; } const v = buf.readUInt32BE(off); off += 4; return v; };
  const d = [...Array(52).keys()];
  for(let i = 51; i > 0; i--){
    const n = i + 1, lim = Math.floor(0x100000000 / n) * n;
    let v; do v = next(); while(v >= lim);
    const j = v % n; [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function newSeed(){ const seed = crypto.randomBytes(32).toString('hex'); return { seed, seal: hex(seed) }; }

let fetchBeacon = async () => {
  if(process.env.NO_BEACON) return null;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 1500);
  try{
    const r = await fetch(BEACON_URL + 'latest', { signal: ctl.signal });
    if(!r.ok) return null;
    const j = await r.json();
    return j && j.round && /^[0-9a-f]{64}$/.test(j.randomness) ? { round: j.round, randomness: j.randomness } : null;
  }catch(e){ return null; }
  finally{ clearTimeout(timer); }
};
let beaconFails = 0;

// Deck for one hand. Returns { deck, rec } where rec is what gets saved for later verification.
async function deckForHand(t, tid, handNo){
  const b = await fetchBeacon();
  if(!b && !process.env.NO_BEACON){ beaconFails++; if(beaconFails % 20 === 1) console.error('drand beacon unavailable; using a local random value for this hand'); }
  const beacon = b ? b.randomness : crypto.randomBytes(32).toString('hex');
  const key = `${t.fairSeed}|${beacon}|${tid}|${handNo}`;
  return { deck: deckFrom(key), rec: { tid, hand: handNo, beacon, round: b ? b.round : null, at: Date.now() } };
}

// Who got which cards (and the board so far), keyed so the finished hand overwrites its own deal-time record.
const fkey = (tourneyId, rec) => `fair:${tourneyId}:${rec.tid}:${String(rec.hand).padStart(5, '0')}:${rec.at}`;
const snap = (rec, h, live) => ({ ...rec, ...(live ? { live: true } : {}), players: h.players.map(p => ({ uid: p.uid, name: p.name, cards: p.cards.slice() })), board: h.board.slice() });
// At the deal and each new street: save the deal as it stands, marked live, so a deal cut off by a restart stays on record.
function saveDeal(tourneyId, rec, h){ store.set(fkey(tourneyId, rec), snap(rec, h, true)); }
// After the hand: the complete record, so the deck can be checked once the seed is revealed.
function saveHand(tourneyId, rec, h){ store.set(fkey(tourneyId, rec), snap(rec, h, false)); }
// On resume: a record still live was cut off by the restart. Its hand is replayed under the same number with a new
// deck, so the old deal stays in the report as its own record, marked void (it decided no chips).
function voidLive(tourneyId){
  for(const k of store.keys(`fair:${tourneyId}:`)){ const r = store.get(k); if(r && r.live){ const { live, ...rest } = r; store.set(k, { ...rest, void: 'interrupted' }); } }
}

function prune(){
  const ids = [...new Set(store.keys('fair:').map(k => k.split(':')[1]))].sort();
  for(const id of ids.slice(0, Math.max(0, ids.length - KEEP_TOURNEYS))) for(const k of store.keys('fair:' + id + ':')) store.del(k);
}

// Everything needed to verify a finished tournament. The seed stays secret while it is still being played.
function report(t){
  if(!t) return null;
  const done = ['finished', 'cancelled'].includes(t.status);
  // a record still live here never finished for another reason (a failed hand, a mid-hand cancel): void too
  const hands = done ? store.keys(`fair:${t.id}:`).sort().map(k => store.get(k)).map(({ live, ...r }) => live ? { ...r, void: 'unfinished' } : r) : [];
  return { id: t.id, name: t.name, status: t.status, seal: t.fairSeal || null, seed: done ? t.fairSeed || null : null, chain: CHAIN, beaconUrl: BEACON_URL, hands };
}

async function probe(){ const b = await fetchBeacon(); console.log(b ? `fair deal: drand beacon ok (round ${b.round})` : 'fair deal: drand beacon NOT reachable'); }

module.exports = { probe, deckFrom, newSeed, deckForHand, saveDeal, saveHand, voidLive, prune, report, CHAIN, _setBeacon: f => { fetchBeacon = f; } };
