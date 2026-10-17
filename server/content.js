// Contact details in what members type into Business Club and Opportunity Club text: web addresses, emails and
// phone numbers are not allowed there. Members reach each other through the club (contact requests, the opt-in
// Contact details of a business profile) instead. find(s) returns 'email' | 'link' | 'phone' | null; check() throws.
// The text is only read here, never changed: what is saved is exactly what the member typed (after cleaning).

// common TLDs; CAPS ones are a link whatever the case ("Example.COM"), any other ending only in lowercase ("joe.plumbing"),
// so a missing space between sentences ("this week.It was") is not taken for a link
const TLD = 'com|net|org|edu|gov|io|co|ca|us|uk|me|ly|app|dev|info|biz|xyz|link|site|online|shop|store|page|gl|gg|tv|to|ru|cn|ai|au|de|fr|in|eu|nz|ie|mx|br|es|it|nl|jp|ch|se|be|at|pl|za|cc|ws|fm|am|sh|la|ph|pk|ng|ke|pro|club|live|life|world|today|tech|space|website|cloud|blog|news|media|agency|studio|design|email|digital|solutions|services|ltd|inc|llc|gmbh';
const TLDS = new Set(TLD.split('|')), CAPS = new Set('com net org edu gov io co ca uk info biz ly app dev xyz'.split(' '));
// endings that are file types, not web addresses (resume.pdf, Node.js), and tech names that look like domains
const FILE = new Set('pdf doc docx xls xlsx ppt pptx jpg jpeg png gif heic txt csv mp3 mp4 mov zip js ts jsx tsx py rb css html htm json exe'.split(' '));
const TECH = new Set(['asp.net', 'ado.net', 'vb.net']);
const STOP = new Set(['the', 'a', 'an', 'us', 'me', 'him', 'her', 'them', 'it', 'home', 'work', 'you', 'we', 'i', 'is', 'am', 'are', 'be', 'available', 'help', 'look', 'good', 'great', 'best', 'located', 'based', 'meet']);
const WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const MONTH = m => m >= 1 && m <= 12, DAYOK = d => d >= 1 && d <= 31, YEAR = y => /^(19|20)\d\d$/.test(y);
const UNIT = /^\s*(?:%|(?:k|m|mm|cm|km|kg|lbs?|sq|sqft|ft|feet|mi|hrs?|hours?|dollars?|bucks|cad|usd|eur|views|followers|people|units|pcs|pieces|items|sqm)\b)/i;

const DOT = new RegExp(`(\\b[a-z0-9-]+)\\s+dot\\s+(?=(?:[a-z0-9-]+\\s+dot\\s+)*(?:${TLD})\\b(?![.-]?\\w))`, 'gi');
// one copy of the text to look at: compatibility forms folded (ＥＸＡＭＰＬＥ．ＣＯＭ, 𝟒𝟏𝟔), the usual disguises undone
function prep(s){
  let t = String(s || '').normalize('NFKC').replace(/[。｡]/g, '.');
  t = t.replace(/\s*[[({<]\s*(?:\.|dot)\s*[\])}>]\s*/gi, '.')                    // example[.]com, example (dot) com
    .replace(DOT, (m, w) => STOP.has(w.toLowerCase()) ? m : w + '.')               // example dot com; not "the dot com era", "polka dot dress"
    .replace(/\s*[[({<]\s*(?:@|at)\s*[\])}>]\s*/gi, '@')                        // jo(at)example.com, jo [at] example
    .replace(/(\b[a-z0-9-]+)(?:\s+\.\s*|\s*\.\s+)(?=(?:com|net|org|ca|io|co|info|biz|us|uk)(?![.-]?\w))/g, '$1.'); // example . com (lowercase only)
  return t;
}

