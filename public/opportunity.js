// Opportunity Club: "I need help" / "I can help" listings inside Business Club, members only.
// Members reach each other with a short private request; the poster decides whether to share contact details.
// Separate from poker: no points, results or ratings here. Every piece of member text is put on the page with
// textContent (the h() helper from business.js), never innerHTML.
(function(){
'use strict';
let C = null, h = null, B = null, root = null;
const O = { view: 'feed', list: null, mine: null, reports: null, q: '', type: '', cat: '', detail: null, form: null, mineTab: 'listings', back: 'feed', badge: null, badgeAt: 0, cats: [] };
const TYPE = { need: 'I need help', offer: 'I can help' };
const SHORT = { need: 'Needs help', offer: 'Offering help' };
const api = (name, body) => C.post('/api/' + name, body || {});
const DAY = 864e5;
function ago(t){
  const s = (Date.now() - t) / 1000;
  if(s < 60) return 'just now'; if(s < 3600) return Math.floor(s / 60) + ' min ago'; if(s < 86400) return Math.floor(s / 3600) + ' h ago';
  const d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : d + ' days ago';
}
const date = t => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
function ends(t){ const d = Math.ceil((t - Date.now()) / DAY); return d <= 0 ? 'Ended ' + date(t) : d === 1 ? 'Ends tomorrow' : d <= 14 ? 'Ends in ' + d + ' days' : 'Ends ' + date(t); }
const STATE = { open: ['Open', 'open'], closed: ['Closed', 'idle'], expired: ['Expired', 'idle'], review: ['Hidden: waiting for director review', 'warn'], hidden: ['Hidden by the club director', 'warn'] };
const pill = st => h('span', { class: 'op-state ' + (STATE[st] || STATE.open)[1] }, (STATE[st] || STATE.open)[0]);
const I = (name, cls) => window.Icons.el(name, cls);
const typePill = t => h('span', { class: 'op-type ' + t }, I(t), SHORT[t]);
// the two big entry buttons: on the Business tab and on Home
const bigButtons = () => h('div', { class: 'op-entry' },
  h('button', { class: 'op-big need', type: 'button', onclick: () => newListing('need') }, h('span', { class: 'op-big-ic', 'aria-hidden': 'true' }, I('need')), h('span', null, h('b', null, 'I need help'), h('small', null, 'Ask the club'))),
  h('button', { class: 'op-big offer', type: 'button', onclick: () => newListing('offer') }, h('span', { class: 'op-big-ic', 'aria-hidden': 'true' }, I('offer')), h('span', null, h('b', null, 'I can help'), h('small', null, 'Offer a hand'))));
const counter = (input, max) => { const c = h('small', { class: 'op-count' }, input.value.length + ' / ' + max); input.addEventListener('input', () => { c.textContent = input.value.length + ' / ' + max; c.classList.toggle('over', input.value.length > max); }); return c; };

function go(view, extra){ Object.assign(O, { view }, extra || {}); if(!O.list) homeAt = 0; B.showOpp(); }


// ---------- entry: the two buttons and the Businesses / Opportunities switch (top of the Business tab) ----------
function topBar(seg){
  const n = O.badge || 0;
  return h('div', { class: 'op-top' },
    bigButtons(),
    h('div', { class: 'op-seg', role: 'tablist', 'aria-label': 'Business Club sections' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(seg === 'biz'), onclick: () => B.showBiz() }, 'Businesses'),
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(seg === 'opp'), onclick: () => go('feed') }, 'Opportunities', n ? h('span', { class: 'op-dot', 'aria-label': n + ' waiting' }, String(n)) : null)));
}
function newListing(type, edit){ go('form', { form: { type, edit: edit || null } }); }

// ---------- render ----------
function render(el){
  root = el;
  const v = O.view;
  if(v === 'form') return renderForm(el);
  if(v === 'detail') return renderDetail(el);
  if(v === 'mine') return renderMine(el);
  if(v === 'reports') return renderReports(el);
  return renderFeed(el);
}
const back = (label, fn) => h('button', { class: 'bz-back', type: 'button', onclick: fn }, '‹ ' + label);
const loading = (el, kids, p, again) => { el.replaceChildren(...kids, h('div', { class: 'empty' }, 'Opening…')); p.then(again).catch(e => el.replaceChildren(...kids, h('div', { class: 'card-box bz-empty' }, h('h3', null, 'Not available'), h('p', null, e.message)))); };

