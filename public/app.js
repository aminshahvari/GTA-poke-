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
const showScreen = id => { ['auth','lobby','game'].forEach(s => $(s).hidden = s !== id); keepAwake(id === 'game'); if(id !== 'lobby') document.querySelector('.app').classList.remove('wide'); };
// keep the phone screen on while a table is open, so it doesn't lock and sit you out between hands
let wakeLock = null, wantAwake = false;
async function keepAwake(on){
  wantAwake = on;
  try{
    if(on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible'){ wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if(!on && wakeLock){ const w = wakeLock; wakeLock = null; await w.release(); }
  }catch(e){ wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible') return;
  if(wantAwake) keepAwake(true);
  // coming back to the app counts as being back at the table
  if(club) send({ t: 'back' });
});

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
let editingT = false, tab = 'event', view = 'lobby', watchTid = null, lastSent = null, seen = new Set(), lastStatus = null, lastMyTable = null, clockSkew = 0;
// Business Club (public/business.js) gets the few app helpers it needs; it builds its own DOM with textContent
window.BizClub.init({ post, toast, token: () => local.get('token', ''), clubHeader, me: () => club.me, tab: () => tab,
  openTab: t => { tab = t; view = 'lobby'; showScreen('lobby'); renderLobby(); $('lobbyBody').scrollTop = 0; },
  confirm: (title, text, ok) => modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p>`, [{ label: 'Cancel', value: false }, { label: esc(ok), value: true, primary: true }]) });
function connect(){
  const token = local.get('token', null);
  if(joinSlug) return clubJoinScreen();
  if(!token && location.pathname.startsWith('/join/')) return welcomeScreen();
  if(!token){ return post('/api/status', {}).then(s => s.hasOwner ? welcomeScreen() : authScreen('setup')).catch(() => welcomeScreen()); }
  if(ws) try{ ws.close(); }catch(e){}
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => { retry = 0; let dev = local.get('device', null); if(!dev){ dev = Math.random().toString(36).slice(2) + Date.now().toString(36); local.set('device', dev); } ws.send(JSON.stringify({ t: 'hello', token, device: dev, club: local.get('club', null) || undefined })); };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if(m.t === 'auth'){ if(!m.ok){ local.del('token'); ws.onclose = null; ws.close(); authScreen('login'); if(m.reason === 'noclub') modal('<h2>Your club has closed</h2><p>The club you belonged to is no longer on Blindrise, so there is nothing to open with this account right now. A club owner can invite you with a new link.</p>', [{ label: 'OK', value: 1, primary: true }]); } else { $('offline').hidden = true; if(view === 'lobby') showScreen('lobby'); if(watchTid) send({ t: 'watch', tid: watchTid }); send({ t: 'back' }); } return; }
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
  // 4001: the server handed over to a new instance (deploy), so come back fast instead of backing off
  ws.onclose = e => { $('offline').hidden = false; setTimeout(connect, e.code === 4001 ? 250 + Math.random() * 750 : Math.min(8000, 500 * 2 ** retry++)); };
}
const send = m => { if(ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

function onClub(c){
  club = c; clockSkew = c.now - Date.now();
  if(local.get('askRemind', 0)){ local.del('askRemind'); if(c.tourney && c.tourney.status === 'registering' && c.tourney.regs.includes(c.me.id)){ setTimeout(() => toast(`You're signed up for ${c.tourney.name}.`), 300); setTimeout(offerReminder, 1500); } }
  if(c.clubSwitching) clubSwitching(c);
  $('meChip').innerHTML = `${c.clubSwitching && c.clubs.length > 1 ? `<button class="club-btn" id="clubBtn" aria-label="Switch club">${esc(c.club.name)}</button>` : ''}<button class="me-btn" id="meBtn">${avHTML(c.me.id, c.me.name, 'sm')}<span>${esc(c.me.name)}</span></button><button class="back" id="outBtn">Sign out</button>`;
  $('meBtn').onclick = () => openProfile(c.me.id);
  if($('clubBtn')) $('clubBtn').onclick = pickClub;
  $('outBtn').onclick = async () => { if(await modal('<h2>Sign out?</h2><p>You can sign back in with your name and PIN.</p>', [{ label:'Stay', value:false }, { label:'Sign out', value:true, primary:true }])){ local.del('token'); location.href = '/'; } };
  $('dirTab').hidden = !c.me.owner;
  const st = c.tourney && c.tourney.status;
  if(st === 'finished' && lastStatus === 'running'){ view = 'lobby'; watchTid = null; showScreen('lobby'); tab = 'event'; celebrate(); }
  lastStatus = st;
  if(c.suspended && view === 'table'){ view = 'lobby'; watchTid = null; tables.clear(); showScreen('lobby'); }
  if(c.myTable && c.myTable !== lastMyTable && st === 'running'){ watchTid = c.myTable; view = 'table'; seen = new Set(); showScreen('game'); send({ t: 'watch', tid: watchTid }); }
  lastMyTable = c.myTable;
  const typing = document.activeElement && $('lobbyBody').contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if(view === 'lobby'){ showScreen('lobby'); if(tab !== 'learn' && tab !== 'biz' && !typing) renderLobby(); } else renderTable();
}
// club switching: remember which club this is; a signed-in member who opens another club's invite link joins it
let joinTried = false;
function clubSwitching(c){
  local.set('club', c.club.id);
  if(joinTried || !location.pathname.startsWith('/join/')) return;
  joinTried = true;
  const code = location.pathname.slice(6);
  history.replaceState(null, '', '/');
  post('/api/joinInvite', { code }).then(r => { if(r.club !== c.club.id){ local.set('club', r.club); location.replace('/'); } })
    .catch(e => modal(`<h2>That invite didn't work</h2><p>${esc(e.message)}</p>`, [{ label: 'OK', value: 1, primary: true }]));
}
async function pickClub(){
  const id = await modal(`<h2>Your clubs</h2><p>Same name and PIN everywhere. Each club has its own members, tournaments and Exchange.</p><div class="club-list">${club.clubs.map(x => `<button class="club-pick${x.id === club.club.id ? ' on' : ''}" data-v="${esc(x.id)}">${esc(x.name)}${x.suspended ? ' <small class="cs-tag">Suspended</small>' : ''}</button>`).join('')}</div>`, [{ label: 'Close', value: null }]);
  if(id && id !== club.club.id){ local.set('club', id); location.replace('/'); }
}
function onTable(d){ if(view === 'table' && d.tid === (watchTid || club.myTable)) renderTable(); }

// ---------- lobby ----------
$('lobbyBody').addEventListener('click', e => {
  if(e.target.closest('[data-kick]')) return;
  const t = e.target.closest('[data-prof]'); if(t) openProfile(t.dataset.prof);
});
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(!b) return; tab = b.dataset.tab; if(tab === 'learn'){ openHand = null; send({ t: 'hands' }); } if(tab === 'biz') window.BizClub.open('list'); renderLobby(); $('lobbyBody').scrollTop = 0; });
const nameOf = uid => { const m = club.members.find(x => x.id === uid); if(m) return m.name; for(const h of club.history) for(const r of h.results) if(r.uid === uid) return r.name; return 'Former member'; };
const pchip = (uid, removable) => `<span class="pchip ${uid === club.me.id ? 'me' : ''}" data-prof="${esc(uid)}">${avHTML(uid, nameOf(uid), 'xs')}${esc(nameOf(uid))}${removable ? `<button data-kick="${esc(uid)}" aria-label="Remove from tournament">×</button>` : ''}</span>`;
const when = ms => new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function renderLobby(){
  if(!club) return;
  const body = $('lobbyBody');
  $('tabs').hidden = !!club.suspended;
  if(club.suspended){ document.querySelector('.app').classList.remove('wide'); body.innerHTML = suspendedHTML(); wireLobby(); return; }
  // Business Club and Opportunity Club stay hidden from members until the owner opens them (Director tab); the owner can always preview
  const clubsOn = !!(club.features && club.features.clubs), clubsVisible = clubsOn || club.me.owner;
  const bizTab = document.querySelector('#tabs [data-tab="biz"]');
  bizTab.hidden = !clubsVisible;
  if(tab === 'biz' && !clubsVisible) tab = 'event';
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
// ---------- Home: Poker, then Business, then Opportunities ----------
// The tournament card always comes first. Business and Opportunities show only when the clubs are open (the owner always
// sees them) and never while you're seated in a running tournament: then Home is poker only.
const SECTIONS = [['poker', 'spade', 'Poker'], ['biz', 'briefcase', 'Exchange'], ['opp', 'spark', 'Bulletin']];
function homeNavHTML(){
  return `<nav class="home-nav" aria-label="Home sections">${SECTIONS.map(([k, ic, l], i) => `<button type="button" class="hn-${k}" data-hs="${k}" aria-current="${i === 0}">${Icons.svg(ic)}<span>${l}</span></button>`).join('')}</nav>`;
}
function pokerHeadHTML(){
  const st = club.tourney && club.tourney.status;
  const sub = 'Poker · ' + (st === 'registering' ? 'Registration open' : st === 'running' ? 'Live now' : 'Club tournaments');
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
  const extra = document.createElement('div'); extra.innerHTML = (clubsOn ? '' : comingHTML()) + (club.me.owner || seated ? '' : demoCard()) + picNudgeHTML();
  body.innerHTML = memberHomeHTML(clubsOn || club.me.owner) + blindriseHTML() + openClubHTML() + (showClubs ? homeNavHTML() : '') + pokerHeadHTML();
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
    <div class="lx-brandline"><span class="eyebrow">Blindrise · Private Members Club</span><span class="lx-lounge">The Lounge</span></div>
    <div class="lx-id">${avHTML(me.id, me.name, 'big')}<div class="lx-id-t"><span class="lx-greet">${greet},</span><h2>${esc(me.name.split(' ')[0])}</h2>
      <div class="lx-id-meta">${me.owner ? '<span class="lx-role">Club director</span>' : '<span class="lx-role">Member</span>'}${tierPill(m)}${pts != null ? `<span class="lx-pts"><b class="num">${fmt(pts)}</b> points</span>` : ''}</div></div></div>
    <div class="lx-doors">${door('poker', 'The Strategy Table', 'Poker · ' + poker, true)}${door('biz', 'The Exchange', "Business Club · members' businesses", clubsOpen)}${door('opp', 'The Bulletin', 'Opportunity Club · ask for help, or offer it', clubsOpen)}${door('scan', 'Business Card Scanner', 'Turn a business card into your profile', clubsOpen)}</div>
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
      <p class="note">${T.tableSize === 6 ? '6-max tables' : `${T.tableSize || 9} players per table`}: a new table opens for every ${T.tableSize || 9} players and tables merge down to the final table. ${T.lateLevels ? `Late registration stays open until the end of level ${T.lateLevels}. ` : ''}${T.anteMode === 'each' ? 'Every player posts an ante each hand' : 'The big blind posts the ante for the table (WSOP/WPT style)'} · ${T.actSec || 20} seconds to act. Every player has 3 extra-time cards (+30 seconds each) for the tournament, and a fresh 5 at the final table.${extrasNote(T)}</p>
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
  if(boardSeg === 'prizes') return prizesHTML();
  return `<div class="seg2">${[['board','Leaderboard'],['prizes','Prizes']].map(([k, l]) => `<button data-bseg="${k}" aria-pressed="${boardSeg === k}">${l}</button>`).join('')}</div><div class="card-box"><span class="eyebrow">Recognition for good play</span>
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
  return newsHTML() + demoCard() + conflictsHTML() + clubListHTML() + joinQrHTML() + clubsSwitchHTML() + directorMainHTML() + prizeAdminHTML();
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
    <p class="cr-lead">It starts empty: its own members, invite links, QR code, tournaments and Exchange. You are its owner, and only you see its members and sign-ups.</p>
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
    <p class="note">Your business is in the Exchange, so you can open your own private club on Blindrise: your members, your QR code, your events. One club per member.</p>
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
    ${P.clubs.length ? `<div class="table-list">${P.clubs.map(x => `<div class="trow pf-row" data-pfclub="${esc(x.id)}"><div class="pf-t"><b>${esc(x.name)}</b><small>${x.members} member${x.members === 1 ? '' : 's'} · ${x.signups} QR sign-up${x.signups === 1 ? '' : 's'}</small></div>
      <span class="status-pill${CLUB_STATUS[x.status][1]}">${CLUB_STATUS[x.status][0]}</span>
      ${x.status === 'cancelled' ? '' : `<span class="row-btns">${x.status === 'suspended' ? `<button class="back" data-pfact="unsuspend" data-club="${esc(x.id)}">Restore</button>` : `<button class="back" data-pfact="suspend" data-club="${esc(x.id)}">Suspend</button>`}<button class="back" data-pfact="cancel" data-club="${esc(x.id)}">Cancel club</button></span>`}</div>`).join('')}</div>` : '<p class="note">No other clubs yet.</p>'}
    <div class="btn-row"><button class="btn" id="newClubBtn">Open a new club</button></div>
    <details class="pf-log"><summary>Moderation log · ${P.log.length}</summary>${P.log.length ? `<div class="table-list">${P.log.map(e => `<div class="trow"><b>${esc({ suspend: 'Suspended', unsuspend: 'Restored', cancel: 'Cancelled' }[e.action] || e.action)} · ${esc(e.clubName)}</b><small>${new Date(e.at).toLocaleString()} · by ${esc(e.byName)}${e.reason ? ' · ' + esc(e.reason) : ''}</small></div>`).join('')}</div>` : '<p class="note">Nothing yet. Every suspend, restore and cancel is recorded here.</p>'}</details></div>
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
    cancel: ['Cancel club', `${x.name} closes for good: its members lose access and it can't be opened again. Its records are kept. This can't be undone.`] }[action];
  const pm = modal(`<h2>${esc(what[0])} ${esc(x.name)}?</h2><p>${esc(what[1])}</p><div class="field"><label for="pfReason">Reason (kept in the log)</label><input id="pfReason" maxlength="300"></div>`, [{ label: 'Back', value: false }, { label: esc(what[0]), value: true, primary: true }]);
  let reason = ''; $('pfReason').oninput = e => reason = e.target.value;
  if(!await pm) return;
  try{ await post('/api/clubModerate', { club: id, action, reason }); toast(action === 'suspend' ? 'Club suspended.' : action === 'cancel' ? 'Club cancelled.' : 'Club restored.'); }
  catch(e){ modal(`<h2>That didn't work</h2><p>${esc(e.message)}</p>`, [{ label: 'OK', value: 1, primary: true }]); }
}
async function postBroadcast(){
  const w = $('bcWhen').value, body = { kind: $('bcKind').value, title: $('bcTitle').value, body: $('bcBody').value, when: w ? new Date(w).getTime() : null };
  try{ await post('/api/platformPost', body); toast('Posted to every club.'); $('bcTitle').value = ''; $('bcBody').value = ''; $('bcWhen').value = ''; }
  catch(e){ modal(`<h2>That didn't work</h2><p>${esc(e.message)}</p>`, [{ label: 'OK', value: 1, primary: true }]); }
}
// Blindrise posts, shown in every club and always marked as Blindrise's, never the club's own
function blindriseHTML(){
  const list = club.blindrise || []; if(!list.length) return '';
  return list.map(b => `<article class="card-box br-post" aria-label="From Blindrise"><div class="br-head"><span class="br-badge">Blindrise</span><span class="eyebrow">${b.kind === 'event' ? 'Official event' : 'Official announcement'}</span></div>
    <h3>${esc(b.title)}</h3>${b.when ? `<p class="br-when">${esc(when(b.when))}</p>` : ''}<p>${esc(b.body)}</p></article>`).join('');
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
function extrasNote(T){
  if(!extrasOn() || !T) return '';
  const x = [T.showMuck ? 'after each hand, players may show one or both of their cards' : '', T.rabbit ? 'the unused turn and river are shown when a hand ends early' : '', T.handPause ? `${T.handPause} seconds between hands` : ''].filter(Boolean);
  return x.length ? ` Table extras: ${x.join('; ')}.` : '';
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
  const editing = editingT && T && T.status === 'registering';
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
  on('openClubBtn', () => openClubFlow(club.openClub.rules, false));
  on('bcPost', postBroadcast);
  on('csSwitch', () => { const x = club.clubs.find(c => c.id !== club.club.id && !c.suspended); if(x){ local.set('club', x.id); location.replace('/'); } });
  document.querySelectorAll('[data-pfact]').forEach(b => b.onclick = () => moderateClub(b.dataset.club, b.dataset.pfact));
  document.querySelectorAll('[data-unpost]').forEach(b => b.onclick = async () => { try{ await post('/api/platformUnpost', { id: b.dataset.unpost }); }catch(e){ toast(e.message); } });
  on('lateInvite', e => { e.preventDefault(); askInvite(); });
  on('againBtn', () => {
    const T = club.tourney, d = new Date();
    send({ t: 'create', name: T ? T.name : `${d.toLocaleDateString('en-US', { weekday: 'long' })} Night Tournament`, stack: T ? T.stack : 30000, levelMin: T ? T.levelMin : 20, startAt: $('againAt') && $('againAt').value ? +$('againAt').value : null, repeat: 'none', anteMode: T && T.anteMode ? T.anteMode : 'each', actSec: T && T.actSec ? T.actSec : 20, tableSize: 9, lateLevels: T && T.lateLevels != null ? T.lateLevels : 4, helper: T ? T.helper !== false : true, ...(extrasOn() && T ? { showMuck: !!T.showMuck, rabbit: !!T.rabbit, handPause: T.handPause || 0 } : {}) });
    send({ t: 'join' }); tab = 'event';
  });
  on('newCustomBtn', () => { tab = 'director'; renderLobby(); });
  const nf = $('newForm');
  if(nf){
    $('nWhen').onchange = () => $('atWrap').hidden = $('nWhen').value !== 'at';
    nf.onsubmit = e => {
      e.preventDefault();
      const at = $('nWhen').value === 'at' ? new Date($('nAt').value).getTime() : null;
      send({ t: editingT ? 'edit' : 'create', name: $('nName').value.trim(), stack: +$('nStack').value, levelMin: +$('nLevel').value, startAt: at, repeat: at ? $('nRepeat').value : 'none', anteMode: $('nAnte').value, actSec: +$('nAct').value, tableSize: +$('nSize').value, lateLevels: +$('nLate').value, helper: $('nHelper').value, ...(extrasOn() ? { showMuck: $('nShow').value, rabbit: $('nRabbit').value, handPause: +$('nPause').value } : {}) });
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
$('lobbyBtn').onclick = () => { openChat(false); stopDemo(); view = 'lobby'; send({ t: 'watch', tid: null }); showScreen('lobby'); renderLobby(); };

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
    const p = document.createElement('div');
    p.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
    p.innerHTML = `<div class="seat" ${at}><div class="hole">${cardHTML(null, 'mini')}${cardHTML(null, 'mini')}</div>${avHTML('', 'W W')}<div class="plate">${txt}${badge}</div></div>`
      + `<div class="seat hero" ${at}><div class="hole">${cardHTML(null, 'hero')}${cardHTML(null, 'hero')}</div><div class="plate">${avHTML('', 'W W')}<div class="pl-txt">${txt}</div>${badge}</div></div>`
      + ['l', 'r', 't', 'tl', 'tr'].map(sd => `<div class="seat" data-side="${sd}" ${at}><div class="hole">${cardHTML(null, 'mini')}${cardHTML(null, 'mini')}</div>${avHTML('', 'W W')}<div class="plate">${txt}${badge}</div></div>`).join('')
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
const pxToPct = ([x, y]) => [x / GEO.W * 100, y / GEO.H * 100];
// Maps a table's seat numbers to screen positions, turned so you sit at the bottom.
function layoutOf(d){
  // the chips in front of a seat never read wider than "8,888" or "88.8K" (bigger bets read 12.5K, 125K, 1.2M; see
  // chipFmt), so the seats have the same room all hand and don't move when someone bets big
  const bet = '88.8K';
  const allowed = d.allowed || [0, 1, 2, 3, 4, 5, 6, 7, 8], n = allowed.length, G = tableGeo(n, bet);
  const mySeat = d.seats.findIndex(p => p && club && p.uid === club.me.id), base = Math.max(0, allowed.indexOf(mySeat));
  const rel = s => (allowed.indexOf(s) - base + n) % n;
  return { allowed, rel, G, posOf: s => pxToPct([G.seats[rel(s)].x, G.seats[rel(s)].y]), betOf: s => G.betAt(rel(s)), dealerOf: s => G.dealerAt(rel(s)) };
}
const centerPx = () => GEO ? [GEO.bx, GEO.by] : pctToPx([50, 45]);
const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
// An element's centre inside the table area (for a seat's avatar), or null.
function avatarPx(uid){
  const area = $('tableArea'), el = area && area.querySelector(`.seat[data-uid="${CSS.escape(uid)}"] .av`); if(!el) return null;
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
function potToWinners(d, handKey, LY){
  const key = 'win' + handKey; if(seen.has(key)) return; seen.add(key);
  const fx = $('fx'); if(!fx) return;
  fx.querySelectorAll('.winpile').forEach(e => e.remove());
  // start where the pot sits, just above the board
  const area = $('tableArea'), ar = area.getBoundingClientRect(), br = $('board').getBoundingClientRect();
  const [px, py] = br.width ? [br.left + br.width / 2 - ar.left, br.top - ar.top - 12] : centerPx(), still = reducedMotion(), bb = (d.blinds && d.blinds[1]) || 1;
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
const initials = n => { const w = String(n || '?').trim().split(/\s+/); return w.length > 1 ? w.slice(0, 2).map(x => x[0]).join('').toUpperCase() : w[0].slice(0, 1).toUpperCase() + w[0].slice(1, 2).toLowerCase(); };
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
  clearTimeout(playNoteTimer); playNoteTimer = setTimeout(hidePlayNote, 10000);
}
// over the board's five empty slots (and, when no message is showing, the message line under them: the layout keeps
// both clear of seats and chips), the text as large as fits there, on two lines or, if need be, three
// (on the oval nothing but the game lies on the felt: there the notice stands in the dock, over the helper's line)
function placePlayNote(el){
  let area = $('tableArea').getBoundingClientRect(); const slots = [...$('board').children].map(c => c.getBoundingClientRect());
  if(!slots.length) return hidePlayNote();
  let l = Math.min(...slots.map(r => r.left)), t = Math.min(...slots.map(r => r.top)), r = Math.max(...slots.map(r => r.right));
  let b = Math.max(...slots.map(r => r.bottom));
  const msg = $('msg'), hp = $('helper');
  const oval = $('tableArea').classList.contains('oval'), home = oval ? $('dock') : $('tableArea');
  if(el.parentNode !== home) home.appendChild(el);
  if(oval){ const d = $('dock').getBoundingClientRect(), h = !hp.hidden && hp.parentNode === $('dock') ? hp.getBoundingClientRect() : null;
    area = d; l = h ? h.left : d.left + 8; r = h ? h.right : d.right - 8; t = h ? h.top : d.top; b = h ? Math.max(h.bottom, t + 36) : t + 36; }
  else if(!msg.textContent.trim()){ const ms = getComputedStyle(msg), lh = parseFloat(ms.lineHeight) || parseFloat(ms.fontSize) * 1.3; b = Math.max(b, msg.getBoundingClientRect().top + lh); }
  el.style.cssText = `left:${l - area.left}px;top:${t - area.top}px;width:${r - l}px;height:${b - t}px`;
  const fits = () => el.scrollHeight <= el.clientHeight + .5 && el.scrollWidth <= el.clientWidth + .5;
  for(const wrap of [false, true]){
    el.classList.toggle('wrap', wrap);
    for(let f = 13; f >= 11; f -= .5){ el.style.fontSize = f + 'px'; if(fits()) return; }
  }
}
$('playNote').onclick = hidePlayNote;
// The table area's height is held for the whole hand. It is decided when a hand starts (or the screen turns) from
// the room the screen has with the browser's bars showing (100svh), so the felt doesn't move or rescale when
// Safari's toolbar slides in or out, or the keyboard opens, mid-hand. If the screen still gets shorter during a
// hand, the table keeps its size and the dock (the action bar) stays at the bottom of the screen, over the table's
// lower edge, until the next hand is dealt.
let LOCK = null, SVH = null;
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
  const H = window.innerHeight; g.classList.toggle('h700', H <= 700); g.classList.toggle('h600', H <= 600);
  // a phone held sideways: the table takes the full width on the left and the action bar stands beside it
  const land = window.innerWidth > H && H <= 600 && window.innerWidth >= 560;
  if(g.classList.contains('land') !== land){ g.classList.toggle('land', land); LOCK = null; }
  // the smallest phones sideways (iPhone SE): your cards go back above your plate, smaller, so the bottom row of
  // a full table has the width it needs
  g.classList.toggle('land-s', land && window.innerWidth < 700);
  // on short screens the header is one row: the chat and Lobby buttons move up beside the clock. Short is judged by
  // the height with Safari's bars showing (svh), which is the room the table is laid out for: an iPhone upright in
  // Safari (393x659, 430x739) gets the second row's height for the felt, so a full table is an oval, not round
  const row1 = H <= 600 || Math.min(H, svhPx()) <= 760 && window.innerWidth < 600;
  g.classList.toggle('row1', row1);
  // a phone held upright (not the shortest screens): the table fills the screen from the header to the bottom edge,
  // your seat at the bottom left and the action buttons a narrow column at the bottom right, over the felt (as WPT)
  const wpt = false;
  if(g.classList.contains('wpt') !== wpt){ g.classList.toggle('wpt', wpt); LOCK = null; }
  g.style.setProperty('--dock-w', Math.min(184, Math.round(window.innerWidth * .47)) + 'px');
  const hb = g.querySelector('.hdr-btns'), home = g.querySelector(row1 ? '.clock' : '.stats');
  if(hb && hb.parentNode !== home) home.appendChild(hb);
  LOCK = { w: g.clientWidth, hand, h: 0, iw: window.innerWidth, ih: H };
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
  // the whole live pot: what's in the middle plus this street's bets still in front of the seats (the coach's pot
  // odds count the same total; when the bets are swept in they leave the seats as they join d.pot, so nothing counts twice)
  const potAll = (d.pot || 0) + d.seats.reduce((t, p) => t + (p && p.inHand ? p.bet || 0 : 0), 0);
  $('pot').innerHTML = !res && potAll > 0 ? `${chipsIcon(3)}Pot ${chipFmt(potAll, 1e6)}` : '';
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
  felt.style.cssText = `inset:auto;left:${G.cx - G.fw / 2}px;top:${G.cy - G.fh / 2}px;width:${G.fw}px;height:${G.fh}px;--rw:${G.rail}px${wm}`;
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
  area.classList.toggle('tall', G.tall); area.classList.toggle('oval', G.inset === 6); area.classList.toggle('stad', G.inset === 2 || G.inset === 3 || G.inset === 6); area.classList.toggle('tight', G.tight); area.classList.toggle('compact', G.compact); area.classList.toggle('mini', G.mini); area.classList.toggle('micro', G.look === 'micro'); area.classList.toggle('pot-side', !!G.potSide);
  if(!d.result) $('fx').querySelectorAll('.winpile').forEach(e => { if(e.dataset.hand !== d.tid + ':' + d.handNo){ e.classList.add('gone'); setTimeout(() => e.remove(), 400); } });
  const mc = myCards.get(d.tid), mine = mc && mc.hand === d.handNo ? mc.cards.map(cs) : null;
  const nick = seatNicks(d.seats.filter(Boolean).map(p => p.name));
  const parts = [];
  for(const s of LY.allowed){
    const p = d.seats[s], pos = posOf(s);
    if(!p){ parts.push(`<div class="empty-seat" style="left:${pos[0]}%;top:${pos[1]}%">OPEN</div>`); continue; }
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
    // the seat whose turn it is shows no pill from its last action (that CALL is history); the gold ring marks it
    else if(p.act && !acting){ const amt = (p.act === 'Raise' || p.act === 'Bet') ? ' ' + fmt(p.lastAmt) : ''; badge = `<span class="badge act-${p.act.toLowerCase().replace(/[^a-z]+/g, '-')}">${esc(p.act)}${amt}</span>`; }
    const stackTxt = p.inHand && p.allIn && !res ? 'All-in' : fmt(p.stack);
    const cls = `seat ${isMe || foot ? 'hero' : ''} ${p.folded ? 'folded' : ''} ${acting ? 'acting' : ''} ${res && p.won > 0 ? 'win' : ''}`;
    const winStyle = res && p.won > 0 ? `;--wd:${reducedMotion() ? 0 : WIN_DELAY + WIN_GLIDE - 150 - winElapsed(handKey)}ms` : '';
    const av = avHTML(p.uid, p.name);
    const shot = acting ? '<div class="shot"><i class="shotBar"></i></div>' : '';
    parts.push(isMe || foot
      ? `<div class="${cls}" data-uid="${esc(p.uid)}" style="left:${pos[0]}%;top:${pos[1]}%${winStyle}"><div class="hole">${hole}</div><div class="plate">${av}<div class="pl-txt"><div class="nm" title="${esc(p.name)}">${esc(nick(p.name))}</div><div class="st num">${stackTxt}</div></div>${badge}${shot}</div></div>`
      : `<div class="${cls}" data-uid="${esc(p.uid)}"${oq.side ? ` data-side="${oq.side}"` : ''} style="left:${pos[0]}%;top:${pos[1]}%${winStyle}${oq.side ? `;--sx:${oq.sx}px;--sy:${oq.sy}px` : ''}"><div class="hole${/ show\b/.test(hole) ? ' shown' : ''}">${hole}</div>${av}<div class="plate"><div class="nm" title="${esc(p.name)}">${esc(nick(p.name))}</div><div class="st num">${stackTxt}</div>${badge}${shot}</div></div>`);
    if(p.inHand && p.bet > 0){
      const [bx, by] = LY.betOf(s), bp = pxToPct([bx, by]), [sx, sy] = pctToPx(pos);
      const key = `b${handKey}-${d.street}-${s}-${p.bet}`, isNew = !seen.has(key); seen.add(key);
      parts.push(`<div class="bet num ${isNew ? 'chipin' : ''}" style="left:${bp[0]}%;top:${bp[1]}%;--fx:${sx - bx}px;--fy:${sy - by}px">${chipsIcon(Math.min(3, 1 + Math.floor(p.bet / (d.blinds[1] * 3))))}${chipFmt(p.bet, 1e4)}</div>`);
    }
  }
  if(d.btn >= 0 && d.phase === 'hand'){
    const dd = pxToPct(LY.dealerOf(d.btn));
    parts.push(`<div class="dealer" style="left:${dd[0]}%;top:${dd[1]}%">D</div>`);
  }
  patchKids($('seats'), parts);
  // (where the screen is too small for a clean layout, the smallest phones sideways, the result line can still touch
  // a seat under the board: then it is written above the board instead, where the pot was during the hand)
  const ml = $('msg'); ml.classList.remove('up');
  if(res && G.cost){ const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom, mr = ml.getBoundingClientRect();
    if([...$('seats').querySelectorAll('.av, .plate, .hole .card')].some(e => hit(e.getBoundingClientRect(), mr))) ml.classList.add('up'); }
  if(res) try{ potToWinners(d, handKey, LY); }catch(e){}
  $('tName').textContent = `Table ${d.n}`;
  $('sPlayers').textContent = `${d.seats.filter(Boolean).length} seated`;
  renderControls(d, mySeat, mine);
  renderHelper(d, mySeat >= 0 ? d.seats[mySeat] : null, mine);
  // last hand's coach tip floats over the table; it gets out of the way when it's your turn to act
  if(d.actUid === club.me.id && !d.result && !$('coachTip').hidden){ $('coachTip').hidden = true; clearTimeout(tipTimer); }
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
  // a finished hand: the whole result in the bar (the felt shows its first line)
  const R = d.result && d.result.lines;
  // (while my show offer is up, the bar asks about my cards instead; the felt still shows the result)
  if(showLine) line = showLine;
  else if(R && R.length && !(meSeat && meSeat.away)){
    // the felt already says who won how much: the bar adds only what the felt leaves out (the winning hand, the
    // other pots), so the same words never show twice
    const rest = R.map(l => l.slice((l.match(/^.*? (?:wins|split) [\d,]+/) || [''])[0].length).replace(/^\s*·\s*/, ''));
    line = rest.every(x => !x) ? 'Next hand coming up…' : R.length === 1 ? `Winning hand: <b>${esc(rest[0])}</b>` : R.map(esc).join('<br>');
  }
  c.innerHTML = `<div class="info-line">${line}</div>${pre}`;
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
let actLockTimer = 0;
function sendAction(d, a){
  const key = d.tid + ':' + d.handNo + ':' + d.seq;
  if(lastSent === key) return;
  lastSent = key;
  $('controls').querySelectorAll('button').forEach(b => { b.disabled = true; });
  clearTimeout(actLockTimer);
  actLockTimer = setTimeout(() => {
    const t = tables.get(d.tid);
    if(lastSent !== key || !t || t.tid + ':' + t.handNo + ':' + t.seq !== key || t.actUid !== club.me.id) return;
    lastSent = null; $('controls').dataset.turn = ''; if(view === 'table' && watchTid === d.tid) renderTable();
  }, 4000);
  if(d.tid === 'demo' && demo){ if(navigator.vibrate) try{ navigator.vibrate(20); }catch(e){} $('controls').innerHTML = '<div class="info-line">…</div>'; return demo.answer(a); }
  const words = { fold: 'Fold', check: 'Check', call: 'Call', raise: 'Raise' };
  $('controls').innerHTML = `<div class="info-line">${words[a.t] || ''}${a.t === 'raise' ? ' to ' + fmt(a.to) : ''} · sending…</div>`;
  if(navigator.vibrate) try{ navigator.vibrate(20); }catch(e){}
  send({ t: 'act', tid: d.tid, hand: d.handNo, seq: d.seq, a });
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
  // in the one-row header of the shortest screens the ante takes the second line, in place of the next level
  const one = $('game').classList.contains('row1');
  $('cBlinds').textContent = `${fmt(sb)}/${fmt(bb)}${an && !one ? ' · ante ' + fmt(an) : ''}`;
  $('cNext').textContent = one && an ? `Ante ${fmt(an)}` : `Next: ${fmt(nsb)}/${fmt(nbb)}${nan ? ' · ante ' + fmt(nan) : ''}`;
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
// iPhone Safari reports a turned screen's new size late (after the resize/orientationchange events have fired), so
// the table was laid out for the old shape and kept it: look again a few times while the turn settles (for a few
// seconds: a busy phone can be slow to report it). A screen
// that only got taller or shorter (the toolbar, the keyboard) keeps its held layout; a turned one (a new width) is laid
// out anew.
let TURN = [], TURNW = window.innerWidth;
function settleTurn(){
  TURN.forEach(clearTimeout);
  TURN = [60, 200, 450, 900, 1600, 2600].map((ms, i, all) => setTimeout(() => {
    if(view === 'table'){
      // the screen really turned (its width is not the one it settled at last time): while the turn settles, a
      // height arriving late decides the layout again too
      if(LOCK && window.innerWidth !== TURNW && (LOCK.iw !== window.innerWidth || LOCK.ih !== window.innerHeight)) LOCK = null;
      renderTable();
    }
    if(i === all.length - 1) TURNW = window.innerWidth;
  }, ms));
}
window.addEventListener('orientationchange', settleTurn);
if(screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', settleTurn);
window.addEventListener('resize', () => { if(window.innerWidth !== TURNW) settleTurn(); });
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
function showTip(kind, title, text){
  const el = $('coachTip'); clearTimeout(tipTimer);
  el.className = 'coachtip ' + kind; el.hidden = false;
  el.innerHTML = `<span class="ct-ic">${NOTE_ICON[kind] || '💡'}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div><button aria-label="Close">×</button>`;
  tipTimer = setTimeout(() => { el.hidden = true; }, kind === 'mind' ? 14000 : 10000);
}
$('coachTip').onclick = () => { $('coachTip').hidden = true; clearTimeout(tipTimer); };
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
const hMin = () => ovalScreen() ? !helperBig : helperMin;
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
  const on = T && T.helper !== false && me && me.inHand && !me.folded && mine && d.phase === 'hand' && !d.result;
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
