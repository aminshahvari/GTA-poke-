(() => {
'use strict';
const E = Engine;
const $ = id => document.getElementById(id);
// the quiet-luxury design (UI_QUIET on the server, preview only): the server marks the page, the app reads the mark
const QUIET = document.documentElement.dataset.ui === 'quiet';
// the Quiet Luxury board (UI_BOARD on the server, preview only; it takes the place of the quiet design when both are on)
const BOARD = document.documentElement.dataset.ui === 'board';
const fmt = n => Math.round(n).toLocaleString('en-US');
const ord = n => n + (['th','st','nd','rd'][(n % 100 - 20) % 10] || ['th','st','nd','rd'][n % 100] || 'th');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const local = {
  get(k, d){ try{ const v = localStorage.getItem('stacked:' + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('stacked:' + k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem('stacked:' + k); }catch(e){} }
};
const showScreen = id => { ['auth','lobby','game'].forEach(s => $(s).hidden = s !== id); keepAwake(id === 'game'); if(id !== 'lobby') document.querySelector('.app').classList.remove('wide'); };
// keep the phone screen on while a table is open, so it doesn't lock and sit you out between hands.
// The Wake Lock API first; where it is missing or refused (Instagram's in-app browser, older iOS, Low Power Mode)
// a muted, invisible, looping 16x16 video does the same job (the NoSleep.js trick). iOS often grants either only
// from a tap, so any tap at the table retries while nothing holds the screen on.
let wakeLock = null, wantAwake = false, asking = false, nosleep = null;
const NOSLEEP_MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMHbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlZ0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHObWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABeW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAATlzdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABDExhdmMgbGlieDI2NAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAe/+EAFmdCwB7ZHsBEAAADAAQAAAMACDxYuSABAAZoy4BlLIAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAAZAAAAGQAAAAYc3R0cwAAAAAAAAABAAAAAgAAQAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAgAAAAEAAAAcc3RzegAAAAAAAAAAAAAAAgAAAA8AAAAKAAAAFHN0Y28AAAAAAAAAAQAAAzcAAAA9dWR0YQAAADVtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAAhpbHN0AAAACGZyZWUAAAAhbWRhdAAAAAtliIQFvJigACFPgAAAAAZBmjgK+oA=';
const NOSLEEP_WEBM = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAG/EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OsggEMTbuMU6uEHFO7a1OsggGp7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBNgIRMYXZmV0GETGF2ZkSJiECfQAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhDuaygDgibCBELqBEJqBAhJUw2fQc3PNY8CLY8WIAAAAAAAAAAFnyJhFo4dFTkNPREVSRIeLTGF2YyBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAyLjAwMDAwMDAwMAAfQ7Z1w+eBAKOjgQAAgBACAJ0BKhAAEAAARwiFhYiZhIgCAgAMDWAA/v+rUICjmYED6ACxAQABEBAAGAAwP/QMAAAA/v+rUIAcU7trkbuPs4EAt4r3gQHxggFh8IED';
function noSleep(on){
  if(!on){ if(nosleep && !nosleep.paused) nosleep.pause(); return; }
  if(!nosleep){
    const v = nosleep = document.createElement('video');
    v.muted = v.loop = v.playsInline = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.className = 'nosleep'; v.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
    v.innerHTML = `<source src="${NOSLEEP_MP4}" type="video/mp4"><source src="${NOSLEEP_WEBM}" type="video/webm">`;
    document.body.appendChild(v);
  }
  if(nosleep.paused) nosleep.play().catch(() => {});
}
async function keepAwake(on){
  wantAwake = on;
  if(!on){ noSleep(false); if(wakeLock){ const w = wakeLock; wakeLock = null; try{ await w.release(); }catch(e){} } return; }
  if(wakeLock || asking || document.visibilityState !== 'visible') return;
  if('wakeLock' in navigator){
    asking = true;
    try{
      const w = await navigator.wakeLock.request('screen');
      w.addEventListener('release', () => { if(wakeLock === w) wakeLock = null; });
      if(!wantAwake){ w.release().catch(() => {}); return; }
      wakeLock = w; noSleep(false); return;
    }catch(e){ wakeLock = null; }
    finally{ asking = false; }
  }
  if(wantAwake) noSleep(true);
}
// touchend and click are what iOS counts as a tap; start the video inside the tap itself (iOS may refuse play() later)
const awakeTap = () => { if(wantAwake && !wakeLock){ noSleep(true); keepAwake(true); } };
document.addEventListener('touchend', awakeTap, { capture: true, passive: true });
document.addEventListener('click', awakeTap, true);
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible') return;
  if(wantAwake) keepAwake(true);
  // coming back to the app counts as being back at the table
  if(club) send({ t: 'back' });
  // and the connection is checked at once: after a lock or time in the background it may be dead though still "open"
  watchdog(true);
});
window.addEventListener('pageshow', () => watchdog(true));
window.addEventListener('online', () => watchdog(true));

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
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (local.get('token', '') || ''), ...clubHeader() }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: 'The club server did not answer. Try again.' }));
  if(j.error) throw new Error(j.error);
  return j;
}
// club switching (only when the server has it on): the club this app shows, sent with every call; the server checks membership
const clubHeader = () => { const id = local.get('club', null); return id ? { 'x-club': id } : {}; };
// welcome: what Blindrise is, then Join (needs an invite link) or Sign in; the forms below are unchanged
function welcomeScreen(){
  showScreen('auth');
  const invite = location.pathname.startsWith('/join/');
  $('auth').classList.remove('form-open');
  $('authForm').hidden = true; $('welcome').hidden = false; $('wNote').hidden = true; $('auth').scrollTop = 0;
  $('wInvite').hidden = !invite;
  $('wJoin').textContent = invite ? 'Accept invitation' : 'Join Blindrise';
  $('wJoin').onclick = () => { if(invite) authScreen('join'); else { $('wNote').hidden = false; $('wNote').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
  $('wSignIn').onclick = () => authScreen('login');
}
function authScreen(mode){
  showScreen('auth');
  const f = $('authForm');
  $('auth').classList.add('form-open'); $('welcome').hidden = true; f.hidden = false; $('auth').scrollTop = 0;
  const invite = location.pathname.startsWith('/join/') ? location.pathname.slice(6) : null;
  if(invite && mode !== 'login') mode = 'join';
  const titles = { join: "You're invited to the club", login: 'Welcome back', setup: 'Set up your club', reset: 'Reset the owner PIN' };
  const blurbs = { join: 'Pick the name your friends will see at the table, and a PIN to sign in with.', login: 'Sign in with your table name and PIN.', setup: 'Enter the setup code, then pick your name and PIN. You become the club owner.', reset: 'For the club owner: enter the setup code from when you created the club, then pick a new PIN. Members who forgot their PIN can ask the owner.' };
  f.innerHTML = `<h2>${titles[mode]}</h2><p>${blurbs[mode]}</p>
    ${mode === 'setup' || mode === 'reset' ? '<div class="field"><label for="aCode">Setup code</label><input id="aCode" autocomplete="off"></div>' : ''}
    ${mode === 'reset' ? '' : '<div class="field"><label for="aName">Table name</label><input id="aName" maxlength="16" autocomplete="username" placeholder="e.g. Sean"></div>'}
    <div class="field"><label for="aPin">${mode === 'reset' ? 'New PIN' : 'PIN'} (4 to 8 digits)</label><input id="aPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="${mode === 'login' ? 'Your PIN' : 'Choose a PIN'}"></div>
    ${mode === 'join' || mode === 'setup' ? '<label class="agree"><input type="checkbox" id="aAgree"> <span>I\'m 19 or older and agree to the <button type="button" class="linkbtn" id="termsLink">club rules and prize terms</button>. Free to play; chips and points have no cash value.</span></label>' : ''}
    <div class="err" id="aErr"></div>
    <button class="btn-red" type="submit">${mode === 'join' ? 'Join the club' : mode === 'setup' ? 'Create my club' : mode === 'reset' ? 'Save new PIN' : 'Sign in'}</button>
    ${mode === 'login' ? '<button type="button" class="linkbtn" id="toReset">Forgot your PIN?</button><span class="fine">New here? Ask the club owner for an invite link.</span>' : '<button type="button" class="linkbtn" id="toLogin">I already have an account</button>'}
    ${mode === 'setup' ? '' : '<button type="button" class="linkbtn back" id="toWelcome">‹ Back</button>'}`;
  const tw = $('toWelcome'); if(tw) tw.onclick = welcomeScreen;
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
      if(r.club) local.set('club', r.club);
      if(location.pathname !== '/') history.replaceState(null, '', '/');
      connect();
    }catch(err){ $('aErr').textContent = err.message; }
  };
}

// ---------- a club's public join page: /join/<club-slug> ----------
// Invite codes on /join/ are always 12 characters and club slugs never are, so any other /join/ path is a club's join page.
// The visitor leaves an email for that club only. The box must be ticked, and the server also needs the token that came
// with the consent text (fails closed). Joining twice with the same email gives the same answer and keeps one record.
let joinSlug = (() => { const m = /^\/join\/([a-z0-9-]{3,40})\/?$/.exec(location.pathname); return m && m[1].length !== 12 ? m[1] : null; })();
const clubTitle = name => /\bclub$/i.test(name) ? name : name + ' Club';
async function clubJoinScreen(){
  showScreen('auth');
  const a = $('auth'), box = $('clubJoin');
  a.classList.add('club-join'); a.classList.remove('form-open');
  $('welcome').hidden = true; $('authForm').hidden = true; box.hidden = false; a.scrollTop = 0;
  box.innerHTML = '<p class="cj-load">Loading…</p>';
  let info;
  try{ info = await post('/api/joinInfo', { slug: joinSlug }); }catch(e){ info = { club: false, error: e.message }; }
  const member = '<button type="button" class="linkbtn" id="cjMember">Already a member? Sign in</button>';
  if(!info.club){
    box.innerHTML = `<div class="cj-card"><h2 class="cj-title">${info.error ? "This page didn't load" : 'This club link is not active'}</h2>
      <p class="cj-lead">${info.error ? esc(info.error) : 'Ask the club owner for a new link or QR code.'}</p>${member}</div>`;
    $('cjMember').onclick = leaveJoin; return;
  }
  document.title = 'Join the ' + clubTitle(info.name);
  box.innerHTML = `<div class="cj-card">
    <div class="cj-av" aria-hidden="true">${esc(info.initials)}</div>
    <span class="cj-eyebrow">Private club on Blindrise</span>
    <h2 class="cj-title">Join the <em>${esc(clubTitle(info.name))}</em></h2>
    <ul class="cj-perks"><li>Meet &amp; connect with people in the club</li><li>Get exclusive club events &amp; updates</li><li>Free poker nights &amp; club tournaments</li></ul>
    <form class="cj-form" id="cjForm" novalidate>
      <label class="cj-field" for="cjEmail"><span>Email</span><input id="cjEmail" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="you@example.com"></label>
      <label class="cj-agree"><input type="checkbox" id="cjAgree"> <span>${esc(info.consent.text)}</span></label>
      <div class="err" id="cjErr" role="alert"></div>
      <button class="lux-btn" type="submit" id="cjGo">JOIN THE CLUB</button>
    </form>
    <p class="cj-fine">Free social play · No betting · No real money</p>
    <p class="cj-fine">Your email goes to this club only — never shared with other clubs.</p>
    ${member}</div>`;
  $('cjMember').onclick = leaveJoin;
  $('cjForm').onsubmit = async e => {
    e.preventDefault();
    const err = $('cjErr'), email = $('cjEmail').value.trim();
    err.textContent = '';
    if(!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)){ err.textContent = 'Please enter a valid email address.'; return; }
    // fail closed on the phone too: nothing is sent until the box is ticked
    if(!$('cjAgree').checked){ err.textContent = 'Please tick the box to agree, then tap Join.'; return; }
    $('cjGo').disabled = true;
    try{
      await post('/api/joinClub', { slug: info.slug, email, agree: true, token: info.token });
      $('cjForm').outerHTML = `<div class="cj-done" id="cjDone" role="status"><b>You're on the list</b><span>${esc(clubTitle(info.name))} has your email and will let you know about club events.</span></div>`;
    }catch(x){ err.textContent = x.message; $('cjGo').disabled = false; }
  };
}
function leaveJoin(){
  joinSlug = null;
  history.replaceState(null, '', '/');
  document.title = DOC_TITLE;
  $('auth').classList.remove('club-join'); $('clubJoin').hidden = true; $('clubJoin').innerHTML = '';
  if(local.get('token', null)) connect(); else authScreen('login');
}
const DOC_TITLE = document.title;

// ---------- connection ----------
let ws = null, club = null, retry = 0;
const tables = new Map();
const myCards = new Map(); // tid -> {hand, cards}
let editingT = false, tab = BOARD ? 'home' : 'event', view = 'lobby', watchTid = null, lastSent = null, seen = new Set(), lastStatus = null, lastMyTable = null, clockSkew = 0;
// Business Club (public/business.js) gets the few app helpers it needs; it builds its own DOM with textContent
// dominoes (server/domino, DOMINO=1 only): the club's tournament and the scorepad
window.Domino.init({ post, toast, modal, me: () => club.me, on: () => !!(club && club.domino),
  rerender: () => { if(club && view === 'lobby' && !(document.activeElement && document.activeElement.closest('#dmForm'))) renderLobby(); } });
window.BizClub.init({ post, toast, token: () => local.get('token', ''), clubHeader, me: () => club.me, tab: () => tab,
  openTab: t => { if(BOARD){ bFrom = t === 'biz' ? (tab === 'biz' ? bFrom : tab) : null; if(t === 'event') t = 'home'; } tab = t; view = 'lobby'; showScreen('lobby'); renderLobby(); $('lobbyBody').scrollTop = 0; },
  confirm: (title, text, ok) => modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p>`, [{ label: 'Cancel', value: false }, { label: esc(ok), value: true, primary: true }]) });
// The connection watchdog (2026-10-24: two players' screens froze at a live game, each showing an old table with their
// own seat Disconnected, until they left the page and came back). After a phone sleeps, changes network or sits in the
// background, its socket can stay "open" while nothing goes through either way (half-open): the browser fires no
// close, sends go nowhere, and the app used to wait for a close that never came. So the app checks for itself:
// - after HB_IDLE with nothing from the server it sends a tiny 'hb' that the server echoes at once; no echo within
//   HB_WAIT means the connection is dead (a page cannot see the protocol's own pings, so this is the app's own);
// - back from the lock screen or the background (visible, pageshow, online, or its timers having slept) it asks at
//   once and allows HB_WAKE, so a dead socket is found in about two seconds, not after the full wait;
// - a connection that has not opened, or not been answered, within CONNECT_WAIT is given up the same way.
// A dead connection is closed by the app, the table says plainly that the connection is lost, and the app dials again
// (at once, then with the usual backoff). The server's answer to the new hello is the whole state again (the club, then
// the table with this player's cards), which replaces what the app showed: no tap needed to be back in the live hand.
// Timings: the server counts a seat Disconnected after 5 s without a pong, so the app looks within about the same time
// (3 s idle + 4 s wait at worst, about 7 s); on a working phone connection the echo comes back in well under a second,
// and a false alarm only costs one quick reconnect. The heartbeat goes only when the server has been quiet: during a
// hand the table's own updates prove the connection, so it adds little traffic.
const HB_IDLE = 3000, HB_WAIT = 4000, HB_WAKE = 2500, CONNECT_WAIT = 8000;
let wantConn = false, dialAt = 0, heardAt = 0, hbAt = 0, hbWait = HB_WAIT, hbN = 0, hbRtt = 0, tickAt = Date.now(), redial = 0;
const actRtts = [];   // how long my acts took to come back as the next table state (for the server's connection log)
function connect(){
  const token = local.get('token', null);
  if(joinSlug) return clubJoinScreen();
  if(!token && location.pathname.startsWith('/join/')) return welcomeScreen();
  if(!token){ return post('/api/status', {}).then(s => s.hasOwner ? welcomeScreen() : authScreen('setup')).catch(() => welcomeScreen()); }
  // an old socket is let go without its handlers: its late close must not dial again over this new one
  if(ws){ const o = ws; ws = null; o.onopen = o.onmessage = o.onclose = o.onerror = null; try{ o.close(); }catch(e){} }
  clearTimeout(redial); redial = 0;
  live = false; wantConn = true; dialAt = Date.now(); hbAt = 0;
  const sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  // (the hello is answered at once with 'auth': until then it counts as an unanswered heartbeat)
  sock.onopen = () => { retry = 0; heardAt = hbAt = Date.now(); hbWait = HB_WAIT; let dev = local.get('device', null); if(!dev){ dev = Math.random().toString(36).slice(2) + Date.now().toString(36); local.set('device', dev); } sock.send(JSON.stringify({ t: 'hello', token, device: dev, club: local.get('club', null) || undefined, spectate: watching() || undefined })); };
  sock.onmessage = ev => {
    if(sock !== ws) return;   // (a socket already let go)
    heardAt = Date.now();
    const m = JSON.parse(ev.data);
    if(m.t === 'hb'){ if(m.n === hbN && hbAt){ hbRtt = Date.now() - hbAt; hbAt = 0; } return; }
    if(m.t === 'auth'){ if(hbAt) hbRtt = Date.now() - hbAt; hbAt = 0; live = !!m.ok; if(!m.ok){ wantConn = false; outbox = null; local.del('token'); ws = null; sock.onclose = null; sock.close(); connLost(false); authScreen('login'); if(m.reason === 'noclub') modal('<h2>Your club has closed</h2><p>The club you belonged to is no longer on Blindrise, so there is nothing to open with this account right now. A club owner can invite you with a new link.</p>', [{ label: 'OK', value: 1, primary: true }]); } else { $('offline').hidden = true; connLost(false); resync = true; if(view === 'lobby') showScreen('lobby'); if(watchTid) send({ t: 'watch', tid: watchTid }); send({ t: 'back' }); } return; }
    if(m.t === 'club'){
      // the first club state after a (re)connect is the whole truth: tables that closed meanwhile are forgotten
      if(resync){ resync = false; const open = new Set((m.club.tables || []).map(x => x.tid)); for(const tid of [...tables.keys()]) if(tid !== 'demo' && !open.has(tid) && tid !== m.club.myTable){ tables.delete(tid); myCards.delete(tid); } }
      if(outbox && m.club.myTable !== outbox.tid) outboxDrop();
      onClub(m.club); return;
    }
    if(m.t === 'domino'){ window.Domino.onState(m.v); return; }
    if(m.t === 'table'){ if(m.field){ field = m.field; if(m.field.watchers != null) watchBy.set(m.table.tid, m.field.watchers); } tables.set(m.table.tid, m.table); if(m.you) myCards.set(m.table.tid, m.you); outboxCheck(m.table); onTable(m.table); return; }
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
  // 4001: the server handed over to a new instance (deploy), so come back fast instead of backing off
  sock.onclose = e => { if(sock === ws) dropped(e.code === 4001 ? 250 + Math.random() * 750 : Math.min(8000, 500 * 2 ** retry++)); };
}
let resync = false;
const send = m => { if(ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
// the connection is gone (closed, or found dead by the watchdog): let the socket go, say so, dial again after `wait`
function dropped(wait){
  if(ws){ const o = ws; ws = null; o.onopen = o.onmessage = o.onclose = o.onerror = null; try{ o.close(4000, 'no answer'); }catch(e){} }
  $('offline').hidden = false; outboxDown(); connLost(true);
  clearTimeout(redial); redial = setTimeout(connect, wait);
}
// the watchdog's look at the connection: every second, and at once (wake) when the app comes back to the front
function watchdog(wake){
  const now = Date.now(), slept = now - tickAt > 5000; tickAt = now;
  if(!wantConn) return;
  // waiting out the backoff: coming back to the app (or the network coming back) dials now
  if(!ws){ if(wake || slept){ retry = 0; connect(); } return; }
  if(ws.readyState === 0){ if(now - dialAt > CONNECT_WAIT) dropped(Math.min(8000, 500 * 2 ** retry++)); return; }
  if(ws.readyState !== 1) return dropped(Math.min(8000, 500 * 2 ** retry++));
  // back at the front, or our own timers were asleep: whatever was asked before does not count, ask again now
  if(wake || slept) return heartbeat(HB_WAKE);
  if(hbAt && now - hbAt > hbWait) return dropped(0);   // asked and no answer: dead, though the socket still says open
  if(!hbAt && now - heardAt >= HB_IDLE) heartbeat(HB_WAIT);
}
function heartbeat(wait){
  hbAt = Date.now(); hbWait = wait; hbN++;
  send({ t: 'hb', n: hbN, ...(hbRtt ? { rtt: hbRtt } : {}), ...(actRtts.length ? { art: actRtts.splice(0) } : {}) });
}
setInterval(() => watchdog(false), 1000);
// the connection-lost state over the table: the felt dims and says so in words, so an old table never passes for the
// live one. The action buttons stay usable (a tap waits in the outbox and goes when the connection is back).
function connLost(on){
  const g = $('game'), area = $('tableArea');
  let el = $('connLost');
  if(on && !el){ el = document.createElement('div'); el.id = 'connLost'; el.className = 'connlost'; el.setAttribute('role', 'alert'); el.innerHTML = '<b>Connection lost</b><span>Reconnecting…</span>'; area.appendChild(el); }
  g.classList.toggle('conn-lost', !!on);
  if(el) el.hidden = !on;
}

const signOut = async () => { if(await modal('<h2>Sign out?</h2><p>You can sign back in with your name and PIN.</p>', [{ label:'Stay', value:false }, { label:'Sign out', value:true, primary:true }])){ local.del('token'); location.href = '/'; } };
function onClub(c){
  club = c; clockSkew = c.now - Date.now();
  if(local.get('askRemind', 0)){ local.del('askRemind'); if(c.tourney && c.tourney.status === 'registering' && c.tourney.regs.includes(c.me.id)){ setTimeout(() => toast(`You're signed up for ${c.tourney.name}.`), 300); setTimeout(offerReminder, 1500); } }
  if(c.clubSwitching) clubSwitching(c);
  // the Lounge's Exchange cards: start the feed now, not only when Home renders
  if(!c.suspended && !c.spectate && !c.events && (c.features && c.features.clubs || c.me.owner)) window.BizClub.prefetch();
  $('chatBtn').hidden = !!c.spectate; // watchers from another club never see a table's chat
  $('meChip').innerHTML = c.spectate ? `<button class="club-btn" data-live="home" aria-label="Back to ${esc(c.home.name)}">← ${esc(c.home.name)}</button>` : BOARD ? bTopHTML(c) : `${c.clubSwitching && c.clubs.length > 1 ? `<button class="club-btn" id="clubBtn" aria-label="Switch club">${esc(c.club.name)}</button>` : ''}<button class="me-btn" id="meBtn">${avHTML(c.me.id, c.me.name, 'sm')}<span>${esc(c.me.name.replace(/ \([^()]*\)$/, ''))}</span></button><button class="back" id="outBtn">Sign out</button>`;
  if(!c.spectate && !BOARD){
    $('meBtn').onclick = () => openProfile(c.me.id);
    if($('clubBtn')) $('clubBtn').onclick = pickClub;
    $('outBtn').onclick = signOut;
  }
  if($('dirTab')) $('dirTab').hidden = !c.me.owner;
  const st = c.tourney && c.tourney.status;
  if(st === 'finished' && lastStatus === 'running'){ view = 'lobby'; watchTid = null; showScreen('lobby'); tab = 'event'; celebrate(); }
  lastStatus = st;
  if(c.suspended && view === 'table'){ view = 'lobby'; watchTid = null; tables.clear(); showScreen('lobby'); }
  if(c.myTable && c.myTable !== lastMyTable && st === 'running'){ watchTid = c.myTable; view = 'table'; seen = new Set(); showScreen('game'); send({ t: 'watch', tid: watchTid }); }
  lastMyTable = c.myTable;
  // back from the sponsor's page: the break is over, so the player goes back to their seat
  if(leftForSponsor && !(c.tourney && c.tourney.id === leftForSponsor && c.tourney.status === 'running' && (c.tourney.breakUntil || c.tourney.breakPending || c.tourney.paused))){
    if(view === 'lobby' && c.myTable && st === 'running') openTable(c.myTable);
    leftForSponsor = null;
  }
  const typing = document.activeElement && $('lobbyBody').contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if(view === 'lobby'){ showScreen('lobby'); if(tab !== 'learn' && tab !== 'biz' && !typing) renderLobby(); } else renderTable();
}
// club switching: remember which club this is; a signed-in member who opens another club's invite link joins it
let joinTried = false;
function clubSwitching(c){
  if(c.spectate) return; // watching a Blindrise game: the app still belongs to the member's own club
  local.set('club', c.club.id);
  if(joinTried || !location.pathname.startsWith('/join/')) return;
  joinTried = true;
  const code = location.pathname.slice(6);
  history.replaceState(null, '', '/');
  post('/api/joinInvite', { code }).then(r => { if(r.club !== c.club.id){ local.set('club', r.club); location.replace('/'); } })
    .catch(e => modal(`<h2>That invite didn't work</h2><p>${esc(e.message)}</p>`, [{ label: 'OK', value: 1, primary: true }]));
}
async function pickClub(){
  const id = await modal(`<h2>Your clubs</h2><p>Same name and PIN everywhere. Each club has its own members and Exchange.</p><div class="club-list">${club.clubs.map(x => `<button class="club-pick${x.id === club.club.id ? ' on' : ''}" data-v="${esc(x.id)}">${esc(x.name)}${x.suspended ? ' <small class="cs-tag">Suspended</small>' : ''}</button>`).join('')}</div>`, [{ label: 'Close', value: null }]);
  if(id && id !== club.club.id){ local.set('club', id); location.replace('/'); }
}
// The whole tournament, like a TV broadcast (players' feedback, 2026-10-21): how many are still playing and at how many
// tables, the chip leader of every table, and how many are watching. From the server with every table update ('field').
let field = null;
// how many are watching each table: the server counts the watchers of the table each update is for, so a player seated
// at one table and looking at another keeps each table's own count (Issue #32 item 11)
const watchBy = new Map();
const watchersOf = d => d && watchBy.has(d.tid) ? watchBy.get(d.tid) : field ? field.watchers : null;
function fieldUI(){
  const el = $('fieldBar'), T = club && club.tourney;
  el.hidden = !field || !T || T.status !== 'running';
  if(BOARD) boardCol();
  hudPlace(); sideUI();
  if(el.hidden) return;
  if(BOARD){ boardField(el, T); return; }
  // laid out like a broadcast HUD (owner's design brief, 2026-10-21): the field, tables and watchers, the average stack,
  // the chip leader in gold, and your rank as a pill coloured by your stack against the average. Tap a chip count to see
  // it in big blinds (and back).
  const L = field.leader, meLead = L && field.rank === 1 && L.name === club.me.name, total = T.entrants || field.players, wn = watchersOf(tables.get(curTid())) || 0;
  const bb = E.levelFor(T.level, T.anteMode)[1], out = Math.max(0, Math.min(100, (1 - field.players / Math.max(1, total)) * 100));
  const mine = [...tables.values()].flatMap(t => t.seats.filter(Boolean)).find(p => p.uid === club.me.id), avg = T.entrants * T.stack / Math.max(1, T.remaining);
  const tone = !mine ? '' : mine.stack >= avg * 1.25 ? ' up' : mine.stack >= avg * .75 ? '' : ' down';
  const vs = mine && Math.abs(mine.stack - avg) > avg * .05 ? (mine.stack > avg ? `<span class="hud-vs up" title="Above the average stack">${Icons.svg('up')}</span>` : `<span class="hud-vs down" title="Below the average stack">${Icons.svg('down')}</span>`) : '';
  el.innerHTML = `<div class="hud-mod hud-field"><span class="hud-ico" aria-hidden="true">${Icons.svg('users')}</span><span class="hud-lbl"><i class="hud-dot" aria-hidden="true"></i>Players</span><b class="hud-val">${odo('players', field.players)}<small>/${total}</small></b><span class="hud-prog" aria-hidden="true"><i style="width:${out.toFixed(1)}%"></i></span></div>`
    + `<div class="hud-mod hud-badges"><span class="hud-badge hud-tb" title="Tables in play" aria-label="${field.tables} tables">${Icons.svg('table')}<b>${odo('tables', field.tables)}</b></span><span class="hud-badge" title="Watching now" aria-label="${wn} watching">${Icons.svg('eye')}<b>${odo('watch', wn)}</b><small class="hud-wl">watching</small></span></div>`
    + `<button type="button" class="hud-mod hud-avg" data-bbtoggle aria-label="Average stack. Tap to switch chips and big blinds"><span class="hud-lbl">Avg stack</span><b class="hud-val">${stackHTML('avg', avg, bb)}</b></button>`
    + (L ? `<button type="button" class="hud-mod hud-lead${meLead ? ' me' : ''}" data-bbtoggle aria-label="Chip leader ${esc(L.name)}. Tap to switch chips and big blinds">${Icons.svg('crown')}<span class="hud-lt"><span class="hud-lbl">Chip leader</span><b class="hud-name">${meLead ? 'You' : esc(L.name)}</b></span><span class="hud-chips"><b>${stackHTML('lead', L.stack, bb)}</b></span></button>` : '')
    + (field.rank ? `<div class="hud-mod hud-rank${tone}" title="Your place among everyone still playing"><span class="hud-lbl">Your rank</span><b class="hud-val">${vs}${odo('rank', ord(field.rank))}<small>/${field.players}</small></b></div>` : '');
  odoPlay(el);
}
// Upright on a phone (under 480 px wide) the HUD takes no room from the table (owner's ruling, 2026-10-22: the table
// keeps production's size and place to the pixel, at every table size; the added elements stay at the top and the room
// comes from the chrome, never from the felt). It stands in the header's own boxes, which keep their production heights:
// - two header rows (taller phones): the chat and Lobby buttons move up beside the clock, as on the one-row header,
//   and the HUD is one row over the stats row (Table, Avg stack, Your rank), whose cells stay in the flow unseen, so
//   the row keeps its height to the pixel;
// - the one-row header (shorter phones): the header keeps its height (measured as production lays it out, then held)
//   and holds two slim lines: the clock and the buttons, and under them the HUD as one line.
// Sideways (the column beside the table) and on wider screens the HUD stays where it was (its own row).
function hudPlace(){
  if(QUIET) return;   // (the quiet design has its own one-line field, #qline, and hides this HUD upright)
  if(BOARD) return;   // (the board: its header card carries players and rank; the HUD is the sheet, and sideways the column)
  const g = $('game'), el = $('fieldBar'), T = club && club.tourney, ck = g.querySelector('.clock'), st = g.querySelector('.stats');
  const on = !!field && !!T && T.status === 'running' && !g.classList.contains('land') && window.innerWidth < 480;
  const one = g.classList.contains('row1'), home = on && one ? ck : g;
  if(el.parentNode !== home){ if(home === ck) ck.appendChild(el); else g.insertBefore(el, $('sidePanel')); }
  ck.style.height = ''; el.style.top = el.style.height = '';
  // (the one-row header's height as production draws it: the HUD is out of the flow while it is measured)
  if(on && one){ g.classList.remove('hud-in'); const h = ck.getBoundingClientRect().height; ck.style.height = h + 'px'; }
  g.classList.toggle('hud-in', on);
  const hb = g.querySelector('.hdr-btns'), bh = on || one ? ck : st;
  if(hb && hb.parentNode !== bh) bh.appendChild(hb);
  // (over the stats row: placed on its box, and again whenever that box changes, the web fonts arriving)
  if(on && !one){ el.style.top = st.offsetTop + 'px'; el.style.height = st.offsetHeight + 'px'; }
  if(!hudRO && window.ResizeObserver){ hudRO = new ResizeObserver(() => { const g = $('game'); if(g.classList.contains('hud-in') && !g.classList.contains('row1')) hudPlace(); }); hudRO.observe(st); }
}
let hudRO = null;
// Sideways (#game.land) the column beside the table holds the tournament HUD (#fieldBar, placed there by style.css)
// and under it the sponsor: logo, name, category, the prize and See their page (as on the break card). With no sponsor,
// a prize alone; with neither, just the HUD. The status box and the action buttons stay at the bottom of the column.
let sideKey = '';
function sideUI(){
  const el = $('sidePanel'), T = club && club.tourney, run = T && T.status === 'running', sp = run && T.sponsor, prize = run && T.prize;
  el.hidden = !$('game').classList.contains('land') || (BOARD && !$('game').classList.contains('b-col') && !$('game').classList.contains('b-ncol')) || !(sp || prize);
  if(el.hidden){ if(sideKey){ sideKey = ''; el.innerHTML = ''; } return; }
  const key = [T.id, sp && sp.uid, sp && sp.name, sp && sp.logoV, prize, sponsorTap()].join('|');
  if(key !== sideKey){
    sideKey = key;
    el.innerHTML = sp ? sponsorHTML(sp, true, prize) : `<div class="side-prize"><small>Tonight's prize</small><b>${esc(prize)}</b></div>`;
    if(sp){ fillLogo(el, sp); wireSponsor(el, T); }
  }
  fitSide();
}
// the sponsor gets the room left between the HUD and what the dock shows (its top part is kept free for a longer helper
// line, and the sponsor uses it until then): when that is short, its smaller lines give way first, then the whole card
let sideFit = '';
function fitSide(){
  const el = $('sidePanel'); if(el.hidden) return;
  const tops = [...$('dock').children].filter(e => e.offsetHeight).map(e => e.getBoundingClientRect().top);
  const room = Math.max(0, Math.floor((tops.length ? Math.min(...tops) : innerHeight) - el.getBoundingClientRect().top - 6));
  if(sideFit === room + sideKey) return;
  sideFit = room + sideKey; el.style.maxHeight = room + 'px';
  el.classList.remove('s1', 's2', 's3', 's4');
  for(const c of ['s1', 's2', 's3', 's4']){ if(el.scrollHeight <= room + 1) break; el.classList.add(c); }
}
// chips or big blinds, everywhere a stack is shown in the HUD and on the live card (a tap switches; kept on this phone)
let bbMode = !!local.get('bbMode', false);
const bbText = x => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toLocaleString('en-US');
const stackHTML = (k, n, bb) => bbMode ? `${odo(k, bbText(n / bb))}<i class="bb-pill">BB</i>` : odo(k, fmt(n));
document.addEventListener('click', e => { if(!e.target.closest('[data-bbtoggle]')) return; bbMode = !bbMode; local.set('bbMode', bbMode); fieldUI(); if(view === 'lobby' && club && club.live) renderLobby(); });
// numbers that change slide in, like a live feed: each number has a key, and a new value for that key animates
const odoLast = new Map();
const odo = (k, v) => `<span class="odo" data-odo="${k}">${v}</span>`;
function odoPlay(root){
  root.querySelectorAll('[data-odo]').forEach(x => { const k = x.dataset.odo, v = x.textContent, was = odoLast.get(k); odoLast.set(k, v); if(was != null && was !== v && !reducedMotion()) x.classList.add('odo-in'); });
}
function onTable(d){ if(view === 'table' && d.tid === (watchTid || club.myTable)) renderTable(); }

// ---------- lobby ----------
$('lobbyBody').addEventListener('click', e => {
  if(e.target.closest('[data-kick]')) return;
  const t = e.target.closest('[data-prof]'); if(t) openProfile(t.dataset.prof);
});
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(!b) return; tab = b.dataset.tab; if(tab === 'learn'){ openHand = null; send({ t: 'hands' }); } if(tab === 'biz'){ if(BOARD){ bFrom = null; window.BizClub.show('biz'); } else window.BizClub.open('list'); } renderLobby(); $('lobbyBody').scrollTop = 0; });
const nameOf = uid => { const m = club.members.find(x => x.id === uid); if(m) return m.name; for(const h of club.history) for(const r of h.results) if(r.uid === uid) return r.name; return 'Former member'; };
const pchip = (uid, removable) => `<span class="pchip ${uid === club.me.id ? 'me' : ''}" data-prof="${esc(uid)}">${avHTML(uid, nameOf(uid), 'xs')}${esc(nameOf(uid))}${removable ? `<button data-kick="${esc(uid)}" aria-label="Remove from tournament">×</button>` : ''}</span>`;
const when = ms => new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const clockAt = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function renderLobby(){
  if(!club) return;
  const body = $('lobbyBody');
  $('tabs').hidden = !!club.suspended;
  if(club.suspended){ document.querySelector('.app').classList.remove('wide'); body.innerHTML = suspendedHTML(); wireLobby(); return; }
  $('tabs').hidden = !!club.spectate;
  if(club.spectate){ document.querySelector('.app').classList.remove('wide'); body.innerHTML = watchHTML(); boardOnArrival(); tableOnArrival(); return; }
  // Business Club and Opportunity Club stay hidden from members until the owner opens them (Director tab); the owner can always preview
  const clubsOn = !!(club.features && club.features.clubs), clubsVisible = !club.events && (clubsOn || club.me.owner);
  const bizTab = document.querySelector('#tabs [data-tab="biz"]');
  bizTab.hidden = !clubsVisible;
  if(tab === 'biz' && !clubsVisible) tab = 'event';
  if(BOARD) return boardLobby(body, clubsOn, clubsVisible);
  document.querySelectorAll('#tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  // Opportunity Club: a small count of requests waiting for my answer on the Business tab; never while seated in a running tournament
  if(clubsVisible) window.OppClub.badge(bizTab, !!(club.myTable && club.tourney && club.tourney.status === 'running'));
  const home = tab !== 'board' && tab !== 'learn' && !(tab === 'director' && club.me.owner);
  const playing = !!(club.myTable && club.tourney && club.tourney.status === 'running');
  document.querySelector('.app').classList.toggle('wide', tab === 'biz' || (home && clubsVisible && !playing));
  if(tab === 'biz'){ body.replaceChildren(); window.BizClub.render(body); return; }
  if(home) renderHome(body, clubsOn, clubsVisible && !playing);
  else body.innerHTML = tab === 'board' ? pageHead('Poker · The Strategy Table', 'Club standings') + boardHTML() : tab === 'learn' ? pageHead('Learn', 'The Salon') + learnHTML() : directorHTML();
  wireLobby();
}
// ---------- the board's navigation (UI_BOARD, Issue #32 Step-0 spec §5, phase B4) ----------
// Five tabs at the bottom (Home / Poker / Exchange / Club / Profile) and a top bar (wordmark; bell, Director for the
// club director, avatar). Today's pages and cards are re-homed into the tabs as they are: nothing is redesigned here.
// Leaderboard and Learn (today's Salon) open from Poker, Director from the top bar and Club; Exchange is unchanged.
let bFrom = null;   // the tab that opened an Exchange page (My business from Profile, the Bulletin from Club): it stays lit
const B_IC = {
  home: '<path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5"/>',
  poker: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>',
  biz: '<path d="M9 6V4.8c0-.4.4-.8.8-.8h4.4c.4 0 .8.4.8.8V6M4 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 12h16"/>',
  club: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3"/><circle cx="16.5" cy="9" r="2.6"/><path d="M15.8 14.3c2.6.1 4.5 1.8 5 4.7"/>',
  profile: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-4 3.8-6.3 7.5-6.3s6.7 2.3 7.5 6.3"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0"/>',
  dir: '<path d="M5 5v14M12 5v14M19 5v14"/><circle cx="5" cy="15" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="19" cy="13" r="2"/>',
  learn: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8M12 13v4M8.5 20h7M10 17h4l.5 3h-5z"/>',
  hands: '<rect x="4" y="5" width="9" height="13" rx="1.5" transform="rotate(-8 8.5 11.5)"/><rect x="11" y="5" width="9" height="13" rx="1.5" transform="rotate(8 15.5 11.5)"/>',
  invite: '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 19.5c.7-3.5 3.3-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.3M18 13v6M15 16h6"/>',
  swap: '<path d="M5 8h13l-3-3M19 16H6l3 3"/>',
  stats: '<path d="M5 19V11M10 19V5M15 19v-6M20 19V8"/>',
  pic: '<rect x="3.5" y="6" width="17" height="13" rx="2"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8.5 6l1.5-2h4l1.5 2"/>',
  scan: '<path d="M4 8V5.5C4 4.7 4.7 4 5.5 4H8M16 4h2.5c.8 0 1.5.7 1.5 1.5V8M20 16v2.5c0 .8-.7 1.5-1.5 1.5H16M8 20H5.5C4.7 20 4 19.3 4 18.5V16"/><rect x="7" y="8.5" width="10" height="7" rx="1.2"/><path d="M9.5 11h3M9.5 13h5"/>',
  out: '<path d="M14 4h4.5c.8 0 1.5.7 1.5 1.5v13c0 .8-.7 1.5-1.5 1.5H14M10 8l-4 4 4 4M6 12h10"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', post: '<path d="M4 10v4h3l6 4V6L7 10zM16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/>', opp: '<path d="M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.3 5.8L12 16l-5 3 1.3-5.8L4 9.3l5.6-.7z"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>' };
const bIc = (k, cls = '') => `<svg class="b-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${B_IC[k]}</svg>`;
const B_TABS = [['home', 'Home'], ['poker', 'Poker'], ['biz', 'Exchange'], ['club', 'Club'], ['profile', 'Profile']];
if(BOARD){
  $('tabs').setAttribute('aria-label', 'Main');
  // the page scrolls while the lobby shows (board.css), so the lobby's "scroll to the top" moves the page
  Object.defineProperty($('lobbyBody'), 'scrollTop', { configurable: true, get: () => window.scrollY, set: v => window.scrollTo(0, v) });
  $('tabs').innerHTML = B_TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === 'home'}"${k === 'biz' ? ' class="biz-tab"' : ''}>${bIc(k)}<span>${l}</span></button>`).join('');
}
// the top bar's right side: the bell (this phone's reminders), Director (the club director only), the avatar (Profile)
function bTopHTML(c){
  return `<button type="button" class="b-topbtn b-bell${c.pushOn ? ' on' : ''}" id="bBell" aria-label="Notifications ${c.pushOn ? 'on' : 'off'}">${bIc('bell')}</button>`
    + `<button type="button" class="b-topbtn" id="dirTab" data-tab="director" aria-label="Director"${c.me.owner ? '' : ' hidden'}>${bIc('dir')}</button>`
    + `<button type="button" class="b-topbtn b-avbtn" id="meBtn" data-tab="profile" aria-label="Profile">${avHTML(c.me.id, c.me.name, 'sm')}</button>`;
}
// the bell: today's reminder switch, nothing new (no inbox)
async function bellTap(){
  if(club && club.pushOn) return modal('<h2>Notifications are on</h2><p>We notify you 15 minutes before a tournament starts, and again when the cards are dealt.</p>', [{ label: 'OK', value: 1, primary: true }]);
  if(pushSupported() && Notification.permission !== 'denied'){
    if(await modal('<h2>Get notifications?</h2><p>We notify this phone 15 minutes before a tournament starts, and again when the cards are dealt.</p>', [{ label: 'Not now', value: null }, { label: 'Notify me', value: 1, primary: true }])) enablePush();
    return;
  }
  if(isIOS() && !standalone()) return iosNote();
  modal('<h2>Notifications are off</h2><p>This browser can\'t show notifications, or they are blocked in its settings.</p>', [{ label: 'OK', value: 1, primary: true }]);
}
// go to a tab (or one of today's pages under it) from a row or the top bar
function bGo(t, seg){
  bFrom = null;
  if(t === 'learn'){ learnSeg = seg || 'lessons'; openHand = null; if(learnSeg === 'hands') send({ t: 'hands' }); }
  if(t === 'board') boardSeg = seg || 'board';
  if(t === 'biz' || t === 'opp' || t === 'mine' || t === 'scan'){ bFrom = tab === 'biz' ? bFrom : tab; window.BizClub.show(t === 'opp' ? 'opp' : t === 'scan' ? 'scan' : 'biz'); if(t === 'mine') window.BizClub.open('mine'); t = 'biz'; }
  tab = t; view = 'lobby'; showScreen('lobby'); renderLobby(); $('lobbyBody').scrollTop = 0;
}
if(BOARD){
  document.addEventListener('click', e => {
    const top = e.target.closest('#meChip [data-tab]'); if(top) return bGo(top.dataset.tab);
    if(e.target.closest('#bBell, [data-bbell]')) return bellTap();
    const r = e.target.closest('[data-bgo]'); if(r) return bGo(r.dataset.bgo, r.dataset.seg);
    if(e.target.closest('[data-bact="profile"]')) return openProfile(club.me.id);
    if(e.target.closest('[data-bact="pic"]')) return pickAvatar();
    if(e.target.closest('[data-bact="club"]')) return pickClub();
    if(e.target.closest('[data-bact="out"]')) return signOut();
  });
}
// which tab is lit: today's pages light the tab they open from
function bNav(){
  if(tab === 'board' || tab === 'learn') return 'poker';
  if(tab === 'director') return 'club';
  if(tab === 'biz' && (bFrom === 'club' || bFrom === 'profile')) return bFrom;
  return tab;
}
// a list row that opens one of today's pages; at least 56 tall
const bRow = (attrs, ic, title, sub) => `<button type="button" class="b-row" ${attrs}>${bIc(ic, 'b-row-ic')}<span class="b-row-t"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${bIc('chev', 'b-chev')}</button>`;
const bRows = (label, rows) => rows.length ? `<nav class="b-rows" aria-label="${label}">${rows.join('')}</nav>` : '';
const bHead = (title, sub) => `<header class="b-pagehead"><h2>${title}</h2>${sub ? `<small>${sub}</small>` : ''}</header>`;
// today's tournament cards (eventHTML), split as the Lounge splits them: the hero (and the director's "Start the next
// tournament" box), then older results
function bEventSplit(){
  const ev = document.createElement('div'); ev.innerHTML = eventHTML();
  const cards = [...ev.children];
  let n = cards.length ? 1 : 0;
  if(cards[0] && cards[0].classList.contains('next-box') && cards[1] && !cards[1].querySelector('table')) n = 2;
  const main = cards.slice(0, n).find(c => !c.classList.contains('next-box') && c.querySelector('.status-pill'));
  if(main){ main.classList.add('poker-hero'); main.insertAdjacentHTML('afterbegin', HERO_ART); }
  return { top: cards.slice(0, n), rest: cards.slice(n) };
}
function boardLobby(body, clubsOn, clubsVisible){
  const owner = club.me.owner, playing = !!(club.myTable && club.tourney && club.tourney.status === 'running');
  if(tab === 'event') tab = 'poker';
  if(tab === 'director' && !owner) tab = 'club';
  if(tab === 'biz' && !clubsVisible) tab = 'home';
  const lit = bNav();
  document.querySelectorAll('#tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === lit));
  if($('dirTab')) $('dirTab').classList.toggle('on', tab === 'director');
  if(clubsVisible) window.OppClub.badge(document.querySelector('#tabs [data-tab="club"]'), playing);
  document.querySelector('.app').classList.remove('wide');   // (one column on every tab: board.css)
  if(tab === 'biz'){ body.replaceChildren(); window.BizClub.render(body); return; }
  const back = (t, l) => `<button type="button" class="b-back" data-bgo="${t}">${bIc('chev', 'b-back-ic')}${l}</button>`;
  if(tab === 'board'){ body.innerHTML = back('poker', 'Poker') + pageHead('Poker · The Strategy Table', 'Standings &amp; prizes') + boardHTML(); wireLobby(); return; }
  if(tab === 'learn'){ body.innerHTML = back('poker', 'Poker') + pageHead('Poker', 'Learn') + learnHTML(); wireLobby(); return; }
  if(tab === 'director'){ body.innerHTML = back('club', 'Club') + directorHTML(); wireLobby(); return; }
  const showClubs = clubsVisible && !playing;
  if(tab === 'poker'){
    const { top } = bEventSplit();
    body.innerHTML = bHead(club.events ? 'Blindrise Open' : 'Poker', club.events ? 'Open to every club' : 'The Strategy Table') + beventHTML();
    body.append(...top);
    body.insertAdjacentHTML('beforeend', (owner || playing ? '' : demoCard()) + bRows('Poker', [
      bRow('data-bgo="board"', 'trophy', 'Standings &amp; prizes', 'The leaderboard, prizes and past tournaments'),
      bRow('data-bgo="learn" data-seg="hands"', 'hands', 'My hands', 'Review the hands you played'),
      bRow('data-bgo="learn" data-seg="lessons"', 'learn', 'Learn', 'Lessons, rules and the fair deal')]));
  } else if(tab === 'club'){
    const switching = club.clubSwitching && club.clubs && club.clubs.length > 1, invite = owner || club.membersInvite;
    body.innerHTML = bHead(esc(club.club ? club.club.name : 'Club'), owner ? 'Club director' : 'Members') + bRows('Club', [
      owner ? bRow('data-bgo="director"', 'dir', 'Director', 'Run the club and its tournaments') : '',
      invite ? bRow('data-invite', 'invite', 'Invite friends', owner ? 'A group link or a personal link' : 'Share your own link') : '',
      switching ? bRow('data-bact="club"', 'swap', 'Switch club', 'You are in ' + esc(club.club.name)) : ''].filter(Boolean))
      + (clubsOn || club.events ? '' : comingHTML()) + (owner ? joinQrHTML() : '') + openClubHTML() + window.Domino.homeHTML();
    if(showClubs){ const opp = document.createElement('section'); opp.className = 'hsec hsec-opp'; opp.setAttribute('aria-labelledby', 'hs-opp'); body.append(opp); window.OppClub.mountHome(opp, false); }
  } else if(tab === 'profile'){
    const me = club.me, m = memberOf(me.id), pts = club.shop ? club.shop.balance : null;
    body.innerHTML = `<section class="b-me" aria-label="You">${avHTML(me.id, me.name, 'big')}<div class="b-me-t"><h2>${esc(me.name)}</h2>
      <div class="lx-id-meta"><span class="lx-role">${owner ? 'Club director' : 'Member'}</span>${tierPill(m)}${pts != null ? `<span class="lx-pts"><b class="num">${fmt(pts)}</b> points</span>` : ''}</div></div></section>`
      + picNudgeHTML() + bRows('Profile', [
      bRow('data-bact="profile"', 'stats', 'My profile and stats', 'Tournaments, how you play, results'),
      bRow('data-bact="pic"', 'pic', 'Change picture', 'A photo or an avatar'),
      clubsVisible && !club.events ? bRow('data-bgo="mine"', 'biz', 'My business', 'Your card in the Exchange') : '',
      clubsVisible && !club.events ? bRow('data-bgo="scan"', 'scan', 'Business Card Scanner', 'Turn a business card into your profile') : '',
      bRow('data-bbell', 'bell', 'Notifications', club.pushOn ? 'On for tournament reminders' : 'Off'),
      bRow('data-bact="out"', 'out', 'Sign out', 'Sign back in with your name and PIN')].filter(Boolean));
  } else {
    tab = 'home';
    // Home (Step-0 spec §7, owner's Preview test 2026-10-23): your next game, what is live, then what is new in the
    // club; the Exchange's own section (the spotlight and "Introduce your business") after that
    body.innerHTML = bNextHTML() + bStepsHTML() + bLiveHTML() + liveHTML(true) + bFeedHTML(showClubs);
    if(showClubs){ const biz = document.createElement('section'); biz.className = 'hsec hsec-biz'; biz.setAttribute('aria-labelledby', 'hs-biz'); body.append(biz); window.BizClub.mountHome(biz, false); }
    if(!body.children.length) body.innerHTML = `<div class="card-box b-empty"><h3>Nothing new right now</h3><p class="note">Tournaments and how to join are on Poker.</p><div class="btn-row"><button class="btn red" data-bgo="poker">Go to Poker</button></div></div>`;
    if(club.me.onb === 1 && onbNew() && !onbShown && !playing) onbShow();
  }
  odoPlay(body);
  wireLobby();
}
// ---------- the board's first visit (UI_BOARD, Issue #39 problems 2, 3 and 5) ----------
// A new account (club.me.onb 1, set by the server when it joins with an invite) gets a three-card welcome once, then a
// "First steps" card on Home until its three steps are done or it is hidden (onb 2, then 3). Every member gets a lasting
// "Next game" card at the top of Home. Nothing here changes a rule, a registration or a reminder: it says what is so.
const onbNew = () => !!(club && !club.me.owner && !club.events && !club.spectate && (club.me.onb === 1 || club.me.onb === 2));
let onbOpen = false, onbShown = false, onbRemind = false, onbAt = 0;
// how: for the welcome (step 2), 'done' when it closed from card 3, 'skip' before it (the server counts which, nothing more)
function onbSet(step, how){ if(!club.me.onb || club.me.onb >= step) return; club.me.onb = step; send(how ? { t: 'onb', step, how } : { t: 'onb', step }); }
// the club's next game: open for registration, or playing now
const bGame = () => { const T = club.tourney; return T && (T.status === 'registering' || T.status === 'running') ? T : null; };
const bMine = T => !!T && (T.regs || []).includes(club.me.id);
const bWhen = T => T.status === 'running' ? 'On now' : T.startAt ? esc(when(T.startAt)) : 'Starts when the organizer is ready';
// the server says their invite signed them up for this game and they are still registered (club.me.byInvite: the
// account record's invReg, set by joined() in server/index.js; on every device)
const bByInvite = T => !!T && !!club.me.byInvite && bMine(T);
const bCanJoin = T => !!T && !bMine(T) && (T.status === 'registering' || !!T.lateOpen);
function bNextHTML(){
  if(club.events) return '';
  const T = bGame();
  if(!T) return club.hosts === false ? '' : club.me.owner ? `<section class="card-box b-next" aria-labelledby="bNextH"><span class="eyebrow">Next game</span><h3 id="bNextH">No game open yet</h3>
    <p>Open the next tournament from Director, and it shows here for every member.</p>
    <div class="btn-row"><button class="btn" data-bgo="director">Open Director</button></div></section>` : `<section class="card-box b-next" aria-labelledby="bNextH"><span class="eyebrow">Next game</span><h3 id="bNextH">No game open yet</h3>
    <p>New games show up here as soon as the organizer opens one. Check back in a day or two, or practise on your own now.</p>
    <div class="btn-row"><button class="btn" data-demo>Try the practice table</button></div></section>`;
  const mine = bMine(T), run = T.status === 'running';
  const status = run && club.myTable ? '<p>Your table is ready.</p>'
    : mine ? `<p class="b-next-reg">${bIc('check')}<b>You're registered</b></p><p>${bByInvite(T) ? "Your invite signed you up, so there's nothing else to do. " : ''}${run ? 'Your table opens by itself in a moment.' : 'Open Blindrise at the start time and your table opens by itself.'}</p>`
    : run ? `<p>${T.lateOpen ? 'It has started, and you can still join.' : 'It has started. You can watch any table.'}</p>`
    : '<p>Free to join. Register to save your seat.</p>';
  const acts = run && club.myTable ? `<button class="btn red" data-watch="${esc(club.myTable)}">Go to my table</button>`
    : bCanJoin(T) ? '<button class="btn red" data-bjoin>Register</button><button class="btn" data-bgo="poker">See details</button>'
    : `<button class="btn" data-bgo="poker">${run ? 'Watch' : 'See details'}</button>`;
  return `<section class="card-box b-next" aria-labelledby="bNextH"><span class="eyebrow">Next game</span><h3 id="bNextH">${esc(T.name)}</h3><p class="b-next-when">${bWhen(T)}</p>${status}<div class="btn-row">${acts}</div></section>`;
}
// First steps: each ticks from what the app already knows: registered, a picture, a published Exchange card (the Home
// feed's own status), an invite link made or a friend joined with it (club.myInvite, club.invitedCount)
function bSteps(){
  const T = bGame(), m = memberOf(club.me.id);
  return [{ k: 'reg', done: bMine(T), t: 'Register for the next game', sub: T ? esc(T.name) : 'No game open yet' },
    { k: 'pic', done: !!(m && m.av), t: 'Add a profile picture', sub: "So people know who they're playing with." },
    { k: 'biz', done: window.BizClub.myStatus() === 'published', t: 'Introduce your business', sub: 'List it in the Exchange so members can find and refer you.' },
    // only where members can invite (the director can switch that off)
    ...(club.membersInvite || club.me.owner ? [{ k: 'invite', done: !!(club.myInvite || club.invitedCount), t: 'Invite a friend', sub: "Bring someone you'd like in the club." }] : [])];
}
function bStepsHTML(){
  if(!onbNew()) return '';
  const S = bSteps(), n = S.filter(x => x.done).length;
  if(n === S.length){ onbSet(3); return ''; }
  return `<section class="card-box b-steps" aria-labelledby="bStepsH"><div class="b-steps-head"><span class="b-steps-t"><span class="eyebrow" id="bStepsH">First steps</span><small>${n} of ${S.length} done</small></span>
    <button type="button" class="b-steps-x" data-bstepsx aria-label="Hide first steps">${bIc('close')}</button></div>
    <ul class="b-steps-list">${S.map(x => `<li>${x.done ? `<div class="b-step done"><span class="b-tick">${bIc('check')}</span><span class="b-row-t"><b>${x.t}</b><small>Done</small></span></div>`
      : `<button type="button" class="b-step" data-bstep="${x.k}"><span class="b-tick"></span><span class="b-row-t"><b>${x.t}</b><small>${x.sub}</small></span>${bIc('chev', 'b-chev')}</button>`}</li>`).join('')}</ul></section>`;
}
function bJoin(){ send({ t: 'join' }); setTimeout(offerReminder, 600); }
if(BOARD) document.addEventListener('click', e => {
  if(e.target.closest('[data-bjoin]')) return bJoin();
  if(e.target.closest('[data-bstepsx]')){ onbSet(3); return renderLobby(); }
  const s = e.target.closest('[data-bstep]'); if(!s) return;
  const k = s.dataset.bstep, T = bGame();
  if(k === 'pic') return pickAvatar();
  if(k === 'biz') return bGo('mine');
  if(k === 'invite') return askInvite();
  if(bCanJoin(T)) return bJoin();
  bGo('poker');
});
// Live at Blindrise (spec §7): this club's tables while its tournament plays (club.tables, club.tourney: nothing from
// another club). A tap watches the table, or takes you to your seat. Empty: when the next game starts.
function bLiveHTML(){
  if(club.events) return '';
  const T = club.tourney, run = !!T && T.status === 'running', tables = run ? club.tables || [] : [], cname = esc((club.club && club.club.name) || 'Blindrise');
  const n = tables.length, head = `<div class="b-sec-head"><h2 id="bLiveH"><i class="b-live-dot${n ? ' on' : ''}" aria-hidden="true"></i>Live at Blindrise</h2>${n ? `<button type="button" class="b-sec-link" data-bgo="poker">${n} live ${n === 1 ? 'table' : 'tables'}${bIc('chev')}</button>` : ''}</div>`;
  if(!n){
    const next = T && T.status === 'registering' ? (T.startAt ? 'The next game starts ' + esc(when(T.startAt)) + '.' : 'The next game starts when the organizer is ready.') : 'Games show here the moment they start.';
    return `<section class="card-box b-live" aria-labelledby="bLiveH">${head}<p class="b-live-none"><b>No live tables right now</b><small>${next}</small></p></section>`;
  }
  const [sb, bb] = E.levelFor(T.level, T.anteMode), state = T.breakUntil ? 'On break' : T.paused ? 'Paused' : 'Level ' + (T.level + 1) + ' · ' + fmt(sb) + '/' + fmt(bb);
  return `<section class="card-box b-live" aria-labelledby="bLiveH">${head}<div class="b-ltables">${tables.map(t => { const mine = t.tid === club.myTable;
    return `<button type="button" class="b-ltable${mine ? ' mine' : ''}" data-watch="${esc(t.tid)}"><span class="b-mfelt" aria-hidden="true">${'<i></i>'.repeat(Math.min(9, t.players))}</span><span class="b-row-t"><b>${cname} – Table ${t.n}</b><small>${state} · ${t.players} ${t.players === 1 ? 'player' : 'players'}</small></span><span class="b-ltag">${mine ? 'Go to my seat' : 'Watch'}</span></button>`; }).join('')}</div></section>`;
}
// Community Activity (spec §7): what is new, from what the app already has: the founder's posts, the last result, the
// night's sponsor and the Bulletin's newest listings. One row each; the Exchange keeps its own section below.
function bFeedHTML(clubs){
  const rows = [], T = club.tourney, h = club.history && club.history[0];
  (club.blindrise || []).forEach((b, i) => rows.push(`<button type="button" class="b-row b-feed-row" data-bpost="${i}">${bIc('post', 'b-row-ic')}<span class="b-row-t"><small class="b-feed-k">${b.kind === 'event' ? 'Official event' : 'From Blindrise'}${b.when ? ' · ' + esc(when(b.when)) : ''}</small><b>${esc(b.title)}</b><small class="b-feed-sub">${esc(b.body)}</small></span>${bIc('chev', 'b-chev')}</button>`));
  if(h && h.results && h.results[0]) rows.push(`<button type="button" class="b-row b-feed-row" data-bgo="board">${avHTML(h.results[0].uid, h.results[0].name, 'sm')}<span class="b-row-t"><small class="b-feed-k">Latest result · ${esc(new Date(h.endedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }))}</small><b>${esc(h.results[0].name)} won ${esc(h.name)}</b><small class="b-feed-sub">${h.entrants} players${h.results[1] ? ' · 2nd ' + esc(h.results[1].name) : ''}</small></span>${bIc('chev', 'b-chev')}</button>`);
  if(T && (T.status === 'registering' || T.status === 'running') && T.sponsor && T.sponsor.name) rows.push(`<button type="button" class="b-row b-feed-row" data-bsponsor="${esc(T.sponsor.uid)}">${bIc('biz', 'b-row-ic')}<span class="b-row-t"><small class="b-feed-k">Sponsor of the night</small><b>${esc(T.sponsor.name)}</b><small class="b-feed-sub">${esc(T.sponsor.categoryLabel || '')}${T.prize ? ' · <span class="b-feed-prize">' + esc(T.prize) + '</span>' : ''}</small></span>${bIc('chev', 'b-chev')}</button>`);
  if(clubs) window.OppClub.highlights(() => { if(view === 'lobby' && tab === 'home') renderLobby(); }).forEach(x => rows.push(`<button type="button" class="b-row b-feed-row" data-bgo="opp">${bIc('opp', 'b-row-ic')}<span class="b-row-t"><small class="b-feed-k">The Bulletin · ${x.type === 'need' ? 'Needs help' : 'Offering help'}</small><b>${esc(x.title)}</b><small class="b-feed-sub">${esc(x.categoryLabel || '')}${x.member ? ' · ' + esc(x.member) : ''}</small></span>${bIc('chev', 'b-chev')}</button>`));
  return `<section class="b-feed" aria-labelledby="bFeedH"><div class="b-sec-head"><h2 id="bFeedH">Community Activity</h2></div>${rows.length ? `<nav class="b-rows" aria-label="Community Activity">${rows.join('')}</nav>` : '<p class="card-box b-feed-none">Nothing new in the club yet. Posts, results and Bulletin listings show here.</p>'}</section>`;
}
if(BOARD) document.addEventListener('click', e => {
  const p = e.target.closest('[data-bpost]');
  if(p){ const b = (club.blindrise || [])[+p.dataset.bpost]; if(b) modal(`<h2>${esc(b.title)}</h2>${b.when ? `<p class="br-when">${esc(when(b.when))}</p>` : ''}<p>${linkText(b.body)}</p>`, [{ label: 'Close', value: 1, primary: true }]); return; }
  const s = e.target.closest('[data-bsponsor]'); if(s){ bFrom = 'home'; window.BizClub.openBiz(s.dataset.bsponsor); }
});
// the welcome: three cards over Home, skippable at any card (Skip, Escape); the last one leads to the next game
const ONB_TABS = [['home', 'Home', "What's next for you, like your next game."], ['poker', 'Poker', 'Club games, a practice table, and short lessons.'], ['biz', 'Exchange', 'Member businesses. Find services, exchange referrals, and get found.'], ['club', 'Club', 'The people in your club. Invite friends from here.'], ['profile', 'Profile', 'Your picture, your business, and your settings.']];
function onbCardHTML(i){
  const T = bGame(), mine = bMine(T), head = (t, n) => `<div class="b-onb-top"><span class="eyebrow">${n} of 3</span>${n < 3 ? '<button type="button" class="b-onb-skip" data-onb="skip">Skip</button>' : ''}</div><h2 id="bOnbH">${t}</h2>`;
  if(i === 0) return head('Welcome to Blindrise', 1) + "<p>Blindrise is a private members' club — a place to meet people, build real relationships, and grow your business, with social game nights to unwind together.</p><p>It's free to join.</p>"
    + '<div class="b-onb-btns"><button type="button" class="btn red" data-onb="next">Next</button></div>';
  if(i === 1) return head('Where things are', 2) + `<ul class="b-onb-tabs">${ONB_TABS.map(([k, l, d]) => `<li>${bIc(k)}<span><b>${l}</b><small>${d}</small></span></li>`).join('')}</ul><p>The bar at the bottom of the screen takes you to each one.</p>`
    + '<div class="b-onb-btns"><button type="button" class="btn red" data-onb="next">Next</button></div>';
  return head(T ? 'Your next game' : 'How to start', 3) + (T
    ? `<p class="b-onb-game"><b>${esc(T.name)}</b><span>${bWhen(T)}</span></p><p>${mine ? `You're registered.${bByInvite(T) ? " Your invite signed you up, so there's nothing else to do." : ''}` : 'Register to save your seat. It is free.'}</p>`
      + `<div class="b-onb-btns"><button type="button" class="btn red" data-onb="poker">${mine ? 'See my game' : 'See the game'}</button></div>`
    : '<p>No game is open yet. New games show up on Home as soon as the organizer opens one.</p><p>Meanwhile, try the practice table at your own pace.</p>'
      + '<div class="b-onb-btns"><button type="button" class="btn red" data-onb="demo">Try the practice table</button></div>');
}
function onbShow(){
  onbOpen = onbShown = true; onbAt = 0;
  const el = document.createElement('div'); el.id = 'bOnb'; el.className = 'b-onb';
  el.innerHTML = `<div class="b-onb-card" role="dialog" aria-modal="true" aria-labelledby="bOnbH"></div>`;
  $('lobby').appendChild(el);
  const draw = () => { const c = el.firstChild; c.innerHTML = onbCardHTML(onbAt); c.dataset.card = onbAt + 1; c.scrollTop = 0; c.querySelector('.b-onb-btns .btn').focus(); };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-onb]'); if(!b) return;
    const a = b.dataset.onb;
    if(a === 'next'){ onbAt++; return draw(); }
    onbClose(a);
  });
  el.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ e.preventDefault(); return onbClose('skip'); }
    if(e.key !== 'Tab') return;
    const f = [...el.querySelectorAll('button')]; if(!f.length) return;
    const i = f.indexOf(document.activeElement), j = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length;
    e.preventDefault(); f[j].focus();
  });
  draw();
}
function onbClose(go){
  const el = $('bOnb'); if(el) el.remove();
  onbOpen = false; onbSet(2, onbAt === 2 ? 'done' : 'skip');
  if(go === 'poker') bGo('poker'); else if(go === 'demo') startDemo(); else renderLobby();
  if(onbRemind){ onbRemind = false; setTimeout(offerReminder, 400); }
}
// ---------- Home: Poker, then Business, then Opportunities ----------
// The tournament card always comes first. Business and Opportunities show only when the clubs are open (the owner always
// sees them) and never while you're seated in a running tournament: then Home is poker only.
const SECTIONS = [['poker', 'spade', 'Poker'], ['biz', 'briefcase', 'Exchange'], ['opp', 'spark', 'Bulletin']];
function homeNavHTML(){
  return `<nav class="home-nav" aria-label="Home sections">${SECTIONS.map(([k, ic, l], i) => `<button type="button" class="hn-${k}" data-hs="${k}" aria-current="${i === 0}">${Icons.svg(ic)}<span>${l}</span></button>`).join('')}</nav>`;
}
function pokerHeadHTML(){
  const st = club.tourney && club.tourney.status;
  const sub = 'Poker · ' + (st === 'registering' ? 'Registration open' : st === 'running' ? 'Live now' : club.hosts === false ? 'Practice table' : 'Club tournaments');
  return `<div class="hsec-head" id="hs-poker"><span class="hsec-ic poker">${Icons.svg('spade')}</span><div class="hsec-t"><h2>The Strategy Table</h2><small class="${st === 'running' ? 'live' : ''}">${sub}</small></div>
    <button type="button" class="hsec-link" data-gotab="board">Leaderboard${Icons.svg('chev')}</button></div>`;
}
// decorative only: two cards and a chip on the tournament card
const HERO_ART = `<svg class="hero-art" viewBox="0 0 120 96" aria-hidden="true" focusable="false"><g transform="rotate(-14 46 52)"><rect x="22" y="14" width="46" height="64" rx="6" fill="#f4f1ea"/><text x="29" y="34" font-size="15" font-weight="700" fill="#1b1b1b" font-family="system-ui,sans-serif">A</text><path d="M45 42c4 4 9 7 9 11.5 0 2.8-2.2 4.7-4.7 4.7-1.5 0-2.8-.7-3.5-1.8.3 2.1 1.3 3.7 2.9 5.1h-7.4c1.6-1.4 2.6-3 2.9-5.1-.7 1.1-2 1.8-3.5 1.8-2.5 0-4.7-1.9-4.7-4.7C36 49 41 46 45 42z" fill="#1b1b1b"/></g><g transform="rotate(10 78 50)"><rect x="54" y="12" width="46" height="64" rx="6" fill="#fbfaf6"/><text x="61" y="32" font-size="15" font-weight="700" fill="#c8141f" font-family="system-ui,sans-serif">K</text><path d="M77 58s-10-6-10-12.5a5 5 0 0 1 10-1.8 5 5 0 0 1 10 1.8C87 52 77 58 77 58z" fill="#c8141f"/></g><circle cx="96" cy="76" r="15" fill="#2e6bcf"/><circle cx="96" cy="76" r="15" fill="none" stroke="#e8ebf1" stroke-width="4" stroke-dasharray="5 6.8"/><circle cx="96" cy="76" r="8.5" fill="#1b2333" stroke="#e8ebf1" stroke-width="1.2"/></svg>`;
function renderHome(body, clubsOn, showClubs){
  const ev = document.createElement('div'); ev.innerHTML = eventHTML();
  const cards = [...ev.children];
  // the hero: the owner's "Start the next tournament" box and/or the tournament card; older results go further down
  let n = cards.length ? 1 : 0;
  if(cards[0] && cards[0].classList.contains('next-box') && cards[1] && !cards[1].querySelector('table')) n = 2;
  const main = cards.slice(0, n).find(c => !c.classList.contains('next-box') && c.querySelector('.status-pill'));
  if(main){ main.classList.add('poker-hero'); main.insertAdjacentHTML('afterbegin', HERO_ART); }
  // members get the practice table on Home too (the owner has it in Director); not while seated in a running tournament
  const seated = !!(club.myTable && club.tourney && club.tourney.status === 'running');
  const extra = document.createElement('div'); extra.innerHTML = (clubsOn || club.events ? '' : comingHTML()) + (club.me.owner || seated ? '' : demoCard()) + picNudgeHTML();
  body.innerHTML = liveHTML() + memberHomeHTML(clubsOn || club.me.owner) + (club.live ? '' : beventHTML()) + blindriseHTML() + window.Domino.homeHTML() + openClubHTML() + (showClubs ? homeNavHTML() : '') + pokerHeadHTML();
  body.append(...cards.slice(0, n), ...[...extra.children]);
  if(showClubs){
    const biz = document.createElement('section'); biz.className = 'hsec hsec-biz'; biz.setAttribute('aria-labelledby', 'hs-biz');
    const opp = document.createElement('section'); opp.className = 'hsec hsec-opp'; opp.setAttribute('aria-labelledby', 'hs-opp');
    body.append(biz, opp);
    window.BizClub.mountHome(biz, false);
    window.OppClub.mountHome(opp, false);
  }
  body.append(...cards.slice(n));
  body.insertAdjacentHTML('beforeend', friendsHTML());
  odoPlay(body);
  if(showClubs) requestAnimationFrame(navSync);
}
// Member Home: a personal welcome and the club's four doors (Poker, Business, Opportunity, card Scanner). Built only from
// what the club message already carries. While the clubs are closed members see them as "Opening soon", as on the Welcome screen.
const LX_IC = {
  poker: '<path d="M12 3c3 3.5 6.5 5.7 6.5 9a3.4 3.4 0 0 1-5.8 2.4l1.1 4.1h-3.6l1.1-4.1A3.4 3.4 0 0 1 5.5 12c0-3.3 3.5-5.5 6.5-9z" fill="currentColor" stroke="none"/>',
  biz: '<path d="M9 6V4.8c0-.4.4-.8.8-.8h4.4c.4 0 .8.4.8.8V6M4 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 12h16"/>',
  opp: '<path d="M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.3 5.8L12 16l-5 3 1.3-5.8L4 9.3l5.6-.7z"/>',
  scan: '<path d="M4 8V5.5C4 4.7 4.7 4 5.5 4H8M16 4h2.5c.8 0 1.5.7 1.5 1.5V8M20 16v2.5c0 .8-.7 1.5-1.5 1.5H16M8 20H5.5C4.7 20 4 19.3 4 18.5V16"/><rect x="7" y="8.5" width="10" height="7" rx="1.2"/><path d="M9.5 11h3M9.5 13h5"/>' };
function memberHomeHTML(clubsOpen){
  const me = club.me, m = memberOf(me.id), T = club.tourney, st = T && T.status, hr = new Date().getHours();
  const greet = hr < 5 ? 'Good evening' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const pts = club.shop ? club.shop.balance : null, playing = !!(club.myTable && st === 'running');
  const poker = playing ? 'Your table is live' : st === 'running' ? 'Live now · ' + esc(T.name) : st === 'registering' ? (T.regs.includes(me.id) ? "You're registered · " : 'Registration open · ') + esc(T.name) : 'Tournaments with friends';
  const door = (k, title, sub, on) => on
    ? `<button type="button" class="lx-door lx-${k}" data-lx="${k}"><span class="lx-door-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${LX_IC[k]}</svg></span><span class="lx-door-t"><b>${title}</b><small>${sub}</small></span><svg class="lx-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>`
    : `<div class="lx-door lx-${k} soon" aria-disabled="true"><span class="lx-door-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${LX_IC[k]}</svg></span><span class="lx-door-t"><b>${title}</b><small>${sub}</small></span><em>Opening soon</em></div>`;
  return `<section class="lx-hello" aria-label="The Lounge">
    <div class="lx-brandline"><span class="eyebrow">${club.events ? 'Blindrise · Open to every club' : 'Blindrise · Private Members Club'}</span><span class="lx-lounge">${club.events ? 'The Open' : 'The Lounge'}</span></div>
    <div class="lx-id">${avHTML(me.id, me.name, 'big')}<div class="lx-id-t"><span class="lx-greet">${greet},</span><h2>${esc(me.name.split(' ')[0])}</h2>
      <div class="lx-id-meta">${me.owner ? '<span class="lx-role">Club director</span>' : '<span class="lx-role">Member</span>'}${tierPill(m)}${pts != null ? `<span class="lx-pts"><b class="num">${fmt(pts)}</b> points</span>` : ''}</div></div></div>
    <div class="lx-doors">${door('poker', club.events ? 'Blindrise Open' : 'The Strategy Table', 'Poker · ' + poker, true)}${club.events ? '' : door('biz', 'The Exchange', "Business Club · members' businesses", clubsOpen) + door('opp', 'The Bulletin', 'Opportunity Club · ask for help, or offer it', clubsOpen) + door('scan', 'Business Card Scanner', 'Turn a business card into your profile', clubsOpen)}</div>
    <p class="lx-motto"><b>Pull Up a Chair.</b> Good Company. Meaningful Connections.</p>
  </section>`;
}
// a quiet page title for Leaderboard and Learn, in the club's own names
const pageHead = (eyebrow, title) => `<header class="lx-pagehead"><span class="eyebrow">${eyebrow}</span><h2>${title}</h2></header>`;
$('lobbyBody').addEventListener('click', e => {
  const d = e.target.closest('[data-lx]'); if(!d) return;
  const k = d.dataset.lx;
  if(k === 'poker'){
    if(club.myTable && club.tourney && club.tourney.status === 'running') return openTable(club.myTable);
    const t = $('hs-poker'), body = $('lobbyBody'); if(!t) return;
    return body.scrollTo({ top: t.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - navH() - 10, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  window.BizClub.show(k); tab = 'biz'; renderLobby(); $('lobbyBody').scrollTop = 0;
});
// the section switcher scrolls to a section and follows the scroll
const navH = () => { const n = document.querySelector('.home-nav'); return n ? n.offsetHeight : 0; };
function navSync(){
  const body = $('lobbyBody'), nav = body.querySelector('.home-nav'); if(!nav) return;
  const top = body.getBoundingClientRect().top + navH() + 24;
  let cur = 'poker';
  for(const [k] of SECTIONS){ const t = $('hs-' + k); if(t && t.getBoundingClientRect().top <= top) cur = k; }
  if(body.scrollTop + body.clientHeight >= body.scrollHeight - 4 && $('hs-opp')) cur = 'opp';
  nav.querySelectorAll('[data-hs]').forEach(b => b.setAttribute('aria-current', String(b.dataset.hs === cur)));
}
let navTick = false;
$('lobbyBody').addEventListener('scroll', () => { if(navTick) return; navTick = true; requestAnimationFrame(() => { navTick = false; navSync(); }); }, { passive: true });
$('lobbyBody').addEventListener('click', e => {
  const b = e.target.closest('[data-hs]');
  if(b){
    const body = $('lobbyBody'), t = $('hs-' + b.dataset.hs); if(!t) return;
    const y = b.dataset.hs === 'poker' ? 0 : t.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - navH() - 10;
    body.scrollTo({ top: y, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return;
  }
  const g = e.target.closest('[data-gotab]');
  if(g){ tab = g.dataset.gotab; renderLobby(); $('lobbyBody').scrollTop = 0; }
});
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
// Announcement only: these features are being tested and are not part of the poker game, points or results.
function comingHTML(){
  if(local.get('comingSoon1', 0)) return '';
  return `<div class="card-box coming-box"><span class="eyebrow">Coming soon</span><h3>Two new members-only clubs</h3>
    <p><b>Business Club:</b> share your business card with fellow members and find their businesses.</p>
    <p><b>Opportunity Club:</b> a members-only board for jobs, services and deals.</p>
    <p class="note">Both are being tested now and will open here soon. They are separate from the tournament: no effect on games, points or the leaderboard.</p>
    <div class="btn-row"><button class="btn" data-comingok>Got it</button></div></div>`;
}
document.addEventListener('click', e => { if(e.target.closest('[data-comingok]')){ local.set('comingSoon1', 1); renderLobby(); } });
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
  // a club a member opened: real tournaments are Blindrise's, so Home points there (one it already had still shows)
  if(club.hosts === false && !(club.tourney && ['registering', 'running'].includes(club.tourney.status)))
    return `<div class="card-box"><span class="status-pill idle">Practice only</span><h3>Tournaments are run by Blindrise</h3>
      <p>Play real tournaments in the <b>Blindrise Open</b>: when one is open, register from its card on this page. Here you can play the practice table any time.</p></div>`;
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
    return `<div class="card-box"><span class="status-pill">Registration open</span>${mine ? ' <span class="status-pill reg">✓ You\'re registered</span>' : ''}<h3>${esc(T.name)}</h3>
      <div class="kv num"><div><small>Starts</small><b>${T.startAt ? esc(when(T.startAt)) : 'When the owner starts it'}</b></div><div><small>Stack</small><b>${fmt(T.stack)}</b></div><div><small>Levels</small><b>${T.levelMin} min</b></div></div>
      <p class="note">${T.tableSize === 6 ? '6-max tables' : `${T.tableSize || 9} players per table`}: a new table opens for every ${T.tableSize || 9} players and tables merge down to the final table. ${T.lateLevels ? `Late registration stays open until the end of level ${T.lateLevels}. ` : ''}${T.anteMode === 'each' ? 'Every player posts an ante each hand' : 'The big blind posts the ante for the table (WSOP/WPT style)'} · ${T.actSec || 20} seconds to act. Every player has 3 extra-time cards (+30 seconds each) for the tournament, and a fresh 5 at the final table.${extrasNote(T)}${breakNote(T)}</p>
      ${presentedHTML(T)}
      ${T.repeat !== 'none' ? `<p class="note">Repeats ${T.repeat === 'daily' ? 'every day' : 'every week'} at this time.</p>` : ''}
      <p>${T.regs.length} joined</p>
      <div class="plist">${T.regs.map(u => pchip(u, false)).join('') || '<span class="note">Nobody has joined yet.</span>'}</div>
      <div class="btn-row">${mine ? '<button class="btn" id="leaveBtn">Cancel my registration</button>' : '<button class="btn red" id="joinBtn">Join tournament</button>'}</div>
      ${mine ? `<p>You're in. Your table opens by itself when the tournament starts.</p>${remindHTML(T)}` : ''}
      ${club.me.owner ? `<div class="owner-row"><button class="btn" id="inviteBtn">Invite a friend</button><button class="btn red" id="startBtn" ${T.regs.length < 2 ? 'disabled' : ''}>Start now</button></div>
      ${T.regs.length < 2 ? '<p class="warn-note">You need at least 2 players to start. Send an invite, and ask your friend to tap <b>Join tournament</b>.</p>' : ''}` : ''}</div>${lastResultHTML()}`;
  }
  if(T.status === 'running'){
    const out = (T.places || []).find(r => r.uid === club.me.id);
    const [sb, bb] = E.levelFor(T.level, T.anteMode);
    return `<div class="card-box"><span class="status-pill live">Live</span><h3>${esc(T.name)}</h3>
      <div class="kv num"><div><small>Players left</small><b>${T.remaining} of ${T.entrants}</b></div><div><small>Level</small><b>${T.level + 1}</b></div><div><small>Blinds</small><b>${fmt(sb)}/${fmt(bb)}</b></div></div>
      ${presentedHTML(T)}
      ${T.breakUntil ? `<p class="brk-note"><b>On break</b> until ${esc(clockAt(T.breakUntil - clockSkew))}. Play resumes by itself.</p>` : ''}
      ${club.myTable ? `<button class="btn red" data-watch="${esc(club.myTable)}">Go to my table</button>` : out ? `<p>You finished ${ord(out.place)}. You can still watch.</p>`
        : (T.regs || []).includes(club.me.id) ? `<p><span class="status-pill reg">✓ You're registered</span></p><p>Finding your seat… your table opens by itself in a moment.</p>`
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
  if(boardSeg === 'prizes' && !club.events) return prizesHTML();
  return `${club.events ? '' : `<div class="seg2">${[['board','Leaderboard'],['prizes','Prizes']].map(([k, l]) => `<button data-bseg="${k}" aria-pressed="${boardSeg === k}">${l}</button>`).join('')}</div>`}<div class="card-box"><span class="eyebrow">Recognition for good play</span>
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
  // the Blindrise Open: no Exchange, invites or prizes to run there, only its tournaments and players
  if(club.events) return conflictsHTML() + directorMainHTML();
  return newsHTML() + demoCard() + conflictsHTML() + clubListHTML() + eventsRunHTML() + window.Domino.directorHTML() + joinQrHTML() + clubsSwitchHTML() + directorMainHTML() + funnelHTML() + prizeAdminHTML();
}
// ---------- New members' first steps (board design only, Issue #39): counts from the server, per week of joining ----------
function funnelHTML(){
  if(!BOARD || !club.funnel) return '';
  const wk = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const row = (l, n) => `<div class="trow"><b>${l}</b><small>${n || 0}</small></div>`;
  return `<div class="card-box b-funnel"><span class="eyebrow">New members · First steps</span>
    <p class="note">How many members who joined with an invite took each first step, by the week they joined. Counts only: no names and nothing about any one member.</p>
    ${club.funnel.length ? club.funnel.map(w => `<h3>Joined the week of ${esc(wk(w.week))}: ${w.joined || 0}</h3><div class="table-list">${row('Finished the welcome', w.welcomeDone)}${row('Skipped the welcome', w.welcomeSkipped)}${row('Registered for a game', w.game)}${row('Registered for a game themselves', w.gameSelf)}${row('Added a profile picture', w.picture)}${row('Published their business in the Exchange', w.business)}${row('Made an invite link', w.invite)}${row('Came back on another day within 7 days', w.returned)}</div>`).join('')
      + '<p class="note">A member counts once for each step. "Registered for a game" includes members their invite signed up. The newest weeks can still grow.</p>'
      : '<p class="note">No new members since counting started.</p>'}</div>`;
}
// ---------- the owner's join QR (Director) ----------
// Each club the owner runs gets a QR code of its public join address, drawn here on the phone from that address only
// (pinned qrcode-generator in /vendor/, loaded the first time it's needed). Nothing about the code is stored.
let qrLib = null, qrLeadsOpen = false;
const loadQr = () => qrLib || (qrLib = new Promise((res, rej) => {
  if(window.qrcode) return res(window.qrcode);
  const s = document.createElement('script'); s.src = '/vendor/qrcode-generator-2.0.4/qrcode.js';
  s.onload = () => res(window.qrcode); s.onerror = () => { qrLib = null; rej(new Error("The QR code didn't load. Check your connection.")); };
  document.head.appendChild(s);
}));
const joinUrl = c => location.origin + c.path;
const qrInitials = name => (String(name).match(/[\p{L}\p{N}]+/gu) || ['?']).slice(0, 2).map(w => w[0].toUpperCase()).join('');
function joinQrHTML(){
  if(!club.joinQr) return '';
  return club.joinQr.map((c, i) => `<div class="card-box qr-card"><span class="eyebrow">Join QR · ${esc(clubTitle(c.name))}</span>
    <div class="qr-club"><span class="qr-av" aria-hidden="true">${esc(qrInitials(c.name))}</span><div><b>${esc(c.name)}</b><small>${c.members} member${c.members === 1 ? '' : 's'}</small></div>${c.live ? '<span class="status-pill live" title="The join page is open">LIVE</span>' : ''}</div>
    <div class="qr-box"><canvas data-qr="${i}" role="img" aria-label="QR code for ${esc(joinUrl(c))}"></canvas></div>
    <p class="qr-url">${esc(joinUrl(c))}</p>
    <div class="btn-row qr-acts"><button class="btn red" data-qshare="${i}">Share</button><button class="btn" data-qdl="${i}">Download</button><button class="btn" data-qprint="${i}">Print</button></div>
    <p class="note">Anyone who scans it can leave their email for the ${esc(clubTitle(c.name))}, with their consent. It doesn't make an account or sign anyone in, and their email is never shared with another club.</p>
    <details class="qr-leads"><summary>Email sign-ups · ${c.leads.length}</summary>${c.leads.length ? `<div class="table-list">${c.leads.map(l => `<div class="trow"><b>${esc(l.email)}</b><small>${new Date(l.at).toLocaleDateString()}</small></div>`).join('')}</div>` : '<p class="note">No sign-ups yet.</p>'}</details></div>`).join('');
}
// a QR code onto a canvas: black on white, 4 modules of quiet zone, error correction M
function drawQr(canvas, text, px){
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), size = n + 8, scale = Math.max(2, Math.floor(px / size));
  canvas.width = canvas.height = size * scale;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); g.fillStyle = '#000';
  for(let r = 0; r < n; r++) for(let k = 0; k < n; k++) if(q.isDark(r, k)) g.fillRect((k + 4) * scale, (r + 4) * scale, scale, scale);
  return canvas;
}
// the printable/downloadable sheet: the club's name, the code and its address
function qrPoster(c){
  const W = 1200, H = 1500, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0b1424'; g.textAlign = 'center';
  g.font = '600 64px "IBM Plex Sans", system-ui, sans-serif'; g.fillText('Join the ' + clubTitle(c.name), W / 2, 150, W - 120);
  g.font = '400 36px "IBM Plex Sans", system-ui, sans-serif'; g.fillStyle = '#4a5468'; g.fillText('Scan with your phone camera', W / 2, 215);
  const q = drawQr(document.createElement('canvas'), joinUrl(c), 1000);
  g.imageSmoothingEnabled = false; g.drawImage(q, (W - 1000) / 2, 270, 1000, 1000);
  g.fillStyle = '#0b1424'; g.font = '500 38px "IBM Plex Sans", system-ui, sans-serif'; g.fillText(joinUrl(c), W / 2, 1340, W - 120);
  g.fillStyle = '#4a5468'; g.font = '400 30px "IBM Plex Sans", system-ui, sans-serif'; g.fillText('Free social play · No betting · No real money', W / 2, 1410, W - 120);
  return cv;
}
const posterBlob = c => new Promise(res => qrPoster(c).toBlob(res, 'image/png'));
const qrFile = c => c.slug + '-join-qr.png';
async function wireJoinQr(){
  const boxes = document.querySelectorAll('[data-qr]');
  if(!boxes.length) return;
  try{ await loadQr(); }catch(e){ boxes.forEach(b => b.replaceWith(Object.assign(document.createElement('p'), { className: 'note', textContent: e.message }))); return; }
  boxes.forEach(cv => { const c = club.joinQr[+cv.dataset.qr]; if(c) drawQr(cv, joinUrl(c), 600); });
  // the image to share is made now, so tapping Share can hand it over straight away (iPhone needs that)
  const files = new Map();
  club.joinQr.forEach((c, i) => posterBlob(c).then(blob => blob && files.set(i, new File([blob], qrFile(c), { type: 'image/png' }))));
  document.querySelectorAll('.qr-leads').forEach(d => { d.open = qrLeadsOpen; d.ontoggle = () => { qrLeadsOpen = d.open; }; });
  const pick = b => club.joinQr[+(b.dataset.qshare ?? b.dataset.qdl ?? b.dataset.qprint)];
  document.querySelectorAll('[data-qshare]').forEach(b => b.onclick = async () => {
    const c = pick(b), url = joinUrl(c), text = `Join the ${clubTitle(c.name)} on Blindrise. Free social play, no betting, no real money:`;
    if(navigator.share){
      const file = files.get(+b.dataset.qshare);
      const withFile = file && navigator.canShare && navigator.canShare({ files: [file] });
      return navigator.share(withFile ? { title: 'Join the ' + clubTitle(c.name), text, url, files: [file] } : { title: 'Join the ' + clubTitle(c.name), text, url }).catch(() => {});
    }
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Join link copied.')).catch(() => toast(url));
  });
  document.querySelectorAll('[data-qdl]').forEach(b => b.onclick = async () => {
    const c = pick(b), href = URL.createObjectURL(await posterBlob(c));
    const a = Object.assign(document.createElement('a'), { href, download: qrFile(c) });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 60000);
  });
  document.querySelectorAll('[data-qprint]').forEach(b => b.onclick = () => {
    const c = pick(b), sheet = $('qrPrint');
    sheet.innerHTML = '';
    sheet.appendChild(Object.assign(document.createElement('img'), { src: qrPoster(c).toDataURL('image/png'), alt: 'QR code for ' + joinUrl(c) }));
    document.body.classList.add('print-qr');
    const done = () => { document.body.classList.remove('print-qr'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
  });
}
// ---------- opening a club (club switching only) ----------
// Two steps on one sheet: first the Blindrise Club Rules, shown in full, which must be ticked; then the club's name (and,
// for the founder, the setup code). The server refuses a club without acceptance of this exact rules version.
const rulesHTML = r => `<div class="cr-rules" tabindex="0" aria-label="Blindrise Club Rules"><h3>${esc(r.title)}</h3>${r.items.map(i => `<p>${esc(i)}</p>`).join('')}<small>Version ${r.v}</small></div>`;
async function openClubFlow(rules, founder){
  const step1 = modal(`<div class="cr-sheet"><span class="eyebrow">Step 1 of 2 · Club Rules</span><h2>Before you open a club</h2>
    <p class="cr-lead">Read the Blindrise Club Rules. You need to accept them to open a club.</p>${rulesHTML(rules)}
    <label class="cr-agree"><input type="checkbox" id="crAgree"> <span>I have read and accept the Blindrise Club Rules (version ${rules.v}).</span></label>
    <div class="err" id="crErr" role="alert"></div></div>`, [{ label: 'Cancel', value: false }, { label: 'Continue', value: true, primary: true }]);
  const cont = document.querySelector('#modalRoot [data-i="1"]');
  const sync = () => { cont.disabled = !$('crAgree').checked; cont.setAttribute('aria-disabled', String(cont.disabled)); };
  $('crAgree').onchange = sync; sync();
  if(!await step1) return;
  const step2 = modal(`<div class="cr-sheet"><span class="eyebrow">Step 2 of 2 · Your club</span><h2>Name your club</h2>
    <p class="cr-lead">It starts empty: its own members, invite links, QR code${founder ? ', tournaments' : ''} and Exchange.${founder ? '' : ' Tournaments are run by Blindrise: your members play them in the Blindrise Open.'} You are its owner, and only you see its members and sign-ups.</p>
    <div class="field"><label for="ncName">Club name</label><input id="ncName" maxlength="40" autocomplete="off"></div>
    ${founder ? '<div class="field"><label for="ncCode">Setup code</label><input id="ncCode" autocomplete="off"></div>' : ''}</div>`, [{ label: 'Cancel', value: false }, { label: 'Open club', value: true, primary: true }]);
  let name = '', code = '';
  $('ncName').oninput = e => name = e.target.value; if($('ncCode')) $('ncCode').oninput = e => code = e.target.value;
  if(!await step2) return;
  try{ await post('/api/createClub', { name, ...(founder ? { code: code.trim() } : {}), rulesV: rules.v, acceptRules: true }); toast('Club opened. Switch to it from the club button at the top.'); }
  catch(e){ modal(`<h2>That didn't work</h2><p>${esc(e.message)}</p>`, [{ label: 'OK', value: 1, primary: true }]); }
}
const newClub = () => openClubFlow(club.platform.rules, true);
// a business member (published, visible business in the Exchange) may open one club of their own
function openClubHTML(){
  if(!club.openClub) return '';
  return `<div class="card-box cr-offer"><span class="eyebrow">For business members</span><h3>Create your club</h3>
    <p class="note">Your business is in the Exchange, so you can open your own private club on Blindrise: your members, your QR code, your Exchange. One club per member.</p>
    <div class="btn-row"><button class="btn red" id="openClubBtn">Create your club</button></div></div>`;
}
// ---------- the founder's platform controls (club switching only) ----------
// Every other club with counts only (members, QR sign-ups): never names or emails. Suspend, restore or cancel, each
// asking for a reason and logged by the server. Blindrise posts go to every club.
const CLUB_STATUS = { active: ['Active', ''], suspended: ['Suspended', ' warn'], cancelled: ['Cancelled', ' idle'] };
function clubListHTML(){
  if(!club.canCreateClub || !club.platform) return '';
  const P = club.platform, active = P.clubs.filter(x => x.status !== 'cancelled').length;
  return `<div class="card-box pf-card"><span class="eyebrow">Blindrise clubs · ${active} open</span>
    <p class="note">Counts only. You never see another club's members, emails or content.</p>
    ${P.clubs.length ? `<div class="table-list">${P.clubs.map(x => `<div class="trow pf-row" data-pfclub="${esc(x.id)}"><div class="pf-t"><b>${esc(x.name)}</b><small>${x.members} member${x.members === 1 ? '' : 's'} · ${x.signups} QR sign-up${x.signups === 1 ? '' : 's'} · ${x.mine || x.host ? 'runs tournaments' : 'practice only'}</small></div>
      <span class="status-pill${CLUB_STATUS[x.status][1]}">${CLUB_STATUS[x.status][0]}</span>
      ${x.status === 'cancelled' ? '' : `<span class="row-btns">${x.mine ? '' : `<button class="back" data-pfact="${x.host ? 'unhost' : 'host'}" data-club="${esc(x.id)}">${x.host ? 'Stop tournaments' : 'Allow tournaments'}</button>`}${x.status === 'suspended' ? `<button class="back" data-pfact="unsuspend" data-club="${esc(x.id)}">Restore</button>` : `<button class="back" data-pfact="suspend" data-club="${esc(x.id)}">Suspend</button>`}<button class="back" data-pfact="cancel" data-club="${esc(x.id)}">Cancel club</button></span>`}</div>`).join('')}</div>` : '<p class="note">No other clubs yet.</p>'}
    <div class="btn-row"><button class="btn" id="newClubBtn">Open a new club</button></div>
    <details class="pf-log"><summary>Moderation log · ${P.log.length}</summary>${P.log.length ? `<div class="table-list">${P.log.map(e => `<div class="trow"><b>${esc({ suspend: 'Suspended', unsuspend: 'Restored', cancel: 'Cancelled', host: 'Tournaments allowed', unhost: 'Tournaments stopped' }[e.action] || e.action)} · ${esc(e.clubName)}</b><small>${new Date(e.at).toLocaleString()} · by ${esc(e.byName)}${e.reason ? ' · ' + esc(e.reason) : ''}</small></div>`).join('')}</div>` : '<p class="note">Nothing yet. Every suspend, restore and cancel is recorded here.</p>'}</details></div>
  <div class="card-box pf-card"><span class="eyebrow">Blindrise broadcast</span>
    <p class="note">Post once: it shows in every club, to every member, marked Blindrise. Nothing comes back from the clubs.</p>
    <div class="field"><label for="bcKind">Type</label><select id="bcKind"><option value="announcement">Announcement</option><option value="event">Event</option></select></div>
    <div class="field"><label for="bcTitle">Title</label><input id="bcTitle" maxlength="80"></div>
    <div class="field"><label for="bcBody">Message</label><textarea id="bcBody" maxlength="600" rows="3"></textarea></div>
    <div class="field"><label for="bcWhen">Date and time (needed for an event)</label><input id="bcWhen" type="datetime-local"></div>
    <div class="btn-row"><button class="btn red" id="bcPost">Post to every club</button></div>
    ${(club.blindrise || []).length ? `<div class="table-list">${club.blindrise.map(b => `<div class="trow"><b>${esc(b.title)}</b><small>${b.kind === 'event' ? 'Event' : 'Announcement'} · posted ${new Date(b.at).toLocaleDateString()}</small><button class="back" data-unpost="${esc(b.id)}">Remove</button></div>`).join('')}</div>` : ''}</div>`;
}
async function moderateClub(id, action){
  const x = club.platform.clubs.find(c => c.id === id); if(!x) return;
  const what = { suspend: ['Suspend', `Members of ${x.name} see a notice instead of the club, a running tournament is paused, and its QR join page and invite links stop. Nothing is deleted.`],
    unsuspend: ['Restore', `${x.name} opens again for its members. A paused tournament stays paused until the club's owner resumes it.`],
    cancel: ['Cancel club', `${x.name} closes for good: its members lose access and it can't be opened again. Its records are kept. This can't be undone.`],
    host: ['Allow tournaments', `${x.name}'s owner gets the tournament form in their Director and can pick a sponsor from their club's Exchange. You can stop it again.`],
    unhost: ['Stop tournaments', `${x.name} goes back to practice only: its owner can't open or start a tournament. One already running plays out.`] }[action];
  const pm = modal(`<h2>${esc(what[0])} ${esc(x.name)}?</h2><p>${esc(what[1])}</p><div class="field"><label for="pfReason">Reason (kept in the log)</label><input id="pfReason" maxlength="300"></div>`, [{ label: 'Back', value: false }, { label: esc(what[0]), value: true, primary: true }]);
  let reason = ''; $('pfReason').oninput = e => reason = e.target.value;
  if(!await pm) return;
  try{ await post('/api/clubModerate', { club: id, action, reason }); toast({ suspend: 'Club suspended.', cancel: 'Club cancelled.', unsuspend: 'Club restored.', host: 'Tournaments allowed.', unhost: 'Tournaments stopped.' }[action]); }
  catch(e){ modal(`<h2>That didn't work</h2><p>${esc(e.message)}</p>`, [{ label: 'OK', value: 1, primary: true }]); }
}
async function postBroadcast(){
  const w = $('bcWhen').value, body = { kind: $('bcKind').value, title: $('bcTitle').value, body: $('bcBody').value, when: w ? new Date(w).getTime() : null };
  try{ await post('/api/platformPost', body); toast('Posted to every club.'); $('bcTitle').value = ''; $('bcBody').value = ''; $('bcWhen').value = ''; }
  catch(e){ modal(`<h2>That didn't work</h2><p>${esc(e.message)}</p>`, [{ label: 'OK', value: 1, primary: true }]); }
}
// ---------- Live at Blindrise (Issue #25): the top of every member club's home ----------
// The platform's games, always at the top, never dismissed: the Blindrise club's tournament, the Blindrise Open and
// dominoes. What is live, what is open, when the next one starts; Watch for anyone, the seat or registration for
// whoever can play. Built only from club.live and club.bevent: public state and this member's own place, no names.
const watching = () => { try{ return sessionStorage.getItem('watch'); }catch(e){ return null; } };
function spectate(ctx, board){ try{ sessionStorage.setItem('watch', ctx); if(board) sessionStorage.setItem('watchBoard', '1'); else sessionStorage.removeItem('watchBoard'); }catch(e){} location.replace('/'); }
function stopWatching(){ try{ sessionStorage.removeItem('watch'); sessionStorage.removeItem('watchBoard'); }catch(e){} location.replace('/'); }
const goMain = () => { local.set('club', 'main'); location.replace('/'); };
function liveHTML(noBev){
  const L = club.live; if(!L) return '';
  const p = L.poker, d = L.domino, row = (ic, eye, name, sub, acts, note) => `<div class="lv-row"><span class="hsec-ic ${ic}">${Icons.svg(ic === 'poker' ? 'spade' : 'spark')}</span><div class="lv-t"><span class="eyebrow">${eye}</span><b>${esc(name)}</b><small>${sub}</small>${note ? `<small class="lv-note">${note}</small>` : ''}</div>${acts ? `<div class="lv-acts">${acts}</div>` : ''}</div>`;
  let rows = '';
  if(p){
    const live = p.status === 'running';
    const sub = live ? `<span class="lv-live">Live</span> · ${p.paused ? 'Paused' : 'Level ' + (p.level + 1)} · ${p.remaining} of ${p.count} left` : `Registration open · ${p.count} registered${p.startAt ? ' · ' + esc(when(p.startAt)) : ''}`;
    const acts = (p.playing ? '<button class="btn red" data-live="seat-main">Go to your seat</button>' : '')
      + (live ? `<button class="btn${p.playing ? '' : ' red'}" data-live="watch-main">Watch</button>` : '')
      + (!p.playing && p.registered && !live ? '<button class="btn" data-live="go-main">Open</button>' : '')
      + (!p.registered && p.open && L.member ? `<button class="btn${live ? '' : ' red'}" data-live="go-main">Register</button>` : '');
    const note = p.registered && !p.playing ? (live ? '' : "You're registered.") : !L.member ? (live ? 'Played by Blindrise club members. Watch any table.' : 'Played by Blindrise club members. You can watch every table once it starts.') : '';
    rows += live && p.tableList ? broadcastHTML(p, acts, note) : row('poker', 'Blindrise · Poker', p.name, sub, acts, note);
  }
  if(club.bevent && !noBev) rows += beventHTML();
  if(d){
    const live = d.status === 'running', R = { allfives: 'All Fives', block: 'Block', draw: 'Draw' }[d.rules.preset] || 'Dominoes';
    const sub = live ? `<span class="lv-live">Live</span> · ${d.playing} ${d.playing === 1 ? 'match' : 'matches'} on the tables · ${d.count} players` : `Registration open · ${d.count} registered · ${R}`;
    const acts = (live ? '<button class="btn red" data-live="board">Watch the board</button>' : '')
      + (!live && L.member ? `<button class="btn${d.registered ? '' : ' red'}" data-live="go-main">${d.registered ? 'Open' : 'Register'}</button>` : '');
    rows += row('opp', 'Blindrise · Dominoes', d.name, sub, acts, !live ? (d.registered ? "You're in." : !L.member ? 'Played by Blindrise club members. You can watch the board once it starts.' : '') : '');
  }
  const on = (p && p.status === 'running') || (d && d.status === 'running') || (club.bevent && club.bevent.status === 'running');
  return `<section class="card-box lv-head" aria-label="Live at Blindrise"><div class="br-head"><span class="br-badge">Blindrise</span><span class="eyebrow">Live at Blindrise</span>${on ? '<span class="status-pill live">LIVE</span>' : ''}</div>
    ${rows || '<p class="note lv-none">No Blindrise game right now. Tournaments and dominoes show here the moment registration opens, and you can watch every one live.</p>'}</section>`;
}
// The live tournament as a broadcast card (owner's design brief, 2026-10-21, after PokerGO / WPT): a pulsing LIVE badge,
// the level and blinds, the watchers; then the field, the tables and the overall leader; then a card per table with its
// seats and its chip leader. Tap a table to watch it. Names here are the table names every watcher already sees.
function broadcastHTML(p, acts, note){
  const [sb, bb] = E.levelFor(p.level), out = Math.max(0, Math.min(100, (1 - p.remaining / Math.max(1, p.count)) * 100));
  const L = p.leader, ini = n => (String(n).match(/[\p{L}\p{N}]+/gu) || ['?']).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  // a leader's name: hover or focus shows a small card with their initials, stack in big blinds and table
  const vip = (x, table, focus = true) => `<span class="vip"${focus ? ' tabindex="0"' : ''}><span class="vip-n">${esc(x.name)}</span><span class="vip-tip" role="tooltip"><span class="vip-av">${esc(ini(x.name))}</span><span class="vip-t"><b>${esc(x.name)}</b><small>${bbText(x.stack / bb)} BB · Table ${table}</small></span></span></span>`;
  return `<article class="lv-bc" aria-label="${esc(p.name)}, live">
    <header class="lv-bc-h"><span class="lv-badge"><i aria-hidden="true"></i>Live tournament</span>
      <div class="lv-bc-t"><b>${esc(p.name)}</b><small>${p.paused ? 'Paused' : `Level ${p.level + 1} · <span class="mono">${fmt(sb)}/${fmt(bb)}</span>`}</small></div>
      <span class="lv-bc-w" aria-label="${p.watchers} watching">${Icons.svg('eye')}<b>${odo('lw', p.watchers)}</b><small>Watching</small></span></header>
    <div class="lv-tele">
      <div><span class="hud-lbl">Remaining</span><b>${odo('lr', p.remaining)}<small>/${p.count}</small></b><small>Players</small><span class="hud-prog" aria-hidden="true"><i style="width:${out.toFixed(1)}%"></i></span></div>
      <div><span class="hud-lbl">Active tables</span><b>${odo('lt', p.tables)}</b><small>${p.tables === 1 ? 'Table' : 'Tables'}</small></div>
      ${L ? `<div class="lv-tele-lead"><span class="hud-lbl">Overall leader</span><b>${Icons.svg('crown')}${vip(L, L.table)}</b><button type="button" class="lv-stack" data-bbtoggle aria-label="Switch chips and big blinds">${stackHTML('ll', L.stack, bb)}</button></div>` : ''}
    </div>
    <div class="lv-tcs">${p.tableList.map(t => `<button type="button" class="lv-tc" data-live="watch-table" data-tn="${t.n}" aria-label="Watch table ${t.n}">
      <span class="lv-tc-top"><span class="lv-tc-n">Table ${t.n}</span>${miniTable(t.seated, p.size)}<span class="lv-tc-cnt"><b>${t.seated}</b>/${p.size}</span></span>
      ${t.leader ? `<span class="lv-tc-lead">${Icons.svg('chip')}${vip(t.leader, t.n, false)}<span class="lv-tc-st">${stackHTML('t' + t.n, t.leader.stack, bb)}</span></span>` : ''}</button>`).join('')}</div>
    ${note ? `<p class="lv-note">${note}</p>` : ''}
    ${acts ? `<div class="lv-acts">${acts}</div>` : ''}</article>`;
}
// a miniature oval table with its seats around it: lit gold where someone sits, dim where a seat is open
function miniTable(seated, size){
  const nodes = Array.from({ length: size }, (_, i) => { const a = Math.PI / 2 + (i / size) * Math.PI * 2, x = 32 + Math.cos(a) * 27, y = 20 + Math.sin(a) * 15;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.1" class="${i < seated ? 'on' : ''}"/>`; }).join('');
  return `<svg class="mini-table" viewBox="0 0 64 40" aria-hidden="true" focusable="false"><ellipse cx="32" cy="20" rx="19" ry="9.5" class="mt-felt"/><ellipse cx="32" cy="20" rx="19" ry="9.5" class="mt-rail"/>${nodes}</svg>`;
}
function spectateTable(n){ try{ sessionStorage.setItem('watchTable', String(n)); }catch(e){} spectate('main'); }
// Watch a table straight from the live card: open it as soon as the tables are here
function tableOnArrival(){
  let n = null; try{ n = sessionStorage.getItem('watchTable'); }catch(e){}
  const t = n && club.tables.find(x => String(x.n) === n); if(!n) return;
  try{ sessionStorage.removeItem('watchTable'); }catch(e){}
  if(t) openTable(t.tid);
}
// what a member watching a Blindrise game sees instead of the lobby: the tournament, its tables, the domino board
function watchHTML(){
  const t = club.tourney, live = t && t.status === 'running', dm = window.Domino.state(), dt = dm && dm.t && dm.t.status === 'running' ? dm.t : null;
  const tables = live ? club.tables.map(x => `<button class="btn lv-table" data-wt="${esc(x.tid)}" aria-label="Watch table ${x.n}"><span class="lv-table-t">Table ${x.n}<small>${x.players} ${x.players === 1 ? 'player' : 'players'}</small></span><span class="lv-table-go" aria-hidden="true">${Icons.svg('eye')}Watch</span></button>`).join('') : '';
  const sub = !t ? 'No tournament is playing right now.' : live ? `${t.paused ? 'Paused' : 'Level ' + (t.level + 1)} · ${t.remaining} of ${t.entrants} players left` : t.status === 'registering' ? `Starts ${t.startAt ? esc(when(t.startAt)) : 'when the director is ready'} · ${t.regCount} registered` : 'This tournament has finished.';
  return `<section class="card-box lv-watch" aria-label="Watching"><div class="br-head"><span class="br-badge">Blindrise</span><span class="eyebrow">Watching · ${esc(club.club.name)}</span>${live ? '<span class="status-pill live">LIVE</span>' : ''}</div>
    <h2>${esc(t ? t.name : 'Live at Blindrise')}</h2><p class="br-when">${sub}</p>
    ${tables ? `<p class="note">Tap Watch on a table to see it live. Cards show only when players show them.</p><div class="lv-tables">${tables}</div>` : ''}
    ${dt ? `<div class="lv-row"><span class="hsec-ic opp">${Icons.svg('spark')}</span><div class="lv-t"><span class="eyebrow">Dominoes</span><b>${esc(dt.name)}</b></div><div class="lv-acts"><button class="btn red" data-live="tv">Watch the board</button></div></div>` : ''}
    <p class="note">You're watching from ${esc(club.home.name)}. Nothing about you or your club is shown here, and there is no chat while you watch.</p>
    <div class="btn-row"><button class="btn" data-live="home">Back to ${esc(club.home.name)}</button></div></section>`;
}
// Watch the board: open the domino TV board as soon as its state is here
function boardOnArrival(){
  let want = false; try{ want = sessionStorage.getItem('watchBoard') === '1'; }catch(e){}
  const dm = window.Domino.state(); if(!want || !dm) return;
  try{ sessionStorage.removeItem('watchBoard'); }catch(e){}
  if(dm.t) window.Domino.openTV();
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-wt]'); if(t && club && club.spectate) return openTable(t.dataset.wt);
  const b = e.target.closest('[data-live]'); if(!b || !club) return;
  const k = b.dataset.live;
  if(k === 'seat-main' || k === 'go-main') return goMain();
  if(k === 'watch-main') return spectate('main');
  if(k === 'watch-table') return spectateTable(b.dataset.tn);
  if(k === 'watch-events') return spectate('events');
  if(k === 'board') return spectate('main', true);
  if(k === 'tv') return window.Domino.openTV();
  if(k === 'home') return stopWatching();
});
// ---------- the Blindrise Open (club switching only) ----------
// Blindrise tournaments for members of every club. Each club shows this card: what it is, when, and how many have
// registered (never who). Registering takes you into the Blindrise Open, where you play under your table name.
function beventHTML(){
  const e = club.bevent; if(!e) return '';
  const live = e.status === 'running';
  const sub = live ? `Live now · ${e.remaining} of ${e.count} players left` : e.startAt ? esc(when(e.startAt)) : 'Starts when the director is ready';
  const acts = (e.playing ? '<button class="btn red" data-bev="go">Go to your table</button>'
    : e.registered ? `<button class="btn red" data-bev="go">Open</button>${live ? '' : '<button class="btn" data-bev="leave">Unregister</button>'}`
    : e.open ? '<button class="btn red" data-bev="join">Register</button>' : '') + (live && !e.playing ? '<button class="btn" data-live="watch-events">Watch</button>' : '');
  return `<article class="card-box br-post bo-card" aria-label="Blindrise Open"><div class="br-head"><span class="br-badge">Blindrise</span><span class="eyebrow">Blindrise Open · every club</span>${live ? '<span class="status-pill live">LIVE</span>' : ''}</div>
    <h3>${esc(e.name)}</h3><p class="br-when">${sub}</p>
    <p class="bo-meta"><span><b class="num">${e.count}</b> registered</span><span><b class="num">${fmt(e.stack)}</b> chips</span><span><b class="num">${e.levelMin}</b>-min levels</span></p>
    ${e.registered && !e.playing ? `<p class="bo-in">${live ? 'You played in this one.' : "You're registered."}</p>` : '<p class="note">Play members of every Blindrise club. Everyone plays under their table name.</p>'}
    ${acts ? `<div class="btn-row">${acts}</div>` : ''}</article>`;
}
const goEvents = () => { local.set('club', 'events'); location.replace('/'); };
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-bev]'); if(!b || !club) return;
  const k = b.dataset.bev;
  if(k === 'go') return goEvents();
  try{
    if(k === 'join'){
      if(!await modal(`<h2>Register for ${esc(club.bevent.name)}?</h2><p>You'll play members of every Blindrise club under your table name, <b>${esc(club.me.name)}</b>. Nothing else about you is shown to them. If another player's name looks like yours, your club's name is added so you can be told apart.</p>`, [{ label: 'Not now', value: false }, { label: 'Register', value: true, primary: true }])) return;
      await post('/api/eventJoin', {}); toast(`You're registered for ${club.bevent.name}.`);
    }
    if(k === 'leave'){ await post('/api/eventLeave', {}); toast('You are no longer registered.'); }
  }catch(err){ modal(`<h2>That didn't work</h2><p>${esc(err.message)}</p>`, [{ label: 'OK', value: 1, primary: true }]); }
});
// the founder runs the Blindrise Open from its own space, with the Director he knows
function eventsRunHTML(){
  if(!club.canRunEvents) return '';
  return `<div class="card-box pf-card"><span class="eyebrow">Blindrise Open</span>
    <p class="note">Tournaments members of every club can join. They register from their own club and play under their table names. The registration list stays with Blindrise: clubs only see how many have registered.</p>
    <div class="btn-row"><button class="btn red" id="runEventsBtn">Run the Blindrise Open</button></div></div>`;
}
// Blindrise posts, shown in every club and always marked as Blindrise's, never the club's own
// Web addresses in a post become links: http(s) ones, and bare blindrise.com/.club/.ca ones (shared without "https://").
// Each piece is escaped on its own, so nothing the founder typed can turn into markup or a script link.
const POST_URL = /\bhttps?:\/\/[^\s<>"']+|\bblindrise\.(?:com|club|ca)\/[^\s<>"']*/gi;
function linkText(t){
  t = String(t ?? ''); let out = '', at = 0;
  for(const m of t.matchAll(POST_URL)){
    const url = m[0].replace(/[.,;:!?)\]]+$/, ''), href = /^https?:/i.test(url) ? url : 'https://' + url;
    out += esc(t.slice(at, m.index)) + `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`; at = m.index + url.length;
  }
  return out + esc(t.slice(at));
}
function blindriseHTML(){
  const list = club.blindrise || []; if(!list.length) return '';
  return list.map(b => `<article class="card-box br-post" aria-label="From Blindrise"><div class="br-head"><span class="br-badge">Blindrise</span><span class="eyebrow">${b.kind === 'event' ? 'Official event' : 'Official announcement'}</span></div>
    <h3>${esc(b.title)}</h3>${b.when ? `<p class="br-when">${esc(when(b.when))}</p>` : ''}<p>${linkText(b.body)}</p></article>`).join('');
}
// a member of a suspended club gets this instead of the club
function suspendedHTML(){
  const others = (club.clubs || []).filter(x => x.id !== club.club.id && !x.suspended);
  return `<section class="card-box cs-notice" role="status"><span class="cs-ic" aria-hidden="true">!</span><span class="eyebrow">Club suspended</span>
    <h2>${esc(club.club.name)} is suspended</h2><p>Blindrise has suspended this club for now. Its members, tournaments and records are kept safe, but nothing in it can be used until it is restored.</p>
    ${others.length ? `<div class="btn-row"><button class="btn red" id="csSwitch">Go to ${esc(others[0].name)}</button></div>` : ''}</section>` + blindriseHTML();
}
// Business Club + Opportunity Club: off until the owner opens them; while off only the owner sees them (to try them out)
function clubsSwitchHTML(){
  const on = !!(club.features && club.features.clubs);
  return `<div class="card-box"><span class="eyebrow">Business Club &amp; Opportunity Club</span>
    <p class="note">${on ? 'Open: every member can see and use them.' : 'Closed: only you can see them. Members see the Coming soon card.'} They never affect games, points or the leaderboard.</p>
    <div class="btn-row"><button class="btn${on ? '' : ' red'}" id="clubsBtn">${on ? 'Close them to members' : 'Open them to members'}</button></div></div>`;
}
// table extras (show or muck, rabbit hunt, pause between hands): only offered where the server allows them
const extrasOn = () => !!(club && club.features && club.features.tableExtras);
// the sponsor and the prize on the lobby's tournament card
const presentedHTML = T => T.sponsor || T.prize ? `<p class="note sp-note">${T.sponsor ? `Presented by <b>${esc(T.sponsor.name)}</b>${/\.$/.test(T.sponsor.name) ? '' : '.'}` : ''}${T.sponsor && T.prize ? ' ' : ''}${T.prize ? `<span class="sp-prize">Prize: <b>${esc(T.prize)}</b></span>` : ''}</p>` : '';
function extrasNote(T){
  if(!extrasOn() || !T) return '';
  const x = [T.showMuck ? 'after each hand, players may show one or both of their cards' : '', T.rabbit ? 'the unused turn and river are shown when a hand ends early' : '', T.handPause ? `${T.handPause} seconds between hands` : ''].filter(Boolean);
  return x.length ? ` Table extras: ${x.join('; ')}.` : '';
}
// tournament breaks (every 10 levels) and the sponsor spotlight: see server/club.js
const breaksOn = () => !!(club && club.features && club.features.breaks);
const breakNote = T => breaksOn() && T ? ` A ${T.breakMin || 5}-minute break after every 10 levels; play resumes by itself.` : '';
function sponsorFields(P, opt){
  if(club.events) return ''; // the Blindrise Open has no Exchange to pick a sponsor from
  const S = club.sponsors;
  // the prize, in the director's words: plain text, never cash (server/club.js prizeOf)
  const prize = `<label>Prize (optional)<input id="nPrize" maxlength="80" autocomplete="off" placeholder="For example: Dinner for two at Aurora" value="${esc(P ? P.prize || '' : '')}"></label>
        <p class="note">Shown in the lobby and on the tables, for example $100 Prize or Dinner for two. No links or phone numbers.</p>`;
  if(!S || !S.list.length) return `<p class="note">Tournament sponsor: when a member publishes their business in the Exchange, you can pick it here to show on the tables at the start and during breaks.</p>${prize}`;
  const cur = P ? (P.sponsor ? P.sponsor.uid : '') : S.spotlight || '';
  return `<div class="two"><label>Tournament sponsor<select id="nSponsor">${opt('', 'None', cur)}${S.list.map(b => opt(b.uid, esc(b.name) + (b.uid === S.spotlight ? ' (Spotlight)' : ''), cur)).join('')}</select></label>
        <label>Sponsor at the start<select id="nSponsorSec">${[5, 8, 10].map(v => opt(v, v + ' seconds', P ? P.sponsorSec || 8 : 8)).join('')}</select></label></div>
        <p class="note">The sponsor's name and logo from the Exchange show on every table for a few seconds when play starts and during each break. They never cover cards or buttons.</p>
        ${prize}`;
}
function directorMainHTML(){
  const T = club.tourney;
  const members = `<div class="card-box"><span class="eyebrow">${club.events ? 'Players' : 'Members'} · ${club.members.length}</span>
    ${club.events ? '<p class="note">Members of every club register from their own club. Everyone shows under their table name; names that look alike get their club\'s name.</p>' : `<div class="btn-row"><button class="btn red" id="inviteBtn">Create invite link</button><button class="btn" id="memInvBtn">${club.membersInvite ? 'Members can invite: on' : 'Members can invite: off'}</button></div>
    <p class="note">Pick a <b>group link</b> for a WhatsApp or Telegram group (up to 100 people, 30 days; it stays the same link until you cancel it), or a <b>personal link</b> for one friend. They open it, pick a name and PIN, and they're in.</p>
    ${club.invites && club.invites.length ? `<div class="table-list">${club.invites.map(i => `<div class="trow"><b>${i.multi ? (i.by && i.by !== club.me.id ? esc(nameOf(i.by)) + "'s link" : 'Group link') : 'Unused invite'}</b><small>${i.multi ? `${i.used} of ${i.max} joined · until ${new Date(i.expiresAt).toLocaleDateString()}` : new Date(i.createdAt).toLocaleDateString()}</small><button class="back" data-copy="${esc(i.code)}" data-group="${i.multi ? 1 : ''}">Copy</button><button class="back" data-revoke="${esc(i.code)}">Cancel</button></div>`).join('')}</div>` : ''}`}
    <div class="table-list">${club.members.map(m => { const hh = club.households && club.households[m.id], mates = hh ? club.members.filter(x => x.id !== m.id && club.households[x.id] === hh).map(x => x.name) : [];
      return `<div class="trow"><b>${esc(m.name)}</b><small>${m.role === 'owner' ? 'Owner' : 'Member since ' + new Date(m.createdAt).toLocaleDateString()}${m.invitedBy && m.invitedBy !== club.me.id ? ' · invited by ' + esc(nameOf(m.invitedBy)) : ''}${mates.length ? ` · Home with ${esc(mates.join(', '))}` : ''}</small><span class="row-btns">${m.role === 'owner' ? '' : `<button class="back" data-mute="${esc(m.id)}" data-on="${(club.mutedIds || []).includes(m.id) ? 1 : 0}">${(club.mutedIds || []).includes(m.id) ? 'Unmute' : 'Mute'}</button>`}<button class="back" data-home="${esc(m.id)}">Home</button>${m.role === 'owner' ? '' : `<button class="back" data-remove="${esc(m.id)}">Remove</button>`}</span></div>`; }).join('')}</div>
    <div class="btn-row"><button class="btn" id="chatOffBtn">${club.chatOff ? 'Turn table chat on' : 'Turn table chat off'}</button></div>
    <p class="note">Table chat is ${club.chatOff ? '<b>off</b>' : '<b>on</b>'}. <b>Mute</b> stops one person from chatting or throwing things.</p>
    <p class="note">Use <b>Home</b> to mark people who live together (for example a couple). They're never seated at the same table. Players on the same internet or the same phone are kept apart automatically.</p></div>`;
  const editing = editingT && T && T.status === 'registering';
  // a club a member opened doesn't run tournaments (Blindrise does); the founder can allow one
  if(club.hosts === false && (!T || ['finished', 'cancelled'].includes(T.status) || editing))
    return `<div class="card-box"><span class="eyebrow">Tournaments</span><h3>Run by Blindrise</h3>
      <p class="note">Your members play real tournaments in the <b>Blindrise Open</b>, from this club. Here everyone can play the practice table any time.</p></div>${members}`;
  if(!T || ['finished', 'cancelled'].includes(T.status) || editing){
    const P = editing ? T : null, opt = (v, l, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`;
    const d = P && P.startAt ? new Date(P.startAt) : new Date(Date.now() + 864e5); if(!(P && P.startAt)) d.setHours(20, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const at = P && P.startAt ? 'at' : 'manual';
    return `<div class="card-box"><span class="eyebrow">${editing ? 'Edit tournament' : 'New tournament'}</span>
      ${editing ? `<p class="note">Changes keep everyone who already joined (${T.regs.length}).</p>` : ''}
      <form class="form" id="newForm">
        <label>Name<input id="nName" maxlength="40" value="${esc(P ? P.name : new Date().toLocaleDateString('en-US', { weekday: 'long' }) + ' Night Tournament')}"></label>
        <div class="two"><label>Starting stack<select id="nStack">${[[10000, '10000'], [20000, '20000'], [30000, '30000'], [50000, '50000'], [60000, '60000 (WSOP Main Event)']].map(([v, l]) => opt(v, l, P ? P.stack : 30000)).join('')}</select></label>
        <label>Level length<select id="nLevel">${[5, 10, 15, 20, 30].map(v => opt(v, v + ' min', P ? P.levelMin : 20)).join('')}</select></label></div>
        <div class="two"><label>Players per table<select id="nSize"><option value="9" selected>9 (WSOP/WPT)</option></select></label>
        <label>Late registration<select id="nLate">${[[0, 'Off'], [2, 'Until end of level 2'], [4, 'Until end of level 4'], [6, 'Until end of level 6']].map(([v, l]) => opt(v, l, P ? P.lateLevels : 4)).join('')}</select></label></div>
        <div class="two"><label>Ante<select id="nAnte">${opt('each', 'Every player', P ? P.anteMode : 'each')}${opt('bb', 'Big blind (WSOP)', P ? P.anteMode : 'each')}</select></label>
        <label>Time to act<select id="nAct">${[10, 15, 20, 30].map(v => opt(v, v + ' seconds', P ? P.actSec : 20)).join('')}</select></label></div>
        <label>Hand helper<select id="nHelper">${opt('on', 'On: show hand strength and win chance', P && P.helper === false ? 'off' : 'on')}${opt('off', 'Off (pro mode)', P && P.helper === false ? 'off' : 'on')}</select></label>
        ${breaksOn() ? `<label>Break after every 10 levels<select id="nBreak">${[3, 4, 5].map(v => opt(v, v + ' minutes', P ? P.breakMin || 5 : 5)).join('')}</select></label>` : ''}
        ${sponsorFields(P, opt)}
        ${extrasOn() ? `<div class="two"><label>Show cards<select id="nShow">${opt('off', 'Off', P && P.showMuck ? 'on' : 'off')}${opt('on', 'Players may show', P && P.showMuck ? 'on' : 'off')}</select></label>
        <label>Rabbit hunt<select id="nRabbit">${opt('off', 'Off', P && P.rabbit ? 'on' : 'off')}${opt('on', 'Show the unused cards', P && P.rabbit ? 'on' : 'off')}</select></label></div>
        <label>Pause between hands<select id="nPause">${[[0, 'Standard (about 3 seconds)'], [2, '2 seconds'], [3, '3 seconds'], [4, '4 seconds'], [5, '5 seconds'], [6, '6 seconds']].map(([v, l]) => opt(v, l, P ? P.handPause || 0 : 0)).join('')}</select></label>` : ''}
        <div class="two"><label>Start<select id="nWhen">${opt('manual', 'When I press Start', at)}${opt('at', 'At a set time', at)}</select></label>
        <label>Repeat<select id="nRepeat">${[['none', 'Just once'], ['daily', 'Every day'], ['weekly', 'Every week']].map(([v, l]) => opt(v, l, P ? P.repeat : 'none')).join('')}</select></label></div>
        <label id="atWrap"${at === 'at' ? '' : ' hidden'}>Start time<input type="datetime-local" id="nAt" value="${local}"></label>
        <div class="btn-row">${editing ? '<button class="btn" type="button" id="editBack">Back</button>' : ''}<button class="btn red" type="submit">${editing ? 'Save changes' : 'Open registration'}</button></div>
      </form>
      ${editing ? '' : '<p class="note">Tables are 9-handed: 1 table for up to 9 players, 2 for up to 18, and so on. Players are moved to keep tables even, and tables merge as people bust, down to one final table. A repeating tournament opens again by itself at the same time.</p>'}</div>${members}`;
  }
  if(T.status === 'registering'){
    return `<div class="card-box"><span class="status-pill">Registration open</span><h3>${esc(T.name)}</h3>
      <p>${T.regs.length} joined · ${Math.max(1, Math.ceil(T.regs.length / (T.tableSize || 9)))} table${T.regs.length > (T.tableSize || 9) ? 's' : ''}${T.startAt ? ' · starts ' + esc(when(T.startAt)) : ''}</p>
      <div class="plist">${T.regs.map(u => pchip(u, true)).join('') || '<span class="note">Waiting for players to join.</span>'}</div>
      ${T.regs.length < 2 ? `<p class="warn-note">You need at least 2 players to start. Send an invite, and ask your friend to tap <b>Join tournament</b> on Home.</p>` : ''}
      <div class="btn-row"><button class="btn red" id="startBtn" ${T.regs.length < 2 ? 'disabled' : ''}>Start now</button><button class="btn" id="editBtn">Edit</button><button class="btn" id="cancelBtn">Cancel</button></div></div>${members}`;
  }
  return `<div class="card-box"><span class="status-pill live">Live</span><h3>${esc(T.name)}</h3>
    <div class="kv num"><div><small>Players left</small><b>${T.remaining}</b></div><div><small>Tables</small><b>${club.tables.length}</b></div><div><small>Clock</small><b>${T.paused ? 'Paused' : T.breakUntil ? 'On break' : T.breakPending ? 'Break next' : 'Running'}</b></div></div>
    ${T.breakUntil ? `<p class="note">Break until ${esc(clockAt(T.breakUntil - clockSkew))}. Play resumes by itself on level ${T.level + 1}.</p>` : ''}
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
  window.Domino.wire(document);
  wireJoinQr();
  document.querySelectorAll('[data-demo]').forEach(b => b.onclick = startDemo);
  document.querySelectorAll('[data-fair]').forEach(b => b.onclick = () => { b.disabled = true; b.textContent = 'Checking…'; send({ t: 'fair', id: b.dataset.fair }); });
  document.querySelectorAll('[data-sealinfo]').forEach(a => a.onclick = e => { e.preventDefault(); tab = 'learn'; learnSeg = 'fair'; renderLobby(); });
  document.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => send({ t: 'mute', uid: b.dataset.mute, muted: b.dataset.on !== '1' }));
  on2('chatOffBtn', () => send({ t: 'chatOff', off: !club.chatOff }));
  on2('clubsBtn', () => { const on = !!(club.features && club.features.clubs); if(confirm(on ? 'Close Business Club and Opportunity Club to members? Their posts stay saved.' : 'Open Business Club and Opportunity Club to every member now?')) send({ t: 'clubs', on: !on }); });
  on2('memInvBtn', () => send({ t: 'membersInvite', on: !club.membersInvite }));
  document.querySelectorAll('[data-bseg]').forEach(b => b.onclick = () => { boardSeg = b.dataset.bseg; renderLobby(); });
  document.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => send({ t: 'skillq', rid: b.dataset.claim }));
  document.querySelectorAll('[data-rmrw]').forEach(b => b.onclick = async () => { if(await modal('<h2>Remove this prize?</h2><p>Claims already made stay on the list.</p>', [{ label: 'Keep', value: false }, { label: 'Remove', value: true, primary: true }])) send({ t: 'removeReward', id: b.dataset.rmrw }); });
  document.querySelectorAll('[data-rdone]').forEach(b => b.onclick = () => send({ t: 'redeemStatus', id: b.dataset.rdone, status: 'delivered' }));
  document.querySelectorAll('[data-rcancel]').forEach(b => b.onclick = async () => { if(await modal('<h2>Cancel this claim?</h2><p>The points go back to the player.</p>', [{ label: 'Keep', value: false }, { label: 'Cancel claim', value: true, primary: true }])) send({ t: 'redeemStatus', id: b.dataset.rcancel, status: 'cancelled' }); });
  const rf = $('rewardForm'); if(rf) rf.onsubmit = e => { e.preventDefault(); send({ t: 'addReward', name: $('rwName').value, cost: +$('rwCost').value, qty: +$('rwQty').value, value: $('rwValue').value }); };
  const on = (id, f) => { const el = $(id); if(el) el.onclick = f; };
  on('joinBtn', () => { send({ t: 'join' }); setTimeout(offerReminder, 600); });
  // cancelling asks first; the server still only allows it while registration is open
  on('leaveBtn', async () => { if(await modal(`<h2>Cancel your registration?</h2><p>You'll be taken off ${esc(club.tourney.name)}. You can join again while registration is open.</p>`, [{ label: 'Keep my seat', value: false }, { label: 'Cancel my registration', value: true, primary: true }])) send({ t: 'leave' }); });
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
  on('newClubBtn', newClub);
  on('runEventsBtn', async () => { try{ await post('/api/eventsOpen', {}); goEvents(); }catch(err){ modal(`<h2>That didn't work</h2><p>${esc(err.message)}</p>`, [{ label: 'OK', value: 1, primary: true }]); } });
  on('openClubBtn', () => openClubFlow(club.openClub.rules, false));
  on('bcPost', postBroadcast);
  on('csSwitch', () => { const x = club.clubs.find(c => c.id !== club.club.id && !c.suspended); if(x){ local.set('club', x.id); location.replace('/'); } });
  document.querySelectorAll('[data-pfact]').forEach(b => b.onclick = () => moderateClub(b.dataset.club, b.dataset.pfact));
  document.querySelectorAll('[data-unpost]').forEach(b => b.onclick = async () => { try{ await post('/api/platformUnpost', { id: b.dataset.unpost }); }catch(e){ toast(e.message); } });
  on('lateInvite', e => { e.preventDefault(); askInvite(); });
  on('againBtn', () => {
    const T = club.tourney, d = new Date();
    send({ t: 'create', name: T ? T.name : `${d.toLocaleDateString('en-US', { weekday: 'long' })} Night Tournament`, stack: T ? T.stack : 30000, levelMin: T ? T.levelMin : 20, startAt: $('againAt') && $('againAt').value ? +$('againAt').value : null, repeat: 'none', anteMode: T && T.anteMode ? T.anteMode : 'each', actSec: T && T.actSec ? T.actSec : 20, tableSize: 9, lateLevels: T && T.lateLevels != null ? T.lateLevels : 4, helper: T ? T.helper !== false : true, ...(extrasOn() && T ? { showMuck: !!T.showMuck, rabbit: !!T.rabbit, handPause: T.handPause || 0 } : {}),
      ...(T ? { breakMin: T.breakMin || 5, sponsor: T.sponsor ? T.sponsor.uid : null, sponsorSec: T.sponsorSec || 8, prize: T.prize || '' } : {}) });
    send({ t: 'join' }); tab = 'event';
  });
  on('newCustomBtn', () => { tab = 'director'; renderLobby(); });
  const nf = $('newForm');
  if(nf){
    $('nWhen').onchange = () => $('atWrap').hidden = $('nWhen').value !== 'at';
    nf.onsubmit = e => {
      e.preventDefault();
      const at = $('nWhen').value === 'at' ? new Date($('nAt').value).getTime() : null;
      send({ t: editingT ? 'edit' : 'create', name: $('nName').value.trim(), stack: +$('nStack').value, levelMin: +$('nLevel').value, startAt: at, repeat: at ? $('nRepeat').value : 'none', anteMode: $('nAnte').value, actSec: +$('nAct').value, tableSize: +$('nSize').value, lateLevels: +$('nLate').value, helper: $('nHelper').value, ...(extrasOn() ? { showMuck: $('nShow').value, rabbit: $('nRabbit').value, handPause: +$('nPause').value } : {}),
        ...($('nBreak') ? { breakMin: +$('nBreak').value } : {}), ...($('nSponsor') ? { sponsor: $('nSponsor').value || null, sponsorSec: +$('nSponsorSec').value } : {}), ...($('nPrize') ? { prize: $('nPrize').value.trim() } : {}) });
      if(editingT){ editingT = false; toast('Tournament updated.'); } else tab = 'event';
    };
    on('editBack', () => { editingT = false; renderLobby(); });
  }
  on('startBtn', async () => { if(await modal(`<h2>Start ${esc(club.tourney.name)}?</h2><p>${club.tourney.regs.length} players will be seated now.</p>`, [{ label: 'Not yet', value: false }, { label: 'Shuffle up and deal', value: true, primary: true }])) send({ t: 'start' }); });
  on('editBtn', () => { editingT = true; renderLobby(); });
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
function openTable(tid){ LOCK = null; if(tid !== watchTid){ chatUnread = 0; $('chatDot').hidden = true; } watchTid = tid; view = 'table'; seen = new Set(); showScreen('game'); send({ t: 'watch', tid }); renderTable(); }
// (the board: from a table back to Poker, where the tournament card and "Go to my table" are)
$('lobbyBtn').onclick = () => { openChat(false); stopDemo(); view = 'lobby'; if(BOARD){ tab = 'poker'; bFrom = null; } send({ t: 'watch', tid: null }); showScreen('lobby'); renderLobby(); };

// ---------- table ----------
let GEO = null;
const GEOS = new Map();
// The true sizes of a seat, your own seat, a bet and the dealer button in one look of the table ('' normal,
// 'compact', 'mini'), measured from hidden copies so the layout below never guesses: boxes around the
// seat's centre as [dx, dy, half-width, half-height]. A long name and big amounts give the widest case.
const SIZES = new Map();
// measure something with the table area dressed in a given look for a moment
function inLook(area, look, f){
  const cls = ['compact', 'mini', 'micro', 'tight'], was = cls.map(c => area.classList.contains(c));
  area.classList.toggle('compact', look !== ''); area.classList.toggle('mini', look === 'mini' || look === 'micro'); area.classList.toggle('micro', look === 'micro'); area.classList.remove('tight');
  try{ return f(); } finally { cls.forEach((c, i) => area.classList.toggle(c, was[i])); }
}
// which sideways layout the table is in ('' upright), part of every cached size and layout
const landKey = () => { const g = $('game'); return g.classList.contains('land') ? (g.classList.contains('land-s') ? 's' : 'l') : ''; };
function seatSizes(area, look, bet){
  const key = `${look}:${bet}:${area.style.getPropertyValue('--cw')}:${landKey()}`;
  if(SIZES.has(key)) return SIZES.get(key);
  const S = inLook(area, look, () => {
    const txt = '<div class="nm">Wwwwwwwwwwwwww</div><div class="st num">8,888,888</div>', badge = '<span class="badge act-raise">Raise 888,888</span>', at = 'style="left:0;top:0"';
    // (in the quiet design the other seats write their action in the name line, so they keep no room for a pill)
    const sb = QUIET ? '' : badge;
    const p = document.createElement('div');
    p.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
    p.innerHTML = `<div class="seat" ${at}><div class="hole">${cardHTML(null, 'mini')}${cardHTML(null, 'mini')}</div>${avHTML('', 'W W')}<div class="plate">${txt}${sb}</div></div>`
      + `<div class="seat hero" ${at}><div class="hole">${cardHTML(null, 'hero')}${cardHTML(null, 'hero')}</div><div class="plate">${avHTML('', 'W W')}<div class="pl-txt">${txt}</div>${badge}</div></div>`
      + ['l', 'r', 't', 'tl', 'tr'].map(sd => `<div class="seat" data-side="${sd}" ${at}><div class="hole">${cardHTML(null, 'mini')}${cardHTML(null, 'mini')}</div>${avHTML('', 'W W')}<div class="plate">${txt}${sb}</div></div>`).join('')
      + `<div class="bet num" ${at}>${chipsIcon(3)}${bet}</div><div class="bet num tight" ${at}>${chipsIcon(3)}${bet}</div><div class="dealer" ${at}>D</div>`;
    area.appendChild(p);
    const o = p.getBoundingClientRect(), box = els => {
      const r = els.filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect()), l = Math.min(...r.map(q => q.left)), t = Math.min(...r.map(q => q.top)), rr = Math.max(...r.map(q => q.right)), b = Math.max(...r.map(q => q.bottom));
      return [(l + rr) / 2 - o.left, (t + b) / 2 - o.top, (rr - l) / 2, (b - t) / 2];
    };
    const [seat, hero, ...ov] = p.querySelectorAll('.seat'), [b1, b2] = p.querySelectorAll('.bet');
    // (the oval's seats, on the rail: the avatar in the middle of the rail, the cards behind it and the name plate
    // off the felt, to the side the seat faces; measured round the avatar's centre)
    const oval = {}; ov.forEach(e => { oval[e.dataset.side] = [box([...e.querySelectorAll('.hole .card, .av')]), box([...e.querySelectorAll('.plate, .badge')])]; });
    const S = { seat: [box([...seat.querySelectorAll('.hole .card, .av')]), box([...seat.querySelectorAll('.plate, .badge')])],
      hero: [box([...hero.querySelectorAll('.hole .card')]), box([...hero.querySelectorAll('.plate, .badge')])],
      bet: box([b1]).slice(2), tight: box([b2]).slice(2), dealer: box([p.querySelector('.dealer')])[2], oval, heroPlate: box([hero.querySelector('.plate')]), av: box([ov[0].querySelector('.av')])[2] };
    p.remove(); return S;
  });
  // (nothing to measure while the table is off screen, so don't keep that)
  if(SIZES.size > 40) SIZES.clear();
  if(area.clientWidth) SIZES.set(key, S);
  return S;
}
// Table geometry, in pixels of the table area: an oval felt (straight sides, round ends) inside a padded
// rail, with the seats spaced evenly along the middle of the rail. Tall on phones, long on wide screens.
// Position 0 is the bottom seat (you). `bet` is the widest bet label at the table (digits as 8s); the pot
// and the message line are measured as they are drawn, so nothing is placed on top of them.
// Seat spots on the tall stadium (a phone held upright), your seat first and then clockwise: [x, y] with x from -0.5
// (left) to 0.5 (right) across the seats' ring and y from -0.9 (bottom) to 0.9 (top). Gemini's proposed map (Issue #4),
// adopted where it seats everyone cleanly at a seat size; where it doesn't, even spacing round the rail with the same seats.
const STADIUM_SEATS = {
  2: [[0, -.88], [0, .88]],
  3: [[0, -.88], [-.46, .35], [.46, .35]],
  4: [[0, -.88], [-.48, 0], [0, .88], [.48, 0]],
  5: [[0, -.88], [-.46, -.32], [-.34, .72], [.34, .72], [.46, -.32]],
  6: [[0, -.88], [-.46, -.32], [-.46, .38], [0, .88], [.46, .38], [.46, -.32]],
  7: [[0, -.88], [-.44, -.55], [-.5, .05], [-.32, .78], [.32, .78], [.5, .05], [.44, -.55]],
  8: [[0, -.88], [-.44, -.55], [-.5, -.1], [-.42, .55], [0, .88], [.42, .55], [.5, -.1], [.44, -.55]],
  9: [[0, -.88], [-.44, -.58], [-.5, -.2], [-.5, .2], [-.3, .79], [.3, .79], [.5, .2], [.5, -.2], [.44, -.58]]
};
function tableGeo(n, bet = '8,888'){
  const a = $('tableArea'), W = a.clientWidth || 360, H = a.clientHeight || 520, pot = $('pot'), msg = $('msg');
  // the pot and the message line get a fixed room (a six-digit pot, one line of text), whatever they say right
  // now, so the layout is the same for the whole hand and nothing moves when the result is written under the board
  const DB = $('game').classList.contains('wpt') && DOCKBOX, key = `${n}:${W}:${H}:${bet}:${landKey()}:${DB || ''}`;
  if(GEO && GEO.key === key) return GEO;
  // the area changes between a few sizes during a hand (your turn, the raise panel), so keep the recent layouts
  if(GEOS.has(key)) return GEO = GEOS.get(key);
  // try the normal seats first, then smaller ones, then seats pushed further into the corners (a squarer ring
  // around the same oval felt), until everything fits without touching
  // (on a phone each look first tries the broad oval with the side seats on the rail's inner edge, then a slightly
  // longer one, then both with the side seats on the rail, before the seats get smaller: readable seats matter more
  // than the last bit of width)
  // sideways the seats at the bottom corners carry their badge under the plate, so the bottom keeps room for that too
  const LAND = $('game').classList.contains('land'), SHORT = $('game').classList.contains('h600');
  // (upright, each look first tries a clear oval a third taller than wide (or a quarter), narrowing the felt a little
  // when the screen is short; on a screen too short for that an oval lying across, clearly wider than tall; only
  // when neither seats everyone cleanly the broader felt of before, k 1.2-1.3. Never the nearly round in-between.)
  const BROAD = [[1.2, 1, 0], [1.3, 1, 0], [1.2, 0, 0], [1.3, 0, 0]];
  // (before all of those, the tall stadium with every seat on its rail: the tallest of 1.7, 1.55 and 1.4 times as tall
  // as wide that stays at least 70% of the width it could have, at any seat size but the smallest; then 1.25; then the
  // same with the smallest seats; only then the ovals. Not on the shortest screens (h600), which keep the oval.)
  const STAD = [[1.7, 2, 1], [1.7, 3, 1], [1.55, 2, 1], [1.55, 3, 1], [1.4, 2, 1], [1.4, 3, 1]], STAD_LOW = [[1.25, 2, 1], [1.25, 3, 1]], ONE = [...STAD, ...STAD_LOW].map(([k, i, nr]) => [k, i + 2, nr]), OVAL = [[1.35, 1, 1], [1.35, 0, 1], [1.25, 1, 1], [1.25, 0, 1], [.78, 1, 0], [.78, 0, 0], [.82, 1, 0], [.82, 0, 0]];
  const shapes = W < 470 ? (LAND ? BROAD : [...STAD, ...STAD_LOW, ...OVAL, ...BROAD]) : [[0, 0, 0]];
  const sizes = (H >= 420 ? [['', 1], ['', .6]] : []).concat([['compact', 1], ['compact', .6], ['mini', 1], ['mini', .6], ['mini', .3], ['micro', 1], ['micro', .6], ['micro', .3]]);
  // (upright on a phone, a clear oval with smaller seats comes before the broad felt with bigger ones, which on a
  // short screen ends up nearly round; the broad felt is next, and only then the smallest (micro) seats)
  // (a phone held upright: the oval of WPT and WSOP, inset 6, its seats on the middle of the rail, at each seat size,
  // then each again with the lowest seats a little lower)
  const PILL = W < 470 && !LAND;
  const looks = PILL ? [0, 1].flatMap(k => [...new Set(sizes.map(([l]) => l))].map(l => [l, 1, k, 6, 1, 0])) : ((W < 470 && !LAND ? [[SHORT ? [] : STAD, sizes.filter(([l]) => l !== 'micro')], [SHORT ? [] : STAD_LOW, sizes.filter(([l]) => l !== 'micro')], [SHORT ? [] : [...STAD, ...STAD_LOW], sizes.filter(([l]) => l === 'micro')], [SHORT ? [] : ONE, sizes], [OVAL, sizes.filter(([l]) => l !== 'micro')], [BROAD, sizes.filter(([l]) => l !== 'micro')], [shapes, sizes.filter(([l]) => l === 'micro')]] : [[shapes, sizes]])
    .flatMap(([sh, sz]) => sz.flatMap(([l, q]) => sh.map(([k, inset, nar]) => [l, q, k, inset, 1.18, nar])))
    // (the micro seats may also give up some of the extra room either side of yours, for the seats along the top)
    .concat(n >= 6 ? [['micro', .6], ['micro', .3]].flatMap(([l, q]) => shapes.map(([k, inset, nar]) => [l, q, k, inset, 1.06, nar])) : []));
  let best = null;
  for(const [look, sq, k, inset, g, nar] of looks){ const L = layout(look, sq, false, k, inset, g, nar); if(!best || L.cost <= best.cost) best = L; if(!L.cost) break; }
  // no clean layout anywhere: search the roomiest look that seats everyone harder, for the fewest overlaps
  if(best.cost) best = layout(best.look, best.sq, true, best.k, best.inset, best.g, best.nar);
  GEO = { ...best, key, W, H, betAt: k => best.bets[k], dealerAt: k => best.dealers[k] };
  if(GEOS.size > 12) GEOS.delete(GEOS.keys().next().value);
  if(a.clientWidth) GEOS.set(key, GEO);
  return GEO;

  function layout(look, sq, thorough, k, inset, g, nar){
    const S = seatSizes(a, look, bet), mini = look === 'mini' || look === 'micro', compact = look !== '';
    const ext = bs => ({ hw: Math.max(...bs.map(([x, , w]) => Math.abs(x) + w)), up: Math.max(...bs.map(([, y, , h]) => h - y)), down: Math.max(...bs.map(([, y, , h]) => y + h)) });
    const se = ext(S.seat), he = ext(S.hero);
    const rail = inset === 6 ? 16 : Math.round(Math.max(10, Math.min(18, Math.min(W, H) * .036)));
    // seats are centred on the middle of the rail and stay inside the area: the side ones `side` px from the
    // edge, the top ones `top` px from the top, and your seat `bot` px from the bottom. In a phone-width column
    // the side seats sit `ins` px further in, on the rail's inner edge, so the felt can be that much wider.
    // (inset 2 and 3, the tall stadium of a phone held upright: every seat sits on the middle of the rail, half on the
    // felt and half off it, as on a real long table; the felt is narrowed to its shape so the whole table, both rounded
    // ends, shows above the action bar)
    const WPT = inset === 6;
    const ins = inset >= 2 ? 0 : inset ? Math.round(Math.min(se.hw * .4, 18)) : 0;
    const lo = look || inset >= 2 ? 0 : 1, top = Math.max(se.up + (LAND ? 8 : 2) - rail / 2, lo * 50), bot = Math.max((LAND ? Math.max(he.down, se.down) + 8 : he.down + 4) - rail / 2, lo * 64), side = Math.max(se.hw + 2, lo * 46) - ins;
    let fw = Math.min(W - 2 * side + rail, 760), fh = H - top - bot;
    // (the oval, as WPT and WSOP draw a table upright: a long stadium floating on the dark background, each side seat
    // half on its rail and half off it, 4 px from the screen's edge; its foot closes on your seat, your cards on the felt
    // and your name plate over the rail, in the middle above the action bar)
    let heroAt = null, dockBox = null, floor = 0, ovTop = 0;
    if(WPT){
      const O = S.oval, hp = S.heroPlate, hb = Math.max(...S.hero.map(([, y, , h]) => y + h));
      heroAt = [W / 2 - hp[0], H - 4 - hb]; floor = heroAt[1] + hp[1] - hp[3];
      // (the felt's top: a seat at the top of the rail, its plate over it, 2 px from the top of the table area)
      ovTop = Math.max(...O.t.map(([, y, , h]) => h - y)) + 2 - rail / 2;
      // as wide as the side seats' plates leave room for, each plate just off the felt and on the screen; height
      // / width 1.35 to 1.5, a racetrack, closed on your seat; the room left over is above the table
      const room = floor - ovTop;
      fw = Math.min(400, Math.round(W - 2 * (2 * O.l[1][2] + 2 - rail)), Math.floor(room / 1.35));
      fh = Math.min(room, Math.round(fw * 1.5));
      
    }
    // a real table's proportions: on a phone held upright a clear oval, half again as tall as wide (the
    // height left over is shared above and below it); long when there's room; on a wide screen the shape stays
    // the same when the area grows or shrinks a little between hands
    // (when the screen is too short for that, the felt gets narrower rather than rounder: it always reads as an oval)
    // (the stadium always takes the whole height between the header and the action bar, so the table spans the screen
    // with your seat just above the bar: k is its least height/width, and where the width runs out first it is taller)
    if(WPT){}
    else if(W < 470){ const fw0 = fw; fh = inset >= 2 ? Math.min(fh, fw * 2) : Math.min(fh, fw * k); if(nar) fw = Math.min(fw, Math.round(fh / k));
      // (an upright oval that would have to get much narrower than the screen allows is skipped: on a short screen
      // the table lies across instead, clearly wider than tall, rather than ending up round or thin)
      if(nar && fw < fw0 * (inset >= 2 ? (k > 1.3 ? .7 : .62) : k >= 1.5 ? .6 : .82)) return { look, sq, k, inset, g, nar, cost: 1e9 }; }
    else fh = Math.min(fh, Math.max(fw / 1.4, Math.min(fw / 1.2, 370)));
    fw = Math.max(fw, 140); fh = Math.max(fh, 120);
    const cx = W / 2, cy = WPT ? floor - fh / 2 : top + (H - top - bot) / 2;
    const hx = fw / 2 - rail / 2, hy = fh / 2 - rail / 2, r = Math.min(hx, hy), lx = hx - r, ly = hy - r;
    // the seats' ring: the middle of the rail (its sides `ins` further in), or with tighter corners (sq < 1) when
    // a full table is crowded
    // (on the WPT table the side seats stand 4 px from the screen's edges, over the felt's rail as at a real table)
    const rx = hx - ins, rs = Math.min(rx, hy) * sq, sx = rx - rs, sy = hy - rs;
    // walk the seats' ring clockwise from the bottom centre; each piece is [length, point(t), outward normal(t)]
    const arc = (ox, oy, a0) => [Math.PI * rs / 2, t => { const q = a0 + t / rs; return [ox + rs * Math.cos(q), oy + rs * Math.sin(q), Math.cos(q), Math.sin(q)]; }];
    const line = (x0, y0, dx, dy, len, nx, ny) => [len, t => [x0 + dx * t, y0 + dy * t, nx, ny]];
    const parts = [line(0, hy, -1, 0, sx, 0, 1), arc(-sx, sy, Math.PI / 2), line(-rx, sy, 0, -1, 2 * sy, -1, 0), arc(-sx, -sy, Math.PI),
      line(-sx, -hy, 1, 0, 2 * sx, 0, -1), arc(sx, -sy, Math.PI * 1.5), line(rx, -sy, 0, 1, 2 * sy, 1, 0), arc(sx, sy, 0), line(sx, hy, -1, 0, sx, 0, 1)];
    const P = parts.reduce((t, q) => t + q[0], 0);
    const at = d => { for(const [len, f] of parts){ if(d <= len + 1e-6) return f(d); d -= len; } return parts[0][1](0); };
    // evenly spaced, with a little extra room either side of the hero's wider seat at a full table
    const gap = n >= 6 ? P / n * g : P / n, along = i => i === 0 ? 0 : n === 2 ? P / 2 : gap + (i - 1) * (P - 2 * gap) / (n - 2);
    // the tall stadium of a phone held upright: the seats at the owner-approved spots round a long table (Gemini's
    // seat map, x across the ring's width from -0.5 to 0.5, y from the bottom -0.9 to the top 0.9), each facing the
    // middle of its stretch of rail; the usual collision checks below still decide whether this look fits, and
    // inset 3 (tried next, with the same seats) spaces them evenly round the rail instead
    const gem = (inset === 2 || inset === 4) && STADIUM_SEATS[n];
    const seats = gem ? gem.map(([gx, gy]) => { const x = gx * 2 * rx, y = -gy / .9 * hy, cy0 = Math.max(0, hy - rx) * Math.sign(y);
        const [vx, vy] = Math.abs(y) <= Math.abs(cy0) ? [Math.sign(x), 0] : [x, y - cy0], l = Math.hypot(vx, vy) || 1;
        return { x: cx + x, y: cy + y, nx: vx / l, ny: vy / l }; })
      : Array.from({ length: n }, (_, i) => { const [x, y, nx, ny] = at(along(i)); return { x: cx + x, y: cy + y, nx, ny }; });
    // (on the oval your seat stands under the felt, and the others round the rail, evenly from just above your cards
    // on the left round over the top to the same height on the right; each seat faces out: its plate under its
    // avatar and out to its side on the sides, over it at the top, and moved further out where the felt curves under
    // it, so no plate lies on the green)
    let ovClash = 0;
    if(heroAt){
      const O = S.oval, gx0 = hx - rail / 2, gy0 = hy - rail / 2, gr = Math.min(gx0, gy0), gs = gy0 - gr, gsx = gx0 - gr;
      const gHalfW = y => { const a = Math.abs(y); return a <= gs ? gx0 : a >= gy0 ? 0 : gsx + Math.sqrt(gr * gr - (a - gs) ** 2); };
      const gHalfH = x => { const a = Math.abs(x); return a <= gsx ? gy0 : a >= gx0 ? 0 : gs + Math.sqrt(gr * gr - (a - gsx) ** 2); };
      const seatAt = d => { const [x, y, nx, ny] = at(d);
        const side = ny < -.6 ? (Math.abs(nx) < .2 ? 't' : nx < 0 ? 'tl' : 'tr') : nx < 0 ? 'l' : 'r', [, [px, py, pw, ph]] = O[side];
        let shx = 0, shy = 0;
        if(side[0] === 't'){ const x1 = x + px - pw, x2 = x + px + pw, lim = -gHalfH(Math.max(x1, Math.min(0, x2))); shy = Math.min(0, lim - 1 - (y + py + ph)); }
        else { const y1 = y + py - ph, y2 = y + py + ph, g = gHalfW(Math.max(y1, Math.min(0, y2)));
          shx = side === 'l' ? Math.min(0, -g - 1 - (x + px + pw)) : Math.max(0, g + 1 - (x + px - pw)); }
        const ax = cx + x, ay = cy + y, pb = [ax + px + shx, ay + py + shy, pw, ph];
        return { x: ax, y: ay, nx, ny, side, sx: Math.round(shx), sy: Math.round(shy), boxes: [O[side][0].map((v, j) => j === 0 ? v + ax : j === 1 ? v + ay : v), pb] }; };
      // (the lowest seats either side stay up on the felt's sides, facing across it, not round its foot beside you:
      // no lower than where the rail starts to turn under, and 16 px clear of your seat, its cards and plate; k = 1,
      // tried after every seat size, lets them a little way round the turn, on the smallest screens at a full table)
      const hero = S.hero.map(([dx, dy, w, h]) => [heroAt[0] + dx, heroAt[1] + dy, w + 16, h + 16]);
      const near = (A, B) => A.some(([x, y, w, h]) => B.some(([X, Y, ww, hh]) => Math.abs(x - X) < w + ww && Math.abs(y - Y) < h + hh));
      let d0 = 0; while(d0 < P / 2 && (at(d0)[3] > (k ? .7 : .25) || near(seatAt(d0).boxes, hero))) d0 += 2;
      const m = n - 1, R = P - 2 * d0;
      const opp = Array.from({ length: m }, (_, i) => { const q = seatAt(d0 + R * (m >= 4 ? i / (m - 1) : (i + .5) / m)), [[, , ], pb] = q.boxes;
        if(pb[0] - pb[2] < 0 || pb[0] + pb[2] > W || pb[1] - pb[3] < 0 || pb[1] + pb[3] > H) ovClash++;
        return q; });
      seats.splice(0, n, { x: heroAt[0], y: heroAt[1], nx: 0, ny: 1 }, ...opp);
    }
    // on a long table the hero's cards reach into the felt, so the board sits a little higher
    const tall = fh > fw, by0 = tall ? cy : cy - Math.min(28, fh * .08);
    // board cards sized to the felt so they never run into the seats' chips
    // (the WPT table's board is big, as WPT's: up to 15% of the felt's width a card, the layout checks below still
    // keeping it clear of every seat)
    const bw = WPT ? Math.max(24, Math.min(mini ? 40 : compact ? 46 : 54, (fw - 2 * rail) * .15)) : Math.max(mini ? 24 : 28, Math.min(mini ? 30 : compact ? 34 : 50, (fw - 2 * rail) * (tall ? .128 : .108), (rx - 54) / 2.5)), boardHalf = bw * 2.5 + 6, bh = bw * .7;
    const msgHalf = Math.min(140, rx - 48, (Math.min(fw - 2 * rail - 16, bw * 5 + 50)) / 2);
    // what must stay clear: each seat (cards + avatar, and the name plate with its badge), the board, the pot
    // above it and the message under it (both drawn at their real size)
    const seatBoxes = seats.map((q, k) => q.boxes || (k ? S.seat : S.hero).map(([dx, dy, w, h]) => [q.x + dx, q.y + dy, w, h]));
    let [pw0, ph0, mh] = inLook(a, look, () => {
      const pv = pot.innerHTML, mv = msg.innerHTML, mx = msg.style.maxWidth;
      pot.innerHTML = chipsIcon(3) + 'Pot 888,888'; msg.innerHTML = '<div>8</div>'; msg.style.maxWidth = msgHalf * 2 + 'px';
      try{ return [pot.offsetWidth, pot.offsetHeight, msg.offsetHeight]; } finally { pot.innerHTML = pv; msg.innerHTML = mv; msg.style.maxWidth = mx; }
    }), mw = msgHalf * 2;
    // (on the tall stadium the line under the board has two lines of room: a split or side pots, with the winners'
    // names, rarely fit one line of its narrow felt; insets 4 and 5, tried after every other stadium and before the
    // ovals, are the same stadium with one line, where the result is then written in shorter words)
    if(inset === 2 || inset === 3 || WPT) mh *= 2;
    // (when the felt is too short for the pot above the board, sideways or on the shortest screens, the pot may sit
    // at the board's left instead, the two centred together)
    const bxOf = side => side ? cx + (pw0 + 8) / 2 : cx;
    const middle = (by, side) => { const bx = bxOf(side); return [[bx, by, boardHalf, bh], side ? [bx - boardHalf - 8 - pw0 / 2, by, pw0 / 2, ph0 / 2, 1] : [bx, by - bh - 6 - ph0 / 2, pw0 / 2, ph0 / 2, 1], [bx, by + bh + 6 + mh / 2, mw / 2, mh / 2, 1]]; };
    const sides = pw0 + 8 + 2 * boardHalf <= fw - 2 * rail - 12 ? [false, true] : [false];
    // seats that touch each other mean this look is too big for the area
    const hull = bs => { const l = Math.min(...bs.map(([x, , w]) => x - w)), r = Math.max(...bs.map(([x, , w]) => x + w)), t = Math.min(...bs.map(([, y, , h]) => y - h)), d = Math.max(...bs.map(([, y, , h]) => y + h)); return [(l + r) / 2, (t + d) / 2, (r - l) / 2, (d - t) / 2]; };
    const touch = (A, B) => A.some(([x, y, w, h]) => B.some(([X, Y, ww, hh]) => Math.abs(x - X) < w + ww + 1 && Math.abs(y - Y) < h + hh + 1));
    let clash = ovClash;
    for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++) if(touch(seatBoxes[i], seatBoxes[j])) clash++;
    // (the WPT action column is a box every seat, the board and the chips stay clear of)
    const obst = dockBox ? [dockBox] : [];
    if(dockBox) for(const b of seatBoxes) if(touch(b, obst)) clash++;
    // Chips and the dealer button sit on the felt in front of each seat. Start straight in front of the seat,
    // then slide along the rail (or a little in/out) until nothing overlaps: other seats, the board, the pot,
    // the message under the board, or another seat's chips.
    const inside = (x, y, m) => Math.hypot(Math.max(0, Math.abs(x - cx) - lx), Math.max(0, Math.abs(y - cy) - ly)) <= r - rail / 2 - m;
    const hits = (x, y, hw, hh, list) => list.some(([X, Y, w, h]) => Math.abs(x - X) < hw + w + 2 && Math.abs(y - Y) < hh + h + 2);
    const steps = [];
    for(const dd of [0, 10, -8, 20, 32, -16, 44, 58, 72]) for(let tt = 0; tt <= 96; tt += 8) for(const sg of tt ? [1, -1] : [1]) steps.push([dd, tt * sg, tt + 1.5 * Math.abs(dd)]);
    steps.sort((p, q) => p[2] - q[2]);
    let fails = 0;
    // overlap with what's there; seats and cards count most, then other chips, then the pot and the message
    const overlap = (x, y, hw, hh, list) => list.reduce((t, [X, Y, w, h, wt = 3]) => t + wt * Math.max(0, hw + w + 3 - Math.abs(x - X)) * Math.max(0, hh + h + 3 - Math.abs(y - Y)), 0);
    // chips and the button always stay clearly nearer their own seat than any other, so it's clear whose they are
    // (your own seat by the middle of its cards and name plate together: chips beside your plate read as yours)
    const [hc, hp] = S.hero, side0 = hc[0] + hc[2] < hp[0] + hp[2] - 4, hu = (f, g) => g(...S.hero.map(([x, y, w, h]) => f(x, y, w, h)));
    const ha = [(hu((x, y, w) => x - w, Math.min) + hu((x, y, w) => x + w, Math.max)) / 2, (hu((x, y, w, h) => y - h, Math.min) + hu((x, y, w, h) => y + h, Math.max)) / 2];
    const anchors = seats.map((q, i) => i ? [q.x, q.y] : [q.x + ha[0], q.y + ha[1]]);
    const mine = (x, y, own) => { const d = Math.hypot(x - anchors[own][0], y - anchors[own][1]); return anchors.every(([X, Y], i) => i === own || Math.hypot(x - X, y - Y) > d * 1.12 + 3); };
    // the button may also sit off the felt, beside its seat, as long as it stays in the table area
    const onArea = (x, y, hw, hh) => x >= hw + 1 && x <= W - hw - 1 && y >= hh + 1 && y <= H - hh - 1;
    function place(x0, y0, nx, ny, hw, hh, list, own, free, quick){
      const tx = -ny, ty = nx, ok = (x, y, m) => (inside(x, y, m) || free && onArea(x, y, hw, hh)) && mine(x, y, own);
      for(const m of [Math.min(hw, hh) + 2, -rail / 2]) for(const [dd, tt] of steps){ const x = x0 - nx * dd + tx * tt, y = y0 - ny * dd + ty * tt; if(ok(x, y, m) && !hits(x, y, hw, hh, list)) return [x, y]; }
      // no clean spot: give up at once when only a clean layout will do, else the least crowded spot on the felt
      fails++; if(quick) return null;
      // (any clean spot round it, on the felt or just off it beside its own seat, beats one on top of a seat: the
      // nearest one on a 4 px grid)
      let gb = null, gd = Infinity;
      for(let gx = -120; gx <= 120; gx += 4) for(let gy = -120; gy <= 120; gy += 4){ const x = x0 + gx, y = y0 + gy, d = gx * gx + gy * gy;
        if(d < gd && (inside(x, y, -rail / 2) || onArea(x, y, hw, hh)) && mine(x, y, own) && !hits(x, y, hw, hh, list)){ gb = [x, y]; gd = d; } }
      if(gb) return gb;
      // (still always nearer its own seat than any other: off the felt or crowded beats looking like someone else's)
      let best = null, bc = Infinity;
      for(const [dd, tt] of steps){ const x = x0 - nx * dd + tx * tt, y = y0 - ny * dd + ty * tt; if(!mine(x, y, own)) continue;
        const c = overlap(x, y, hw, hh, list) + tt * .5 + (ok(x, y, -rail / 2) ? 0 : 1e6); if(c < bc){ bc = c; best = [x, y]; } }
      return best || [(x0 + anchors[own][0]) / 2, (y0 + anchors[own][1]) / 2];
    }
    // how far in front of a seat's centre its edge is, towards the middle of the table
    const front = q => q.side ? S.av : Math.abs(q.nx) * se.hw + Math.abs(q.ny) * (q.ny > 0 ? se.up : se.down);
    // quick: stop at the first chip that has no clean spot (null)
    function solve([pw, ph], boxes, order, quick){
      fails = 0;
      const bets = [], placed = [];
      for(const k of order){
        const q = seats[k];
        let x0, y0, nx = q.nx, ny = q.ny;
        if(k === 0){ nx = 0; ny = 1; [x0, y0] = tall ? [q.x, q.y + hc[1] - hc[3] - ph - 5] : [q.x + hc[0] - hc[2] - pw - 9, q.y + hc[1] - hc[3] + 18]; }
        else { const d = front(q) + (q.side ? 3 : 6) + Math.abs(q.nx) * pw + Math.abs(q.ny) * ph; x0 = q.x - q.nx * d; y0 = q.y - q.ny * d; }
        // your own chips may also sit just off the felt beside your plate (as the dealer button may) when the felt in
        // front of your cards has no clean spot left, on the smallest screens
        const f0 = fails, list = boxes.concat(placed);
        bets[k] = place(x0, y0, nx, ny, pw, ph, list, k, false, true) || (k === 0 ? place(q.x, q.y + hp[1], nx, ny, pw, ph, list, k, true, true) : null);
        fails = f0;
        if(!bets[k]) bets[k] = place(x0, y0, nx, ny, pw, ph, list, k, false, quick);
        if(!bets[k]) return null;
        placed.push([...bets[k], pw, ph, 2]);
      }
      const betBoxes = boxes.concat(placed), dh = S.dealer;
      const dealers = seats.map((q, k) => {
        // (on the oval your badge stands right of your plate, so your button sits left of your cards, by your avatar)
        if(k === 0 && WPT) return place(q.x + hc[0] - hc[2] - dh - 4, q.y + hc[1] - hc[3] + 22, 0, 1, dh, dh, betBoxes, k, true, quick);
        if(k === 0) return place(q.x + Math.max(hc[0] + hc[2], side0 ? hp[0] + hp[2] : -Infinity) + dh + 4, q.y + hc[1] - hc[3] + 22, 0, 1, dh, dh, betBoxes, k, true, quick);
        const d = front(q) + dh + 4, tx = -q.ny, ty = q.nx;
        return place(q.x - q.nx * d - tx * 40, q.y - q.ny * d - ty * 40, q.nx, q.ny, dh, dh, betBoxes, k, true, quick);
      });
      return dealers.every(Boolean) ? { bets, dealers, fails } : null;
    }
    // a clean layout: the board where it belongs, else a little higher or lower; chips placed seat by seat round
    // the table, the other way round, or top seats first; then the same with a size smaller chip labels
    const round = seats.map((q, i) => i), orders = [round, [0].concat(round.slice(1).reverse()), round.slice().sort((i, j) => seats[i].y - seats[j].y)];
    const geo = { look, sq, k, inset, g, nar, compact, mini, rail, cx, cy, tall, msgW: msgHalf * 2, fw, fh, seats, bw, mline: bh + 6 + mh / 4 };
    if(!clash) for(const side of sides) for(const [lab, tight] of [[S.bet, false], [S.tight, true]]) for(const dy of WPT ? [0, 10, -10, -20, -30, -40, -55, -70, -85, -100, -120, -140, -160] : [0, -10, 10, -20, 20]){
      const by = by0 + dy, mid = middle(by, side);
      // (the board with room to spare: the pot, board and message are drawn as one stack centred on `by`, so the board
      // itself can sit up to half the difference between the pot's and the message's heights off it;
      // and each seat taken as one block, its cards and name plate together, against the board)
      if(seatBoxes.some(b => touch(b, mid) || touch([hull(b)], [[mid[0][0], mid[0][1], mid[0][2] + 2, mid[0][3] + Math.abs(ph0 - mh) / 2 + 2]])) || touch(obst, mid)) continue;
      for(const order of orders){ const L = solve(lab, seatBoxes.flat().concat(mid, obst), order, true); if(L) return { ...geo, cost: 0, by, bx: bxOf(side), tight, potSide: side, bets: L.bets, dealers: L.dealers }; }
    }
    // nothing clean: when searching hard, the least crowded way of all; else just say how far off this look is
    if(!thorough) return { ...geo, cost: clash ? clash * 100 + 99 : 50 };
    let best = null;
    for(const side of sides) for(const dy of [0, -10, 10]) for(const order of orders) for(const [lab, tight] of [[S.bet, false], [S.tight, true]]){
      const by = by0 + dy, mid = middle(by, side), L = solve(lab, seatBoxes.flat().concat(mid, obst), order), cost = (clash + seatBoxes.filter(b => touch(b, mid)).length + (touch(obst, mid) ? 1 : 0)) * 100 + L.fails;
      if(!best || cost < best.cost) best = { ...geo, cost, by, bx: bxOf(side), tight, potSide: side, bets: L.bets, dealers: L.dealers };
    }
    return best;
  }
}
// ---------- the board's table (UI_BOARD, Issue #32 Step-0 spec §3, phase B2) ----------
// The owner's board, upright and sideways: a racetrack rail box sized per screen class (§3.1), the seats on the middle of
// the rail spaced by equal arc length from your seat at the bottom (§3.2), the seat unit of the board's close-up (§3.3),
// the pot, the board and the winner line in the middle (§3.4). Everything here runs only with the board design on.
// The size classes (§3.1), CSS px. av: avatar; pw/ph: the name plate's widest and its height; cw: a card back's width;
// hw: your cards' width (of the screen's width); bw: a board card's width (of the screen's width); band: the rail band
const BCLS = {
  'P-L': { width: .86, max: 1.58, min: 1.50, av: 40, pw: 88, ph: 40, cw: 18, hw: .15, bw: .125, band: 12, hph: 40 },
  'P-M': { width: .86, max: 1.58, min: 1.30, av: 36, pw: 86, ph: 40, cw: 16, hw: .14, bw: .12, band: 12, hph: 38 },
  'P-S': { width: .90, max: 1.58, min: 1.25, av: 32, pw: 84, ph: 37, cw: 15, hw: .13, bw: .115, band: 10, hph: 34 },
  'L':   { wh: 1.98, maxW: .70, av: 36, pw: 88, ph: 37, cw: 16, hw: .054, bw: .056, band: 12, hph: 36 } };
// The seats' spacing (§3.2): equal arc length round the middle of the rail, the long sides counted at BARC of their
// length (the board's ring is rounder than the felt), and your own place BGAP seats wide. These two numbers put a full
// table of 9 within ±2% of the spec's 9-max slot table (t_board_layout checks ±4%) at every upright size class.
const BARC = .65, BGAP = 2.5;
function boardClass(){
  const g = $('game'); if(g.classList.contains('land')) return 'L';
  const { w, h } = scr(); return w < 360 ? 'P-S' : (LOCK && LOCK.ih || h) >= 740 ? 'P-L' : 'P-M';
}
// the middle of the rail as a stadium (straight sides, round ends) centred on cx, cy with half sizes a, b: a point
// `d` of the way round it (weighted length), starting at the bottom centre and going clockwise (left first), with the
// outward normal there
function stadiumRing(cx, cy, a, b, k){
  const tall = b >= a, r = Math.min(a, b), s = Math.abs(b - a), pts = [], N = 720;
  const P = (x, y) => pts.push([x, y]);
  if(tall){
    for(let i = 0; i <= N; i++){ const t = Math.PI / 2 + Math.PI / 2 * i / N; P(r * Math.cos(t), s + r * Math.sin(t)); }
    for(let i = 1; i <= N; i++) P(-r, s - 2 * s * i / N);
    for(let i = 1; i <= 2 * N; i++){ const t = Math.PI + Math.PI * i / (2 * N); P(r * Math.cos(t), -s + r * Math.sin(t)); }
    for(let i = 1; i <= N; i++) P(r, -s + 2 * s * i / N);
    for(let i = 1; i <= N; i++){ const t = Math.PI / 2 * i / N; P(r * Math.cos(t), s + r * Math.sin(t)); }
  } else {
    for(let i = 1; i <= N; i++) P(-s * i / N, r);
    for(let i = 1; i <= 2 * N; i++){ const t = Math.PI / 2 + Math.PI * i / (2 * N); P(-s + r * Math.cos(t), r * Math.sin(t)); }
    for(let i = 1; i <= 2 * N; i++) P(-s + 2 * s * i / (2 * N), -r);
    for(let i = 1; i <= 2 * N; i++){ const t = -Math.PI / 2 + Math.PI * i / (2 * N); P(s + r * Math.cos(t), r * Math.sin(t)); }
    for(let i = 1; i <= N; i++) P(s - s * i / N, r);
    pts.unshift([0, r]);
  }
  // (the long sides count k of their length: the ring is walked as if the table were rounder)
  const L = [0];
  for(let i = 1; i < pts.length; i++){ const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1]; L.push(L[i - 1] + (tall ? Math.hypot(dx, k * dy) : Math.hypot(k * dx, dy))); }
  const len = L[L.length - 1];
  const at = d => { d = ((d % len) + len) % len; let lo = 0, hi = L.length - 1; while(hi - lo > 1){ const m = (lo + hi) >> 1; if(L[m] < d) lo = m; else hi = m; }
    const [x, y] = pts[lo], qx = Math.max(0, Math.abs(x) - (tall ? 0 : s)), qy = Math.max(0, Math.abs(y) - (tall ? s : 0)), q = Math.hypot(qx, qy) || 1;
    return { x: cx + x, y: cy + y, nx: Math.abs(x) > (tall ? 0 : s) - .01 ? Math.sign(x) * qx / q : 0, ny: Math.sign(y) * qy / q }; };
  return { len, at };
}
// is (x, y) inside the stadium centred cx, cy with half sizes a, b, by at least m px?
const inStadium = (x, y, cx, cy, a, b, m = 0) => { const r = Math.min(a, b), sx = a - r, sy = b - r; return Math.hypot(Math.max(0, Math.abs(x - cx) - sx), Math.max(0, Math.abs(y - cy) - sy)) <= r - m; };
let BSIZE = null;
// the pot and a bet as drawn (the widest they get: "Pot 888,888", "88.8K"), measured once per size class
function boardSizes(area, cls){
  if(BSIZE && BSIZE.cls === cls && BSIZE.w === area.clientWidth) return BSIZE;
  const p = document.createElement('div');
  p.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
  p.innerHTML = `<div class="pot num">${chipsIcon(3)}Pot 888,888</div><div class="bet num" style="left:0;top:0">${chipsIcon(3)}88.8K</div>`;
  area.appendChild(p);
  const [pot, bet] = p.children, S = { cls, w: area.clientWidth, pot: [pot.offsetWidth, pot.offsetHeight], bet: [bet.offsetWidth, bet.offsetHeight] };
  p.remove();
  // a seat's two card backs as drawn (fanned, bordered), round its avatar's centre with --hx and --hy at 0
  const seats = $('seats'), C = BCLS[cls];
  if(seats){ const q = document.createElement('div');
    q.className = 'seat b-seat'; q.setAttribute('aria-hidden', 'true');
    q.style.cssText = `left:0;top:0;visibility:hidden;pointer-events:none;--hx:0px;--hy:0px;--cwb:${C.cw}px;--av:${C.av}px`;
    q.innerHTML = `<div class="hole">${cardHTML(null, 'mini')}${cardHTML(null, 'mini')}</div>`;
    seats.appendChild(q);
    const o = q.getBoundingClientRect(), rs = [...q.querySelectorAll('.card')].map(e => e.getBoundingClientRect());
    if(rs.length && rs[0].width) S.cards = { l: Math.min(...rs.map(r => r.left)) - o.left, r: Math.max(...rs.map(r => r.right)) - o.left, t: Math.min(...rs.map(r => r.top)) - o.top, b: Math.max(...rs.map(r => r.bottom)) - o.top };
    // (and its two cards face up at a showdown: larger, standing higher over the avatar; how far their top reaches)
    q.innerHTML = `<div class="hole shown">${cardHTML(cs('As'), 'show')}${cardHTML(cs('Kd'), 'show')}</div>`;
    const ss = [...q.querySelectorAll('.card')].map(e => e.getBoundingClientRect());
    if(ss.length && ss[0].width) S.shownT = Math.min(...ss.map(r => r.top)) - q.getBoundingClientRect().top;
    q.remove(); }
  if(area.clientWidth && S.cards) BSIZE = S;
  return S;
}
// The board's layout for n seats in the table area (pixels of the area), in the shape tableGeo returns
// (`watch`: nobody at this table is you, so the seat at the foot is drawn as any other seat, its avatar where your plate
// would be, and its D button goes by that avatar)
function boardGeo(n, empty = [], watch = false){
  const a = $('tableArea'), W = a.clientWidth || 360, H = a.clientHeight || 520, cls = boardClass(), C = BCLS[cls];
  const vw = scr().w, key = `b:${n}:${W}:${H}:${cls}:${vw}:${empty.join('.')}${watch ? ':w' : ''}`;
  if(GEO && GEO.key === key) return GEO;
  if(GEOS.has(key)) return GEO = GEOS.get(key);
  const land = cls === 'L', AV = C.av, R = C.band, S = boardSizes(a, cls);
  // ---- the rail box (§3.1) ----
  // (upright: 0.86 of the screen wide (0.90 on the smallest), as tall as 1.58 times that, centred in the height left;
  // the top seats' avatars reach half out of it, your plate hangs under it. Sideways: 1.98 times as wide as tall, as
  // tall as the area allows with the top seats and your seat 8 px clear of its edges, at most 0.70 of the screen wide)
  let fw, fh, top, left;
  const heroPh = C.hph, heroOver = land ? heroPh + 2 : 8;
  if(!land){
    fw = Math.min(W - 4, Math.round(vw * C.width));
    const tp = Math.max(2, AV / 2 + 2 - R / 2), bp = heroPh - heroOver + 2;
    fh = Math.min(Math.round(fw * C.max), H - tp - bp);
    if(fh < fw * C.min){ fw = Math.max(140, Math.min(fw, Math.floor(fh / C.min))); }
    // the height left over: under the table at most 14 px (your seat stays by the action bar), the rest above it
    const spare = Math.max(0, H - tp - bp - fh), below = Math.min(spare / 2, 14);
    top = tp + spare - below; left = (W - fw) / 2;
    // (a seat along the top shows its cards face up at a showdown, larger and standing higher over its avatar than its
    // backs: on a short phone, where the table fills the height, they rose under the header (the owner's iPhone in an
    // in-app browser, 390x650). They may come down over the avatar as far as the backs do on the tightest table (`lift`),
    // no further; the table starts low enough for them to stay 2 px inside the area (as the backs do), a little shorter
    // there (and as much narrower as its proportion needs). Where there was room already nothing moves)
    const K = S.cards || { t: -AV / 2 + 8 - 1.4 * C.cw }, SH = S.shownT != null ? S.shownT : -AV / 2 - 2.2 * C.cw;
    const lift = Math.max(0, Math.round(2 - (tp + R / 2 + K.t))), tps = Math.ceil(2 - SH - lift - R / 2);
    if(top < tps){ top = tps; fh = Math.min(fh, H - top - bp); if(fh < fw * C.min){ fw = Math.max(140, Math.min(fw, Math.floor(fh / C.min))); left = (W - fw) / 2; } }
  } else {
    const tp = AV / 2 + 8 - R / 2 + 2, bp = 8;
    // (a short table, under 240 px, is drawn longer, up to 2.6 times as wide as tall, so its seats keep apart: the
    // short sideways phones of §3.1's L class, 320-375 px high)
    fh = H - tp - bp; const wh = fh < 240 ? Math.min(2.6, C.wh * 240 / fh) : C.wh; fw = Math.round(fh * wh);
    const maxW = Math.floor((fh < 240 ? .78 : C.maxW) * vw);
    if(fw > maxW){ fw = maxW; fh = Math.min(fh, Math.round(fw / C.wh)); }
    fw = Math.min(fw, W - 2 * (AV / 2 + 6)); fh = Math.min(fh, Math.round(fw / 1.86));
    top = tp + Math.max(0, (H - tp - bp - fh) / 2); left = (W - fw) / 2;
  }
  fw = Math.round(fw); fh = Math.round(fh); top = Math.round(top); left = Math.round(left);
  const cx = left + fw / 2, cy = top + fh / 2, box = { l: left, t: top, r: left + fw, b: top + fh };
  // ---- the seats (§3.2) ----
  const ring = stadiumRing(cx, cy, fw / 2 - R / 2, fh / 2 - R / 2, land && fh < 240 ? 1 : BARC), m = n - 1, u = ring.len / (m + BGAP);
  // a seat's boxes round its avatar: the avatar, its name plate under it (moved in from the screen's edge, or above the
  // avatar where the table's foot leaves no room under it, sideways), a status pill under the plate, its two cards
  const plateY = AV / 2 - 6, pill = 18, edge = 4, short = land && fh < 240;
  const seatAt = (q, i, force) => {
    const x = q.x, y = q.y, side = Math.abs(x - cx) < 2 ? 0 : x < cx ? -1 : 1;
    let px = x, sx = 0, half = C.pw / 2;
    // (the plate stays in the table area, `edge` px from its sides)
    if(x - half < edge) sx = edge - (x - half); else if(x + half > W - edge) sx = W - edge - (x + half);
    // (upright, a seat on the upper curve moves its plate up to 8 px outward, away from the seats along the top)
    else if(!land && q.ny >= -.8 && q.ny < -.2 && Math.abs(q.nx) > .3) sx = side < 0 ? -Math.min(8, x - half - edge) : Math.min(8, W - edge - (x + half));
    // (and a seat along the top moves its plate 4 px in, towards the middle, where there is room: not on the smallest)
    else if(!land && cls !== 'P-S' && q.ny < -.8 && side) sx = -side * 4;
    px = x + sx;
    // (sideways, a seat low on the table has no room under its avatar, nor one on the round ends of a short table
    // between its neighbours: its plate stands beside it, on the outer side, and its cards peek out on the inner side)
    let py = y + plateY, pl = '';
    // (the outer side if the plate fits there, else the inner side)
    // (a plate may narrow to 64 px, its least, to stay on the outer side; its name then ends in "…")
    const room = d => Math.min(C.pw, d < 0 ? x - AV / 2 - 4 - edge : W - edge - (x + AV / 2 + 4)), fits = d => room(d) >= 64, out = x < cx ? -1 : 1;
    let pwx = 0;
    if(land && (py + C.ph + pill > H - 8 || (short && Math.abs(q.nx) > .5 && fits(out)))){ const d = fits(out) ? out : -out;
      pwx = Math.floor(room(d)); if(pwx >= C.pw) pwx = 0; half = (pwx || C.pw) / 2;
      pl = d < 0 ? 'l' : 'r'; sx = 0; px = x + d * (AV / 2 + 4 + half); py = y - C.ph / 2; }
    // (a plate beside its avatar low on the table: where its status line would go below the area, it stands over the
    // plate instead, so the seat stays whole inside the area: Issue #32 item 12)
    const stUp = !!pl && py + C.ph + pill > H - 2;
    // the cards: behind the avatar, peeking out at its top on the outer side (inside the screen)
    // (the two backs as drawn, fanned: about 2.3 card widths across and 1.56 tall, centred on hx)
    // (a seat on the upper curve: its cards beside the avatar on the outer side, so they don't rise towards the top row)
    const curve = !short && !pl && q.ny >= -.8 && q.ny < (land ? .5 : -.2) && Math.abs(q.nx) > .3;
    const K = S.cards || { l: -1.15 * C.cw, r: 1.15 * C.cw, t: -AV / 2 + 8 - 1.4 * C.cw, b: -AV / 2 + 8 + .16 * C.cw }, ox = (K.l + K.r) / 2, oy = (K.t + K.b) / 2;
    const gw = K.r - K.l, ch = K.b - K.t, sgn = pl ? (pl === 'l' ? 1 : -1) : curve ? (x < cx ? -1 : 1) : short && Math.abs(q.nx) > .3 ? (x < cx ? -1 : 1) : force || side || (i < m / 2 ? -1 : 1);
    // (where the area's top leaves them no room above the avatar, they come down beside it, `cy0` px, on the outer side)
    // (a seat with its plate beside it on a short table: the cards beside the avatar on the inner side, level with it)
    const beside = curve || (short && (!!pl || Math.abs(q.nx) > .3)), cardTop = y + K.t;
    const cy0 = beside ? Math.round(-oy - (curve ? 4 : 0)) : Math.max(0, Math.round((land ? 12 : 2) - cardTop));
    // (along the top the fan stays within the plate's least width, 64, so the seat is no wider than its plate)
    let hx = beside ? sgn * (AV / 2 + gw / 2 - 6) : q.ny < -.8 ? sgn * Math.min(AV / 2 - C.cw * .1, 32 - gw / 2) : sgn * (AV / 2 - C.cw * .1 + (cy0 ? Math.min(cy0, C.cw * .9) : 0)); const gx0 = x + hx - gw / 2;
    if(gx0 < 8) hx += 8 - gx0; else if(gx0 + gw > W - 8) hx -= gx0 + gw - (W - 8);
    // (hx is where the fan's middle stands; the page is given it less the fan's own offset)
    // (upright, a seat along the top: its cards face up come down just enough to stay 2 px inside the area, on their own)
    const hys = !land && !beside && q.ny < -.8 && S.shownT != null ? Math.max(0, Math.round(2 - (y + S.shownT))) : null;
    return { x, y, nx: q.nx, ny: q.ny, side: sgn < 0 ? 'l' : 'r', pl, pwx, sx: Math.round(sx), hx: Math.round(hx - ox), hy: cy0, hys, core: [px, py + C.ph / 2, half, C.ph / 2],
      stUp, boxes: [[x, y, AV / 2, AV / 2], [px, py + (C.ph + pill) / 2 - (stUp ? pill : 0), half, (C.ph + pill) / 2], [x + Math.round(hx - ox) + ox, y + cy0 + oy, gw / 2, ch / 2]] };
  };
  const seats = [null];
  const qs = [null];
  for(let i = 1; i <= m; i++){ qs.push(ring.at(BGAP / 2 * u + (i - .5) * u)); seats.push(seatAt(qs[i], i - 1)); }
  // (the seats along the top all show their cards on one side, left or right, so no two meet in the same gap: the
  // side whose narrowest gap to the next seat is the wider)
  const row = seats.map((q, k) => k && !q.pl && q.ny < -.8 && !(short && Math.abs(q.nx) > .3) ? k : 0).filter(Boolean);
  if(row.length > 1){
    // (less a card fan's width where the neighbour's own cards face this seat)
    const gapOf = (k, d) => { const q = seats[k], nb = seats.filter((o, j) => j && j !== k && !row.includes(j) && Math.abs(o.y - q.y) < AV * 2.5 && Math.sign(o.x - q.x) === d)
      .concat(row.filter(j => j !== k && Math.sign(seats[j].x - q.x) === d).map(j => seats[j]));
      return nb.length ? Math.min(...nb.map(o => Math.abs(o.x - q.x) - ((o.side === 'l') === (d > 0) && !row.includes(seats.indexOf(o)) ? C.cw * 2.3 : 0))) : 1e4; };
    const d = Math.min(...row.map(k => gapOf(k, -1))) > Math.min(...row.map(k => gapOf(k, 1))) ? -1 : 1;
    row.forEach(k => { seats[k] = seatAt(qs[k], k - 1, d); });
  }
  // (an empty seat is its "+" alone, the avatar's size: no plate, no cards. The middle keeps clear of that only, so a
  // short-handed table at 9 keeps its board cards at their size: a second player's iPhone, 2026-10-23, 2 seated at 9,
  // the flop drawn small between plates that were not there)
  for(const k of empty){ const q = seats[k]; if(!q) continue; const a = [q.x, q.y, AV / 2, AV / 2]; seats[k] = { ...q, core: a, boxes: [a, a, a] }; }
  // your seat: your cards over the bottom rail, your plate under the rail (upright) or on it (sideways), in the middle
  // (sideways a size smaller, at most 0.17 of the felt's height: the owner's iPhone, 2026-10-23, the two cards large over the rail)
  const hw = Math.round(Math.max(30, Math.min(64, vw * C.hw, land ? fh * .17 : 64))), hh = Math.round(hw * 1.4), hpw = Math.max(104, Math.min(120, hw * 2 + 8));
  // (on a short sideways table, under 240 px, your cards stand beside your plate, right of it, so the middle keeps room
  // for the pot, the board and the winner line)
  const hside = short, hpTop = top + fh - heroOver;
  const hgap = Math.round(hw * .16 + 4), hpx = hside ? Math.round(cx - (hpw + hgap + 2 * hw) / 2 + hpw / 2) : cx, hcx = hside ? hpx + hpw / 2 + hgap + hw : cx, hcBot = hside ? hpTop + heroPh - R - 2 : hpTop - 1;
  seats[0] = { x: hpx, y: hpTop + heroPh / 2, nx: 0, ny: 1, hero: true, hw, hpw, hside,
    boxes: [[hcx, hcBot - hh / 2 - hw * .05, hw + 4, hh / 2 + hw * .05], [hpx, hpTop + heroPh / 2, hpw / 2, heroPh / 2]] };
  // (watching, nobody here is you: the seat at the foot is a seat like the others, on the rail at the bottom, no hero
  // slot. It rises just enough that its avatar, its plate and its status line stay inside the table area (sideways it
  // sits as low as the area allows, its plate beside it, where your plate was, so the middle keeps its size), so the line
  // under the table ("You finished 16th. Watching Table 2.") has its own room: before, the foot seat took your plate's
  // place and its plate hung below the area, over that line (owner, Issue #32 items 12 and 13))
  if(watch){
    const q = ring.at(0), lowest = H - 2 - Math.max(AV / 2, land ? 0 : plateY + C.ph + pill);
    seats[0] = seatAt({ ...q, x: cx, nx: 0, ny: 1, y: land ? lowest : Math.min(q.y, lowest) }, 0);
    if(empty.includes(0)){ const a = [seats[0].x, seats[0].y, AV / 2, AV / 2]; seats[0] = { ...seats[0], core: a, boxes: [a, a, a] }; }
  }
  // ---- the middle (§3.4): the pot over the board, the winner line under it; and the chips and the dealer button
  // (§3.3) on one ring, 78% of the felt, in front of each seat. The first place for the middle (the board's size, a
  // little higher or lower) where nothing touches a seat and every seat's chips and button find a clean spot wins. ----
  const seatBoxes = seats.map(q => q.boxes), flat = seatBoxes.flat(), cores = seats.flatMap(q => q.hero ? q.boxes : [q.core]), solid = seats.flatMap(q => q.hero ? q.boxes : [q.core, q.boxes[2]]), innerW = fw - 2 * R,
    // (each seat as one box round its avatar, plate and cards: how the board and the pot keep clear of a seat)
    unions = seats.map(q => { const bs = q.hero ? q.boxes : [q.boxes[0], q.core, q.boxes[2]], l = Math.min(...bs.map(b => b[0] - b[2])), r = Math.max(...bs.map(b => b[0] + b[2])),
      tp = Math.min(...bs.map(b => b[1] - b[3])), bt = Math.max(...bs.map(b => b[1] + b[3])); return [(l + r) / 2, (tp + bt) / 2, (r - l) / 2, (bt - tp) / 2]; });
  const hitAny = (bx, list, pad) => list.some(([x, y, w, h]) => Math.abs(bx[0] - x) < bx[2] + w + pad && Math.abs(bx[1] - y) < bx[3] + h + pad);
  const [bW, bH] = S.bet, DB = 11, fa = fw / 2 - R, fb = fh / 2 - R;
  const anchors = seats.map(q => q.hero ? [(hcx + hpx) / 2, (Math.min(hcBot - hh, hpTop) + hpTop + heroPh) / 2] : [q.x, q.y]);
  // (the search for the middle's place below asks the same points again and again: every place it tries walks the
  // same seats' rings. These three depend on their arguments only, so each answer is worked out once per layout: on a
  // crowded sideways table the search took a third of a second, enough to stall a phone as it turned)
  const memo = f => { const M = new Map(); return (...a) => { const k = a.join(','); let v = M.get(k); if(v === undefined){ v = f(...a); M.set(k, v); } return v; }; };
  // (an empty seat has no chips to be confused with: a spot near its "+" still reads as its neighbour's)
  const mineC = memo((x, y, own) => { const d = Math.hypot(x - anchors[own][0], y - anchors[own][1]); return anchors.every(([X, Y], i) => i === own || empty.includes(i) || Math.hypot(x - X, y - Y) > d * 1.08 + 2); });
  // (the dealer button is different: it may stand on an empty seat (a dead button), so a D near a "+" reads as that
  // seat's. The D belongs to its seat only where it is nearer it than any other seat, the empty ones too, by a clear
  // margin: Issue #32 item 10, the D read as the seat beside it on some hands)
  // (watching, the seat at the foot is drawn as any other: its own point is its avatar)
  const anchorsD = watch ? anchors.map((p, i) => i ? p : [seats[0].x, seats[0].y]) : anchors;
  const mineD = memo((x, y, own) => { const d = Math.hypot(x - anchorsD[own][0], y - anchorsD[own][1]); return anchorsD.every(([X, Y], i) => i === own || Math.hypot(x - X, y - Y) > d * 1.12 + 3); });
  // the point of the ring of `f` of the felt on the line from the middle towards (x, y)
  const onRing = memo((x, y, f) => { let lo = 0, hi = 1; for(let k = 0; k < 22; k++){ const t = (lo + hi) / 2; if(inStadium(cx + (x - cx) * t, cy + (y - cy) * t, cx, cy, fa * f, fb * f)) lo = t; else hi = t; } return [cx + (x - cx) * lo, cy + (y - cy) * lo]; });
  // (a box wholly on the felt, its corners 3 px inside)
  const boxIn = memo((x, y, w, h) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([i, j]) => inStadium(x + i * w, y + j * h, cx, cy, fa, fb, 3)));
  const RINGS = Array.from({ length: 17 }, (_, i) => .94 - i * .04);
  // (the seats take their spots one by one, round the table; where that leaves one without a clean spot at the middle's
  // chosen place, the other way round, and the side seats first, are tried too, and the order with the least miss kept)
  // (an empty seat has no chips and no button to place: it is left out, and given a spot on the 70% ring at the end)
  const ORDERS = [Array.from({ length: m + 1 }, (_, i) => i).filter(i => (i || watch) && !empty.includes(i))];
  ORDERS.push([...ORDERS[0]].reverse(), [...ORDERS[0]].sort((a, b) => Math.abs(seats[b].nx) - Math.abs(seats[a].nx)));
  // (`bound`: the miss the caller already has in hand. A try that reaches it can't be chosen, so it stops there, and its
  // miss, at least the bound, says so: the same layout as trying it to the end, found in a fraction of the time)
  function chipsFor(stack, orders = ORDERS.slice(0, 1), bound = Infinity){
    let r = null;
    for(const order of orders){ const c = chipsIn(stack, order, r ? Math.min(bound, r.miss) : bound); if(!r || c.miss < r.miss) r = c; if(!r.miss) break; }
    return r;
  }
  // a seat's places for its chips or its button, in the order they're tried, in steps: the clean spots first, then the
  // fallbacks, each step with what it adds to the miss (each step worked out once per layout, when first needed)
  const SPOTS = new Map(), FALLS = [[solid, true, 1], [cores, true, 5], [solid, false, 8], [cores, false, 12], [[], true, 25], [[], false, 28]];
  function spotStep(q, own, w, h, rings, i, strict){
    const key = own + ':' + w + ':' + h + ':' + rings.join(',') + ':' + i + (strict ? ':d' : '');
    let st = SPOTS.get(key); if(st) return st;
    const mine = strict ? mineD : mineC;
    // (the button: never a spot that reads as another seat's; where none is left, it stands at its own avatar, below)
    if(strict && i && !FALLS[i - 1][1]){ st = [[], 0]; SPOTS.set(key, st); return st; }
    const d0 = Math.max(60, Math.hypot(q.x - cx, q.y - cy)), a0 = Math.atan2(q.y - cy, q.x - cx), pts = [];
    if(!i){
      for(const f of rings) for(let s = 0; s <= 96; s += 6) for(const sg of s ? [1, -1] : [1]){
        const ang = a0 + sg * s / d0, [x, y] = onRing(cx + Math.cos(ang) * 4000, cy + Math.sin(ang) * 4000, f);
        if(boxIn(x, y, w, h) && !hitAny([x, y, w, h], flat, 3) && mine(x, y, own)) pts.push([x, y]); }
      // (at a table with empty seats no neighbour's chips hem a seat's spot in, so it could slide far round the ring:
      // the clean spots nearest the seat come first there. A full table keeps the order above)
      if(empty.length) pts.sort((a, b) => Math.hypot(a[0] - q.x, a[1] - q.y) - Math.hypot(b[0] - q.x, b[1] - q.y));
      st = [pts, 0];
    } else {
      // (no clean spot: the first that keeps off the board, the pot, the other chips and every seat's plate and cards,
      // along the ring and then right round its avatar; then one that keeps off the plates only; then the line to the seat.
      // A spot that still reads as this seat's, nearest it by a clear margin, comes first: over another seat's cards
      // before nearer another seat, over a plate last. Each step down weighs more in the choice of the middle's place)
      const [list, own1, c1] = FALLS[i - 1], ok = (x, y) => boxIn(x, y, w, h) && !hitAny([x, y, w, h], list, 2) && (!own1 || mine(x, y, own));
      // (still this seat's: a finer search, every ring from 30% to 94% of the felt, and three distances round the avatar)
      for(const f of own1 ? RINGS : rings) for(let s = 0; s <= 150; s += 6) for(const sg of s ? [1, -1] : [1]){
        const ang = a0 + sg * s / d0, [x, y] = onRing(cx + Math.cos(ang) * 4000, cy + Math.sin(ang) * 4000, f);
        if(ok(x, y)) pts.push([x, y]); }
      for(const dr of own1 ? [0, 10, 20] : [0]) for(let k = 0; k < 16; k++){ const a = a0 + Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 8, r = AV / 2 + Math.max(w, h) + 4 + dr, x = q.x + Math.cos(a) * r, y = q.y + Math.sin(a) * r;
        if(ok(x, y)) pts.push([x, y]); }
      st = [pts, c1];
    }
    SPOTS.set(key, st); return st;
  }
  // the button where no spot on the felt reads as its seat's: right by the seat's own avatar, first on the side towards
  // the middle, round it until it is nearer this seat than any other, inside the area and off the board, the pot and the
  // chips (then nearer this seat only). Before, it took the line to the seat, and on a crowded table that could stand
  // nearer the seat beside it (Issue #32 item 10)
  function atSeat(q, own, placed = [], stack = [], radii = [AV / 2 + DB + 3, AV / 2 + DB + 9]){
    const a0 = Math.atan2(cy - q.y, cx - q.x), pts = [];
    for(const r of radii) for(let k = 0; k < 24; k++){ const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12; pts.push([q.x + Math.cos(a) * r, q.y + Math.sin(a) * r]); }
    const inA = (x, y) => x - DB >= 2 && x + DB <= W - 2 && y - DB >= 2 && y + DB <= H - 2;
    // (off every plate and card but its own avatar's first, then off the board, the pot and the chips, then anywhere its own)
    const others = flat.filter(b => !(b[0] === q.x && b[1] === q.y));
    return pts.find(([x, y]) => inA(x, y) && mineD(x, y, own) && !hitAny([x, y, DB, DB], stack, 2) && !hitAny([x, y, DB, DB], placed, 2) && !hitAny([x, y, DB, DB], others, 1))
      || pts.find(([x, y]) => inA(x, y) && mineD(x, y, own) && !hitAny([x, y, DB, DB], stack, 2) && !hitAny([x, y, DB, DB], placed, 2))
      || pts.find(([x, y]) => inA(x, y) && mineD(x, y, own)) || pts[0];
  }
  function chipsIn(stack, order, bound = Infinity){
    const placed = [], bets = [], dealers = []; let miss = 0;
    const clear = (x, y, w, h, own) => { const b = [x, y, w, h]; return !hitAny(b, flat, 3) && !hitAny(b, stack, 3) && !hitAny(b, placed, 2) && mineC(x, y, own); };
    // (where a spot may go for the seat alone, kept in order: the board, the pot and the chips already placed are
    // checked against these only, in the same order, so the spot found is the same as checking every point in full)
    const free = (x, y, w, h) => !hitAny([x, y, w, h], stack, 3) && !hitAny([x, y, w, h], placed, 2);
    // (start on the line to the seat, then slide round the ring either way, then the rings inside and just outside it)
    const spot = (q, own, w, h, rings) => {
      for(let i = 0; i <= FALLS.length; i++){ const [pts, c1] = spotStep(q, own, w, h, rings, i);
        miss += c1;
        for(const [x, y] of pts) if(free(x, y, w, h)) return [x, y];
        miss -= c1;
      }
      miss += 25; return [...onRing(q.x, q.y, rings[0])];
    };
    // your chips: just over your cards, to the right; your button: left of your cards
    if(!watch){
    let p = null; for(const dx of [0, 24, -24, 48, -48]){ const x = hcx + hw * .6 + bW / 2 + dx, y = hcBot - hh - bH / 2 - 4; if(clear(x, y, bW / 2, bH / 2, 0)){ p = [x, y]; break; } }
    if(!p) miss++;
    bets[0] = p || [hcx, hcBot - hh - bH / 2 - 4]; placed.push([...bets[0], bW / 2, bH / 2]);
    dealers[0] = hside ? [hpx - hpw / 2 - DB - 6, hpTop + heroPh / 2] : [cx - hw - DB - 6, hcBot - hh * .35]; placed.push([...dealers[0], DB, DB]);
    }
    if(miss >= bound) return { bets, dealers, miss };
    for(const i of order){ bets[i] = spot(seats[i], i, bW / 2, bH / 2, [.78, .7, .86, .62, .5, .4]); placed.push([...bets[i], bW / 2, bH / 2]); if(miss >= bound) return { bets, dealers, miss }; }
    for(const i of order){ dealers[i] = spot(seats[i], i, DB, DB, [.9, .84, .7, .62, .5]); placed.push([...dealers[i], DB, DB]); if(miss >= bound) return { bets, dealers, miss }; }
    return { bets, dealers, miss };
  }
  let best = null;
  const bw0 = Math.min(C.bw * vw, (innerW - 40) / 5.6, land ? fh * .16 : 99), potH = S.pot[1], mh = 34;
  search: for(const f of [1, .94, .88, .82, .76, .7]){ const bw = Math.round(bw0 * f), bh = Math.round(bw * 1.4), boardW = 5 * bw + 4 * 6, msgW = Math.min(innerW - 2 * AV, Math.max(boardW + 40, 220));
    for(const dy of [0, -8, 8, -16, 16, -24, 24, -32, 32, -40, 40, -50, 50, -60, 60, -72, 72, -84, 84]){
      const by = Math.round((land ? cy - fh * .06 : top + fh * .43) + dy);
      if(!inStadium(cx, by - bh / 2 - 6 - potH, cx, cy, fa, fb, 2) || !inStadium(cx, by + bh / 2 + 6 + mh, cx, cy, fa, fb, 2)) continue;
      const stack = [[cx, by, boardW / 2, bh / 2], [cx, by - bh / 2 - 6 - potH / 2, S.pot[0] / 2, potH / 2], [cx, by + bh / 2 + 6 + mh / 2, msgW / 2, mh / 2]];
      if(stack.some(b => hitAny(b, flat, 4)) || stack.slice(0, 2).some(b => hitAny(b, unions, 1))) continue;
      const ch = chipsFor(stack, undefined, best ? best.miss : Infinity), cand = { bw, bh, by, msgW, stack, ...ch, ch };
      if(!best || ch.miss < best.miss) best = cand;
      if(!ch.miss) break search;
    } }
  // (no place where the middle's boxes clear every seat's boxes, which are drawn at their widest: the smallest table
  // of 9. Then the place where they touch the fewest, and the chips and buttons still keep off the board and the pot)
  if(!best || best.miss >= 25) for(const f of [1, .88, .76, .7, .64, .58]){ const bw = Math.round(bw0 * f), bh = Math.round(bw * 1.4), boardW = 5 * bw + 4 * 6, msgW = Math.min(innerW - 2 * AV, Math.max(boardW + 40, 220));
    for(const dy of [0, -8, 8, -16, 16, -24, 24, -32, 32, -40, 40, -50, 50, -60, 60]){
      const by = Math.round((land ? cy - fh * .06 : top + fh * .43) + dy);
      const stack = [[cx, by, boardW / 2, bh / 2], [cx, by - bh / 2 - 6 - potH / 2, S.pot[0] / 2, potH / 2], [cx, by + bh / 2 + 6 + mh / 2, msgW / 2, mh / 2]];
      // (the board and the pot over a plate weigh most; the winner line, there only after a hand, less; then the chips)
      const touch = cores.filter(b => hitAny(b, stack.slice(0, 2), 2)).length * 100 + unions.filter(b => hitAny(b, stack.slice(0, 2), 2)).length * 60 + cores.filter(b => hitAny(b, [stack[2]], 2)).length * 20;
      // (and a smaller board weighs too, so the board is not made smaller only to find a chip a cleaner spot)
      const shrink = Math.round((1 - f) * 40), ch = chipsFor(stack, undefined, best ? best.miss - 10 * touch - shrink : Infinity), cand = { bw, bh, by, msgW, stack, ...ch, ch, miss: ch.miss + 10 * touch + shrink };
      if(!best || cand.miss < best.miss) best = cand;
    } }
  const ch0 = best.ch;
  if(ch0.miss){ const ch = chipsFor(best.stack, ORDERS, ch0.miss); if(ch.miss < ch0.miss) best = { ...best, ...ch, miss: best.miss - ch0.miss + ch.miss }; }
  const mid = best, cost = best.miss, bets = best.bets, dealers = best.dealers.slice();
  // (the button, once the middle, the chips and the buttons are placed as before: a D that does not read as its own seat's
  // (nearer it than any other seat, empty ones too, by a clear margin) is placed again, on a clean spot of its own on the
  // felt, else right by its avatar. The middle and the chips stay where they were: Issue #32 item 10)
  const chipsAt = (except) => bets.filter(Boolean).map(p => [...p, bW / 2, bH / 2]).concat(dealers.filter((p, j) => p && j !== except).map(p => [...p, DB, DB]));
  for(let i = 0; i <= m; i++){
    if(empty.includes(i) || !dealers[i] || mineD(dealers[i][0], dealers[i][1], i)) continue;
    const placed = chipsAt(i); let pt = null;
    if(i) for(let k = 0; k <= 2 && !pt; k++) pt = spotStep(seats[i], i, DB, DB, [.9, .84, .7, .62, .5], k, true)[0].find(([x, y]) => !hitAny([x, y, DB, DB], mid.stack, 3) && !hitAny([x, y, DB, DB], placed, 2)) || null;
    // (your own seat: round your cards and plate together, the D just clear of them)
    const hb = !i && !watch && seats[0].boxes, hr = hb && Math.max(...hb.map(b => Math.hypot(Math.abs(b[0] - anchorsD[0][0]) + b[2], Math.abs(b[1] - anchorsD[0][1]) + b[3]))) * .75;
    dealers[i] = pt || (hb ? atSeat({ x: anchorsD[0][0], y: anchorsD[0][1] }, 0, placed, mid.stack, [hr, hr + 8, hr + 16]) : atSeat(seats[i], i, placed, mid.stack));
  }
  for(const k of empty) if(seats[k] && !bets[k]){ bets[k] = onRing(seats[k].x, seats[k].y, .7); const dk = onRing(seats[k].x, seats[k].y, .84); dealers[k] = mineD(...dk, k) ? dk : atSeat(seats[k], k, dealers.filter(Boolean).map(p => [...p, DB, DB]), mid.stack); }
  // ---- the felt's name (Issue #32 item 9): a clean spot on the felt, off the board's row, the pot, the result line, every
  // seat's plate and cards, and every seat's chips and D button wherever they may stand this hand. Under the result line
  // on the middle first (upright, between it and your chips); where that has no room (sideways), the clean spot nearest
  // it; with none at all, the result line's own place (no card can cover it there), giving way while a result is written ----
  // (the status line under a plate, where a seat's last action now shows (Issue #32 item 7): where its middle would lie
  // under someone's chips or a D, it slides along under its plate, at most to the plate's ends, to a clean place)
  const chipBoxes = chipsAt(-1);
  for(let k = watch ? 0 : 1; k <= m; k++){ const q = seats[k]; if(!q || q.hero || q.pl || empty.includes(k)) continue;
    const half = C.pw / 2, pyl = q.core[1] + C.ph / 2 + 10, px0 = q.core[0];
    for(const dx of [0, -4, 4, -8, 8, -12, 12, -16, 16, -20, 20, -24, 24]){ if(Math.abs(dx) > half - 16) continue; if(!hitAny([px0 + dx, pyl, 20, 8], chipBoxes, 0)){ seats[k] = { ...q, stx: dx }; break; } } }
  const WMW = 48, WMH = 7, mBot = mid.by + mid.bh / 2 + 6 + mh, rowTop = mid.by - mid.bh / 2 - 6 - potH;
  // (first clear of the chips and buttons too; on a crowded table, where no such spot is left, clear of the plates, the
  // cards, the board's row, the pot and every D, over as few seats' chip spots as can be: a seat's chips may then come to
  // lie over the name while they are out, never a card. Then on the result line's place too, where it gives way while a
  // result is written. No such spot at all: not drawn)
  const rowBot = mid.by + mid.bh / 2, wmBox = (x, y) => [x, y, WMW, WMH], betBoxes = bets.filter(Boolean).map(p => [...p, bW / 2, bH / 2]), dBoxes = dealers.filter(Boolean).map(p => [...p, DB, DB]);
  const wmOk = (x, y, msg) => boxIn(x, y, WMW, WMH) && !(y + WMH + 6 > rowTop && y - WMH - 6 < (msg ? mBot : rowBot)) && !hitAny(wmBox(x, y), flat, 4) && !hitAny(wmBox(x, y), dBoxes, 3)
    && !hitAny(wmBox(x, y), msg ? mid.stack : mid.stack.slice(0, 2), 4);
  const under = (x, y) => betBoxes.filter(b => hitAny(wmBox(x, y), [b], 3)).length;
  let wm = null, wmMsg = false;
  for(const [chips, msg] of [[true, true], [false, true], [false, false]]){
    const run = []; for(let y = Math.ceil((msg ? mBot : rowBot) + WMH + 6); y < top + fh; y++){ if(wmOk(cx, y, msg) && !(chips && under(cx, y))) run.push(y); else if(run.length) break; }
    if(run.length >= 3){ wm = [cx, run[Math.floor(run.length / 2)]]; }
    else { let bd = Infinity; for(let y = top; y <= top + fh; y += 3) for(let x = left; x <= left + fw; x += 3){ if(!wmOk(x, y, msg)) continue; const u = under(x, y); if(chips && u) continue;
      const d = u * 1e4 + Math.abs(x - cx) * 1.5 + Math.abs(y - mBot - WMH - 6); if(d < bd){ bd = d; wm = [x, y]; } } }
    if(wm){ wmMsg = !msg && hitAny(wmBox(...wm), [mid.stack[2]], 2); break; }
  }
  const geo = { key, W, H, cls, land, look: '', sq: 1, k: 0, inset: 7, wmX: wm ? wm[0] : null, wmY: wm ? wm[1] : null, wmMsg, g: 0, nar: 0, compact: false, mini: false, tight: false, potSide: false, rail: R, cx, cy, tall: !land, fw, fh, top, left,
    seats, bw: mid.bw, by: mid.by, bx: cx, msgW: mid.msgW, mline: mid.bh / 2 + 6, av: AV, cost, bets, dealers, betAt: k => bets[k], dealerAt: k => dealers[k] };
  GEO = geo; if(GEOS.size > 12) GEOS.delete(GEOS.keys().next().value);
  if(a.clientWidth) GEOS.set(key, geo);
  return geo;
}
// A seat on the board (§3.3): the avatar (the initials disc: "Show my photo" is off until a member turns it on, Muse's
// amendment 2, so no member photo shows at the table; a gallery pick shows on the same navy disc) with its gold ring,
// bright and sweeping on the player to act, a presence dot, the name plate under it (name, stack), the cards tucked
// behind it, and the status in words under the plate: Away, Disconnected (Muse's amendment 1: the word, not a dot alone).
// Your own seat: your cards over the bottom rail and your plate, "You" and your stack, under it.
function boardAvHTML(uid, name){
  const m = memberOf(uid), av = m && m.av, g = av && av.startsWith('g:') && GALLERY[av.slice(2)];
  return `<div class="av b-av">${g ? `<span class="emo">${g[0]}</span>` : esc(initials(name))}</div>`;
}
function boardSeatHTML(d, p, s, o){
  const { isMe, acting, res, hole, pos, oq, stackTxt, winStyle, nick } = o;
  const dc = acting && d.dcProtect, away = !!p.away, won = res && p.won > 0;
  // the seat's last action in its colour, "Winner", or its hand at a showdown: in the status line under the plate (the
  // Away / Disconnected spot), never in place of the name. The name line always shows the name: after acting, and the
  // blinds before the flop, read "Fold" or "SB" where the player's name was (owner, Issue #32 item 7)
  let word = '', wcls = '';
  if(won){ word = 'Winner'; wcls = 'won'; }
  else if(res && res.showdown && p.cat){ word = p.cat; wcls = 'hand'; }
  else if(p.act && !acting && !res){ word = p.act; wcls = 'act-' + p.act.toLowerCase().replace(/[^a-z]+/g, '-'); }
  if(word === stackTxt) word = '';
  // (Disconnected first, then Winner, then Away, then the action: one status at a time, in the one spot)
  const status = dc ? '<span class="badge b-st dc" title="Disconnected · protection time">Disconnected</span>'
    : word && (won || !away) ? `<span class="badge b-st b-act ${wcls}" data-act="${esc(word)}">${esc(word)}</span>` : away ? '<span class="badge b-st away">Away</span>' : '';
  const label = `${p.name}, ${stackTxt === 'All-in' ? 'all-in' : stackTxt + ' chips'}${dc ? ', disconnected' : away ? ', away' : ''}${word ? ', ' + word : ''}${acting ? ', to act' : ''}`;
  const cls = `seat b-seat ${isMe ? 'hero' : ''} ${isMe && oq.hside ? 'hside' : ''} ${p.folded ? 'folded' : ''} ${acting ? 'acting' : ''} ${won ? 'win' : ''} ${p.allIn && !res ? 'allin' : ''} ${oq.pl ? 'pl-' + oq.pl : ''}${oq.stUp ? ' st-up' : ''}`;
  const nm = `<div class="nm" title="${esc(p.name)}">${esc(isMe ? 'You' : nick(p.name))}</div>`;
  const st = `<div class="st num${stackTxt === 'All-in' ? ' allin' : ''}">${stackTxt}</div>`;
  const shot = acting ? `<div class="shot"><i class="shotBar${dc ? ' dc' : ''}"></i></div>` : '';
  const at = `data-uid="${esc(p.uid)}" aria-label="${esc(label)}" style="left:${pos[0]}%;top:${pos[1]}%${winStyle}`;
  if(isMe) return `<div class="${cls}" ${at}"><div class="hole">${hole}</div><div class="plate">${boardAvHTML(p.uid, p.name)}<div class="pl-txt">${nm}${st}</div>${shot}</div>${status}</div>`;
  return `<div class="${cls}" ${at};--sx:${oq.sx || 0}px;--stx:${oq.stx || 0}px;--hx:${oq.hx || 0}px;--hy:${oq.hy || 0}px${oq.hys != null ? `;--hys:${oq.hys}px` : ''}${oq.pwx ? `;--pw:${oq.pwx}px` : ''}"><div class="hole${/ show\b/.test(hole) ? ' shown' : ''}">${hole}</div>${boardAvHTML(p.uid, p.name)}${shot}`
    + `<i class="b-dot${dc ? ' dc' : away ? ' away' : ''}" aria-hidden="true"></i><div class="plate">${nm}${st}</div>${status}</div>`;
}
const pxToPct = ([x, y]) => [x / GEO.W * 100, y / GEO.H * 100];
// Maps a table's seat numbers to screen positions, turned so you sit at the bottom.
function layoutOf(d){
  // the chips in front of a seat never read wider than "8,888" or "88.8K" (bigger bets read 12.5K, 125K, 1.2M; see
  // chipFmt), so the seats have the same room all hand and don't move when someone bets big
  const bet = '88.8K';
  const allowed = d.allowed || [0, 1, 2, 3, 4, 5, 6, 7, 8], n = allowed.length;
  const mySeat = d.seats.findIndex(p => p && club && p.uid === club.me.id), base = Math.max(0, allowed.indexOf(mySeat));
  const rel = s => (allowed.indexOf(s) - base + n) % n;
  // (the board's layout knows which seats are empty, by their place round the table)
  const G = BOARD ? boardGeo(n, allowed.filter(s => !d.seats[s]).map(rel).filter(k => k || mySeat < 0).sort((x, y) => x - y), mySeat < 0) : tableGeo(n, bet);
  return { allowed, rel, G, posOf: s => pxToPct([G.seats[rel(s)].x, G.seats[rel(s)].y]), betOf: s => G.betAt(rel(s)), dealerOf: s => G.dealerAt(rel(s)) };
}
const centerPx = () => GEO ? [GEO.bx, GEO.by] : pctToPx([50, 45]);
const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
// An element's centre inside the table area (for a seat's avatar), or null.
function avatarPx(uid){
  const area = $('tableArea'); let el = area && area.querySelector(`.seat[data-uid="${CSS.escape(uid)}"] .av`); if(!el) return null;
  // (the board draws no avatar on your own plate: your plate stands for it)
  if(BOARD && !el.getClientRects().length) el = el.closest('.seat').querySelector('.plate');
  const a = area.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - a.left, y: r.top + r.height / 2 - a.top, size: r.width };
}
// Winning a pot: the chips glide from the middle of the felt to the winner and settle there as a small
// stack with a soft glow until the next hand. Purely on-screen; the game never waits for it.
const WIN_GLIDE = 1400, WIN_DELAY = 250;
function chipStacks(won, bb){
  const cols = Math.max(1, Math.min(3, Math.ceil(won / Math.max(1, bb * 6))));
  return Array.from({ length: cols }, (_, c) => { const h = Math.max(2, Math.min(6, Math.round(2 + (won / Math.max(1, bb)) / (4 * cols)) - c));
    return `<span class="wcol">${'<i></i>'.repeat(h)}</span>`; }).join('');
}
// Another seat's shown cards stand over its avatar (under it at the top of the oval), where on a crowded oval (7 to 9
// seats, a short screen) the seat above or below (its plate, badge or cards) or a winner's chips can lie over them. Move
// them the least that clears every other seat, the pot, a winner's chips, the board, the result line and the screen's
// edge: sideways (toward the middle first) or further over their own avatar; else the place with the least overlap.
// (Run on every render: a reused seat starts from its own place.)
function clearShown(){
  const seats = [...$('seats').querySelectorAll('.seat')], holes = seats.map(s => s.querySelector(':scope[data-side]>.hole.shown')).filter(Boolean);
  if(!holes.length) return;
  holes.forEach(h => h.style.translate = '');
  // (a badge at its full size: Winner grows in after the chips glide over)
  const R = e => { const b = e.getBoundingClientRect(); if(!e.classList.contains('badge')) return b; const x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2, w = e.offsetWidth / 2, h = e.offsetHeight / 2; return { left: x - w, right: x + w, top: y - h, bottom: y + h }; };
  const over = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left) - 1.5) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) - 1.5); // (a touch is no overlap)
  const text = e => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); };
  const mid = [...$('board').children, $('pot'), ...document.querySelectorAll('#fx .winpile:not(.gone)')].map(R).concat([...$('msg').children].map(text)).filter(b => b.width && b.height);
  const W = document.documentElement.clientWidth, area = R($('tableArea')), cx = (area.left + area.right) / 2;
  const moves = [];
  for(let dy = 0; dy <= 14; dy += 2) for(let k = 0; k <= 24; k++) moves.push([(k % 2 ? 1 : -1) * Math.ceil(k / 2) * 4, dy]);
  moves.sort((p, q) => Math.abs(p[0]) + p[1] * 3 - Math.abs(q[0]) - q[1] * 3);
  // (each in turn, then again with the others where they went, until none moves)
  const base = holes.map(h => { const own = [...h.children].map(R), av = R(h.parentNode.querySelector('.av') || h), hc = (own[0].top + own[0].bottom) / 2;
    return { h, own, inward: (av.left + av.right) / 2 < cx ? 1 : -1, down: hc < (av.top + av.bottom) / 2 ? 1 : -1, at: '' }; });
  for(let pass = 0, moved = true; pass < 3 && moved; pass++){
    moved = false;
    for(const o of base){
      const rest = seats.filter(s => s !== o.h.parentNode).flatMap(s => [...s.querySelectorAll('.av, .plate, .badge, .hole .card')]).map(R).concat(mid);
      let best = null;
      for(const [mx, my] of moves){
        const dx = mx * o.inward, dy = my * o.down, at = o.own.map(b => ({ left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy }));
        if(at.some(b => b.left < 2 || b.right > W - 2)) continue;
        const cost = at.reduce((t, b) => t + rest.reduce((u, q) => u + over(b, q), 0), 0);
        if(!best || cost < best.cost) best = { dx, dy, cost };
        if(!cost) break;
      }
      const t = best && (best.dx || best.dy) ? `${best.dx}px ${best.dy}px` : '';
      if(t !== o.at){ o.h.style.translate = o.at = t; moved = true; }
    }
  }
}
function potToWinners(d, handKey, LY){
  const key = 'win' + handKey; if(seen.has(key)) return; seen.add(key);
  const fx = $('fx'); if(!fx) return;
  fx.querySelectorAll('.winpile').forEach(e => e.remove());
  // start where the pot sits, just above the board
  const area = $('tableArea'), ar = area.getBoundingClientRect(), br = $('board').getBoundingClientRect();
  // (the winner beat: the hand's name holds the pot's place, so the chips come out from behind the board's cards instead)
  const fromCards = !!(d.result && d.result.hand && br.width);
  const [px, py] = br.width ? [br.left + br.width / 2 - ar.left, fromCards ? br.top + br.height / 2 - ar.top : br.top - ar.top - 12] : centerPx(), still = reducedMotion(), bb = (d.blinds && d.blinds[1]) || 1;
  d.seats.forEach((p, s) => {
    if(!p || !(p.won > 0)) return;
    let [bx, by] = LY.betOf(s); const el = document.createElement('div');
    el.className = 'winpile num'; el.dataset.hand = handKey;
    el.innerHTML = `<span class="wglow"></span><span class="wstack">${chipStacks(p.won, bb)}</span><span class="wamt">+${fmt(p.won)}</span>`;
    fx.appendChild(el);
    // (the pile is taller than the chips' spot: it moves that much further in, towards the pot, so it never lies over
    // the seat or your cards behind that spot)
    const grow = Math.max(0, el.offsetHeight / 2 - 11), gl = Math.hypot(px - bx, py - by) || 1;
    bx += (px - bx) / gl * grow; by += (py - by) / gl * grow;
    // (the board: the seat's status line says "Winner" under its plate; the pile keeps clear of it, and of the result
    // line, the board's row (its box: the cards may still be flying in) and the seats: the nearest clean place,
    // further in towards the pot or to either side)
    const pill = BOARD && $('seats').querySelector(`.seat[data-uid="${CSS.escape(p.uid)}"] .badge.b-st`);
    if(pill){ const box = e => { const r = e.getBoundingClientRect(); return [r.left - ar.left, r.top - ar.top, r.right - ar.left, r.bottom - ar.top]; };
      const msg = $('msg'), words = msg && msg.textContent.trim() ? [...msg.querySelectorAll('*')].filter(e => !e.children.length && e.textContent.trim()) : [];
      const obst = [pill, ...(words.length ? words : msg && msg.textContent.trim() ? [msg] : []), $('board'), ...$('seats').querySelectorAll('.seat .plate, .seat .badge.b-st, .seat .av, .seat .hole')]
        .map(box).filter(b => b[2] > b[0]);
      const hw = el.offsetWidth / 2, hh = el.offsetHeight / 2, ux = (px - bx) / gl, uy = (py - by) / gl;
      const clear = (x, y) => !obst.some(([L, T, R, B]) => x - hw < R + 2 && x + hw > L - 2 && y - hh < B + 2 && y + hh > T - 2);
      let best = null;
      const W = area.clientWidth, H = area.clientHeight;
      for(let k = -4; k <= 24; k++) for(let j = -12; j <= 12; j++){
        const x = bx + ux * 4 * k - uy * 8 * j, y = by + uy * 4 * k + ux * 8 * j, c = Math.hypot(4 * k, 8 * j);
        if((!best || c < best[2]) && x - hw >= 2 && x + hw <= W - 2 && y - hh >= 2 && y + hh <= H - 2 && clear(x, y)) best = [x, y, c]; }
      // (with no clean place, clear of its own status line at least, as before)
      const [L, T, R, B] = box(pill);
      if(best){ bx = best[0]; by = best[1]; }
      else for(let k = 0; k < 24 && bx - hw < R + 2 && bx + hw > L - 2 && by - hh < B + 2 && by + hh > T - 2; k++){ bx += ux * 4; by += uy * 4; } }
    el.style.cssText = `left:${bx}px;top:${by}px`;
    if(still){ el.classList.add('settled'); return; }
    const dx = px - bx, dy = py - by, lift = Math.min(60, Math.hypot(dx, dy) * .18);
    el.querySelectorAll('.wcol').forEach((c, i) => c.animate([
      { transform: `translate(${dx}px,${dy}px) scale(.9)`, opacity: .0 },
      { transform: `translate(${dx}px,${dy}px) scale(.95)`, opacity: 1, offset: .08 },
      { transform: `translate(${dx * .45}px,${dy * .45 - lift}px) scale(1.06)`, offset: .55 },
      { transform: 'translate(0,0) scale(1)', opacity: 1 }],
      { duration: WIN_GLIDE, delay: WIN_DELAY + i * 90, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'backwards' }));
    setTimeout(() => el.classList.add('settled'), WIN_DELAY + WIN_GLIDE);
  });
  // never outstay the hand: gone when the next hand is drawn, or after a few seconds at most
  setTimeout(() => fx.querySelectorAll(`.winpile[data-hand="${CSS.escape(handKey)}"]`).forEach(e => { e.classList.add('gone'); setTimeout(() => e.remove(), 400); }), 6000);
}
// When did this hand's win start showing (so a redraw doesn't restart the winner animations)?
const winStarts = new Map();
function winElapsed(handKey){ if(!winStarts.has(handKey)){ winStarts.set(handKey, Date.now()); if(winStarts.size > 20) winStarts.delete(winStarts.keys().next().value); } return Date.now() - winStarts.get(handKey); }
// Redraw a container from a list of HTML pieces, one element each, keeping the elements whose piece is unchanged
// (a seat that didn't change isn't rebuilt, so its picture and animations don't flicker on every update).
function patchKids(box, parts){
  const pool = new Map();
  for(const k of box.children){ if(!pool.has(k._h)) pool.set(k._h, []); pool.get(k._h).push(k); }
  const els = parts.map(h => { const q = pool.get(h); if(q && q.length) return q.shift();
    const t = document.createElement('template'); t.innerHTML = h; const el = t.content.firstElementChild; el._h = h; return el; });
  pool.forEach(q => q.forEach(k => k.remove()));
  els.forEach((el, i) => { if(box.children[i] !== el) box.insertBefore(el, box.children[i] || null); });
}
// an amount on the felt, short from `from` up (12.5K, 125K, 1.25M), so a label never outgrows the room the layout keeps
const chipFmt = (n, from) => n < from ? fmt(n) : n < 1e5 ? (Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'K'
  : n < 1e6 ? Math.floor(n / 1000) + 'K' : (Math.floor(n / 1e4) / 100).toFixed(2).replace(/\.?0+$/, '') + 'M';
const pctToPx = ([x, y]) => { const a = $('tableArea'); return [a.clientWidth * x / 100, a.clientHeight * y / 100]; };
const cs = s => E.parse(s)[0];
function cardHTML(c, cls = '', extra = ''){
  if(c == null) return `<div class="card back ${cls}" ${extra}></div>`;
  const s = E.suitOf(c), red = s === 1 || s === 2, r = E.RANKS[E.rankOf(c) - 2];
  return `<div class="card ${red ? 'red' : ''} ${cls}" ${extra}><span class="r">${r === 'T' ? '10' : r}</span><span class="s1">${E.SUITS[s]}</span><span class="s2">${E.SUITS[s]}</span></div>`;
}
// (a one-word name shows its first two letters, Dev as De: a lone D on an avatar reads as the dealer button)
// a Blindrise Open club tag, "AIi (HC)", is not part of the name
const initials = n => { const w = String(n || '?').replace(/ \([^()]*\)$/, '').trim().split(/\s+/); return w.length > 1 ? w.slice(0, 2).map(x => x[0]).join('').toUpperCase() : w[0].slice(0, 1).toUpperCase() + w[0].slice(1, 2).toLowerCase(); };
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
  if(BOARD){
    // the board: after the welcome, never over it; one line first saying you're registered; on an iPhone outside the
    // Home Screen app, say up front that reminders need it (the reminders themselves work as before)
    if(onbOpen){ onbRemind = true; return; }
    const reg = T.regs.includes(club.me.id) ? `<p class="b-reg-line">You're registered for ${esc(T.name)}.</p>` : '';
    if(isIOS() && !standalone()){
      if(await modal(`${reg}<h2>Get a reminder?</h2><p>On iPhone, reminders only work after you add Blindrise to your Home Screen. Until then, Add to calendar on Poker works too.</p>`, [{ label: 'Not now', value: null }, { label: 'Show me how', value: 1, primary: true }])) iosNote();
      return;
    }
    if(pushSupported() && Notification.permission === 'default'){
      if(await modal(`${reg}<h2>Get a reminder?</h2><p>We'll send a notification to this phone 15 minutes before ${esc(T.name)} starts, and again when the cards are dealt.</p>`, [{ label: 'No thanks', value: null }, { label: 'Notify me', value: 1, primary: true }])) enablePush();
      return;
    }
  }
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
  if(me) btns.push({ label: 'My business', value: 'biz' }, { label: 'Change picture', value: 'pic', primary: true });
  else if(club.me.owner && p.av) btns.push({ label: 'Remove photo', value: 'rmpic' });
  const v = await modal(html, btns);
  if(v === 'pic') pickAvatar();
  else if(v === 'biz'){ window.BizClub.open('mine'); tab = 'biz'; view = 'lobby'; showScreen('lobby'); renderLobby(); }
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

// short seat names that still tell everyone apart: "Sean Shahvari" -> "Sean", "Test Player 07" -> "Test 07" when
// several players share a first name, "Sean S." for two Seans; names up to 10 characters stay as they are
function seatNicks(all){
  const w = n => String(n).trim().split(/\s+/);
  const at = (n, L) => { const x = w(n); if(x.length < 2) return x[0] || ''; if(L === 0) return x[0]; const last = x[x.length - 1]; return x[0] + ' ' + (/^\d+$/.test(last) || last.length <= 3 ? last : last[0].toUpperCase() + '.'); };
  return n => {
    // a Blindrise Open name with its club tag, "AIi (HC)": the tag is what tells two look-alike names apart, so it stays
    const tg = /^(.*\S) (\([^()]*\))$/.exec(String(n));
    if(tg) return (tg[1].length <= 10 ? tg[1] : w(tg[1])[0]) + ' ' + tg[2];
    if(String(n).trim().length <= 10) return n;
    const taken = new Set(all.filter(o => o !== n).flatMap(o => [String(o).trim(), at(o, 0), at(o, 1)].map(t => t.toLowerCase())));
    for(const L of [0, 1]){ const c = at(n, L); if(!taken.has(c.toLowerCase())) return c; }
    return n;
  };
}
// The bottom dock (the hand helper over the action bar) keeps one height through the whole hand: the tallest it
// gets in normal play (your turn, with the helper's advice). So the table above it never changes size and nothing
// on the felt moves when the buttons, the helper or the waiting line come and go. A taller panel (choosing a raise
// amount) opens over the bottom of the table instead of pushing it. Measured from a hidden copy, so it follows
// the fonts and the screen-size rules. A spectator's dock holds just the one-line status.
const DOCKS = new Map();
let DOCKH = 0, DOCKBOX = null;
function reserveDock(seated){
  const g = $('game'), dock = $('dock');
  // (the board: the dock is one info line over one action row, the same height in every state, set in board.css)
  if(BOARD){ g.classList.toggle('seated', seated); g.classList.remove('ovl', 'helpmin', 'wpt'); g.dataset.bcls = boardClass();
    if(dock.style.cssText){ dock.style.cssText = ''; dock.dataset.css = ''; } DOCKH = dock.offsetHeight; return; }
  g.classList.toggle('seated', seated); g.classList.toggle('ovl', ovalScreen()); g.classList.toggle('helpmin', seated && hMin());
  const key = `${seated}:${hMin()}:${g.clientWidth}:${g.className}`;
  let h = DOCKS.get(key);
  if(g.classList.contains('wpt')){
    // the WPT column: the dock stands at the bottom right over the felt, as tall as its tallest state (your turn with
    // the helper's one line, the pre-action buttons, the raise panel, the show offer), measured at its own width; the
    // table is laid out round that box, so the column never covers a seat or a card
    if(h == null){
      const turn = '<div class="turnrow"><button type="button" class="xtime">+30s<small>8 left</small></button><div class="turnbar"><i></i><span class="num">88s</span></div></div>';
      const states = seated ? [`<div class="controls">${turn}<div class="act-main" style="--n:3"><button class="act-btn fold"><b>Fold</b></button><button class="act-btn call"><b>Call</b><span class="num">88,888</span></button><button class="act-btn raise"><b>Raise</b><span>Choose amount</span></button></div></div>`,
        '<div class="controls"><div class="info-line">Wg</div><div class="preacts"><button><i></i>Fold</button><button><i></i>Call 88,888</button><button><i></i>Call any</button></div></div>',
        `<div class="controls"><div class="sizing"><div class="amt"><small>Raise to</small><b class="num">88,888</b><span class="num">88 BB</span></div><div class="sz-presets"><button>2.5 BB</button><button>3 BB</button><button>4 BB</button><button>Pot</button><button>All-in</button></div><div class="sz-slider"><button class="step">−</button><input type="range"><button class="step">+</button></div></div><div class="act-main" style="--n:2"><button class="act-btn back"><b>Back</b></button><button class="act-btn raise"><b>Raise</b><span class="num">88,888</span></button></div></div>`,
        '<div class="controls"><div class="info-line">Wg<br>Wg<br>Wg</div><div class="preacts showmuck n4"><button>Show left</button><button>Show right</button><button>Show both</button><button>Muck</button></div></div>']
        : ['<div class="controls"><div class="info-line">Wg<br>Wg<br>Wg</div></div>'];
      // (the free-play line stands above the buttons in every state)
      let hh = 0;
      h = [Math.max(...states.map(st => st.replace('<div class="controls">', PLAY_LINE + '<div class="controls">')).map(st => { const p = document.createElement('div');
        p.className = 'dock'; p.setAttribute('aria-hidden', 'true'); p.style.cssText = 'visibility:hidden;pointer-events:none;height:auto;--hlp-h:auto'; p.innerHTML = st;
        g.appendChild(p); const ph = p.offsetHeight, hp = p.querySelector('.helper'); if(hp) hh = Math.max(hh, hp.offsetHeight); p.remove(); return ph; })), hh];
      if(g.clientWidth){ if(DOCKS.size > 20) DOCKS.clear(); DOCKS.set(key, h); }
    }
    // (the column keeps that height all hand, the helper and the free-play line at its top and the buttons at its
    // foot, so nothing in it moves when its contents change)
    // (and the helper's line keeps its place when the helper is hidden: folded, the raise panel open, the hand over)
    const css = `height:${h[0]}px;--hlp-h:${h[1]}px`; if(dock.dataset.css !== css){ dock.style.cssText = css; dock.dataset.css = css; }
    DOCKH = h[0]; return;
  }
  if(h == null){
    const p = document.createElement('div');
    p.className = 'dock'; p.setAttribute('aria-hidden', 'true');
    p.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:auto;visibility:hidden;pointer-events:none';
    p.innerHTML = (seated ? `<div class="helper${hMin() ? ' min' : ''}"><div class="h-top"><b class="h-name">Wg</b><span class="h-eq"><i class="h-w">Win</i>88%<small> to win vs 8</small></span></div>${hMin() ? '' : `<div class="h-bar"><i></i></div><div class="h-line">Wg<br>Wg${g.classList.contains('land') ? '<br>Wg' : ''}</div>`}</div>` : '')
      + PLAY_LINE + `<div class="controls">${seated ? `<div class="turnrow"><button type="button" class="xtime">+30s<small>8 left</small></button><div class="turnbar"><i></i><span class="num">88s</span></div></div><div class="act-main" style="--n:3"><button class="act-btn fold"><b>Fold</b></button><button class="act-btn call"><b>Call</b><span class="num">88,888</span></button><button class="act-btn raise"><b>Raise</b><span>Choose amount</span></button></div>` : `<div class="info-line">Wg${g.classList.contains('land') ? '<br>Wg' : ''}</div>`}</div>`
      // the other state a seated player's bar has: the waiting line with the pre-action buttons
      + (seated ? '<div class="controls"><div class="info-line">Wg</div><div class="preacts"><button><i></i>Fold</button><button><i></i>Call 88,888</button><button><i></i>Call any</button></div></div>' : '');
    // and, upright, the raise panel (which takes the helper's place too): the dock is as tall as the taller of the two,
    // so the panel opens inside it and never over your own seat
    const sz = seated && !g.classList.contains('land') && (!g.classList.contains('h600') || g.classList.contains('ovl')) ? '<div class="controls"><div class="turnrow"><button type="button" class="xtime">+30s<small>8 left</small></button><div class="turnbar"><i></i><span class="num">88s</span></div></div><div class="sizing"><div class="amt"><small>Raise to</small><b class="num">88,888</b><span class="num">88 BB</span></div><div class="sz-presets"><button>2.5 BB</button><button>3 BB</button><button>Pot</button><button>All-in</button></div><div class="sz-slider"><button class="step">−</button><input type="range"><button class="step">+</button></div></div><div class="act-main" style="--n:2"><button class="act-btn back"><b>Back</b></button><button class="act-btn raise"><b>Raise</b><span class="num">88,888</span></button></div></div>' : '';
    g.appendChild(p); const hp = p.querySelector('.helper'), cs = [...p.querySelectorAll('.controls')].map(c => c.offsetHeight), ch = Math.max(...cs);
    const full = p.offsetHeight - cs.reduce((t, x) => t + x, 0) + ch, hh = hp ? hp.offsetHeight : 0;
    // (measured after the rest: a raise panel anywhere in the game hides the helper)
    let szh = 0;
    if(sz){ p.insertAdjacentHTML('beforeend', '<div style="position:absolute;left:0;right:0;top:0">' + sz + '</div>'); szh = p.lastElementChild.firstElementChild.offsetHeight; }
    h = [Math.max(full, szh + full - ch - hh), hh, ch]; p.remove();
    if(g.clientWidth){ if(DOCKS.size > 20) DOCKS.clear(); DOCKS.set(key, h); }
  }
  // the helper and the action bar each keep their own height too, so neither edge moves inside the dock
  if(dock.style.height !== h[0] + 'px' || dock.dataset.css){ dock.style.cssText = `height:${h[0]}px;--hlp-h:${h[1]}px;--ctl-h:${h[2]}px`; dock.dataset.css = ''; }
}
// Free social play. A quiet line in the dock stays at the table the whole game, between the helper and the action bar:
// upright it fills the gap already there (the helper's bottom margin and the bar's top padding, and 1-3 px of the
// helper's padding), so the table keeps its size; sideways it is one more row of the dock column. Either way it is part of the dock's reserved height, so
// it never sits over a seat, a card, chips, the result line or a button.
// At the start of each game (a tournament, or a new practice table) a short notice also shows once, over the
// board's empty card slots (and the empty message line under them) before the flop: the layout keeps that space clear of every seat, card and chip, so the
// notice covers nothing you play with. It goes on a tap, when the flop is dealt, when the hand ends, or after 10 s.
const PLAY_LINE = '<div class="playline"><span>Free social play</span> · <span>No betting · No real money</span></div>';
const playNoted = new Set();
let playNoteTimer = 0;
function playKey(d){
  if(d.tid === 'demo') return demo ? (demo.noteKey = demo.noteKey || 'demo:' + Date.now()) : null;
  const T = club && club.tourney; return T && T.id ? 't:' + T.id : null;
}
function playNoteSeen(k){ if(playNoted.has(k)) return true; try{ return localStorage.getItem('stacked:playnote') === k; }catch(e){ return false; } }
function hidePlayNote(){ clearTimeout(playNoteTimer); const el = $('playNote'); if(el) el.hidden = true; }
function renderPlayNote(d){
  const el = $('playNote'); if(!el) return;
  const k = d && playKey(d), clear = d && !d.board.length && !d.result;
  if(!el.hidden){ if(!clear || el.dataset.key !== k) hidePlayNote(); else placePlayNote(el); return; }
  if(!k || !clear || playNoteSeen(k)) return;
  playNoted.add(k); try{ localStorage.setItem('stacked:playnote', k); }catch(e){}
  el.dataset.key = k; el.hidden = false; placePlayNote(el);
  // (quiet design: four seconds, over the helper's line only briefly; the line under the strip says it all the time)
  clearTimeout(playNoteTimer); playNoteTimer = setTimeout(hidePlayNote, QUIET || BOARD ? 4000 : 10000);
}
// over the board's five empty slots (and, when no message is showing, the message line under them: the layout keeps
// both clear of seats and chips), the text as large as fits there, on two lines or, if need be, three
// (on the oval nothing but the game lies on the felt: there the notice stands in the dock on the free-play line, the
// same words, as one line in the gap between the hand helper and the buttons; it covered the helper's line, the hand
// and its chance to win, before: owner, 2026-10-22)
function placePlayNote(el){
  // (the board, spec §3.4: on the info line between your plate and the action row, one line over the helper for its
  // four seconds, placed by board.css; never a box on the felt)
  if(BOARD){ if(el.parentNode !== $('dock')) $('dock').appendChild(el); el.classList.remove('line', 'wrap'); if(el.style.cssText) el.style.cssText = ''; return; }
  let area = $('tableArea').getBoundingClientRect(); const slots = [...$('board').children].map(c => c.getBoundingClientRect());
  if(!slots.length) return hidePlayNote();
  let l = Math.min(...slots.map(r => r.left)), t = Math.min(...slots.map(r => r.top)), r = Math.max(...slots.map(r => r.right));
  let b = Math.max(...slots.map(r => r.bottom));
  const msg = $('msg'), hp = $('helper');
  const oval = $('tableArea').classList.contains('oval'), home = oval ? $('dock') : $('tableArea');
  if(el.parentNode !== home) home.appendChild(el);
  el.classList.toggle('line', oval);
  if(oval){ const d = $('dock').getBoundingClientRect(), pl = $('playLine').getBoundingClientRect(), h = !hp.hidden && hp.parentNode === $('dock') ? hp.getBoundingClientRect() : null;
    // (from the helper's foot, or 3 px above the line, to the top of the first thing in the bar under it)
    const under = [...$('controls').querySelectorAll('*')].filter(e => e.getClientRects().length && e.offsetHeight).map(e => e.getBoundingClientRect().top).filter(y => y >= pl.top);
    area = d; l = h ? h.left : d.left + 8; r = h ? h.right : d.right - 8;
    t = Math.max(pl.top - 3, h ? h.bottom : d.top); b = Math.max(pl.bottom, Math.min(pl.bottom + 3, ...under)); }
  else if(!msg.textContent.trim()){ const ms = getComputedStyle(msg), lh = parseFloat(ms.lineHeight) || parseFloat(ms.fontSize) * 1.3; b = Math.max(b, msg.getBoundingClientRect().top + lh); }
  el.style.cssText = `left:${l - area.left}px;top:${t - area.top}px;width:${r - l}px;height:${b - t}px`;
  const fits = () => el.scrollHeight <= el.clientHeight + .5 && el.scrollWidth <= el.clientWidth + .5;
  for(const wrap of oval ? [false] : [false, true]){
    el.classList.toggle('wrap', wrap);
    for(let f = 13; f >= (oval ? 9.5 : 11); f -= .5){ el.style.fontSize = f + 'px'; if(fits()) return; }
  }
}
$('playNote').onclick = hidePlayNote;
// The table area's height is held for the whole hand. It is decided when a hand starts (or the screen turns) from
// the room the screen has with the browser's bars showing (100svh), so the felt doesn't move or rescale when
// Safari's toolbar slides in or out, or the keyboard opens, mid-hand. If the screen still gets shorter during a
// hand, the table keeps its size and the dock (the action bar) stays at the bottom of the screen, over the table's
// lower edge, until the next hand is dealt.
let LOCK = null, SVH = null;
// The screen's size for the layout's decisions. iPhone Safari reports a turned screen's new size late: for a while after
// the turn innerWidth and innerHeight can still give the old shape while the page is already laid out for the new one.
// The board takes the page's own size then (the root's), so it is laid out for the screen it is really on. (Today's
// table reads innerWidth and innerHeight as before.)
function scr(){
  const w = window.innerWidth, h = window.innerHeight;
  if(!BOARD) return { w, h };
  const de = document.documentElement, cw = de.clientWidth, ch = de.clientHeight;
  return cw && ch && Math.abs(cw - w) > 24 ? { w: cw, h: ch } : { w, h };
}
function svhPx(){
  if(!SVH){ SVH = document.createElement('div'); SVH.setAttribute('aria-hidden', 'true');
    SVH.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none'; document.body.appendChild(SVH); }
  return CSS.supports && CSS.supports('height', '100svh') ? SVH.offsetHeight : window.innerHeight;
}
// A new hand (or a turned screen, or the first look) decides again. The short-screen sizes of the header and the
// action bar (h700/h600, which were height media queries) are decided at the same moment and held as well.
function newLock(d){
  const g = $('game'), hand = d ? d.tid + ':' + d.handNo : '';
  if(LOCK && LOCK.w === g.clientWidth && LOCK.hand === hand) return false;
  const { w: IW, h: H } = scr(); g.classList.toggle('h700', H <= 700); g.classList.toggle('h600', H <= 600);
  // a phone held sideways: the table takes the full width on the left and the action bar stands beside it
  const land = IW > H && H <= 600 && IW >= 560;
  if(g.classList.contains('land') !== land){ g.classList.toggle('land', land); LOCK = null; }
  if(BOARD) boardCol();
  // the smallest phones sideways (iPhone SE): your cards go back above your plate, smaller, so the bottom row of
  // a full table has the width it needs
  g.classList.toggle('land-s', land && IW < 700);
  // on short screens the header is one row: the chat and Lobby buttons move up beside the clock. Short is judged by
  // the height with Safari's bars showing (svh), which is the room the table is laid out for: an iPhone upright in
  // Safari (393x659, 430x739) gets the second row's height for the felt, so a full table is an oval, not round
  const row1 = H <= 600 || Math.min(H, svhPx()) <= 760 && IW < 600;
  g.classList.toggle('row1', row1);
  // a phone held upright (not the shortest screens): the table fills the screen from the header to the bottom edge,
  // your seat at the bottom left and the action buttons a narrow column at the bottom right, over the felt (as WPT)
  const wpt = false;
  if(g.classList.contains('wpt') !== wpt){ g.classList.toggle('wpt', wpt); LOCK = null; }
  g.style.setProperty('--dock-w', Math.min(184, Math.round(IW * .47)) + 'px');
  const hb = g.querySelector('.hdr-btns'), home = g.querySelector(row1 || QUIET ? '.clock' : '.stats');
  if(hb && hb.parentNode !== home) home.appendChild(hb);
  // quiet design, one-row header: the tournament line becomes the header's first cell (in place of the level, which
  // the clock's second line carries), so the short screens keep every pixel of their table (Muse, Issue #31)
  const ql = QUIET && $('qline'), qhome = row1 ? g.querySelector('.clock') : g.querySelector('.stats');
  if(ql && (row1 ? ql.parentNode !== qhome : ql.previousElementSibling !== qhome)) row1 ? qhome.prepend(ql) : qhome.after(ql);
  hudPlace();
  LOCK = { w: g.clientWidth, hand, h: 0, iw: IW, ih: H, wide: g.clientWidth > g.clientHeight };
  return true;
}
function lockArea(){
  const g = $('game'), area = $('tableArea');
  // the room the area has right now
  const was = area.style.cssText; area.style.height = ''; area.style.flex = ''; area.style.marginBottom = '';
  const room = Math.floor(area.getBoundingClientRect().height); area.style.cssText = was;
  // what sits around the table (the header above, the dock below): when that changes (the web fonts arriving
  // after the first hand was drawn, the helper folded small) the table is laid out again for the room left
  const frame = Math.round(area.offsetTop + (g.classList.contains('wpt') ? DOCKH : $('dock').offsetHeight));
  if(LOCK.frame !== frame){ LOCK.frame = frame; LOCK.h = 0; LOCK.box = null; }
  if(!LOCK.h){
    // with the browser's bars showing the screen is (at most) this much shorter
    const h = Math.max(120, room - Math.max(0, g.clientHeight - svhPx()));
    LOCK.h = h;
  }
  const over = Math.max(0, LOCK.h - room);
  area.style.flex = 'none'; area.style.height = LOCK.h + 'px'; area.style.marginBottom = (2 - over) + 'px';
  // the WPT column's box in the table area (its reserved height, from where it stands at the bottom right)
  // (decided with the table area's height, for the whole hand: the toolbar or the keyboard moving the column mid-hand
  // doesn't lay the table out again)
  if(!g.classList.contains('wpt')) DOCKBOX = LOCK.box = null;
  // (where it stands with the browser's bars showing, the highest it goes during the hand)
  else if(!LOCK.box){ const ar = area.getBoundingClientRect(), dr = $('dock').getBoundingClientRect(), up = Math.max(0, g.clientHeight - svhPx());
    DOCKBOX = [Math.round(dr.right - dr.width - ar.left), Math.round(dr.bottom - up - DOCKH - ar.top), Math.round(dr.right - ar.left), Math.round(dr.bottom - up - ar.top)]; LOCK.box = DOCKBOX; }
  else DOCKBOX = LOCK.box;
}
let handOnFelt = false; // the winning hand's name is on the felt (the pot's place or the result line)
function renderTable(){
  if(view !== 'table' || !club) return;
  const tid = watchTid || club.myTable, d = tables.get(tid);
  const area = $('tableArea');
  if(!d){
    if(club.myTable && club.myTable !== watchTid && club.tourney && club.tourney.status === 'running'){ return openTable(club.myTable); }
    $('seats').innerHTML = ''; $('board').innerHTML = ''; $('pot').style.visibility = 'hidden';
    $('msg').textContent = club.tourney && club.tourney.status === 'running' ? 'Loading the table…' : 'This table has closed.';
    $('controls').innerHTML = '<div class="info-line">Tap Lobby to see the other tables.</div>';
    hidePlayNote(); tickClock(); return;
  }
  const mySeat = d.seats.findIndex(s => s && s.uid === club.me.id);
  newLock(d);
  reserveDock(mySeat >= 0);
  lockArea();
  area.style.setProperty('--cw', Math.max(30, Math.min(46, area.clientWidth * .1)) + 'px');
  const res = d.result, winCards = new Set((res && res.showdown ? res.winCards : []).map(cs));
  const handKey = d.tid + ':' + d.handNo;
  area.dataset.state = handKey + ':' + d.seq;   // which state the table shows (table, hand, turn), for checking it is the live one
  // the whole live pot: what's in the middle plus this street's bets still in front of the seats (the coach's pot
  // odds count the same total; when the bets are swept in they leave the seats as they join d.pot, so nothing counts twice)
  const potAll = (d.pot || 0) + d.seats.reduce((t, p) => t + (p && p.inHand ? p.bet || 0 : 0), 0);
  // (the winner beat, Issue #34: while the server holds the result, the winning hand sits where the pot was, the winner and
  // the amount on the line under the board; it goes when the server moves the table on, never on a client timer)
  $('pot').innerHTML = res && res.hand ? `<span class="win-hand">${esc(res.hand)}</span>` : !res && potAll > 0 ? `${chipsIcon(3)}Pot ${chipFmt(potAll, 1e6)}` : '';
  $('pot').classList.toggle('beat', !!(res && res.hand)); area.classList.toggle('win-beat', !!res);
  // (a long hand name that does not fit keeps its first part: "Two Pair", not "Two Pair, Jacks and Ei…")
  const wh = res && res.hand && $('pot').querySelector('.win-hand'); if(wh && wh.scrollWidth > wh.clientWidth + 1) wh.textContent = res.hand.split(',')[0];
  $('pot').style.visibility = $('pot').innerHTML ? 'visible' : 'hidden';
  let b = '';
  for(let i = 0; i < 5; i++){
    const c = d.board[i] != null ? cs(d.board[i]) : null;
    const rb = c == null && d.rabbit && res ? d.rabbit[i - d.board.length] : null;
    if(rb){ b += cardHTML(cs(rb), 'board rabbit', 'title="Rabbit hunt: this card was not dealt"'); continue; }
    if(c == null){ b += '<div class="slot"></div>'; continue; }
    const key = `bd${handKey}-${i}`, isNew = !seen.has(key); seen.add(key);
    const hl = res && res.showdown && winCards.size ? (winCards.has(c) ? 'wincard' : 'dim') : '';
    b += cardHTML(c, `board ${hl} ${isNew ? 'flip' : ''}`, isNew ? `style="animation-delay:${(i < 3 ? i : 0) * 110}ms"` : '');
  }
  $('board').innerHTML = b;
  const lines = res ? res.lines : d.note ? [d.note] : d.seats.filter(Boolean).length < 2 ? ['Waiting for players to be moved to this table…'] : [];
  // the felt keeps room for one line here (see tableGeo); the full result is written in the bar under the table
  // (renderControls); the full text is also the title
  // (a result keeps its short part here, who won how much, so it is never cut off; the hand's name is in the bar)
  const short = l => (l.match(/^.*? (?:wins|split) [\d,]+/) || [l])[0];
  $('msg').innerHTML = lines.map(l => `<div>${esc(res ? short(l) : l)}</div>`).join(''); $('msg').title = lines.join('\n');
  const LY = layoutOf(d), posOf = LY.posOf, G = LY.G;
  area.style.setProperty('--bw', G.bw + 'px');
  const felt = area.querySelector('.felt');
  // (on the oval the felt's name sits on the message line under the board, which the layout keeps clear of chips)
  const wm = G.inset === 6 ? `;--wm:${(G.by + G.mline - (G.cy - G.fh / 2)) / G.fh * 100}%` : '';
  felt.style.cssText = `inset:auto;left:${G.cx - G.fw / 2}px;top:${G.cy - G.fh / 2}px;width:${G.fw}px;height:${G.fh}px;--rw:${G.rail}px${wm}${BOARD && G.wmY != null ? `;--wm-x:${G.wmX - (G.cx - G.fw / 2)}px;--wm-y:${G.wmY - (G.cy - G.fh / 2)}px` : ''}`;
  // (the board: the felt's name is an element of its own, champagne gold, placed by the layout; Issue #32 item 9)
  if(BOARD){ let m = felt.querySelector('.b-wm'); if(!m){ m = document.createElement('i'); m.className = 'b-wm'; m.setAttribute('aria-hidden', 'true'); m.textContent = 'BLINDRISE'; felt.appendChild(m); }
    m.classList.toggle('on-msg', !!G.wmMsg); m.hidden = G.wmY == null; }
  area.querySelector('.center').style.cssText = `left:${G.bx}px;top:${G.by}px;width:${Math.max(G.bw * 5 + 20, G.msgW)}px`;
  $('msg').style.maxWidth = G.msgW + 'px';
  // a split or several pots can be longer than the felt's one line: then the same result in shorter words, until it
  // fits whole (short names, without the pot labels and the uncalled bets, then only who won); the bar under the
  // table and the title keep the full text
  if(res && lines.length){
    const m = $('msg'), names = d.seats.filter(Boolean).map(p => p.name).sort((a, b) => b.length - a.length), nk = seatNicks(names);
    const nicks = l => names.reduce((t, n) => t.split(n).join(nk(n)), l), won = lines.filter(l => / (?:wins|split) [\d,]+/.test(l));
    const who = [...new Set(won.flatMap(l => short(l).replace(/^(?:Main pot|Side pot \d+): /, '').replace(/ (?:wins|split) [\d,]+$/, '').split(' & ')))].map(nk);
    const forms = [lines.map(short), lines.map(l => nicks(short(l))), won.map(l => nicks(short(l)).replace(/^(?:Main pot|Side pot \d+): /, '')),
      [who.join(' & ') + (who.length > 1 ? ' win' : ' wins')], [who.length > 1 ? who.length + ' winners' : who[0] + ' wins']];
    const cut = () => m.scrollHeight > m.clientHeight + 1 || m.scrollWidth > m.clientWidth + 1;
    for(const f of forms){ m.innerHTML = f.map(l => `<div>${esc(l)}</div>`).join(''); if(!cut()) break; }
  }
  // (the felt's name fades while a line is written over it)
  area.classList.toggle('msg-on', !!$('msg').textContent.trim());
  // (the board: its size class and seat unit sizes, for board.css)
  if(BOARD){ const C = BCLS[G.cls], h = G.seats[0];
    area.dataset.bcls = G.cls; area.style.cssText += `;--av:${C.av}px;--pw:${C.pw}px;--ph:${C.ph}px;--cwb:${C.cw}px;--hw:${h.hw}px;--hph:${C.hph}px;--hpw:${h.hpw}px`; }
  area.classList.toggle('tall', G.tall); area.classList.toggle('oval', G.inset === 6); area.classList.toggle('stad', G.inset === 2 || G.inset === 3 || G.inset === 6); area.classList.toggle('tight', G.tight); area.classList.toggle('compact', G.compact); area.classList.toggle('mini', G.mini); area.classList.toggle('micro', G.look === 'micro'); area.classList.toggle('pot-side', !!G.potSide);
  if(!d.result) $('fx').querySelectorAll('.winpile').forEach(e => { if(e.dataset.hand !== d.tid + ':' + d.handNo){ e.classList.add('gone'); setTimeout(() => e.remove(), 400); } });
  const mc = myCards.get(d.tid), mine = mc && mc.hand === d.handNo ? mc.cards.map(cs) : null;
  const nick = seatNicks(d.seats.filter(Boolean).map(p => p.name));
  const parts = [];
  for(const s of LY.allowed){
    const p = d.seats[s], pos = posOf(s);
    // (the board: an empty seat is a "+" circle, not tappable: tournament seats are assigned, §9.4)
    if(!p){ parts.push(BOARD ? `<div class="empty-seat b-plus" aria-hidden="true" style="left:${pos[0]}%;top:${pos[1]}%">+</div>` : `<div class="empty-seat" style="left:${pos[0]}%;top:${pos[1]}%">OPEN</div>`); continue; }
    const isMe = p.uid === club.me.id, oq = LY.G.seats[LY.rel(s)] || {};
    // (watching an oval table, the seat at its foot takes your seat's place and shape: its avatar in its plate, under
    // its cards, just above the dock)
    const foot = !isMe && G.inset === 6 && LY.rel(s) === 0 && !d.seats.some(q => q && q.uid === club.me.id);
    let hole = '';
    // a folded hand stays hidden from others unless its owner chose to show a card after the hand
    if(p.inHand && !(p.folded && !isMe && !(p.shown && p.shown.some(x => x != null)))){
      const [sx, sy] = pctToPx(pos), [cx, cy] = centerPx();
      hole = [0, 1].map(j => {
        const key = `h${handKey}-${s}-${j}`, isNew = !seen.has(key); seen.add(key);
        const anim = isNew && d.street === 0 && !res ? `dl" style="--fx:${cx - sx}px;--fy:${cy - sy}px;animation-delay:${(j * 9 + s) * 50}ms` : '';
        const c = p.shown && p.shown[j] != null ? cs(p.shown[j]) : (isMe && mine ? mine[j] : null);
        const hl = res && res.showdown && winCards.size && c != null ? (winCards.has(c) ? ' wincard' : ' dim') : '';
        if(isMe) return cardHTML(c, `hero ${p.folded ? 'dim' : ''}${hl === ' dim' ? '' : hl} ${anim}`);
        if(foot) return cardHTML(c, `hero${c != null ? ' show' : ''}${hl === ' dim' ? '' : hl} ${anim}`);
        if(c != null) return cardHTML(c, `show${hl === ' dim' ? '' : hl}`); // a losing hand stays fully readable at showdown
        return cardHTML(null, `mini ${anim}`);
      }).join('');
    }
    const acting = d.acting === s;
    let badge = '';
    if(res && p.won > 0) badge = '<span class="badge won">Winner</span>';
    else if(res && res.showdown && p.cat) badge = `<span class="badge hand">${esc(p.cat)}</span>`;
    else if(p.away) badge = '<span class="badge">Away</span>';
    // the player to act lost their connection: the server gave them 30 seconds of protection time (Issue #9)
    else if(acting && d.dcProtect) badge = '<span class="badge dc" title="Disconnected · protection time">Disconnected</span>';
    // the seat whose turn it is shows no pill from its last action (that CALL is history); the gold ring marks it
    else if(p.act && !acting){ const amt = (p.act === 'Raise' || p.act === 'Bet') ? ' ' + fmt(p.lastAmt) : ''; badge = `<span class="badge act-${p.act.toLowerCase().replace(/[^a-z]+/g, '-')}">${esc(p.act)}${amt}</span>`; }
    const stackTxt = p.inHand && p.allIn && !res ? 'All-in' : fmt(p.stack);
    // (quiet design: another seat's action goes in its name line, not in a pill under the plate)
    // (the amount of a bet or raise is on its chips in front of the seat, so the name line says only the action)
    // (Disconnected stays a pill of its own, with its orange clock: a status the table must not miss)
    let inl = QUIET && !isMe && !foot && badge && !/class="badge[^"]*\bdc\b/.test(badge) ? (m => m && { cls: m[1].trim(), txt: m[2].replace(/<[^>]*>/g, '').replace(/^(Raise|Bet) .*/, '$1') })(badge.match(/class="badge([^"]*)"[^>]*>([\s\S]*?)<\/span>/)) : null;
    // (an all-in seat's stack line already says All-in: the name stays, so the plate never reads "All-in / All-in")
    if(inl && inl.txt === stackTxt) inl = null;
    if(inl) badge = '';
    const cls = `seat ${isMe || foot ? 'hero' : ''} ${p.folded ? 'folded' : ''} ${acting ? 'acting' : ''} ${res && p.won > 0 ? 'win' : ''}`;
    const winStyle = res && p.won > 0 ? `;--wd:${reducedMotion() ? 0 : WIN_DELAY + WIN_GLIDE - 150 - winElapsed(handKey)}ms` : '';
    const av = avHTML(p.uid, p.name);
    const shot = acting ? `<div class="shot"><i class="shotBar${d.dcProtect ? ' dc' : ''}"></i></div>` : '';
    // a side seat showing its cards wears its badge (its hand, Winner) along their foot: under its plate it sat on the
    // corner of the cards of the seat below (owner, 9 seats at 430x932)
    const shown = / show\b/.test(hole), onCards = shown && (oq.side === 'l' || oq.side === 'r');
    if(BOARD) parts.push(boardSeatHTML(d, p, s, { isMe, acting, res, hole, pos, oq, stackTxt, winStyle, nick, handKey }));
    else parts.push(isMe || foot
      ? `<div class="${cls}" data-uid="${esc(p.uid)}" style="left:${pos[0]}%;top:${pos[1]}%${winStyle}"><div class="hole">${hole}</div><div class="plate">${av}<div class="pl-txt"><div class="nm" title="${esc(p.name)}">${esc(nick(p.name))}</div><div class="st num">${stackTxt}</div></div>${badge}${shot}</div></div>`
      : `<div class="${cls}" data-uid="${esc(p.uid)}"${oq.side ? ` data-side="${oq.side}"` : ''} style="left:${pos[0]}%;top:${pos[1]}%${winStyle}${oq.side ? `;--sx:${oq.sx}px;--sy:${oq.sy}px` : ''}"><div class="hole${shown ? ' shown' : ''}">${hole}${onCards ? badge : ''}</div>${av}<div class="plate"><div class="nm${inl ? ' nm-act ' + inl.cls : ''}"${inl ? ` data-act="${esc(inl.txt)}"` : ''} title="${esc(p.name)}">${esc(nick(p.name))}</div><div class="st num">${stackTxt}</div>${onCards ? '' : badge}${shot}</div></div>`);
    if(p.inHand && p.bet > 0){
      const [bx, by] = LY.betOf(s), bp = pxToPct([bx, by]), [sx, sy] = pctToPx(pos);
      const key = `b${handKey}-${d.street}-${s}-${p.bet}`, isNew = !seen.has(key); seen.add(key);
      parts.push(`<div class="bet num ${isNew ? 'chipin' : ''}" style="left:${bp[0]}%;top:${bp[1]}%;--fx:${sx - bx}px;--fy:${sy - by}px">${chipsIcon(Math.min(3, 1 + Math.floor(p.bet / (d.blinds[1] * 3))))}${chipFmt(p.bet, 1e4)}</div>`);
    }
  }
  if(d.btn >= 0 && d.phase === 'hand'){
    const dd = pxToPct(LY.dealerOf(d.btn));
    parts.push(`<div class="dealer${res ? ' under' : ''}" style="left:${dd[0]}%;top:${dd[1]}%">D</div>`); // (after the hand, under the shown cards)
  }
  patchKids($('seats'), parts);
  // (where the screen is too small for a clean layout, the smallest phones sideways, the result line can still touch
  // a seat under the board: then it is written above the board instead, where the pot was during the hand)
  const ml = $('msg'); ml.classList.remove('up');
  if(res && G.cost){ const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom, mr = ml.getBoundingClientRect();
    if([...$('seats').querySelectorAll('.av, .plate, .hole .card')].some(e => hit(e.getBoundingClientRect(), mr))) ml.classList.add('up'); }
  // (the winner beat: when the result line goes up into the pot's place, the hand's name leaves that place and joins the
  // line, "Ana wins 1,200 · Two Pair", when it fits whole; else it stays in the bar under the table)
  handOnFelt = !!(res && res.hand);
  if(res && res.hand && ml.classList.contains('up')){
    const P = $('pot'); P.innerHTML = ''; P.classList.remove('beat'); P.style.visibility = 'hidden';
    // (in shorter words until it fits: the hand's kind only, "Two Pair", then the players' short names)
    const was = ml.innerHTML, L0 = res.lines[0], won = (L0.match(/^.*? (?:wins|split) [\d,]+/) || [L0])[0], kind = res.hand.split(',')[0];
    const names = d.seats.filter(Boolean).map(p => p.name).sort((a, b) => b.length - a.length), nk = seatNicks(names), nicks = l => names.reduce((t, n) => t.split(n).join(nk(n)), l);
    const fits = () => ml.scrollHeight <= ml.clientHeight + 1 && ml.scrollWidth <= ml.clientWidth + 1;
    // (more pots: the others follow as who won how much, and go last of all; the bar under the table lists them all)
    const more = res.lines.slice(1).filter(l => / (?:wins|split) [\d,]+/.test(l)).map(l => nicks((l.match(/^.*? (?:wins|split) [\d,]+/) || [l])[0]));
    handOnFelt = [[L0, ...more], [won + ' · ' + kind, ...more], [nicks(won) + ' · ' + kind, ...more], [nicks(won) + ' · ' + kind]]
      .some(f => { ml.innerHTML = f.map(x => `<div>${esc(x)}</div>`).join(''); return fits(); });
    if(!handOnFelt) ml.innerHTML = was;
  }
  if(res) try{ potToWinners(d, handKey, LY); }catch(e){}
  clearShown();
  $('tName').textContent = `Table ${d.n}`;
  $('sPlayers').textContent = `${d.seats.filter(Boolean).length} seated`;
  fieldUI();
  renderControls(d, mySeat, mine);
  renderHelper(d, mySeat >= 0 ? d.seats[mySeat] : null, mine);
  // last hand's coach tip floats over the table; it gets out of the way when it's your turn to act
  if(d.actUid === club.me.id && !d.result && !$('coachTip').hidden){ $('coachTip').hidden = true; clearTimeout(tipTimer); }
  // (the board: a tip that came while it was your turn waits for your turn to end; Issue #32 item 14)
  else if(BOARD && tipWait && !(d.actUid === club.me.id && !d.result)){ const w = tipWait; tipWait = null; showTip(...w); }
  renderPlayNote(d);
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
    // your turn: fold the chat away so the action buttons are in view (unless you're mid-message)
    if(chatOpen && document.activeElement !== $('chatInput')) openChat(false);
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
  let line, pre = '', showLine = '';
  const T = club.tourney, out = T && (T.places || []).find(r => r.uid === club.me.id);
  if(!meSeat) line = out ? `You finished ${ord(out.place)}. Watching Table ${d.n}.` : `Watching Table ${d.n}.`;
  else if(d.result && d.showOffer && (d.showOffer.can || []).includes(club.me.id)){
    // after the hand: show my own cards if I want to (only the ones still face down); the uncontested winner may muck
    const up = meSeat.shown || [null, null], won = !d.result.showdown && !meSeat.folded;
    const none = up[0] == null && up[1] == null;
    const b = [up[0] == null ? ['0', none ? 'Show left' : 'Show other'] : null, up[1] == null ? ['1', none ? 'Show right' : 'Show other'] : null,
      none ? ['0,1', 'Show both'] : null, won && none ? ['', 'Muck'] : null].filter(Boolean);
    showLine = up[0] != null || up[1] != null ? 'You showed a card.' : won ? 'You won. Show your cards?' : 'Show your cards?';
    pre = `<div class="preacts showmuck n${b.length}">${b.map(([v, l]) => `<button data-show="${v}">${l}</button>`).join('')}</div>`;
  }
  else if(meSeat.away) line = `You're sitting out, so your hands fold automatically. <button class="btn green" id="backBtn" style="margin-left:6px;padding:6px 12px">I'm back</button>`;
  else if(myTurn) line = 'Sending your action…';
  else if(meSeat.inHand && !meSeat.folded){
    // (while the hand helper shows your hand's name, the bar doesn't say it again)
    const HT = demo ? { helper: true } : club.tourney, helped = !!(HT && HT.helper !== false && mine && d.phase === 'hand' && !d.result);
    if(mine && d.board.length && !helped) line = `${meSeat.allIn ? "You're all-in · " : 'You have '}<b>${esc(E.describe(E.evaluate(mine.concat(d.board.map(cs)))))}</b>`;
    else if(meSeat.allIn) line = "You're all-in";
    else line = d.acting >= 0 ? `Waiting for ${esc((d.seats[d.acting] || {}).name || '')}${d.dcProtect ? ' · disconnected, protection time' : ''}…` : 'Dealing…';
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
  else line = d.phase === 'hand' ? 'You play from the next hand.' : T && T.status === 'running' && (T.breakUntil || T.breakPending) && !T.paused ? 'On break. Play resumes by itself.' : 'Shuffling up…';
  // a finished hand: the whole result in the bar (the felt shows its first line)
  const R = d.result && d.result.lines;
  // (while my show offer is up, the bar asks about my cards instead; the felt still shows the result)
  if(showLine) line = showLine;
  else if(R && R.length && !(meSeat && meSeat.away)){
    // the felt already says who won how much: the bar adds only what the felt leaves out (the winning hand, the
    // other pots), so the same words never show twice
    const rest = R.map(l => l.slice((l.match(/^.*? (?:wins|split) [\d,]+/) || [''])[0].length).replace(/^\s*·\s*/, ''));
    // (one pot: its winning hand is on the felt now, in the pot's place, Issue #34)
    line = rest.every(x => !x) || R.length === 1 && d.result.hand && handOnFelt ? 'Next hand coming up…' : R.length === 1 ? `Winning hand: <b>${esc(rest[0])}</b>` : R.map(esc).join('<br>');
  }
  // (the board: the quick actions, or nothing, with "⋯" at the end of the row, which keeps its height, §3.5)
  // (the board, sitting out: the words on the info line, "I'm back" in the action row's empty place before "⋯". In the
  // line, the button overflowed it, under the free-play line, and Safari centred the overflow up under your plate:
  // the owner's iPhone, 2026-10-23)
  const away = BOARD && meSeat && meSeat.away && !showLine;
  if(away){ line = "You're sitting out, so your hands fold automatically."; pre = `<div class="b-acts b-idle b-back" style="--n:0"><button type="button" class="btn green" id="backBtn">I'm back</button>${B_MORE}</div>`; }
  else if(BOARD) pre = pre ? pre.replace(/<\/div>$/, B_MORE + '</div>').replace('class="preacts', `style="--n:${(pre.match(/<button/g) || []).length}" class="b-acts preacts`) : `<div class="b-acts b-idle" style="--n:0">${B_MORE}</div>`;
  c.innerHTML = `<div class="info-line${away ? ' b-away' : ''}">${line}</div>${pre}`;
  const bb = $('backBtn'); if(bb) bb.onclick = () => send({ t: 'back' });
  c.querySelectorAll('[data-show]').forEach(btn => btn.onclick = () => {
    const cards = btn.dataset.show ? btn.dataset.show.split(',').map(Number) : [];
    send({ t: 'show', tid: d.tid, hand: d.handNo, cards });
    c.querySelectorAll('[data-show]').forEach(x => x.disabled = true);
  });
  c.querySelectorAll('[data-pre]').forEach(btn => btn.onclick = () => {
    const k = btn.dataset.pre;
    preAct = preAct && preAct.kind === k ? null : { kind: k, key: streetKey, amt: +btn.dataset.amt };
    c.querySelectorAll('[data-pre]').forEach(x => x.setAttribute('aria-pressed', !!(preAct && preAct.kind === x.dataset.pre)));
    if(navigator.vibrate) try{ navigator.vibrate(15); }catch(e){}
  });
}
// One action per turn: the first tap locks the buttons (a second tap, or a pre-action racing the button, sends
// nothing) until the table moves on. If nothing has moved after a few seconds (a lost message), the buttons come
// back so the action can be sent again; the server takes only the first action for a turn.
// Disconnects (Issue #34): while the connection is down the tap waits in the outbox (one action per turn; a newer tap
// replaces it) and the controls say so, never "sending…". After the reconnect, once the fresh table state is in, it is
// sent only if that state is still the same hand, the same seq and this player's turn; otherwise it is dropped, a short
// notice says so at that moment ("Call wasn't sent — the hand moved on."), and the controls show the new state. An
// action sent just before the connection fell (or found dead by the watchdog) goes back to the outbox: the server takes
// an act only for the current hand and seq, so sending it again can never count twice.
let actLockTimer = 0, live = false, outbox = null;   // outbox: this turn's action { key, tid, a, sent } until the server's state moves on
const actWords = a => ({ fold: 'Fold', check: 'Check', call: 'Call', raise: 'Raise' }[a.t] || '') + (a.t === 'raise' ? ' to ' + fmt(a.to) : '');
function sendAction(d, a){
  const key = d.tid + ':' + d.handNo + ':' + d.seq;
  if(lastSent === key) return;
  if(d.tid !== 'demo' && !(live && ws && ws.readyState === 1)){
    outbox = { key, tid: d.tid, a, sent: false }; offlineNote();
    if(navigator.vibrate) try{ navigator.vibrate(20); }catch(e){}
    return drawQueued(d);
  }
  lastSent = key;
  $('controls').querySelectorAll('button').forEach(b => { b.disabled = true; });
  clearTimeout(actLockTimer);
  actLockTimer = setTimeout(() => {
    const t = tables.get(d.tid);
    if(lastSent !== key || !t || t.tid + ':' + t.handNo + ':' + t.seq !== key || t.actUid !== club.me.id) return;
    lastSent = null; outbox = null; $('controls').dataset.turn = ''; if(view === 'table' && watchTid === d.tid) renderTable();
  }, 4000);
  // (quiet design: the free-play notice steps aside at my first action, so it never sits on the helper while I play,
  // Muse on Issue #31 from the owner's iPhone; the board, spec §3.4, the same)
  if(QUIET || BOARD) hidePlayNote();
  if(d.tid === 'demo' && demo){ if(navigator.vibrate) try{ navigator.vibrate(20); }catch(e){} $('controls').innerHTML = '<div class="info-line">…</div>'; return demo.answer(a); }
  $('controls').innerHTML = `<div class="info-line">${actWords(a)} · sending…</div>`;
  if(navigator.vibrate) try{ navigator.vibrate(20); }catch(e){}
  outbox = { key, tid: d.tid, a, sent: true, at: Date.now() };
  send({ t: 'act', tid: d.tid, hand: d.handNo, seq: d.seq, a });
}
// the action buttons stay live while an action waits (a newer tap replaces it); the line over them says what waits
function drawQueued(d){
  if(!outbox || view !== 'table' || d.tid !== (watchTid || club.myTable) || d.tid + ':' + d.handNo + ':' + d.seq !== outbox.key) return;
  const me = d.seats.find(p => p && p.uid === club.me.id); if(!me || !d.legal) return;
  $('controls').dataset.turn = outbox.key; drawActions(d, me); queuedNote(d);
}
function queuedNote(d){
  if(!outbox || outbox.sent || d.tid + ':' + d.handNo + ':' + d.seq !== outbox.key) return;
  const row = $('controls').querySelector('.turnrow');
  if(row) row.outerHTML = `<div class="info-line">Reconnecting… ${actWords(outbox.a)} will be sent when you're back.</div>`;
  if(BOARD && row) $('helper').hidden = true;   // (the board's top band shows one line: this one, not the hand helper)
}
// a waiting action the fresh state no longer fits (the hand moved on while the connection was down): it is dropped,
// and the player is told at that moment, so a tap never just vanishes
function outboxDrop(){
  const o = outbox; outbox = null;
  if(o && !o.sent) toast(`${actWords(o.a)} wasn't sent — the hand moved on.`, 4000, true);
}
// the "Reconnecting…" pill says the same, so it shows wherever the controls are
const offlineNote = () => { $('offline').textContent = outbox && !outbox.sent ? `Reconnecting… ${actWords(outbox.a)} will be sent when you're back.` : 'Reconnecting…'; };
// the connection fell: an action not yet answered by the server waits again (it may never have arrived)
function outboxDown(){
  live = false;
  if(!outbox || !outbox.sent) return offlineNote();
  outbox.sent = false; clearTimeout(actLockTimer); offlineNote();
  if(lastSent === outbox.key) lastSent = null;
  const d = tables.get(outbox.tid); if(d) drawQueued(d);
}
// a table state from the server: the turn moved on (the echo of the action, or the hand went on without it) → the
// outbox empties; still this turn, back online and not yet sent → it goes now
function outboxCheck(d){
  if(!outbox || outbox.tid !== d.tid) return;
  if(d.tid + ':' + d.handNo + ':' + d.seq !== outbox.key || d.actUid !== club.me.id || !d.legal || d.phase !== 'hand'){
    if(outbox.sent && outbox.at && actRtts.length < 20) actRtts.push(Date.now() - outbox.at);
    return outboxDrop();
  }
  if(!outbox.sent && live) sendAction(d, outbox.a);
}
// the action clock, plus the extra-time button: 3 cards a tournament (5 more at the final table), +30 seconds each
function turnBarHTML(d){
  const x = d.extras || 0;
  // one row: the extra-time button beside the clock bar, so the action bar takes less of a short screen
  return `<div class="turnrow">${demo ? '' : `<button type="button" class="xtime" data-xtime ${x ? '' : 'disabled'}>⏱ +30s<small>${x} left</small></button>`}<div class="turnbar"><i id="turnBar"></i><span id="turnSecs" class="num"></span></div></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-xtime]'); if(!b || b.disabled) return;
  send({ t: 'extend' }); b.disabled = true;
});
function drawActions(d, meSeat){
  if(BOARD) return boardActions(d, meSeat);
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
  if(BOARD) return boardSizing(d, meSeat);
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
  $('szBack').onclick = () => { drawActions(d, meSeat); queuedNote(d); };
  $('szGo').onclick = () => sendAction(d, { t: 'raise', to: v });
  set(d.street === 0 && presets.length > 2 ? presets[1][1] : presets[0][1]);
  tickClock(); queuedNote(d);
}
// ---------- the board's action row (UI_BOARD, Step-0 spec §3.5) ----------
// Fold red, Call blue with the amount, Raise gold "Raise to N" (the sizing it would open on), and "⋯" for the rest.
// The first tap on Raise opens the sizing (the presets over the row, the slider in it); the gold button then confirms.
const B_MORE = '<button type="button" class="b-more" data-bmore aria-label="Table menu" aria-haspopup="dialog">⋯<i class="b-unread" aria-hidden="true"></i></button>';
function boardPresets(d){
  const L = d.legal, bb = L.bb || d.blinds[1];
  const round = v => v >= L.maxTo ? L.maxTo : Math.round(v / 100) * 100;
  const potTo = f => round(L.cur + f * (L.pot + L.toCall));
  const raw = d.street === 0
    ? [['2.5 BB', round(2.5 * bb)], ['3 BB', round(3 * bb)], ['4 BB', round(4 * bb)], ['Pot', potTo(1)]]
    : [['⅓ Pot', potTo(1 / 3)], ['½ Pot', potTo(.5)], ['¾ Pot', potTo(.75)], ['Pot', potTo(1)]];
  const seen = new Set(), presets = [];
  for(const [l, v] of raw){ const x = Math.max(L.minTo, Math.min(L.maxTo, v)); if(x < L.maxTo && !seen.has(x)){ seen.add(x); presets.push([l, x]); } }
  presets.push(['All-in', L.maxTo]);
  return { presets, round, bb, first: d.street === 0 && presets.length > 2 ? presets[1][1] : presets[0][1] };
}
function boardActions(d, meSeat){
  const L = d.legal, c = $('controls');
  const allInOnly = L.canRaise && L.minTo >= L.maxTo, callAll = !L.canCheck && L.toCall >= meSeat.stack;
  const to = L.canRaise ? (allInOnly ? L.maxTo : boardPresets(d).first) : 0, word = allInOnly || to >= L.maxTo ? 'All-in' : L.isBet ? 'Bet' : 'Raise to';
  c.innerHTML = `${turnBarHTML(d)}<div class="act-main b-acts" style="--n:${(L.canCheck ? 1 : 2) + (L.canRaise ? 1 : 0)}">
    ${L.canCheck ? '' : '<button class="act-btn fold" id="aFold"><b>Fold</b></button>'}
    <button class="act-btn call" id="aCall"><b>${L.canCheck ? 'Check' : callAll ? 'All-in' : 'Call'}</b>${L.canCheck ? '' : ` <span class="num">${fmt(L.toCall)}</span>`}</button>
    ${L.canRaise ? `<button class="act-btn raise${word === 'All-in' ? ' allin' : ''}" id="aRaise"><b>${word}</b> <span class="num">${fmt(to)}</span></button>` : ''}${B_MORE}
  </div>`;
  if($('aFold')) $('aFold').onclick = () => sendAction(d, { t: 'fold' });
  $('aCall').onclick = () => sendAction(d, L.canCheck ? { t: 'check' } : { t: 'call' });
  if(L.canRaise) $('aRaise').onclick = allInOnly ? () => sendAction(d, { t: 'raise', to: L.maxTo }) : () => drawSizing(d, meSeat);
  tickClock();
}
function boardSizing(d, meSeat){
  const L = d.legal, c = $('controls'), { presets, round, bb, first } = boardPresets(d);
  const word = L.isBet ? 'Bet' : 'Raise to';
  c.innerHTML = `${turnBarHTML(d)}
    <div class="sizing b-sizing">
      <div class="amt"><small>${word}</small><b id="szAmt" class="num"></b><span id="szBB" class="num"></span></div>
      <div class="sz-presets">${presets.map(([l, v]) => `<button data-to="${v}">${l}</button>`).join('')}</div>
    </div>
    <div class="act-main b-acts b-sz"><button class="act-btn back" id="szBack" aria-label="Back"><b>‹</b></button>
      <div class="sz-slider"><button class="step" id="minus" aria-label="Less">−</button>
        <input type="range" id="raiseRange" aria-label="Amount" min="${L.minTo}" max="${L.maxTo}" step="1" value="${L.minTo}">
        <button class="step" id="plus" aria-label="More">+</button></div>
      <button class="act-btn raise" id="szGo"><b id="szGoLbl"></b> <span id="szGoAmt" class="num"></span></button></div>`;
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
  $('szBack').onclick = () => { drawActions(d, meSeat); queuedNote(d); };
  $('szGo').onclick = () => sendAction(d, { t: 'raise', to: v });
  set(first);
  tickClock(); queuedNote(d);
}
// "⋯": the table menu (§3.5): Chat (its unread dot shows on "⋯" too), extra time on your turn, the hand helper on or off,
// Sound (the break music, Issue #34), your hand history, leave the table. (Sit out next hand is on the spec's list but the
// app does not have it yet.)
let bHelperOff = false; try{ bHelperOff = localStorage.getItem('stacked:helper-board') === 'off'; }catch(e){}
function boardMenu(){
  if(!BOARD) return;
  const g = $('game'); let sh = $('bSheet');
  if(!sh){ sh = document.createElement('div'); sh.id = 'bSheet'; sh.className = 'b-sheet'; sh.hidden = true; g.appendChild(sh);
    sh.addEventListener('click', e => { if(e.target === sh) closeMenu(); }); }
  const d = tables.get(curTid()), mineT = d && d.actUid === club.me.id && d.legal && !d.result, x = d ? d.extras || 0 : 0;
  const row = (k, label, sub = '', extra = '') => `<button type="button" class="b-row" data-bm="${k}"${extra}><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;
  sh.innerHTML = `<div class="b-sheet-in" role="dialog" aria-modal="true" aria-label="Table menu"><b class="b-sheet-t">Table</b>
    ${row('chat', 'Chat', chatUnread ? 'New messages' : '', chatUnread ? ' data-unread' : '')}
    ${mineT && !demo ? row('time', 'Add 30 seconds', `${x} left`, x ? '' : ' disabled') : ''}
    ${row('helper', 'Hand helper', bHelperOff ? 'Off' : 'On', ` role="switch" aria-checked="${!bHelperOff}"`)}
    ${row('sound', 'Sound', SND.on() ? 'On · music on breaks' : 'Off', ` role="switch" aria-checked="${SND.on()}"`)}
    ${demo ? '' : row('hands', 'Hand history', 'Opens your hands in the lobby')}
    ${row('leave', 'Leave table', 'Back to the lobby')}
    <button type="button" class="b-row b-close" data-bm="close"><span>Close</span></button></div>`;
  sh.hidden = false; g.classList.add('b-menu');
  sh.querySelector('[data-bm]').focus({ preventScroll: true }); unscroll();
  sh.querySelectorAll('[data-bm]').forEach(b => b.onclick = () => {
    const k = b.dataset.bm; closeMenu();
    if(k === 'chat') openChat(true);
    else if(k === 'time') send({ t: 'extend' });
    else if(k === 'sound'){ SND.set(!SND.on()); tickClock(); }
    else if(k === 'helper'){ bHelperOff = !bHelperOff; try{ localStorage.setItem('stacked:helper-board', bHelperOff ? 'off' : ''); }catch(e){} renderTable(); }
    else if(k === 'hands'){ $('lobbyBtn').click(); tab = 'learn'; learnSeg = 'hands'; openHand = null; send({ t: 'hands' }); renderLobby(); }
    else if(k === 'leave') $('lobbyBtn').click();
  });
}
// the table never scrolls: iPhone Safari (and the in-app browser) scrolled the page to a focused sheet button, leaving
// the table half off the top and black below it until a reload (owner's iPhone, 2026-10-23)
function unscroll(){ if(scrollX || scrollY) scrollTo(0, 0); const e = document.scrollingElement; if(e && e.scrollTop) e.scrollTop = 0; }
function closeMenu(){ const sh = $('bSheet'); if(sh && !sh.hidden){ sh.hidden = true; $('game').classList.remove('b-menu'); const m = document.querySelector('[data-bmore]'); if(m) m.focus({ preventScroll: true }); unscroll(); } }
document.addEventListener('click', e => { if(e.target.closest('[data-bmore]')) boardMenu(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeMenu(); });
// ---------- the board's header and tournament sheet (UI_BOARD, Step-0 spec §4, phase B3) ----------
// Upright: one card (Level, the blinds with the ante under them, your rank, the clock with "32/48 players" under it)
// and the Lobby pill beside it. Sideways: one centred pill (Level · blinds · players · rank · clock in gold), Chat at
// the top left, Lobby at the top right. The card (or the pill) is one button: it opens the tournament sheet (the
// board's four tiles: Avg stack, Chip leader, Active tables, Spectators, then "Your place", then the sponsor). The
// collapsed bar carries players left and your rank only (owner's GO for B3; Muse's ruling on §9.6 keeps the rank).
// The sponsor intro (the start of the tournament, the end of a break) shows over the card for its seconds, as today.
// Sideways on a phone 740 px wide or more, while a tournament runs, the column beside the table stays (owner): the
// board's four tiles, the sponsor and prize under them, the info line and the action row at its foot.
if(BOARD){
  const g = $('game'), top = document.createElement('div');
  top.className = 'b-top'; top.id = 'bTop';
  top.innerHTML = `<div class="b-top-l"></div><div class="b-hudw"><button type="button" class="b-hud" id="bHud" data-bhud aria-haspopup="dialog">
    <span class="bh-lvl"><small>Level</small><b class="num" id="bhLvl"></b></span><span class="bh-bl"><b class="num" id="bhBl"></b><small class="num" id="bhAnte"></small></span>
    <span class="bh-rk" id="bhRk"><small><span class="bh-yr">Your rank</span><span class="bh-r">Rank</span></small><b class="num" id="bhRank"></b></span><span class="bh-wt" id="bhWt"><b class="num" id="bhWn"></b><small>watching</small></span><span class="bh-tm"><b class="num" id="bhTime"></b><small class="num" id="bhPl"></small></span>
    <span class="bh-idle" id="bhIdle"></span><span class="bh-go" aria-hidden="true">›</span></button></div><div class="b-top-r"></div>`;
  g.prepend(top);
  top.querySelector('.b-top-l').appendChild($('chatBtn'));
  top.querySelector('.b-top-r').appendChild($('lobbyBtn'));
  // (upright, "N watching" stands under the Lobby pill; sideways it is in the pill, after the players: owner's ruling,
  // Issue #32 item 11. The card's label reads it out, so this copy is hidden from screen readers)
  top.querySelector('.b-top-r').insertAdjacentHTML('beforeend', '<span class="b-watch num" id="bWatch" aria-hidden="true" hidden></span>');
  top.querySelector('.b-hudw').appendChild($('spn'));
  $('bHud').onclick = () => boardSheet();
}
// sideways, wide enough, a tournament running with its field: the column beside the table (owner's sponsor panel)
function boardCol(){
  const g = $('game'), T = club && club.tourney;
  const run = g.classList.contains('land') && !!field && !!T && T.status === 'running', on = run && scr().w >= 740;
  // (narrower sideways phones, under 740 wide, the iPhone with Safari's bars: a narrow column, the sponsor and the four
  // tiles compact, the action row staying full width under the table and the column; owner's ruling, 2026-10-23)
  // (under 600 wide, the iPhone SE sideways, the table needs the whole width for its nine seats: no column there)
  const nar = run && !on && scr().w >= 600;
  if(g.classList.contains('b-col') !== on || g.classList.contains('b-ncol') !== nar){
    g.classList.toggle('b-col', on); g.classList.toggle('b-ncol', nar); LOCK = null; GEO = null;
    // (decided after the table was laid out: lay it out again for the room it has now)
    requestAnimationFrame(() => { if(view === 'table') renderTable(); });
  }
  return on;
}
const bSet = (id, v) => { const e = $(id); if(e && e.textContent !== String(v)) e.textContent = v; };
let bTopKey = '';
function boardTop(T, d, me, brk){
  const top = $('bTop'); if(!top) return;
  if(!T){ top.classList.add('idle'); const t = tables.get(curTid()); bSet('bhIdle', t ? `Table ${t.n}` : 'Table'); $('bHud').setAttribute('aria-label', 'Table'); return; }
  top.classList.remove('idle');
  const [sb, bb, an] = E.levelFor(T.level, T.anteMode), f = qFacts(T, d, me), rank = f.rank && (me || field) ? f.rank : null;
  // (before the first whole-tournament update: the players left as the club card counts them, not this table's seats)
  if(!field && T.remaining) f.players = T.remaining;
  bSet('bhLvl', T.level + 1); bSet('bhBl', `${fmt(sb)}/${fmt(bb)}`); bSet('bhAnte', an ? `Ante ${fmt(an)}` : '');
  bSet('bhTime', $('cTime').textContent);
  const pl = brk ? `Break · ${f.players}/${f.total}` : `${f.players}/${f.total}<span class="bh-plw"> players</span>`;
  if($('bhPl').innerHTML !== pl) $('bhPl').innerHTML = pl;
  bSet('bhRank', rank ? ord(rank) : '');
  $('bhRk').hidden = !rank; top.classList.toggle('b-brk', !!brk);
  // how many are watching this table, live (the count the details sheet shows too)
  const wn = f.watchers == null ? null : f.watchers;
  bSet('bhWn', wn == null ? '' : wn); bSet('bWatch', wn == null ? '' : `${wn} watching`);
  $('bhWt').hidden = wn == null; $('bWatch').hidden = wn == null;
  const key = [T.level, sb, bb, an, f.players, f.total, rank, wn, brk ? 1 : 0, $('cTime').textContent.length, $('bHud').clientWidth, $('game').dataset.bcls, $('game').classList.contains('land')].join('|');
  if(key === bTopKey) return;
  bTopKey = key;
  $('bHud').setAttribute('aria-label', `Level ${T.level + 1}, blinds ${fmt(sb)}/${fmt(bb)}${an ? ', ante ' + fmt(an) : ''}. ${f.players} of ${f.total} players left.${rank ? ' Your rank ' + ord(rank) + '.' : ''}${wn != null ? ` ${wn} watching.` : ''} ${brk ? 'On a break' : 'Time left'} ${$('cTime').textContent}. Opens the tournament details.`);
  // (long blinds on a narrow phone: the values a size smaller, then the ante and the caption go)
  const card = $('bHud'); card.classList.remove('tight', 'snug', 'tighter');
  if(card.scrollWidth > card.clientWidth + 1) card.classList.add('tight');
  // (sideways, with "N watching" in the pill: the dots between the values closer first, before any caption goes)
  if(card.scrollWidth > card.clientWidth + 1) card.classList.add('snug');
  if(card.scrollWidth > card.clientWidth + 1) card.classList.add('tighter');
}
// the board's four tiles (the sheet; sideways, the column)
function boardTiles(f){
  const tile = (k, lbl, v, sub = '', aria = '') => `<div class="b-tile bt-${k}"${aria ? ` aria-label="${aria}"` : ''}><small>${lbl}</small><b class="num">${v}</b>${sub}</div>`;
  return `<div class="b-tiles">${tile('avg', 'Avg stack', fmt(Math.round(f.avg)))}`
    + tile('lead', 'Chip leader', f.leader ? (f.meLead ? 'You' : esc(f.leader.name)) : '–', f.leader ? `<span class="num">${fmt(f.leader.stack)}</span>` : '')
    + tile('tables', 'Active tables', f.tables, '', `${f.tables} tables`)
    // (the owner's word for it, tonight: "watching"; the board calls the tile Spectators)
    // (a count not known, the demo table: nobody is watching it, "0 watching", never a dash)
    + tile('watch', 'Spectators', f.watchers || 0, ' <span>watching</span>', `${f.watchers || 0} watching`) + '</div>';
}
function boardField(el, T){
  const d = tables.get(curTid()), me = [...tables.values()].flatMap(t => t.seats.filter(Boolean)).find(p => p.uid === club.me.id);
  const f = qFacts(T, d, me), html = boardTiles(f);
  if(el.dataset.bh !== html){ el.dataset.bh = html; el.innerHTML = html; }
  // (the sheet, open, follows too: it was drawn once when opened, so it went on showing the chip leader's count from
  // then while the column beside it moved on, 31,575 there and 31,350 here: owner's iPhone, 2026-10-23)
  const sh = $('bHudSheet');
  if(sh && !sh.hidden && !demo){ const t = sh.querySelector('.b-tiles'), pl = sh.querySelector('.b-place'), ph = boardPlace(T, f, me);
    if(t && t.outerHTML !== html) t.outerHTML = html;
    if(pl && ph && pl.outerHTML !== ph) pl.outerHTML = ph; }
}
// "Your place" in the sheet: your rank, your chips, in big blinds, against the average
function boardPlace(T, f, me){
  if(!(f.rank && me)) return '';
  const bb = E.levelFor(T.level, T.anteMode)[1], inBB = n => (n / bb >= 100 ? Math.round(n / bb) : Math.round(n / bb * 10) / 10).toLocaleString('en-US') + ' BB';
  const vsAvg = me.stack > f.avg * 1.05 ? 'above average' : me.stack < f.avg * .95 ? 'below average' : 'about average';
  return `<div class="b-place"><span>Your place</span><b class="num">${ord(f.rank)} of ${f.players}</b><small class="num">${fmt(me.stack)} · ${inBB(me.stack)} · ${vsAvg}</small></div>`;
}
// the tournament sheet (§4's expanded HUD): a tap on the card or the pill
function boardSheet(){
  const T = demo ? demo.T : club && club.tourney; if(!T || T.status !== 'running' && !demo) return;
  const g = $('game'), d = tables.get(curTid()), me = [...tables.values()].flatMap(t => t.seats.filter(Boolean)).find(p => p.uid === club.me.id), f = qFacts(T, d, me);
  const [sb, bb, an] = E.levelFor(T.level, T.anteMode);
  let sh = $('bHudSheet');
  if(!sh){ sh = document.createElement('div'); sh.id = 'bHudSheet'; sh.className = 'b-sheet b-hsheet'; sh.hidden = true; g.appendChild(sh);
    sh.addEventListener('click', e => { if(e.target === sh || e.target.closest('[data-bhclose]')) closeSheet(); }); }
  const sp = !demo && T.sponsor;
  sh.innerHTML = `<div class="b-sheet-in" role="dialog" aria-modal="true" aria-label="Tournament"><div class="bs-head"><b class="b-sheet-t">${esc(T.name || 'Demo table')}</b>
    <small class="num">Level ${T.level + 1} · ${fmt(sb)}/${fmt(bb)}${an ? ' · ante ' + fmt(an) : ''} · ${f.players}/${f.total} players</small></div>
    ${boardTiles(f)}
    ${boardPlace(T, f, me)}
    ${sp ? `<div class="b-pres">${sponsorHTML(sp, true, T.prize)}</div>` : T.prize && !demo ? `<div class="b-pres"><div class="side-prize"><small>Tonight's prize</small><b>${esc(T.prize)}</b></div></div>` : ''}
    <button type="button" class="b-row b-close" data-bhclose><span>Done</span></button></div>`;
  if(sp){ fillLogo(sh, sp); wireSponsor(sh, T); const b = sh.querySelector('[data-spbiz]'); if(b){ const go = b.onclick, key = b.onkeydown; b.onclick = () => { closeSheet(); go(); }; b.onkeydown = e => { if(e.key === 'Enter' || e.key === ' ') closeSheet(); key(e); }; } }
  sh.hidden = false; g.classList.add('b-menu');
  sh.querySelector('[data-bhclose]').focus({ preventScroll: true }); unscroll();
}
function closeSheet(){ const sh = $('bHudSheet'); if(sh && !sh.hidden){ sh.hidden = true; $('game').classList.remove('b-menu'); const c = $('bHud'); if(c) c.focus({ preventScroll: true }); unscroll(); } }
if(BOARD) document.addEventListener('keydown', e => { if(e.key === 'Escape') closeSheet(); });
const mmss = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// The tournament break card (every 10 levels, server/club.js): over the middle of the felt once this table's hand is over,
// with the time left and the sponsor if there is one. A hand still being played is never covered.
let brkKey = '';
// a break card's sponsor opens its Exchange page when tapped (only where members can see the Exchange); the player is
// brought back to their table when the break ends
let leftForSponsor = null;
const sponsorTap = () => !!(club && club.features && club.features.clubs);
function sponsorHTML(sp, big, prize){
  return `<div class="sp-card${big ? ' big' : ''}"${big && sponsorTap() ? ` role="button" tabindex="0" data-spbiz="${esc(sp.uid)}" aria-label="See ${esc(sp.name)} in the Exchange"` : ''}><span class="sp-logo" data-splogo></span><span class="sp-txt"><small>${big ? 'Presented by' : 'Tonight\'s tournament is presented by'}</small><b>${esc(sp.name)}</b>${big ? `<small class="sp-cat">${esc(sp.categoryLabel)}${sp.area ? ' · ' + esc(sp.area) : ''}</small>` : ''}${prize ? `<small class="sp-prize">Prize: ${esc(prize)}</small>` : ''}${big && sponsorTap() ? '<small class="sp-more">See their page ›</small>' : ''}</span></div>`;
}
// a tap (or Enter) on a sponsor with See their page opens it in the Exchange. On a break the player is brought back to
// their table when the break ends; in play (the side panel) they are asked first, since their hand plays on without them.
function wireSponsor(el, T){
  const b = el.querySelector('[data-spbiz]'); if(!b) return;
  const go = async () => {
    const t = club.tourney && club.tourney.id === T.id ? club.tourney : T, brk = t.paused || t.breakPending || t.breakUntil && t.breakUntil > Date.now() + clockSkew, d = tables.get(club.myTable);
    if(!brk && d && d.phase === 'hand' && d.seats.some(p => p && p.uid === club.me.id && p.inHand && !p.folded)
      && !await modal(`<h2>Open ${esc(T.sponsor.name)}'s page?</h2><p>Your hand plays on while you look: when it is your turn you check or fold. Come back with Go to my table.</p>`, [{ label: 'Stay here', value: false }, { label: 'Open their page', value: true, primary: true }])) return;
    if(brk) leftForSponsor = t.id;
    view = 'lobby'; showScreen('lobby'); window.BizClub.openBiz(b.dataset.spbiz);
  };
  b.onclick = go; b.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } };
}
function fillLogo(el, sp){
  const slot = el.querySelector('[data-splogo]');
  if(slot && window.BizClub && window.BizClub.logo) slot.replaceChildren(window.BizClub.logo({ uid: sp.uid, name: sp.name, logoV: sp.logoV }, 'sp'));
}
// (Issue #34: drawn from the server's break state alone, on every 'club' update and every clock tick, so it shows the moment
// the break begins for everyone, a fresh join or a reconnect included. It also shows at a table whose hand is over while
// the break waits for the last hand at another table: before, that table sat empty and looked frozen.)
function breakUI(T, d, now){
  const el = $('brk'); if(!el) return;
  const paused = T && T.paused && T.pausedBreakLeft > 0, pend = !!(T && T.breakPending && !T.breakUntil);
  const on = T && T.status === 'running' && (paused || pend || T.breakUntil && T.breakUntil > now);
  if(!on || (d && d.phase === 'hand')){ if(!el.hidden){ el.hidden = true; el.innerHTML = ''; brkKey = ''; $('tableArea').classList.remove('on-break'); } return; }
  $('tableArea').classList.add('on-break');
  const key = T.id + ':' + (pend ? 'w' : T.breakUntil || 'p') + ':' + (T.sponsor ? T.sponsor.uid : '') + ':' + (T.prize || '');
  if(key !== brkKey){
    const again = brkKey.startsWith(T.id + ':w:'); // the waiting card turning into the countdown: no second fade-in
    brkKey = key;
    const [sb, bb, an] = E.levelFor(T.level, T.anteMode);
    el.innerHTML = `<div class="brk-card${again ? ' still' : ''}"><span class="brk-eye"><i class="brk-dot" aria-hidden="true"></i>Tournament break</span>
      ${pend ? '<b class="brk-time brk-wait"><small class="brk-lead">On break</small>Starts when the last hand ends</b>'
        : '<b class="brk-time num"><small class="brk-lead">On break — back in</small> <span id="brkTime"></span></b>'}
      <small class="brk-sub">Play resumes by itself · Level ${T.level + 1} · ${fmt(sb)}/${fmt(bb)}${an ? ' · ante ' + fmt(an) : ''}</small>
      ${T.sponsor ? sponsorHTML(T.sponsor, true, T.prize) : T.prize ? `<small class="brk-prize">Prize: ${esc(T.prize)}</small>` : ''}</div>`;
    if(T.sponsor) fillLogo(el, T.sponsor);
    wireSponsor(el, T);
    el.hidden = false; el.dataset.sig = '';
  }
  // placed again whenever the seats move (the table can arrive after the card, or players get moved)
  const sig = [...document.querySelectorAll('#seats .seat')].map(q => q.offsetLeft + ',' + q.offsetTop).join(' ') + '|' + $('tableArea').clientWidth + 'x' + $('tableArea').clientHeight;
  if(el.dataset.sig !== sig){ el.dataset.sig = sig; fitBreak(el); }
  else if(el.dataset.fit === 'ok'){ const r = el.getBoundingClientRect(); if(brkSeats().some(q => r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom)) fitBreak(el); }
  if($('brkTime')) $('brkTime').textContent = paused ? 'Paused · ' + mmss(T.pausedBreakLeft) : mmss(T.breakUntil - now);
}
// Place the break card where it clears every player's seat: try a few heights on the felt, narrowing it between the seats
// on either side. On a felt too small for that it stays compact in the middle (there is no hand being played under it).
function fitBreak(el){
  const area = $('tableArea').getBoundingClientRect(), cx = area.left + area.width / 2;
  const seats = brkSeats();
  const hitsOf = r => seats.filter(q => r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom);
  for(const top of [45, 52, 58, 40, 64]){
    el.style.top = top + '%'; el.style.width = ''; el.classList.remove('tight');
    for(let pass = 0; pass < 4; pass++){
      const hits = hitsOf(el.getBoundingClientRect());
      if(!hits.length){ el.dataset.fit = 'ok'; return; }
      const half = Math.min(...hits.map(q => q.right <= cx ? cx - q.right : q.left >= cx ? q.left - cx : 0)) - 6;
      if(half < 85) break;
      el.style.width = Math.floor(2 * half) + 'px';
      if(2 * half < 250) el.classList.add('tight');
    }
  }
  el.style.top = ''; el.style.width = ''; el.classList.add('tight'); el.dataset.fit = 'small';
}
// each player's seat as drawn: the seat with its avatar, name plate and cards (they reach outside the seat's own box)
function brkSeats(){
  return [...document.querySelectorAll('#seats .seat')].map(s => [s, ...s.querySelectorAll('.av,.plate,.hole')].map(x => x.getBoundingClientRect()).filter(q => q.width)
    .reduce((a, q) => a ? { left: Math.min(a.left, q.left), top: Math.min(a.top, q.top), right: Math.max(a.right, q.right), bottom: Math.max(a.bottom, q.bottom) } : q, null)).filter(Boolean);
}
// The sponsor ribbon over the clock bar for the set seconds (never over the felt or the buttons). Each phone shows it the
// first time it opens a table of a running tournament (whenever that is: from the lobby, a slow load, late registration),
// and again when a break it saw ends. Kept in memory per tournament, so a reload shows it once more.
let spnKey = '', spnUntil = 0, spnBrk = null;
const spnSeen = new Set();
function sponsorUI(T, now, onTable){
  const el = $('spn'); if(!el) return;
  const sp = T && T.status === 'running' && T.sponsor;
  const brk = sp && (T.paused ? T.pausedBreakLeft > 0 : T.breakUntil && T.breakUntil > now);
  if(brk) spnBrk = T.id + ':' + T.breakUntil;
  else if(sp && onTable){
    // a break this phone saw ended (within the last minute), or this tournament's first look at a table
    const k = spnBrk && spnBrk.startsWith(T.id + ':') && !spnSeen.has(spnBrk) && now - (+spnBrk.split(':')[1] || 0) < 60000 ? spnBrk : !spnSeen.has(T.id) ? T.id : null;
    if(k){ spnSeen.add(k); spnSeen.add(T.id); spnBrk = null; spnUntil = now + (T.sponsorSec || 8) * 1000; }
  }
  const left = sp && onTable && !brk ? spnUntil - now : 0;
  if(left <= 0){ if(!el.hidden){ el.hidden = true; el.innerHTML = ''; spnKey = ''; } return; }
  const key = T.id + ':' + sp.uid + ':' + (T.prize || '');
  if(key !== spnKey){ spnKey = key; el.innerHTML = sponsorHTML(sp, false, T.prize); fillLogo(el, sp); el.hidden = false; }
  el.classList.toggle('out', left < 600);
}
// ---------- break music (Issue #34, owner-approved) ----------
// A short sting as the break begins, then a quiet lounge loop until play resumes, both played by the phone itself with
// WebAudio from the notes below: no audio file, nothing streamed (the code is cached with the app). Started and stopped
// only by the server's break state (tickClock), never by a game action, and nothing in the game waits for it. An
// enhancement only: browsers allow sound after the member's first tap, so the first tap anywhere unlocks it; where the
// phone mutes web audio (an iPhone on silent) there is simply no music. Sound in the table "⋯" menu turns it off, per
// member on this phone, on by default.
const SND = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, out = null, timer = null, key = '', bar = 0, barAt = 0;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const pref = () => 'sound:' + (club && club.me ? club.me.id : '');
  const on = () => local.get(pref(), 1) !== 0;
  // the first tap (or key) anywhere: create the context inside it and play one silent sample, which is what iOS needs
  const unlock = () => {
    if(!AC) return;
    try{
      if(!ctx){ ctx = new AC(); const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); }
      if(ctx.state === 'suspended') ctx.resume();
    }catch(e){ ctx = null; }
    if(ctx && ctx.state === 'running') ['pointerdown', 'keydown', 'touchend'].forEach(t => document.removeEventListener(t, unlock, true));
  };
  ['pointerdown', 'keydown', 'touchend'].forEach(t => document.addEventListener(t, unlock, { capture: true, passive: true }));
  // one soft electric-piano-like note: a sine with a quiet octave above, quick attack, long decay
  function note(m, t, dur, vel, dest){
    for(const [mul, g0] of [[1, 1], [2, .18], [3, .05]]){
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = mul === 1 ? 'triangle' : 'sine'; o.frequency.value = hz(m) * mul; o.detune.value = (mul === 1 ? 3 : -4);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * g0, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .05);
    }
  }
  function bass(m, t, dur, vel, dest){
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz(m);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .05);
  }
  // a soft brush on the off-beats: a short burst of filtered noise
  let noise = null;
  function brush(t, vel, dest){
    if(!noise){ noise = ctx.createBuffer(1, ctx.sampleRate * .25, ctx.sampleRate); const d = noise.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise;
    f.type = 'bandpass'; f.frequency.value = 6000; f.Q.value = .7;
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(.0001, t + .18);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + .25);
  }
  // the sting, about 3 seconds: a rising D major ninth, then the chord held and let go
  function sting(t, dest){
    [62, 69, 74, 78, 81].forEach((m, i) => note(m, t + i * .11, 1.6, .22, dest));
    [50, 57, 64, 66, 69, 74].forEach(m => note(m, t + .62, 2.6, .12, dest));
    bass(38, t + .62, 2.4, .3, dest);
    return t + 3.1;
  }
  // the loop: 84 beats a minute, four bars (Dmaj9, Bm9, Em9, A13), piano on 1 and the and of 2, bass on 1 and 3
  const BEAT = 60 / 84, CHORDS = [[38, [54, 57, 61, 64]], [47, [50, 54, 57, 61]], [40, [55, 59, 62, 66]], [45, [55, 59, 61, 66]]];
  function scheduleBar(t, i, dest){
    const [root, v] = CHORDS[i % 4];
    v.forEach(m => note(m, t, BEAT * 2.6, .1, dest)); v.slice(1).forEach(m => note(m, t + BEAT * 1.5, BEAT * 2.2, .06, dest));
    bass(root, t, BEAT * 1.8, .22, dest); bass(root + (i % 2 ? 5 : 7), t + BEAT * 2, BEAT * 1.6, .16, dest);
    brush(t + BEAT, .05, dest); brush(t + BEAT * 3, .05, dest);
  }
  function stop(){
    clearInterval(timer); timer = null; key = '';
    if(out && ctx){ const g = out; try{ g.gain.setTargetAtTime(0, ctx.currentTime, .04); }catch(e){} setTimeout(() => { try{ g.disconnect(); }catch(e){} }, 400); }
    out = null; $('game').dataset.music = '';
  }
  // k: this break; withSting: the break has only just begun (a member who opens the table later gets the loop only)
  function start(k, withSting){
    if(key === k) return true;
    if(!ctx || ctx.state !== 'running') return false; // not unlocked yet (no tap): tried again on the next tick
    stop(); key = k;
    out = ctx.createGain(); out.gain.value = .55; out.connect(ctx.destination);
    const sOut = ctx.createGain(); sOut.gain.value = .9; sOut.connect(out);
    const lOut = ctx.createGain(); lOut.gain.value = .3; lOut.connect(out); // the loop sits low, under any conversation
    let t = ctx.currentTime + .05;
    if(withSting) t = sting(t, sOut);
    const loopAt = t; bar = 0; barAt = t;
    // (the game's root says what is playing, for tests: sting, then loop)
    const pump = () => {
      if(!out) return;
      $('game').dataset.music = ctx.currentTime < loopAt ? 'sting' : 'loop';
      while(barAt < ctx.currentTime + 1.2){ scheduleBar(barAt, bar++, lOut); barAt += BEAT * 4; }
    };
    pump(); timer = setInterval(pump, 250);
    return true;
  }
  return { on, set(v){ local.set(pref(), v ? 1 : 0); if(!v) stop(); }, start, stop, unlock, playing: () => key };
})();
// called with every clock tick: music while this member's tournament is on a break (at the table, or on the sponsor's
// page from the break card), silence the moment it is not
function musicUI(T, now){
  const brk = BOARD && !demo && T && T.status === 'running' && !T.paused && T.breakUntil && T.breakUntil > now && !document.hidden && (view === 'table' || leftForSponsor === T.id);
  if(!brk || !SND.on()){ if(SND.playing()) SND.stop(); return; }
  SND.start(T.id + ':' + T.breakUntil, now - (T.breakAt || now) < 10000);
}
// ---------- quiet design: the whole tournament in one line, the details one tap away ----------
// Players still playing, the chip leader of all tables and your place among everyone (players' feedback, 2026-10-21),
// from the field every table update carries. Before the first update it shows this table only.
if(QUIET){
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'qline'; b.className = 'qline'; b.hidden = true;
  document.querySelector('#game .stats').after(b);
  b.onclick = () => qSheet();
}
const Q_CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
function qFacts(T, d, me){
  const seats = d ? d.seats.filter(Boolean) : [], top = seats.reduce((a, p) => !a || p.stack > a.stack ? p : a, null);
  const F = field, players = F ? F.players : seats.length;
  const leader = F ? F.leader : top && { name: top.name, stack: top.stack, table: d.n };
  const rank = F ? F.rank : me ? 1 + seats.filter(p => p.stack > me.stack).length : null;
  const bb = E.levelFor(T.level, T.anteMode)[1], avg = T.entrants * T.stack / Math.max(1, T.remaining);
  return { players, total: T.entrants || players, tables: F ? F.tables : 1, leader, rank, me, bb, avg, watchers: F ? watchersOf(d) : null, whole: !!F,
    meLead: !!(leader && me && rank === 1 && leader.name === me.name) };
}
function qLine(T, d, me){
  const el = $('qline'), f = qFacts(T, d, me);
  el.hidden = false;
  // (one markup for both headers: the one-row header's cell is drawn from it by quiet.css, so the line never changes
  // height when the header changes and the table is not laid out twice)
  el.innerHTML = `<span class="ql-a"><i class="ql-dot" aria-hidden="true"></i><b class="num">${f.players}</b><small>/${f.total}</small><small class="ql-w">&nbsp;players left</small></span>`
    // (collapsed: players left and your place only; the chip leader and the rest are in the sheet a tap away, Muse, Issue #31)
    + `<span class="ql-c${f.rank ? '' : ' w'}">${f.rank ? `<small class="ql-r">Your rank</small><b class="num">${ord(f.rank)}</b><small>of ${f.players}</small>` : '<small>Watching</small>'}${Q_CHEV}</span>`;
  el.setAttribute('aria-label', `${f.players} of ${f.total} players left. Chip leader ${f.leader ? (f.meLead ? 'you' : f.leader.name) + ', ' + fmt(f.leader.stack) + ' chips' : 'not known yet'}. ${f.rank ? 'You are ' + ord(f.rank) : 'You are watching'}. Tap for details.`);
}
function qSheet(){
  // (the demo table's tournament is its own: on it the sheet read the club's, which is none, and the tap did nothing)
  const T = demo ? demo.T : club && club.tourney, d = tables.get(watchTid || club.myTable); if(!T) return;
  const me = [...tables.values()].flatMap(t => t.seats.filter(Boolean)).find(p => p.uid === club.me.id), f = qFacts(T, d, me);
  const [sb, bb, an] = E.levelFor(T.level, T.anteMode), inBB = n => (n / bb >= 100 ? Math.round(n / bb) : Math.round(n / bb * 10) / 10).toLocaleString('en-US') + ' BB';
  const row = (k, v, sub) => `<div class="qs-row"><dt>${k}</dt><dd><b class="num">${v}</b>${sub ? `<small>${sub}</small>` : ''}</dd></div>`;
  const vsAvg = !me ? '' : me.stack > f.avg * 1.05 ? 'above average' : me.stack < f.avg * .95 ? 'below average' : 'about average';
  modal(`<div class="qsheet"><h2>${esc(T.name || 'Demo table')}</h2><p class="qs-sub num">Level ${T.level + 1} · ${fmt(sb)}/${fmt(bb)}${an ? ' · ante ' + fmt(an) : ''}</p><dl>`
    + row('Players left', `${f.players} of ${f.total}`, `${f.tables} ${f.tables === 1 ? 'table' : 'tables'}`)
    + (f.leader ? row('Chip leader', f.meLead ? 'You' : esc(f.leader.name), `${fmt(f.leader.stack)} · ${inBB(f.leader.stack)} · Table ${f.leader.table}`) : '')
    + (f.rank ? row('Your place', `${ord(f.rank)} of ${f.players}`, me ? `${fmt(me.stack)} · ${inBB(me.stack)} · ${vsAvg}` : '') : '')
    + row('Average stack', fmt(Math.round(f.avg)), inBB(f.avg))
    + (f.watchers != null ? row('Watching', f.watchers, 'Members looking on') : '')
    + (d ? row('This table', `Table ${d.n}`, `${d.seats.filter(Boolean).length} seated`) : '')
    + `</dl></div>`, [{ label: 'Done', value: true, primary: true }]);
}
function tickClock(){
  const T = demo ? demo.T : club && club.tourney;
  const now = Date.now() + clockSkew;
  musicUI(T, now);
  if(!T || T.status !== 'running' || view !== 'table'){ breakUI(null); sponsorUI(T, now, false); if(QUIET) $('qline').hidden = true; if(BOARD) boardTop(null); return; }
  const [sb, bb, an] = E.levelFor(T.level, T.anteMode), [nsb, nbb, nan] = E.levelFor(T.level + 1, T.anteMode);
  $('cLevel').textContent = T.level + 1;
  // in the one-row header of the shortest screens the ante takes the second line, in place of the next level
  // (and wherever the chat and Lobby buttons stand beside the clock: the tournament HUD upright on a phone)
  const one = $('game').classList.contains('row1') || QUIET || $('game').classList.contains('hud-in');   // the quiet design always keeps the clock row short
  $('cBlinds').textContent = `${fmt(sb)}/${fmt(bb)}${an && !one ? ' · ante ' + fmt(an) : ''}`;
  // (quiet, sideways: the clock has no second line, so the level the line's cell replaced is written here)
  const qLand = QUIET && $('game').classList.contains('row1') && $('game').classList.contains('land');
  $('cNext').textContent = qLand ? `Level ${T.level + 1}${an ? ' · Ante ' + fmt(an) : ''}` : one && an ? `Ante ${fmt(an)}` : `Next: ${fmt(nsb)}/${fmt(nbb)}${nan ? ' · ante ' + fmt(nan) : ''}`;
  const brk = !T.paused && T.breakUntil ? Math.max(0, T.breakUntil - now) : 0;
  const ms = T.paused ? T.pausedLeft : brk || Math.max(0, T.levelEndsAt - now);
  $('cTime').textContent = T.paused ? 'Paused' : T.breakPending ? 'Break' : mmss(ms);
  $('cTimeLbl').textContent = brk ? 'Break' : T.breakPending ? 'After this hand' : !T.paused && ms <= 0 ? 'Blinds up next hand' : QUIET && $('game').classList.contains('row1') ? `Level ${T.level + 1}` : 'Time left';
  breakUI(T, tables.get(watchTid || club.myTable), now); sponsorUI(T, now, true); fitSide();
  $('sAvg').textContent = fmt(T.entrants * T.stack / Math.max(1, T.remaining));
  const d = tables.get(watchTid || club.myTable);
  const all = [...tables.values()].flatMap(t => t.seats.filter(Boolean));
  const me = all.find(p => p.uid === club.me.id);
  // with the tournament HUD on, your rank is in it: the header shows your own stack instead (no number twice)
  const hud = !!(field && field.rank && me);
  $('sPosL').textContent = hud ? 'Your stack' : 'Your rank';
  $('sPos').textContent = hud ? fmt(me.stack) : me ? `${ord(1 + all.filter(p => p.stack > me.stack).length)} at table` : 'Watching';
  if(QUIET) qLine(T, d, me);
  if(BOARD) boardTop(T, d, me, brk);
  const bar = document.querySelector('.shotBar');
  if(bar && d && d.deadline){ const left = Math.max(0, d.deadline - now); bar.style.transform = `scaleX(${Math.min(1, left / d.bank)})`;
    // (the board: the gold ring round the avatar of the player to act empties clockwise as their time runs, §3.3)
    if(BOARD) bar.parentNode.style.setProperty('--f', Math.min(1, left / d.bank).toFixed(3)); }
  // (the board: the gold bar on the action row shows for the last 10 seconds; "⋯" carries the chat's unread dot)
  if(BOARD){ const tb = document.querySelector('#controls .turnbar'); if(tb && d && d.deadline) tb.classList.toggle('late', d.deadline - now <= 10000);
    document.querySelectorAll('[data-bmore]').forEach(m => m.classList.toggle('unread', !$('chatDot').hidden)); }
  const tbar = $('turnBar');
  if(tbar && d && d.deadline){ const left = Math.max(0, d.deadline - now), f = Math.min(1, left / d.bank); tbar.style.transform = `scaleX(${f})`; tbar.classList.toggle('low', !d.usingBank && left < 5000); tbar.classList.toggle('bank', !!d.usingBank); const ts = $('turnSecs'); if(ts) ts.textContent = (d.usingBank ? 'Extra time · ' : '') + Math.ceil(left / 1000) + 's'; }
}
setInterval(tickClock, 200);
// (the board: one layout a frame, however many resize events a turn brings, before the frame is drawn)
let RAFT = 0;
const renderSoon = () => { if(!RAFT) RAFT = requestAnimationFrame(() => { RAFT = 0; if(view === 'table') renderTable(); }); };
window.addEventListener('resize', () => { if(view === 'table') BOARD ? renderSoon() : renderTable(); });
// iPhone Safari reports a turned screen's new size late (after the resize/orientationchange events have fired), so
// the table was laid out for the old shape and kept it: look again a few times while the turn settles (for a few
// seconds: a busy phone can be slow to report it). A screen
// that only got taller or shorter (the toolbar, the keyboard) keeps its held layout; a turned one (a new width) is laid
// out anew.
let TURN = [], TURNW = scr().w;
function settleTurn(){
  TURN.forEach(clearTimeout);
  TURN = [60, 200, 450, 900, 1600, 2600].map((ms, i, all) => setTimeout(() => {
    const { w, h } = scr();
    if(view === 'table'){
      // the screen really turned (its width is not the one it settled at last time): while the turn settles, a
      // height arriving late decides the layout again too
      if(LOCK && w !== TURNW && (LOCK.iw !== w || LOCK.ih !== h)) LOCK = null;
      renderTable();
    }
    if(i === all.length - 1) TURNW = w;
  }, ms));
}
window.addEventListener('orientationchange', settleTurn);
if(screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', settleTurn);
window.addEventListener('resize', () => { if(scr().w !== TURNW) settleTurn(); });
// (the board: whenever the page itself takes a new width or turns, after the events and the timers above too, as
// Safari may lay the page out for the turned screen later still, the table is laid out again for it)
if(BOARD && window.ResizeObserver) new ResizeObserver(() => {
  const g = $('game'); if(view !== 'table' || !LOCK || !g.clientWidth) return;
  if(g.clientWidth !== LOCK.w || (g.clientWidth > g.clientHeight) !== LOCK.wide){ LOCK = null; renderSoon(); }
}).observe($('game'));
if(BOARD && window.visualViewport) window.visualViewport.addEventListener('resize', () => { if(scr().w !== TURNW) settleTurn(); });
// the layout measures text, so measure again once the web fonts have arrived (the table keeps its held height)
if(document.fonts) document.fonts.addEventListener('loadingdone', () => { SIZES.clear(); GEOS.clear(); DOCKS.clear(); GEO = null; if(view === 'table') renderTable(); });
// the table area also changes size without the window doing so (the action bar, the raise panel or the hand
// helper opening and closing): lay the seats and chips out again for the room that's really there
if(window.ResizeObserver) new ResizeObserver(() => { const a = $('tableArea'); if(view === 'table' && GEO && (GEO.W !== a.clientWidth || GEO.H !== a.clientHeight)) renderTable(); }).observe($('tableArea'));

function celebrate(){
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('confetti'), x = c.getContext('2d'); c.hidden = false; c.width = innerWidth; c.height = innerHeight;
  const cols = ['#f2a93b','#4a90f5','#e8ebf1','#4fd1a1','#9cc6ff'];
  const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .6, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * 6, w: 5 + Math.random() * 6, col: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now();
  (function frame(t){ x.clearRect(0, 0, c.width, c.height); ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.r += .1; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.col; x.fillRect(-p.w/2, -p.w/4, p.w, p.w/2); x.restore(); }); if(t - t0 < 4500) requestAnimationFrame(frame); else c.hidden = true; })(t0);
}


const on2 = (id, f) => { const el = $(id); if(el) el.onclick = f; };
function toast(text, ms, onTable){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  // (about the table, while it shows: on the felt's open middle, below the board, above your own cards)
  const area = onTable && !$('game').hidden && $('tableArea').getBoundingClientRect();
  if(area && area.height){ t.classList.add('on-table'); t.style.top = Math.round(area.top + area.height * .62) + 'px'; }
  document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2600);
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
  const list = r.hands.slice().reverse().map(h => `<details class="fh ${h.match ? '' : 'bad'}"><summary>${h.match ? '✓' : '✗'} Table ${esc(String(h.tid).split('-').pop())} · hand ${h.hand}${h.void ? ` <em class="void">${h.void === 'interrupted' ? 'Interrupted by a server restart — replayed' : 'Unfinished — no result'}</em>` : ''} <span>${h.board.map(cardTxt).join('')}</span></summary>
    <div>${h.players.map(p => `<div>${esc(p.name)} ${p.cards.map(cardTxt).join('')}</div>`).join('')}
    <small>${h.round ? `drand round <a href="${esc(rep.beaconUrl + h.round)}" target="_blank" rel="noopener">${h.round}</a>` : 'public number unavailable, local random used'}</small></div></details>`).join('');
  modal(`<h2>${allOk ? '✅ Every hand was dealt fairly' : r.hands.length ? '⚠️ Something doesn\'t match' : 'No hands recorded'}</h2>
    <p class="${r.sealOk ? 'good' : 'bad'}">${r.sealOk ? '✓' : '✗'} The revealed secret matches the seal shown before the first hand.</p>
    <p class="${r.bad ? 'bad' : 'good'}">${r.bad ? '✗' : '✓'} ${r.ok} of ${r.hands.length} hands match their deck exactly${r.bad ? `, ${r.bad} don't` : ''}.</p>
    ${beacons}${r.void ? `<p class="note">${r.void} deal(s) were cut off mid-hand (shown as interrupted). They still match the seal; no chips were decided by them, and the hand was replayed under the same number.</p>` : ''}${r.local ? `<p class="note">${r.local} hand(s) were dealt while the public randomness service couldn't be reached. Those still match the seal.</p>` : ''}
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
  const A = avatarPx(msg.from), Z = avatarPx(msg.to);
  const [ax, ay] = A ? [A.x, A.y] : pctToPx(a), [zx, zy] = Z ? [Z.x, Z.y] : pctToPx(z), size = Z ? Z.size : 40;
  const messy = msg.item === 'egg' || msg.item === 'tomato';
  if(reducedMotion()){ if(messy) splatOn(msg.item, zx, zy, size, msg.to); return; }
  const el = document.createElement('div'); el.className = 'throw'; el.textContent = THROW_ICONS[msg.item] || '❓';
  el.style.left = ax + 'px'; el.style.top = ay + 'px';
  $('fx').appendChild(el);
  const arc = Math.min(90, 40 + Math.hypot(zx - ax, zy - ay) * .2);
  el.animate([{ transform: 'translate(-50%,-50%) scale(.6) rotate(0)', offset: 0 },
    { transform: `translate(calc(-50% + ${(zx - ax) / 2}px), calc(-50% + ${(zy - ay) / 2 - arc}px)) scale(1.35) rotate(200deg)`, offset: .5 },
    { transform: `translate(calc(-50% + ${zx - ax}px), calc(-50% + ${zy - ay}px)) scale(${messy ? .9 : 1.1}) rotate(${messy ? 380 : 400}deg)`, offset: 1 }], { duration: 750, easing: 'ease-in-out', fill: 'forwards' })
    .finished.then(() => {
      if(messy){ el.remove(); splatOn(msg.item, zx, zy, size, msg.to); }
      else { el.classList.add('splat'); setTimeout(() => el.remove(), 1400); }
    }).catch(() => el.remove());
}
// A lumpy blob outline for a splat, centred on 0,0 in a 100x100 box.
function blobPath(r, lumps, jit){
  const pts = Array.from({ length: lumps }, (_, i) => { const t = i / lumps * Math.PI * 2, k = r * (1 - jit + Math.random() * jit * 2); return [Math.cos(t) * k, Math.sin(t) * k]; });
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], f = n => n.toFixed(1);
  let dpath = `M${f(mid(pts[lumps - 1], pts[0])[0])} ${f(mid(pts[lumps - 1], pts[0])[1])}`;
  pts.forEach((p, i) => { const m = mid(p, pts[(i + 1) % lumps]); dpath += ` Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`; });
  return dpath + 'Z';
}
// Egg: the shell cracks, white and yolk spread over the avatar and a drip runs down. Tomato: it bursts
// and splatters. Stays about 1.6 s, then fades. Drawn on the effects layer, so the table never waits.
function splatOn(item, x, y, size, uid){
  const fx = $('fx'); if(!fx) return;
  fx.querySelectorAll(`.splatfx[data-uid="${CSS.escape(uid)}"]`).forEach(e => e.remove());
  const egg = item === 'egg', el = document.createElement('div');
  el.className = `splatfx ${egg ? 'egg' : 'tomato'}`; el.dataset.uid = uid;
  const S = Math.round(size * 1.9);
  el.style.cssText = `left:${x}px;top:${y}px;width:${S}px;height:${S}px`;
  const drops = Array.from({ length: egg ? 4 : 7 }, (_, i) => {
    const t = (i / (egg ? 4 : 7) + Math.random() * .1) * Math.PI * 2, d = 36 + Math.random() * 12, r = egg ? 3 + Math.random() * 3 : 3 + Math.random() * 4;
    return `<circle class="drop" cx="${(Math.cos(t) * d).toFixed(1)}" cy="${(Math.sin(t) * d).toFixed(1)}" r="${r.toFixed(1)}" style="--dx:${(-Math.cos(t) * 14).toFixed(1)}px;--dy:${(-Math.sin(t) * 14).toFixed(1)}px"/>`;
  }).join('');
  el.innerHTML = egg
    ? `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g class="spread"><path class="white" d="${blobPath(30, 9, .22)}"/><path class="yolk" d="${blobPath(12, 7, .15)}"/><ellipse class="shine" cx="-4" cy="-5" rx="4" ry="2.5"/></g><g class="drops">${drops}</g>
        <path class="drip" d="M-3 8 C-4 22 -5 30 -1 36 C3 40 5 34 4 24 C3 16 3 10 3 8Z"/>
        <path class="shell s1" d="M-14 -4 L-9 -14 L-6 -7 L-1 -15 L2 -6 L-2 -2 Z"/><path class="shell s2" d="M6 2 L14 -6 L13 3 L19 6 L10 10 Z"/><path class="shell s3" d="M-12 8 L-5 5 L-7 12 L-13 14 Z"/></svg>`
    : `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g class="spread"><path class="pulp" d="${blobPath(31, 11, .3)}"/><path class="juice" d="${blobPath(19, 8, .25)}"/>
        <path class="gel" d="${blobPath(9, 6, .3)}"/><ellipse class="seed" cx="-4" cy="-2" rx="1.6" ry="1"/><ellipse class="seed" cx="3" cy="2" rx="1.6" ry="1"/><ellipse class="seed" cx="1" cy="-5" rx="1.6" ry="1"/><path class="skin k1" d="M-24 -10 Q-18 -20 -8 -22 Q-14 -14 -18 -6Z"/><path class="skin k2" d="M14 16 Q24 10 26 -2 Q20 6 10 10Z"/></g><g class="drops">${drops}</g>
        <path class="drip" d="M-5 10 C-6 24 -6 31 -3 35 C0 38 2 32 1 22 C1 16 0 12 0 10Z"/></svg>`;
  fx.appendChild(el);
  const seat = $('tableArea').querySelector(`.seat[data-uid="${CSS.escape(uid)}"] .av`);
  if(seat && !reducedMotion()) seat.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-3px,1px) rotate(-6deg)' }, { transform: 'translate(3px,0) rotate(5deg)' }, { transform: 'translate(0,0)' }], { duration: 320, easing: 'ease-out' });
  setTimeout(() => el.classList.add('fade'), 1600);
  setTimeout(() => el.remove(), 2100);
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
  $('chatNote').textContent = off ? 'The organizer turned table chat off.' : muted ? 'The organizer muted your chat.' : !seated && !club.me.owner ? 'Only players at this table can chat. You can read along.' : '';
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
// iPhone Safari scrolls the page up to make room for the keyboard and can leave it there after the keyboard
// closes (the whole table then sits too high, cut off at the top): put it back when the chat box loses focus
// with the keyboard open, keep the chat sheet just above it (the visible part of the page), without touching the table
if(window.visualViewport){
  const vv = window.visualViewport, place = () => { const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)); $('chatSheet').style.bottom = kb ? kb + 'px' : ''; };
  vv.addEventListener('resize', place); vv.addEventListener('scroll', place);
}
$('chatInput').addEventListener('blur', () => setTimeout(() => { if(window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0); }, 60));
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
// The board (Issue #32 item 14, owner): a coach tip never covers your cards, the board, the pot or the action buttons.
// It is a slim one-line banner in the dock's own band, where the helper's line and the "Free social play" notice
// stand (the dock's height is kept for them, so it sits over no seat, card, chip or button). One line: its title and
// the start of its text; a tap opens the whole tip in the band, a second tap puts it away; it goes by itself after 6 s
// (8 s for a mindset tip), or as soon as it is your turn. A tip that comes while it is your turn waits until your
// turn is over: nothing new appears while you decide.
let tipWait = null;
function showTip(kind, title, text){
  const el = $('coachTip'); clearTimeout(tipTimer);
  if(BOARD){
    const d = tables.get(watchTid || (club && club.myTable));
    if(d && d.actUid === club.me.id && !d.result){ tipWait = [kind, title, text]; return; }
    el.className = 'coachtip b-tip ' + kind; el.hidden = false; el.setAttribute('role', 'status');
    el.setAttribute('aria-label', `Coach: ${title}. ${text}`);
    el.innerHTML = `<span class="ct-ic" aria-hidden="true">${NOTE_ICON[kind] || '💡'}</span><span class="ct-tx"><b>${esc(title)}</b> <span>${esc(text)}</span></span>`;
    tipTimer = setTimeout(() => { el.hidden = true; }, kind === 'mind' ? 8000 : 6000);
    return;
  }
  el.className = 'coachtip ' + kind; el.hidden = false;
  el.innerHTML = `<span class="ct-ic">${NOTE_ICON[kind] || '💡'}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div><button aria-label="Close">×</button>`;
  tipTimer = setTimeout(() => { el.hidden = true; }, kind === 'mind' ? 14000 : 10000);
}
$('coachTip').onclick = () => { const el = $('coachTip');
  // (the board: the first tap opens the whole tip, for a little longer; the second puts it away)
  if(BOARD && !el.classList.contains('open')){ el.classList.add('open'); clearTimeout(tipTimer); tipTimer = setTimeout(() => { el.hidden = true; }, 10000); return; }
  el.hidden = true; clearTimeout(tipTimer); };
// the coach's tips show in the bar under the table (where the helper and the action buttons are), never over the
// cards and seats; a tip is put away when it's your turn
$('dock').appendChild($('coachTip'));
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
let helpOpen = null;
let helperMin = false; try{ helperMin = localStorage.getItem('stacked:helper') === 'min'; }catch(e){}
// (on the oval table, upright on a phone, the helper is one small line, the hand and the chance to win, unless you
// open it: the room goes to the table, as WPT and WSOP draw it)
let helperBig = false; try{ helperBig = localStorage.getItem('stacked:helper-oval') === 'open'; }catch(e){}
const ovalScreen = () => { const g = $('game'); return g.clientWidth < 470 && !g.classList.contains('land'); };
const hMin = () => BOARD ? false : ovalScreen() ? !helperBig : helperMin;
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
  return drawHTML(parts, outs, board.length);
}
// The helper's two hints as markup built only from fixed words and numbers (no names or other user text), so the
// layout test can ask for their longest forms too. A draw's chance to hit is written out in full, and as a short
// "~N%" that short screens show instead, so the hint fits the helper's two lines there.
function drawHTML(parts, outs, boardLen){
  const pct = boardLen === 3 ? Math.min(outs * 4, 100) : outs * 2;
  return `${esc(parts.join(' + '))} · ${outs} outs<span class="h-odds"> (about ${pct}% to hit${boardLen === 3 ? ' by the river' : ' on the river'})</span><span class="h-odds-s"> · ~${pct}%</span>`;
}
// your turn's advice from your chance to win (eq) and what calling costs; '' when there's nothing to say
function adviceFor(eq, L, boardLen){
  if(eq == null || !L) return ['', ''];
  const have = `<span class="h-have">, you have ${Math.round(eq * 100)}%</span>`;
  if(!L.canCheck){
    const need = L.toCall / (L.pot + L.toCall), n = Math.round(need * 100);
    if(eq >= need + .05) return [`Call needs ${n}%${have}: calling pays.${eq > .65 ? ' You can raise for value.' : ''}`, 'good'];
    if(eq >= need - .03) return [`Close: call needs ${n}%${have}.`, 'mid'];
    return [`Call needs ${n}%${have}: folding is fine.`, 'bad'];
  }
  return [eq > .6 ? 'Strong: bet for value.' : eq > .4 ? 'Medium: a small bet or a check both work.' : (boardLen === 5 ? 'Weak: check, no need to put more in.' : 'Weak: check and see a free card.'),
    eq > .6 ? 'good' : eq > .4 ? 'mid' : 'bad'];
}
// read-only, for the layout test: the hints' markup for any inputs
window.__helperText = Object.freeze({ adviceFor, drawHTML });
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
  const on = T && T.helper !== false && me && me.inHand && !me.folded && mine && d.phase === 'hand' && !d.result && !(BOARD && bHelperOff);
  if(!on){ el.hidden = true; return; }
  const board = d.board.map(cs), nOpp = d.seats.filter(p => p && p.inHand && !p.folded && p.uid !== club.me.id).length;
  if(!nOpp){ el.hidden = true; return; }
  const key = `${d.tid}:${d.handNo}:${d.board.join('')}:${nOpp}`;
  const eq = equityFor(key, mine, board, nOpp);
  const name = board.length ? madeName(mine, board) : preName(mine);
  const draw = drawsOf(mine, board);
  const L = d.legal && d.actUid === club.me.id ? d.legal : null;
  const [advice, tone] = adviceFor(eq, L, board.length);
  const pct = eq == null ? '…' : Math.round(eq * 100) + '%';
  const bar = eq == null ? 0 : Math.round(eq * 100);
  el.hidden = false;
  // (the board: the info line over the action row (§3.5, Muse's ruling §9.2): your hand and your chance to win, then the
  // advice, as one short paragraph; "⋯" turns it off)
  if(BOARD){ if(el.parentNode !== $('dock')) $('dock').insertBefore(el, $('playLine'));
    el.className = 'helper b-info'; el.onclick = null;
    el.innerHTML = `<span class="h-top"><b class="h-name">${esc(name)}</b> <span class="h-eq ${eq == null ? '' : eq > .5 ? 'good' : eq > .3 ? 'mid' : 'bad'}">${pct}<small> to win vs ${nOpp}</small></span></span>${advice ? ` <span class="h-line ${tone}">${advice}</span>` : draw ? ` <span class="h-line">${draw}</span>` : ''}`;
    return; }
  // (in the WPT column the helper is one small line, the hand and the chance to win; a tap opens the whole helper
  // just above the column, and another tap, or the next hand, closes it)
  const wpt = $('game').classList.contains('wpt'), hk = d.tid + ':' + d.handNo;
  // (on the WPT table the helper is a small line under the board, in the room the layout keeps for the line there, as
  // WPT shows the pot; elsewhere it is in the dock above the buttons)
  const home = wpt ? $('tableArea').querySelector('.center') : $('dock');
  if(el.parentNode !== home) wpt ? home.appendChild(el) : home.insertBefore(el, $('playLine'));
  if(wpt){ const m = $('msg'); el.style.marginTop = (m.textContent.trim() ? 10 + m.offsetHeight : 6) + 'px'; }
  if(helpOpen && helpOpen !== hk) helpOpen = null;
  const small = wpt ? !helpOpen : hMin();
  el.className = 'helper' + (small ? ' min' : '') + (wpt && helpOpen ? ' open' : '');
  el.innerHTML = `<div class="h-top"><b class="h-name">${esc(name)}</b><span class="h-eq ${eq == null ? '' : eq > .5 ? 'good' : eq > .3 ? 'mid' : 'bad'}"><i class="h-w">Win</i>${pct}<small> to win vs ${nOpp}</small></span>${wpt ? `<i class="h-more" aria-hidden="true">${helpOpen ? '×' : 'ⓘ'}</i>` : ''}</div>
    ${small ? '' : `<div class="h-bar"><i style="width:${bar}%"></i></div>
    ${advice ? `<div class="h-line ${tone}">💡 ${advice}</div>` : draw ? `<div class="h-line">🎯 ${draw}</div>` : ''}`}`;
  el.onclick = () => { if(wpt){ helpOpen = helpOpen ? null : hk; return renderTable(); }
    if(ovalScreen()){ helperBig = !helperBig; try{ localStorage.setItem('stacked:helper-oval', helperBig ? 'open' : ''); }catch(e){} return renderTable(); }
    helperMin = !helperMin; try{ localStorage.setItem('stacked:helper', helperMin ? 'min' : ''); }catch(e){} renderTable(); };
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
    result: res ? { lines, winCards: winP && winP.best ? winP.best.map(E.cardStr) : [], showdown: !!res.showdown } : null, note: live ? '' : demo.note || ''
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

// Staging copy: a banner on every screen so test data is never mistaken for the real club.
if(/staging/i.test(location.hostname)){ const b = document.createElement('div'); b.className = 'staging-banner'; b.textContent = 'STAGING · test data only'; document.body.appendChild(b); }