// A visual listing card: the type's icon tile, type and status pills, title, a short snippet, then industry, area and member.
function oppCard(x, compact){
  const cid = window.Icons.cat(x.category, x.categoryLabel);
  return h('button', { class: 'op-card ' + x.type + (compact ? ' compact' : ''), type: 'button', onclick: () => openDetail(x.id, 'feed') },
    h('span', { class: 'op-card-ic', 'aria-hidden': 'true' }, I(x.type)),
    h('span', { class: 'op-card-body' },
      h('span', { class: 'op-card-top' }, typePill(x.type), pill(x.state || 'open'), x.demo ? h('span', { class: 'demo-tag' }, 'Demo') : null, h('small', { class: 'op-ago' }, ago(x.createdAt))),
      h('b', { class: 'op-title' }, x.title),
      x.details && !compact ? h('span', { class: 'op-snip' }, x.details) : null,
      h('span', { class: 'op-meta' }, h('span', { class: 'op-cat' }, I(cid), h('span', null, x.categoryLabel)), x.area ? h('span', { class: 'op-cat' }, I('pin'), h('span', null, x.area)) : null),
      h('small', { class: 'op-by-line' }, I('users'), h('span', null, x.member)),
      x.myRequest ? h('span', { class: 'op-mini-state' }, x.myRequest.status === 'shared' ? 'Contact shared with you' : x.myRequest.status === 'declined' ? 'Declined' : 'Request sent') : x.mine ? h('span', { class: 'op-mini-state' }, 'Your listing') : null,
      x.reports ? h('span', { class: 'op-mini-state warn' }, x.reports + ' report' + (x.reports > 1 ? 's' : '')) : null));
}

