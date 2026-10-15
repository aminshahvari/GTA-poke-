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
  g.addColorStop(0, 'rgba(255,190,140,.55)'); g.addColorStop(.5, 'rgba(150,80,60,.35)'); g.addColorStop(1, 'rgba(60,40,40,0)');
  x.fillStyle = g; x.beginPath(); x.arc(W/2, W/2, R, 0, Math.PI*2); x.fill();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const pts = [];
  for(let i = 0; i < 70; i++){ const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R * .85; pts.push([W/2 + Math.cos(a)*r, W/2 + Math.sin(a)*r*.8]); }
  x.strokeStyle = 'rgba(255,220,190,.18)';
  pts.forEach((p, i) => pts.slice(i+1).forEach(q => { if(Math.hypot(p[0]-q[0], p[1]-q[1]) < 120){ x.beginPath(); x.moveTo(...p); x.lineTo(...q); x.stroke(); } }));
  pts.forEach(p => { x.fillStyle = 'rgba(255,230,200,.85)'; x.beginPath(); x.arc(p[0], p[1], 2 + rnd()*2.5, 0, Math.PI*2); x.fill(); });
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
  const titles = { join: "You're invited to the club", login: 'Welcome back', setup: 'Set up your club' };
  const blurbs = { join: 'Pick the name your friends will see at the table, and a PIN to sign in with.', login: 'Sign in with your table name and PIN.', setup: 'Enter the setup code, then pick your name and PIN. You become the club owner.' };
  f.innerHTML = `<h2>${titles[mode]}</h2><p>${blurbs[mode]}</p>
    ${mode === 'setup' ? '<div class="field"><label for="aCode">Setup code</label><input id="aCode" autocomplete="off"></div>' : ''}
    <div class="field"><label for="aName">Table name</label><input id="aName" maxlength="16" autocomplete="username" placeholder="e.g. Sean"></div>
    <div class="field"><label for="aPin">PIN (4 to 8 digits)</label><input id="aPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></div>
    ${mode !== 'login' ? '<label class="agree"><input type="checkbox" id="aAgree"> <span>I\'m 19 or older and agree to the <button type="button" class="linkbtn" id="termsLink">club rules and prize terms</button>. Free to play; chips and points have no cash value.</span></label>' : ''}
    <div class="err" id="aErr"></div>
    <button class="btn-red" type="submit">${mode === 'join' ? 'Join the club' : mode === 'setup' ? 'Create my club' : 'Sign in'}</button>
    ${mode === 'login' ? '<span class="fine">New here? Ask the club owner for an invite link.</span>' : '<button type="button" class="linkbtn" id="toLogin">I already have an account</button>'}`;
  const tl = $('toLogin'); if(tl) tl.onclick = () => authScreen('login');
  const tm = $('termsLink'); if(tm) tm.onclick = () => modal(`<h2>Club rules and prize terms</h2><div class="terms-modal">${window.LEARN.terms}</div>`, [{ label: 'Close', value: 1, primary: true }]);
  f.onsubmit = async e => {
    e.preventDefault();
    $('aErr').textContent = '';
    try{
      const body = { name: $('aName').value, pin: $('aPin').value, agree: !!($('aAgree') && $('aAgree').checked) };
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
    if(m.t === 'invite'){ showInvite(m.code, m.group); return; }
    if(m.t === 'skillq'){ askSkill(m.rid, m.q); return; }
    if(m.t === 'claimed'){ modal('<h2>Prize claimed 🎉</h2><p>The organizer has been told and will get it to you. You can follow it under Prizes.</p>', [{ label: 'Great', value: 1, primary: true }]); return; }
    if(m.t === 'hands'){ myHands = m.hands; if(view === 'lobby' && tab === 'learn') renderLobby(); return; }
    if(m.t === 'chat'){ onChat(m.msg); return; }
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
  $('meChip').innerHTML = `<span></span><button class="back" id="outBtn">Sign out</button>`;
  $('meChip').querySelector('span').textContent = c.me.name;
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
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(!b) return; tab = b.dataset.tab; if(tab === 'learn'){ openHand = null; send({ t: 'hands' }); } renderLobby(); $('lobbyBody').scrollTop = 0; });
const nameOf = uid => { const m = club.members.find(x => x.id === uid); if(m) return m.name; for(const h of club.history) for(const r of h.results) if(r.uid === uid) return r.name; return 'Former member'; };
const pchip = (uid, removable) => `<span class="pchip ${uid === club.me.id ? 'me' : ''}">${esc(nameOf(uid))}${removable ? `<button data-kick="${esc(uid)}" aria-label="Remove from tournament">×</button>` : ''}</span>`;
const when = ms => new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function renderLobby(){
  if(!club) return;
  document.querySelectorAll('#tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  const body = $('lobbyBody');
  body.innerHTML = tab === 'board' ? boardHTML() : tab === 'learn' ? learnHTML() : tab === 'director' && club.me.owner ? directorHTML() : eventHTML();
  wireLobby();
}
function ownerNextHTML(){
  const T = club.tourney;
  if(!club.me.owner || (T && ['registering', 'running'].includes(T.status))) return '';
  const name = T ? T.name : `${new Date().toLocaleDateString('en-US', { weekday: 'long' })} Night Tournament`;
  return `<div class="card-box next-box"><span class="eyebrow">Organizer</span><h3>Start the next tournament</h3>
    <p>${T ? `Same settings as last time: ${fmt(T.stack)} chips, ${T.levelMin}-minute levels, ${T.actSec || 20} seconds to act, ${T.anteMode === 'each' ? 'every player antes' : 'big blind ante'}.` : 'Opens registration so your friends can join.'}</p>
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
      <p class="note">${T.anteMode === 'each' ? 'Every player posts an ante each hand' : 'The big blind posts the ante for the table (WSOP/WPT style)'} · ${T.actSec || 20} seconds to act, plus a 30-second time bank for the whole tournament.</p>
      ${T.repeat !== 'none' ? `<p class="note">Repeats ${T.repeat === 'daily' ? 'every day' : 'every week'} at this time.</p>` : ''}
      <p>${T.regs.length} joined</p>
      <div class="plist">${T.regs.map(u => pchip(u, false)).join('') || '<span class="note">Nobody has joined yet.</span>'}</div>
      <div class="btn-row">${mine ? '<button class="btn" id="leaveBtn">Leave</button>' : '<button class="btn red" id="joinBtn">Join tournament</button>'}</div>
      ${mine ? "<p>You're in. Your table opens by itself when the tournament starts.</p>" : ''}
      ${club.me.owner ? `<div class="owner-row"><button class="btn" id="inviteBtn">Invite a friend</button><button class="btn red" id="startBtn" ${T.regs.length < 2 ? 'disabled' : ''}>Start now</button></div>
      ${T.regs.length < 2 ? '<p class="warn-note">You need at least 2 players to start. Send an invite, and ask your friend to tap <b>Join tournament</b>.</p>' : ''}` : ''}</div>${lastResultHTML()}`;
  }
  if(T.status === 'running'){
    const out = (T.places || []).find(r => r.uid === club.me.id);
    const [sb, bb] = E.levelFor(T.level, T.anteMode);
    return `<div class="card-box"><span class="status-pill live">Live</span><h3>${esc(T.name)}</h3>
      <div class="kv num"><div><small>Players left</small><b>${T.remaining} of ${T.entrants}</b></div><div><small>Level</small><b>${T.level + 1}</b></div><div><small>Blinds</small><b>${fmt(sb)}/${fmt(bb)}</b></div></div>
      ${club.myTable ? `<button class="btn red" data-watch="${esc(club.myTable)}">Go to my table</button>` : out ? `<p>You finished ${ord(out.place)}. You can still watch.</p>` : '<p>You are not playing in this one. You can watch any table.</p>'}
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
    ${h.fairSeed ? `<div class="btn-row"><button class="btn" data-fair="${esc(h.id)}">🔒 Check the shuffle</button></div>` : ''}</div>`;
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
      ${rows.map((r, i) => `<tr class="${r.uid === club.me.id ? 'me' : ''}"><td>${i + 1}</td><td>${esc(nameOf(r.uid))}</td><td class="num">${r.played}</td><td class="num">${r.wins}</td><td class="num">${r.cashes}</td><td class="num">${r.pts}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No finished tournaments in this period yet.</div>'}
    <p class="note">Points reward winning: places in the money earn payout % × players ÷ 10 (winning a 9-player tournament is 45 points), everyone else gets 1 for playing. Spend them on prizes under Prizes.</p></div>
    ${club.history.length ? `<div class="card-box"><span class="eyebrow">Past tournaments</span><div class="table-list">${club.history.slice(0, 30).map(h => `<div class="trow"><b>${esc(h.name)}</b><small>${new Date(h.endedAt).toLocaleDateString()} · ${h.entrants} players · ${esc(h.results[0] ? h.results[0].name : '')}</small></div>`).join('')}</div></div>` : ''}`;
}
function conflictsHTML(){
  const cs = club.conflicts || []; if(!cs.length) return '';
  return `<div class="card-box warn"><span class="eyebrow">Same table warning</span>
    <p>${cs.length === 1 ? 'These players' : 'These pairs'} share a home, an internet connection or a phone. ${club.tourney && club.tourney.status === 'running' ? 'There are not enough tables to split them.' : 'They will be seated at different tables when there are 2 or more tables; with one table they will sit together.'}</p>
    <ul class="acts">${cs.map(c => `<li>${esc(nameOf(c.a))} & ${esc(nameOf(c.b))} <small>${esc(c.reason)} · ${esc(c.where)}</small></li>`).join('')}</ul></div>`;
}
function directorHTML(){
  return conflictsHTML() + directorMainHTML() + prizeAdminHTML();
}
function directorMainHTML(){
  const T = club.tourney;
  const members = `<div class="card-box"><span class="eyebrow">Members · ${club.members.length}</span>
    <div class="btn-row"><button class="btn red" id="inviteBtn">Create invite link</button></div>
    <p class="note">Pick a <b>group link</b> for a WhatsApp or Telegram group (up to 20 people, 7 days), or a <b>personal link</b> for one friend. They open it, pick a name and PIN, and they're in.</p>
    ${club.invites && club.invites.length ? `<div class="table-list">${club.invites.map(i => `<div class="trow"><b>${i.multi ? 'Group link' : 'Unused invite'}</b><small>${i.multi ? `${i.used} of ${i.max} joined · until ${new Date(i.expiresAt).toLocaleDateString()}` : new Date(i.createdAt).toLocaleDateString()}</small><button class="back" data-copy="${esc(i.code)}" data-group="${i.multi ? 1 : ''}">Copy</button><button class="back" data-revoke="${esc(i.code)}">Cancel</button></div>`).join('')}</div>` : ''}
    <div class="table-list">${club.members.map(m => { const hh = club.households && club.households[m.id], mates = hh ? club.members.filter(x => x.id !== m.id && club.households[x.id] === hh).map(x => x.name) : [];
      return `<div class="trow"><b>${esc(m.name)}</b><small>${m.role === 'owner' ? 'Owner' : 'Member since ' + new Date(m.createdAt).toLocaleDateString()}${mates.length ? ` · Home with ${esc(mates.join(', '))}` : ''}</small><span class="row-btns">${m.role === 'owner' ? '' : `<button class="back" data-mute="${esc(m.id)}" data-on="${(club.mutedIds || []).includes(m.id) ? 1 : 0}">${(club.mutedIds || []).includes(m.id) ? 'Unmute' : 'Mute'}</button>`}<button class="back" data-home="${esc(m.id)}">Home</button>${m.role === 'owner' ? '' : `<button class="back" data-remove="${esc(m.id)}">Remove</button>`}</span></div>`; }).join('')}</div>
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
        <div class="two"><label>Ante<select id="nAnte"><option value="each" selected>Every player (online style)</option><option value="bb">Big blind ante (WSOP/WPT live)</option></select></label>
        <label>Time to act<select id="nAct"><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="20" selected>20 seconds</option><option value="30">30 seconds</option></select></label></div>
        <div class="two"><label>Start<select id="nWhen"><option value="manual">When I press Start</option><option value="at">At a set time</option></select></label>
        <label>Repeat<select id="nRepeat"><option value="none">Just once</option><option value="daily">Every day</option><option value="weekly">Every week</option></select></label></div>
        <label id="atWrap" hidden>Start time<input type="datetime-local" id="nAt" value="${local}"></label>
        <button class="btn red" type="submit">Open registration</button>
      </form>
      <p class="note">Tables of up to 9 are made automatically: 1 table for up to 9 players, 2 for up to 18, and so on. Players are moved to keep tables even, and tables merge as people bust, down to one final table. A repeating tournament opens again by itself at the same time.</p></div>${members}`;
  }
  if(T.status === 'registering'){
    return `<div class="card-box"><span class="status-pill">Registration open</span><h3>${esc(T.name)}</h3>
      <p>${T.regs.length} joined · ${Math.max(1, Math.ceil(T.regs.length / 9))} table${T.regs.length > 9 ? 's' : ''}${T.startAt ? ' · starts ' + esc(when(T.startAt)) : ''}</p>
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
  if(learnSeg === 'lessons') return `<div class="card-box"><span class="eyebrow">Poker school</span>${seg}<p>Short lessons for tournament players. Start at the top.</p></div>
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
  document.querySelectorAll('[data-fair]').forEach(b => b.onclick = () => { b.disabled = true; b.textContent = 'Checking…'; send({ t: 'fair', id: b.dataset.fair }); });
  document.querySelectorAll('[data-sealinfo]').forEach(a => a.onclick = e => { e.preventDefault(); tab = 'learn'; learnSeg = 'fair'; renderLobby(); });
  document.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => send({ t: 'mute', uid: b.dataset.mute, muted: b.dataset.on !== '1' }));
  on2('chatOffBtn', () => send({ t: 'chatOff', off: !club.chatOff }));
  document.querySelectorAll('[data-bseg]').forEach(b => b.onclick = () => { boardSeg = b.dataset.bseg; renderLobby(); });
  document.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => send({ t: 'skillq', rid: b.dataset.claim }));
  document.querySelectorAll('[data-rmrw]').forEach(b => b.onclick = async () => { if(await modal('<h2>Remove this prize?</h2><p>Claims already made stay on the list.</p>', [{ label: 'Keep', value: false }, { label: 'Remove', value: true, primary: true }])) send({ t: 'removeReward', id: b.dataset.rmrw }); });
  document.querySelectorAll('[data-rdone]').forEach(b => b.onclick = () => send({ t: 'redeemStatus', id: b.dataset.rdone, status: 'delivered' }));
  document.querySelectorAll('[data-rcancel]').forEach(b => b.onclick = async () => { if(await modal('<h2>Cancel this claim?</h2><p>The points go back to the player.</p>', [{ label: 'Keep', value: false }, { label: 'Cancel claim', value: true, primary: true }])) send({ t: 'redeemStatus', id: b.dataset.rcancel, status: 'cancelled' }); });
  const rf = $('rewardForm'); if(rf) rf.onsubmit = e => { e.preventDefault(); send({ t: 'addReward', name: $('rwName').value, cost: +$('rwCost').value, qty: +$('rwQty').value, value: $('rwValue').value }); };
  const on = (id, f) => { const el = $(id); if(el) el.onclick = f; };
  on('joinBtn', () => send({ t: 'join' }));
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
  on('againBtn', () => {
    const T = club.tourney, d = new Date();
    send({ t: 'create', name: T ? T.name : `${d.toLocaleDateString('en-US', { weekday: 'long' })} Night Tournament`, stack: T ? T.stack : 30000, levelMin: T ? T.levelMin : 20, startAt: null, repeat: 'none', anteMode: T && T.anteMode ? T.anteMode : 'each', actSec: T && T.actSec ? T.actSec : 20 });
    send({ t: 'join' }); tab = 'event';
  });
  on('newCustomBtn', () => { tab = 'director'; renderLobby(); });
  const nf = $('newForm');
  if(nf){
    $('nWhen').onchange = () => $('atWrap').hidden = $('nWhen').value !== 'at';
    nf.onsubmit = e => {
      e.preventDefault();
      const at = $('nWhen').value === 'at' ? new Date($('nAt').value).getTime() : null;
      send({ t: 'create', name: $('nName').value.trim(), stack: +$('nStack').value, levelMin: +$('nLevel').value, startAt: at, repeat: at ? $('nRepeat').value : 'none', anteMode: $('nAnte').value, actSec: +$('nAct').value });
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
  const v = await modal('<h2>Invite people</h2><p>A <b>group link</b> can go in a WhatsApp or Telegram group: up to 20 people can join with it for 7 days. A <b>personal link</b> works once, for one friend.</p>',
    [{ label: 'Cancel', value: null }, { label: 'Personal link', value: 'one' }, { label: 'Group link', value: 'group', primary: true }]);
  if(v) send({ t: 'invite', group: v === 'group' });
}
function showInvite(code, group){
  const url = location.origin + '/join/' + code;
  const text = group ? `${club.me.name} invited you to the Stacked Live poker club. Tap to join (pick your own name and PIN):` : `${club.me.name} invited you to the Stacked Live poker club. Tap to join:`;
  const enc = encodeURIComponent;
  modal(`<h2>${group ? 'Group invite link' : 'Invite link'}</h2><p>${group ? 'Post it in your group. Up to 20 people can join with it for the next 7 days. You can cancel it any time in Director.' : 'Send this to one friend. It works once.'}</p>
    ${navigator.share ? '<button class="btn-red" id="shareBtn" style="width:100%;margin-bottom:10px">Share invite</button>' : ''}
    <div class="share-row"><a class="btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${enc(text + ' ' + url)}">WhatsApp</a><a class="btn-ghost" target="_blank" rel="noopener" href="https://t.me/share/url?url=${enc(url)}&text=${enc(text)}">Telegram</a><a class="btn-ghost" href="sms:?&body=${enc(text + ' ' + url)}">Text</a></div>
    <div class="copy-row"><input id="invUrl" readonly value="${esc(url)}"><button class="btn-ghost" id="copyBtn" style="width:auto;padding:9px 12px">Copy</button></div>`, [{ label: 'Done', value: 1 }]);
  $('copyBtn').onclick = () => { const i = $('invUrl'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => $('copyBtn').textContent = 'Copied').catch(() => { try{ document.execCommand('copy'); $('copyBtn').textContent = 'Copied'; }catch(e){} }); };
  const sb = $('shareBtn'); if(sb) sb.onclick = () => navigator.share({ title: 'Stacked Live invite', text, url }).catch(() => {});
}
function openTable(tid){ if(tid !== watchTid){ chatUnread = 0; $('chatDot').hidden = true; } watchTid = tid; view = 'table'; seen = new Set(); showScreen('game'); send({ t: 'watch', tid }); renderTable(); }
$('lobbyBtn').onclick = () => { openChat(false); view = 'lobby'; send({ t: 'watch', tid: null }); showScreen('lobby'); renderLobby(); };

// ---------- table ----------
const POS = Array.from({ length: 9 }, (_, k) => { const a = (90 + k * 40) * Math.PI / 180; return [50 + 40 * Math.cos(a), 46 + 39.5 * Math.sin(a)]; });
POS[0] = [50, 83];
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
const COLORS = ['#a8452f','#8f3b6e','#2f6c8f','#3d7d5b','#9a7a24','#6b5aa6','#4b6670','#7b6a5c','#b8161f'];
const colorOf = uid => { let h = 0; for(const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };

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
  const rot = mySeat >= 0 ? mySeat : 0, posOf = s => POS[(s - rot + 9) % 9];
  const res = d.result, winCards = new Set((res && res.showdown ? res.winCards : []).map(cs));
  const handKey = d.tid + ':' + d.handNo;
  const mc = myCards.get(d.tid), mine = mc && mc.hand === d.handNo ? mc.cards.map(cs) : null;
  let html = '';
  for(let s = 0; s < 9; s++){
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
    const av = `<div class="av" style="--c:${colorOf(p.uid)}">${esc(initials(p.name))}</div>`;
    const shot = acting ? '<div class="shot"><i class="shotBar"></i></div>' : '';
    html += isMe
      ? `<div class="${cls}" data-uid="${esc(p.uid)}" style="left:${pos[0]}%;top:${pos[1]}%"><div class="hole">${hole}</div><div class="plate">${av}<div class="pl-txt"><div class="nm">${esc(p.name)}</div><div class="st num">${stackTxt}</div></div>${badge}${shot}</div></div>`
      : `<div class="${cls}" data-uid="${esc(p.uid)}" style="left:${pos[0]}%;top:${pos[1]}%"><div class="hole">${hole}</div>${av}<div class="plate"><div class="nm">${esc(p.name)}</div><div class="st num">${stackTxt}</div>${badge}${shot}</div></div>`;
    if(p.inHand && p.bet > 0){
      const bp = toward(pos, (s - rot + 9) % 9 === 0 ? .36 : .4), [bx, by] = pctToPx(bp), [sx, sy] = pctToPx(pos);
      const key = `b${handKey}-${d.street}-${s}-${p.bet}`, isNew = !seen.has(key); seen.add(key);
      html += `<div class="bet num ${isNew ? 'chipin' : ''}" style="left:${bp[0]}%;top:${bp[1]}%;--fx:${sx - bx}px;--fy:${sy - by}px">${chipsIcon(Math.min(3, 1 + Math.floor(p.bet / (d.blinds[1] * 3))))}${fmt(p.bet)}</div>`;
    }
  }
  if(d.btn >= 0 && d.phase === 'hand'){
    const pos = posOf(d.btn), dd = toward(pos, .2), atMe = (d.btn - rot + 9) % 9 === 0, side = atMe ? 17 : (pos[0] < 50 ? 4 : pos[0] > 50 ? -4 : 9);
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
  const words = { fold: 'Fold', check: 'Check', call: 'Call', raise: 'Raise' };
  $('controls').innerHTML = `<div class="info-line">${words[a.t] || ''}${a.t === 'raise' ? ' to ' + fmt(a.to) : ''} · sending…</div>`;
  if(navigator.vibrate) try{ navigator.vibrate(20); }catch(e){}
  send({ t: 'act', tid: d.tid, hand: d.handNo, seq: d.seq, a });
}
function drawActions(d, meSeat){
  const L = d.legal, c = $('controls');
  const allInOnly = L.canRaise && L.minTo >= L.maxTo;
  const word = L.isBet ? 'Bet' : 'Raise';
  const callAll = !L.canCheck && L.toCall >= meSeat.stack;
  const bar = '<div class="turnbar"><i id="turnBar"></i><span id="turnSecs" class="num"></span></div>';
  c.innerHTML = `${bar}<div class="act-main" style="--n:${(L.canCheck ? 1 : 2) + (L.canRaise ? 1 : 0)}">
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
  c.innerHTML = `<div class="turnbar"><i id="turnBar"></i><span id="turnSecs" class="num"></span></div>
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
  const T = club && club.tourney;
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
  if(tbar && d && d.deadline){ const left = Math.max(0, d.deadline - now), f = Math.min(1, left / d.bank); tbar.style.transform = `scaleX(${f})`; tbar.classList.toggle('low', !d.usingBank && left < 5000); tbar.classList.toggle('bank', !!d.usingBank); const ts = $('turnSecs'); if(ts) ts.textContent = (d.usingBank ? 'Time bank · ' : '') + Math.ceil(left / 1000) + 's'; }
}
setInterval(tickClock, 200);
window.addEventListener('resize', () => { if(view === 'table') renderTable(); });

function celebrate(){
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('confetti'), x = c.getContext('2d'); c.hidden = false; c.width = innerWidth; c.height = innerHeight;
  const cols = ['#e6bb68','#d3212d','#f5f0f0','#6fdcab','#f6dc95'];
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
const THROW_ICONS = { tomato: '🍅', rose: '🌹', beer: '🍺', egg: '🥚', fish: '🐟', clap: '👏', cake: '🎂', fire: '🔥' };
const QUICK = ['gl', 'gg', 'nh', 'ty', 'wp', 'Nice hand!', 'Ship it!', 'So close!', '😂', '😮', '😎', '🙏', '🔥', '😭'];
const curTid = () => watchTid || (club && club.myTable);
function seatPosOf(uid){
  const d = tables.get(curTid()); if(!d) return null;
  const s = d.seats.findIndex(p => p && p.uid === uid); if(s < 0) return null;
  const mySeat = d.seats.findIndex(p => p && p.uid === club.me.id), rot = mySeat >= 0 ? mySeat : 0;
  return POS[(s - rot + 9) % 9];
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
  $('chatLog').innerHTML = log.length ? log.map(m => `<div class="cm ${m.from === club.me.id ? 'me' : ''}"><b style="color:${colorOf(m.from)}">${esc(m.name)}</b> ${m.kind === 'text' ? esc(m.text) : `threw ${THROW_ICONS[m.item] || ''} at ${esc(nameOf(m.to))}`}</div>`).join('')
    : '<div class="note">Say hi to the table. Tap a player to throw something at them.</div>';
  $('chatLog').scrollTop = 1e9;
  const seated = !!club.myTable && club.myTable === curTid();
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
$('chatQuick').onclick = e => { const b = e.target.closest('button'); if(b) send({ t: 'chat', text: b.textContent }); };
$('chatForm').onsubmit = e => { e.preventDefault(); const v = $('chatInput').value.trim(); if(v){ send({ t: 'chat', text: v }); $('chatInput').value = ''; } };
$('seats').addEventListener('click', async e => {
  const seat = e.target.closest('.seat[data-uid]'); if(!seat) return;
  const uid = seat.dataset.uid; if(uid === club.me.id || !club.myTable || club.myTable !== curTid()) return;
  if(club.muted || (club.chatOff && !club.me.owner)) return toast(club.muted ? 'The organizer muted your chat.' : 'Table chat is off.');
  const pick = await modal(`<h2>Throw something at ${esc(nameOf(uid))}</h2><div class="throw-grid">${Object.entries(THROW_ICONS).map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('')}</div>`, [{ label: 'Cancel', value: null }]);
  if(pick) send({ t: 'throw', item: pick, to: uid });
});

connect();
})();
