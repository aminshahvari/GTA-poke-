// Notifications per device (Issue #23): on iPhone the Safari tab and the Home Screen app are separate, so an account can
// have notifications on while the app the player opens has none. The lobby must say what is true for THIS device:
//  - the account has a subscription (from another device or context) but this browser has none: "Notify me", not "on"
//  - with the browser's permission granted and still no subscription here: "Notify me" too
// Usage: PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_push_ui.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require(require.resolve('ws', { paths: [path.join(__dirname, '..', '..')] }));
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..', '..');
const PORT = 7400 + Math.floor(Math.random() * 200), BASE = 'http://127.0.0.1:' + PORT, DATA = path.join(require('os').tmpdir(), 't_push_ui_' + PORT + '_' + process.pid + '.json');
try{ fs.unlinkSync(DATA); }catch(e){}
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, STAGING: '', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const api = (p, body, tok) => fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
const sock = tok => new Promise(res => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok }))); ws.on('message', m => { if(JSON.parse(m).t === 'club' && !ws.ready){ ws.ready = true; res(ws); } }); });
(async () => {
  let browser;
  try{
    for(let i = 0; i < 50; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(200); }
    const O = (await api('setup', { code: 'secret', name: 'Test Director', pin: '1234', agree: true })).token;
    const so = await sock(O);
    so.send(JSON.stringify({ t: 'create', name: 'Push Night', stack: 10000, levelMin: 60, tableSize: 9, lateLevels: 0 })); await sleep(400);
    so.send(JSON.stringify({ t: 'join' })); await sleep(400);
    // the account's subscription, made somewhere else (Safari, another phone)
    const r = await api('push', { endpoint: 'https://push.example/elsewhere', keys: { p256dh: 'k', auth: 'a' } }, O);
    check(r.ok, 'a subscription from another context is stored for the account');
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
    for(const perm of ['default', 'granted']){
      const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
      if(perm === 'granted') await c.grantPermissions(['notifications'], { origin: BASE });
      const pg = await c.newPage();
      await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), O);
      await pg.reload();
      let txt = ''; for(let i = 0; i < 40 && !/Notify me|Notifications on/.test(txt); i++){ await sleep(250); txt = await pg.evaluate(() => document.body.innerText); }
      check(await pg.evaluate(() => Notification.permission) === perm, `${perm}: the browser's permission is ${perm}`);
      check(/Notify me when it starts/.test(txt) && !/Notifications on/.test(txt), `${perm}: this browser has no subscription, so the lobby offers "Notify me" (not "Notifications on")`);
      await c.close();
    }
  }catch(e){ check(false, 'error: ' + e.message); }
  if(browser) await browser.close();
  srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){}
  console.log(`t_push_ui: ${oks} ok, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