function renderFeed(el){
  const top = topBar('opp');
  if(!O.list){
    return loading(el, [top], api('oppList', { all: O.all === true }).then(r => { O.list = r; O.cats = r.categories; O.badge = r.pending; O.badgeAt = Date.now(); }), () => { if(O.view === 'feed' && root === el) renderFeed(el); });
  }
  const L = O.list, items = L.items;
  const kids = [topBar('opp')];
  const tools = h('div', { class: 'op-tools' },
    h('button', { class: 'op-row', type: 'button', onclick: () => go('mine') }, h('span', null, h('b', null, 'My opportunities'), h('small', null, L.limits.openNow + ' of ' + L.limits.open + ' open · requests and replies')), L.pending ? h('span', { class: 'op-dot big' }, String(L.pending)) : null, h('span', { class: 'bz-chev', 'aria-hidden': 'true' }, '›')),
    L.canModerate ? h('button', { class: 'op-row dir', type: 'button', onclick: () => go('reports') }, h('span', null, h('b', null, 'Reports queue'), h('small', null, 'Director only')), L.queue ? h('span', { class: 'op-dot big warn' }, String(L.queue)) : h('small', null, 'All clear'), h('span', { class: 'bz-chev', 'aria-hidden': 'true' }, '›')) : null);
  kids.push(tools);
  const search = h('input', { type: 'search', class: 'bz-search', placeholder: 'Search listings', 'aria-label': 'Search listings', value: O.q, enterkeyhint: 'search', autocomplete: 'off' });
  const chips = h('div', { class: 'bz-chips', role: 'group', 'aria-label': 'Filter by type' },
    [['', 'All'], ['need', 'Needs help'], ['offer', 'Offering help']].map(([id, l]) => h('button', { type: 'button', class: 'bz-chip', 'aria-pressed': String(O.type === id), onclick: () => { O.type = id; renderFeed(el); } }, l)));
  const cat = h('select', { class: 'op-select', 'aria-label': 'Category' }, h('option', { value: '' }, 'All categories'), O.cats.map(([id, l]) => h('option', { value: id }, l)));
  cat.value = O.cat; cat.addEventListener('change', () => { O.cat = cat.value; fill(); });
  const allBox = L.canModerate ? h('label', { class: 'bz-switch op-all' }, h('input', { type: 'checkbox', checked: O.all === true, onchange: e => { O.all = e.target.checked; O.list = null; renderFeed(el); } }), h('span', null, 'Director view: show closed, expired and hidden too')) : null;
  const grid = h('div', { class: 'op-grid' }), count = h('div', { class: 'bz-count' });
  const filtered = () => { const q = O.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(x => (!O.type || x.type === O.type) && (!O.cat || x.category === O.cat) && (!q.length || q.every(w => [x.title, x.details, x.area, x.categoryLabel, x.member, SHORT[x.type]].join(' ').toLowerCase().includes(w)))); };
  function fill(){
    const f = filtered();
    count.textContent = f.length === 1 ? '1 listing' : f.length + ' listings';
    grid.replaceChildren(...(f.length ? f.map(x => oppCard(x)) : [h('div', { class: 'card-box bz-empty bz-nomatch' }, h('span', { class: 'bz-empty-art', 'aria-hidden': 'true' }, I('search')), h('p', null, 'No listings match.'), h('button', { class: 'btn', onclick: () => { O.q = ''; O.type = ''; O.cat = ''; renderFeed(el); } }, 'Clear filters'))]));
  }
  search.addEventListener('input', () => { O.q = search.value; fill(); });
  if(!items.length){
    kids.push(h('div', { class: 'card-box bz-empty' },
      h('div', { class: 'bz-empty-art', 'aria-hidden': 'true' }, I('spark')),
      h('h3', null, 'No open listings yet'),
      h('p', null, 'Need a hand with something, or happy to help? Post it here. Only signed-in club members can see it.'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn bz-gold big', onclick: () => newListing('need') }, 'I need help'), h('button', { class: 'btn big', onclick: () => newListing('offer') }, 'I can help'))));
    if(allBox) kids.push(allBox);
  } else {
    kids.push(h('div', { class: 'bz-find' }, search, h('div', { class: 'op-filters' }, chips, cat)));
    if(allBox) kids.push(allBox);
    kids.push(count, grid); fill();
  }
  kids.push(h('p', { class: 'note' }, 'Listings are for club members only and end after 30 days unless you choose otherwise. Your contact details are never shared unless you choose to share them. Nothing here is connected to poker.'));
  el.replaceChildren(...kids);
}

// ---------- detail ----------
function openDetail(id, from){ go('detail', { detail: { id, data: null }, back: from || 'feed' }); }
function renderDetail(el){
  const d = O.detail;
  const bk = back(O.back === 'mine' ? 'My opportunities' : O.back === 'reports' ? 'Reports queue' : 'Opportunities', () => go(O.back === 'mine' || O.back === 'reports' ? O.back : 'feed'));
  if(!d.data) return loading(el, [bk], api('oppGet', { id: d.id }).then(r => { d.data = r; }), () => { if(O.view === 'detail' && O.detail === d) renderDetail(el); });
  const x = d.data.item;
  const kids = [bk];
  const box = h('div', { class: 'card-box op-detail ' + x.type },
    h('div', { class: 'op-dhead' }, h('span', { class: 'op-card-ic big', 'aria-hidden': 'true' }, I(x.type)),
      h('div', { class: 'op-card-top' }, typePill(x.type), pill(x.state), x.demo ? h('span', { class: 'demo-tag' }, 'Demo') : null)),
    h('h2', null, x.title),
    x.details ? h('p', { class: 'bz-pre' }, x.details) : null,
    h('div', { class: 'bz-tags' }, h('span', { class: 'bz-tag cat' }, I(window.Icons.cat(x.category, x.categoryLabel)), x.categoryLabel), x.area ? h('span', { class: 'bz-tag cat' }, I('pin'), x.area) : null),
    h('p', { class: 'op-by' }, h('b', null, x.member), ' · posted ' + ago(x.createdAt) + ' · ' + ends(x.expiresAt)),
    x.business ? h('button', { class: 'op-row', type: 'button', onclick: () => B.openBiz(x.business.uid) }, h('span', null, h('small', null, x.member + "'s business"), h('b', null, x.business.name)), I('chev', 'bz-chev')) : null);
  if(x.mine){
    box.append(h('div', { class: 'bz-stack' },
      h('button', { class: 'btn bz-gold big', onclick: () => go('mine') }, 'See requests in My opportunities'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => newListing(x.type, x) }, 'Edit'),
        x.state === 'open' ? h('button', { class: 'btn', onclick: () => closeL(x, true) }, 'Close listing') : x.state === 'closed' ? h('button', { class: 'btn', onclick: () => closeL(x, false) }, 'Reopen') : null,
        h('button', { class: 'btn danger', onclick: () => delL(x) }, 'Delete'))));
  } else if(x.myRequest){
    const st = x.myRequest.status;
    box.append(h('div', { class: 'op-status ' + st }, st === 'shared' ? x.member + ' shared contact details with you. See them in My opportunities.' : st === 'declined' ? x.member + ' declined this time.' : 'Request sent. ' + x.member + ' can reply by sharing contact details.'),
      h('button', { class: 'btn big', onclick: () => go('mine', { mineTab: 'sent' }) }, 'Open my requests'));
  } else if(x.state === 'open'){
    box.append(h('button', { class: 'btn bz-gold big op-cta', onclick: () => contactSheet(x) }, x.type === 'need' ? 'I can help' : "I'm interested"),
      h('p', { class: 'bz-muted' }, 'Sends a short private message to ' + x.member + '. Your phone and email are not shared.'));
  }
  kids.push(box);
  if(!x.mine && x.state === 'open') kids.push(d.data.reported ? h('p', { class: 'bz-muted op-reported' }, 'You reported this listing. Thank you.') : h('button', { class: 'op-report', type: 'button', onclick: () => reportSheet(x, d) }, 'Report this listing'));
  if(d.data.canModerate){
    kids.push(h('div', { class: 'card-box bz-dir' }, h('span', { class: 'eyebrow' }, 'Director'),
      d.data.reports ? h('p', null, d.data.reports + ' open report' + (d.data.reports > 1 ? 's' : '') + '.') : null,
      h('div', { class: 'btn-row' },
        x.state === 'hidden' || x.state === 'review' ? h('button', { class: 'btn', onclick: () => moderate(x.id, 'unhide') }, 'Show again') : h('button', { class: 'btn', onclick: () => moderate(x.id, 'hide') }, 'Hide listing'),
        h('button', { class: 'btn danger', onclick: () => moderate(x.id, 'delete') }, 'Delete listing'))));
  }
  el.replaceChildren(...kids);
}
async function closeL(x, close){
  try{ await api('oppClose', { id: x.id, closed: close }); C.toast(close ? 'Listing closed. It no longer shows in the feed.' : 'Listing open again.'); O.list = null; O.mine = null; if(O.detail) O.detail.data = null; B.rerender(); }catch(e){ C.toast(e.message); }
}
async function delL(x){
  if(!await C.confirm('Delete this listing?', 'The listing and the requests people sent about it are deleted for good.', 'Delete')) return;
  try{ await api('oppDelete', { id: x.id }); C.toast('Listing deleted.'); O.list = null; O.mine = null; go(O.view === 'mine' ? 'mine' : 'feed'); }catch(e){ C.toast(e.message); }
}
async function moderate(id, action){
  const ask = { hide: ['Hide this listing?', 'It disappears from the feed. The member still sees it, marked as hidden by you.', 'Hide'], delete: ['Delete this listing?', 'The listing, its requests and reports are deleted for good.', 'Delete'] }[action];
  if(ask && !await C.confirm(...ask)) return;
  try{ await api('oppModerate', { id, action }); C.toast(action === 'delete' ? 'Listing deleted.' : action === 'hide' ? 'Listing hidden.' : 'Listing shown again. Its reports are cleared.'); O.list = null; O.reports = null; if(action === 'delete' && O.view === 'detail') return go(O.back === 'reports' ? 'reports' : 'feed'); if(O.detail) O.detail.data = null; B.rerender(); }
  catch(e){ C.toast(e.message); }
}

// ---------- bottom sheet (contact, share, report) ----------
function sheet(title, body, onClose){
  const close = () => { wrap.remove(); document.removeEventListener('keydown', esc); if(onClose) onClose(); };
  const esc = e => { if(e.key === 'Escape') close(); };
  const wrap = h('div', { class: 'op-sheet-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: e => { if(e.target === wrap) close(); } },
    h('div', { class: 'op-sheet' }, h('div', { class: 'op-grab', 'aria-hidden': 'true' }), h('div', { class: 'op-sheet-head' }, h('h3', null, title), h('button', { class: 'bz-x', type: 'button', 'aria-label': 'Close', onclick: close }, '×')), body));
  document.addEventListener('keydown', esc);
  document.body.append(wrap);
  const f = wrap.querySelector('textarea, input'); if(f) setTimeout(() => f.focus({ preventScroll: true }), 50);
  return close;
}
function contactSheet(x){
  const ta = h('textarea', { rows: 5, maxlength: 500, placeholder: x.type === 'need' ? 'Hi! I can help with this. I have…' : "Hi! I'm interested. I'm looking for…" });
  const err = h('div', { class: 'bz-err', role: 'alert' });
  const send = h('button', { class: 'btn bz-gold big', type: 'submit' }, 'Send request');
  const form = h('form', { class: 'bz-form op-form', novalidate: true },
    h('div', { class: 'op-about' }, typePill(x.type), h('b', null, x.title), h('small', null, 'Posted by ' + x.member)),
    h('label', { class: 'bz-field' }, h('span', null, 'Your message to ' + x.member), ta, counter(ta, 500)),
    h('p', { class: 'op-privacy' }, 'Only ' + x.member + ' sees this, with your club name. Your phone and email are not shared. ' + x.member + ' can reply by sharing their contact details with you.'),
    err, send);
  const close = sheet(x.type === 'need' ? 'Offer to help' : 'Show interest', form);
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = ''; send.disabled = true;
    try{ await api('oppRequest', { id: x.id, message: ta.value }); close(); C.toast('Request sent to ' + x.member + '.'); O.list = null; O.mine = null; if(O.detail) O.detail.data = null; B.rerender(); }
    catch(z){ err.textContent = z.message; send.disabled = false; }
  });
}
function reportSheet(x, d){
  let reason = '';
  const reasons = (d.data.reasons || []).map(([id, l]) => h('label', { class: 'op-radio' }, h('input', { type: 'radio', name: 'opr', value: id, onchange: () => { reason = id; } }), h('span', null, l)));
  const note = h('textarea', { rows: 3, maxlength: 300, placeholder: 'Optional: anything the director should know' });
  const err = h('div', { class: 'bz-err', role: 'alert' });
  const sendB = h('button', { class: 'btn big', type: 'submit' }, 'Send report');
  const form = h('form', { class: 'bz-form op-form', novalidate: true }, h('p', { class: 'bz-muted' }, 'Reports go to the club director only. The member is not told who reported.'),
    h('div', { class: 'op-radios', role: 'radiogroup' }, reasons), h('label', { class: 'bz-field' }, h('span', null, 'Note'), note), err, sendB);
  const close = sheet('Report listing', form);
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    if(!reason){ err.textContent = 'Pick a reason.'; return; }
    sendB.disabled = true;
    try{ await api('oppReport', { id: x.id, reason, note: note.value }); close(); C.toast('Thanks. The director will take a look.'); O.list = null; d.data = null; B.rerender(); }
    catch(z){ err.textContent = z.message; sendB.disabled = false; }
  });
}
function shareSheet(r, listing){
  const s = (O.mine && O.mine.suggest) || {};
  const mk = (k, label, attrs, val) => {
    const inp = h('input', { value: val || '', autocomplete: 'off', ...attrs });
    const t = h('input', { type: 'checkbox', checked: !!val });
    inp.disabled = !val; t.addEventListener('change', () => { inp.disabled = !t.checked; if(t.checked) inp.focus(); });
    return { t, inp, el: h('div', { class: 'bz-contact' }, h('label', { class: 'bz-switch' }, t, h('span', null, label)), inp) };
  };
  const em = mk('email', 'Share my email', { type: 'email', inputmode: 'email', maxlength: 120, placeholder: 'you@example.com' }, s.email);
  const ph = mk('phone', 'Share my phone', { type: 'tel', inputmode: 'tel', maxlength: 24, placeholder: '416-555-0100' }, s.phone);
  const note = h('input', { maxlength: 200, placeholder: 'Optional, e.g. "Text me after 6"' });
  const err = h('div', { class: 'bz-err', role: 'alert' });
  const go2 = h('button', { class: 'btn bz-gold big', type: 'submit' }, 'Share with ' + r.from);
  const form = h('form', { class: 'bz-form op-form', novalidate: true },
    h('div', { class: 'op-about' }, h('small', null, r.from + ' wrote about "' + listing.title + '"'), h('p', { class: 'bz-pre' }, r.message)),
    h('p', { class: 'op-privacy' }, 'Only ' + r.from + ' will see what you share here. Switch on what you want to share.' + (s.email || s.phone ? ' Filled in from your business profile: change it if you like.' : '')),
    em.el, ph.el, h('label', { class: 'bz-field' }, h('span', null, 'Note'), note), err, go2);
  const close = sheet('Share your contact details', form);
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const body = { id: r.id, action: 'share', email: em.t.checked ? em.inp.value : '', phone: ph.t.checked ? ph.inp.value : '', note: note.value };
    if(!body.email && !body.phone){ err.textContent = 'Switch on your email or phone (or both) to share it.'; return; }
    go2.disabled = true;
    try{ await api('oppReply', body); close(); C.toast('Shared with ' + r.from + '.'); O.mine = null; O.badgeAt = 0; B.rerender(); }
    catch(z){ err.textContent = z.message; go2.disabled = false; }
  });
}

