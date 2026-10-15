// Points and the rewards shop. Points are earned only by finishing places, can't be bought, sold, transferred or
// cashed out, and are spent only on prizes the club owner buys and lists. A skill-testing question is required to claim.
const crypto = require('crypto');
const store = require('./store');

function earned(uid){ let s = 0; for(const h of store.values('history:')) for(const r of h.results) if(r.uid === uid) s += r.pts || 0; return s; }
function spent(uid){ return store.values('redeem:').filter(r => r.uid === uid && r.status !== 'cancelled').reduce((s, r) => s + r.cost, 0); }
const balance = uid => earned(uid) - spent(uid);
const rewards = () => store.values('reward:').filter(r => !r.removed).sort((a, b) => a.cost - b.cost);
const claimedCount = rid => store.values('redeem:').filter(r => r.rid === rid && r.status !== 'cancelled').length;

function addReward({ name, cost, qty, value, note }){
  name = String(name || '').trim().slice(0, 60); cost = Math.floor(+cost); qty = Math.floor(+qty); value = String(value || '').trim().slice(0, 30); note = String(note || '').trim().slice(0, 140);
  if(!name) throw new Error('Give the prize a name.');
  if(!(cost >= 1 && cost <= 100000)) throw new Error('Points must be between 1 and 100,000.');
  if(!(qty >= 1 && qty <= 1000)) throw new Error('Quantity must be between 1 and 1,000.');
  const id = 'r' + crypto.randomBytes(5).toString('hex');
  return store.set('reward:' + id, { id, name, cost, qty, value, note, createdAt: Date.now() });
}
function removeReward(id){ const r = store.get('reward:' + id); if(r) store.set('reward:' + id, { ...r, removed: true }); }

// skill-testing question: multi-step arithmetic, answered without help
const pending = new Map(); // uid -> { rid, answer, at }
function question(uid, rid){
  const r = store.get('reward:' + rid);
  if(!r || r.removed) throw new Error('That prize is no longer available.');
  if(claimedCount(rid) >= r.qty) throw new Error('That prize is all claimed.');
  if(balance(uid) < r.cost) throw new Error("You don't have enough points for that yet.");
  const a = 2 + crypto.randomInt(8), b = 2 + crypto.randomInt(8), c = 10 + crypto.randomInt(40), d = 2 + crypto.randomInt(4), e = d * (1 + crypto.randomInt(9));
  pending.set(uid, { rid, answer: a * b + c - e / d, at: Date.now() });
  return `${a} × ${b} + ${c} − ${e} ÷ ${d}`;
}
function claim(uid, rid, answer){
  const p = pending.get(uid);
  if(!p || p.rid !== rid || Date.now() - p.at > 5 * 60000) throw new Error('That question expired. Try again.');
  pending.delete(uid);
  if(Number(String(answer).trim()) !== p.answer) throw new Error('That answer is not right, so the prize was not claimed. You can try again with a new question.');
  const r = store.get('reward:' + rid);
  if(!r || r.removed) throw new Error('That prize is no longer available.');
  if(claimedCount(rid) >= r.qty) throw new Error('That prize is all claimed.');
  if(balance(uid) < r.cost) throw new Error("You don't have enough points for that yet.");
  const id = 'x' + crypto.randomBytes(5).toString('hex');
  return store.set('redeem:' + id, { id, uid, rid, name: r.name, cost: r.cost, status: 'requested', at: Date.now() });
}
function setStatus(id, status){
  const x = store.get('redeem:' + id);
  if(!x || !['delivered', 'cancelled'].includes(status) || x.status !== 'requested') return;
  store.set('redeem:' + id, { ...x, status, doneAt: Date.now() });
}
function view(uid, isOwner){
  const v = { balance: balance(uid), earned: earned(uid), rewards: rewards().map(r => ({ ...r, left: r.qty - claimedCount(r.id) })),
    mine: store.values('redeem:').filter(r => r.uid === uid).sort((a, b) => b.at - a.at) };
  if(isOwner) v.requests = store.values('redeem:').sort((a, b) => b.at - a.at).slice(0, 100);
  return v;
}
module.exports = { addReward, removeReward, question, claim, setStatus, view, balance };