function link(t){
  if(/\b[a-z][a-z0-9+.-]*:\/\/|\bwww\d{0,3}\.|\b(?:mailto|tel|sms|callto|whatsapp|skype):\S/i.test(t)) return true;
  if(/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(t)) return true;                          // 192.168.0.1
  const re = /\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)\.([a-z]{2,24}|xn--[a-z0-9-]+)(?![.-]?[\w@])/gi;
  for(let m; (m = re.exec(t));){
    const tld = m[2], low = tld.toLowerCase(), last2 = (m[1] + '.' + tld).toLowerCase().split('.').slice(-2).join('.');
    if(t[m.index - 1] === '@' || FILE.has(low) || TECH.has(last2) || !TLDS.has(low) && /^[a-z](?:\.[a-z])*$/i.test(m[1])) continue; // resume.pdf, ASP.NET, i.e.the
    if(CAPS.has(low) || low.startsWith('xn--') || tld === low) return true;     // "week.Thanks" (a missing space) is not a link
  }
  return false;
}

function email(t){
  if(/[a-z0-9._%+-]\s*@\s*[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i.test(t)) return true;
  const re = /\b([a-z0-9._%+-]+)\s+at\s+([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\b/gi; // jordan at maplemain.ca, not "us at example.com"
  for(let m; (m = re.exec(t));) if(!STOP.has(m[1].toLowerCase())) return true;
  return false;
}

// a phone number is 7 to 15 digits, written together or with spaces . - / ( ) between them
function phone(t){
  t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi, w => WORDS[w.toLowerCase()]);
  const re = /\+?\(?\d(?:[\s.\-–—/()]{0,3}\d)+\)?/g;
  for(let m; (m = re.exec(t));){
    const run = m[0], digits = run.replace(/\D/g, '');
    if(digits.length < 7 || digits.length > 15 || ok(run, t.slice(0, m.index), t.slice(m.index + run.length))) continue;
    return true;
  }
  return false;
}
// ordinary numbers that are not phone numbers
function ok(run, before, after){
  if(run[0] === '+') return false;                                                // +44 20 7946 0958 is always a phone
  if(/(?:[$€£¥]|\b(?:cad|usd|eur))\s*$/i.test(before) || UNIT.test(after)) return true; // $1 500 000, 2 500 000 sq ft
  const g = run.match(/\d+/g), seps = run.replace(/^\(|\)$/g, '').match(/[^\d]+/g) || [];
  if(/^\d{1,2}(?:([ .])\d{3})(?:\1\d{3})*$/.test(run)) return true;               // 1 500 000, 12.500.000 (not 612 345 678)
  if(/^\d{1,2}[.:]\d\d\s*[-–—]\s*\d{1,2}[.:]\d\d$/.test(run)) return true;          // 9.00-17.00
  if(g.every(YEAR)) return true;                                                  // 2019 2020 2021
  if(g.slice(0, -1).some(YEAR) && !/[()]/.test(run)) return true;                 // 2019-2023, 2026-10-17, Model 3 2019 5000
  if(g.length === 3 && /^[./-]$/.test(seps[0] || '') && seps[0] === seps[1] && YEAR(g[2]) &&
    (MONTH(+g[0]) && DAYOK(+g[1]) || DAYOK(+g[0]) && MONTH(+g[1]))) return true;  // 17/10/2026, 10.17.2026
  if(g.length === 2 && /^\s*[-–—]\s*$/.test(seps[0]) && g[0].length === g[1].length && +g[0] < +g[1]) return true; // 1500-2000, 0900-1700
  if(g.length === 2 && seps[0] === '-' && g[0].length === 5 && g[1].length === 4) return true; // ZIP+4 90210-1234
  return false;
}

const TESTS = { email, link, phone };
function find(s, kinds = ['email', 'link', 'phone']){ const t = prep(s); return kinds.find(k => TESTS[k](t)) || null; }
const WHAT = { link: 'web address', email: 'email address', phone: 'phone number' };
const TIP = { link: ' If it is not a web address, add a space after the period.', phone: ' For prices or ranges, write them like $1,500 or 2-3 weeks.', email: '' };
// the friendly error for a field: which kind of detail to take out, and where it belongs instead
function message(kind, label, where){ return `Please remove the ${WHAT[kind]} from ${label.toLowerCase()}. ${where}${TIP[kind]}`; }
function check(s, label, where, fail, kinds){ const k = find(s, kinds); if(k) throw fail(message(k, label, where)); return s; }

module.exports = { find, check, message };