// ---------- create / edit ----------
function renderForm(el){
  const f = O.form || { type: 'need' }, ed = f.edit;
  const cats = O.cats.length ? O.cats : null;
  if(!cats) return loading(el, [], api('oppList').then(r => { O.cats = r.categories; O.list = r; }), () => O.view === 'form' && renderForm(el));
  let type = ed ? ed.type : f.type;
  const tbtn = t => h('button', { type: 'button', role: 'radio', class: 'op-tsel ' + t, 'aria-checked': String(type === t), onclick: () => { type = t; tsel.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.classList.contains(type)))); hint(); drawStarters(); } }, h('b', null, TYPE[t]), h('small', null, t === 'need' ? 'Ask members for help' : 'Offer your help or skills'));
  const tsel = h('div', { class: 'op-tsels', role: 'radiogroup', 'aria-label': 'Type' }, tbtn('need'), tbtn('offer'));
  const title = h('input', { maxlength: 80, value: ed ? ed.title : '', autocomplete: 'off', 'aria-labelledby': 'op_tl' });
  const details = h('textarea', { rows: 5, maxlength: 600, value: ed ? ed.details : '' });
  // category: tap a chip (no typing)
  const cat = { value: ed ? ed.category : '' };
  const catChips = h('div', { class: 'op-catchips', role: 'radiogroup', 'aria-label': 'Category' }, cats.map(([id, l]) => h('button', { type: 'button', role: 'radio', class: 'bz-chip', 'data-c': id, 'aria-checked': String(cat.value === id), 'aria-pressed': String(cat.value === id),
    onclick: e => { cat.value = id; catChips.querySelectorAll('button').forEach(b => { const on = b.dataset.c === id; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-checked', String(on)); }); } }, l)));
  // suggested title starters: one tap, then finish the sentence
  const STARTERS = { need: ['Looking for a ', 'Can anyone recommend a ', 'Need help with '], offer: ['Can help with ', 'Free advice on ', 'Happy to help with '] };
  const starters = h('div', { class: 'op-starters' });
  const drawStarters = () => starters.replaceChildren(...STARTERS[type].map(t => h('button', { type: 'button', class: 'op-starter', onclick: () => { title.value = t; title.dispatchEvent(new Event('input')); title.focus(); title.setSelectionRange(t.length, t.length); } }, t.trim() + '…')));
  const area = h('input', { maxlength: 60, value: ed ? ed.area : '', placeholder: 'e.g. Toronto, East end, Remote', autocomplete: 'off' });
  const exp = h('select', null, ed ? h('option', { value: '' }, 'Keep: ' + ends(ed.expiresAt).toLowerCase()) : null, [7, 14, 30, 60, 90].map(n => h('option', { value: String(n) }, n + ' days' + (n === 30 && !ed ? ' (usual)' : ''))));
  exp.value = ed ? '' : '30';
  const hint = () => { title.placeholder = type === 'need' ? 'e.g. Looking for a good accountant' : 'e.g. Can help with resumes and cover letters'; details.placeholder = type === 'need' ? 'What do you need, and by when?' : 'What can you help with? Any limits?'; };
  hint(); drawStarters();
  const err = h('div', { class: 'bz-err', role: 'alert' });
  const save = h('button', { class: 'btn bz-gold big', type: 'submit' }, ed ? 'Save changes' : 'Post to the club');
  const form = h('form', { class: 'form bz-form', novalidate: true },
    tsel,
    h('div', { class: 'bz-field' }, h('span', { id: 'op_tl' }, 'Short title', h('i', null, ' required')), ed ? null : starters, title, counter(title, 80)),
    h('div', { class: 'bz-field' }, h('span', null, 'Category', h('i', null, ' required')), catChips),
    h('label', { class: 'bz-field' }, h('span', null, 'Details (optional)'), details, counter(details, 600)),
    h('div', { class: 'op-two' }, h('label', { class: 'bz-field' }, h('span', null, 'Area (optional)'), area), h('label', { class: 'bz-field' }, h('span', null, 'Show it for'), exp)),
    h('p', { class: 'op-privacy' }, 'No links, phone numbers or emails in the listing. Members reach you with a private request, and you choose whether to share your contact details.'),
    err, h('div', { class: 'bz-stack' }, save, h('button', { class: 'btn big', type: 'button', onclick: () => go(ed ? 'mine' : 'feed') }, 'Cancel')));
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = ''; save.disabled = true;
    const body = { type, title: title.value, details: details.value, category: cat.value, area: area.value };
    if(exp.value) body.expiresInDays = +exp.value;
    if(ed) body.id = ed.id;
    try{ const r = await api('oppSave', body); O.list = null; O.mine = null; C.toast(ed ? 'Saved.' : 'Posted. Club members can see it now.'); openDetail(r.item.id, ed ? 'mine' : 'feed'); }
    catch(z){ err.textContent = z.message; save.disabled = false; err.scrollIntoView({ block: 'center' }); }
  });
  el.replaceChildren(back(ed ? 'My opportunities' : 'Opportunities', () => go(ed ? 'mine' : 'feed')),
    h('div', { class: 'card-box' }, h('span', { class: 'eyebrow bz-eyebrow' }, ed ? 'Edit listing' : type === 'need' ? 'Ask the club for help' : 'Offer your help'), form));
}

// ---------- my opportunities ----------
function renderMine(el){
  const bk = back('Opportunities', () => go('feed'));
  if(!O.mine) return loading(el, [bk], api('oppMine').then(r => { O.mine = r; O.cats = r.categories; O.badge = r.listings.reduce((n, l) => n + l.requests.filter(q => q.status === 'sent').length, 0); O.badgeAt = Date.now(); }), () => { if(O.view === 'mine' && root === el) renderMine(el); });
  const M = O.mine, waiting = O.badge || 0;
  const seg = h('div', { class: 'op-seg small', role: 'tablist' },
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(O.mineTab !== 'sent'), onclick: () => { O.mineTab = 'listings'; renderMine(el); } }, 'My listings', waiting ? h('span', { class: 'op-dot' }, String(waiting)) : null),
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(O.mineTab === 'sent'), onclick: () => { O.mineTab = 'sent'; renderMine(el); } }, 'Requests I sent'));
  const kids = [bk, h('div', { class: 'card-box bz-head' }, h('span', { class: 'eyebrow bz-eyebrow' }, 'Opportunity Club'), h('h2', null, 'My opportunities'), seg)];
  if(O.mineTab === 'sent'){
    if(!M.sent.length) kids.push(h('div', { class: 'card-box bz-empty' }, h('span', { class: 'bz-empty-art', 'aria-hidden': 'true' }, I('inbox')), h('h3', null, 'No requests yet'), h('p', null, 'When you tap "I can help" or "I\'m interested" on a listing, it shows up here with the reply.'), h('button', { class: 'btn big', onclick: () => go('feed') }, 'Browse listings')));
    for(const r of M.sent) kids.push(sentCard(r));
  } else {
    if(!M.listings.length) kids.push(h('div', { class: 'card-box bz-empty' }, h('span', { class: 'bz-empty-art', 'aria-hidden': 'true' }, I('spark')), h('h3', null, 'You have no listings'), h('p', null, 'Post what you need or what you can offer. You can have ' + M.limits.open + ' open at a time.'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn bz-gold big', onclick: () => newListing('need') }, 'I need help'), h('button', { class: 'btn big', onclick: () => newListing('offer') }, 'I can help'))));
    else kids.push(h('p', { class: 'bz-count' }, M.limits.openNow + ' of ' + M.limits.open + ' open listings'));
    for(const x of M.listings) kids.push(mineCard(x));
  }
  el.replaceChildren(...kids);
}
function mineCard(x){
  const reqs = x.requests;
  return h('div', { class: 'card-box op-mine ' + x.type },
    h('div', { class: 'op-card-top' }, typePill(x.type), pill(x.state)),
    h('button', { class: 'op-title-btn', type: 'button', onclick: () => openDetail(x.id, 'mine') }, h('b', null, x.title), h('small', null, x.categoryLabel + ' · ' + ends(x.expiresAt))),
    h('div', { class: 'op-reqs' }, h('span', { class: 'eyebrow bz-eyebrow' }, reqs.length ? 'Requests (' + reqs.length + ')' : 'No requests yet'),
      reqs.map(r => h('div', { class: 'op-req ' + r.status },
        h('div', { class: 'op-req-head' }, h('b', null, r.from), h('small', null, ago(r.createdAt))),
        h('p', { class: 'bz-pre' }, r.message),
        r.status === 'sent' ? h('div', { class: 'btn-row' }, h('button', { class: 'btn bz-gold', onclick: () => shareSheet(r, x) }, 'Share contact'), h('button', { class: 'btn', onclick: () => decline(r) }, 'Decline'))
          : r.status === 'shared' ? h('p', { class: 'op-status shared' }, 'You shared: ' + [r.shared.email, r.shared.phone].filter(Boolean).join(', ') + (r.shared.note ? ' · "' + r.shared.note + '"' : ''))
          : h('p', { class: 'op-status declined' }, 'You declined.')))),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => newListing(x.type, x) }, 'Edit'),
      x.state === 'open' ? h('button', { class: 'btn', onclick: () => closeL(x, true) }, 'Close') : x.state === 'closed' ? h('button', { class: 'btn', onclick: () => closeL(x, false) }, 'Reopen') : null,
      h('button', { class: 'btn danger', onclick: () => delL(x) }, 'Delete')));
}
async function decline(r){
  if(!await C.confirm('Decline this request?', r.from + ' sees that you declined. No contact details are shared.', 'Decline')) return;
  try{ await api('oppReply', { id: r.id, action: 'decline' }); O.mine = null; O.badgeAt = 0; B.rerender(); }catch(e){ C.toast(e.message); }
}
function ext(href, label){ return h('a', { class: 'bz-act', href, rel: 'noopener noreferrer nofollow' }, label); }
function sentCard(r){
  const L = r.listing, st = r.status;
  const contact = [];
  if(st === 'shared' && r.shared){
    if(r.shared.email) contact.push(ext('mailto:' + r.shared.email, '✉ ' + r.shared.email));
    if(r.shared.phone) contact.push(ext('tel:' + r.shared.phone.replace(/[^\d+]/g, ''), '✆ ' + r.shared.phone));
  }
  return h('div', { class: 'card-box op-sent ' + st },
    h('div', { class: 'op-card-top' }, h('span', { class: 'op-state ' + (st === 'shared' ? 'good' : st === 'declined' ? 'idle' : '') }, st === 'shared' ? 'Contact shared' : st === 'declined' ? 'Declined' : 'Sent · waiting'), h('small', null, ago(r.createdAt))),
    L ? h('button', { class: 'op-title-btn', type: 'button', onclick: () => L.state === 'open' ? openDetail(L.id, 'mine') : null }, h('b', null, L.title), h('small', null, SHORT[L.type] + ' · ' + L.member)) : h('p', { class: 'bz-muted' }, 'This listing is no longer available.'),
    h('p', { class: 'op-mymsg' }, 'You wrote: ', h('span', null, r.message)),
    contact.length ? h('div', { class: 'bz-acts' }, contact) : null,
    st === 'shared' && r.shared && r.shared.note ? h('p', { class: 'op-status shared' }, '"' + r.shared.note + '"') : null,
    h('button', { class: 'op-report', type: 'button', onclick: async () => { if(!await C.confirm('Delete this request?', st === 'sent' ? 'The member will no longer see it.' : 'It is removed from your list.', 'Delete')) return; try{ await api('oppRequestDelete', { id: r.id }); O.mine = null; B.rerender(); }catch(e){ C.toast(e.message); } } }, 'Delete request'));
}

