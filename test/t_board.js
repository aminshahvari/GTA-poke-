// The Quiet Luxury board, phase B1 (Issue #32: Step-0 spec 6328417238 §2 and §10, Muse's rulings 6328611548, the
// app-shell defects 6329679268). Preview only, behind UI_BOARD:
//  - without UI_BOARD (and without UI_QUIET) every page is byte for byte the file on disk, and an unknown page is
//    today's plain "Not found"
//  - with UI_BOARD=1 the page is marked html[data-ui="board"] and loads /board.css; no hosted font is added; the
//    app shell (the mark from the first paint) is the only other change, and undoing it gives the file on disk
//  - UI_BOARD with UI_QUIET: the board wins (no quiet marker, no quiet.css)
//  - never on the production database: the switch is refused there, and the server says so when it starts
//  - unknown pages (/demo, /guest, /table) with a design on: a styled not-found page, still HTTP 404
//  - every selector in board.css sits under html[data-ui="board"]; the §2 tokens are there with the spec's values;
//    the hard-coded colours in board.css are counted against a baseline that may only go down
//  - WCAG contrast of the §2.1 text and background pairs and of the button labels, printed, each at least 4.5:1
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const shell = require('../server/shell');
const ROOT = path.join(__dirname, '..');
const PROD = 'dpg-db81kuom7kps73cmh9dg-a';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };

// the hard-coded colours (#hex, rgb()/rgba(), hsl()/hsla()) in board.css, comments aside. It may only go down: a
// component that needs a colour takes a token.
const COLOUR_BASELINE = 28;

async function serve(env){
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_board_')), PORT = 6900 + Math.floor(Math.random() * 100);
  let out = '';
  const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(tmp, 'data.json'), DATABASE_URL: '', STAGING: '', UI_QUIET: '', UI_BOARD: '', MEDIA_LAB: '', ...env }, stdio: ['ignore', 'pipe', 'ignore'] });
  srv.stdout.on('data', d => out += d);
  const base = 'http://localhost:' + PORT;
  for(let i = 0; i < 60; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const pages = {}; for(const p of ['/', '/login', '/join/blindrise']) pages[p] = await (await fetch(base + p)).text();
  const missing = {};
  for(const p of ['/demo', '/guest', '/table', '/nope.js', '/avatar/u000000000000']){ const r = await fetch(base + p); missing[p] = { status: r.status, type: r.headers.get('content-type'), csp: r.headers.get('content-security-policy'), body: await r.text() }; }
  const css = await fetch(base + '/board.css');
  const cssType = css.headers.get('content-type');
  srv.kill(); fs.rmSync(tmp, { recursive: true, force: true });
  return { pages, missing, cssStatus: css.status, cssType, log: out };
}
// what the server prints when it starts with this environment and stops before its store opens: STAGING=1 with a
// production-looking address makes it refuse to start right after the design switches are read, so nothing connects
// (the host is under .invalid, which never resolves, as a second guard)
function startLog(env){
  return new Promise(res => { let out = '';
    const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: 0, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', STAGING: '1', DATA_FILE: path.join(os.tmpdir(), 't_board_never.json'), UI_QUIET: '', UI_BOARD: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    srv.stdout.on('data', d => out += d); srv.stderr.on('data', d => out += d);
    const t = setTimeout(() => srv.kill(), 8000); srv.on('exit', code => { clearTimeout(t); res({ out, code }); }); });
}

