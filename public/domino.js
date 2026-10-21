// Dominoes: the club's domino tournament on Home, the director's controls, and the Smart Scorepad (a full-screen sheet
// for one match). Everything shown comes from the server ('domino' pushes and dominoState); the scorepad only sends
// what happened at the table (a scoring play, the pips left in each hand, who went out) and never a score. Every tap
// has its own id, so one that is sent again after a lost connection is recorded once. See docs/domino/DESIGN.md.
(function(){
let C = null, V = null, pad = null, tv = false, skew = 0, clock = null;
const pending = new Map(); // opId -> { mid, op }: taps whose answer has not come back yet
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tapId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const T = () => V && V.t;
const matchOf = id => T() && T().matches.find(m => m.id === id);
const nameIn = (m, uid) => { for(const t of m.teams || []) for(const x of (t && t.members) || []) if(x.uid === uid) return x.name; const e = T() && T().entrants.find(x => x.uid === uid); return e ? e.name : 'Player'; };
const sideName = (m, i) => (m.sides[i] || []).map(uid => nameIn(m, uid)).join(' & ') || 'To be decided';
const STATUS = { waiting: 'Waiting for players', ready: 'Waiting for a table', live: 'Playing', review: 'Confirm the result', disputed: 'Disputed: the director decides', final: 'Final' };
const PRESET = { allfives: 'All Fives', block: 'Block', draw: 'Draw' };
const rulesLine = r => `${PRESET[r.preset]} · ${r.format === 'pairs' ? 'Partnership 2v2' : 'Heads-up 1v1'} · to ${r.target}`;
const clockText = m => { if(!m.endsAt) return ''; const left = m.endsAt - (Date.now() + skew); if(left <= 0) return m.status === 'live' ? 'Time: finish this hand' : ''; const s = Math.ceil(left / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

async function send(mid, op){
  pending.set(op.opId, { mid, op });
  try{
    const r = await C.post('/api/dominoOp', { mid, op });
    pending.delete(op.opId);
    if(r.match){ patch(r.match); }
    return r;
  }catch(e){
    // a refusal is final for this tap; only a dropped connection keeps it for a resend
    if(!/did not answer|Failed to fetch|NetworkError/i.test(e.message)) pending.delete(op.opId);
    C.toast(e.message); throw e;
  }
}
// after a reconnect: send again every tap whose answer was lost (same ids, so nothing counts twice)
function resend(){ for(const { mid, op } of [...pending.values()]) send(mid, op).catch(() => {}); }
function patch(m){ if(!T()) return; const i = T().matches.findIndex(x => x.id === m.id); if(i >= 0) T().matches[i] = { ...T().matches[i], ...m }; draw(); }
function onState(v){
  const first = !V; V = v; skew = v.now - Date.now();
  if(!first) resend();
  draw();
}
function draw(){ if(pad) drawPad(); if(tv) drawTV(); C.rerender(); }

// ---------- Home: the club's tournament ----------
function homeHTML(){
  if(!C || !C.on() || !V) return '';
  const t = T();
  if(!t || t.status === 'cancelled') return V.ranking && V.ranking.top.length ? `<div class="card-box dm-card"><span class="eyebrow">Dominoes</span><h3>Club rankings</h3>${rankHTML()}</div>` : '';
  const head = `<span class="eyebrow">Dominoes</span><h3>${esc(t.name)}</h3><p class="note">${esc(rulesLine(t.rules))}</p>`;
  if(t.status === 'registering') return `<div class="card-box dm-card">${head}
    <p>${t.entrants.length} registered${t.registered ? ' · <b>you\'re in</b>' : ''}</p>
    <div class="btn-row">${t.registered ? '<button class="btn" data-dm="leave">Leave</button>' : '<button class="btn red" data-dm="join">Register</button>'}</div></div>`;
  const mine = V.mine && matchOf(V.mine);
  if(t.status === 'running') return `<div class="card-box dm-card">${head}
    ${mine ? `<div class="dm-mine"><b>Your match${mine.table ? ' · Table ' + mine.table : ''}</b><span class="dm-big">${mine.scores[0]} – ${mine.scores[1]}</span><small>${esc(STATUS[mine.status])}</small></div>
      <div class="btn-row"><button class="btn red" data-dm="pad" data-mid="${esc(mine.id)}">Open scorepad</button></div>` : '<p>No match for you right now. The bracket is below.</p>'}
    ${listHTML(t)}</div>`;
  const champ = V.champion && V.champion.members.map(x => x.name).join(' & ');
  return `<div class="card-box dm-card">${head}<p>${champ ? `Winner: <b>${esc(champ)}</b>` : 'Finished.'}</p>${V.stats ? `<p class="note">Your dominoes: ${V.stats.won} won of ${V.stats.played}</p>` : ''}${rankHTML()}</div>`;
}
// the club's domino table: titles, then match wins (worked out on the server)
function rankHTML(){
  const r = V.ranking; if(!r || !r.top.length) return '';
  const me = C.me() && C.me().id, row = x => `<div class="trow dm-rank${x.uid === me ? ' me' : ''}"><span class="dm-rk">${x.rank}</span><b>${esc(x.name)}</b><small>${x.titles ? x.titles + (x.titles === 1 ? ' title · ' : ' titles · ') : ''}${x.won} won of ${x.played}</small></div>`;
  return `<div class="dm-ranks"><span class="eyebrow">Club rankings · dominoes</span><div class="table-list">${r.top.map(row).join('')}${r.me ? row(r.me) : ''}</div></div>`;
}
// where a match sits: its pod, its knockout round, or its playoff round (Final and Semi-final named)
function stageText(m){
  const p = m.place;
  if(p.pod) return 'Pod ' + esc(p.pod);
  const left = (p.stage === 'playoff' ? p.prounds - p.pround : null);
  const name = left === 0 ? 'Final' : left === 1 ? 'Semi-final' : null;
  return p.stage === 'playoff' ? 'Playoff · ' + (name || 'Round ' + p.pround) : 'Round ' + m.round;
}
function listHTML(t){
  const rows = t.matches.filter(m => m.status !== 'final' || m.result && m.result.by !== 'bye').map(m => `<div class="trow dm-row"><div class="dm-t"><b>${esc(sideName(m, 0))} v ${esc(sideName(m, 1))}</b>
    <small>${stageText(m)} · ${m.table ? 'Table ' + m.table + ' · ' : ''}${esc(STATUS[m.status])}${m.status !== 'waiting' && m.status !== 'ready' ? ` · ${m.scores[0]}–${m.scores[1]}` : ''}</small></div>
    ${V.owner && m.status !== 'waiting' ? `<button class="back" data-dm="pad" data-mid="${esc(m.id)}">Open</button>` : ''}</div>`).join('');
  const st = t.standings ? t.standings.map(p => `<p class="note"><b>Pod ${esc(p.pod)}</b>: ${p.rows.map(r => `${esc((t.teams.find(x => x.id === r.id) || { members: [] }).members.map(x => x.name).join(' & '))} ${r.wins}W`).join(' · ')}</p>`).join('') : '';
  return `<div class="table-list">${rows}</div>${st}`;
}

// ---------- Director ----------
function directorHTML(){
  if(!C || !C.on() || !V || !V.owner) return '';
  const t = T(), live = t && (t.status === 'registering' || t.status === 'running');
  if(!live){
    if(!V.canHost) return '';
    const opt = (v, l, s) => `<option value="${v}"${s ? ' selected' : ''}>${l}</option>`;
    return `<div class="card-box dm-card"><span class="eyebrow">Dominoes</span><h3>New domino tournament</h3>
      <form class="form" id="dmForm">
        <label>Name<input id="dmName" maxlength="60" placeholder="Tuesday Dominoes"></label>
        <div class="two"><label>Game<select id="dmPreset">${opt('allfives', 'All Fives', 1)}${opt('block', 'Block')}${opt('draw', 'Draw')}</select></label>
        <label>Players<select id="dmFormat">${opt('hu', 'Heads-up 1v1', 1)}${opt('pairs', 'Partnership 2v2')}</select></label></div>
        <div class="two"><label>Play to<select id="dmTarget">${opt('', 'Game default', 1)}${[50, 61, 100, 150, 200, 250].map(v => opt(v, v)).join('')}</select></label>
        <label>Format<select id="dmStruct">${opt('elim', 'Knockout', 1)}${opt('pods', 'Pods (round robin)')}</select></label></div>
        <div class="two dm-podopts" hidden><label>Pod size<select id="dmPod">${[3, 4, 5, 6].map(v => opt(v, v + ' per pod', v === 4)).join('')}</select></label>
        <label>Pods then<select id="dmAdv">${opt(0, 'Pods only', 1)}${opt(1, 'Playoff: pod winners')}${opt(2, 'Playoff: top 2 of each pod')}</select></label></div>
        <div class="two"><label>Tables<input id="dmTables" type="number" inputmode="numeric" min="1" max="50" value="4"></label>
        <label>Match time<select id="dmMin">${opt(0, 'No limit', 1)}${[20, 30, 45, 60].map(v => opt(v, v + ' min')).join('')}</select></label></div>
        <button class="btn red" type="submit">Open registration</button></form>
      <p class="note">Players play real dominoes at numbered tables and keep score on their phones. Both sides confirm each result; you settle disputes.</p></div>`;
  }
  const need = t.rules.perSide === 2 && t.status === 'registering';
  return `<div class="card-box dm-card"><span class="eyebrow">Dominoes · ${t.status === 'registering' ? 'Registration open' : 'Running'}</span><h3>${esc(t.name)}</h3>
    <p class="note">${esc(rulesLine(t.rules))} · ${t.tables} table${t.tables === 1 ? '' : 's'}${t.roundMin ? ' · ' + t.roundMin + ' min matches' : ''}</p>
    ${t.status === 'registering' ? `<p>${t.entrants.length} registered: ${t.entrants.map(e => esc(e.name)).join(', ') || 'nobody yet'}</p>
      ${need ? `<p class="note">${t.teams.length ? 'Partnerships: ' + t.teams.map(x => x.members.map(m => esc(m.name)).join(' & ')).join(' · ') : 'Set the partnerships before you start.'}</p>` : ''}
      <div class="btn-row">${need ? '<button class="btn" data-dm="teams">Draw partners</button>' : ''}<button class="btn red" data-dm="start">Start</button><button class="btn" data-dm="cancel">Cancel</button></div>`
    : `${listHTML(t)}<div class="btn-row"><button class="btn" data-dm="tv">TV board</button><button class="btn" data-dm="cancel">Cancel tournament</button></div>`}</div>`;
}

// ---------- the TV board: a read-only screen for the room (big scores by table, the queue, standings) ----------
function openTV(){ tv = true; drawTV(); const el = document.getElementById('dmTV'); if(el && el.requestFullscreen) el.requestFullscreen().catch(() => {}); if(!clock) clock = setInterval(tickClocks, 1000); }
function closeTV(){ tv = false; const el = document.getElementById('dmTV'); if(el) el.remove(); if(document.fullscreenElement) document.exitFullscreen().catch(() => {}); if(!pad){ clearInterval(clock); clock = null; } }
function tickClocks(){
  const el = document.getElementById('dmClock'), m = pad && matchOf(pad.mid); if(el && m) el.textContent = clockText(m);
  document.querySelectorAll('#dmTV [data-clock]').forEach(c => { const x = matchOf(c.dataset.clock); if(x) c.textContent = clockText(x); });
}
function drawTV(){
  const t = T(); if(!t){ closeTV(); return; }
  let el = document.getElementById('dmTV'); if(!el){ el = document.createElement('div'); el.id = 'dmTV'; el.className = 'dm-tv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'TV board'); (document.getElementById('lobby') || document.body).append(el); }
  const playing = t.matches.filter(m => ['live', 'review', 'disputed'].includes(m.status)).sort((a, b) => a.table - b.table);
  const queue = t.matches.filter(m => m.status === 'ready');
  const recent = t.matches.filter(m => m.status === 'final' && m.result && m.result.by !== 'bye').slice(-6).reverse();
  const tile = m => `<div class="dm-tile${m.status === 'live' ? '' : ' wait'}"><div class="dm-tile-h"><b>Table ${m.table}</b><small>${stageText(m)}</small><span data-clock="${esc(m.id)}">${clockText(m)}</span></div>
    <div class="dm-tile-s"><span>${esc(sideName(m, 0))}</span><b>${m.scores[0]}</b></div><div class="dm-tile-s"><span>${esc(sideName(m, 1))}</span><b>${m.scores[1]}</b></div>
    ${m.status !== 'live' ? `<small class="dm-tile-st">${esc(STATUS[m.status])}</small>` : ''}</div>`;
  const champ = V.champion && V.champion.members.map(x => x.name).join(' & ');
  const side = `${queue.length ? `<section><span class="eyebrow">Next up</span>${queue.slice(0, 6).map(m => `<p>${esc(sideName(m, 0))} v ${esc(sideName(m, 1))}<small>${stageText(m)}</small></p>`).join('')}</section>` : ''}
    ${recent.length ? `<section><span class="eyebrow">Results</span>${recent.map(m => `<p><b>${esc(sideName(m, m.result.winner))}</b> beat ${esc(sideName(m, 1 - m.result.winner))}<small>${m.scores[m.result.winner]}–${m.scores[1 - m.result.winner]} · ${stageText(m)}</small></p>`).join('')}</section>` : ''}
    ${t.standings ? t.standings.map(p => `<section><span class="eyebrow">Pod ${esc(p.pod)}</span>${p.rows.map((r, i) => `<p>${i + 1}. ${esc((t.teams.find(x => x.id === r.id) || { members: [] }).members.map(x => x.name).join(' & '))}<small>${r.wins}W ${r.losses}L · ${r.pf - r.pa >= 0 ? '+' : ''}${r.pf - r.pa}</small></p>`).join('')}</section>`).join('') : ''}`;
  el.innerHTML = `<div class="dm-tv-top"><div><span class="eyebrow">Blindrise Dominoes</span><h2>${esc(t.name)}</h2><small>${esc(rulesLine(t.rules))}</small></div><button class="back" data-tv="close">Close</button></div>
    ${t.status === 'finished' ? `<div class="dm-tv-champ"><span class="eyebrow">Winner</span><b>${esc(champ || 'Finished')}</b></div>` : ''}
    <div class="dm-tv-body"><div class="dm-tiles">${playing.map(tile).join('') || (t.status === 'running' ? '<p class="note">No match on a table right now.</p>' : '')}</div><aside>${side}</aside></div>`;
  el.querySelector('[data-tv=close]').onclick = closeTV;
}

// ---------- the scorepad ----------
function openPad(mid){ pad = { mid, sheet: null, side: 0 }; drawPad(); if(!clock) clock = setInterval(tickClocks, 1000); }
function closePad(){ pad = null; const el = document.getElementById('dmPad'); if(el) el.remove(); if(!tv){ clearInterval(clock); clock = null; } }
function drawPad(){
  const m = matchOf(pad.mid); if(!m){ closePad(); return; }
  let el = document.getElementById('dmPad'); if(!el){ el = document.createElement('div'); el.id = 'dmPad'; el.className = 'dm-pad'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Scorepad'); (document.getElementById('lobby') || document.body).append(el); }
  const me = C.me().id, mySide = m.sides[0].includes(me) ? 0 : m.sides[1].includes(me) ? 1 : -1, player = mySide >= 0, dir = V.owner;
  // new plays and hands while live; in review only Undo (a mistake found while confirming)
  const canScore = (m.status === 'live' || m.status === 'review') && (player || dir), canAdd = m.status === 'live' && (player || dir);
  const side = i => `<div class="dm-side${m.result && m.result.winner === i ? ' win' : ''}"><small>${esc(sideName(m, i))}${mySide === i ? ' · you' : ''}</small><b class="dm-score">${m.scores[i]}</b>${m.confirm[i] ? '<em>confirmed</em>' : ''}</div>`;
  const counts = m.rules.counts && canAdd ? `<div class="dm-counts"><div class="dm-seg" role="radiogroup" aria-label="Who scored">${[0, 1].map(i => `<button type="button" role="radio" aria-checked="${pad.side === i}" class="${pad.side === i ? 'on' : ''}" data-dmp="side" data-i="${i}">${esc(sideName(m, i))}</button>`).join('')}</div>
    <div class="dm-pts">${[5, 10, 15, 20, 25, 30].map(p => `<button type="button" class="dm-pt" data-dmp="count" data-p="${p}">+${p}</button>`).join('')}</div></div>` : '';
  const rec = m.events.filter(e => ['count', 'hand', 'correct', 'override', 'dispute'].includes(e.type)).slice().reverse().map(e => {
    const what = e.type === 'count' ? `Scoring play: ${esc(sideName(m, e.side))} +${e.points}` : e.type === 'override' ? `Director: ${esc(sideName(m, e.winner))} wins · ${esc(e.reason)}` : e.type === 'dispute' ? `Disputed: ${esc(e.reason)}`
      : `${e.type === 'correct' ? 'Corrected hand' : 'Hand'}${e.worth ? `: ${e.worth.side === null ? 'blocked, level, no score' : esc(sideName(m, e.worth.side)) + ' +' + e.worth.points}` : ''}`;
    return `<div class="trow dm-ev${e.undone ? ' undone' : ''}"><small>#${e.seq}</small><span>${what}</span>${canScore && !e.undone && e.worth ? `<button class="back" data-dmp="undo" data-seq="${e.seq}">Undo</button>` : ''}</div>`;
  }).join('') || '<p class="note">Nothing recorded yet.</p>';
  const foot = m.status === 'review' && player && !m.confirm[mySide] ? `<div class="btn-row"><button class="btn red" data-dmp="confirm">Confirm result</button><button class="btn" data-dmp="dispute">Dispute</button></div>`
    : m.status === 'review' ? '<p class="note">Waiting for the other side to confirm.</p>'
    : m.status === 'disputed' ? `<p class="note">Disputed: ${esc(m.dispute && m.dispute.reason)}. The director decides.</p>` : m.status === 'final' ? `<p class="dm-final">${esc(sideName(m, m.result.winner))} won${m.result.by === 'override' ? ' (director)' : m.result.by === 'time' ? ' on time' : ''}</p>` : '';
  el.innerHTML = `<div class="dm-top"><button class="back" data-dmp="close" aria-label="Close scorepad">Close</button><div><b>${m.table ? 'Table ' + m.table : 'Scorepad'}</b><small>${esc(rulesLine(m.rules))}</small></div><span class="dm-clock" id="dmClock">${clockText(m)}</span></div>
    <div class="dm-sides">${side(0)}<span class="dm-v">v</span>${side(1)}</div>
    <p class="dm-status">${esc(STATUS[m.status])} · hand ${m.hands + (m.status === 'live' ? 1 : 0)}</p>
    ${counts}${canAdd ? '<div class="btn-row"><button class="btn red" data-dmp="hand">End of hand</button></div>' : ''}
    ${foot}${dir && m.status !== 'waiting' && m.status !== 'ready' ? '<div class="btn-row"><button class="btn" data-dmp="override">Director: set result</button></div>' : ''}
    <div class="dm-rec"><span class="eyebrow">Record</span><div class="table-list">${rec}</div></div>`;
  el.querySelectorAll('[data-dmp]').forEach(b => b.onclick = () => padAction(b.dataset.dmp, b.dataset, m));
}
async function padAction(k, d, m){
  if(k === 'close') return closePad();
  if(k === 'side'){ pad.side = +d.i; return drawPad(); }
  if(k === 'count') return send(m.id, { opId: tapId(), type: 'count', side: pad.side, points: +d.p, base: m.seq }).catch(() => {});
  if(k === 'undo') return send(m.id, { opId: tapId(), type: 'undo', target: +d.seq, base: m.seq }).catch(() => {});
  if(k === 'confirm') return send(m.id, { opId: tapId(), type: 'confirm' }).catch(() => {});
  if(k === 'dispute'){
    let reason = ''; const p = C.modal(`<h2>What is wrong?</h2><div class="field"><label for="dmWhy">The director sees this</label><input id="dmWhy" maxlength="300"></div>`, [{ label: 'Back', value: false }, { label: 'Dispute', value: true, primary: true }]);
    document.getElementById('dmWhy').oninput = e => reason = e.target.value;
    if(await p) send(m.id, { opId: tapId(), type: 'dispute', reason }).catch(() => {});
    return;
  }
  if(k === 'override'){
    let reason = '', w = '0'; const p = C.modal(`<h2>Set the result</h2><div class="field"><label for="dmWin">Winner</label><select id="dmWin"><option value="0">${esc(sideName(m, 0))}</option><option value="1">${esc(sideName(m, 1))}</option></select></div><div class="field"><label for="dmWhy">Reason (kept in the record)</label><input id="dmWhy" maxlength="300"></div>`, [{ label: 'Back', value: false }, { label: 'Set result', value: true, primary: true }]);
    document.getElementById('dmWhy').oninput = e => reason = e.target.value; document.getElementById('dmWin').onchange = e => w = e.target.value;
    if(await p) send(m.id, { opId: tapId(), type: 'override', winner: +w, reason }).catch(() => {});
    return;
  }
  if(k === 'hand'){
    const all = m.sides.flat();
    const p = C.modal(`<h2>End of hand</h2><div class="field"><label for="dmEnd">How did it end?</label><select id="dmEnd">${all.map(uid => `<option value="out:${esc(uid)}">${esc(nameIn(m, uid))} went out</option>`).join('')}<option value="blocked">Blocked: nobody can play</option></select></div>
      <p class="note">Pips left in each hand (count the dots).</p><div class="dm-pips">${all.map(uid => `<label>${esc(nameIn(m, uid))}<input type="number" inputmode="numeric" min="0" max="84" data-uid="${esc(uid)}" class="dm-pip"></label>`).join('')}</div>`,
      [{ label: 'Back', value: false }, { label: 'Record hand', value: true, primary: true }]);
    const root = document.getElementById('modalRoot'), vals = {};
    let end = root.querySelector('#dmEnd').value;
    const sync = () => root.querySelectorAll('.dm-pip').forEach(i => { const out = end === 'out:' + i.dataset.uid; i.disabled = out; if(out){ i.value = '0'; vals[i.dataset.uid] = 0; } });
    root.querySelector('#dmEnd').onchange = e => { end = e.target.value; sync(); };
    root.querySelectorAll('.dm-pip').forEach(i => i.oninput = () => vals[i.dataset.uid] = i.value === '' ? null : +i.value);
    sync();
    if(!await p) return;
    const pips = {}; for(const uid of all) pips[uid] = vals[uid] == null ? NaN : vals[uid];
    const op = end === 'blocked' ? { type: 'hand', end: 'blocked', pips } : { type: 'hand', end: 'domino', out: end.slice(4), pips };
    return send(m.id, { opId: tapId(), base: m.seq, ...op }).catch(() => {});
  }
}

// ---------- buttons on Home and in the Director ----------
function wire(root){
  root.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => act(b.dataset.dm, b.dataset));
  const f = root.querySelector('#dmForm');
  if(f) f.querySelector('#dmStruct').onchange = e => f.querySelector('.dm-podopts').hidden = e.target.value !== 'pods';
  if(f) f.onsubmit = async e => { e.preventDefault();
    const v = id => document.getElementById(id).value;
    try{ const r = await C.post('/api/dominoCreate', { name: v('dmName'), preset: v('dmPreset'), format: v('dmFormat'), target: v('dmTarget') ? +v('dmTarget') : null, structure: v('dmStruct'), podSize: +v('dmPod'), advance: +v('dmAdv'), tables: +v('dmTables'), roundMin: +v('dmMin') }); document.activeElement.blur(); onState(r); C.toast('Registration is open.'); }
    catch(err){ C.toast(err.message); } };
}
async function act(k, d){
  if(k === 'pad') return openPad(d.mid);
  if(k === 'tv') return openTV();
  const call = { join: 'dominoJoin', leave: 'dominoLeave', start: 'dominoStart', teams: 'dominoTeams', cancel: 'dominoCancel' }[k];
  if(k === 'cancel' && !await C.modal('<h2>Cancel this domino tournament?</h2><p>Matches stop where they are. Everything recorded is kept.</p>', [{ label: 'Back', value: false }, { label: 'Cancel it', value: true, primary: true }])) return;
  try{ onState(await C.post('/api/' + call, k === 'teams' ? { mode: 'random' } : {})); }catch(e){ C.toast(e.message); }
}

window.Domino = { init(ctx){ C = ctx; }, onState, homeHTML, directorHTML, wire, openPad, state: () => V };
})();
