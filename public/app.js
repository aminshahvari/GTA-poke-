(() => {
'use strict';
const E = Engine;
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('en-US');
const ord = n => n + (['th','st','nd','rd'][(n % 100 - 20) % 10] || ['th','st','nd','rd'][n % 100] || 'th');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const local = {
  get(k, d){ try{ const v = localStorage.getItem('stacked:' + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('stacked:' + k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem('stacked:' + k); }catch(e){} }
};
const showScreen = id => ['auth','lobby','game'].forEach(s => $(s).hidden = s !== id);

// ---------- start-screen art ----------
(function drawGlobe(){
  const c = $('globe'), x = c.getContext('2d'), W = 900, R = 420;
  const g = x.createRadialGradient(W/2, W/2, 40, W/2, W/2, R);
  g.addColorStop(0, 'rgba(120,170,255,.45)'); g.addColorStop(.5, 'rgba(46,107,207,.25)'); g.addColorStop(1, 'rgba(22,26,35,0)');
  x.fillStyle = g; x.beginPath(); x.arc(W/2, W/2, R, 0, Math.PI*2); x.fill();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const pts = [];
  for(let i = 0; i < 70; i++){ const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R * .85; pts.push([W/2 + Math.cos(a)*r, W/2 + Math.sin(a)*r*.8]); }
  x.strokeStyle = 'rgba(180,205,255,.16)';
  pts.forEach((p, i) => pts.slice(i+1).forEach(q => { if(Math.hypot(p[0]-q[0], p[1]-q[1]) < 120){ x.beginPath(); x.moveTo(...p); x.lineTo(...q); x.stroke(); } }));
  pts.forEach(p => { x.fillStyle = 'rgba(200,220,255,.8)'; x.beginPath(); x.arc(p[0], p[1], 2 + rnd()*2.5, 0, Math.PI*2); x.fill(); });
})();

function modal(html, buttons){
  return new Promise(res => {
    const root = $('modalRoot');
    root.innerHTML = `<div class="modal"><div class="glass">${html}<div class="row">${buttons.map((b, i) => `<button class="${b.primary ? 'btn-red' : 'btn-ghost'}" data-i="${i}">${b.label}</button>`).join('')}</div></div></div>`;
    root.querySelectorAll('[data-i]').forEach(btn => btn.onclick = () => { root.innerHTML = ''; res(buttons[+btn.dataset.i].value); });
    root.querySelectorAll('[data-v]').forEach(btn => btn.onclick = () => { root.innerHTML = ''; res(btn.dataset.v); });
  });
}

// ---------- sign in ----------
async function post(path, body){
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (local.get('token', '') || '') }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: 'The club server did not answer. Try again.' }));
  if(j.error) throw new Error(j.error);
  return j;
}
function authScreen(mode){
  showScreen('auth');
  const f = $('authForm');
  const invite = location.pathname.startsWith('/join/') ? location.pathname.slice(6) : null;
  if(invite && mode !== 'login') mode = 'join';
  const titles = { join: "You're invited to the club", login: 'Welcome back', setup: 'Set up your club', reset: 'Reset the owner PIN' };
  const blurbs = { join: 'Pick the name your friends will see at the table, and a PIN to sign in with.', login: 'Sign in with your table name and PIN.', setup: 'Enter the setup code, then pick your name and PIN. You become the club owner.', reset: 'For the club owner: enter the setup code from when you created the club, then pick a new PIN. Members who forgot their PIN can ask the owner.' };
  f.innerHTML = `<h2>${titles[mode]}</h2><p>${blurbs[mode]}</p>
    ${mode === 'setup' || mode === 'reset' ? '<div class="field"><label for="aCode">Setup code</label><input id="aCode" autocomplete="off"></div>' : ''}
    ${mode === 'reset' ? '' : '<div class="field"><label for="aName">Table name</label><input id="aName" maxlength="16" autocomplete="username" placeholder="e.g. Sean"></div>'}
    <div class="field"><label for="aPin">${mode === 'reset' ? 'New PIN' : 'PIN'} (4 to 8 digits)</label><input id="aPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></div>
    ${mode === 'join' || mode === 'setup' ? '<label class="agree"><input type="checkbox" id="aAgree"> <span>I\'m 19 or older and agree to the <button type="button" class="linkbtn" id="termsLink">club rules and prize terms</button>. Free to play; chips and points have no cash value.</span></label>' : ''}
    <div class="err" id="aErr"></div>
    <button class="btn-red" type="submit">${mode === 'join' ? 'Join the club' : mode === 'setup' ? 'Create my club' : mode === 'reset' ? 'Save new PIN' : 'Sign in'}</button>
    ${mode === 'login' ? '<button type="button" class="linkbtn" id="toReset">Forgot your PIN?</button><span class="fine">New here? Ask the club owner for an invite link.</span>' : '<button type="button" class="linkbtn" id="toLogin">I already have an account</button>'}`;
  const tl = $('toLogin'); if(tl) tl.onclick = () => authScreen('login');
  const tr = $('toReset'); if(tr) tr.onclick = () => authScreen('reset');
  const tm = $('termsLink'); if(tm) tm.onclick = () => modal(`<h2>Club rules and prize terms</h2><div class="terms-modal">${window.LEARN.terms}</div>`, [{ label: 'Close', value: 1, primary: true }]);
  f.onsubmit = async e => {
    e.preventDefault();
    $('aErr').textContent = '';
    try{
      if(mode === 'reset'){
        const r = await post('/api/resetOwner', { code: $('aCode').value.trim(), pin: $('aPin').value });
        local.set('token', r.token);
        await modal(`<h2>New PIN saved</h2><p>Your table name is <b>${esc(r.name)}</b>. Sign in with it and your new PIN next time.</p>`, [{ label: 'OK', value: 1, primary: true }]);
        connect(); return;
      }
      const body = { name: $('aName').value, pin: $('aPin').value, agree: !!($('aAgree') && $('aAgree').checked) };
      if(mode === 'join') local.set('askRemind', 1);
      const r = mode === 'join' ? await post('/api/redeem', { ...body, code: invite }) : mode === 'setup' ? await post('/api/setup', { ...body, code: $('aCode').value.trim() }) : await post('/api/login', body);
      local.set('token', r.token);
      if(location.pathname !== '/') history.replaceState(null, '', '/');
      connect();
    }catch(err){ $('aErr').textContent = err.message; }
  };
}