// WCAG 2.x relative luminance and contrast; a colour with alpha is composited over its background first
const parse = c => { c = c.trim(); if(c[0] === '#'){ let h = c.slice(1); if(h.length === 3) h = h.replace(/./g, x => x + x); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(1); }
  const v = c.match(/[\d.]+/g).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
const over = (fg, bg) => fg.slice(0, 3).map((x, i) => x * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = c => { const v = c.slice(0, 3).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
const ratio = (fg, bg) => { const a = lum(over(fg, bg)), b = lum(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
const mid = (a, b) => a.map((x, i) => (x + b[i]) / 2);

(async () => {
  const disk = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const fontLinks = p => (p.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/g) || []).join('\n');

  // ---------- switch off ----------
  const off = await serve({});
  check(Object.values(off.pages).every(p => p === disk), 'switch off: every page is exactly index.html as it is on disk');
  check(!/data-ui|board\.css|quiet\.css|br-boot/.test(off.pages['/']), 'switch off: no marker, no board or quiet stylesheet, no shell');
  check(['/demo', '/guest', '/table', '/nope.js'].every(p => off.missing[p].status === 404 && off.missing[p].body === 'Not found' && /^text\/plain/.test(off.missing[p].type)), 'switch off: an unknown page is today\'s plain 404 "Not found"');
  check(!/UI_BOARD|UI_QUIET/.test(off.log), 'switch off: the server says nothing about a design');

  // ---------- switch on ----------
  const on = await serve({ UI_BOARD: '1' });
  check(Object.values(on.pages).every(p => p.includes('<html lang="en" data-ui="board">') && p.includes('<link rel="stylesheet" href="/board.css">')), 'switch on: every page is marked html[data-ui="board"] and loads board.css');
  check(Object.values(on.pages).every(p => !/quiet\.css|family=Inter/.test(p) && fontLinks(p) === fontLinks(disk)), 'switch on: no quiet.css and no hosted font added (the page keeps the fonts it already loads)');
  check(Object.values(on.pages).every(p => p.includes(shell.BOOT_DIV) && p.includes(shell.BOOT_CSS) && p.indexOf(shell.BOOT_DIV) < p.indexOf('<link rel="stylesheet" href="/style.css">')), 'switch on: the Blindrise mark is in the page, ahead of the stylesheets (first paint)');
  check(Object.values(on.pages).every(p => { const u = shell.unshellPage(p); return u !== null && u.replace('<html lang="en" data-ui="board">', '<html lang="en">').replace('<link rel="stylesheet" href="/board.css">\n', '') === disk; }), 'switch on: nothing else in the page changes (marker, board.css and the shell undone give the file on disk)');
  check(on.cssStatus === 200 && /^text\/css/.test(on.cssType), 'board.css is served as CSS');
  for(const p of ['/demo', '/guest', '/table']){ const m = on.missing[p];
    check(m.status === 404 && /^text\/html/.test(m.type) && m.body.includes('data-ui="board"') && m.body.includes(shell.MARK) && /<a href="\/">[^<]+<\/a>/.test(m.body) && (m.body.match(/<p>/g) || []).length === 1 && !/<script/i.test(m.body) && m.csp === off.missing[p].csp,
      `switch on: ${p} is a styled not-found page (404, the mark, one line of copy, a link home, no script, the same CSP)`); }
  check(on.missing['/nope.js'].status === 404 && on.missing['/nope.js'].body === 'Not found' && on.missing['/avatar/u000000000000'].body === 'Not found', 'switch on: a missing file (not a page) keeps the plain 404');
  check(/UI_BOARD: the board design is on\b/.test(on.log), 'switch on: the server says the board design is on');

  // ---------- both switches: the board wins ----------
  const both = await serve({ UI_BOARD: '1', UI_QUIET: '1' });
  check(Object.values(both.pages).every(p => p.includes('data-ui="board"') && !p.includes('data-ui="quiet"') && !p.includes('quiet.css') && !p.includes('family=Inter')), 'UI_BOARD and UI_QUIET: the board wins (no quiet marker, no quiet.css)');
  check(both.pages['/'] === on.pages['/'], 'UI_BOARD and UI_QUIET: the page is the board page exactly');
  check(/UI_QUIET ignored: UI_BOARD is on/.test(both.log), 'UI_BOARD and UI_QUIET: the server says the quiet design is set aside');

  // ---------- quiet alone: the shell comes with it ----------
  const quiet = await serve({ UI_QUIET: '1' });
  check(quiet.pages['/'].includes('data-ui="quiet"') && quiet.pages['/'].includes(shell.BOOT_DIV) && !quiet.pages['/'].includes('board.css'), 'UI_QUIET alone: the quiet page, with the shell, without board.css');
  check(quiet.missing['/demo'].status === 404 && quiet.missing['/demo'].body.includes('data-ui="quiet"') && quiet.missing['/demo'].body.includes(shell.MARK), 'UI_QUIET alone: /demo is the styled not-found page');

  // ---------- never on the production database ----------
  const prodUrl = `postgres://u:p@${PROD}.invalid:1/none`;
  check(!shell.boardOn({ UI_BOARD: '1', DATABASE_URL: prodUrl }, PROD), 'on the production database UI_BOARD alone is refused');
  check(shell.boardOn({ UI_BOARD: '1', UI_BOARD_LIVE: '1', DATABASE_URL: prodUrl }, PROD) && !shell.boardOn({ UI_BOARD_LIVE: '1', DATABASE_URL: prodUrl }, PROD) && !shell.boardOn({ UI_BOARD: '1', UI_BOARD_LIVE: 'true', DATABASE_URL: prodUrl }, PROD), 'on the production database it needs UI_BOARD=1 and UI_BOARD_LIVE=1, both exactly');
  check(shell.boardOn({ UI_BOARD: '1', DATABASE_URL: 'postgres://u:p@dpg-preview-a/db' }, PROD) && shell.boardOn({ UI_BOARD: '1' }, PROD), 'elsewhere UI_BOARD=1 turns it on');
  check(!shell.boardOn({ UI_BOARD: '' }, PROD) && !shell.boardOn({ UI_BOARD: 'true' }, PROD) && !shell.boardOn({}, PROD), 'only UI_BOARD=1 turns it on');
  check(/const boardUI = \(\) => shell\.boardOn\(process\.env, PROD_DB_HOST\);/.test(fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8')), 'the server asks shell.boardOn with its production database host');
  const pl = await startLog({ UI_BOARD: '1', UI_QUIET: '1', DATABASE_URL: prodUrl });
  check(/UI_BOARD ignored: this is the production database/.test(pl.out) && /UI_QUIET ignored: this is the production database/.test(pl.out) && pl.code !== 0, 'the server, on the production database, says both switches are ignored (and, as staging, refuses to start)');

  // ---------- board.css: scope ----------
  const raw = fs.readFileSync(path.join(ROOT, 'public', 'board.css'), 'utf8'), src = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const flat = src.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
  const sels = []; flat.replace(/([^{}]+)\{[^{}]*\}/g, (m, s) => { s = s.trim(); if(!s.startsWith('@')) sels.push(...s.split(/,(?![^()]*\))/).map(x => x.trim())); return m; });
  const loose = sels.filter(s => !s.startsWith('[data-ui="board"]'));
  check(sels.length > 15 && !loose.length, `all ${sels.length} selectors in board.css sit under html[data-ui="board"]${loose.length ? ': ' + loose.join(' | ') : ''}`);
  check(!/@import|@font-face|url\(/.test(src), 'board.css loads nothing (no import, no hosted font, no image)');

  // ---------- board.css: tokens (§2) ----------
  const block = src.match(/\[data-ui="board"\]\{([^{}]*)\}/)[1], tok = {};
  block.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (m, k, v) => { tok[k] = v.trim(); return m; });
  const SPEC = {
    '--b-bg': '#00050c', '--b-surface': '#0b1620', '--b-surface-2': '#111f2b', '--b-hair': 'rgba(255,255,255,.08)', '--b-hair-gold': 'rgba(217,166,81,.30)',
    '--b-felt': '#074c2a', '--b-felt-edge': '#01180c', '--b-rail': '#0d1214', '--b-rail-hi': 'rgba(217,166,81,.18)',
    '--b-text': '#f5f6f3', '--b-text-2': 'rgba(245,246,243,.64)', '--b-text-3': 'rgba(245,246,243,.48)' /* spec .42, raised to pass AA (below) */,
    '--b-gold': '#d9a651', '--b-gold-text': '#ebe1b9', '--b-live': '#e5484d', '--b-online': '#3fcf6e', '--b-away': '#8a93a3', '--b-warn': '#f0a24a',
    '--b-fold-top': '#bc2c34', '--b-fold-bot': '#85131b', '--b-fold-label': '#fff', '--b-call-top': '#206ab6', '--b-call-bot': '#0b3063', '--b-call-label': '#fff',
    '--b-raise-top': '#ca9a4d', '--b-raise-bot': '#855c2f', '--b-raise-label': '#1a1206',
    '--b-fold': 'linear-gradient(180deg,var(--b-fold-top),var(--b-fold-bot))', '--b-call': 'linear-gradient(180deg,var(--b-call-top),var(--b-call-bot))', '--b-raise': 'linear-gradient(180deg,var(--b-raise-top),var(--b-raise-bot))',
    '--b-more': 'var(--b-surface)', '--b-more-line': 'var(--b-hair)', '--b-more-icon': 'var(--b-text-2)',
    '--b-font': '-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,"IBM Plex Sans",sans-serif',
    '--b-t-11': '11px', '--b-t-13': '13px', '--b-t-14': '14px', '--b-t-15': '15px', '--b-t-17': '17px', '--b-t-20': '20px', '--b-t-22': '22px', '--b-t-28': '28px',
    '--b-r-chip': '8px', '--b-r-plate': '12px', '--b-r-btn': '12px', '--b-r-card': '16px', '--b-r-sheet': '16px', '--b-r-hero': '24px', '--b-r-pill': '999px',
    '--b-s1': '4px', '--b-s2': '8px', '--b-s3': '12px', '--b-s4': '16px', '--b-s5': '20px', '--b-s6': '28px', '--b-tap': '44px', '--b-act-h': '60px',
    '--b-press-scale': '.97', '--b-press-dur': '120ms', '--b-sheet-dur': '340ms', '--b-sheet-ease': 'cubic-bezier(.32,.72,0,1)', '--b-seat-dur': '220ms', '--b-glow-dur': '400ms' };
  // where the board (the owner's exact visual standard) and the spec's §2.1 table differ: the spec's value, for the record
  const SPEC_WAS = { '--b-bg': '#03070d', '--b-surface': '#0a1420', '--b-surface-2': '#101c2b', '--b-hair-gold': 'rgba(212,178,108,.30)', '--b-felt': '#05472a', '--b-felt-edge': '#01261a',
    '--b-rail': '#07111a', '--b-rail-hi': 'rgba(212,178,108,.18)', '--b-text': '#f4f0e7', '--b-text-2': 'rgba(244,240,231,.64)', '--b-text-3': 'rgba(244,240,231,.42)', '--b-gold': '#d4b26c', '--b-gold-text': '#f1d48c',
    '--b-fold-bot': '#83121b', '--b-call-top': '#226eba', '--b-call-bot': '#0b3061', '--b-raise-top': '#d8ad5f', '--b-raise-bot': '#9c7238' };
  console.log('     tokens from the board where it differs from the spec:'); for(const [k, v] of Object.entries(SPEC_WAS)) console.log(`       ${k.padEnd(14)} board ${SPEC[k].padEnd(22)} spec ${v}`);
  const wrong = Object.entries(SPEC).filter(([k, v]) => tok[k] !== v).map(([k, v]) => `${k} is ${tok[k]}, spec ${v}`);
  check(!wrong.length, `all ${Object.keys(SPEC).length} §2 tokens present with their values (the board's sampled colour where it differs from the spec)${wrong.length ? ': ' + wrong.join('; ') : ''}`);
  const MAP = { '--lx-ink': 'var(--b-bg)', '--lx-navy': 'var(--b-surface)', '--lx-navy2': 'var(--b-surface-2)', '--lx-gold': 'var(--b-gold)', '--lx-gold-hi': 'var(--b-gold-text)', '--lx-ivory': 'var(--b-text)', '--lx-mute': 'var(--b-text-2)', '--lx-mute2': 'var(--b-text-3)', '--lx-hair': 'var(--b-hair)', '--lx-hair2': 'var(--b-hair-gold)', '--lx-gold-grad': 'var(--b-raise)',
    '--q-bg': 'var(--b-bg)', '--q-surface': 'var(--b-surface)', '--q-surface2': 'var(--b-surface-2)', '--q-text': 'var(--b-text)', '--q-text2': 'var(--b-text-2)', '--q-text3': 'var(--b-text-3)', '--q-gold': 'var(--b-gold)', '--q-hair': 'var(--b-hair)', '--q-hair-gold': 'var(--b-hair-gold)', '--q-font': 'var(--b-font)',
    '--display': 'var(--b-font)', '--body': 'var(--b-font)', '--cond': 'var(--b-font)' };
  const unmapped = Object.entries(MAP).filter(([k, v]) => tok[k] !== v).map(([k]) => k);
  check(!unmapped.length, `the older --lx-* and --q-* names point at the board's tokens${unmapped.length ? ': ' + unmapped.join(', ') : ''}`);
  check(!Object.keys(tok).some(k => /^--lx-(r|s)\d|^--lx-r-|^--lx-s\d|^--lx-tap|^--lx-nav-h/.test(k)), 'no geometry name is remapped in B1 (radii, spacing, tap and nav sizes stay)');
  const reduced = src.match(/@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?)\n\}/);
  check(reduced && /--b-press-scale:1/.test(reduced[1]) && /--b-slide:0/.test(reduced[1]), 'reduced motion: no scale, no slide');
  check(/\[data-ui="board"\] body\{font-family:var\(--b-font\)/.test(src) && /font-variant-numeric:tabular-nums/.test(src), 'the system face on the page, tabular numbers on chips, stacks, clocks and counts');

  // ---------- board.css: hard-coded colours ----------
  const colours = (src.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi) || []).length;
  console.log(`     hard-coded colours in board.css: ${colours} (baseline ${COLOUR_BASELINE})`);
  check(colours <= COLOUR_BASELINE, `hard-coded colours in board.css ${colours} <= baseline ${COLOUR_BASELINE} (it may only go down)`);
  const tokenBlockColours = (block.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi) || []).length;
  check(tokenBlockColours === colours, 'every hard-coded colour in board.css is a token definition (components use tokens)');

  // ---------- contrast (§2.1) ----------
  const C = k => parse(tok[k]);
  const plate = over(parse('rgba(3,7,13,.86)'), C('--b-felt')); // §3.3 seat plate over the felt
  const PAIRS = [
    ['--b-text on --b-bg', C('--b-text'), C('--b-bg')], ['--b-text on --b-surface', C('--b-text'), C('--b-surface')], ['--b-text on --b-surface-2', C('--b-text'), C('--b-surface-2')],
    ['--b-text-2 on --b-bg', C('--b-text-2'), C('--b-bg')], ['--b-text-2 on --b-surface', C('--b-text-2'), C('--b-surface')], ['--b-text-2 on --b-surface-2', C('--b-text-2'), C('--b-surface-2')],
    ['--b-text-3 on --b-bg', C('--b-text-3'), C('--b-bg')], ['--b-text-3 on --b-surface', C('--b-text-3'), C('--b-surface')], ['--b-text-3 on --b-surface-2', C('--b-text-3'), C('--b-surface-2')],
    ['--b-gold on --b-surface', C('--b-gold'), C('--b-surface')], ['--b-gold-text on --b-surface', C('--b-gold-text'), C('--b-surface')], ['--b-gold-text on --b-surface-2', C('--b-gold-text'), C('--b-surface-2')],
    ['seat name --b-text on the plate over the felt', C('--b-text'), plate], ['seat stack --b-gold-text on the plate over the felt', C('--b-gold-text'), plate],
    ['"⋯" --b-more-icon (--b-text-2) on --b-more', C('--b-text-2'), C('--b-surface')],
    ['Fold label on its lightest stop (top)', C('--b-fold-label'), C('--b-fold-top')], ['Call label on its lightest stop (top)', C('--b-call-label'), C('--b-call-top')],
    ['Raise label on its lightest stop (top)', C('--b-raise-label'), C('--b-raise-top')],
    ['Raise label at the middle of its gradient (where the label sits)', C('--b-raise-label'), mid(C('--b-raise-top'), C('--b-raise-bot'))] ];
  console.log('     WCAG contrast (AA needs 4.5:1):');
  for(const [name, fg, bg] of PAIRS){ const r = ratio(fg, bg); console.log(`       ${r.toFixed(2).padStart(5)}:1  ${name}`); }
  for(const [name, fg, bg] of PAIRS) check(ratio(fg, bg) >= 4.5, `contrast ${ratio(fg, bg).toFixed(2)}:1 >= 4.5 — ${name}`);
  // for the record (not the spec's rule): the labels at the darkest stop of their gradients, and the spec's own text-3
  const NOTE = [['Fold label at its bottom stop', C('--b-fold-label'), C('--b-fold-bot')], ['Call label at its bottom stop', C('--b-call-label'), C('--b-call-bot')], ['Raise label at its bottom stop', C('--b-raise-label'), C('--b-raise-bot')],
    ['spec --b-text-3 (.42) on --b-surface-2', parse('rgba(245,246,243,.42)'), C('--b-surface-2')]];
  console.log('     for the record:'); for(const [name, fg, bg] of NOTE) console.log(`       ${ratio(fg, bg).toFixed(2).padStart(5)}:1  ${name}`);
  check(ratio(parse('rgba(245,246,243,.42)'), C('--b-surface-2')) < 4.5 && ratio(parse('rgba(245,246,243,.47)'), C('--b-surface-2')) < 4.5, '--b-text-3 at .48 is the nearest step that passes (the spec\'s .42, and .47, do not)');

  // ---------- B2 (the table, §3): every text the table adds, on what it is drawn over ----------
  // The B2 tones are color-mix() of the tokens; they are resolved here the way the browser mixes them (srgb with
  // transparent: the colour at that share of opacity; oklab between two colours), then composited.
  const lin = x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }, gam = x => 255 * (x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055);
  const toLab = ([r, g, b]) => { const [R, G, B] = [r, g, b].map(lin), l = Math.cbrt(.4122214708 * R + .5363325363 * G + .0514459929 * B), m = Math.cbrt(.2119034982 * R + .6806995451 * G + .1073969566 * B), s = Math.cbrt(.0883024619 * R + .2817188376 * G + .6299787005 * B);
    return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s]; };
  const fromLab = ([L, a, b2]) => { const l = (L + .3963377774 * a + .2158037573 * b2) ** 3, m = (L - .1055613458 * a - .0638541728 * b2) ** 3, s = (L - .0894841775 * a - 1.291485548 * b2) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s].map(x => Math.max(0, Math.min(255, gam(x)))); };
  const res = v => { v = v.trim(); const ref = v.match(/^var\((--[\w-]+)\)$/); if(ref) return res(tok[ref[1]]);
    const mx = v.match(/^color-mix\(in (srgb|oklab),(.+)\)$/); if(!mx) return parse(v);
    const parts = mx[2].split(/,(?![^()]*\))/).map(s => { const m = s.trim().match(/^(.*?)(?:\s+([\d.]+)%)?$/); return { c: m[1].trim(), p: m[2] == null ? null : +m[2] / 100 }; });
    let [a, b] = parts; if(a.p == null && b.p == null){ a.p = .5; b.p = .5; } else if(a.p == null) a.p = 1 - b.p; else if(b.p == null) b.p = 1 - a.p;
    if(b.c === 'transparent'){ const c = res(a.c); return [c[0], c[1], c[2], c[3] * a.p]; }
    const A = res(a.c), B = res(b.c);
    if(mx[1] === 'srgb') return A.slice(0, 3).map((x, i) => x * a.p + B[i] * b.p).concat(1);
    const la = toLab(A), lb = toLab(B); return fromLab(la.map((x, i) => x * a.p + lb[i] * b.p)).concat(1); };
  const T = k => res(tok[k]);
  // what the seats, the pot and the chips sit on: the felt's lit middle (its lightest), the felt, the rail, the ground
  const GROUNDS = [['the lit felt', T('--b-felt-hi')], ['the felt', T('--b-felt')], ['the rail', T('--b-rail-top')], ['the ground', T('--b-ground-hi')]];
  const ON = (fill, g) => over(fill, g), plateOn = g => ON(T('--b-plate'), g), pillOn = g => ON(T('--b-pill'), g);
  const B2 = [];
  for(const [gn, g] of GROUNDS){
    B2.push([`seat name (--b-text) on its plate over ${gn}`, T('--b-text'), plateOn(g)], [`seat stack (--b-gold-text) on its plate over ${gn}`, T('--b-gold-text'), plateOn(g)],
      [`"Call"/"Check" in a name line (--b-act-call) on the plate over ${gn}`, T('--b-act-call'), plateOn(g)], [`"Raise"/"Winner"/a hand in a name line (--b-gold-text) on the plate over ${gn}`, T('--b-gold-text'), plateOn(g)],
      [`a folded seat's name, stack and "Fold" (--b-text-2) on the plate over ${gn}`, T('--b-text-2'), plateOn(g)],
      [`the pot (--b-text) on its pill over ${gn}`, T('--b-text'), pillOn(g)], [`a bet (--b-text) on its pill over ${gn}`, T('--b-text'), pillOn(g)]);
  }
  B2.push(['"Away" (--b-text) on --b-surface-2', T('--b-text'), T('--b-surface-2')], ['"Disconnected" (--b-on-warn) on --b-warn', T('--b-on-warn'), T('--b-warn')],
    ['the dealer button "D" (--b-on-dealer) on --b-dealer', T('--b-on-dealer'), T('--b-dealer')], ['an initials disc (--b-text) on --b-surface-2', T('--b-text'), T('--b-surface-2')],
    ['the winner line (--b-text) on the lit felt', T('--b-text'), T('--b-felt-hi')],
    ['the info line (--b-text-2) on --b-bg', T('--b-text-2'), T('--b-bg')], ['the info line, bold (--b-text) on --b-bg', T('--b-text'), T('--b-bg')], ['the free-play line (--b-text-3) on --b-bg', T('--b-text-3'), T('--b-bg')],
    ['the helper: the hand (--b-text) on --b-bg', T('--b-text'), T('--b-bg')], ['the helper: a good chance (--b-good) on --b-bg', T('--b-good'), T('--b-bg')],
    ['the helper: a middling chance (--b-gold-text) on --b-bg', T('--b-gold-text'), T('--b-bg')], ['the helper: a poor chance (--b-bad) on --b-bg', T('--b-bad'), T('--b-bg')],
    ['"+30s" (--b-gold-text) on --b-surface', T('--b-gold-text'), T('--b-surface')], ['"+30s": "3 left" (--b-text-2) on --b-surface', T('--b-text-2'), T('--b-surface')],
    ['a quick action (--b-text) on --b-surface', T('--b-text'), T('--b-surface')], ['a quick action, on (--b-text) on --b-gold-fill over --b-surface', T('--b-text'), over(T('--b-gold-fill'), T('--b-surface'))],
    ['a sizing preset, chosen (--b-gold-text) on --b-gold-fill over --b-surface', T('--b-gold-text'), over(T('--b-gold-fill'), T('--b-surface'))],
    ['the table menu: a row (--b-text) on --b-surface-2', T('--b-text'), T('--b-surface-2')], ['the table menu: a note (--b-text-2) on --b-surface-2', T('--b-text-2'), T('--b-surface-2')],
    ['the table menu: unread (--b-gold-text) on --b-surface-2', T('--b-gold-text'), T('--b-surface-2')], ['the table menu: its title (--b-text-2) on --b-surface', T('--b-text-2'), T('--b-surface')],
    ['"Back" in the sizing (--b-text) on --b-surface', T('--b-text'), T('--b-surface')]);
  console.log('     B2 contrast (AA needs 4.5:1):');
  for(const [name, fg, bg] of B2) console.log(`       ${ratio(fg, bg).toFixed(2).padStart(5)}:1  ${name}`);
  const weak = B2.filter(([, fg, bg]) => ratio(fg, bg) < 4.5).map(([name, fg, bg]) => `${ratio(fg, bg).toFixed(2)}:1 ${name}`);
  check(!weak.length, `B2: all ${B2.length} table texts at least 4.5:1${weak.length ? ' — under: ' + weak.join('; ') : ''}`);
  // "+" on an empty seat is decoration (aria-hidden, not a control): for the record
  console.log(`     for the record: "+" on an empty seat (--b-text-3 on --b-surface) ${ratio(T('--b-text-3'), T('--b-surface')).toFixed(2)}:1`);

  console.log(`\n${n} checks passed`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
