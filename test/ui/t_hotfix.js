// R2 hotfix checks (browser), from Sean's iPhone screenshots of Oct 17:
// 1. Director > Members: a member's invite link row ("Test Player 01's link") must keep its name readable on one or two
//    lines, never squeezed to one letter per line; the joined count and the buttons wrap below it instead.
// 2. Demo table: no seat's action badge may cover its stack number, and the top seat's cards stay below the info bar.
// Usage: node test/ui/t_hotfix.js [screenshot dir]
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
const ROOT = path.join(__dirname, '..', '..');
const PORT = 4800 + Math.floor(Math.random() * 100), BASE = 'http://127.0.0.1:' + PORT, DATA = '/tmp/t_hotfix_' + PORT + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const post = (p, body, tok) => fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());

async function signedIn(browser, tok, [w, h]){
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(400);
  return pg;
}

(async () => {
  await sleep(1500);
  const dir = await post('login', { name: 'Test Director', pin: '246810' });
  // two members make their own invite links (as Soltan and Sisi did); the director also has a group and a personal link
  for(const [n, pin] of [['Test Player 01', '135711'], ['Test Player 02', '135722']]){
    const m = await post('login', { name: n, pin });
    await post('invite', {}, m.token);
  }
  await post('invite', {}, dir.token);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  let groupMade = false;
  for(const vp of [[320, 568], [375, 667], [390, 844], [430, 932]]){
    const pg = await signedIn(browser, dir.token, vp);
    await pg.click('#tabs [data-tab=director]'); await sleep(400);
    if(!groupMade){ await pg.click('#inviteBtn'); await sleep(300); await pg.click('.modal button:has-text("Group link")'); await sleep(400); await pg.click('.modal button:has-text("Done")').catch(() => {}); await sleep(400); groupMade = true; }
    const rows = await pg.$$eval('#lobby .table-list .trow', rs => rs.filter(r => r.querySelector('[data-copy]')).map(r => {
      const b = r.querySelector('b'), bb = b.getBoundingClientRect(), lh = parseFloat(getComputedStyle(b).lineHeight) || parseFloat(getComputedStyle(b).fontSize) * 1.3;
      return { name: b.textContent, w: Math.round(bb.width), lines: Math.round(bb.height / lh), right: r.getBoundingClientRect().right, vw: innerWidth };
    }));
    const member = rows.filter(r => /'s link$/.test(r.name));
    check(member.length >= 2, `${vp[0]}px: member link rows shown (${member.length})`);
    for(const r of rows) check(r.lines <= 2 && r.w >= 96, `${vp[0]}px: "${r.name}" readable (${r.w}px wide, ${r.lines} line${r.lines === 1 ? '' : 's'})`);
    check(rows.some(r => r.name === 'Group link') && rows.some(r => r.name === 'Unused invite'), `${vp[0]}px: group and personal rows still listed`);
    check(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${vp[0]}px: no sideways scroll on Director`);
    if(SHOTS){ await pg.locator('#lobby .table-list').first().scrollIntoViewIfNeeded(); await sleep(200); await pg.screenshot({ path: path.join(SHOTS, `invites-${vp[0]}.png`) }); }
    await pg.close();
  }
  // demo table: watch several hands, record the worst overlaps
  for(const vp of [[390, 844], [430, 932]]){
    const pg = await signedIn(browser, dir.token, vp);
    await pg.click('#tabs [data-tab=director]'); await sleep(300);
    await pg.click('[data-demo]'); await sleep(800);
    let worst = { badge: 0, top: 0 }, shot = false;
    for(let i = 0; i < 70; i++){
      await sleep(250);
      const m = await pg.evaluate(() => {
        const ov = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0;
        let badge = 0;
        document.querySelectorAll('#seats .seat').forEach(s => { const bd = s.querySelector('.badge'), st = s.querySelector('.st'); if(bd && st) badge = Math.max(badge, ov(bd.getBoundingClientRect(), st.getBoundingClientRect())); });
        const bar = document.querySelector('#game .stats').getBoundingClientRect();
        let top = 0;
        document.querySelectorAll('#seats .seat:not(.hero) .hole .card').forEach(c => { const r = c.getBoundingClientRect(); if(r.width) top = Math.max(top, bar.bottom - r.top); });
        return { badge, top };
      });
      worst.badge = Math.max(worst.badge, m.badge); worst.top = Math.max(worst.top, m.top);
      if(SHOTS && !shot && (m.badge > 0 || i === 20)){ await pg.screenshot({ path: path.join(SHOTS, `table-${vp[0]}.png`) }); shot = m.badge > 0; }
    }
    check(worst.badge === 0, `${vp[0]}px demo table: no badge covers a stack (worst ${worst.badge.toFixed(1)}px)`);
    check(worst.top <= 0, `${vp[0]}px demo table: top seat's cards stay below the info bar (worst ${worst.top.toFixed(1)}px over)`);
    await pg.close();
  }
  // members see the practice table on Home (the owner keeps it in Director)
  const mem = await post('login', { name: 'Test Player 01', pin: '135711' });
  for(const vp of [[320, 568], [390, 844]]){
    const pg = await signedIn(browser, mem.token, vp); await sleep(600);
    const btn = pg.locator('#lobbyBody [data-demo]').first();
    check(await btn.isVisible().catch(() => false), `${vp[0]}px member Home: practice table card shown`);
    await btn.click().catch(() => {}); await sleep(1500);
    check(await pg.evaluate(() => !!document.querySelector('#game .felt') && getComputedStyle(document.getElementById('game')).display !== 'none'), `${vp[0]}px member Home: practice table opens`);
    check(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${vp[0]}px member Home: no sideways scroll`);
    await pg.close();
  }
  { const pg = await signedIn(browser, dir.token, [390, 844]); await sleep(600);
    await pg.click('#tabs [data-tab=event]').catch(() => {}); await sleep(400);
    check(await pg.evaluate(() => !document.querySelector('#lobbyBody .demo-box')), 'owner Home: no extra practice card (owner has it in Director)');
    await pg.close(); }
  await browser.close(); srv.kill(); try{ require('fs').unlinkSync(DATA); }catch(e){}
  console.log(`\n${oks} ok, ${fails} failed`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