// ---------- director: reports queue ----------
function renderReports(el){
  const bk = back('Opportunities', () => go('feed'));
  if(!O.reports) return loading(el, [bk], api('oppReports').then(r => { O.reports = r; }), () => { if(O.view === 'reports' && root === el) renderReports(el); });
  const items = O.reports.items;
  const kids = [bk, h('div', { class: 'card-box bz-head' }, h('span', { class: 'eyebrow bz-eyebrow' }, 'Director'), h('h2', null, 'Reports queue'),
    h('p', null, 'Listings members reported, and listings that are hidden. A listing with 3 reports hides itself until you look at it.'))];
  if(!items.length) kids.push(h('div', { class: 'card-box bz-empty' }, h('div', { class: 'bz-empty-art', 'aria-hidden': 'true' }, '✓'), h('h3', null, 'All clear'), h('p', null, 'No reported or hidden listings.')));
  for(const x of items) kids.push(h('div', { class: 'card-box op-q ' + x.state },
    h('div', { class: 'op-card-top' }, typePill(x.type), pill(x.state)),
    h('button', { class: 'op-title-btn', type: 'button', onclick: () => openDetail(x.id, 'reports') }, h('b', null, x.title), h('small', null, x.categoryLabel + ' · by ' + x.member + ' · ' + ago(x.createdAt))),
    x.details ? h('p', { class: 'op-snip' }, x.details) : null,
    x.reports.length ? h('ul', { class: 'op-replist' }, x.reports.map(r => h('li', null, h('b', null, r.reasonLabel), ' · ' + r.by + ', ' + ago(r.at), r.note ? h('span', { class: 'op-note' }, '"' + r.note + '"') : null))) : h('p', { class: 'bz-muted' }, 'No open reports.'),
    h('div', { class: 'btn-row' },
      x.state === 'hidden' || x.state === 'review' ? h('button', { class: 'btn', onclick: () => moderate(x.id, 'unhide') }, 'Show again') : h('button', { class: 'btn', onclick: () => moderate(x.id, 'dismiss') }, 'Dismiss reports'),
      x.state !== 'hidden' ? h('button', { class: 'btn', onclick: () => moderate(x.id, 'hide') }, x.state === 'review' ? 'Keep hidden' : 'Hide') : null,
      h('button', { class: 'btn danger', onclick: () => moderate(x.id, 'delete') }, 'Delete'))));
  el.replaceChildren(...kids);
}

