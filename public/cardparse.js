// Business card reader, part 2: turns the text read from a card photo into profile fields.
// Runs on the phone (and in the tests under Node). It only guesses: the member checks every field before saving.
(function(root){
'use strict';
const TITLE = /\b(owner|co-?owner|founder|co-?founder|ceo|cfo|cto|coo|vp|vice[- ]president|president|principal|partner|director|manager|head of|lead|agent|broker|realtor|sales(person)?|representative|rep|consultant|advisor|adviser|associate|accountant|cpa|bookkeeper|lawyer|attorney|paralegal|engineer|developer|designer|architect|specialist|coordinator|officer|chef|photographer|plumber|electrician|contractor|technician|therapist|trainer|coach|stylist|dentist|doctor|nurse|planner|analyst|administrator|assistant|supervisor|operator|proprietor)\b/i;
const COMPANY = /\b(inc|ltd|llc|llp|corp|corporation|co|company|group|studio|studios|realty|plumbing|bakery|cafe|café|restaurant|consulting|services|solutions|agency|partners|associates|clinic|salon|spa|fitness|gym|design|media|labs?|technologies|tech|systems|construction|renovations?|electric|roofing|landscaping|cleaning|auto|motors|insurance|financial|capital|law|legal|accounting|bookkeeping|properties|homes|events|travel|academy|tutoring|shop|store|market|kitchen|catering|photography|marketing|logistics|transport)\b\.?/i;
const STREET = /\b\d{1,6}[a-z]?\s+[\w .'-]{2,40}\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|lane|ln|cres|crescent|ct|court|pkwy|parkway|hwy|highway|pl|place|sq|square|terr?|terrace|cir|circle|trail|line|concession)(?:[NSEW]{1,2})?\b\.?/i; // OCR often drops the space in "St W"
const POSTAL = /\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b|\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\s+\d{5}(-\d{4})?\b/;
const UNIT = /^(suite|unit|ste|apt|floor|fl)\b/i;
const PROVINCE = /\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU|Ontario|Quebec|Alberta|Manitoba)\b/;
const EMAIL = /[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const URLRE = /\b((https?:\/\/)?(www\.)?[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.(com|ca|net|org|io|co|biz|info|us|uk|me|app|dev|shop|store|studio|design|agency|realty|ontario|toronto|example)(\/[^\s]*)?)\b/i;
const PHONE = /((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\+\d[\d\s().-]{7,18}\d)/g;
const INDUSTRY = [
  ['trades', /plumb|electric|contract|renovat|construct|roof|hvac|carpent|paint(ing|er)|handyman|mason|weld/i],
  ['realestate', /realt|real estate|mortgage broker|propert|homes\b|brokerage/i],
  ['food', /bak(e|ery)|cafe|café|coffee|restaurant|cater|kitchen|chef|food|pizza|bistro|bar\b|brew/i],
  ['health', /clinic|dent|physio|chiro|massage|therap|health|wellness|medical|nurse|doctor|pharm/i],
  ['beauty', /salon|spa\b|beauty|hair|barber|nail|lash|esthetic|makeup/i],
  ['fitness', /fitness|gym|personal train|yoga|pilates|martial|coach/i],
  ['professional', /law\b|lawyer|legal|attorney|account|cpa|bookkeep|tax|notary|paralegal/i],
  ['finance', /financ|insur|invest|wealth|capital|bank|advisor|adviser|mortgage/i],
  ['tech', /software|tech|it services|develop|computer|cloud|cyber|data|app\b|web dev/i],
  ['creative', /design|marketing|brand|media|photo|video|studio|print|advertis|creative/i],
  ['auto', /auto|motor|car\b|cars\b|garage|mechanic|tire|detailing/i],
  ['events', /event|wedding|dj\b|entertain|party|planner/i],
  ['education', /tutor|academy|school|lesson|teach|education/i],
  ['travel', /travel|tour|hotel|hospitality|vacation/i],
  ['home', /clean|landscap|lawn|moving|pest|home services|interior/i],
  ['retail', /shop|store|boutique|retail|market/i]
];

// common OCR slips in contact details
const fixContact = s => s.split('\n').map(l => { l = l.replace(/\(at\)|\[at\]/gi, '@').replace(/\s*@\s*/g, '@').replace(/\s*\.\s*(com|ca|net|org)\b/gi, '.$1'); return l.includes('@') ? l.replace(/(\S)\s*\.\s*(?=\S)/g, '$1.') : l; }).join('\n');
const calm = s => /[a-z]/.test(s) || s.length < 4 ? s : s.split(' ').map(w => w.length > 3 ? w[0] + w.slice(1).toLowerCase() : w).join(' ');
const words = s => s.split(/\s+/).filter(Boolean);
const lettersShare = s => (s.match(/[A-Za-zÀ-ÿ]/g) || []).length / Math.max(1, s.replace(/\s/g, '').length);
function looksLikeName(s){
  const w = words(s);
  if(w.length < 2 || w.length > 4 || /\d|@|www|\.com/i.test(s) || TITLE.test(s) || COMPANY.test(s)) return false;
  return w.every(x => /^[A-ZÀ-Ý][a-zà-ÿ'’-]+\.?$|^[A-Z]\.$|^[A-ZÀ-Ý]{2,}$/.test(x)) && !w.every(x => /^[A-Z]{2,}$/.test(x) && x.length > 12);
}

function parse(raw){
  const out = { fullName: '', company: '', jobTitle: '', phone: '', email: '', website: '', address: '', category: '' };
  let lines = String(raw || '').replace(/\r/g, '').split(/\n|\s+[|•·]\s+|\t|\s{3,}/)
    .map(l => l.replace(/[|_~^`{}<>\\]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(l => l.length >= 2 && lettersShare(l) > 0.3 || /\d{3}/.test(l));
  const text = lines.join('\n');
  // Contact details are cut out of their line, so what is left (a street on the same line as a phone
  // number, on a two-column card) can still be read as something else.
  const cut = (i, part) => { lines[i] = lines[i].replace(part, ' ').replace(/\s+/g, ' ').trim(); };
  lines = lines.map(fixContact);
  for(let i = 0; i < lines.length && !out.email; i++){ const m = EMAIL.exec(lines[i]); if(m){ out.email = m[0].replace(/[.,;:]+$/, ''); cut(i, m[0]); } }
  for(let i = 0; i < lines.length && !out.website; i++){ const m = URLRE.exec(lines[i]); if(m && !/@/.test(lines[i].slice(Math.max(0, m.index - 1), m.index))){ out.website = m[1].replace(/[.,;:]+$/, ''); cut(i, m[0]); } }
  // phones: North American shape first, else any long + number; skip fax, prefer mobile/cell/tel labels
  const phones = [];
  lines.forEach((l, i) => {
    const fax = /\b(fax|f)\b\s*:?/i.test(l) && !/\b(tel|t|phone|p|m|c|cell|mobile)\b\s*:?\s*[+(\d]/i.test(l);
    for(const m of [...l.matchAll(PHONE)]){
      const d = m[1].replace(/\D/g, '');
      if(d.length < 10 || d.length > 15) continue;
      const v = m[1].trim();
      if(!fax) phones.push({ v, pref: /\b(m|c|cell|mobile|tel|t|phone|p|direct)\b\.?\s*:?/i.test(l) ? 1 : 0, i });
      cut(i, v);
    }
  });
  phones.sort((a, b) => b.pref - a.pref || a.i - b.i);
  if(phones[0]) out.phone = phones[0].v;
  // leftovers like "T:" or "Email" are labels, not content
  lines = lines.map(l => /^\W*(t|tel|phone|p|m|c|cell|mobile|e|email|w|web|website|www|fax|f|direct|office|o)?\W*$/i.test(l) ? '' : l.replace(/^(t|tel|phone|m|cell|mobile|e|email|w|web|o|office)\s*[:.]\s*/i, '')).filter(l => l.length >= 2);
  const used = new Set();

  // address: a street line, plus the city/postal line right after it
  for(let i = 0; i < lines.length; i++){
    if(used.has(i)) continue;
    const l = lines[i];
    if(STREET.test(l) || POSTAL.test(l) || UNIT.test(l)){
      const parts = [l]; used.add(i);
      for(let j = i + 1; j < lines.length && parts.length < 3; j++){
        if(used.has(j)) break;
        if(POSTAL.test(lines[j]) || PROVINCE.test(lines[j]) || UNIT.test(lines[j]) || /^[A-Z][a-z]+,?\s+[A-Z]{2}\b/.test(lines[j])){ parts.push(lines[j]); used.add(j); } else break;
      }
      out.address = parts.join(', ').replace(/,\s*,/g, ',');
      break;
    }
  }

  // job title
  for(let i = 0; i < lines.length; i++){
    if(used.has(i)) continue;
    if(TITLE.test(lines[i]) && words(lines[i]).length <= 6 && !COMPANY.test(lines[i].replace(TITLE, ''))){ out.jobTitle = lines[i]; used.add(i); break; }
  }
  // person's name
  for(let i = 0; i < lines.length; i++){
    if(used.has(i)) continue;
    if(looksLikeName(lines[i])){ out.fullName = lines[i].split(/\s+/).map(w => /^[A-Z]{2,}$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w).join(' '); used.add(i); break; }
  }
  // company: a line with a business word, else the first prominent line left over
  let ci = lines.findIndex((l, i) => !used.has(i) && COMPANY.test(l) && lettersShare(l) > 0.6);
  if(ci < 0) ci = lines.findIndex((l, i) => !used.has(i) && lettersShare(l) > 0.7 && words(l).length <= 6 && l.length >= 3);
  if(ci >= 0){ out.company = calm(lines[ci]); used.add(ci); }
  else if(out.website){ const d = out.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[./]/)[0]; if(d.length > 2) out.company = d[0].toUpperCase() + d.slice(1); }

  const hay = [out.company, out.jobTitle, out.website, text].join(' ');
  const hit = INDUSTRY.find(([, re]) => re.test(out.company + ' ' + out.website)) || INDUSTRY.find(([, re]) => re.test(hay));
  if(hit) out.category = hit[0];

  for(const k of Object.keys(out)) out[k] = String(out[k]).slice(0, k === 'address' ? 160 : 120);
  out.found = ['fullName', 'company', 'jobTitle', 'phone', 'email', 'website', 'address'].filter(k => out[k]).length;
  return out;
}

if(typeof module !== 'undefined' && module.exports) module.exports = { parse };
else root.CardParse = { parse };
})(typeof self !== 'undefined' ? self : this);
