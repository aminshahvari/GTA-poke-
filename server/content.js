// Contact details in what members type into Business Club and Opportunity Club text: web addresses, emails, social
// handles/profiles and phone numbers are not allowed there. Members reach each other through the club (contact requests,
// the opt-in Contact details of a business profile) instead. find(s) returns 'email' | 'social' | 'link' | 'phone' | null;
// check() throws.
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
const REF = /\b(?:order|invoice|inv|ref|reference|ticket|sku|serial|model|part|item|po|confirmation|conf|tracking|booking|reservation|case|claim|receipt|transaction|batch|lot)\s*(?:no\.?|num(?:ber)?\.?|id)?\s*[:#]?\s*#?\s*$/i;
const NANP = run => { const g = run.match(/\d+/g).map(x => x.length).join('-'), d = run.replace(/\D/g, ''); return /^(?:1-)?(?:3-)?3-4$/.test(g) || /^1?\d{10}$/.test(d) && g.indexOf('-') < 0 || d.length === 7 && g === '7'; };
const UNIT = /^\s*(?:%|(?:k|m|mm|cm|km|kg|lbs?|sq|sqft|ft|feet|mi|hrs?|hours?|dollars?|bucks|cad|usd|eur|views|followers|people|units|pcs|pieces|items|sqm)\b)/i;

// any script's decimal digits (Persian ۴۱۶, Arabic-Indic ٤١٦, Devanagari ४१६ ...) read as 0-9: a digit's value is its
// distance from the start of its run of ten; Arabic decimal/thousands separators read as . and ,
const ND = /\p{Nd}/u;
const digits = t => t.replace(/[\u066b\u066c]/g, c => c === '\u066b' ? '.' : ',').replace(/[^\x00-\x7f]/g, c => {
  if(!ND.test(c)) return c;
  let cp = c.codePointAt(0), start = cp;
  while(start > cp - 9 && ND.test(String.fromCodePoint(start - 1))) start--;
  return String((cp - start) % 10);
});
const DOT = new RegExp(`(\\b[a-z0-9-]+)\\s+dot\\s+(?=(?:[a-z0-9-]+\\s+dot\\s+)*(?:${TLD})\\b(?![.-]?\\w))`, 'gi');
// one copy of the text to look at: compatibility forms folded (ＥＸＡＭＰＬＥ．ＣＯＭ, 𝟒𝟏𝟔), the usual disguises undone
function prep(s){
  let t = digits(String(s || '').normalize('NFKC')).replace(/[\u00ad\u200b-\u200f\u2060-\u2064\ufeff]/g, '').replace(/[。｡]/g, '.');
  t = t.replace(/\s*[[({<]\s*(?:\.|dot)\s*[\])}>]\s*/gi, '.')                    // example[.]com, example (dot) com
    .replace(DOT, (m, w) => STOP.has(w.toLowerCase()) ? m : w + '.')               // example dot com; not "the dot com era", "polka dot dress"
    .replace(/\s*[[({<]\s*(?:@|at)\s*[\])}>]\s*/gi, '@')                        // jo(at)example.com, jo [at] example
    .replace(/\b(?:the\s+)?at[\s-]*sign\s*/gi, '@')                                 // "at sign name"
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

// letters typed for digits next to numbers: 416-555-O1OO, 4l6 555 OlOO. A group of O o I l | becomes digits when it holds
// a digit itself, or (letters only, 2+) sits right beside a group that does; "Oil", "OIL", "lol 5" alone stay words.
const LD = { o: '0', O: '0', I: '1', l: '1', '|': '1' };
const LGRP = /(?<![a-z0-9])[0-9oOIl|]+(?![a-z0-9])/gi;
function letterDigits(t){
  t = t.replace(LGRP, g => /\d/.test(g) && /[oOIl|]/.test(g) ? g.replace(/[oOIl|]/g, c => LD[c]) : g);
  for(let i = 0, prev; i < 8 && prev !== t; i++){
    prev = t;
    t = t.replace(/(?<![a-z0-9])[oOIl|]{2,}(?![a-z0-9])/gi, (g, at, all) => {
      if(/[^oOIl|]/.test(g)) return g;
      const near = /\d[\s.\-–—/(),]{1,3}$/.test(all.slice(Math.max(0, at - 4), at)) || /^[\s.\-–—/(),]{1,3}\d/.test(all.slice(at + g.length, at + g.length + 4));
      return near ? g.replace(/[oOIl|]/g, c => LD[c]) : g;
    });
  }
  return t;
}
// a phone number is 7 to 15 digits, written together or with spaces . , - / ( ) between them
// bullet-like dots between digit groups (416•829•5953, 416 · 829 · 5953) read as commas, so the comma rules decide:
// phone-shaped groups are a phone, a list of sizes or prices is not
const BULLET = /(\d)\s*[\u2022\u00b7\u2027\u2219\u22c5\u30fb\u25e6\u2043]\s*(?=\d)/g;
// other hyphens and dashes (‐ ‒ ― − ﹘), underscores and tildes (~ ∼ 〜) between digit groups read as -, so the dash
// rules decide: 416_829_5953 or 416~829~5953 is a phone, 2019~2021, 10~15 or 1403_07_26 is not. Asterisks (* ∗ ✱) read
// as commas, like bullets: 416*829*5953 is a phone, 1500*2000 mm or 120*60*75 is not. Applied before letter-for-digit
// mapping (416_555_O1OO) when a digit is on either side; stored text is never changed.
const sepRe = cls => new RegExp(`(?<=[\\d)])\\s*[${cls}]\\s*(?=[\\d(oOIl|])|(?<=[\\doOIl|)])\\s*[${cls}]\\s*(?=[\\d(])`, 'g');
const DASH = sepRe('\\u2010-\\u2015\\u2212\\ufe58_~\\u223c\\u301c'), STAR = sepRe('*\\u2217\\u2731');
function phone(t){
  t = letterDigits(t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi, w => WORDS[w.toLowerCase()]).replace(DASH, '-').replace(STAR, ',')).replace(BULLET, '$1,');
  const re = /\+?\(?\d(?:[\s.,\-–—/()]{0,3}\d)+\)?/g;
  for(let m; (m = re.exec(t));){
    // the run as a whole (as before), then every shorter stretch of it between spaces that is written like a North
    // American phone (416 829 5953, 416,829,5953, 1-416-829-5953, 4168295953) or starts with +: a number written just
    // before a phone ("grades 6-12. 416,829,5953", "$1,500. 416 829 5953", "Since 2019 416-829-5953") must not hide it,
    // while lists and amounts ("Cap 1500 2000 2500 units", "$1 500 000 2 bedrooms") add nothing new.
    const run = m[0], cut = [0];
    for(const s of run.matchAll(/\D+/g)) if(/\s/.test(s[0])) cut.push(s.index, s.index + s[0].length);
    cut.push(run.length);
    for(let i = 0; i < cut.length; i += 2) for(let j = cut.length - 1; j > i; j -= 2){
      const a = cut[i], b = cut[j], sub = run.slice(a, b), d = sub.replace(/\D/g, '').length;
      if(d < 7 || d > 15 || b - a < run.length && !(NANP(sub) || sub[0] === '+')) continue;
      if(!ok(sub, t.slice(0, m.index + a), t.slice(m.index + b))) return true;
    }
  }
  return false;
}
// ordinary numbers that are not phone numbers
function ok(run, before, after){
  if(run[0] === '+') return false;                                                // +44 20 7946 0958 is always a phone
  // reference numbers named as such (Order no. 4471-2290, SKU 1234567, Invoice #20261017-0042), unless written like a
  // North American phone (555-0100, 416-555-0100, 4165550100), so "Ref: 416 555 0100" is still a phone
  if(REF.test(before) && !/[\s()]/.test(run) && !NANP(run)) return true;
  if(/(?:[$€£¥]|\b(?:cad|usd|eur))\s*$/i.test(before) || UNIT.test(after)) return true; // $1 500 000, 2 500 000 sq ft
  const g = run.match(/\d+/g), seps = run.replace(/^\(|\)$/g, '').match(/[^\d]+/g) || [];
  // commas: thousands (1,500,000; 12,500.50) and lists (sizes 10, 12, 14, 16; orders 1043, 1044, 1045) are numbers; a
  // comma run is a phone only when its groups read like one: 10-11 digits in groups of 3+ (a leading 1 aside), 416,829,5953
  if(/,/.test(run)){
    if(/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(run)) return true;
    const d = g.join(''), body = g[0] === '1' && g.length > 3 ? g.slice(1) : g;
    if(!(d.length >= 10 && d.length <= 11 && body.every(x => x.length >= 3) && body.length <= 4)) return comma(run);
  }
  if(/^\d{1,2}(?:([ .])\d{3})(?:\1\d{3})*$/.test(run)) return true;               // 1 500 000, 12.500.000 (not 612 345 678)
  if(/^\d{1,2}[.:]\d\d\s*[-–—]\s*\d{1,2}[.:]\d\d$/.test(run)) return true;          // 9.00-17.00
  if(g.every(YEAR)) return true;                                                  // 2019 2020 2021
  if(g.slice(0, -1).some(YEAR) && !/[()]/.test(run)) return true;                 // 2019-2023, 2026-10-17, Model 3 2019 5000
  if(g.length === 3 && /^[./-]$/.test(seps[0] || '') && seps[0] === seps[1] && YEAR(g[2]) &&
    (MONTH(+g[0]) && DAYOK(+g[1]) || DAYOK(+g[0]) && MONTH(+g[1]))) return true;  // 17/10/2026, 10.17.2026
  if(g.length === 3 && /^[./-]$/.test(seps[0] || '') && seps[0] === seps[1] && /^1[34]\d\d$/.test(g[0]) && MONTH(+g[1]) && DAYOK(+g[2])) return true; // 1403/07/26 (Persian calendar)
  if(g.length === 2 && /^\s*[-–—]\s*$/.test(seps[0]) && g[0].length === g[1].length && +g[0] < +g[1]) return true; // 1500-2000, 0900-1700
  if(g.length === 2 && seps[0] === '-' && g[0].length === 5 && g[1].length === 4) return true; // ZIP+4 90210-1234
  return false;
}
// a comma run that is not phone-shaped: still check each comma-free piece on its own (10, 416 555 0100, 12)
function comma(run){ return run.split(/\s*,\s*/).every(p => p.replace(/\D/g, '').length < 7 || ok(p, '', '')); }

// social media: profile links (instagram.com/x, t.me/x, wa.me/…), handles (@name, "IG: name", "telegram @x",
// "Discord: name#1234", "WeChat ID: x") and invitations to message on an app ("DM me on insta", "WhatsApp me").
// A platform named with no identifier is fine ("We post recipes on Instagram", "Facebook ads management", "#torontofood").
const PLAT = 'instagram|insta|ig|tiktok|tik\\s?tok|tt|snapchat|snap|sc|telegram|tg|whatsapp|whats\\s?app|wa|signal|discord|wechat|weixin|wx|line|kik|threads|twitter|facebook|fb|messenger|linkedin|youtube|yt|pinterest|viber|skype|reddit|twitch|bluesky|mastodon';
const APP = 'whatsapp|whats\\s?app|telegram|signal|snapchat|snap|wechat|viber|kik|skype|messenger';
const PROFILE = /\b(?:(?:[a-z]+\.)?(?:instagram|facebook|tiktok|twitter|linkedin|youtube|snapchat|pinterest|telegram|whatsapp|discord(?:app)?|threads|reddit|twitch|bsky)\.[a-z]{2,}|instagr\.am|fb\.(?:com|me|gg)|m\.me|x\.com|youtu\.be|lnkd\.in|pin\.it|t\.me|wa\.me|signal\.me|discord\.gg|line\.me|weixin\.qq\.com)(?![.\w])/i;
const PLAIN = new Set(['ads', 'ad', 'marketing', 'content', 'strategy', 'management', 'growth', 'posts', 'reels', 'stories', 'and', 'or', 'only', 'page', 'pages', 'account', 'accounts', 'shop', 'campaigns', 'videos', 'live', 'too', 'also']);
// "IG: name": with id/handle/username or @ always; a bare "Platform: word" only when the word looks like a handle
// (digits, _ . #) or ends the phrase, so "LinkedIn: profile rewrites" and "Instagram: 10k followers" pass
const IDTAG = new RegExp(`\\b(?:${PLAT})\\s*(id|handle|user(?:name)?|name|account|@)?\\s*(?:[:=>]|-{1,2}>?|\\bis\\b)\\s*(@?)([a-z0-9_][a-z0-9_.\\-]{0,31}(?:#\\d{4})?)(?=(\\s+[a-z]+)?)`, 'gi');
const PLATAT = new RegExp(`\\b(?:${PLAT})\\s*@\\s*[a-z0-9_]`, 'i');
const INVITE = new RegExp(`\\b(?:(?:dm|pm|message|msg|text|add|ping|chat(?:\\s+with)?|contact|reach|hmu|hit\\s+(?:me|us)\\s+up)\\s+(?:(?:me|us)\\s+)?(?:on|at|via|over|through|thru|in)\\s+(?:${PLAT})|(?:${APP})\\s+(?:me|us)\\b|(?:on|via)\\s+(?:${APP})\\s*(?:me|us)?\\s*@?\\s*\\+?\\d)`, 'i');
function social(t){
  // letters spelled out one by one: "i n s t a", "W-h-a-t-s-A-p-p"
  t = t.replace(/\b(?:[a-z][ .\-_*]){1,}[a-z]\b/gi, m => m.replace(/[ .\-_*]/g, ''));
  if(PROFILE.test(t) || PLATAT.test(t) || INVITE.test(t)) return true;
  if(/(?:^|[^\w@.#&])@[a-z_][a-z0-9_.]{1,29}(?![\w@])/i.test(t)) return true;  // @name; not "@ 5pm", "@5pm", jo@example.com
  if(/\b[a-z0-9_.]{2,32}#\d{4}\b/i.test(t)) return true;                         // Discord name#1234; not C#, #1 bakery
  IDTAG.lastIndex = 0;
  for(let m; (m = IDTAG.exec(t));){
    const [, tag, at, id, next] = m;
    if(PLAIN.has(id.toLowerCase()) || /^\d+[km]?$/i.test(id)) continue;
    if(tag || at || /[\d_.#]/.test(id) || !next) return true;
  }
  return false;
}

const TESTS = { email, social, link, phone };
function find(s, kinds = ['email', 'social', 'link', 'phone']){ const t = prep(s); return kinds.find(k => TESTS[k](t)) || null; }
const WHAT = { link: 'web address', email: 'email address', phone: 'phone number', social: 'social media handle or profile' };
const TIP = { link: ' If it is not a web address, add a space after the period.', phone: ' For prices or ranges, write them like $1,500 or 2-3 weeks.', email: '', social: '' };
// the friendly error for a field: which kind of detail to take out, and where it belongs instead
function message(kind, label, where){ return `Please remove the ${WHAT[kind]} from ${label.toLowerCase()}. ${where}${TIP[kind]}`; }
function check(s, label, where, fail, kinds){ const k = find(s, kinds); if(k) throw fail(message(k, label, where)); return s; }

module.exports = { find, check, message };