// ---------- the count on the Business tab: requests waiting for my answer. Never while seated in a running tournament. ----------
function badge(btn, playing){
  if(!btn) return;
  let dot = btn.querySelector('.op-tabdot');
  const draw = () => {
    const n = playing ? 0 : O.badge || 0;
    if(!n){ if(dot) dot.remove(); dot = null; return; }
    if(!dot){ dot = document.createElement('span'); dot.className = 'op-tabdot'; btn.append(dot); }
    dot.textContent = n > 9 ? '9+' : String(n); dot.setAttribute('aria-label', n + ' opportunity requests waiting');
  };
  draw();
  if(playing || Date.now() - O.badgeAt < 60000) return;
  O.badgeAt = Date.now();
  api('oppBadge').then(r => { O.badge = r.pending; draw(); }).catch(() => {});
}

// ---------- Home: the Opportunities section (hidden while seated in a running tournament) ----------
let homeData = null, homeAt = 0;
function homeInto(sec){
  const n = homeData ? homeData.items.length : 0;
  const head = B.secHead('hs-opp', ['spark', 'opp'], 'Opportunities', n ? (n === 1 ? '1 open listing' : n + ' open listings') : 'Ask the club, or offer a hand', homeData ? [n ? 'See all' : 'Open', () => go('feed')] : null);
  if(!homeData){ sec.replaceChildren(head, bigButtons(), h('div', { class: 'op-homelist', 'aria-hidden': 'true' }, h('span', { class: 'op-card sk' }), h('span', { class: 'op-card sk' }))); return; }
  const items = homeData.items.slice(0, 4);
  sec.replaceChildren(...[head, bigButtons(),
    homeData.pending ? h('button', { class: 'op-row op-waiting', type: 'button', onclick: () => go('mine') }, h('span', null, h('b', null, 'Requests waiting for you'), h('small', null, 'In My opportunities')), h('span', { class: 'op-dot big' }, String(homeData.pending)), I('chev', 'bz-chev')) : null,
    items.length ? h('div', { class: 'op-homelist', role: 'list', 'aria-label': 'Open listings' }, items.map(x => { const c = oppCard(x, true); c.setAttribute('role', 'listitem'); return c; }))
      : h('div', { class: 'card-box bz-empty sm op-none' }, h('span', { class: 'bz-empty-art', 'aria-hidden': 'true' }, I('spark')), h('p', null, h('b', null, 'No open listings yet. '), 'Need a hand, or happy to help? Be the first to post.'))].filter(Boolean));
}
function mountHome(sec, playing){
  if(playing){ sec.replaceChildren(); return; }
  homeInto(sec);
  if(Date.now() - homeAt > 30000){ homeAt = Date.now(); api('oppList').then(r => { homeData = r; O.cats = r.categories; O.badge = r.pending; if(sec.isConnected) homeInto(sec); }).catch(() => { homeAt = 0; }); }
}

window.OppClub = {
  mountHome,
  init(ctx){ C = ctx.C; h = ctx.h; B = ctx; },
  render, topBar, badge, newListing,
  open(view){ O.view = view || 'feed'; if(view === 'feed' || !view){ O.list = null; } },
  reset(){ Object.assign(O, { view: 'feed', list: null, mine: null, reports: null, badge: null, badgeAt: 0 }); }
};
})();