// ---------- connection ----------
let ws = null, club = null, retry = 0;
const tables = new Map();
const myCards = new Map(); // tid -> {hand, cards}
let tab = 'event', view = 'lobby', watchTid = null, lastSent = null, seen = new Set(), lastStatus = null, lastMyTable = null, clockSkew = 0;
function connect(){
  const token = local.get('token', null);
  if(!token && location.pathname.startsWith('/join/')) return authScreen('join');
  if(!token){ return post('/api/status', {}).then(s => authScreen(s.hasOwner ? 'login' : 'setup')).catch(() => authScreen('login')); }
  if(ws) try{ ws.close(); }catch(e){}
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => { retry = 0; let dev = local.get('device', null); if(!dev){ dev = Math.random().toString(36).slice(2) + Date.now().toString(36); local.set('device', dev); } ws.send(JSON.stringify({ t: 'hello', token, device: dev })); };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if(m.t === 'auth'){ if(!m.ok){ local.del('token'); ws.onclose = null; ws.close(); authScreen('login'); } else { $('offline').hidden = true; if(view === 'lobby') showScreen('lobby'); if(watchTid) send({ t: 'watch', tid: watchTid }); } return; }
    if(m.t === 'club'){ onClub(m.club); return; }
    if(m.t === 'table'){ tables.set(m.table.tid, m.table); if(m.you) myCards.set(m.table.tid, m.you); onTable(m.table); return; }
    if(m.t === 'closed'){ tables.delete(m.tid); if(view === 'table') renderTable(); return; }
    if(m.t === 'invite'){ showInvite(m.code, m.group, m.max); return; }
    if(m.t === 'skillq'){ askSkill(m.rid, m.q); return; }
    if(m.t === 'claimed'){ modal('<h2>Prize claimed 🎉</h2><p>The organizer has been told and will get it to you. You can follow it under Prizes.</p>', [{ label: 'Great', value: 1, primary: true }]); return; }
    if(m.t === 'hands'){ myHands = m.hands; if(view === 'lobby' && tab === 'learn') renderLobby(); return; }
    if(m.t === 'chat'){ onChat(m.msg); return; }
    if(m.t === 'profile'){ showProfile(m.profile); return; }
    if(m.t === 'coach'){ onCoach(m.hand); return; }
    if(m.t === 'report'){ showReport(m.report); return; }
    if(m.t === 'chatlog'){ chatLogs.set(m.tid, m.log); if(chatOpen) renderChat(); return; }
    if(m.t === 'chaterr'){ toast(m.error); return; }
    if(m.t === 'fair'){ showFair(m.report); return; }
    if(m.t === 'error'){ modal(`<h2>That didn't work</h2><p>${esc(m.error)}</p>`, [{ label: 'OK', value: 1, primary: true }]); }
  };
  ws.onclose = () => { $('offline').hidden = false; setTimeout(connect, Math.min(8000, 500 * 2 ** retry++)); };
}
const send = m => { if(ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

function onClub(c){
  club = c; clockSkew = c.now - Date.now();
  if(local.get('askRemind', 0)){ local.del('askRemind'); if(c.tourney && c.tourney.status === 'registering' && c.tourney.regs.includes(c.me.id)){ setTimeout(() => toast(`You're signed up for ${c.tourney.name}.`), 300); setTimeout(offerReminder, 1500); } }
  $('meChip').innerHTML = `<button class="me-btn" id="meBtn">${avHTML(c.me.id, c.me.name, 'sm')}<span>${esc(c.me.name)}</span></button><button class="back" id="outBtn">Sign out</button>`;
  $('meBtn').onclick = () => openProfile(c.me.id);
  $('outBtn').onclick = async () => { if(await modal('<h2>Sign out?</h2><p>You can sign back in with your name and PIN.</p>', [{ label:'Stay', value:false }, { label:'Sign out', value:true, primary:true }])){ local.del('token'); location.href = '/'; } };
  $('dirTab').hidden = !c.me.owner;
  const st = c.tourney && c.tourney.status;
  if(st === 'finished' && lastStatus === 'running'){ view = 'lobby'; watchTid = null; showScreen('lobby'); tab = 'event'; celebrate(); }
  lastStatus = st;
  if(c.myTable && c.myTable !== lastMyTable && st === 'running'){ watchTid = c.myTable; view = 'table'; seen = new Set(); showScreen('game'); send({ t: 'watch', tid: watchTid }); }
  lastMyTable = c.myTable;
  const typing = document.activeElement && $('lobbyBody').contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if(view === 'lobby'){ showScreen('lobby'); if(tab !== 'learn' && !typing) renderLobby(); } else renderTable();
}
function onTable(d){ if(view === 'table' && d.tid === (watchTid || club.myTable)) renderTable(); }

// ---------- lobby ----------
$('lobbyBody').addEventListener('click', e => {
  if(e.target.closest('[data-kick]')) return;
  const t = e.target.closest('[data-prof]'); if(t) openProfile(t.dataset.prof);
});
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(!b) return; tab = b.dataset.tab; if(tab === 'learn'){ openHand = null; send({ t: 'hands' }); } renderLobby(); $('lobbyBody').scrollTop = 0; });
const nameOf = uid => { const m = club.members.find(x => x.id === uid); if(m) return m.name; for(const h of club.history) for(const r of h.results) if(r.uid === uid) return r.name; return 'Former member'; };
const pchip = (uid, removable) => `<span class="pchip ${uid === club.me.id ? 'me' : ''}" data-prof="${esc(uid)}">${avHTML(uid, nameOf(uid), 'xs')}${esc(nameOf(uid))}${removable ? `<button data-kick="${esc(uid)}" aria-label="Remove from tournament">×</button>` : ''}</span>`;
const when = ms => new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function renderLobby(){
  if(!club) return;
  document.querySelectorAll('#tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  const body = $('lobbyBody');
  body.innerHTML = tab === 'board' ? boardHTML() : tab === 'learn' ? learnHTML() : tab === 'director' && club.me.owner ? directorHTML() : picNudgeHTML() + eventHTML() + friendsHTML();
  wireLobby();
}
// Start times for a quick tournament: now, or a time later today (tomorrow if it has passed).
function startChoices(){
  const out = [['', 'When I press Start']], now = Date.now();
  for(const h of [18, 19, 20, 21, 22, 23]){
    const d = new Date(); d.setHours(h, 0, 0, 0); if(d.getTime() < now + 10 * 60000) d.setDate(d.getDate() + 1);
    out.push([d.getTime(), `${d.getDate() === new Date().getDate() ? 'Today' : 'Tomorrow'} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`]);
  }
  return out;
}
function friendsHTML(){
  if(club.me.owner || !club.membersInvite) return '';
  const n = club.invitedCount || 0, mi = club.myInvite;
  return `<div class="card-box friends-box"><span class="eyebrow">Grow the club</span><h3>Invite your poker friends</h3>
    <p>Share your own link on WhatsApp, Telegram or by text. Friends join free with their own name and PIN.${n ? ` <b>${n} ${n === 1 ? 'friend has' : 'friends have'} joined with your link.</b>` : ''}${mi ? ` Your link: ${mi.used} of ${mi.max} used.` : ''}</p>
    <div class="btn-row"><button class="btn red big" data-invite>Invite friends</button></div></div>`;
}
document.addEventListener('click', e => { if(e.target.closest('[data-invite]')) askInvite(); });
function picNudgeHTML(){
  const m = memberOf(club.me.id);
  if(!m || m.av || local.get('picNudge', 0) > 2) return '';
  return `<div class="card-box pic-nudge">${avHTML(club.me.id, club.me.name, 'big')}<div><b>Add your picture</b><p>A photo or avatar shows at the table, so everyone knows who they're playing.</p>
    <div class="btn-row"><button class="btn red" data-pic>Add picture</button><button class="btn" data-picno>Later</button></div></div></div>`;
}
document.addEventListener('click', e => {
  if(e.target.closest('[data-pic]')) pickAvatar();
  if(e.target.closest('[data-picno]')){ local.set('picNudge', local.get('picNudge', 0) + 1); renderLobby(); }
});
function ownerNextHTML(){
  const T = club.tourney;
  if(!club.me.owner || (T && ['registering', 'running'].includes(T.status))) return '';
  const name = T ? T.name : `${new Date().toLocaleDateString('en-US', { weekday: 'long' })} Night Tournament`;
  return `<div class="card-box next-box"><span class="eyebrow">Organizer</span><h3>Start the next tournament</h3>
    <p>${T ? `Same settings as last time: ${fmt(T.stack)} chips, ${T.levelMin}-minute levels, ${T.actSec || 20} seconds to act, ${T.anteMode === 'each' ? 'every player antes' : 'big blind ante'}${T.lateLevels ? `, late registration to level ${T.lateLevels}` : ''}.` : 'Opens registration so your friends can join.'}</p>
    <label class="start-pick">Starts<select id="againAt">${startChoices().map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
    <div class="btn-row"><button class="btn red big" id="againBtn">${T ? 'Play again' : 'Open a tournament'}</button><button class="btn" id="newCustomBtn">Change settings</button></div></div>`;
}
function eventHTML(){
  return ownerNextHTML() + eventMainHTML();
}
function eventMainHTML(){
  const T = club.tourney;
  if(!T || ['cancelled', 'finished'].includes(T.status) && !club.history.length && T.status !== 'finished'){
    return `<div class="card-box"><span class="status-pill idle">Nothing scheduled</span><h3>No tournament open right now</h3>
      <p>${club.me.owner ? 'Tap Open a tournament above to start one.' : 'When the club owner opens the next tournament, it shows up here and you can join.'}</p>${T && T.note ? `<p class="note">${esc(T.note)}</p>` : ''}</div>`;
  }
  if(T.status === 'registering'){
    const mine = T.regs.includes(club.me.id);
    return `<div class="card-box"><span class="status-pill">Registration open</span><h3>${esc(T.name)}</h3>
      <div class="kv num"><div><small>Starts</small><b>${T.startAt ? esc(when(T.startAt)) : 'When the owner starts it'}</b></div><div><small>Stack</small><b>${fmt(T.stack)}</b></div><div><small>Levels</small><b>${T.levelMin} min</b></div></div>
      <p class="note">${T.tableSize === 6 ? '6-max tables' : `${T.tableSize || 9} players per table`}: a new table opens for every ${T.tableSize || 9} players and tables merge down to the final table. ${T.lateLevels ? `Late registration stays open until the end of level ${T.lateLevels}. ` : ''}${T.anteMode === 'each' ? 'Every player posts an ante each hand' : 'The big blind posts the ante for the table (WSOP/WPT style)'} · ${T.actSec || 20} seconds to act. Every player has 3 extra-time cards (+30 seconds each) for the tournament, and a fresh 5 at the final table.</p>
      ${T.repeat !== 'none' ? `<p class="note">Repeats ${T.repeat === 'daily' ? 'every day' : 'every week'} at this time.</p>` : ''}
      <p>${T.regs.length} joined</p>
      <div class="plist">${T.regs.map(u => pchip(u, false)).join('') || '<span class="note">Nobody has joined yet.</span>'}</div>
      <div class="btn-row">${mine ? '<button class="btn" id="leaveBtn">Leave</button>' : '<button class="btn red" id="joinBtn">Join tournament</button>'}</div>
      ${mine ? `<p>You're in. Your table opens by itself when the tournament starts.</p>${remindHTML(T)}` : ''}
      ${club.me.owner ? `<div class="owner-row"><button class="btn" id="inviteBtn">Invite a friend</button><button class="btn red" id="startBtn" ${T.regs.length < 2 ? 'disabled' : ''}>Start now</button></div>
      ${T.regs.length < 2 ? '<p class="warn-note">You need at least 2 players to start. Send an invite, and ask your friend to tap <b>Join tournament</b>.</p>' : ''}` : ''}</div>${lastResultHTML()}`;
  }
  if(T.status === 'running'){
    const out = (T.places || []).find(r => r.uid === club.me.id);
    const [sb, bb] = E.levelFor(T.level, T.anteMode);
    return `<div class="card-box"><span class="status-pill live">Live</span><h3>${esc(T.name)}</h3>
      <div class="kv num"><div><small>Players left</small><b>${T.remaining} of ${T.entrants}</b></div><div><small>Level</small><b>${T.level + 1}</b></div><div><small>Blinds</small><b>${fmt(sb)}/${fmt(bb)}</b></div></div>
      ${club.myTable ? `<button class="btn red" data-watch="${esc(club.myTable)}">Go to my table</button>` : out ? `<p>You finished ${ord(out.place)}. You can still watch.</p>`
        : T.lateOpen ? `<p>Late registration is open until the end of level ${T.lateLevels}. You start with ${fmt(T.stack)} chips.</p><button class="btn red" id="joinBtn">Join now</button>` : '<p>You are not playing in this one. You can watch any table.</p>'}
      ${T.lateOpen && club.me.owner ? `<p class="note">Late registration open until the end of level ${T.lateLevels}. <a href="#" id="lateInvite">Invite more players</a></p>` : ''}
      <div class="table-list">${club.tables.map(t => `<div class="trow"><b>Table ${t.n}</b><small>${t.players} players</small><button class="back" data-watch="${esc(t.tid)}">Watch</button></div>`).join('')}</div>
      ${T.seal ? `<p class="note seal">🔒 Shuffle seal <code>${esc(T.seal.slice(0, 16))}</code> · <a href="#" data-sealinfo>what's this?</a></p>` : ''}</div>`;
  }
  return `${T.status === 'cancelled' ? `<div class="card-box"><span class="status-pill idle">Cancelled</span><h3>${esc(T.name)}</h3><p>${esc(T.note || 'The owner cancelled this tournament.')}</p></div>` : ''}${lastResultHTML(T.status === 'finished')}`;
}
function lastResultHTML(primary){
  const h = club.history[0]; if(!h) return '';
  return `<div class="card-box"><span class="eyebrow">${primary ? 'Final results' : 'Last tournament'}</span><h3>${esc(h.name)}</h3>
    <p>${h.entrants} players · ${new Date(h.endedAt).toLocaleDateString()} · Champion: ${esc(h.results[0] ? h.results[0].name : '')}</p>
    <table class="tbl dark"><thead><tr><th>Place</th><th>Player</th><th>Payout</th><th>Points</th></tr></thead><tbody>
    ${h.results.map(r => `<tr class="${r.uid === club.me.id ? 'me' : ''}"><td>${ord(r.place)}${r.tie ? ' <small>tie</small>' : ''}</td><td>${esc(r.name)}</td><td>${r.tie ? (() => { const s = Array.from({ length: r.tie }, (_, k) => (h.payouts && h.payouts[r.place - 1 + k]) || 0).reduce((a, b) => a + b, 0); return s ? Math.round(s / r.tie * 10) / 10 + '%' : '–'; })() : h.payouts && h.payouts[r.place - 1] ? h.payouts[r.place - 1] + '%' : '–'}</td><td class="num">${r.pts}</td></tr>`).join('')}</tbody></table>
    <div class="btn-row">${h.results.some(r => r.uid === club.me.id) ? `<button class="btn red" data-report="${esc(h.id)}">📋 Your report card</button>` : ''}${h.fairSeed ? `<button class="btn" data-fair="${esc(h.id)}">🔒 Check the shuffle</button>` : ''}</div></div>`;
}
let boardRange = 'all', boardSeg = 'board';
function prizesHTML(){
  const sh = club.shop || { balance: 0, rewards: [], mine: [] };
  const seg = `<div class="seg2">${[['board','Leaderboard'],['prizes','Prizes']].map(([k, l]) => `<button data-bseg="${k}" aria-pressed="${boardSeg === k}">${l}</button>`).join('')}</div>`;
  const st = { requested: 'Waiting for the organizer', delivered: 'Delivered', cancelled: 'Cancelled, points returned' };
  return `${seg}<div class="card-box"><span class="eyebrow">Your points</span><div class="bigpts">${fmt(sh.balance)}<small>points to spend · ${fmt(sh.earned || 0)} earned in total</small></div>
    <p class="note">Prizes are bought by the organizer. Points can't be bought, sold, transferred or cashed out. To claim, answer a quick math question.</p></div>
    <div class="card-box"><span class="eyebrow">Prize list</span>${sh.rewards.length ? `<div class="table-list">${sh.rewards.map(r => `<div class="trow prize"><div><b>${esc(r.name)}</b><small>${r.value ? 'About ' + esc(r.value) + ' · ' : ''}${r.left} of ${r.qty} left${r.note ? ' · ' + esc(r.note) : ''}</small></div>
      <button class="btn ${sh.balance >= r.cost && r.left > 0 ? 'red' : ''}" data-claim="${esc(r.id)}" ${sh.balance >= r.cost && r.left > 0 ? '' : 'disabled'}>${fmt(r.cost)} pts</button></div>`).join('')}</div>` : '<div class="empty">No prizes listed yet. The organizer adds them.</div>'}</div>
    ${sh.mine.length ? `<div class="card-box"><span class="eyebrow">Your claims</span><div class="table-list">${sh.mine.map(x => `<div class="trow"><b>${esc(x.name)}</b><small>${fmt(x.cost)} pts · ${new Date(x.at).toLocaleDateString()} · ${st[x.status] || x.status}</small></div>`).join('')}</div></div>` : ''}`;
}
async function askSkill(rid, q){
  let ans = '';
  const p = modal(`<h2>Skill-testing question</h2><p>Answer without help to claim your prize. Do × and ÷ before + and −.</p><div class="skillq">${esc(q)} = ?</div><input id="skillA" class="sel" inputmode="numeric" autocomplete="off">`, [{ label: 'Cancel', value: null }, { label: 'Claim prize', value: 'go', primary: true }]);
  $('skillA').oninput = e => ans = e.target.value; $('skillA').focus();
  if(await p === 'go') send({ t: 'claim', rid, answer: ans });
}
function prizeAdminHTML(){
  const sh = club.shop || { rewards: [], requests: [] };
  const open = (sh.requests || []).filter(x => x.status === 'requested');
  return `<div class="card-box"><span class="eyebrow">Prizes</span>
    <form class="form" id="rewardForm"><label>Prize<input id="rwName" maxlength="60" placeholder="e.g. $25 Tim Hortons gift card"></label>
    <div class="two"><label>Points<input id="rwCost" type="number" min="1" inputmode="numeric" placeholder="100"></label><label>Quantity<input id="rwQty" type="number" min="1" value="1" inputmode="numeric"></label></div>
    <label>Approximate value<input id="rwValue" maxlength="30" placeholder="$25"></label>
    <button class="btn red" type="submit">Add prize</button></form>
    ${sh.rewards.length ? `<div class="table-list">${sh.rewards.map(r => `<div class="trow"><b>${esc(r.name)}</b><small>${fmt(r.cost)} pts · ${r.left}/${r.qty} left${r.value ? ' · ' + esc(r.value) : ''}</small><button class="back" data-rmrw="${esc(r.id)}">Remove</button></div>`).join('')}</div>` : ''}
    <p class="note">You buy and pay for every prize yourself. Never charge members anything, and never sell or cash out points. That keeps the club a free social game.</p></div>
    ${open.length ? `<div class="card-box warn"><span class="eyebrow">Prize claims to hand out · ${open.length}</span><div class="table-list">${open.map(x => `<div class="trow"><b>${esc(nameOf(x.uid))}</b><small>${esc(x.name)} · ${new Date(x.at).toLocaleDateString()}</small><span class="row-btns"><button class="back" data-rdone="${esc(x.id)}">Delivered</button><button class="back" data-rcancel="${esc(x.id)}">Cancel</button></span></div>`).join('')}</div></div>` : ''}`;
}
function boardHTML(){
  const since = boardRange === 'week' ? Date.now() - 7 * 864e5 : boardRange === 'month' ? Date.now() - 30 * 864e5 : 0;
  const agg = new Map();
  club.history.filter(h => h.endedAt >= since).forEach(h => h.results.forEach(r => {
    const a = agg.get(r.uid) || { uid: r.uid, pts: 0, played: 0, wins: 0, cashes: 0 };
    a.pts += r.pts; a.played++; if(r.place === 1) a.wins++; if(h.payouts && h.payouts[r.place - 1]) a.cashes++;
    agg.set(r.uid, a);
  }));
  const rows = [...agg.values()].sort((a, b) => b.pts - a.pts || b.wins - a.wins);
  if(boardSeg === 'prizes') return prizesHTML();
  return `<div class="seg2">${[['board','Leaderboard'],['prizes','Prizes']].map(([k, l]) => `<button data-bseg="${k}" aria-pressed="${boardSeg === k}">${l}</button>`).join('')}</div><div class="card-box"><span class="eyebrow">Club leaderboard</span>
    <div class="seg2 small">${[['week','This week'],['month','30 days'],['all','All time']].map(([k, l]) => `<button data-range="${k}" aria-pressed="${boardRange === k}">${l}</button>`).join('')}</div>
    ${rows.length ? `<table class="tbl dark"><thead><tr><th>#</th><th>Player</th><th>Played</th><th>Wins</th><th>Cashes</th><th>Points</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.uid === club.me.id ? 'me' : ''}"><td>${i + 1}</td><td><span class="lb-name" data-prof="${esc(r.uid)}">${avHTML(r.uid, nameOf(r.uid), 'xs')}${esc(nameOf(r.uid))}</span></td><td class="num">${r.played}</td><td class="num">${r.wins}</td><td class="num">${r.cashes}</td><td class="num">${r.pts}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No finished tournaments in this period yet.</div>'}
    <p class="note">Tap a player to see their profile: skill tier, results and how they play.</p><p class="note">Points reward winning: places in the money earn payout % × players ÷ 10 (winning a 9-player tournament is 45 points), everyone else gets 1 for playing. Spend them on prizes under Prizes.</p></div>
    ${club.history.length ? `<div class="card-box"><span class="eyebrow">Past tournaments</span><div class="table-list">${club.history.slice(0, 30).map(h => `<div class="trow"><b>${esc(h.name)}</b><small>${new Date(h.endedAt).toLocaleDateString()} · ${h.entrants} players · ${esc(h.results[0] ? h.results[0].name : '')}</small></div>`).join('')}</div></div>` : ''}`;
}
function conflictsHTML(){
  const cs = club.conflicts || []; if(!cs.length) return '';
  return `<div class="card-box warn"><span class="eyebrow">Same table warning</span>
    <p>${cs.length === 1 ? 'These players' : 'These pairs'} share a home, an internet connection or a phone. ${club.tourney && club.tourney.status === 'running' ? 'There are not enough tables to split them.' : 'They will be seated at different tables when there are 2 or more tables; with one table they will sit together.'}</p>
    <ul class="acts">${cs.map(c => `<li>${esc(nameOf(c.a))} & ${esc(nameOf(c.b))} <small>${esc(c.reason)} · ${esc(c.where)}</small></li>`).join('')}</ul></div>`;
}
function newsHTML(){
  const news = (window.LEARN && window.LEARN.news) || []; if(!news.length) return '';
  return `<details class="card-box news"><summary><span class="eyebrow">What's new</span><b>Latest changes · ${esc(news[0].date)}</b></summary>
    ${news.map(n => `<h4>${esc(n.date)}</h4><ul>${n.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}</details>`;
}
const demoCard = () => `<div class="card-box demo-box"><span class="eyebrow">Demo</span><h3>Try a practice table</h3>
  <p>Play a real game at a 6-max table against 5 practice players, with the same buttons, chat bubbles, antes and clock as a club tournament. It runs only on your phone: nothing is saved and no points are given.</p>
  <div class="btn-row"><button class="btn red big" data-demo>Open demo table</button></div></div>`;
function directorHTML(){
  return newsHTML() + demoCard() + conflictsHTML() + directorMainHTML() + prizeAdminHTML();
}
function directorMainHTML(){
  const T = club.tourney;
  const members = `<div class="card-box"><span class="eyebrow">Members · ${club.members.length}</span>
    <div class="btn-row"><button class="btn red" id="inviteBtn">Create invite link</button><button class="btn" id="memInvBtn">${club.membersInvite ? 'Members can invite: on' : 'Members can invite: off'}</button></div>
    <p class="note">Pick a <b>group link</b> for a WhatsApp or Telegram group (up to 100 people, 30 days; it stays the same link until you cancel it), or a <b>personal link</b> for one friend. They open it, pick a name and PIN, and they're in.</p>
    ${club.invites && club.invites.length ? `<div class="table-list">${club.invites.map(i => `<div class="trow"><b>${i.multi ? (i.by && i.by !== club.me.id ? esc(nameOf(i.by)) + "'s link" : 'Group link') : 'Unused invite'}</b><small>${i.multi ? `${i.used} of ${i.max} joined · until ${new Date(i.expiresAt).toLocaleDateString()}` : new Date(i.createdAt).toLocaleDateString()}</small><button class="back" data-copy="${esc(i.code)}" data-group="${i.multi ? 1 : ''}">Copy</button><button class="back" data-revoke="${esc(i.code)}">Cancel</button></div>`).join('')}</div>` : ''}
    <div class="table-list">${club.members.map(m => { const hh = club.households && club.households[m.id], mates = hh ? club.members.filter(x => x.id !== m.id && club.households[x.id] === hh).map(x => x.name) : [];
      return `<div class="trow"><b>${esc(m.name)}</b><small>${m.role === 'owner' ? 'Owner' : 'Member since ' + new Date(m.createdAt).toLocaleDateString()}${m.invitedBy && m.invitedBy !== club.me.id ? ' · invited by ' + esc(nameOf(m.invitedBy)) : ''}${mates.length ? ` · Home with ${esc(mates.join(', '))}` : ''}</small><span class="row-btns">${m.role === 'owner' ? '' : `<button class="back" data-mute="${esc(m.id)}" data-on="${(club.mutedIds || []).includes(m.id) ? 1 : 0}">${(club.mutedIds || []).includes(m.id) ? 'Unmute' : 'Mute'}</button>`}<button class="back" data-home="${esc(m.id)}">Home</button>${m.role === 'owner' ? '' : `<button class="back" data-remove="${esc(m.id)}">Remove</button>`}</span></div>`; }).join('')}</div>
    <div class="btn-row"><button class="btn" id="chatOffBtn">${club.chatOff ? 'Turn table chat on' : 'Turn table chat off'}</button></div>
    <p class="note">Table chat is ${club.chatOff ? '<b>off</b>' : '<b>on</b>'}. <b>Mute</b> stops one person from chatting or throwing things.</p>
    <p class="note">Use <b>Home</b> to mark people who live together (for example a couple). They're never seated at the same table. Players on the same internet or the same phone are kept apart automatically.</p></div>`;
  if(!T || ['finished', 'cancelled'].includes(T.status)){
    const d = new Date(Date.now() + 864e5); d.setHours(20, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return `<div class="card-box"><span class="eyebrow">New tournament</span>
      <form class="form" id="newForm">
        <label>Name<input id="nName" maxlength="40" value="${esc(new Date().toLocaleDateString('en-US', { weekday: 'long' }))} Night Tournament"></label>
        <div class="two"><label>Starting stack<select id="nStack"><option>10000</option><option>20000</option><option selected>30000</option><option>50000</option><option value="60000">60000 (WSOP Main Event)</option></select></label>
        <label>Level length<select id="nLevel"><option value="5">5 min</option><option value="10">10 min</option><option value="15">15 min</option><option value="20" selected>20 min</option><option value="30">30 min</option></select></label></div>
        <div class="two"><label>Players per table<select id="nSize"><option value="9" selected>9 (WSOP/WPT)</option></select></label>
        <label>Late registration<select id="nLate"><option value="0">Off</option><option value="2">Until end of level 2</option><option value="4" selected>Until end of level 4</option><option value="6">Until end of level 6</option></select></label></div>
        <div class="two"><label>Ante<select id="nAnte"><option value="each" selected>Every player</option><option value="bb">Big blind (WSOP)</option></select></label>
        <label>Time to act<select id="nAct"><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="20" selected>20 seconds</option><option value="30">30 seconds</option></select></label></div>
        <label>Hand helper<select id="nHelper"><option value="on" selected>On: show hand strength and win chance</option><option value="off">Off (pro mode)</option></select></label>
        <div class="two"><label>Start<select id="nWhen"><option value="manual">When I press Start</option><option value="at">At a set time</option></select></label>
        <label>Repeat<select id="nRepeat"><option value="none">Just once</option><option value="daily">Every day</option><option value="weekly">Every week</option></select></label></div>
        <label id="atWrap" hidden>Start time<input type="datetime-local" id="nAt" value="${local}"></label>
        <button class="btn red" type="submit">Open registration</button>
      </form>
      <p class="note">Tables are made automatically from the table size you pick: with 6-max, 1 table for up to 6 players, 2 for up to 12, and so on. Players are moved to keep tables even, and tables merge as people bust, down to one final table. A repeating tournament opens again by itself at the same time.</p></div>${members}`;
  }
  if(T.status === 'registering'){
    return `<div class="card-box"><span class="status-pill">Registration open</span><h3>${esc(T.name)}</h3>
      <p>${T.regs.length} joined · ${Math.max(1, Math.ceil(T.regs.length / (T.tableSize || 9)))} table${T.regs.length > (T.tableSize || 9) ? 's' : ''}${T.startAt ? ' · starts ' + esc(when(T.startAt)) : ''}</p>
      <div class="plist">${T.regs.map(u => pchip(u, true)).join('') || '<span class="note">Waiting for players to join.</span>'}</div>
      ${T.regs.length < 2 ? `<p class="warn-note">You need at least 2 players to start. Send an invite, and ask your friend to tap <b>Join tournament</b> on the Tournament tab.</p>` : ''}
      <div class="btn-row"><button class="btn red" id="startBtn" ${T.regs.length < 2 ? 'disabled' : ''}>Start now</button><button class="btn" id="cancelBtn">Cancel</button></div></div>${members}`;
  }
  return `<div class="card-box"><span class="status-pill live">Live</span><h3>${esc(T.name)}</h3>
    <div class="kv num"><div><small>Players left</small><b>${T.remaining}</b></div><div><small>Tables</small><b>${club.tables.length}</b></div><div><small>Clock</small><b>${T.paused ? 'Paused' : 'Running'}</b></div></div>
    <div class="btn-row">${T.paused ? '<button class="btn green" id="resumeBtn">Resume</button>' : '<button class="btn" id="pauseBtn">Pause</button>'}<button class="btn" id="endBtn">End tournament</button></div></div>${members}`;
}

// ---------- learn: hand review, lessons, rules ----------
let myHands = null, learnSeg = 'hands', openHand = null;
const SUITCH = { s: '♠', h: '♥', d: '♦', c: '♣' };
const mini = cs => (cs || []).map(c => `<span class="mc ${'hd'.includes(c[1]) ? 'red' : ''}">${c[0] === 'T' ? '10' : c[0]}${SUITCH[c[1]]}</span>`).join('');
const bbs = (x, bb) => { const v = Math.round(x / bb * 10) / 10; return (v > 0 ? '+' : '') + v + ' BB'; };
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
const KIND = { mistake: 'Mistake', tip: 'Tip', good: 'Good', luck: 'Luck', info: 'Equity' };
function handStats(hs){
  let vpip = 0, pfr = 0;
  hs.forEach(h => { const pre = h.actions.filter(a => a.seat === h.seat && a.st === 0);
    if(pre.some(a => a.t === 'raise' || (a.t === 'call' && !(h.pos === 'BB' && a.toCall === 0)))) vpip++;
    if(pre.some(a => a.t === 'raise')) pfr++; });
  const leaks = {}; let mistakes = 0;
  hs.forEach(h => h.notes.forEach(n => { if(n.kind === 'mistake'){ mistakes++; leaks[n.title] = (leaks[n.title] || 0) + 1; } }));
  const top = Object.entries(leaks).sort((a, b) => b[1] - a[1])[0];
  return { n: hs.length, vpip: hs.length ? Math.round(vpip / hs.length * 100) : 0, pfr: hs.length ? Math.round(pfr / hs.length * 100) : 0, mistakes, top };
}
function learnHTML(){
  const seg = `<div class="seg2">${[['hands','My hands'],['lessons','Lessons'],['rules','Rules'],['fair','Fair deal']].map(([k, l]) => `<button data-seg="${k}" aria-pressed="${learnSeg === k}">${l}</button>`).join('')}</div>`;
  if(learnSeg === 'lessons') return `<div class="card-box"><span class="eyebrow">Poker school</span>${seg}<p>Short lessons for tournament players. Start at the top.</p></div>${demoCard()}
    ${window.LEARN.lessons.map((l, i) => `<details class="lesson card-box"><summary><span class="ln">${i + 1}</span><b>${esc(l.title)}</b><small>${l.mins} min</small></summary><div class="lbody">${l.body}</div></details>`).join('')}`;
  if(learnSeg === 'fair') return fairHTML(seg);
  if(learnSeg === 'rules') return `<div class="card-box"><span class="eyebrow">Club rules</span>${seg}</div><div class="card-box lbody">${window.LEARN.rules}</div>`;
  if(openHand){ const h = (myHands || []).find(x => x.id === openHand); if(h) return handReviewHTML(h); openHand = null; }
  if(!myHands) return `<div class="card-box"><span class="eyebrow">Hand review</span>${seg}<div class="empty">Loading your hands…</div></div>`;
  const st = handStats(myHands);
  const filter = learnFilter === 'mistakes' ? myHands.filter(h => h.notes.some(n => n.kind === 'mistake')) : learnFilter === 'big' ? myHands.filter(h => Math.abs(h.net) >= h.bb * 10) : myHands;
  return `<div class="card-box"><span class="eyebrow">Hand review</span>${seg}
    ${myHands.length ? `<div class="statgrid"><div><b>${st.n}</b><small>Hands</small></div><div><b>${st.vpip}%</b><small>Played (VPIP)</small></div><div><b>${st.pfr}%</b><small>Raised (PFR)</small></div><div><b>${st.mistakes}</b><small>Mistakes</small></div></div>
    <p class="note">${st.vpip > 32 ? 'You put money in too many pots. Good tournament players play about 18 to 25% of hands.' : st.vpip && st.vpip < 12 ? 'You play very few hands. Open more from the cutoff and button.' : st.n >= 20 ? 'Your hand selection looks disciplined. Keep it up.' : 'Play a few more hands to see your stats settle.'}
    ${st.top ? ` Your most common mistake: <b>${esc(st.top[0])}</b> (${st.top[1]}×). Read the matching lesson.` : ''}${st.vpip && st.pfr < st.vpip / 2 ? ' You call much more than you raise: be the one who raises.' : ''}</p>
    <div class="seg2 small">${[['all','All'],['mistakes','With mistakes'],['big','Big pots']].map(([k, l]) => `<button data-filter="${k}" aria-pressed="${learnFilter === k}">${l}</button>`).join('')}</div>` : ''}</div>
    ${filter.length ? `<div class="hand-list">${filter.map(h => `<button class="hrow" data-hand="${esc(h.id)}"><span class="hc">${mini(h.cards)}</span><span class="hm"><b>${esc(h.pos || '')}</b><small>${new Date(h.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${h.sb}/${h.bb}</small></span>
      <span class="hn ${h.net > 0 ? 'pos' : h.net < 0 ? 'neg' : ''}">${h.net ? bbs(h.net, h.bb) : '0'}</span>
      <span class="hb">${['mistake','tip','good','luck'].map(k => { const c = h.notes.filter(n => n.kind === k).length; return c ? `<i class="nk ${k}">${c}</i>` : ''; }).join('')}</span></button>`).join('')}</div>`
      : `<div class="empty">${myHands.length ? 'No hands match this filter.' : 'Your hands show up here after you play in a tournament.'}</div>`}`;
}
let learnFilter = 'all';
function actLine(a, h, byseat){
  const p = byseat[a.seat] || {}, who = `${esc(p.name || '?')}${p.pos ? ` <small>${p.pos}</small>` : ''}`;
  const amt = n => `<span class="num">${fmt(n)}</span>`;
  const txt = a.t === 'fold' ? 'folds' : a.t === 'check' ? 'checks' : a.t === 'call' ? `calls ${amt(Math.min(a.toCall, a.to))}` : (a.toCall === 0 && a.st > 0 ? `bets ${amt(a.to)}` : `raises to ${amt(a.to)}`);
  return `<li class="${p.me ? 'me' : ''}">${who} ${txt}${a.allIn ? ' <b class="ai">all-in</b>' : ''}</li>`;
}
function handReviewHTML(h){
  const byseat = Object.fromEntries(h.players.map(p => [p.seat, p]));
  const boards = [[], h.board.slice(0, 3), h.board.slice(0, 4), h.board.slice(0, 5)];
  const streets = [0, 1, 2, 3].filter(st => h.actions.some(a => a.st === st) || (st > 0 && h.board.length >= st + 2));
  const notesFor = st => h.notes.filter(n => n.st === st).map(n => `<div class="cnote ${n.kind}"><span class="nk ${n.kind}">${KIND[n.kind] || n.kind}</span><b>${esc(n.title)}</b><p>${esc(n.text)}</p></div>`).join('');
  return `<div class="card-box"><button class="back-link" id="handBack">← All hands</button>
    <div class="hhead"><span class="hc big">${mini(h.cards)}</span>
    <div><b>${esc(h.pos)}</b> · ${Math.round(h.start / h.bb)} BB<br><small>${esc(h.tourney || '')} · blinds ${h.sb}/${h.bb}${h.ante ? ` ante ${h.ante}` : ''} · ${h.players.length} players</small></div>
    <div class="hn ${h.net > 0 ? 'pos' : h.net < 0 ? 'neg' : ''}">${h.net ? bbs(h.net, h.bb) : 'Even'}<small>${h.net ? (h.net > 0 ? '+' : '') + fmt(h.net) : ''}</small></div></div></div>
    ${streets.map(st => `<div class="card-box street"><div class="sthead"><span class="eyebrow">${STREETS[st]}</span><span class="hc">${mini(boards[st])}</span></div>
      <ul class="acts">${h.actions.filter(a => a.st === st).map(a => actLine(a, h, byseat)).join('') || '<li class="muted">No betting (all-in)</li>'}</ul>${notesFor(st)}</div>`).join('')}
    <div class="card-box"><span class="eyebrow">Result</span>
      <ul class="acts">${h.players.filter(p => p.shown || p.won).map(p => `<li class="${p.me ? 'me' : ''}">${esc(p.name)} ${p.cards && p.shown ? mini(p.cards) : ''} ${p.hand ? `<small>${esc(p.hand)}</small>` : ''} ${p.won ? `wins <span class="num">${fmt(p.won)}</span>` : ''}</li>`).join('')}</ul>
      ${h.notes.length ? '' : '<p class="note">No notes on this hand. Nothing to fix here.</p>'}</div>`;
}
function wireLearn(){
  document.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { learnSeg = b.dataset.seg; openHand = null; if(learnSeg === 'hands') send({ t: 'hands' }); renderLobby(); });
  document.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { learnFilter = b.dataset.filter; renderLobby(); });
  document.querySelectorAll('[data-hand]').forEach(b => b.onclick = () => { openHand = b.dataset.hand; renderLobby(); $('lobbyBody').scrollTop = 0; });
  const hb = $('handBack'); if(hb) hb.onclick = () => { openHand = null; renderLobby(); };
}

function wireLobby(){
  wireLearn();
  document.querySelectorAll('[data-demo]').forEach(b => b.onclick = startDemo);
  document.querySelectorAll('[data-fair]').forEach(b => b.onclick = () => { b.disabled = true; b.textContent = 'Checking…'; send({ t: 'fair', id: b.dataset.fair }); });
  document.querySelectorAll('[data-sealinfo]').forEach(a => a.onclick = e => { e.preventDefault(); tab = 'learn'; learnSeg = 'fair'; renderLobby(); });
  document.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => send({ t: 'mute', uid: b.dataset.mute, muted: b.dataset.on !== '1' }));
  on2('chatOffBtn', () => send({ t: 'chatOff', off: !club.chatOff }));
  on2('memInvBtn', () => send({ t: 'membersInvite', on: !club.membersInvite }));
  document.querySelectorAll('[data-bseg]').forEach(b => b.onclick = () => { boardSeg = b.dataset.bseg; renderLobby(); });
  document.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => send({ t: 'skillq', rid: b.dataset.claim }));
  document.querySelectorAll('[data-rmrw]').forEach(b => b.onclick = async () => { if(await modal('<h2>Remove this prize?</h2><p>Claims already made stay on the list.</p>', [{ label: 'Keep', value: false }, { label: 'Remove', value: true, primary: true }])) send({ t: 'removeReward', id: b.dataset.rmrw }); });
  document.querySelectorAll('[data-rdone]').forEach(b => b.onclick = () => send({ t: 'redeemStatus', id: b.dataset.rdone, status: 'delivered' }));
  document.querySelectorAll('[data-rcancel]').forEach(b => b.onclick = async () => { if(await modal('<h2>Cancel this claim?</h2><p>The points go back to the player.</p>', [{ label: 'Keep', value: false }, { label: 'Cancel claim', value: true, primary: true }])) send({ t: 'redeemStatus', id: b.dataset.rcancel, status: 'cancelled' }); });
  const rf = $('rewardForm'); if(rf) rf.onsubmit = e => { e.preventDefault(); send({ t: 'addReward', name: $('rwName').value, cost: +$('rwCost').value, qty: +$('rwQty').value, value: $('rwValue').value }); };
  const on = (id, f) => { const el = $(id); if(el) el.onclick = f; };
  on('joinBtn', () => { send({ t: 'join' }); setTimeout(offerReminder, 600); });
  on('leaveBtn', () => send({ t: 'leave' }));
  document.querySelectorAll('[data-watch]').forEach(b => b.onclick = () => openTable(b.dataset.watch));
  document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { boardRange = b.dataset.range; renderLobby(); });
  document.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => send({ t: 'kick', uid: b.dataset.kick }));
  document.querySelectorAll('[data-revoke]').forEach(b => b.onclick = () => send({ t: 'revoke', code: b.dataset.revoke }));
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => showInvite(b.dataset.copy, !!b.dataset.group));
  document.querySelectorAll('[data-home]').forEach(b => b.onclick = async () => {
    const uid = b.dataset.home, others = club.members.filter(m => m.id !== uid);
    let pick = club.households && club.households[uid] ? (others.find(m => club.households[m.id] === club.households[uid]) || {}).id || '' : '';
    const pm = modal(`<h2>${esc(nameOf(uid))} lives with…</h2><p>People in the same home are never seated at the same table.</p><select id="homeSel" class="sel"><option value="">Nobody (separate home)</option>${others.map(m => `<option value="${esc(m.id)}" ${club.households && club.households[uid] && club.households[m.id] === club.households[uid] ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`,
      [{ label: 'Cancel', value: null }, { label: 'Save', value: 'save', primary: true }]);
    $('homeSel').onchange = e => pick = e.target.value;
    if(await pm === 'save') send({ t: 'household', uid, with: pick || null });
  });
  document.querySelectorAll('[data-remove]').forEach(b => b.onclick = async () => {
    const name = nameOf(b.dataset.remove);
    if(await modal(`<h2>Remove ${esc(name)}?</h2><p>They are signed out and can't come back without a new invite.</p>`, [{ label: 'Keep', value: false }, { label: 'Remove', value: true, primary: true }])) send({ t: 'remove', uid: b.dataset.remove });
  });
  on('inviteBtn', askInvite);
  on('lateInvite', e => { e.preventDefault(); askInvite(); });
  on('againBtn', () => {
    const T = club.tourney, d = new Date();
    send({ t: 'create', name: T ? T.name : `${d.toLocaleDateString('en-US', { weekday: 'long' })} Night Tournament`, stack: T ? T.stack : 30000, levelMin: T ? T.levelMin : 20, startAt: $('againAt') && $('againAt').value ? +$('againAt').value : null, repeat: 'none', anteMode: T && T.anteMode ? T.anteMode : 'each', actSec: T && T.actSec ? T.actSec : 20, tableSize: 9, lateLevels: T && T.lateLevels != null ? T.lateLevels : 4, helper: T ? T.helper !== false : true });
    send({ t: 'join' }); tab = 'event';
  });
  on('newCustomBtn', () => { tab = 'director'; renderLobby(); });
  const nf = $('newForm');
  if(nf){
    $('nWhen').onchange = () => $('atWrap').hidden = $('nWhen').value !== 'at';
    nf.onsubmit = e => {
      e.preventDefault();
      const at = $('nWhen').value === 'at' ? new Date($('nAt').value).getTime() : null;
      send({ t: 'create', name: $('nName').value.trim(), stack: +$('nStack').value, levelMin: +$('nLevel').value, startAt: at, repeat: at ? $('nRepeat').value : 'none', anteMode: $('nAnte').value, actSec: +$('nAct').value, tableSize: +$('nSize').value, lateLevels: +$('nLate').value, helper: $('nHelper').value });
      tab = 'event';
    };
  }
  on('startBtn', async () => { if(await modal(`<h2>Start ${esc(club.tourney.name)}?</h2><p>${club.tourney.regs.length} players will be seated now.</p>`, [{ label: 'Not yet', value: false }, { label: 'Shuffle up and deal', value: true, primary: true }])) send({ t: 'start' }); });
  on('cancelBtn', async () => { if(await modal('<h2>Cancel this tournament?</h2><p>Everyone who joined is taken off the list.</p>', [{ label: 'Keep it', value: false }, { label: 'Cancel it', value: true, primary: true }])) send({ t: 'cancel' }); });
  on('pauseBtn', () => send({ t: 'pause' }));
  on('resumeBtn', () => send({ t: 'resume' }));
  on('endBtn', async () => { if(await modal('<h2>End the tournament now?</h2><p>All tables close and no results are recorded.</p>', [{ label: 'Keep playing', value: false }, { label: 'End it', value: true, primary: true }])) send({ t: 'cancel' }); });
}
async function askInvite(){
  if(!club.me.owner) return send({ t: 'invite' });
  const v = await modal('<h2>Invite people</h2><p>A <b>group link</b> can go in a WhatsApp or Telegram group: up to 100 people can join with it for 30 days, and it stays the same link, so you can share it in the morning for a game at night. People who join with it are signed up for the open tournament. A <b>personal link</b> works once, for one friend.</p>',
    [{ label: 'Cancel', value: null }, { label: 'Personal link', value: 'one' }, { label: 'Group link', value: 'group', primary: true }]);
  if(v) send({ t: 'invite', group: v === 'group' });
}
function showInvite(code, group, max){
  const url = location.origin + '/join/' + code;
  const T = club.tourney, open = T && ['registering', 'running'].includes(T.status);
  const what = open ? ` for ${T.name}${T.status === 'registering' && T.startAt ? ', ' + new Date(T.startAt).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' }) : ''}` : '';
  const text = `${club.me.name} invited you to the Blindrise poker club${what}. Free to play. Tap to join${group ? ' (pick your own name and PIN)' : ''}:`;
  const enc = encodeURIComponent;
  modal(`<h2>${!club.me.owner ? 'Your invite link' : group ? 'Group invite link' : 'Invite link'}</h2><p>${!club.me.owner ? `Send it to friends who play poker, or post it in a group. Up to ${max || 10} people can join with your link for 7 days. It's free, and they pick their own name and PIN.` : group ? 'Post it in your group. Up to 100 people can join with it for 30 days, and anyone who joins is signed up for the open tournament. It stays the same link until you cancel it in Director.' : 'Send this to one friend. It works once.'}</p>
    ${navigator.share ? '<button class="btn-red" id="shareBtn" style="width:100%;margin-bottom:10px">Share invite</button>' : ''}
    <div class="share-row"><a class="btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${enc(text + ' ' + url)}">WhatsApp</a><a class="btn-ghost" target="_blank" rel="noopener" href="https://t.me/share/url?url=${enc(url)}&text=${enc(text)}">Telegram</a><a class="btn-ghost" href="sms:?&body=${enc(text + ' ' + url)}">Text</a></div>
    <div class="copy-row"><input id="invUrl" readonly value="${esc(url)}"><button class="btn-ghost" id="copyBtn" style="width:auto;padding:9px 12px">Copy</button></div>`, [{ label: 'Done', value: 1 }]);
  $('copyBtn').onclick = () => { const i = $('invUrl'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => $('copyBtn').textContent = 'Copied').catch(() => { try{ document.execCommand('copy'); $('copyBtn').textContent = 'Copied'; }catch(e){} }); };
  const sb = $('shareBtn'); if(sb) sb.onclick = () => navigator.share({ title: 'Blindrise invite', text, url }).catch(() => {});
}
function openTable(tid){ if(tid !== watchTid){ chatUnread = 0; $('chatDot').hidden = true; } watchTid = tid; view = 'table'; seen = new Set(); showScreen('game'); send({ t: 'watch', tid }); renderTable(); }
$('lobbyBtn').onclick = () => { openChat(false); stopDemo(); view = 'lobby'; send({ t: 'watch', tid: null }); showScreen('lobby'); renderLobby(); };

// ---------- table ----------
// Seat ring layouts for 6, 8 and 9 players; position 0 is the bottom seat (you).
const RING = n => { const r = Array.from({ length: n }, (_, k) => { const a = (90 + k * 360 / n) * Math.PI / 180; return [50 + 40 * Math.cos(a), 46 + 39.5 * Math.sin(a)]; }); r[0] = [50, 83]; return r; };
const RINGS = { 6: RING(6), 8: RING(8), 9: RING(9) };
// Maps a table's seat numbers to screen positions, turned so you sit at the bottom.
function layoutOf(d){
  const allowed = d.allowed || [0, 1, 2, 3, 4, 5, 6, 7, 8], n = allowed.length, ring = RINGS[n] || RING(n);
  const mySeat = d.seats.findIndex(p => p && club && p.uid === club.me.id), base = Math.max(0, allowed.indexOf(mySeat));
  const rel = s => (allowed.indexOf(s) - base + n) % n;
  return { allowed, rel, posOf: s => ring[rel(s)] };
}
const CENTER = [50, 45];
const pctToPx = ([x, y]) => { const a = $('tableArea'); return [a.clientWidth * x / 100, a.clientHeight * y / 100]; };
const toward = ([x, y], f) => [x + (CENTER[0] - x) * f, y + (CENTER[1] - y) * f];
const cs = s => E.parse(s)[0];
function cardHTML(c, cls = '', extra = ''){
  if(c == null) return `<div class="card back ${cls}" ${extra}></div>`;
  const s = E.suitOf(c), red = s === 1 || s === 2, r = E.RANKS[E.rankOf(c) - 2];
  return `<div class="card ${red ? 'red' : ''} ${cls}" ${extra}><span class="r">${r === 'T' ? '10' : r}</span><span class="s1">${E.SUITS[s]}</span><span class="s2">${E.SUITS[s]}</span></div>`;
}
const initials = n => String(n || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const chipsIcon = (n = 3) => `<span class="chips">${'<i></i>'.repeat(n)}</span>`;
const COLORS = ['#3b6fb6','#7a5aa6','#2f8a8f','#3d8a62','#b07a2a','#5a6fc2','#4b6680','#8a6a5c','#b0505a'];
const colorOf = uid => { let h = 0; for(const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };


// ---------- reminders: phone notifications and calendar ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
function remindHTML(T){
  const bell = club.pushOn ? '<span class="status-pill">🔔 Notifications on</span>'
    : pushSupported() && Notification.permission !== 'denied' ? '<button class="btn" data-remind>🔔 Notify me when it starts</button>'
    : isIOS() && !standalone() ? '<button class="btn" data-iosnote>🔔 Notifications on iPhone</button>' : '';
  const cal = T.startAt ? '<button class="btn" data-cal>📅 Add to calendar</button>' : '';
  return bell || cal ? `<div class="btn-row">${bell}${cal}</div>` : '';
}
async function enablePush(){
  try{
    if(!pushSupported()) throw new Error('unsupported');
    const perm = await Notification.requestPermission();
    if(perm !== 'granted') return toast('Notifications are blocked. You can allow them in your browser settings.');
    const reg = await navigator.serviceWorker.ready;
    const { key } = await post('/api/pushKey', {});
    const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)), c => c.charCodeAt(0));
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    await post('/api/push', sub.toJSON());
    toast("Done. We'll notify you 15 minutes before and when it starts.");
  }catch(e){ toast(isIOS() && !standalone() ? 'On iPhone, add the app to your Home Screen first.' : 'Notifications could not be turned on on this device.'); }
}
async function offerReminder(){
  const T = club.tourney; if(!T || T.status !== 'registering' || club.pushOn) return;
  if(pushSupported() && Notification.permission === 'default'){
    const v = await modal(`<h2>Get a reminder?</h2><p>We'll send a notification to this phone 15 minutes before ${esc(T.name)} starts, and again when the cards are dealt.</p>`, [{ label: 'No thanks', value: null }, { label: 'Notify me', value: 1, primary: true }]);
    if(v) enablePush();
  } else if(pushSupported() && Notification.permission === 'granted') enablePush();
}
function iosNote(){
  modal(`<h2>Notifications on iPhone</h2><ol class="terms"><li>Open this site in <b>Safari</b>.</li><li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li><li>Open Blindrise from your Home Screen, sign in, and tap <b>Notify me</b> again.</li></ol><p>Until then, use <b>Add to calendar</b> for a reminder.</p>`, [{ label: 'OK', value: 1, primary: true }]);
}
// A calendar event with an alarm 15 minutes before; phones open .ics files in their calendar app.
function addToCalendar(){
  const T = club.tourney; if(!T || !T.startAt) return;
  const z = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Blindrise//Club//EN', 'BEGIN:VEVENT', `UID:${T.id}@blindrise`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(T.startAt)}`, `DTEND:${z(T.startAt + 3 * 3600000)}`,
    `SUMMARY:${T.name.replace(/[,;\\]/g, ' ')} (poker)`, `DESCRIPTION:Open ${location.origin} a few minutes early to take your seat.`, `URL:${location.origin}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Poker starts in 15 minutes', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'tournament.ics';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
document.addEventListener('click', e => {
  if(e.target.closest('[data-remind]')) enablePush();
  if(e.target.closest('[data-iosnote]')) iosNote();
  if(e.target.closest('[data-cal]')) addToCalendar();
});

// ---------- avatars, skill tiers and profiles ----------
const GALLERY = {
  lion: ['🦁', '#c9822b'], wolf: ['🐺', '#55657d'], fox: ['🦊', '#c2562a'], tiger: ['🐯', '#d38b1f'], eagle: ['🦅', '#6b4f2e'],
  bear: ['🐻', '#7a5236'], panda: ['🐼', '#4b5566'], shark: ['🦈', '#2e6bcf'], dragon: ['🐉', '#2f8a5f'], octopus: ['🐙', '#9b4f8f'],
  owl: ['🦉', '#6d5a3e'], frog: ['🐸', '#3e8a3a'], cowboy: ['🤠', '#a0632a'], cool: ['😎', '#3a6fb6'], robot: ['🤖', '#5b6b85'],
  alien: ['👽', '#3f8f7f'], ghost: ['👻', '#5d5f8f'], ninja: ['🥷', '#2a2f3a'], crown: ['👑', '#b8862a'], spade: ['♠️', '#d9dee8'],
  heart: ['♥️', '#8f2a35'], diamond: ['♦️', '#2a4f8f'], club: ['♣️', '#a9d8bd'], dice: ['🎲', '#6a3fa0']
};
const TIER_ICON = { shark: '🦈', pro: '💎' };
const TIER_INFO = [['pro', 'Pro', '#b57cff', 'Rating 82+, at least 150 hands and 3 tournaments'], ['shark', 'Shark', '#f2a93b', 'Rating 70+, at least 80 hands and 2 tournaments'],
  ['solid', 'Solid', '#4a90f5', 'Rating 56+'], ['regular', 'Regular', '#38b2ac', 'Rating 40+'], ['rookie', 'Rookie', '#8b95a8', 'Still learning'], ['new', 'New', '#6b7385', 'Fewer than 30 hands so far']];
const memberOf = uid => club && club.members.find(m => m.id === uid);
// A player's picture: their photo, a gallery avatar, or their initials. The ring shows their skill tier.
function avHTML(uid, name, cls = ''){
  const m = memberOf(uid), av = m && m.av, ring = m && m.tier && m.tier !== 'new' ? `--ring:${m.color};` : '';
  const icon = m && TIER_ICON[m.tier] ? `<i class="tier-ic" title="${esc(m.tier)}">${TIER_ICON[m.tier]}</i>` : '';
  let inner = esc(initials(name)), bg = colorOf(uid);
  if(av && av.startsWith('p:')) inner = `<img src="/avatar/${esc(uid)}?v=${esc(av.slice(2))}" alt="" loading="lazy">`;
  else if(av && av.startsWith('g:') && GALLERY[av.slice(2)]){ inner = `<span class="emo">${GALLERY[av.slice(2)][0]}</span>`; bg = GALLERY[av.slice(2)][1]; }
  return `<div class="av ${ring ? 'tiered' : ''} ${cls}" style="--c:${bg};${ring}">${inner}${icon}</div>`;
}
const tierPill = m => m && m.tier ? `<span class="tier-pill" style="--tc:${m.color}">${TIER_ICON[m.tier] || ''}${esc(m.tierName || TIER_INFO.find(t => t[0] === m.tier)[1])}</span>` : '';
const myPerks = () => { const m = memberOf(club.me.id); return m ? ({ shark: ['shark'], pro: ['shark', 'crown', 'diamond'] }[m.tier] || []) : []; };
const throwChoices = () => Object.entries(THROW_ICONS).filter(([k]) => !PERK_THROWS.includes(k) || myPerks().includes(k));

function openProfile(uid){ send({ t: 'profile', uid }); }
async function showProfile(p){
  const me = p.uid === club.me.id, d = tables.get(curTid());
  const atTable = view === 'table' && !me && d && d.seats.some(x => x && x.uid === p.uid) && !throwBlock();
  const st = (v, l) => `<div><b>${v}</b><small>${l}</small></div>`;
  const recent = p.recent.length ? `<div class="prof-list">${p.recent.map(r => `<div><span>${esc(r.name)}<small>${new Date(r.at).toLocaleDateString()}</small></span><b class="${r.place === 1 ? 'gold' : r.cashed ? 'cash' : ''}">${ord(r.place)} of ${r.of}</b></div>`).join('')}</div>` : '<p class="note">No finished tournaments yet.</p>';
  const tier = TIER_INFO.find(t => t[0] === p.tier) || TIER_INFO[5];
  const html = `<div class="prof">
    <div class="prof-head">${avHTML(p.uid, p.name, 'big')}<div><h2>${esc(p.name)}</h2>${tierPill({ tier: p.tier, color: p.color, tierName: p.tierName })}
      <small>${p.score != null ? `Skill rating <b>${p.score}</b>/100 · ` : ''}member since ${new Date(p.since).toLocaleDateString([], { month: 'short', year: 'numeric' })}${(memberOf(p.uid) || {}).invitedBy ? ' · invited by ' + esc(nameOf(memberOf(p.uid).invitedBy)) : ''}</small></div></div>
    ${atTable ? `<div class="eyebrow">Throw something</div><div class="throw-grid">${throwChoices().map(([k, v]) => `<button data-v="t:${k}">${v}</button>`).join('')}</div>` : ''}
    <div class="eyebrow">Tournaments</div>
    <div class="statgrid">${st(p.played, 'Played')}${st(p.wins, 'Wins')}${st(p.cashes, 'Cashes')}${st(p.best ? ord(p.best) : '–', 'Best')}</div>
    <div class="eyebrow">How they play</div>
    <div class="statgrid">${st(fmt(p.hands), 'Hands')}${st(p.clean + '%', 'Clean hands')}${st(p.vpip + '%', 'Played (VPIP)')}${st(p.pfr + '%', 'Raised (PFR)')}</div>
    <div class="eyebrow">Mindset</div>
    <div class="statgrid three">${st(p.patience != null ? p.patience + '%' : '–', 'Patience')}${st(p.bigLosses ? Math.max(0, Math.round((1 - p.tilts / p.bigLosses) * 100)) + '%' : '–', 'Calm after losses')}${st(p.tilts, 'Tilt moments')}</div>
    <p class="note">${p.hands < 30 ? 'Not enough hands yet for a fair rating.' : p.clean >= 90 ? 'Makes very few mistakes: folds the right hands and raises when it counts.' : p.clean >= 80 ? 'Mostly solid decisions, with the odd leak.' : 'Still makes some costly mistakes; the coach under Learn helps.'} "Clean hands" are hands the coach found no mistake in.</p>
    <div class="eyebrow">Recent results</div>${recent}
    <details class="tiers-d"><summary>How tiers work</summary><div class="tier-list">${TIER_INFO.map(t => `<div><span class="tier-pill" style="--tc:${t[2]}">${TIER_ICON[t[0]] || ''}${t[1]}</span><small>${t[3]}</small></div>`).join('')}</div>
      <p class="note">The rating comes mostly from decisions the coach checks every hand (folding weak hands, raising instead of limping, not paying off with nothing), and partly from tournament finishes. Sharks unlock 🦈 to throw; Pros also get 👑 and 💎.</p></details>
  </div>`;
  const btns = [{ label: 'Close', value: null }];
  if(me) btns.push({ label: 'Change picture', value: 'pic', primary: true });
  else if(club.me.owner && p.av) btns.push({ label: 'Remove photo', value: 'rmpic' });
  const v = await modal(html, btns);
  if(v === 'pic') pickAvatar();
  else if(v === 'rmpic') send({ t: 'avatarClear', uid: p.uid });
  else if(v && v.startsWith('t:')){ openChat(false); sendChat({ t: 'throw', item: v.slice(2), to: p.uid }); }
}
async function pickAvatar(){
  const cur = (memberOf(club.me.id) || {}).av || '';
  const v = await modal(`<h2>Your picture</h2><p>Players see it at the table, so they know who they're playing.</p>
    <label class="btn-red upload">📷 Upload a photo<input type="file" accept="image/*" id="avFile" hidden></label>
    <div class="eyebrow">Or pick an avatar</div>
    <div class="av-grid">${Object.entries(GALLERY).map(([k, [e, c]]) => `<button data-v="g:${k}" style="--c:${c}" aria-pressed="${cur === 'g:' + k}">${e}</button>`).join('')}</div>`,
    [{ label: 'Cancel', value: null }, ...(cur ? [{ label: 'Remove picture', value: 'none' }] : [])]);
  if(v === 'none') return saveAvatar({ kind: 'none' });
  if(v && v.startsWith('g:')) return saveAvatar({ kind: 'gallery', id: v.slice(2) });
}
// The file input lives inside the modal, so listen for it at the document level.
document.addEventListener('change', async e => {
  if(e.target.id !== 'avFile' || !e.target.files[0]) return;
  $('modalRoot').innerHTML = '';
  try{ saveAvatar({ kind: 'photo', data: await shrinkPhoto(e.target.files[0]) }); }
  catch(err){ toast('That photo could not be opened. Try another one.'); }
});
// Center-crop to a square and shrink to 192px, so a photo is a few KB.
function shrinkPhoto(file){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const n = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas'); c.width = c.height = 192;
      c.getContext('2d').drawImage(img, (img.naturalWidth - n) / 2, (img.naturalHeight - n) / 2, n, n, 0, 0, 192, 192);
      URL.revokeObjectURL(url);
      let q = .85, out = c.toDataURL('image/jpeg', q);
      while(out.length > 55000 && q > .4){ q -= .15; out = c.toDataURL('image/jpeg', q); }
      res(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}
async function saveAvatar(a){
  try{ await post('/api/avatar', a); toast(a.kind === 'none' ? 'Picture removed.' : 'Picture saved.'); }
  catch(err){ toast(err.message); }
}

function renderTable(){
  if(view !== 'table' || !club) return;
  const tid = watchTid || club.myTable, d = tables.get(tid);
  const area = $('tableArea');
  if(!d){
    if(club.myTable && club.myTable !== watchTid && club.tourney && club.tourney.status === 'running'){ return openTable(club.myTable); }
    $('seats').innerHTML = ''; $('board').innerHTML = ''; $('pot').style.visibility = 'hidden';
    $('msg').textContent = club.tourney && club.tourney.status === 'running' ? 'Loading the table…' : 'This table has closed.';
    $('controls').innerHTML = '<div class="info-line">Tap Lobby to see the other tables.</div>';
    tickClock(); return;
  }
  area.style.setProperty('--cw', Math.max(30, Math.min(46, area.clientWidth * .1)) + 'px');
  area.style.setProperty('--bw', Math.max(30, Math.min(50, area.clientWidth * .105)) + 'px');
  const mySeat = d.seats.findIndex(s => s && s.uid === club.me.id);
  const LY = layoutOf(d), posOf = LY.posOf;
  const res = d.result, winCards = new Set((res && res.showdown ? res.winCards : []).map(cs));
  const handKey = d.tid + ':' + d.handNo;
  const mc = myCards.get(d.tid), mine = mc && mc.hand === d.handNo ? mc.cards.map(cs) : null;
  let html = '';
  for(const s of LY.allowed){
    const p = d.seats[s], pos = posOf(s);
    if(!p){ html += `<div class="empty-seat" style="left:${pos[0]}%;top:${pos[1]}%">OPEN</div>`; continue; }
    const isMe = p.uid === club.me.id;
    let hole = '';
    if(p.inHand && !(p.folded && !isMe)){
      const [sx, sy] = pctToPx(pos), [cx, cy] = pctToPx(CENTER);
      hole = [0, 1].map(j => {
        const key = `h${handKey}-${s}-${j}`, isNew = !seen.has(key); seen.add(key);
        const anim = isNew && d.street === 0 && !res ? `dl" style="--fx:${cx - sx}px;--fy:${cy - sy}px;animation-delay:${(j * 9 + s) * 50}ms` : '';
        const c = p.shown ? cs(p.shown[j]) : (isMe && mine ? mine[j] : null);
        const hl = res && res.showdown && winCards.size && c != null ? (winCards.has(c) ? ' wincard' : ' dim') : '';
        if(isMe) return cardHTML(c, `hero ${p.folded ? 'dim' : ''}${hl} ${anim}`);
        if(c != null) return cardHTML(c, `show${hl}`);
        return cardHTML(null, `mini ${anim}`);
      }).join('');
    }
    let badge = '';
    if(res && p.won > 0) badge = `<span class="badge won">Wins ${fmt(p.won)}</span>`;
    else if(res && res.showdown && p.cat) badge = `<span class="badge hand">${esc(p.cat)}</span>`;
    else if(p.away) badge = '<span class="badge">Away</span>';
    else if(p.act){ const amt = (p.act === 'Raise' || p.act === 'Bet') ? ' ' + fmt(p.lastAmt) : ''; badge = `<span class="badge ${p.act.toLowerCase()}">${esc(p.act)}${amt}</span>`; }
    const acting = d.acting === s;
    const stackTxt = p.inHand && p.allIn && !res ? 'All-in' : fmt(p.stack);
    const cls = `seat ${isMe ? 'hero' : ''} ${p.folded ? 'folded' : ''} ${acting ? 'acting' : ''} ${res && p.won > 0 ? 'win' : ''}`;
    const av = avHTML(p.uid, p.name);
    const shot = acting ? '<div class="shot"><i class="shotBar"></i></div>' : '';
    html += isMe
      ? `<div class="${cls}" data-uid="${esc(p.uid)}" style="left:${pos[0]}%;top:${pos[1]}%"><div class="hole">${hole}</div><div class="plate">${av}<div class="pl-txt"><div class="nm">${esc(p.name)}</div><div class="st num">${stackTxt}</div></div>${badge}${shot}</div></div>`
      : `<div class="${cls}" data-uid="${esc(p.uid)}" style="left:${pos[0]}%;top:${pos[1]}%"><div class="hole">${hole}</div>${av}<div class="plate"><div class="nm">${esc(p.name)}</div><div class="st num">${stackTxt}</div>${badge}${shot}</div></div>`;
    if(p.inHand && p.bet > 0){
      const bp = toward(pos, LY.rel(s) === 0 ? .36 : .4), [bx, by] = pctToPx(bp), [sx, sy] = pctToPx(pos);
      const key = `b${handKey}-${d.street}-${s}-${p.bet}`, isNew = !seen.has(key); seen.add(key);
      html += `<div class="bet num ${isNew ? 'chipin' : ''}" style="left:${bp[0]}%;top:${bp[1]}%;--fx:${sx - bx}px;--fy:${sy - by}px">${chipsIcon(Math.min(3, 1 + Math.floor(p.bet / (d.blinds[1] * 3))))}${fmt(p.bet)}</div>`;
    }
  }
  if(d.btn >= 0 && d.phase === 'hand'){
    const pos = posOf(d.btn), dd = toward(pos, .2), atMe = LY.rel(d.btn) === 0, side = atMe ? 17 : (pos[0] < 50 ? 4 : pos[0] > 50 ? -4 : 9);
    html += `<div class="dealer" style="left:${dd[0] + side}%;top:${dd[1] + (atMe ? -2 : 5)}%">D</div>`;
  }
  $('seats').innerHTML = html;
  $('pot').innerHTML = !res && d.pot > 0 ? `${chipsIcon(3)}Pot ${fmt(d.pot)}` : '';
  $('pot').style.visibility = $('pot').innerHTML ? 'visible' : 'hidden';
  let b = '';
  for(let i = 0; i < 5; i++){
    const c = d.board[i] != null ? cs(d.board[i]) : null;
    if(c == null){ b += '<div class="slot"></div>'; continue; }
    const key = `bd${handKey}-${i}`, isNew = !seen.has(key); seen.add(key);
    const hl = res && res.showdown && winCards.size ? (winCards.has(c) ? 'wincard' : 'dim') : '';
    b += cardHTML(c, `board ${hl} ${isNew ? 'flip' : ''}`, isNew ? `style="animation-delay:${(i < 3 ? i : 0) * 110}ms"` : '');
  }
  $('board').innerHTML = b;
  const lines = res ? res.lines : d.note ? [d.note] : d.seats.filter(Boolean).length < 2 ? ['Waiting for players to be moved to this table…'] : [];
  $('msg').innerHTML = lines.map(l => `<div>${esc(l)}</div>`).join('');
  $('tName').textContent = `Table ${d.n}`;
  $('sPlayers').textContent = `${d.seats.filter(Boolean).length} seated`;
  renderControls(d, mySeat, mine);
  renderHelper(d, mySeat >= 0 ? d.seats[mySeat] : null, mine);
  tickClock();
}
// Pre-actions (like the big online rooms): pick Check/Fold, Check, Call or Call any before your turn.
let preAct = null; // { kind: 'checkfold'|'check'|'call'|'callany', key, amt }
function renderControls(d, mySeat, mine){
  const c = $('controls');
  const meSeat = mySeat >= 0 ? d.seats[mySeat] : null;
  const turnKey = d.tid + ':' + d.handNo + ':' + d.seq;
  const streetKey = d.tid + ':' + d.handNo + ':' + d.street;
  if(preAct && preAct.key !== streetKey) preAct = null;
  const myTurn = meSeat && d.acting === mySeat && d.actUid === club.me.id && d.legal && d.phase === 'hand';
  if(myTurn && lastSent !== turnKey){
    if(c.dataset.turn === turnKey) return;
    // a pre-action fires by itself when it still fits the situation
    if(preAct){
      const L = d.legal, pa = preAct; preAct = null;
      const a = pa.kind === 'checkfold' ? (L.canCheck ? { t: 'check' } : { t: 'fold' })
        : pa.kind === 'check' ? (L.canCheck ? { t: 'check' } : null)
        : pa.kind === 'call' ? (!L.canCheck && L.toCall === pa.amt ? { t: 'call' } : null)
        : pa.kind === 'callany' ? (L.canCheck ? { t: 'check' } : { t: 'call' }) : null;
      if(a){ c.dataset.turn = turnKey; return sendAction(d, a); }
    }
    c.dataset.turn = turnKey;
    if(navigator.vibrate) try{ navigator.vibrate(60); }catch(e){}
    return drawActions(d, meSeat);
  }
  c.dataset.turn = '';
  let line, pre = '';
  const T = club.tourney, out = T && (T.places || []).find(r => r.uid === club.me.id);
  if(!meSeat) line = out ? `You finished ${ord(out.place)}. Watching Table ${d.n}.` : `Watching Table ${d.n}.`;
  else if(meSeat.away) line = `You're sitting out, so your hands fold automatically. <button class="btn green" id="backBtn" style="margin-left:6px;padding:6px 12px">I'm back</button>`;
  else if(myTurn) line = 'Sending your action…';
  else if(meSeat.inHand && !meSeat.folded){
    if(mine && d.board.length) line = `${meSeat.allIn ? "You're all-in · " : 'You have '}<b>${esc(E.describe(E.evaluate(mine.concat(d.board.map(cs)))))}</b>`;
    else line = d.acting >= 0 ? `Waiting for ${esc((d.seats[d.acting] || {}).name || '')}…` : 'Dealing…';
    if(!meSeat.allIn && d.acting >= 0 && !d.result){
      const toCall = Math.min(Math.max(0, (d.cur || 0) - meSeat.bet), meSeat.stack);
      if(preAct && preAct.kind === 'check' && toCall > 0) preAct = null;
      if(preAct && preAct.kind === 'call' && preAct.amt !== toCall) preAct = null;
      const opts = toCall === 0
        ? [['checkfold', 'Check / Fold'], ['check', 'Check'], ['callany', 'Call any']]
        : [['checkfold', 'Fold'], ['call', `Call ${fmt(toCall)}`], ['callany', 'Call any']];
      pre = `<div class="preacts">${opts.map(([k, l]) => `<button data-pre="${k}" data-amt="${toCall}" aria-pressed="${!!(preAct && preAct.kind === k)}"><i></i>${l}</button>`).join('')}</div>`;
    }
  }
  else if(meSeat.inHand && meSeat.folded) line = 'You folded. Next hand coming up…';
  else line = d.phase === 'hand' ? 'You play from the next hand.' : 'Shuffling up…';
  c.innerHTML = `<div class="info-line">${line}</div>${pre}`;
  const bb = $('backBtn'); if(bb) bb.onclick = () => send({ t: 'back' });
  c.querySelectorAll('[data-pre]').forEach(btn => btn.onclick = () => {
    const k = btn.dataset.pre;
    preAct = preAct && preAct.kind === k ? null : { kind: k, key: streetKey, amt: +btn.dataset.amt };
    c.querySelectorAll('[data-pre]').forEach(x => x.setAttribute('aria-pressed', !!(preAct && preAct.kind === x.dataset.pre)));
    if(navigator.vibrate) try{ navigator.vibrate(15); }catch(e){}
  });
}
function sendAction(d, a){
  lastSent = d.tid + ':' + d.handNo + ':' + d.seq;
  if(d.tid === 'demo' && demo){ if(navigator.vibrate) try{ navigator.vibrate(20); }catch(e){} $('controls').innerHTML = '<div class="info-line">…</div>'; return demo.answer(a); }
  const words = { fold: 'Fold', check: 'Check', call: 'Call', raise: 'Raise' };
  $('controls').innerHTML = `<div class="info-line">${words[a.t] || ''}${a.t === 'raise' ? ' to ' + fmt(a.to) : ''} · sending…</div>`;
  if(navigator.vibrate) try{ navigator.vibrate(20); }catch(e){}
  send({ t: 'act', tid: d.tid, hand: d.handNo, seq: d.seq, a });
}
// the action clock, plus the extra-time button: 3 cards a tournament (5 more at the final table), +30 seconds each
function turnBarHTML(d){
  const x = d.extras || 0;
  return `${demo ? '' : `<div class="xtime-row"><button type="button" class="xtime" data-xtime ${x ? '' : 'disabled'}>⏱ +30s<small>${x} left</small></button></div>`}<div class="turnbar"><i id="turnBar"></i><span id="turnSecs" class="num"></span></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-xtime]'); if(!b || b.disabled) return;
  send({ t: 'extend' }); b.disabled = true;
});
function drawActions(d, meSeat){
  const L = d.legal, c = $('controls');
  const allInOnly = L.canRaise && L.minTo >= L.maxTo;
  const word = L.isBet ? 'Bet' : 'Raise';
  const callAll = !L.canCheck && L.toCall >= meSeat.stack;
  c.innerHTML = `${turnBarHTML(d)}<div class="act-main" style="--n:${(L.canCheck ? 1 : 2) + (L.canRaise ? 1 : 0)}">
    ${L.canCheck ? '' : '<button class="act-btn fold" id="aFold"><b>Fold</b></button>'}
    <button class="act-btn call" id="aCall"><b>${L.canCheck ? 'Check' : callAll ? 'All-in' : 'Call'}</b>${L.canCheck ? '' : `<span class="num">${fmt(L.toCall)}</span>`}</button>
    ${L.canRaise ? `<button class="act-btn raise" id="aRaise"><b>${allInOnly ? 'All-in' : word}</b>${allInOnly ? `<span class="num">${fmt(L.maxTo)}</span>` : '<span>Choose amount</span>'}</button>` : ''}
  </div>`;
  if($('aFold')) $('aFold').onclick = () => sendAction(d, { t: 'fold' });
  $('aCall').onclick = () => sendAction(d, L.canCheck ? { t: 'check' } : { t: 'call' });
  if(!L.canRaise) return;
  if(allInOnly){ $('aRaise').onclick = () => sendAction(d, { t: 'raise', to: L.maxTo }); return; }
  $('aRaise').onclick = () => drawSizing(d, meSeat);
  tickClock();
}
// Bet sizing panel: presets in big blinds before the flop and in pot fractions after it, a slider, then confirm.
function drawSizing(d, meSeat){
  const L = d.legal, c = $('controls'), bb = L.bb || d.blinds[1];
  const word = L.isBet ? 'Bet' : 'Raise to';
  const round = v => v >= L.maxTo ? L.maxTo : Math.round(v / 100) * 100;
  const potTo = f => round(L.cur + f * (L.pot + L.toCall));
  const raw = d.street === 0
    ? [['2.5 BB', round(2.5 * bb)], ['3 BB', round(3 * bb)], ['4 BB', round(4 * bb)], ['Pot', potTo(1)]]
    : [['⅓ Pot', potTo(1 / 3)], ['½ Pot', potTo(.5)], ['¾ Pot', potTo(.75)], ['Pot', potTo(1)]];
  const seen = new Set(), presets = [];
  for(const [l, v] of raw){ const x = Math.max(L.minTo, Math.min(L.maxTo, v)); if(x < L.maxTo && !seen.has(x)){ seen.add(x); presets.push([l, x]); } }
  presets.push(['All-in', L.maxTo]);
  c.innerHTML = `${turnBarHTML(d)}
    <div class="sizing">
      <div class="amt"><small>${word === 'Bet' ? 'Bet' : 'Raise to'}</small><b id="szAmt" class="num"></b><span id="szBB" class="num"></span></div>
      <div class="sz-presets">${presets.map(([l, v]) => `<button data-to="${v}">${l}</button>`).join('')}</div>
      <div class="sz-slider"><button class="step" id="minus" aria-label="Less">−</button>
        <input type="range" id="raiseRange" aria-label="Amount" min="${L.minTo}" max="${L.maxTo}" step="1" value="${L.minTo}">
        <button class="step" id="plus" aria-label="More">+</button></div>
    </div>
    <div class="act-main" style="--n:2"><button class="act-btn back" id="szBack"><b>Back</b></button><button class="act-btn raise" id="szGo"><b id="szGoLbl"></b><span id="szGoAmt" class="num"></span></button></div>`;
  const rr = $('raiseRange'); let v = L.minTo;
  const set = x => {
    v = Math.max(L.minTo, Math.min(L.maxTo, x)); if(v < L.maxTo && v > L.minTo) v = round(v);
    rr.value = v; const allIn = v >= L.maxTo;
    $('szAmt').textContent = fmt(v); $('szBB').textContent = (Math.round(v / bb * 10) / 10) + ' BB';
    $('szGoLbl').textContent = allIn ? 'All-in' : word; $('szGoAmt').textContent = fmt(v);
    $('szGo').classList.toggle('allin', allIn);
    c.querySelectorAll('[data-to]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.to === v));
  };
  rr.oninput = () => set(+rr.value >= L.maxTo - 50 ? L.maxTo : +rr.value);
  const stepAmt = Math.max(100, Math.round(bb / 2 / 100) * 100);
  $('minus').onclick = () => set(v - stepAmt);
  $('plus').onclick = () => set(v + stepAmt);
  c.querySelectorAll('[data-to]').forEach(btn => btn.onclick = () => set(+btn.dataset.to));
  $('szBack').onclick = () => drawActions(d, meSeat);
  $('szGo').onclick = () => sendAction(d, { t: 'raise', to: v });
  set(d.street === 0 && presets.length > 2 ? presets[1][1] : presets[0][1]);
  tickClock();
}
function tickClock(){
  const T = demo ? demo.T : club && club.tourney;
  if(!T || T.status !== 'running' || view !== 'table') return;
  const now = Date.now() + clockSkew;
  const [sb, bb, an] = E.levelFor(T.level, T.anteMode), [nsb, nbb, nan] = E.levelFor(T.level + 1, T.anteMode);
  $('cLevel').textContent = T.level + 1;
  $('cBlinds').textContent = `${fmt(sb)}/${fmt(bb)}${an ? ' · ante ' + fmt(an) : ''}`;
  $('cNext').textContent = `Next: ${fmt(nsb)}/${fmt(nbb)}${nan ? ' · ante ' + fmt(nan) : ''}`;
  const ms = T.paused ? T.pausedLeft : Math.max(0, T.levelEndsAt - now), s = Math.ceil(ms / 1000);
  $('cTime').textContent = T.paused ? 'Paused' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('cTimeLbl').textContent = !T.paused && ms <= 0 ? 'Blinds up next hand' : 'Time left';
  $('sAvg').textContent = fmt(T.entrants * T.stack / Math.max(1, T.remaining));
  const d = tables.get(watchTid || club.myTable);
  const all = [...tables.values()].flatMap(t => t.seats.filter(Boolean));
  const me = all.find(p => p.uid === club.me.id);
  $('sPos').textContent = me ? `${ord(1 + all.filter(p => p.stack > me.stack).length)} at table` : 'Watching';
  const bar = document.querySelector('.shotBar');
  if(bar && d && d.deadline){ const left = Math.max(0, d.deadline - now); bar.style.transform = `scaleX(${Math.min(1, left / d.bank)})`; }
  const tbar = $('turnBar');
  if(tbar && d && d.deadline){ const left = Math.max(0, d.deadline - now), f = Math.min(1, left / d.bank); tbar.style.transform = `scaleX(${f})`; tbar.classList.toggle('low', !d.usingBank && left < 5000); tbar.classList.toggle('bank', !!d.usingBank); const ts = $('turnSecs'); if(ts) ts.textContent = (d.usingBank ? 'Extra time · ' : '') + Math.ceil(left / 1000) + 's'; }
}
setInterval(tickClock, 200);
window.addEventListener('resize', () => { if(view === 'table') renderTable(); });

function celebrate(){
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('confetti'), x = c.getContext('2d'); c.hidden = false; c.width = innerWidth; c.height = innerHeight;
  const cols = ['#f2a93b','#4a90f5','#e8ebf1','#4fd1a1','#9cc6ff'];
  const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .6, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * 6, w: 5 + Math.random() * 6, col: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now();
  (function frame(t){ x.clearRect(0, 0, c.width, c.height); ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.r += .1; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.col; x.fillRect(-p.w/2, -p.w/4, p.w, p.w/2); x.restore(); }); if(t - t0 < 4500) requestAnimationFrame(frame); else c.hidden = true; })(t0);
}


