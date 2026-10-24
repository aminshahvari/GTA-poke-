// Keeping players who share a home, internet connection or device apart: why two players are linked (linkReason), and
// every linked pair in a field at once (linkPairs, for seating). cx is a club context: { store, linkCache }.
// A link is a shared household (set by the director), a device seen on both accounts in the last 60 days, or an address
// seen on both in the last 14 days, in that order; an answer is kept for 5 s.
const recent = (o, days, now) => Object.entries(o || {}).filter(([, t]) => now - t < days * 864e5).map(([v]) => v);
const share = (x, y) => x.some(v => y.includes(v));
const facts = (u, now) => ({ hh: u.household, devs: recent(u.seen && u.seen.devs, 60, now), ips: recent(u.seen && u.seen.ips, 14, now) });
const reasonOf = (a, b) => a.hh && a.hh === b.hh ? 'same household' : share(a.devs, b.devs) ? 'same device' : share(a.ips, b.ips) ? 'same internet' : null;
const keyOf = (a, b) => a < b ? a + '|' + b : b + '|' + a;
function linkReason(cx, a, b){
  if(a === b) return null;
  const k = keyOf(a, b), c = cx.linkCache.get(k);
  if(c && Date.now() - c.at < 5000) return c.r;
  const ua = cx.store.get('user:' + a), ub = cx.store.get('user:' + b), now = Date.now();
  const r = ua && ub ? reasonOf(facts(ua, now), facts(ub, now)) : null;
  cx.linkCache.set(k, { r, at: Date.now() });
  return r;
}
// Every linked pair among uids, [a, b, reason], with the reason linkReason gives (and through its cache: an answer kept
// from the last 5 s is used, a new one is kept). Near-linear: players are bucketed by household, recent device and recent
// address, and only players who share a bucket are compared, as a link always means a shared bucket. (One exception, for
// 5 s at most: a link linkReason answered and keeps while its facts moved on, say the shared address fell out of a
// player's last six, is not found here; the facts as they now stand are.) Everyone on one address is still every pair.
function linkPairs(cx, uids){
  const now = Date.now(), us = [...new Set(uids)], n = us.length, f = us.map(u => { const x = cx.store.get('user:' + u); return x ? facts(x, now) : null; });
  const buckets = new Map(), seen = new Set(), out = [], many = new Int32Array(n);
  f.forEach((x, i) => { if(x) for(const k of [...(x.hh ? ['h:' + x.hh] : []), ...x.devs.map(d => 'd:' + d), ...x.ips.map(v => 'i:' + v)]){ const b = buckets.get(k); if(b) b.push(i); else buckets.set(k, [i]); } });
  // (a pair in two buckets is looked at once; a pair where either player shares only one bucket with anyone can't be in two)
  for(const b of buckets.values()) if(b.length > 1) for(const i of b) many[i]++;
  for(const b of buckets.values()) for(let p = 0; p < b.length; p++) for(let q = p + 1; q < b.length; q++){
    const i = b[p], j = b[q];
    if(many[i] > 1 && many[j] > 1){ const id = i < j ? i * n + j : j * n + i; if(seen.has(id)) continue; seen.add(id); }
    const k = keyOf(us[i], us[j]), c = cx.linkCache.get(k);
    let r;
    if(c && now - c.at < 5000) r = c.r;
    else { r = reasonOf(f[i], f[j]); cx.linkCache.set(k, { r, at: now }); }
    if(r) out.push([us[i], us[j], r]);
  }
  return out;
}
module.exports = { linkReason, linkPairs };
