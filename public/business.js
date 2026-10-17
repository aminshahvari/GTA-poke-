// Business Club: members' own businesses, in a private directory only signed-in members can open.
// Separate from poker: no ratings, points or results here. Every piece of member text is put on the
// page with textContent (never innerHTML), and every outside link opens with rel="noopener noreferrer nofollow".
(function(){
'use strict';
const S = { view: 'list', detail: null, list: null, feed: null, feedAt: 0, mine: undefined, cats: [], canModerate: false,
  q: '', cat: '', prefill: null, fromScan: false, scan: null, railX: 0, pendingLogo: undefined, back: 'list', seg: 'biz' };
let C = null;
const logos = new Map();
const NEW_MS = 30 * 864e5;

// ---------- tiny DOM helper: strings always become text nodes ----------
function h(tag, props, ...kids){
  const el = document.createElement(tag);
  if(props) for(const [k, v] of Object.entries(props)){
    if(v == null || v === false) continue;
    if(k === 'class') el.className = v;
    else if(k === 'text') el.textContent = v;
    else if(k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if(k === 'value') el.value = v;
    else if(k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for(const k of kids.flat(Infinity)) if(k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
const api = (name, body) => C.post('/api/' + name, body || {});
const I = (name, cls) => window.Icons.el(name, cls);
const catId = b => window.Icons.cat(b.category, b.categoryLabel);
const catLabel = id => (S.cats.find(c => c[0] === id) || [, 'Other'])[1];
// staging demo rows (fake Test Player accounts): always labelled Demo so they never pass for a real member's business
const isDemo = b => !!b.demo || /^Test Player \d+$/.test(b.member || '') || /\(Demo profile/.test(b.description || '');
const isNew = b => b.publishedAt && Date.now() - b.publishedAt < NEW_MS;
// outside links: only http(s), mailto and tel ever reach an href, and the server has checked them already
function ext(href, label, cls, icon){
  if(!/^(https?:\/\/|mailto:|tel:)/i.test(href)) return null;
  const web = /^https?:/i.test(href);
  return h('a', { class: cls, href, target: web ? '_blank' : null, rel: 'noopener noreferrer nofollow' }, icon ? h('span', { class: 'bz-ic', 'aria-hidden': 'true' }, icon) : null, h('span', null, label));
}

// ---------- logos: fetched with the member's token, shown from a blob ----------
const HUES = 6;
function hue(s){ let x = 0; for(const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % HUES; }
const mono = name => String(name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(w => w && !/^(the|and|of|&)$/i.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '★';
function getLogo(uid, v){
  const k = uid + ':' + v;
  if(!logos.has(k)) logos.set(k, fetch('/bizlogo/' + encodeURIComponent(uid), { headers: { authorization: 'Bearer ' + (C.token() || '') } })
    .then(r => r.ok ? r.blob() : null).then(b => b && b.type === 'image/jpeg' ? URL.createObjectURL(b) : null).catch(() => null));
  return logos.get(k);
}
function logoEl(b, cls){
  const el = h('div', { class: 'bz-logo h' + hue(b.uid) + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }, h('span', null, mono(b.name)));
  if(b.logoV) getLogo(b.uid, b.logoV).then(url => { if(url) el.replaceChildren(h('img', { src: url, alt: '' })); });
  return el;
}

// ---------- data ----------
async function loadFeed(){ S.feed = await api('bizFeed'); S.feedAt = Date.now(); return S.feed; }
async function loadList(){ const r = await api('bizList'); S.list = r; S.cats = r.categories; S.canModerate = r.canModerate; return r; }
async function loadMine(){ const r = await api('bizMine'); S.mine = r.mine; S.cats = r.categories; S.canModerate = r.canModerate; return r; }

let root = null;
function go(view, extra){
  Object.assign(S, { view }, extra || {});
  if(C.tab() !== 'biz') return C.openTab('biz');
  render(root);
  if(root) root.scrollTop = 0;
}

// ---------- the Business Club tab ----------
function render(el){
  root = el; if(!el) return;
  const v = S.view;
  // Opportunities (public/opportunity.js) shares the tab: its own views, under the same two entry buttons
  if(v === 'list' && S.seg === 'opp') return window.OppClub.render(el);
  if(v === 'detail') return renderDetail(el);
  if(v === 'mine') return renderMine(el);
  if(v === 'edit') return renderEdit(el);
  if(v === 'scan') return renderScan(el);
  return renderList(el);
}

function header(){
  const status = S.mine === undefined ? null : !S.mine ? 'Add your business' : S.mine.published && !S.mine.modHidden ? 'My business · Listed' : 'My business · Not listed';
  return h('div', { class: 'card-box bz-head' },
    h('div', { class: 'bz-head-t' }, h('span', { class: 'hsec-ic biz' }, I('briefcase')), h('div', null,
      h('span', { class: 'eyebrow bz-eyebrow' }, 'Business Club'),
      h('h2', null, "Members' businesses"))),
    h('p', null, 'Work with people you already play with. Only signed-in club members can see this directory. It has nothing to do with poker results.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn bz-gold big', onclick: () => go('mine') }, status || 'My business')));
}

// A visual business card: a cover tinted by industry with its icon, the logo (or a monogram placeholder: never a
// made-up photo), name, industry and the member who owns it. One tap opens the detail.
function bizCard(b, opts = {}){
  const cid = catId(b);
  return h('button', { class: 'bz-vcard c-' + cid + (opts.spot ? ' spot' : ''), type: 'button', onclick: () => openDetail(b.uid, opts.from) },
    h('span', { class: 'bz-cover', 'aria-hidden': 'true' }, I(cid, 'bz-cover-ic')),
    opts.spot ? h('span', { class: 'bz-ribbon' }, I('star'), 'Spotlight') : isNew(b) ? h('span', { class: 'bz-new' }, 'New') : null,
    isDemo(b) ? h('span', { class: 'demo-tag bz-demo' }, 'Demo') : null,
    logoEl(b, 'lg bz-vlogo'),
    h('span', { class: 'bz-vbody' },
      h('b', { class: 'bz-vname' }, b.name),
      h('span', { class: 'bz-vcat' }, I(cid), h('span', null, b.categoryLabel)),
      b.area ? h('small', { class: 'bz-varea' }, I('pin'), h('span', null, b.area)) : null,
      h('small', { class: 'bz-by' }, I('users'), h('span', null, b.member))));
}

function filtered(){
  const items = (S.list && S.list.items) || [], q = S.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(b => (!S.cat || b.category === S.cat) &&
    (!q.length || q.every(w => [b.name, b.categoryLabel, b.services, b.description, b.area, b.member].join(' ').toLowerCase().includes(w))));
}

function renderList(el){
  if(!S.list){
    el.replaceChildren(window.OppClub.topBar('biz'), header(), h('div', { class: 'empty' }, 'Opening the Business Club…'));
    Promise.all([loadList(), S.mine === undefined ? loadMine() : null]).then(() => { if(S.view === 'list' && S.seg === 'biz' && root === el) renderList(el); }).catch(e => el.replaceChildren(window.OppClub.topBar('biz'), header(), h('div', { class: 'empty' }, e.message)));
    return;
  }
  const L = S.list, items = L.items;
  const kids = [window.OppClub.topBar('biz'), header()];
  if(L.spotlight){
    const b = L.spotlight;
    kids.push(h('div', { class: 'card-box bz-spot' },
      h('span', { class: 'eyebrow bz-eyebrow bz-eyeic' }, I('star'), 'Member Spotlight'),
      h('button', { class: 'bz-spot-main c-' + catId(b), type: 'button', onclick: () => openDetail(b.uid) },
        logoEl(b, 'xl'),
        h('span', { class: 'bz-card-txt' }, h('b', null, b.name), h('small', null, b.categoryLabel + (b.area ? ' · ' + b.area : '')),
          b.description ? h('span', { class: 'bz-spot-desc' }, b.description) : null, h('small', { class: 'bz-by' }, 'Member: ' + b.member)))));
  }
  if(!items.length){
    kids.push(h('div', { class: 'card-box bz-empty' },
      h('div', { class: 'bz-empty-art', 'aria-hidden': 'true' }, I('briefcase')),
      h('h3', null, 'No member businesses yet'),
      h('p', null, S.mine ? 'Your profile is saved. Publish it to be the first business in the club.' : 'Be the first: scan your business card or type in a few details. Nothing is shown until you publish it.'),
      h('div', { class: 'btn-row' }, S.mine ? h('button', { class: 'btn bz-gold big', onclick: () => go('mine') }, 'Go to my business')
        : [h('button', { class: 'btn bz-gold big', onclick: () => go('scan') }, 'Scan your business card'), h('button', { class: 'btn big', onclick: () => startEdit() }, 'Type it in')])));
  } else {
    const search = h('input', { type: 'search', class: 'bz-search', placeholder: 'Search name, industry or service', 'aria-label': 'Search businesses', value: S.q, enterkeyhint: 'search', autocomplete: 'off' });
    const present = new Set(items.map(b => b.category));
    const chips = h('div', { class: 'bz-chips', role: 'group', 'aria-label': 'Filter by industry' },
      [['', 'All'], ...S.cats.filter(c => present.has(c[0]))].map(([id, l]) => h('button', { type: 'button', class: 'bz-chip', 'aria-pressed': String(S.cat === id), onclick: () => { S.cat = id; renderList(el); } }, l)));
    const grid = h('div', { class: 'bz-grid' });
    const fill = () => {
      const f = filtered();
      grid.replaceChildren(...(f.length ? f.map(b => bizCard(b)) : [h('div', { class: 'card-box bz-empty bz-nomatch' }, h('span', { class: 'bz-empty-art', 'aria-hidden': 'true' }, I('search')), h('p', null, 'No businesses match that search.'), h('button', { class: 'btn', onclick: () => { S.q = ''; S.cat = ''; renderList(el); } }, 'Clear search'))]));
    };
    search.addEventListener('input', () => { S.q = search.value; fill(); });
    kids.push(h('div', { class: 'bz-find' }, search, chips));
    if(L.recent.length && !S.q && !S.cat){
      kids.push(h('div', { class: 'card-box bz-recent' }, h('span', { class: 'eyebrow bz-eyebrow' }, 'New to the Club'),
        h('div', { class: 'bz-rail' }, L.recent.map(b => miniCard(b)))));
    }
    kids.push(h('div', { class: 'bz-count' }, items.length === 1 ? '1 business' : items.length + ' businesses'), grid);
    fill();
  }
  if(L.canModerate && L.hidden && L.hidden.length){
    kids.push(h('div', { class: 'card-box warn' }, h('span', { class: 'eyebrow' }, 'Hidden by you'),
      h('div', { class: 'table-list' }, L.hidden.map(x => h('div', { class: 'trow' }, h('b', null, x.name), h('small', null, x.member),
        h('button', { class: 'back', onclick: async () => { await api('bizModerate', { uid: x.uid, hidden: false }); C.toast('Shown in the directory again.'); refresh(); } }, 'Show again'))))));
  }
  kids.push(h('p', { class: 'note' }, 'Business Club is free and private. No ads, no payments. Members choose what to show, and can hide or delete their profile any time.'));
  el.replaceChildren(...kids);
}
function refresh(){ S.list = null; S.feed = null; S.feedAt = 0; render(root); }

function miniCard(b, from, spot){ return bizCard(b, { from, spot }); }

// ---------- detail ----------
function openDetail(uid, from){ go('detail', { detail: { uid, data: null }, back: from || 'list' }); }
function renderDetail(el){
  const d = S.detail;
  const back = h('button', { class: 'bz-back', type: 'button', onclick: () => S.back === 'home' ? C.openTab('event') : S.back === 'opp' ? go('list', { seg: 'opp' }) : go(S.back === 'mine' ? 'mine' : 'list') }, '‹ ' + (S.back === 'home' ? 'Home' : S.back === 'mine' ? 'My business' : S.back === 'opp' ? 'Back to the listing' : 'Business Club'));
  if(!d.data){
    el.replaceChildren(back, h('div', { class: 'empty' }, 'Opening…'));
    api('bizGet', { uid: d.uid }).then(r => { d.data = r; if(S.view === 'detail' && S.detail === d) renderDetail(el); })
      .catch(e => el.replaceChildren(back, h('div', { class: 'card-box bz-empty' }, h('h3', null, 'Not available'), h('p', null, e.message))));
    return;
  }
  const b = d.data.business, c = b.contacts, links = [];
  if(c.website) links.push(ext(c.website, 'Website', 'bz-act', I('globe')));
  if(c.instagram) links.push(ext(c.instagram.url, '@' + c.instagram.handle, 'bz-act', I('insta')));
  if(c.email) links.push(ext('mailto:' + c.email, 'Email', 'bz-act', I('mail')));
  if(c.phone) links.push(ext('tel:' + c.phone.tel, 'Call ' + c.phone.text, 'bz-act', I('phone')));
  if(links[0]) links[0].classList.add('primary');
  const sect = (title, body) => body ? h('div', { class: 'bz-sect' }, h('span', { class: 'eyebrow bz-eyebrow' }, title), h('p', { class: 'bz-pre' }, body)) : null;
  const kids = [back,
    h('div', { class: 'card-box bz-detail c-' + catId(b) + (d.data.spotlight ? ' spot' : '') },
      h('div', { class: 'bz-dcover', 'aria-hidden': 'true' }, I(catId(b), 'bz-cover-ic')),
      d.data.spotlight ? h('span', { class: 'eyebrow bz-eyebrow bz-eyeic' }, I('star'), 'Member Spotlight') : null,
      h('div', { class: 'bz-hero' }, logoEl(b, 'xl'),
        h('div', null, h('h2', null, b.name), h('div', { class: 'bz-tags' }, h('span', { class: 'bz-tag cat' }, I(catId(b)), b.categoryLabel), b.referrals ? h('span', { class: 'bz-tag good' }, 'Open to referrals') : null, isNew(b) ? h('span', { class: 'bz-tag' }, 'New') : null, isDemo(b) ? h('span', { class: 'demo-tag' }, 'Demo') : null),
          b.fullName ? h('div', { class: 'bz-person' }, b.fullName + (b.jobTitle ? ', ' + b.jobTitle : '')) : null,
          h('small', { class: 'bz-by' }, 'Club member: ' + b.member))),
      sect('About', b.description), sect('Services', b.services), sect('Service area', b.area), sect('Address', c.address),
      h('div', { class: 'bz-sect' }, h('span', { class: 'eyebrow bz-eyebrow' }, 'Connect'),
        links.length ? h('div', { class: 'bz-acts' }, links) : h('p', null, 'This member has not shared contact details here yet. Say hello at the next tournament.')))];
  if(S.canModerate || d.data.canModerate){
    kids.push(h('div', { class: 'card-box bz-dir' }, h('span', { class: 'eyebrow' }, 'Director'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: async () => { try{ await api('bizSpotlight', { uid: d.data.spotlight ? null : b.uid }); C.toast(d.data.spotlight ? 'Spotlight cleared.' : 'Now in the Member Spotlight.'); S.list = null; S.feedAt = 0; d.data = null; renderDetail(el); }catch(e){ C.toast(e.message); } } }, d.data.spotlight ? 'Remove from spotlight' : '★ Put in spotlight'),
        h('button', { class: 'btn', onclick: async () => { if(!await C.confirm('Hide this business?', 'It disappears from the directory for everyone except its owner. You can show it again later.', 'Hide it')) return; try{ await api('bizModerate', { uid: b.uid, hidden: true }); C.toast('Hidden from the directory.'); S.list = null; S.feedAt = 0; go('list'); }catch(e){ C.toast(e.message); } } }, 'Hide from directory')),
      h('p', { class: 'note' }, 'One business can be in the spotlight at a time. It shows at the top of the directory and on Home.')));
  }
  el.replaceChildren(...kids);
}

// ---------- my business ----------
const FIELD_NAMES = { website: 'Website', instagram: 'Instagram', email: 'Email', phone: 'Phone', address: 'Address', fullName: 'Full name' };
function renderMine(el){
  const back = h('button', { class: 'bz-back', type: 'button', onclick: () => go('list') }, '‹ Business Club');
  if(S.mine === undefined){ el.replaceChildren(back, h('div', { class: 'empty' }, 'Opening…')); loadMine().then(() => S.view === 'mine' && renderMine(el)).catch(e => C.toast(e.message)); return; }
  const m = S.mine;
  if(!m){
    el.replaceChildren(back, introCard(false));
    return;
  }
  const listed = m.published && !m.modHidden;
  const shown = Object.keys(FIELD_NAMES).filter(k => m.show && m.show[k]), notShown = Object.keys(FIELD_NAMES).filter(k => m[k] && !(m.show && m.show[k]));
  const pill = listed ? h('span', { class: 'status-pill' }, 'Listed · club members can see it') : m.modHidden && m.published ? h('span', { class: 'status-pill idle' }, 'Hidden by the club director') : h('span', { class: 'status-pill idle' }, 'Not listed · only you can see it');
  const kids = [back,
    h('div', { class: 'card-box bz-mine' },
      h('span', { class: 'eyebrow bz-eyebrow' }, 'My business'), pill,
      h('div', { class: 'bz-hero' }, logoEl({ uid: C.me().id, name: m.name, logoV: m.logoV }, 'xl'), h('div', null, h('h2', null, m.name), h('small', null, m.categoryLabel + (m.area ? ' · ' + m.area : '')))),
      h('p', null, shown.length ? 'Shown to members: ' + shown.map(k => FIELD_NAMES[k]).join(', ') + '.' : 'No contact details are shown to members yet. Turn on "Show to members" next to the ones you want to share.'),
      notShown.length ? h('p', { class: 'bz-muted' }, 'Kept private: ' + notShown.map(k => FIELD_NAMES[k]).join(', ') + '.') : null,
      h('div', { class: 'btn-row' },
        listed || (m.modHidden && m.published)
          ? h('button', { class: 'btn big', onclick: () => publish(false) }, 'Hide from the directory')
          : h('button', { class: 'btn bz-gold big', onclick: () => publish(true) }, 'Publish to the club'),
        h('button', { class: 'btn big', onclick: () => startEdit() }, 'Edit details')),
      h('div', { class: 'btn-row' },
        listed ? h('button', { class: 'btn', onclick: () => openDetail(C.me().id, 'mine') }, 'See it as members do') : null,
        h('button', { class: 'btn', onclick: () => go('scan') }, 'Scan a card again'),
        h('button', { class: 'btn danger', onclick: del }, 'Delete profile'))),
    h('p', { class: 'note' }, 'Publishing shows your business to signed-in club members only. It is never shown on the open web, and nothing about your poker play appears on it.')];
  el.replaceChildren(...kids);
}
async function publish(on){
  if(on && !await C.confirm('Publish your business?', 'Club members will see your business name, industry, description, services and area, plus only the contact details you switched on.', 'Publish')) return;
  try{ const r = await api('bizPublish', { on }); S.mine = r.mine; S.list = null; S.feedAt = 0; C.toast(on ? 'Published. Club members can see it now.' : 'Hidden. Only you can see it now.'); render(root); }
  catch(e){ C.toast(e.message); }
}
async function del(){
  if(!await C.confirm('Delete your business profile?', 'Everything you entered and your logo are deleted for good.', 'Delete')) return;
  try{ await api('bizDelete'); S.mine = null; S.list = null; S.feedAt = 0; C.toast('Business profile deleted.'); go('list'); }
  catch(e){ C.toast(e.message); }
}

function introCard(home){
  const close = home ? h('button', { class: 'bz-x', type: 'button', 'aria-label': 'Not now', onclick: async () => { try{ await api('bizIntro', { dismiss: true }); }catch(e){} if(S.feed) S.feed.introDismissed = true; const n = close.closest('.bz-intro'); if(n) n.remove(); } }, '×') : null;
  return h('div', { class: 'card-box bz-intro' }, close,
    h('span', { class: 'eyebrow bz-eyebrow' }, 'Business Club'),
    h('h3', null, 'Introduce your business'),
    h('p', null, 'Own a business or freelance? Let club members find you. Scan your business card and it is ready in under a minute. Nothing is shown until you publish.'),
    h('div', { class: 'bz-stack' },
      h('button', { class: 'btn bz-gold big btn-ic', onclick: () => go('scan', { scan: null }) }, I('camera'), 'Scan your business card'),
      h('button', { class: 'btn big', onclick: () => startEdit() }, 'Type it in instead')));
}

// ---------- edit form ----------
function startEdit(prefill){ S.pendingLogo = undefined; go('edit', { prefill: prefill || null, fromScan: !!prefill }); }
function renderEdit(el){
  if(S.mine === undefined || !S.cats.length){ el.replaceChildren(h('div', { class: 'empty' }, 'Opening…')); loadMine().then(() => S.view === 'edit' && renderEdit(el)).catch(e => C.toast(e.message)); return; }
  const m = S.mine || {}, p = S.prefill || {}, scan = S.fromScan;
  const val = k => p[k] != null && p[k] !== '' ? p[k] : m[k] || '';
  const ids = {};
  const CARD = ['name', 'category', 'fullName', 'jobTitle', 'phone', 'email', 'website', 'address'];
  const missing = k => scan && CARD.includes(k) && !val(k);
  const input = (k, label, attrs = {}, tag = 'input') => {
    const el2 = h(tag, { id: 'bz_' + k, value: val(k), autocomplete: 'off', ...attrs, placeholder: missing(k) ? 'Not found on the card. Type it in' : attrs.placeholder });
    ids[k] = el2;
    return h('label', { class: 'bz-field' + (missing(k) ? ' missing' : '') }, h('span', null, label, attrs.required ? h('i', null, ' required') : null), el2);
  };
  const toggle = (k, text) => { const t = h('input', { type: 'checkbox', id: 'bzs_' + k, checked: !!(m.show && m.show[k]) }); ids['show_' + k] = t; return h('label', { class: 'bz-switch' }, t, h('span', null, text || 'Show to members')); };
  const contact = (k, label, attrs) => h('div', { class: 'bz-contact' }, input(k, label, attrs), toggle(k));
  const cat = h('select', { id: 'bz_category', required: true }, h('option', { value: '' }, 'Pick an industry'), S.cats.map(([id, l]) => h('option', { value: id }, l)));
  cat.value = val('category'); ids.category = cat;
  const other = input('categoryOther', 'Your industry', { maxlength: 30, placeholder: 'e.g. Dog grooming' });
  const syncOther = () => other.hidden = cat.value !== 'other'; cat.addEventListener('change', syncOther); syncOther();
  const refs = h('input', { type: 'checkbox', checked: !!m.referrals }); ids.referrals = refs;

  // logo
  const logoBox = h('div', { class: 'bz-logo-row' });
  const drawLogo = () => {
    const prev = S.pendingLogo ? h('div', { class: 'bz-logo xl' }, h('img', { src: S.pendingLogo, alt: '' })) : S.pendingLogo === null || !m.logoV ? h('div', { class: 'bz-logo xl h' + hue(C.me().id) }, h('span', null, mono(ids.name ? ids.name.value : m.name))) : logoEl({ uid: C.me().id, name: m.name, logoV: m.logoV }, 'xl');
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.addEventListener('change', async () => { if(!file.files[0]) return; try{ S.pendingLogo = await shrinkLogo(file.files[0]); drawLogo(); }catch(e){ C.toast('That picture could not be opened. Try another one.'); } });
    logoBox.replaceChildren(prev, h('div', { class: 'bz-stack' }, h('label', { class: 'btn' }, 'Upload logo or photo', file),
      (S.pendingLogo || (m.logoV && S.pendingLogo !== null)) ? h('button', { type: 'button', class: 'btn', onclick: () => { S.pendingLogo = null; drawLogo(); } }, 'Remove') : null));
  };

  const err = h('div', { class: 'err bz-err', role: 'alert' });
  const save = h('button', { class: 'btn bz-gold big', type: 'submit' }, 'Save');
  const form = h('form', { class: 'form bz-form', novalidate: true },
    scan ? h('div', { class: 'bz-scan-note' }, h('b', null, 'Check what we read from your card'), h('span', null, 'Fix anything that is wrong. Fields we could not read are marked. Nothing is saved until you tap Save, and nothing is shown to members until you publish.')) : null,
    h('fieldset', null, h('legend', null, 'Your business'),
      input('name', 'Business name', { maxlength: 60, required: true, placeholder: 'e.g. Rivera Plumbing' }),
      h('label', { class: 'bz-field' + (missing('category') ? ' missing' : '') }, h('span', null, 'Industry', h('i', null, ' required')), cat), other,
      input('description', 'Short description', { maxlength: 400, rows: 3, placeholder: 'What you do, in a sentence or two' }, 'textarea'),
      input('services', 'Services offered', { maxlength: 300, rows: 2, placeholder: 'e.g. Repairs, renovations, water heaters' }, 'textarea'),
      input('area', 'Service area', { maxlength: 60, placeholder: 'e.g. Toronto & GTA' }),
      h('div', { class: 'bz-field' }, h('span', null, 'Logo or photo'), logoBox)),
    h('fieldset', null, h('legend', null, 'You'),
      h('div', { class: 'bz-contact' }, input('fullName', 'Full name (as on your card)', { maxlength: 60, autocomplete: 'off' }), toggle('fullName', 'Show name and title')),
      input('jobTitle', 'Job title', { maxlength: 60 })),
    h('fieldset', null, h('legend', null, 'Contact details'),
      h('p', { class: 'bz-muted' }, 'Each one stays private unless you switch on "Show to members".'),
      contact('website', 'Website', { maxlength: 200, inputmode: 'url', placeholder: 'example.com' }),
      contact('instagram', 'Instagram', { maxlength: 60, placeholder: '@yourbusiness' }),
      contact('email', 'Email', { maxlength: 120, type: 'email', inputmode: 'email' }),
      contact('phone', 'Phone', { maxlength: 24, type: 'tel', inputmode: 'tel' }),
      contact('address', 'Business address', { maxlength: 160 })),
    h('label', { class: 'bz-switch big' }, refs, h('span', null, 'Open to referrals and collaborations')),
    err,
    h('div', { class: 'bz-stack' }, save, h('button', { class: 'btn big', type: 'button', onclick: () => go(S.mine ? 'mine' : 'list', { prefill: null, fromScan: false }) }, 'Cancel')));
  drawLogo();
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const body = { category: cat.value, referrals: refs.checked, show: {} };
    for(const k of ['name', 'fullName', 'jobTitle', 'categoryOther', 'description', 'services', 'area', 'website', 'instagram', 'email', 'phone', 'address']) body[k] = ids[k].value;
    for(const k of Object.keys(FIELD_NAMES)) body.show[k] = ids['show_' + k].checked;
    if(S.pendingLogo) body.logo = { kind: 'photo', data: S.pendingLogo }; else if(S.pendingLogo === null) body.logo = null;
    save.disabled = true;
    try{
      const r = await api('bizSave', body);
      S.mine = r.mine; S.prefill = null; S.fromScan = false; S.pendingLogo = undefined; S.list = null; S.feedAt = 0;
      C.toast(r.mine.published && !r.mine.modHidden ? 'Saved. Your changes are live.' : 'Saved. Only you can see it until you publish.');
      go('mine');
    }catch(x){ err.textContent = x.message; save.disabled = false; err.scrollIntoView({ block: 'center' }); }
  });
  el.replaceChildren(h('button', { class: 'bz-back', type: 'button', onclick: () => go(S.mine ? 'mine' : 'list', { prefill: null, fromScan: false }) }, '‹ Back'),
    h('div', { class: 'card-box' }, h('span', { class: 'eyebrow bz-eyebrow' }, S.mine ? 'Edit my business' : 'Add my business'), form));
}
// square, fitted on white, 256px: a logo is a few KB (same size limit as profile photos)
function shrinkLogo(file){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
      const s = Math.min(256 / img.naturalWidth, 256 / img.naturalHeight), w = img.naturalWidth * s, hh = img.naturalHeight * s;
      x.drawImage(img, (256 - w) / 2, (256 - hh) / 2, w, hh); URL.revokeObjectURL(url);
      let q = .88, out = c.toDataURL('image/jpeg', q);
      while(out.length > 55000 && q > .4){ q -= .12; out = c.toDataURL('image/jpeg', q); }
      out.length > 55000 ? rej(new Error('too big')) : res(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}

// ---------- scan a business card (read on the phone; the photo is never uploaded) ----------
// Tesseract.js 5.1.1 + core 5.1.1 + English data 1.0.0, served from this server (public/vendor/, see scripts/vendor-tesseract.js).
// Nothing is fetched until a member picks a photo. The worker is started from its own file (no blob: worker) and we pick
// the core ourselves: the SIMD build where the phone supports WebAssembly SIMD, the plain build otherwise.
const TV = '/vendor/tesseract-5.1.1/';
const TESS = { src: TV + 'tesseract.min.js', sri: 'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F', worker: TV + 'worker.min.js', lang: '/vendor/tessdata-eng-1.0.0' };
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
const tessCore = () => { let simd = false; try{ simd = WebAssembly.validate(SIMD_PROBE); }catch(e){} return TV + (simd ? 'tesseract-core-simd-lstm.js' : 'tesseract-core-lstm.js'); };
let tessP = null;
function loadTess(){
  if(window.Tesseract) return Promise.resolve(window.Tesseract);
  if(!tessP) tessP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = TESS.src; s.integrity = TESS.sri; s.async = true;
    const t = setTimeout(() => rej(new Error('timeout')), 30000);
    s.onload = () => { clearTimeout(t); window.Tesseract ? res(window.Tesseract) : rej(new Error('missing')); };
    s.onerror = () => { clearTimeout(t); rej(new Error('load')); };
    document.head.appendChild(s);
  }).catch(e => { tessP = null; throw e; });
  return tessP;
}
// shrink big photos, grow small ones, grey + stretch the contrast so dark or washed-out cards read better
function prepare(file){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const long = Math.max(img.naturalWidth, img.naturalHeight), k = long > 1600 ? 1600 / long : long < 1000 ? 1000 / long : 1;
      const w = Math.round(img.naturalWidth * k), hh = Math.round(img.naturalHeight * k);
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, hh);
      const d = x.getImageData(0, 0, w, hh), px = d.data, hist = new Uint32Array(256);
      for(let i = 0; i < px.length; i += 4){ const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0; px[i] = g; hist[g]++; }
      const n = w * hh; let lo = 0, hi = 255, acc = 0;
      for(let i = 0; i < 256; i++){ acc += hist[i]; if(acc > n * .02){ lo = i; break; } }
      acc = 0; for(let i = 255; i >= 0; i--){ acc += hist[i]; if(acc > n * .02){ hi = i; break; } }
      const span = Math.max(24, hi - lo);
      for(let i = 0; i < px.length; i += 4){ const v = Math.max(0, Math.min(255, (px[i] - lo) * 255 / span)); px[i] = px[i + 1] = px[i + 2] = v; }
      x.putImageData(d, 0, 0);
      res(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}
async function readCard(file, onStep){
  onStep('Getting your photo ready…', 5);
  const canvas = await prepare(file);
  onStep('Starting the card reader…', 15);
  let T;
  try{ T = await loadTess(); }catch(e){ throw Object.assign(new Error('reader'), { reader: true }); }
  const w = await T.createWorker('eng', 1, { workerPath: TESS.worker, corePath: tessCore(), langPath: TESS.lang, workerBlobURL: false,
    logger: m => { if(m.status === 'recognizing text') onStep('Reading your card…', 40 + Math.round(m.progress * 55)); else if(/load/.test(m.status)) onStep('Starting the card reader…', 15 + Math.round((m.progress || 0) * 20)); } });
  try{ const r = await w.recognize(canvas); return r.data.text || ''; }
  finally{ w.terminate().catch(() => {}); canvas.width = canvas.height = 0; }
}
function renderScan(el){
  const st = S.scan || {};
  const back = h('button', { class: 'bz-back', type: 'button', onclick: () => go(S.mine ? 'mine' : 'list', { scan: null }) }, '‹ Back');
  const pick = capture => {
    const inp = h('input', { type: 'file', accept: 'image/*', capture: capture ? 'environment' : null, hidden: true, 'data-scan': capture ? 'camera' : 'library' });
    inp.addEventListener('change', () => { if(inp.files[0]) run(inp.files[0]); });
    return inp;
  };
  async function run(file){
    S.scan = { busy: true, step: 'Getting your photo ready…', pct: 5 }; renderScan(el);
    const bar = () => el.querySelector('.bz-progress i'), lbl = () => el.querySelector('.bz-progress-lbl');
    try{
      const text = await readCard(file, (s, p) => { S.scan.step = s; S.scan.pct = p; const b = bar(), l = lbl(); if(b) b.style.width = p + '%'; if(l) l.textContent = s; });
      const r = window.CardParse.parse(text);
      if(r.found < 2){ S.scan = { msg: "We couldn't read that clearly. Try again with good light, or type it in." }; return S.view === 'scan' && renderScan(el); }
      S.scan = null;
      startEdit({ name: r.company, fullName: r.fullName, jobTitle: r.jobTitle, phone: r.phone, email: r.email, website: r.website, address: r.address, category: r.category });
    }catch(e){
      S.scan = { msg: e.reader ? "The card reader couldn't start. Check your internet connection and try again, or type your details in." : "We couldn't read that clearly. Try again with good light, or type it in." };
      if(S.view === 'scan') renderScan(el);
    }
  }
  if(st.busy){
    el.replaceChildren(back, h('div', { class: 'card-box bz-scan' }, h('span', { class: 'eyebrow bz-eyebrow' }, 'Scan your business card'),
      h('div', { class: 'bz-reading', 'aria-hidden': 'true' }, h('div', { class: 'bz-cardart' }, h('i'), h('i'), h('i'))),
      h('p', { class: 'bz-progress-lbl', role: 'status' }, st.step),
      h('div', { class: 'bz-progress' }, h('i', { style: 'width:' + (+st.pct || 0) + '%' })),
      h('p', { class: 'bz-muted' }, 'This happens on your phone. Your photo is not uploaded or saved.')));
    return;
  }
  el.replaceChildren(back, h('div', { class: 'card-box bz-scan' },
    h('span', { class: 'eyebrow bz-eyebrow' }, 'Scan your business card'),
    h('h2', null, 'Take a photo of your card'),
    st.msg ? h('div', { class: 'bz-warn', role: 'alert' }, st.msg) : h('p', null, 'We fill in your business details from it, and you check them before anything is saved.'),
    h('div', { class: 'bz-cardart big', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('ul', { class: 'bz-tips' }, h('li', null, 'Lay the card flat in good light'), h('li', null, 'Fill the frame, avoid glare and shadows'), h('li', null, 'Hold steady until it is sharp')),
    h('div', { class: 'bz-stack' },
      h('label', { class: 'btn bz-gold big' }, '📷  ' + (st.msg ? 'Try again' : 'Take a photo'), pick(true)),
      h('label', { class: 'btn big' }, '🖼  Choose a photo', pick(false)),
      h('button', { class: 'btn big ghost', type: 'button', onclick: () => startEdit() }, 'Enter manually instead')),
    h('p', { class: 'bz-muted' }, 'Your photo is read on this phone and never uploaded or saved. The reader (about 6 MB) downloads the first time you scan.')));
}

// ---------- Home: the Business section (a rail of member business cards, then the intro prompt) ----------
// Section header shared look with Home's Poker and Opportunities headers (style.css .hsec-head)
function secHead(id, icon, title, sub, link){
  return h('div', { class: 'hsec-head', id },
    h('span', { class: 'hsec-ic ' + icon[1] }, I(icon[0])),
    h('div', { class: 'hsec-t' }, h('h2', null, title), sub ? h('small', null, sub) : null),
    link ? h('button', { class: 'hsec-link', type: 'button', onclick: link[1] }, link[0], I('chev')) : null);
}
function homeInto(sec){
  const f = S.feed;
  const head = (total) => secHead('hs-biz', ['briefcase', 'biz'], 'Business', total ? (total === 1 ? '1 member business' : total + ' member businesses') : "Your friends' businesses",
    total ? ['See all', () => go('list', { seg: 'biz' })] : null);
  // still loading: the header and placeholder cards, so the page doesn't jump when the cards arrive
  if(!f){ sec.replaceChildren(head(0), h('div', { class: 'bz-rail home', 'aria-hidden': 'true' }, [0, 1, 2].map(() => h('span', { class: 'bz-vcard sk' })))); return; }
  const kids = [head(f.total)];
  const unlisted = f.mine === 'none' || f.mine === 'draft';
  if(f.items.length){
    const cards = f.items.map(b => { const c = bizCard(b, { from: 'home', spot: b.uid === f.spotlight }); c.setAttribute('role', 'listitem'); return c; });
    // members without a listed business get one more card at the end of the rail
    if(unlisted && f.introDismissed) cards.push(h('button', { class: 'bz-vcard add', type: 'button', role: 'listitem', onclick: () => go('mine') },
      h('span', { class: 'bz-add-ic', 'aria-hidden': 'true' }, I('plus')), h('b', null, f.mine === 'draft' ? 'Finish your business profile' : 'Add your business'), h('small', null, 'Members only. You choose what to show.')));
    const rail = h('div', { class: 'bz-rail home', role: 'list', 'aria-label': "Members' businesses" }, cards);
    rail.addEventListener('scroll', () => { S.railX = rail.scrollLeft; }, { passive: true });
    kids.push(rail);
    requestAnimationFrame(() => { rail.scrollLeft = S.railX; });
  } else if(!unlisted || f.introDismissed){
    kids.push(h('div', { class: 'card-box bz-empty sm' }, h('span', { class: 'bz-empty-art', 'aria-hidden': 'true' }, I('briefcase')), h('p', null, h('b', null, 'No member businesses yet. '), 'Own a business or freelance? Add yours and be the first.'),
      h('button', { class: 'btn bz-gold', onclick: () => go('mine') }, f.mine === 'published' || f.mine === 'hidden' ? 'My business' : 'Add your business')));
  }
  if(unlisted && !f.introDismissed){
    const card = introCard(true);
    if(f.mine === 'draft'){ card.querySelector('h3').textContent = 'Finish your business profile'; card.querySelector('p').textContent = 'Your profile is saved but not published yet. Members can only see it after you publish.'; card.querySelector('.bz-stack').replaceChildren(h('button', { class: 'btn bz-gold big', onclick: () => go('mine') }, 'Continue')); }
    kids.push(card);
  }
  sec.replaceChildren(...kids);
}
function mountHome(sec, playing){
  if(playing){ sec.replaceChildren(); return; }
  homeInto(sec);
  if(Date.now() - S.feedAt > 30000){ S.feedAt = Date.now(); loadFeed().then(() => { if(sec.isConnected) homeInto(sec); }).catch(() => { S.feedAt = 0; }); }
}

window.BizClub = {
  init(ctx){
    C = ctx;
    window.OppClub.init({ C, h, secHead, rerender: () => render(root),
      showOpp: () => { S.view = 'list'; S.seg = 'opp'; if(C.tab() !== 'biz') return C.openTab('biz'); render(root); if(root) root.scrollTop = 0; },
      showBiz: () => go('list', { seg: 'biz' }),
      openBiz: uid => openDetail(uid, 'opp') });
  },
  render, mountHome,
  open(view){ S.view = view || 'list'; if(view === 'mine'){ S.mine = undefined; S.seg = 'biz'; } if(S.seg === 'opp') window.OppClub.open('feed'); },
  myStatus: () => S.feed ? S.feed.mine : null,
  reset(){ window.OppClub.reset(); S.seg = 'biz'; S.list = null; S.feed = null; S.feedAt = 0; S.mine = undefined; S.view = 'list'; logos.forEach(p => p.then(u => u && URL.revokeObjectURL(u))); logos.clear(); }
};
})();
