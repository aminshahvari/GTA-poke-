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
    if(m.t === 'invite'){ showInvite(m.code); return; }
    if(m.t === 'skillq'){ askSkill(m.rid, m.q); return; }
    if(m.t === 'claimed'){ modal('<h2>Prize claimed 🎉</h2><p>The organizer has been told and will get it to you. You can follow it under Prizes.</p>', [{ label: 'Great', value: 1, primary: true }]); return; }
    if(m.t === 'hands'){ myHands = m.hands; if(view === 'lobby' && tab === 'learn') renderLobby(); return; }
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
function eventHTML(){
  const T = club.tourney;
  if(!T || ['cancelled', 'finished'].includes(T.status) && !club.history.length && T.status !== 'finished'){
    return `<div class="card-box"><span class="status-pill idle">Nothing scheduled</span><h3>No tournament open right now</h3>
      <p>${club.me.owner ? 'Open the next one from the Director tab.' : 'When the club owner opens the next tournament, it shows up here and you can join.'}</p>${T && T.note ? `<p class="note">${esc(T.note)}</p>` : ''}</div>`;
  }
  if(T.status === 'registering'){
    const mine = T.regs.includes(club.me.id);
    return `<div class="card-box"><span class="status-pill">Registration open</span><h3>${esc(T.name)}</h3>
      <div class="kv num"><div><small>Starts</small><b>${T.startAt ? esc(when(T.startAt)) : 'When the owner starts it'}</b></div><div><small>Stack</small><b>${fmt(T.stack)}</b></div><div><small>Levels</small><b>${T.levelMin} min</b></div></div>
      ${T.repeat !== 'none' ? `<p class="note">Repeats ${T.repeat === 'daily' ? 'every day' : 'every week'} at this time.</p>` : ''}
      <p>${T.regs.length} joined</p>
      <div class="plist">${T.regs.map(u => pchip(u, false)).join('') || '<span class="note">Nobody has joined yet.</span>'}</div>
      <div class="btn-row">${mine ? '<button class="btn" id="leaveBtn">Leave</button>' : '<button class="btn red" id="joinBtn">Join tournament</button>'}</div>
      ${mine ? "<p>You're in. Your table opens by itself when the tournament starts.</p>" : ''}</div>${lastResultHTML()}`;
  }
  if(T.status === 'running'){
    const out = (T.places || []).find(r => r.uid === club.me.id);
    const [sb, bb] = E.levelAt(T.level);
    return `<div class="card-box"><span class="status-pill live">Live</span><h3>${esc(T.name)}</h3>
      <div class="kv num"><div><small>Players left</small><b>${T.remaining} of ${T.entrants}</b></div><div><small>Level</small><b>${T.level + 1}</b></div><div><small>Blinds</small><b>${fmt(sb)}/${fmt(bb)}</b></div></div>
      ${club.myTable ? `<button class="btn red" data-watch="${esc(club.myTable)}">Go to my table</button>` : out ? `<p>You finished ${ord(out.place)}. You can still watch.</p>` : '<p>You are not playing in this one. You can watch any table.</p>'}
      <div class="table-list">${club.tables.map(t => `<div class="trow"><b>Table ${t.n}</b><small>${t.players} players</small><button class="back" data-watch="${esc(t.tid)}">Watch</button></div>`).join('')}</div></div>`;
  }
  return `${T.status === 'cancelled' ? `<div class="card-box"><span class="status-pill idle">Cancelled</span><h3>${esc(T.name)}</h3><p>${esc(T.note || 'The owner cancelled this tournament.')}</p></div>` : ''}${lastResultHTML(T.status === 'finished')}`;
}
function lastResultHTML(primary){
  const h = club.history[0]; if(!h) return '';
  return `<div class="card-box"><span class="eyebrow">${primary ? 'Final results' : 'Last tournament'}</span><h3>${esc(h.name)}</h3>
    <p>${h.entrants} players · ${new Date(h.endedAt).toLocaleDateString()} · Champion: ${esc(h.results[0] ? h.results[0].name : '')}</p>
    <table class="tbl dark"><thead><tr><th>Place</th><th>Player</th><th>Payout</th><th>Points</th></tr></thead><tbody>
    ${h.results.map(r => `<tr class="${r.uid === club.me.id ? 'me' : ''}"><td>${ord(r.place)}</td><td>${esc(r.name)}</td><td>${h.payouts && h.payouts[r.place - 1] ? h.payouts[r.place - 1] + '%' : '–'}</td><td class="num">${r.pts}</td></tr>`).join('')}</tbody></table></div>`;
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
    <p class="note">Each link works once. Send it to one friend in WhatsApp or Telegram. They open it, pick a name and PIN, and they're in.</p>
    ${club.invites && club.invites.length ? `<div class="table-list">${club.invites.map(i => `<div class="trow"><b>Unused invite</b><small>${new Date(i.createdAt).toLocaleDateString()}</small><button class="back" data-copy="${esc(i.code)}">Copy</button><button class="back" data-revoke="${esc(i.code)}">Cancel</button></div>`).join('')}</div>` : ''}
    <div class="table-list">${club.members.map(m => { const hh = club.households && club.households[m.id], mates = hh ? club.members.filter(x => x.id !== m.id && club.households[x.id] === hh).map(x => x.name) : [];
      return `<div class="trow"><b>${esc(m.name)}</b><small>${m.role === 'owner' ? 'Owner' : 'Member since ' + new Date(m.createdAt).toLocaleDateString()}${mates.length ? ` · Home with ${esc(mates.join(', '))}` : ''}</small><span class="row-btns"><button class="back" data-home="${esc(m.id)}">Home</button>${m.role === 'owner' ? '' : `<button class="back" data-remove="${esc(m.id)}">Remove</button>`}</span></div>`; }).join('')}</div>
    <p class="note">Use <b>Home</b> to mark people who live together (for example a couple). They're never seated at the same table. Players on the same internet or the same phone are kept apart automatically.</p></div>`;
  if(!T || ['finished', 'cancelled'].includes(T.status)){
    const d = new Date(Date.now() + 864e5); d.setHours(20, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return `<div class="card-box"><span class="eyebrow">New tournament</span>
      <form class="form" id="newForm">
        <label>Name<input id="nName" maxlength="40" value="${esc(new Date().toLocaleDateString('en-US', { weekday: 'long' }))} Night Tournament"></label>
        <div class="two"><label>Starting stack<select id="nStack"><option>10000</option><option>20000</option><option selected>30000</option><option>50000</option></select></label>
        <label>Level length<select id="nLevel"><option value="5">5 min</option><option value="10">10 min</option><option value="15">15 min</option><option value="20" selected>20 min</option><option value="30">30 min</option></select></label></div>
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
  const seg = `<div class="seg2">${[['hands','My hands'],['lessons','Lessons'],['rules','Rules']].map(([k, l]) => `<button data-seg="${k}" aria-pressed="${learnSeg === k}">${l}</button>`).join('')}</div>`;
  if(learnSeg === 'lessons') return `<div class="card-box"><span class="eyebrow">Poker school</span>${seg}<p>Short lessons for tournament players. Start at the top.</p></div>
    ${window.LEARN.lessons.map((l, i) => `<details class="lesson card-box"><summary><span class="ln">${i + 1}</span><b>${esc(l.title)}</b><small>${l.mins} min</small></summary><div class="lbody">${l.body}</div></details>`).join('')}`;
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
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => showInvite(b.dataset.copy));
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
  on('inviteBtn', () => send({ t: 'invite' }));
  const nf = $('newForm');
  if(nf){
    $('nWhen').onchange = () => $('atWrap').hidden = $('nWhen').value !== 'at';
    nf.onsubmit = e => {
      e.preventDefault();
      const at = $('nWhen').value === 'at' ? new Date($('nAt').value).getTime() : null;
      send({ t: 'create', name: $('nName').value.trim(), stack: +$('nStack').value, levelMin: +$('nLevel').value, startAt: at, repeat: at ? $('nRepeat').value : 'none' });
      tab = 'event';
    };
  }
  on('startBtn', async () => { if(await modal(`<h2>Start ${esc(club.tourney.name)}?</h2><p>${club.tourney.regs.length} players will be seated now.</p>`, [{ label: 'Not yet', value: false }, { label: 'Shuffle up and deal', value: true, primary: true }])) send({ t: 'start' }); });
  on('cancelBtn', async () => { if(await modal('<h2>Cancel this tournament?</h2><p>Everyone who joined is taken off the list.</p>', [{ label: 'Keep it', value: false }, { label: 'Cancel it', value: true, primary: true }])) send({ t: 'cancel' }); });
  on('pauseBtn', () => send({ t: 'pause' }));
  on('resumeBtn', () => send({ t: 'resume' }));
  on('endBtn', async () => { if(await modal('<h2>End the tournament now?</h2><p>All tables close and no results are recorded.</p>', [{ label: 'Keep playing', value: false }, { label: 'End it', value: true, primary: true }])) send({ t: 'cancel' }); });
}
function showInvite(code){
  const url = location.origin + '/join/' + code;
  const text = `${club.me.name} invited you to the Stacked Live poker club. Tap to join:`;
  const enc = encodeURIComponent;
  modal(`<h2>Invite link</h2><p>Send this to one friend. It works once.</p>
    ${navigator.share ? '<button class="btn-red" id="shareBtn" style="width:100%;margin-bottom:10px">Share invite</button>' : ''}
    <div class="share-row"><a class="btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${enc(text + ' ' + url)}">WhatsApp</a><a class="btn-ghost" target="_blank" rel="noopener" href="https://t.me/share/url?url=${enc(url)}&text=${enc(text)}">Telegram</a><a class="btn-ghost" href="sms:?&body=${enc(text + ' ' + url)}">Text</a></div>
    <div class="copy-row"><input id="invUrl" readonly value="${esc(url)}"><button class="btn-ghost" id="copyBtn" style="width:auto;padding:9px 12px">Copy</button></div>`, [{ label: 'Done', value: 1 }]);
  $('copyBtn').onclick = () => { const i = $('invUrl'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => $('copyBtn').textContent = 'Copied').catch(() => { try{ document.execCommand('copy'); $('copyBtn').textContent = 'Copied'; }catch(e){} }); };
  const sb = $('shareBtn'); if(sb) sb.onclick = () => navigator.share({ title: 'Stacked Live invite', text, url }).catch(() => {});
}
function openTable(tid){ watchTid = tid; view = 'table'; seen = new Set(); showScreen('game'); send({ t: 'watch', tid }); renderTable(); }
$('lobbyBtn').onclick = () => { view = 'lobby'; send({ t: 'watch', tid: null }); showScreen('lobby'); renderLobby(); };

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
      ? `<div class="${cls}" style="left:${pos[0]}%;top:${pos[1]}%"><div class="hole">${hole}</div><div class="plate">${av}<div class="pl-txt"><div class="nm">${esc(p.name)}</div><div class="st num">${stackTxt}</div></div>${badge}${shot}</div></div>`
      : `<div class="${cls}" style="left:${pos[0]}%;top:${pos[1]}%"><div class="hole">${hole}</div>${av}<div class="plate"><div class="nm">${esc(p.name)}</div><div class="st num">${stackTxt}</div>${badge}${shot}</div></div>`;
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
function renderControls(d, mySeat, mine){
  const c = $('controls');
  const meSeat = mySeat >= 0 ? d.seats[mySeat] : null;
  const turnKey = d.tid + ':' + d.handNo + ':' + d.seq;
  const myTurn = meSeat && d.acting === mySeat && d.actUid === club.me.id && d.legal && d.phase === 'hand';
  if(myTurn && lastSent !== turnKey){
    if(c.dataset.turn === turnKey) return;
    c.dataset.turn = turnKey;
    if(navigator.vibrate) try{ navigator.vibrate(60); }catch(e){}
    return drawActions(d, meSeat);
  }
  c.dataset.turn = '';
  let line;
  const T = club.tourney, out = T && (T.places || []).find(r => r.uid === club.me.id);
  if(!meSeat) line = out ? `You finished ${ord(out.place)}. Watching Table ${d.n}.` : `Watching Table ${d.n}.`;
  else if(meSeat.away) line = `You're sitting out, so your hands fold automatically. <button class="btn green" id="backBtn" style="margin-left:6px;padding:6px 12px">I'm back</button>`;
  else if(myTurn) line = 'Sending your action…';
  else if(meSeat.inHand && !meSeat.folded){
    if(mine && d.board.length) line = `${meSeat.allIn ? "You're all-in · " : 'You have '}<b>${esc(E.describe(E.evaluate(mine.concat(d.board.map(cs)))))}</b>`;
    else line = d.acting >= 0 ? `Waiting for ${esc((d.seats[d.acting] || {}).name || '')}…` : 'Dealing…';
  }
  else if(meSeat.inHand && meSeat.folded) line = 'You folded. Next hand coming up…';
  else line = d.phase === 'hand' ? 'You play from the next hand.' : 'Shuffling up…';
  c.innerHTML = `<div class="info-line">${line}</div>`;
  const bb = $('backBtn'); if(bb) bb.onclick = () => send({ t: 'back' });
}
function sendAction(d, a){
  lastSent = d.tid + ':' + d.handNo + ':' + d.seq;
  $('controls').innerHTML = '<div class="info-line">Sending your action…</div>';
  send({ t: 'act', tid: d.tid, hand: d.handNo, seq: d.seq, a });
}
function drawActions(d, meSeat){
  const L = d.legal, c = $('controls');
  const allInOnly = L.canRaise && L.minTo >= L.maxTo;
  const word = L.isBet ? 'Bet' : 'Raise to';
  const potTo = f => Math.round((L.cur + f * (L.pot + L.toCall)) / 100) * 100;
  let html = '';
  if(L.canRaise && !allInOnly){
    html += `<div class="presets"><button data-to="${L.minTo}">Min</button><button data-to="${potTo(.5)}">½ Pot</button><button data-to="${potTo(1)}">Pot</button><button data-to="${L.maxTo}">All-in</button></div>
    <div class="slider-row"><button class="step" id="minus" aria-label="Smaller raise">−</button>
      <input type="range" id="raiseRange" aria-label="Raise amount" min="${L.minTo}" max="${L.maxTo}" step="100" value="${L.minTo}">
      <button class="step" id="plus" aria-label="Bigger raise">+</button><output id="raiseOut" class="num">${fmt(L.minTo)}</output></div>`;
  }
  html += `<div class="actions" style="--n:${(L.canCheck ? 1 : 2) + (L.canRaise ? 1 : 0)}">
    ${L.canCheck ? '' : '<button class="a-fold" id="aFold">Fold</button>'}
    <button class="a-call" id="aCall">${L.canCheck ? 'Check' : (L.toCall >= meSeat.stack ? `All-in<br>${fmt(L.toCall)}` : `Call<br>${fmt(L.toCall)}`)}</button>
    ${L.canRaise ? `<button class="a-raise" id="aRaise">${allInOnly ? `All-in<br>${fmt(L.maxTo)}` : `${word}<br><span id="raiseLbl" class="num">${fmt(L.minTo)}</span>`}</button>` : ''}
  </div>`;
  c.innerHTML = html;
  if($('aFold')) $('aFold').onclick = () => sendAction(d, { t: 'fold' });
  $('aCall').onclick = () => sendAction(d, L.canCheck ? { t: 'check' } : { t: 'call' });
  if(!L.canRaise) return;
  if(allInOnly){ $('aRaise').onclick = () => sendAction(d, { t: 'raise', to: L.maxTo }); return; }
  const rr = $('raiseRange');
  const set = v => { v = Math.max(L.minTo, Math.min(L.maxTo, v)); if(v < L.maxTo && v > L.minTo) v = Math.round(v / 100) * 100; rr.value = v; rr.dataset.v = v; $('raiseOut').textContent = fmt(v); $('raiseLbl').textContent = v >= L.maxTo ? 'All-in ' + fmt(v) : fmt(v); };
  rr.oninput = () => set(+rr.value >= L.maxTo - 99 ? L.maxTo : +rr.value);
  const stepAmt = Math.max(100, L.bb / 2);
  $('minus').onclick = () => set(+rr.dataset.v - stepAmt);
  $('plus').onclick = () => set(+rr.dataset.v + stepAmt);
  c.querySelectorAll('[data-to]').forEach(btn => btn.onclick = () => set(+btn.dataset.to));
  set(L.minTo);
  $('aRaise').onclick = () => sendAction(d, { t: 'raise', to: +rr.dataset.v });
}
function tickClock(){
  const T = club && club.tourney;
  if(!T || T.status !== 'running' || view !== 'table') return;
  const now = Date.now() + clockSkew;
  const [sb, bb, an] = E.levelAt(T.level), [nsb, nbb, nan] = E.levelAt(T.level + 1);
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

connect();
})();
