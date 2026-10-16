// Shared helpers for the evidence scripts in this folder. Local only, fake data only.
// Nothing here touches production, staging, Render or any real database: every server is spawned from this
// checkout with STAGING=1 (fake seed) and a throwaway DATA_FILE in the OS temp folder, deleted at the end.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..'); // repository root
const EVID = path.resolve(__dirname, '..');                     // docs/evidence/2026-10-16
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WebSocket = require(path.join(ROOT, 'node_modules', 'ws'));

// which code is running: HEAD and whether app code differs from the audited staging tip
function codeInfo(ref = 'a3c67e9'){
  const sh = c => { try{ return execSync(c, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }catch(e){ return null; } };
  const diff = sh(`git diff --stat ${ref} -- . ':!docs'`);
  return { head: sh('git rev-parse --short HEAD'), auditedRef: ref, appCodeIdenticalToRef: diff === '' };
}

// ---------- local server ----------
const servers = [];
async function startServer(opts = {}){
  const port = opts.port || 4600 + Math.floor(Math.random() * 300);
  const data = path.join(os.tmpdir(), `evidence_${process.pid}_${port}.json`);
  fs.rmSync(data, { force: true });
  const env = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'evidence-code', DATA_FILE: data,
    STAGING: opts.staging === false ? '' : '1', FAST: opts.fast ? '1' : '', DATABASE_URL: '', ...(opts.env || {}) };
  const p = spawn(process.execPath, ['server/index.js'], { cwd: opts.cwd || ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.logs = [];
  p.stdout.on('data', d => p.logs.push(...String(d).split('\n').filter(Boolean)));
  p.stderr.on('data', d => p.logs.push(...String(d).split('\n').filter(Boolean).map(l => 'ERR ' + l)));
  p.base = 'http://localhost:' + port; p.data = data;
  servers.push(p);
  for(let i = 0; i < 80; i++){ try{ if((await fetch(p.base + '/healthz')).ok) return p; }catch(e){} await sleep(150); }
  throw new Error('server did not start: ' + p.logs.join(' | '));
}
function stopAll(){ for(const p of servers){ try{ p.kill(); }catch(e){} try{ fs.rmSync(p.data, { force: true }); }catch(e){} } }

// ---------- API calls, recorded with tokens redacted ----------
const REDACT_KEYS = new Set(['token', 'pin', 'salt']);
function redact(v){
  if(Array.isArray(v)) return v.map(redact);
  if(v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, REDACT_KEYS.has(k) ? '<redacted>' : redact(x)]));
  return v;
}
class Recorder {
  constructor(base){ this.base = base; this.log = []; this.who = new Map(); }
  name(tok, label){ this.who.set(tok, label); return tok; }
  async call(p, body, tok, note){
    const headers = { 'content-type': 'application/json' };
    if(tok) headers.authorization = 'Bearer ' + tok;
    const r = await fetch(this.base + '/api/' + p, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    const json = await r.json().catch(() => ({}));
    const entry = { step: note || null, request: { method: 'POST', path: '/api/' + p, auth: tok ? `Bearer <token of ${this.who.get(tok) || 'unknown'}>` : 'none', body: redact(body || {}) },
      response: { status: r.status, xRobotsTag: r.headers.get('x-robots-tag'), body: redact(json) } };
    this.log.push(entry);
    return { status: r.status, body: json, headers: r.headers };
  }
  save(file){ fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(this.log, null, 2) + '\n'); }
}
async function login(rec, name, pin){
  const r = await rec.call('login', { name, pin }, null, 'sign in as ' + name);
  if(r.status !== 200) throw new Error('login failed for ' + name + ': ' + JSON.stringify(r.body));
  return rec.name(r.body.token, name);
}
// staging seed: Test Director / 246810, Test Player NN / 1357 + last digit twice
const playerPin = n => '1357' + String(n % 10).repeat(2);
const playerName = n => 'Test Player ' + String(n).padStart(2, '0');

// one websocket session: hello, then send messages; resolves with the user id and every message received
function ws(base, tok, msgs = [], waitMs = 400){
  return new Promise((res, rej) => {
    const s = new WebSocket(base.replace('http', 'ws') + '/ws', { headers: { origin: base } });
    const got = []; let me = null;
    s.on('open', () => s.send(JSON.stringify({ t: 'hello', token: tok })));
    s.on('message', async m => { m = JSON.parse(m); got.push(m);
      if(m.t === 'auth' && !m.ok){ s.close(); return res({ me: null, got }); }
      if(m.t === 'club' && !me){ me = m.club.me.id; for(const x of msgs){ s.send(JSON.stringify(x)); await sleep(120); } setTimeout(() => { s.close(); res({ me, got, club: m.club }); }, waitMs); } });
    s.on('error', rej);
  });
}

