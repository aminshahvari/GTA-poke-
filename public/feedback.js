// Feedback Hub (client). A small Feedback button in the lobby (top bar, or floating on phones) and in the table chat opens a sheet: pick Bug, Idea
// or UX, describe it, optionally attach a screenshot (shrunk to a small JPEG on the phone), send. The app adds only the
// part of the app you were in, the browser's user-agent (the server keeps just a device class like "iPhone · Safari") and
// the screen size; the server adds the app version. The buttons show only while the Hub is open (Director tab switch).
// Never PINs, tokens, chat, cards or anything from gameplay. The owner reads everything in the Director tab.
// Everything member-typed is shown with textContent, never as HTML.
(function(){
'use strict';
let C = null;   // { post, toast, token, section, isOwner, features, setOpen, confirm }
const CATS = [['bug', 'Bug'], ['idea', 'Idea'], ['ux', 'UX']];
const STATUSES = [['new', 'New'], ['reviewing', 'Reviewing'], ['progress', 'In progress'], ['resolved', 'Resolved']];
const SECTION_NAMES = { home: 'Home', poker: 'Poker', learn: 'Learn', business: 'Business', opportunity: 'Opportunity', director: 'Director', other: 'Other' };
const MIN_TEXT = 5, MAX_TEXT = 2000, MAX_SHOT = 135000, SHOT_SIDE = 1280;
const label = (list, k) => (list.find(x => x[0] === k) || [k, k])[1];

function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  for(const [k, v] of Object.entries(attrs || {})){
    if(v == null || v === false) continue;
    if(k === 'class') el.className = v; else if(k === 'text') el.textContent = v; else if(k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for(const c of kids.flat()) if(c != null && c !== false) el.append(c);
  return el;
}
// a speech bubble with a line in it: drawn here, nothing fetched
function icon(){
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); s.setAttribute('class', 'fb-ic');
  p.setAttribute('d', 'M4 5.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1h-9l-4.5 3.5V17H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1zM8 10h8M8 13h5');
  s.append(p); return s;
}

// ---------- screenshot: shrink on the phone to a small JPEG (no metadata survives a canvas re-draw) ----------
function shrinkShot(file){
  return new Promise((res, rej) => {
    if(!file || !/^image\//.test(file.type) || file.size > 25e6) return rej(new Error('bad'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let side = SHOT_SIDE, out = '';
      for(let tries = 0; tries < 6 && (!out || out.length > MAX_SHOT); tries++){
        const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight, 1));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        for(let q = .8; q >= .4; q -= .2){ out = c.toDataURL('image/jpeg', q); if(out.length <= MAX_SHOT) break; }
        side = Math.round(side * .7);
      }
      out.length <= MAX_SHOT && out.startsWith('data:image/jpeg;base64,') ? res(out) : rej(new Error('big'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad')); };
    img.src = url;
  });
}

// ---------- the member sheet ----------
let sheet = null, lastFocus = null;
function close(){ if(!sheet) return; sheet.remove(); sheet = null; document.removeEventListener('keydown', onKey); if(lastFocus && lastFocus.isConnected) lastFocus.focus(); }
function onKey(e){ if(e.key === 'Escape') close(); }
function open(){
  if(sheet) return;
  lastFocus = document.activeElement;
  const st = { cat: null, shot: null, busy: false, section: C.section() };
  const err = h('p', { class: 'fb-err', role: 'alert', hidden: true });
  const showErr = t => { err.textContent = t; err.hidden = !t; };
  const cats = h('div', { class: 'fb-cats', role: 'group', 'aria-labelledby': 'fbCatLabel' }, CATS.map(([k, l]) =>
    h('button', { type: 'button', class: 'fb-cat', 'data-fbcat': k, 'aria-pressed': 'false', text: l, onclick: () => { st.cat = k; cats.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fbcat === k))); showErr(''); } })));
  const count = h('small', { class: 'fb-count', text: '0 / ' + MAX_TEXT });
  const text = h('textarea', { id: 'fbText', rows: '5', maxlength: String(MAX_TEXT), placeholder: 'What happened, or what would make it better?' });
  text.addEventListener('input', () => { count.textContent = text.value.length + ' / ' + MAX_TEXT; showErr(''); });
  const preview = h('div', { class: 'fb-shot', hidden: true });
  const file = h('input', { type: 'file', accept: 'image/*', id: 'fbFile', class: 'fb-file' });
  const attach = h('label', { class: 'btn fb-attach', for: 'fbFile', text: 'Attach a screenshot (optional)' });
  const setShot = data => {
    st.shot = data; preview.replaceChildren(); preview.hidden = !data; attach.hidden = !!data;
    if(data) preview.append(h('img', { src: data, alt: 'Screenshot to send' }), h('button', { type: 'button', class: 'fb-link', text: 'Remove screenshot', onclick: () => { setShot(null); file.value = ''; } }));
  };
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; if(!f) return;
    attach.textContent = 'Preparing…';
    try{ setShot(await shrinkShot(f)); showErr(''); }
    catch(e){ showErr('That picture could not be used. Try another one, or send without it.'); }
    attach.textContent = 'Attach a screenshot (optional)';
  });
  const send = h('button', { type: 'button', class: 'btn red fb-send', id: 'fbSend', text: 'Send feedback' });
  send.addEventListener('click', async () => {
    if(st.busy) return;
    const t = text.value.trim();
    if(!st.cat) return showErr('Pick Bug, Idea or UX.');
    if(t.length < MIN_TEXT) return showErr('Add a few more words so we can understand.');
    st.busy = true; send.disabled = true; send.textContent = 'Sending…';
    try{
      // the only context sent: where you were in the app, your browser and screen size
      await C.post('/api/fbSend', { cat: st.cat, text: t, shot: st.shot || undefined,
        ctx: { section: st.section, ua: String(navigator.userAgent || '').slice(0, 200), vw: Math.round(window.innerWidth) || 0, vh: Math.round(window.innerHeight) || 0 } });
      A.at = 0;   // the owner's own note shows in the inbox next time it opens
      done();
    }catch(e){ showErr(e.message || 'That did not send. Try again.'); st.busy = false; send.disabled = false; send.textContent = 'Send feedback'; }
  });
  const box = h('div', { class: 'fb-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fbTitle' },
    h('div', { class: 'fb-head' }, h('h2', { id: 'fbTitle', text: 'Send feedback' }), h('button', { type: 'button', class: 'menu-btn', id: 'fbClose', text: 'Close', onclick: close })),
    h('p', { class: 'fb-sub', text: 'Only the club director reads this.' }),
    h('span', { class: 'fb-label', id: 'fbCatLabel', text: 'Type' }), cats, h('label', { class: 'fb-label', for: 'fbText', text: 'Your feedback' }), text, count, file, attach, preview, err, send,
    h('p', { class: 'fb-privacy', text: 'We add the app version, the screen you are on and your device type. Never your PIN, chat or cards.' }));
  function done(){
    box.replaceChildren(
      h('div', { class: 'fb-done', role: 'status' }, icon(), h('h2', { id: 'fbTitle', text: 'Thank you!' }), h('p', { text: 'Your feedback was sent to the club director.' }),
        h('button', { type: 'button', class: 'btn red', id: 'fbDone', text: 'Done', onclick: close })));
    box.querySelector('#fbDone').focus();
  }
  sheet = h('div', { class: 'fb-wrap', onclick: e => { if(e.target === sheet) close(); } }, box);
  document.body.append(sheet);
  document.addEventListener('keydown', onKey);
  cats.querySelector('button').focus();
}

