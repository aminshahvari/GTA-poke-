// Inline SVG icons for Home, Business Club and Opportunity Club (no icon font, nothing fetched).
// Line icons on a 24px grid, drawn with currentColor. Icons.el() builds DOM nodes; Icons.svg() returns
// static markup for app.js templates. Neither ever takes member text.
(function(){
'use strict';
const P = {
  // sections
  spade: 'M12 2.5c3.6 3.5 8 6.6 8 10.6 0 2.5-2 4.3-4.3 4.3-1.4 0-2.6-.6-3.2-1.6.3 1.9 1.2 3.4 2.6 4.7H8.9c1.4-1.3 2.3-2.8 2.6-4.7-.6 1-1.8 1.6-3.2 1.6C6 17.4 4 15.6 4 13.1c0-4 4.4-7.1 8-10.6z',
  briefcase: 'M4 7.5h16a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1zM9 7.5V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18M11 13v2h2v-2',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5',
  need: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM5.6 5.6l3.7 3.7M14.7 14.7l3.7 3.7M18.4 5.6l-3.7 3.7M9.3 14.7l-3.7 3.7',
  offer: 'M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 8 2.5c0 5.9-8 10.6-8 10.6zM12 10.5v5M9.5 13h5',
  chev: 'M9 5l7 7-7 7',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20',
  inbox: 'M3.5 13.5 6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1zM3.5 13.5h5l1.5 2.5h4l1.5-2.5h5',
  back: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  star: 'M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.1 6L12 16.6l-5.3 2.9 1.1-6-4.4-4.1 6-.7z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.2 2',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.4-3.6 3-5.8 6.5-5.8s6.1 2.2 6.5 5.8M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.6c2 .7 3.3 2.7 3.5 5.4',
  pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z',
  mail: 'M3.5 6h17a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-17a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5zM3.5 6.5 12 13l8.5-6.5',
  phone: 'M5 3.5h3.2l1.6 4.2-2.1 1.4a11 11 0 0 0 5.2 5.2l1.4-2.1 4.2 1.6V17a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 5.5a2 2 0 0 1 2-2z',
  camera: 'M4 7.5h3l1.5-2.5h7L17 7.5h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1zM12 9.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  insta: 'M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM17.2 6.6v.1',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  chip: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 3v4M12 17v4M3 12h4M17 12h4',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3.5M8.5 20.5h7M9.5 17.5h5v3h-5z',
  // business categories
  realestate: 'M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20',
  trades: 'M14.6 6.4a4 4 0 0 0-5.2 5.2L3.5 17.5l3 3 5.9-5.9a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.3-.6-.6-2.3z',
  home: 'M4 4.5h12v5H4zM16 7h3.5v5.5H11V15M10 15h2v5.5h-2z',
  food: 'M4.5 9h12v4a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6zM16.5 10h1.3a2.6 2.6 0 0 1 0 5.2h-1.8M8 3.5v2.5M12 3.5v2.5',
  health: 'M12 20s-8-4.8-8-10.6A4.4 4.4 0 0 1 12 6.8a4.4 4.4 0 0 1 8 2.6C20 15.2 12 20 12 20zM5 12h3.5l1.5-2.5 2.5 5 1.5-2.5H19',
  beauty: 'M6.5 3.5a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM6.5 14.9a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM8.6 8.2 20 19.5M8.6 15.8 20 4.5',
  fitness: 'M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11',
  professional: 'M12 4v16M7 20h10M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z',
  finance: 'M4 20V11M10 20V6M16 20v-6M3 20.5h18M14.5 5.5l4-2 1.5 4',
  tech: 'M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4M13.5 5l-3 14',
  creative: 'M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.8 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3zM7.5 11.5v.1M10 7.5v.1M14.5 7.5v.1',
  retail: 'M5.5 8h13l1 12.5h-15zM9 8a3 3 0 0 1 6 0',
  auto: 'M5 16.5H3.5v-4l2-5h13l2 5v4H19M8.5 16.5h7M3.5 12.5h17M7 14.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17 14.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  events: 'M4 8.5V6.5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4zM14.5 5.5v10M10 18.5h4',
  education: 'M2.5 9 12 4.5 21.5 9 12 13.5zM6.5 11v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V11M21.5 9v5.5',
  travel: 'M10.5 13.5 3 11l1.5-1.5 7.5 1 4.2-4.2a1.8 1.8 0 0 1 2.5 2.5L14.5 13l1 7.5L14 22l-2.5-7.5M7 17l-3 .5M7 17l-.5 3',
  other: 'M5 3.5h14v17H5zM9 7.5h1.5M13.5 7.5H15M9 11.5h1.5M13.5 11.5H15M10.5 20.5v-4h3v4'
};
// the club's industry list (server/business.js CATEGORIES). Home cards only carry the label, so map it back to the id.
const LABELS = { 'Real estate': 'realestate', 'Construction & trades': 'trades', 'Home services': 'home', 'Food & drink': 'food',
  'Health & wellness': 'health', 'Beauty & personal care': 'beauty', 'Fitness & sports': 'fitness', 'Legal & accounting': 'professional',
  'Finance & insurance': 'finance', 'Tech & IT': 'tech', 'Marketing & design': 'creative', 'Retail & shopping': 'retail', 'Automotive': 'auto',
  'Events & entertainment': 'events', 'Education & tutoring': 'education', 'Travel & hospitality': 'travel', 'Other': 'other' };
const NS = 'http://www.w3.org/2000/svg';
const FILLED = { spade: 1, star: 1 };
function el(name, cls){
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  s.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', P[name] || P.other);
  if(FILLED[name]){ p.setAttribute('fill', 'currentColor'); p.setAttribute('stroke', 'none'); }
  s.append(p);
  return s;
}
const svg = (name, cls) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="ic${cls ? ' ' + cls : ''}"><path d="${P[name] || P.other}"${FILLED[name] ? ' fill="currentColor" stroke="none"' : ''}/></svg>`;
const CATS = new Set(Object.values(LABELS));
const cat = (id, label) => CATS.has(id) ? id : LABELS[label] || 'other';
window.Icons = { el, svg, cat };
})();