// ---------- browser (Playwright, Chromium from /opt/pw-browsers) ----------
let browser = null;
function chromiumPath(){
  if(process.env.CHROMIUM) return process.env.CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try{ const d = fs.readdirSync(base).filter(x => /^chromium-\d+$/.test(x)).sort().pop(); if(d) return path.join(base, d, 'chrome-linux', 'chrome'); }catch(e){}
  return undefined;
}
async function launch(){
  if(browser) return browser;
  const { chromium } = require(process.env.PLAYWRIGHT_CORE || path.join(ROOT, 'node_modules', 'playwright-core'));
  browser = await chromium.launch({ executablePath: chromiumPath() });
  return browser;
}
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
// Google Fonts (in index.html since before BC1) cannot be reached from the sandbox. With FONTS_DIR pointing at a folder
// holding ibm-plex-sans-latin-<weight>-normal.woff2 files (npm @fontsource/ibm-plex-sans) they are served locally so the
// screenshots look like the real app; otherwise font requests are aborted and the system fallback font is used.
async function routeOffline(ctx, base){
  const fonts = process.env.FONTS_DIR;
  ctx.fontReq = [];
  ctx.on('request', r => { if(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(r.url())) ctx.fontReq.push(r.url()); });
  await ctx.route('https://fonts.googleapis.com/**', r => fonts ? r.fulfill({ contentType: 'text/css', body: [400, 500, 600, 700].map(w => `@font-face{font-family:"IBM Plex Sans";font-weight:${w};src:url(https://fonts.gstatic.com/plex-${w}.woff2) format("woff2")}@font-face{font-family:"IBM Plex Sans Condensed";font-weight:${w};src:url(https://fonts.gstatic.com/plex-${w}.woff2) format("woff2")}`).join('') }) : r.abort());
  await ctx.route('https://fonts.gstatic.com/**', r => { const m = /plex-(\d+)/.exec(r.request().url()); const f = fonts && m && path.join(fonts, `ibm-plex-sans-latin-${m[1]}-normal.woff2`);
    return f && fs.existsSync(f) ? r.fulfill({ contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
  // anything else that is not our own server is blocked and counted
  ctx.thirdParty = [];
  await ctx.route(u => { const s = String(u); return !s.startsWith(base) && !s.startsWith(base.replace('http', 'ws')) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(s) && !s.startsWith('data:') && !s.startsWith('blob:'); }, r => { ctx.thirdParty.push(r.request().url()); r.abort(); });
}
// a signed-in phone page (token put in localStorage the way the app stores it)
async function phonePage(base, tok, opts = {}){
  const b = await launch();
  const ctx = await b.newContext({ ...PHONE, serviceWorkers: 'block' });
  await routeOffline(ctx, base);
  if(tok) await ctx.addInitScript(t => { try{ localStorage.setItem('stacked:token', JSON.stringify(t)); localStorage.setItem('stacked:picNudge', '9'); }catch(e){} }, tok);
  const p = await ctx.newPage();
  p.errors = []; p.csp = [];
  p.on('pageerror', e => p.errors.push(String(e)));
  p.on('console', m => { if(/Content Security Policy|Refused to/i.test(m.text())) p.csp.push(m.text()); });
  await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await p.goto(base + '/');
  if(tok && opts.wait !== false) await p.waitForSelector('#lobby:not([hidden])', { timeout: 15000 });
  await sleep(1200);
  return p;
}
async function shot(p, file, full){
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sleep(450);
  if(full){
    const vp = p.viewportSize();
    const hgt = await p.evaluate(() => { const b = document.getElementById('lobbyBody'); return b && !document.getElementById('lobby').hidden ? b.scrollHeight + b.getBoundingClientRect().top + 10 : document.documentElement.scrollHeight; });
    await p.setViewportSize({ width: vp.width, height: Math.min(4000, Math.max(vp.height, Math.ceil(hgt))) }); await sleep(350);
    await p.screenshot({ path: file }); await p.setViewportSize(vp);
  } else await p.screenshot({ path: file });
  return path.relative(EVID, file);
}
const tab = async (p, t) => { await p.click(`#tabs [data-tab="${t}"]`); await sleep(800); };
async function closeBrowser(){ if(browser){ try{ await browser.close(); }catch(e){} browser = null; } }

// ---------- result table ----------
function table(rows){
  const w = [4, 0, 6]; rows.forEach(r => { w[1] = Math.max(w[1], r.check.length); });
  const line = (a, b, c) => `${a.padEnd(w[0])} | ${b.padEnd(w[1])} | ${c}`;
  return [line('ID', 'Check', 'Result'), '-'.repeat(w[0] + w[1] + 16), ...rows.map(r => line(r.id, r.check, r.ok ? 'PASS' : 'FAIL' + (r.detail ? ' (' + r.detail + ')' : '')))].join('\n');
}

module.exports = { ROOT, EVID, sleep, codeInfo, startServer, stopAll, Recorder, redact, login, playerPin, playerName, ws, launch, phonePage, shot, tab, closeBrowser, table, PHONE };