// the Feedback buttons: one in the lobby top bar, one in the table header (both open the same sheet)
function sync(){
  const open = !!C.features().feedback;
  for(const id of ['fbBtnLobby', 'fbBtnTable']){ const b = document.getElementById(id); if(b) b.hidden = !open; }
  if(!open) close();
}
function mountButtons(){
  const top = document.querySelector('#lobby .topbar'), chip = document.getElementById('meChip');
  if(top && chip && !document.getElementById('fbBtnLobby'))
    top.insertBefore(h('button', { type: 'button', class: 'fb-btn', id: 'fbBtnLobby', 'aria-label': 'Send feedback', title: 'Send feedback', onclick: open }, icon(), h('span', { text: 'Feedback' })), chip);
  // at the table it sits in the chat sheet's header (Chat, then Feedback), so the table header and the felt keep every pixel
  const hdr = document.querySelector('#chatSheet .chat-head .hdr-btns'), shut = document.getElementById('chatClose');
  if(hdr && shut && !document.getElementById('fbBtnTable'))
    hdr.insertBefore(h('button', { type: 'button', class: 'menu-btn fb-tbtn', id: 'fbBtnTable', 'aria-label': 'Send feedback', title: 'Send feedback', onclick: open }, icon()), shut);
}

// ---------- the owner's inbox (Director tab) ----------
const A = { items: null, counts: null, total: 0, cat: '', status: '', loading: false, error: '', at: 0 };
async function load(){
  A.loading = true;
  try{ const r = await C.post('/api/fbList', { cat: A.cat || undefined, status: A.status || undefined }); A.items = r.items; A.counts = r.counts; A.total = r.total; A.error = ''; }
  catch(e){ A.error = e.message || 'Could not load feedback.'; }
  A.loading = false; A.at = Date.now();
}
let host = null;
function mountAdmin(el){
  if(!el || !C.isOwner()) return;
  host = el; draw();
  // shown from memory at once, then refreshed when older than 20 seconds (the Director tab re-renders often)
  if(!A.loading && Date.now() - A.at > 20000) load().then(() => { if(host && host.isConnected) draw(); });
}
function select(id, aria, opts, value, onchange){
  const s = h('select', { id, 'aria-label': aria || null, class: 'fb-select' }, opts.map(([v, l]) => { const o = h('option', { value: v, text: l }); if(v === value) o.selected = true; return o; }));
  s.addEventListener('change', () => onchange(s.value)); return s;
}
function draw(){
  if(!host) return;
  const refilter = () => load().then(() => { if(host && host.isConnected) draw(); });
  const counts = A.counts ? STATUSES.map(([k, l]) => l + ' ' + (A.counts[k] || 0)).join(' · ') : '';
  const list = h('div', { class: 'fb-list', id: 'fbList' });
  if(A.error) list.append(h('p', { class: 'fb-err', text: A.error }));
  else if(!A.items) list.append(h('p', { class: 'note', text: 'Loading feedback…' }));
  else if(!A.items.length) list.append(h('p', { class: 'note', text: A.cat || A.status ? 'Nothing matches these filters.' : 'No feedback yet.' }));
  else for(const f of A.items) list.append(item(f));
  const f = C.features(), open = !!f.feedback;
  const sw = f.feedbackLocked ? h('p', { class: 'note', id: 'fbLocked', text: 'Turned off on the server (FEEDBACK=off): members cannot send and this inbox is closed.' })
    : h('div', { class: 'fb-switch' }, h('p', { class: 'note', text: open ? 'Open: members see a Feedback button and can send notes.' : 'Closed: members see no Feedback button and cannot send. Notes already sent stay here.' }),
      h('button', { type: 'button', class: 'btn' + (open ? '' : ' red'), id: 'fbSwitch', text: open ? 'Close feedback to members' : 'Open feedback to members',
        onclick: async () => { if(await C.confirm(open ? 'Close feedback?' : 'Open feedback?', open ? 'Members will no longer see the Feedback button.' : 'Every member will see a Feedback button.', open ? 'Close it' : 'Open it')) C.setOpen(!open); } }));
  if(f.feedbackLocked){ host.replaceChildren(h('div', { class: 'card-box fb-admin' }, h('span', { class: 'eyebrow', text: 'Feedback' }), sw)); return; }
  host.replaceChildren(h('div', { class: 'card-box fb-admin' },
    h('div', { class: 'fb-top' }, h('span', { class: 'eyebrow', text: 'Feedback · ' + A.total }), h('button', { type: 'button', class: 'fb-link', id: 'fbRefresh', text: 'Refresh', onclick: refilter })),
    sw,
    counts ? h('p', { class: 'note fb-counts', text: counts }) : null,
    h('div', { class: 'fb-filters' },
      h('label', { class: 'fb-label', for: 'fbFilterCat', text: 'Type' }), h('label', { class: 'fb-label', for: 'fbFilterStatus', text: 'Status' }),
      select('fbFilterCat', null, [['', 'All types'], ...CATS], A.cat, v => { A.cat = v; refilter(); }),
      select('fbFilterStatus', null, [['', 'Any status'], ...STATUSES], A.status, v => { A.status = v; refilter(); })),
    list,
    h('p', { class: 'note', text: 'Only you can see feedback. Members never see each other\'s notes.' })));
}
function item(f){
  const when = new Date(f.createdAt).toLocaleString();
  const ctx = f.ctx || {};
  const meta = [f.author, when, SECTION_NAMES[ctx.section] || 'Other', ctx.version ? 'v' + ctx.version : null, ctx.device || null, ctx.vw && ctx.vh ? ctx.vw + '×' + ctx.vh : null].filter(Boolean).join(' · ');
  const st = select('fbStatus-' + f.id, 'Status', STATUSES, f.status, async v => {
    st.disabled = true;
    try{ const r = await C.post('/api/fbSet', { id: f.id, status: v }); Object.assign(f, r.item); if(A.counts){ A.counts = null; } C.toast('Marked ' + label(STATUSES, v) + '.'); load().then(() => { if(host && host.isConnected) draw(); }); }
    catch(e){ C.toast(e.message); st.value = f.status; st.disabled = false; }
  });
  st.dataset.fbid = f.id;
  const row = h('div', { class: 'fb-item', 'data-fbitem': f.id },
    h('div', { class: 'fb-item-head' }, h('span', { class: 'fb-pill fb-' + f.cat, text: label(CATS, f.cat) }), st),
    h('p', { class: 'fb-text', text: f.text }),
    h('small', { class: 'fb-meta', text: meta }));
  const acts = h('div', { class: 'fb-acts' });
  if(f.hasShot) acts.append(h('button', { type: 'button', class: 'fb-link fb-view-shot', text: 'View screenshot', onclick: () => viewShot(f.id) }));
  acts.append(h('button', { type: 'button', class: 'fb-link fb-del', text: 'Delete', onclick: async () => {
    if(!await C.confirm('Delete this feedback?', 'It is removed for good, with its screenshot.', 'Delete')) return;
    try{ await C.post('/api/fbDelete', { id: f.id }); C.toast('Feedback deleted.'); load().then(() => { if(host && host.isConnected) draw(); }); }
    catch(e){ C.toast(e.message); }
  } }));
  row.append(acts);
  return row;
}
// the screenshot comes with the owner's token (fetch), never as a plain link, and is shown from a blob URL
async function viewShot(id){
  let url = null;
  try{
    const r = await fetch('/fbshot/' + encodeURIComponent(id), { headers: { authorization: 'Bearer ' + C.token() } });
    if(!r.ok) throw new Error('missing');
    url = URL.createObjectURL(await r.blob());
  }catch(e){ return C.toast('That screenshot could not be opened.'); }
  const shut = () => { wrap.remove(); URL.revokeObjectURL(url); document.removeEventListener('keydown', esc); };
  const esc = e => { if(e.key === 'Escape') shut(); };
  const wrap = h('div', { class: 'fb-wrap fb-view', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Screenshot', onclick: e => { if(e.target === wrap) shut(); } },
    h('div', { class: 'fb-sheet' }, h('div', { class: 'fb-head' }, h('h2', { text: 'Screenshot' }), h('button', { type: 'button', class: 'menu-btn', text: 'Close', onclick: shut })),
      h('img', { src: url, alt: 'Screenshot sent with the feedback', class: 'fb-full' })));
  document.body.append(wrap); document.addEventListener('keydown', esc);
}

window.FeedbackHub = {
  init(ctx){ C = ctx; mountButtons(); sync(); },
  open, close, mountAdmin, sync,
  reset(){ A.items = null; A.counts = null; A.total = 0; A.cat = ''; A.status = ''; host = null; close(); }
};
})();