const on2 = (id, f) => { const el = $(id); if(el) el.onclick = f; };
function toast(text){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

// ---------- fair deal ----------
function fairHTML(seg){
  const T = club.tourney, past = club.history.filter(h => h.fairSeed).slice(0, 10);
  return `<div class="card-box"><span class="eyebrow">Fair deal</span>${seg}
    <h3>Nobody can set up a deck here. Not even the owner.</h3>
    <ol class="fair-steps">
      <li><b>Sealed before the first hand.</b> When a tournament starts, the server picks a secret number and shows everyone its fingerprint (the <i>shuffle seal</i>). The secret can't be swapped later without the fingerprint changing.</li>
      <li><b>A public lottery number for every hand.</b> Each deck is also mixed with a random number from <a href="https://drand.love" target="_blank" rel="noopener">drand</a>, a public randomness service run by universities and companies around the world. A new number comes out every 3 seconds and nobody can know it in advance, so nobody can choose which cards come.</li>
      <li><b>Check it yourself.</b> When the tournament ends the secret is revealed. Tap <b>Check the shuffle</b> and your own phone rebuilds every deck and compares it with the cards that were really dealt. One wrong card in one hand and it says so.</li>
    </ol>
    ${T && T.status === 'running' && T.seal ? `<p class="note">Seal for <b>${esc(T.name)}</b> (playing now):<br><code class="sealcode">${esc(T.seal)}</code><br>Take a screenshot. After the tournament, the check proves the revealed secret matches this seal.</p>` : ''}
    <p class="note">After a check you can also see every player's cards for every hand of that tournament, including folded hands. That's how you know nothing was hidden.${club.version ? ` Running code version <code>${esc(club.version)}</code>.` : ''}</p></div>
    <div class="card-box"><span class="eyebrow">Check a tournament</span>
    ${past.length ? `<div class="table-list">${past.map(h => `<div class="trow"><b>${esc(h.name)}</b><small>${new Date(h.endedAt).toLocaleDateString()} · ${h.entrants} players</small><button class="back" data-fair="${esc(h.id)}">Check</button></div>`).join('')}</div>`
      : '<div class="empty">Tournaments show up here after they finish.</div>'}</div>`;
}
const cardTxt = c => { const r = E.RANKS[E.rankOf(c) - 2], st = E.suitOf(c); return `<span class="mc ${st === 1 || st === 2 ? 'red' : ''}">${r === 'T' ? '10' : r}${E.SUITS[st]}</span>`; };
async function showFair(rep){
  document.querySelectorAll('[data-fair]').forEach(b => { b.disabled = false; b.textContent = b.closest('.trow') ? 'Check' : '🔒 Check the shuffle'; });
  if(!rep) return modal('<h2>Not found</h2><p>That tournament has no shuffle record.</p>', [{ label: 'OK', value: 1, primary: true }]);
  if(!rep.seed) return modal('<h2>Still sealed</h2><p>The secret is revealed when the tournament ends. Then you can check every hand.</p>', [{ label: 'OK', value: 1, primary: true }]);
  modal('<h2>Checking every hand…</h2><p id="fairProg">Rebuilding the decks on your phone.</p>', []);
  const r = await window.FAIR.verify(rep, (k, n) => { const el = $('fairProg'); if(el) el.textContent = `Checked ${k} of ${n} hands…`; });
  let beacons = '';
  const withRound = rep.hands.filter(h => h.round);
  if(withRound.length){
    const sample = withRound.slice(-5), res = await Promise.all(sample.map(h => window.FAIR.checkBeacon(rep, h)));
    const ok = res.filter(x => x === true).length, bad = res.filter(x => x === false).length;
    beacons = bad ? `<p class="bad">⚠️ ${bad} public random number(s) didn't match drand.</p>` : ok ? `<p class="good">✓ Asked drand directly: the public random numbers match (${ok} checked).</p>` : '<p class="note">Couldn\'t reach drand from this phone to double-check the public numbers.</p>';
  }
  const allOk = r.sealOk && r.bad === 0 && r.hands.length > 0;
  const list = r.hands.slice().reverse().map(h => `<details class="fh ${h.match ? '' : 'bad'}"><summary>${h.match ? '✓' : '✗'} Table ${esc(String(h.tid).split('-').pop())} · hand ${h.hand} <span>${h.board.map(cardTxt).join('')}</span></summary>
    <div>${h.players.map(p => `<div>${esc(p.name)} ${p.cards.map(cardTxt).join('')}</div>`).join('')}
    <small>${h.round ? `drand round <a href="${esc(rep.beaconUrl + h.round)}" target="_blank" rel="noopener">${h.round}</a>` : 'public number unavailable, local random used'}</small></div></details>`).join('');
  modal(`<h2>${allOk ? '✅ Every hand was dealt fairly' : r.hands.length ? '⚠️ Something doesn\'t match' : 'No hands recorded'}</h2>
    <p class="${r.sealOk ? 'good' : 'bad'}">${r.sealOk ? '✓' : '✗'} The revealed secret matches the seal shown before the first hand.</p>
    <p class="${r.bad ? 'bad' : 'good'}">${r.bad ? '✗' : '✓'} ${r.ok} of ${r.hands.length} hands match their deck exactly${r.bad ? `, ${r.bad} don't` : ''}.</p>
    ${beacons}${r.local ? `<p class="note">${r.local} hand(s) were dealt while the public randomness service couldn't be reached. Those still match the seal.</p>` : ''}
    <p class="note">Seal <code>${esc(rep.seal.slice(0, 16))}…</code> · Secret <code>${esc(rep.seed.slice(0, 16))}…</code></p>
    <div class="fair-list">${list}</div>`, [{ label: 'Done', value: 1, primary: true }]);
}

// ---------- table chat ----------
const chatLogs = new Map();
let chatOpen = false, chatUnread = 0;
const THROW_ICONS = { tomato: '🍅', rose: '🌹', beer: '🍺', egg: '🥚', fish: '🐟', clap: '👏', cake: '🎂', fire: '🔥', shark: '🦈', crown: '👑', diamond: '💎' };
const PERK_THROWS = ['shark', 'crown', 'diamond'];
const QUICK = ['gl', 'gg', 'nh', 'ty', 'wp', 'Nice hand!', 'Ship it!', 'So close!', '😂', '😮', '😎', '🙏', '🔥', '😭'];
const curTid = () => watchTid || (club && club.myTable);
function seatPosOf(uid){
  const d = tables.get(curTid()); if(!d) return null;
  const s = d.seats.findIndex(p => p && p.uid === uid); if(s < 0) return null;
  return layoutOf(d).posOf(s);
}
const seatName = uid => { const d = tables.get(curTid()); const p = d && d.seats.find(x => x && x.uid === uid); return p ? p.name : nameOf(uid); };
const isDemo = () => curTid() === 'demo' && !!demo;
// Chat and throws at the demo table stay on this phone; the practice players sometimes answer back.
function demoChat(m){
  const now = Date.now(), base = { id: 'd' + now + Math.random(), tid: 'demo', from: club.me.id, name: club.me.name, ts: now };
  onChat(m.t === 'chat' ? { ...base, kind: 'text', text: String(m.text).slice(0, 140) } : { ...base, kind: 'throw', item: m.item, to: m.to });
  const d = tables.get('demo'), bots = d ? d.seats.filter(p => p && p.uid !== club.me.id) : [];
  const who = m.t === 'throw' ? bots.find(p => p.uid === m.to) : bots[Math.floor(Math.random() * bots.length)];
  if(!who || Math.random() < .35) return;
  setTimeout(() => {
    if(!isDemo()) return;
    const b = { id: 'd' + Date.now() + Math.random(), tid: 'demo', from: who.uid, name: who.name, ts: Date.now() };
    if(m.t === 'throw' && Math.random() < .6) onChat({ ...b, kind: 'throw', item: ['tomato', 'egg', 'fish', 'rose'][Math.floor(Math.random() * 4)], to: club.me.id });
    else onChat({ ...b, kind: 'text', text: ['😂', 'hey!', 'gl', 'nh', 'lol', '😎', 'ty'][Math.floor(Math.random() * 7)] });
  }, 900 + Math.random() * 1200);
}
const sendChat = m => isDemo() ? demoChat(m) : send(m);
async function pickThrow(uid){
  const pick = await modal(`<h2>Throw something at ${esc(seatName(uid))}</h2><div class="throw-grid">${throwChoices().map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('')}</div>`, [{ label: 'Cancel', value: null }]);
  if(pick){ openChat(false); sendChat({ t: 'throw', item: pick, to: uid }); }
}
// Why a throw can't happen right now, or '' when it can.
function throwBlock(){
  if(isDemo()) return '';
  if(!club.myTable || club.myTable !== curTid()) return 'Sit at this table to throw things.';
  if(club.muted) return 'The organizer muted your chat.';
  if(club.chatOff && !club.me.owner) return 'Table chat is off.';
  return '';
}
function onChat(msg){
  const log = chatLogs.get(msg.tid) || []; log.push(msg); if(log.length > 40) log.shift(); chatLogs.set(msg.tid, log);
  if(view !== 'table' || msg.tid !== curTid()) return;
  if(chatOpen) renderChat(); else if(msg.from !== club.me.id){ chatUnread++; $('chatDot').hidden = false; }
  if(msg.kind === 'text') bubble(msg);
  else flyThrow(msg);
}
function bubble(msg){
  const pos = seatPosOf(msg.from); if(!pos) return;
  document.querySelectorAll(`.bubble[data-from="${CSS.escape(msg.from)}"]`).forEach(b => b.remove());
  const b = document.createElement('div'); b.className = 'bubble'; b.dataset.from = msg.from; b.textContent = msg.text;
  const [x, y] = pctToPx(pos), W = $('tableArea').clientWidth;
  b.style.top = (msg.from === club.me.id ? y - 70 : y) + 'px'; $('fx').appendChild(b);
  const half = b.offsetWidth / 2, cx = Math.max(half + 6, Math.min(W - half - 6, x));
  b.style.left = cx + 'px'; b.style.setProperty('--tail', (x - cx) + 'px');
  setTimeout(() => b.remove(), 4500);
}
function flyThrow(msg){
  const a = seatPosOf(msg.from), z = seatPosOf(msg.to); if(!a || !z) return;
  const el = document.createElement('div'); el.className = 'throw'; el.textContent = THROW_ICONS[msg.item] || '❓';
  const [ax, ay] = pctToPx(a), [zx, zy] = pctToPx(z);
  el.style.left = ax + 'px'; el.style.top = ay + 'px';
  $('fx').appendChild(el);
  el.animate([{ transform: 'translate(-50%,-50%) scale(.6) rotate(0)', offset: 0 },
    { transform: `translate(calc(-50% + ${(zx - ax) / 2}px), calc(-50% + ${(zy - ay) / 2 - 60}px)) scale(1.4) rotate(200deg)`, offset: .5 },
    { transform: `translate(calc(-50% + ${zx - ax}px), calc(-50% + ${zy - ay}px)) scale(1.1) rotate(400deg)`, offset: 1 }], { duration: 750, easing: 'ease-in-out', fill: 'forwards' })
    .finished.then(() => { el.classList.add('splat'); setTimeout(() => el.remove(), 1400); });
}
function renderChat(){
  const log = chatLogs.get(curTid()) || [];
  const muted = club.muted, off = club.chatOff && !club.me.owner;
  $('chatLog').innerHTML = log.length ? log.map(m => `<div class="cm ${m.from === club.me.id ? 'me' : ''}"><b style="color:${colorOf(m.from)}">${esc(m.name)}</b> ${m.kind === 'text' ? esc(m.text) : `threw ${THROW_ICONS[m.item] || ''} at ${esc(m.to === club.me.id ? 'you' : seatName(m.to))}`}</div>`).join('')
    : '<div class="note">Say hi to the table. Tap a player to throw something at them.</div>';
  $('chatLog').scrollTop = 1e9;
  const seated = isDemo() || (!!club.myTable && club.myTable === curTid());
  $('chatForm').hidden = !seated && !club.me.owner;
  $('chatQuick').hidden = $('chatForm').hidden;
  $('chatNote').textContent = off ? 'The organizer turned table chat off.' : muted ? 'The organizer muted your chat.' : !seated && !club.me.owner ? 'Only players at this table can chat. You can read along.' : 'Club rule (WSOP): never talk about a hand that is still being played, and never say what you folded.';
  $('chatInput').disabled = off || muted;
}
function openChat(open){
  chatOpen = open; $('chatSheet').hidden = !open;
  if(open){ chatUnread = 0; $('chatDot').hidden = true; renderChat(); }
}
$('chatBtn').onclick = () => openChat(!chatOpen);
$('chatClose').onclick = () => openChat(false);
$('chatQuick').innerHTML = QUICK.map(q => `<button type="button">${esc(q)}</button>`).join('');
$('chatQuick').onclick = e => { const b = e.target.closest('button'); if(b) sendChat({ t: 'chat', text: b.textContent }); };
$('chatForm').onsubmit = e => { e.preventDefault(); const v = $('chatInput').value.trim(); if(v){ sendChat({ t: 'chat', text: v }); $('chatInput').value = ''; } };
$('throwBtn').onclick = async () => {
  const why = throwBlock(); if(why) return toast(why);
  const d = tables.get(curTid()), others = d ? d.seats.filter(p => p && p.uid !== club.me.id && !p.out) : [];
  if(!others.length) return toast('Nobody else is at the table.');
  const uid = others.length === 1 ? others[0].uid : await modal(`<h2>Who gets it?</h2><div class="throw-who">${others.map(p => `<button class="btn" data-v="${esc(p.uid)}">${esc(p.name)}</button>`).join('')}</div>`, [{ label: 'Cancel', value: null }]);
  if(uid) pickThrow(uid);
};
$('seats').addEventListener('click', e => {
  const seat = e.target.closest('.seat[data-uid]'); if(!seat) return;
  const uid = seat.dataset.uid;
  if(uid === club.me.id) return toast('Tap another player to throw something at them.');
  if(memberOf(uid)) return openProfile(uid);
  const why = throwBlock(); if(why) return toast(why);
  pickThrow(uid);
});


// ---------- coach: a private tip after each hand, tilt and patience coaching, report cards ----------
const NOTE_ICON = { mind: '🧘', mistake: '⚠️', good: '✅', luck: '🍀', tip: '💡' };
let weakStreak = 0, tipTimer = null;
const firstSentences = (t, n = 2) => (t.match(/.+?[.!?](?=\s|$)/g) || [t]).slice(0, n).join('').trim();
function onCoach(h){
  const T = club && club.tourney;
  if(!T || T.helper === false || view !== 'table') return;
  const order = ['mind', 'mistake', 'luck', 'good', 'tip'];
  const note = h.notes.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];
  if(note) return showTip(note.kind, note.title, firstSentences(note.text, note.kind === 'mind' ? 3 : 2));
  // patience: praise a run of good folds, the habit that separates pros from everyone else
  if(h.weakFold){ weakStreak++; if(weakStreak % 5 === 0) showTip('good', 'Patience', `You've folded ${weakStreak} weak hands in a row. Waiting for good spots is exactly what pros do.`); }
  else if(h.played) weakStreak = 0;
}
function showTip(kind, title, text){
  const el = $('coachTip'); clearTimeout(tipTimer);
  el.className = 'coachtip ' + kind; el.hidden = false;
  el.innerHTML = `<span class="ct-ic">${NOTE_ICON[kind] || '💡'}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div><button aria-label="Close">×</button>`;
  tipTimer = setTimeout(() => { el.hidden = true; }, kind === 'mind' ? 14000 : 10000);
}
$('coachTip').onclick = () => { $('coachTip').hidden = true; clearTimeout(tipTimer); };
const MINDSET = [
  'Judge yourself on decisions, not results. A good fold that would have won is still a good fold.',
  'You will lose with the best hand about one time in five. That is the game, not bad luck aimed at you.',
  'Feeling angry or rushed? Fold the next couple of marginal hands and let it pass.',
  'Patience wins tournaments: most hands should be folded, and that is fine.',
  'Never play a hand to get even. The chips you lost are gone; only the next decision matters.',
  'Short stack? Stay calm and wait for one good all-in spot. Panic shoves cost more than the blinds.'
];
async function showReport(r){
  if(!r.hands) return modal(`<h2>Report card</h2><p>No hands were recorded for you in ${esc(r.name)}.</p>`, [{ label: 'OK', value: 1, primary: true }]);
  const gc = { A: 'var(--good)', B: '#4a90f5', C: 'var(--gold)', D: '#e58a4d', E: 'var(--red)' }[r.grade];
  const row = (l, v, sub) => `<div class="rc-row"><span>${l}${sub ? `<small>${sub}</small>` : ''}</span><b>${v}</b></div>`;
  await modal(`<div class="prof rc"><div class="rc-head"><div class="rc-grade" style="--g:${gc}">${r.grade}</div><div><h2>Report card</h2><small>${esc(r.name)} · ${r.place ? ord(r.place) + ' of ' + r.entrants : ''} · ${r.hands} hands</small></div></div>
    <div class="rc-list">
      ${row('Clean decisions', r.clean + '%', 'Hands where the coach found no mistake')}
      ${r.patience != null ? row('Patience', r.patience + '%', `Folded ${r.weakFolds} of ${r.weak} weak hands`) : ''}
      ${row('Tilt moments', r.tilts ? `<span class="bad">${r.tilts}</span>` : '<span class="ok">None</span>', 'Mistakes right after losing a big pot')}
      ${r.calm ? row('Stayed calm', r.calm + '×', 'Kept playing well after a big loss') : ''}
      ${row('Played / raised', `${r.vpip}% / ${r.pfr}%`, 'Pros: play about 18 to 28%, raise most of them')}
    </div>
    ${r.good.length ? `<div class="eyebrow">What you did well</div><ul class="rc-ul">${r.good.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
    <div class="eyebrow">Work on next time</div>
    <p class="tipbox">${r.leak ? `<b>${esc(r.leak.title)}</b> (${r.leak.count}×). ` : ''}${esc(r.goal)}</p>
    <p class="note">🧘 ${esc(MINDSET[Math.floor(Math.random() * MINDSET.length)])}</p></div>`,
    [{ label: 'Review my hands', value: 'hands' }, { label: 'Done', value: null, primary: true }]).then(v => { if(v === 'hands'){ tab = 'learn'; learnSeg = 'hands'; openHand = null; send({ t: 'hands' }); renderLobby(); } });
}
document.addEventListener('click', e => { const b = e.target.closest('[data-report]'); if(b) send({ t: 'report', id: b.dataset.report }); });

// ---------- hand helper: what you have, your chance to win and whether a call pays ----------
const eqCache = new Map();
let helperMin = false; try{ helperMin = localStorage.getItem('stacked:helper') === 'min'; }catch(e){}
function preName(c){
  const [a, b] = c.slice().sort((x, y) => E.rankOf(y) - E.rankOf(x)), ra = E.rankOf(a), rb = E.rankOf(b);
  const N = { 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten', 9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five', 4: 'Four', 3: 'Three', 2: 'Two' };
  const P = { 14: 'Aces', 13: 'Kings', 12: 'Queens', 11: 'Jacks', 10: 'Tens', 9: 'Nines', 8: 'Eights', 7: 'Sevens', 6: 'Sixes', 5: 'Fives', 4: 'Fours', 3: 'Threes', 2: 'Twos' };
  if(ra === rb) return 'Pocket ' + P[ra];
  return `${N[ra]}-${N[rb]} ${E.suitOf(a) === E.suitOf(b) ? 'suited' : 'offsuit'}`;
}
function madeName(hole, board){
  const v = E.evaluate(hole.concat(board)), cat = E.category(v);
  // three of a kind with a pocket pair is a "set"
  if(cat === 3 && E.rankOf(hole[0]) === E.rankOf(hole[1]) && board.some(c => E.rankOf(c) === E.rankOf(hole[0]))) return 'Set of ' + E.describe(v).replace(/^Three of a Kind, /, '');
  // is the best hand all on the board?
  const boardOnly = board.length === 5 && E.evaluate(board) === v;
  // a pair that is only on the board helps everyone, so say so
  const cnt = {}; board.forEach(c => { const r = E.rankOf(c); cnt[r] = (cnt[r] || 0) + 1; });
  const holeR = hole.map(E.rankOf);
  if(!boardOnly && cat === 1 && Object.keys(cnt).some(r => cnt[r] >= 2 && !holeR.includes(+r))) return E.describe(v) + ' (on the board)';
  return E.describe(v) + (boardOnly ? ' (on the board)' : '');
}
function drawsOf(hole, board){
  if(board.length < 3 || board.length > 4) return '';
  const all = hole.concat(board), cur = E.category(E.evaluate(all));
  if(cur >= 4) return '';
  const used = new Set(all); let flushOuts = 0, straightOuts = 0;
  for(let c = 0; c < 52; c++){
    if(used.has(c)) continue;
    const cat = E.category(E.evaluate(all.concat([c])));
    if(cat === 5 || cat === 8) flushOuts++; else if(cat === 4) straightOuts++;
  }
  const parts = [];
  if(flushOuts) parts.push('flush draw');
  if(straightOuts) parts.push(straightOuts >= 8 ? 'open-ended straight draw' : 'gutshot straight draw');
  const outs = flushOuts + straightOuts;
  if(!outs) return '';
  const pct = board.length === 3 ? Math.min(outs * 4, 100) : outs * 2;
  return `${parts.join(' + ')} · ${outs} outs (about ${pct}% to hit${board.length === 3 ? ' by the river' : ' on the river'})`;
}
function equityFor(key, hole, board, nOpp){
  if(eqCache.has(key)) return eqCache.get(key);
  eqCache.set(key, null);
  setTimeout(() => {
    const e = E.equity(hole, board, nOpp, board.length === 5 ? 1200 : 1800);
    eqCache.set(key, e); if(eqCache.size > 60) eqCache.delete(eqCache.keys().next().value);
    if(view === 'table') renderTable();
  }, 30);
  return null;
}
function renderHelper(d, me, mine){
  const el = $('helper');
  const T = demo ? { helper: true } : club && club.tourney;
  const on = T && T.helper !== false && me && me.inHand && !me.folded && mine && d.phase === 'hand' && !d.result;
  if(!on){ el.hidden = true; return; }
  const board = d.board.map(cs), nOpp = d.seats.filter(p => p && p.inHand && !p.folded && p.uid !== club.me.id).length;
  if(!nOpp){ el.hidden = true; return; }
  const key = `${d.tid}:${d.handNo}:${d.board.join('')}:${nOpp}`;
  const eq = equityFor(key, mine, board, nOpp);
  const name = board.length ? madeName(mine, board) : preName(mine);
  const draw = drawsOf(mine, board);
  const L = d.legal && d.actUid === club.me.id ? d.legal : null;
  let advice = '', tone = '';
  if(eq != null){
    if(L && !L.canCheck){
      const need = L.toCall / (L.pot + L.toCall);
      if(eq >= need + .05){ advice = `Call needs ${Math.round(need * 100)}%, you have ${Math.round(eq * 100)}%: calling pays.${eq > .65 ? ' You can raise for value.' : ''}`; tone = 'good'; }
      else if(eq >= need - .03){ advice = `Close: call needs ${Math.round(need * 100)}%, you have ${Math.round(eq * 100)}%.`; tone = 'mid'; }
      else { advice = `Call needs ${Math.round(need * 100)}%, you have ${Math.round(eq * 100)}%: folding is fine.`; tone = 'bad'; }
    } else if(L){
      advice = eq > .6 ? 'Strong: bet for value.' : eq > .4 ? 'Medium: a small bet or a check both work.' : (board.length === 5 ? 'Weak: check, no need to put more in.' : 'Weak: check and see a free card.');
      tone = eq > .6 ? 'good' : eq > .4 ? 'mid' : 'bad';
    }
  }
  const pct = eq == null ? '…' : Math.round(eq * 100) + '%';
  const bar = eq == null ? 0 : Math.round(eq * 100);
  el.hidden = false;
  el.className = 'helper' + (helperMin ? ' min' : '');
  el.innerHTML = `<div class="h-top"><b class="h-name">${esc(name)}</b><span class="h-eq ${eq == null ? '' : eq > .5 ? 'good' : eq > .3 ? 'mid' : 'bad'}">${pct}<small> to win vs ${nOpp}</small></span></div>
    ${helperMin ? '' : `<div class="h-bar"><i style="width:${bar}%"></i></div>
    ${draw ? `<div class="h-line">🎯 ${esc(draw)}</div>` : ''}${advice ? `<div class="h-line ${tone}">💡 ${esc(advice)}</div>` : ''}`}`;
  el.onclick = () => { helperMin = !helperMin; try{ localStorage.setItem('stacked:helper', helperMin ? 'min' : ''); }catch(e){} renderTable(); };
}

// ---------- demo table: a practice game that runs only in this browser ----------
let demo = null;
const DEMO_NAMES = ['Ana', 'Ben', 'Carla', 'Dev', 'Eli'];
function demoSnap(){
  const g = demo.g, h = g.hand, live = !!(demo.inHand && h), res = live && h.result;
  const winSeat = res && res.showdown && res.pots.length ? res.pots[0].winners[0] : -1, winP = winSeat >= 0 ? g.seats[winSeat] : null;
  const name = s => g.seats[s] ? g.seats[s].name : '';
  let lines = null;
  if(res){
    const contested = res.pots.filter(q => q.elig.length > 1);
    lines = !res.showdown ? [`${name(res.pots[0].winners[0])} wins ${fmt(res.pots[0].amt)}`]
      : contested.map((q, i) => `${contested.length > 1 ? (i ? `Side pot ${i}: ` : 'Main pot: ') : ''}${q.winners.map(name).join(' & ')} ${q.winners.length > 1 ? 'split' : 'wins'} ${fmt(q.amt)} · ${E.describe(g.seats[q.winners[0]].val)}`);
  }
  return {
    tid: 'demo', n: 1, phase: live ? 'hand' : 'idle', handNo: live ? h.no : g.handNo, street: live ? h.street : 0, size: 6, allowed: [0, 1, 3, 4, 6, 7],
    seats: g.seats.map(p => {
      if(!p) return null;
      const inHand = live && h.players.includes(p);
      return { uid: p.uid, name: p.name, stack: p.stack, inHand, bet: inHand ? p.bet : 0, folded: inHand && p.folded, allIn: inHand && p.allIn, act: inHand ? p.act : '', lastAmt: inHand ? (p.lastAmt || 0) : 0,
        won: inHand && res ? (p.won || 0) : 0, shown: inHand && p.shown && !p.folded ? p.cards.map(E.cardStr) : null, cat: inHand && res && res.showdown && !p.folded && p.shown ? E.CAT[E.category(p.val)] : '', away: false };
    }),
    cur: live ? h.currentBet : 0, board: live ? h.board.map(E.cardStr) : [], pot: live ? E.potTotal(h) - h.players.reduce((a, p) => a + p.bet, 0) : 0,
    btn: g.btn, blinds: E.levelFor(g.level, 'each'), acting: demo.acting ? demo.acting.seat : -1, actUid: demo.acting ? demo.acting.uid : null, seq: demo.seq,
    deadline: demo.acting ? demo.acting.deadline : 0, bank: 20000, usingBank: false, legal: demo.acting ? demo.acting.legal : null,
    result: res ? { lines, winCards: winP && winP.best ? winP.best.map(E.cardStr) : [], showdown: !!res.showdown } : null, note: demo.note || ''
  };
}
function demoPublish(){
  if(!demo) return;
  const snap = demoSnap(); tables.set('demo', snap);
  const me = demo.g.hand && demo.inHand && demo.g.hand.players.find(p => p.uid === club.me.id);
  if(me) myCards.set('demo', { hand: demo.g.hand.no, cards: me.cards.map(E.cardStr) });
  if(view === 'table' && watchTid === 'demo') renderTable();
}
const dsleep = ms => new Promise(r => setTimeout(r, ms));
function startDemo(){
  stopDemo();
  const styles = Object.keys(E.STYLES);
  const players = [{ name: club.me.name, isHero: true }].concat(DEMO_NAMES.map((n, i) => ({ name: n, style: styles[i % styles.length] })));
  const g = E.newGame({ players, stack: 30000, levelMs: 3 * 60000 });
  const seats = Array(9).fill(null), al = [0, 1, 3, 4, 6, 7];
  g.seats.filter(Boolean).forEach((p, i) => { p.uid = i === 0 ? club.me.id : 'demo-' + i; seats[al[i]] = p; });
  g.seats = seats; g.anteMode = 'each';
  demo = { g, seq: 0, acting: null, inHand: false, stopped: false, note: 'Demo table: practice players, nothing is saved.',
    T: { status: 'running', level: 0, levelEndsAt: Date.now() + 3 * 60000, entrants: 6, stack: 30000, remaining: 6, anteMode: 'each', places: [] }, answer: () => {} };
  watchTid = 'demo'; view = 'table'; seen = new Set(); showScreen('game'); chatLogs.delete('demo');
  demoLoop(demo);
}
function stopDemo(){
  if(!demo) return;
  demo.stopped = true; demo.answer({ t: 'fold' }); demo = null; tables.delete('demo'); myCards.delete('demo');
  chatLogs.delete('demo'); if(watchTid === 'demo') watchTid = null;
}
async function demoLoop(D){
  const g = D.g;
  const io = {
    rng: Math.random,
    async event(type){
      if(D.stopped) throw new Error('demo stopped');
      demoPublish();
      const h = g.hand, wait = { deal: 900, action: 250, collect: 300, board: 700, showdown: h && h.result && h.result.showdown ? 3000 : 1200 }[type] || 0;
      if(wait) await dsleep(wait);
    },
    async think(){ await dsleep(350 + Math.random() * 450); },
    heroAction: (p, L) => new Promise(res => {
      D.seq++;
      const h = g.hand;
      D.acting = { seat: p.seat, uid: p.uid, deadline: Date.now() + 20000, legal: { ...L, pot: E.potTotal(h), cur: h.currentBet, bb: h.bbAmt } };
      let done = false;
      const finish = a => { if(done) return; done = true; clearTimeout(timer); D.acting = null; res(a); };
      const timer = setTimeout(() => finish(L.canCheck ? { t: 'check' } : { t: 'fold' }), 20000);
      D.answer = finish;
      demoPublish();
    })
  };
  try{
    while(!D.stopped && !g.over){
      g.levelMsLeft = D.T.levelEndsAt - Date.now();
      D.inHand = true;
      await E.playHand(g, io);
      if(g.level !== D.T.level){ D.T.level = g.level; D.T.levelEndsAt = Date.now() + g.levelMsLeft; }
      D.inHand = false;
      D.T.remaining = g.seats.filter(Boolean).length;
      const heroIn = g.seats.some(p => p && p.uid === club.me.id);
      if(!heroIn || g.over){
        demoPublish();
        const won = heroIn && g.over;
        const again = await modal(`<h2>${won ? 'You won the demo 🏆' : 'You busted from the demo'}</h2><p>${won ? 'That is how a club tournament ends: one player takes every chip.' : `You finished ${ord(D.T.remaining + 1)} of 6.`} Nothing was saved.</p>`,
          [{ label: 'Back to lobby', value: false }, { label: 'Play again', value: true, primary: true }]);
        if(D.stopped) return;
        if(again) return startDemo();
        stopDemo(); view = 'lobby'; showScreen('lobby'); renderLobby(); return;
      }
      demoPublish();
      await dsleep(1200);
    }
  }catch(e){ if(!D.stopped) console.error(e); }
}

connect();
})();
