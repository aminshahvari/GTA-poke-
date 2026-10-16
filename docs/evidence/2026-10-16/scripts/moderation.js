// Opportunity Club moderation workflow, end to end (evidence item 6). Local only, fake staging seed data only.
// 3 members report a listing -> auto-hidden -> director queue -> dismiss -> visible again, reports marked reviewed;
// director hide -> hidden; unhide; delete -> gone with its requests and reports; members get 403 on queue/moderate.
// Saves every API exchange (tokens redacted) to raw/moderation.json, the relevant kv records to raw/moderation-kv.json,
// screenshots to screens/moderation/.
//
// Usage (from the repository root): node docs/evidence/2026-10-16/scripts/moderation.js [--no-browser]
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const NO_BROWSER = process.argv.includes('--no-browser');
const SCR = path.join(L.EVID, 'screens', 'moderation');
const results = [], screens = [];
const check = (id, label, ok, detail) => { results.push({ id, check: label, ok: !!ok, detail: ok ? '' : String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${label}${ok ? '' : ' :: ' + detail}`); };

(async () => {
  console.log('code:', JSON.stringify(L.codeInfo()));
  const srv = await L.startServer(), base = srv.base;
  const R = new L.Recorder(base);
  const dir = await L.login(R, 'Test Director', '246810');
  const P = {}; for(const n of [7, 8, 9, 10, 11]) P[n] = await L.login(R, L.playerName(n), L.playerPin(n));
  for(const n of [7, 8, 9, 10, 11]) await L.ws(base, P[n]);
  const kv = () => JSON.parse(fs.readFileSync(srv.data, 'utf8'));
  // file mode saves 150 ms after the last change (server/store.js:54), so wait before reading the file
  const kvOf = async (id) => { await L.sleep(500); const d = kv(); return Object.fromEntries(Object.entries(d).filter(([k, v]) => (k === 'opp:' + id) || (k.startsWith('oppreport:') && v.oppId === id) || (k.startsWith('oppreq:') && v.oppId === id))); };
  const snaps = {};
  const browser = !NO_BROWSER;
  if(browser) fs.rmSync(SCR, { recursive: true, force: true });
  const shotDir = async (name, open) => {
    if(!browser) return;
    const p = await L.phonePage(base, dir);
    await L.tab(p, 'biz'); await p.click('.op-seg button:nth-child(2)'); await L.sleep(900);
    if(open !== 'feed'){ await p.click('.op-row.dir'); await L.sleep(900); }
    if(open === 'detail'){ await p.click('.op-q .op-title-btn'); await L.sleep(900); }
    screens.push(await L.shot(p, path.join(SCR, name + '.png'), open !== 'detail'));
    await p.context().close();
  };
  const shotMember = async (tok, name, fn) => { if(!browser) return; const p = await L.phonePage(base, tok); await fn(p); screens.push(await L.shot(p, path.join(SCR, name + '.png'))); await p.context().close(); };

  // a listing by Player 07, and a contact request on it by Player 11 (to show delete removes requests too)
  const X = (await R.call('oppSave', { type: 'offer', title: 'Can help you earn fast cash from home', details: 'Message me for details. (Fake spam listing for the moderation test.)', category: 'finance' }, P[7], 'Player 07 posts a listing')).body.item;
  await R.call('oppRequest', { id: X.id, message: 'What is this about?' }, P[11], 'Player 11 sends a contact request');
  // members cannot use the director endpoints
  const m1 = await R.call('oppReports', {}, P[8], 'member opens the reports queue');
  const m2 = await R.call('oppModerate', { id: X.id, action: 'hide' }, P[8], 'member tries to hide');
  const m3 = await R.call('oppModerate', { id: X.id, action: 'delete' }, P[7], 'poster tries the director delete');
  check('M1', 'members get 403 on oppReports and oppModerate (incl. the poster)', m1.status === 403 && m2.status === 403 && m3.status === 403, [m1, m2, m3].map(x => x.status));

  // three reports
  const reps = [];
  for(const [n, reason, note] of [[8, 'spam', 'Looks like a pitch'], [9, 'scam', ''], [10, 'spam', 'Posted in two chats too']]){
    reps.push(await R.call('oppReport', { id: X.id, reason, note }, P[n], `Player ${n} reports (${reason})`));
    if(reps.length === 2){
      const v = await R.call('oppGet', { id: X.id }, P[11], 'after 2 reports: still visible to members');
      check('M2', 'after 2 reports the listing is still visible', v.status === 200 && v.body.item.state === 'open', v.status);
    }
  }
  check('M3', 'three reports accepted', reps.every(r => r.status === 200), reps.map(r => r.status));
  snaps.afterThreeReports = await kvOf(X.id);
  const g1 = await R.call('oppGet', { id: X.id }, P[11], 'after 3 reports: member opens it');
  const f1 = await R.call('oppList', {}, P[11], 'after 3 reports: member feed');
  const own = await R.call('oppGet', { id: X.id }, P[7], 'after 3 reports: poster opens own listing');
  check('M4', 'auto-hidden at 3 reports: 404 for members, gone from feed, poster sees state "review"', g1.status === 404 && !f1.body.items.some(x => x.id === X.id) && own.body.item && own.body.item.state === 'review', `${g1.status} ${own.body.item && own.body.item.state}`);
  check('M5', 'kv: listing has autoHidden=true, 3 open (unreviewed) reports', snaps.afterThreeReports['opp:' + X.id].autoHidden === true && Object.values(snaps.afterThreeReports).filter(v => v.reason && !v.reviewed).length === 3, JSON.stringify(snaps.afterThreeReports['opp:' + X.id]));
  const r4 = await R.call('oppReport', { id: X.id, reason: 'spam' }, P[11], 'a 4th member tries to report the hidden listing');
  console.log('note: reporting a hidden listing returns', r4.status, r4.body.error);
  const q1 = await R.call('oppReports', {}, dir, 'director: reports queue (before)');
  const qi = (q1.body.items || []).find(x => x.id === X.id);
  check('M6', 'director queue: listing first, state review, 3 reports with reason/note/reporter name', q1.body.items[0] && q1.body.items[0].id === X.id && qi.state === 'review' && qi.reports.length === 3 && qi.reports.map(r => r.by).join() === 'Test Player 08,Test Player 09,Test Player 10', JSON.stringify(qi && qi.reports));
  check('M7', 'queue entries do not expose reporter user ids', qi && qi.reports.every(r => Object.keys(r).sort().join() === 'at,by,note,reason,reasonLabel'), JSON.stringify(qi && qi.reports[0]));
  await shotDir('M-01-director-queue-before-auto-hidden');
  await shotMember(P[7], 'M-02-poster-sees-waiting-for-review', async p => { await L.tab(p, 'biz'); await p.click('.op-seg button:nth-child(2)'); await L.sleep(800); await p.click('.op-tools .op-row'); await L.sleep(900); });
  await shotDir('M-03-director-listing-controls', 'detail');

  // dismiss: back in the feed, reports marked reviewed
  const d = await R.call('oppModerate', { id: X.id, action: 'dismiss' }, dir, 'director dismisses the reports');
  snaps.afterDismiss = await kvOf(X.id);
  const g2 = await R.call('oppGet', { id: X.id }, P[11], 'after dismiss: member opens it');
  const q2 = await R.call('oppReports', {}, dir, 'director: reports queue (after dismiss)');
  check('M8', 'dismiss: visible again (200, open), queue empty', d.status === 200 && g2.status === 200 && g2.body.item.state === 'open' && q2.body.items.length === 0, `${d.status} ${g2.status} queue=${q2.body.items.length}`);
  const revd = Object.values(snaps.afterDismiss).filter(v => v.reason);
  check('M9', 'kv: the 3 reports are kept and marked reviewed=true; autoHidden=false', revd.length === 3 && revd.every(v => v.reviewed === true) && snaps.afterDismiss['opp:' + X.id].autoHidden === false, JSON.stringify(revd.map(v => v.reviewed)));
  const again = await R.call('oppReport', { id: X.id, reason: 'spam' }, P[8], 'after dismiss: an earlier reporter reports again');
  console.log('note: an earlier reporter reporting again after dismiss returns', again.status, again.body.error);
  await shotDir('M-04-director-queue-after-dismiss-all-clear');
  await shotMember(P[11], 'M-05-member-feed-listing-visible-again', async p => { await L.tab(p, 'biz'); await p.click('.op-seg button:nth-child(2)'); await L.sleep(900); });

  // director hide, then unhide
  const h = await R.call('oppModerate', { id: X.id, action: 'hide' }, dir, 'director hides');
  const g3 = await R.call('oppGet', { id: X.id }, P[11], 'after hide: member opens it');
  const own3 = await R.call('oppGet', { id: X.id }, P[7], 'after hide: poster opens it');
  const q3 = await R.call('oppReports', {}, dir, 'director: queue after hide');
  check('M10', 'hide: 404 for members, poster sees "hidden", listed in queue as hidden', h.status === 200 && g3.status === 404 && own3.body.item.state === 'hidden' && q3.body.items.some(x => x.id === X.id && x.state === 'hidden'), `${g3.status} ${own3.body.item && own3.body.item.state}`);
  const ownEdit = await R.call('oppSave', { id: X.id, type: 'offer', title: 'Edited while hidden', category: 'finance' }, P[7], 'poster edits while hidden');
  const g3b = await R.call('oppGet', { id: X.id }, P[11], 'after poster edit: still hidden for members');
  check('M11', 'poster editing does not lift a director hide', ownEdit.status === 200 && g3b.status === 404, `${ownEdit.status} ${g3b.status}`);
  await shotDir('M-06-director-queue-hidden');
  const u = await R.call('oppModerate', { id: X.id, action: 'unhide' }, dir, 'director shows it again');
  const g4 = await R.call('oppGet', { id: X.id }, P[11], 'after unhide: member opens it');
  check('M12', 'unhide: visible again', u.status === 200 && g4.status === 200, `${u.status} ${g4.status}`);
  const badAct = await R.call('oppModerate', { id: X.id, action: 'nuke' }, dir, 'unknown action');
  check('M13', 'unknown moderation action is 400', badAct.status === 400, badAct.status);

  // delete
  snaps.beforeDelete = await kvOf(X.id);
  const del = await R.call('oppModerate', { id: X.id, action: 'delete' }, dir, 'director deletes');
  snaps.afterDelete = await kvOf(X.id);
  const g5 = await R.call('oppGet', { id: X.id }, P[7], 'after delete: poster opens it');
  const s11 = await R.call('oppMine', {}, P[11], 'after delete: requester sent list');
  check('M14', 'delete: 404 even for the poster; listing, its request and its reports removed from kv', del.status === 200 && g5.status === 404 && Object.keys(snaps.afterDelete).length === 0 && Object.keys(snaps.beforeDelete).some(k => k.startsWith('oppreq:')) && !(s11.body.sent || []).some(x => x.oppId === X.id), `${del.status} ${g5.status} kv=${Object.keys(snaps.afterDelete).length}`);
  const del2 = await R.call('oppModerate', { id: X.id, action: 'delete' }, dir, 'delete again');
  check('M15', 'moderating a deleted listing is 404', del2.status === 404, del2.status);

  R.save(path.join(L.EVID, 'raw', 'moderation.json'));
  fs.writeFileSync(path.join(L.EVID, 'raw', 'moderation-kv.json'), JSON.stringify(L.redact(snaps), null, 2) + '\n');
  await L.closeBrowser();
  console.log('\n' + L.table(results));
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed. Raw: raw/moderation.json, raw/moderation-kv.json. Screens: ${screens.join(', ')}`);
  L.stopAll(); process.exit(fails ? 1 : 0);
})().catch(async e => { console.error('ERROR', e); await L.closeBrowser(); L.stopAll(); process.exit(2); });
