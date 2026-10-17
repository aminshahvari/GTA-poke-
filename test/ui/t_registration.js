// M-3 regression (browser, UI only): "You're registered" pill, "Cancel my registration" with a confirmation
// ("Keep my seat" keeps it), and a registered player waiting for a seat no longer reads "You are not playing".
// Registration logic is server-side and unchanged; this checks only what the member sees and sends.
// PLAYWRIGHT=/path/to/playwright CHROMIUM=/path/to/chromium node test/ui/t_registration.js
const assert = require('assert');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const PORT = 4850 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_reg_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/../..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = async (p, body, tok) => (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
function sock(tok){ return new Promise(res => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', token: tok })); setTimeout(() => res(ws), 300); }); }); }
(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await post('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const join = async name => { const { code } = await post('invite', {}, O); return (await post('redeem', { code, name, pin: '1111', agree: true })).token; };
  const A = await join('Alex'), B = await join('Bea');
  const ow = await sock(O); ow.send(JSON.stringify({ t: 'create', name: 'Test Night', stack: 30000, levelMin: 20, tableSize: 9, lateLevels: 0 })); await sleep(300);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(BASE + '/'); await p.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), A);
  await p.reload(); await p.waitForSelector('#joinBtn');
  assert.strictEqual(await p.locator('.status-pill.reg').count(), 0, 'no pill before joining');
  await p.click('#joinBtn'); await p.waitForSelector('#leaveBtn');
  // the offer-a-reminder sheet may open after joining; close it if it does
  await sleep(900); if(await p.locator('.modal button').count()) await p.locator('.modal button').first().click();
  assert.strictEqual((await p.textContent('#leaveBtn')).trim(), 'Cancel my registration');
  assert.match(await p.textContent('.status-pill.reg'), /You're registered/);
  // "Keep my seat" keeps the registration
  await p.click('#leaveBtn'); await p.waitForSelector('text=Cancel your registration?');
  await p.click('text=Keep my seat'); await sleep(400);
  assert.ok(await p.locator('#leaveBtn').count(), 'still registered after Keep my seat');
  // confirming cancels it (server still does the cancelling)
  await p.click('#leaveBtn'); await p.waitForSelector('text=Cancel your registration?');
  await p.locator('.modal button', { hasText: 'Cancel my registration' }).click(); await p.waitForSelector('#joinBtn');
  assert.strictEqual(await p.locator('.status-pill.reg').count(), 0);
  // a registered player with no table yet (the moment before seating) and a non-registered player:
  // the server's club view is rewritten in flight to those states (the page's own code renders it)
  await browser.close();
  const b2 = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const view = async (regsMe) => {
    const pg = await b2.newPage({ viewport: { width: 390, height: 844 } });
    await pg.routeWebSocket(/\/ws$/, ws => { const server = ws.connectToServer();
      server.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'club' && j.club.tourney){ j.club.tourney = { ...j.club.tourney, status: 'running', regs: regsMe ? [j.club.me.id] : ['someone-else'], places: [], remaining: 2, entrants: 2, level: 0, lateOpen: false }; j.club.myTable = null; j.club.tables = []; return ws.send(JSON.stringify(j)); } }catch(e){} ws.send(m); }); });
    await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), A);
    await pg.reload(); await pg.waitForSelector('.status-pill.live');
    const txt = await pg.textContent('#lobbyBody'); await pg.close(); return txt;
  };
  const waiting = await view(true);
  assert.match(waiting, /Finding your seat/); assert.doesNotMatch(waiting, /You are not playing/); assert.match(waiting, /You're registered/);
  assert.match(await view(false), /You are not playing/);
  await b2.close();
  ow.close();
  console.log('registration ui test passed');
  srv.kill(); require('fs').rmSync(DATA, { force: true }); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
