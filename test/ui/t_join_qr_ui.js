// Browser check of the club join QR (not part of npm test: needs Chromium + playwright-core, and python3 with OpenCV for decoding).
// Owner side (Director): the club card shows name, member count and LIVE, the QR decodes to the club's join address,
// and Share / Download / Print work (Share and Print are captured, Download is a real PNG that decodes to the same address).
// Visitor side (/join/<slug>): the page shows that club's own name, an unticked box sends nothing, a ticked box joins,
// the same email again shows the same result, and a second club's page and sign-ups stay apart. No sideways scroll on phones.
// Usage: PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium [FONTS_DIR=..] node test/ui/t_join_qr_ui.js [shotDir]
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const SHOTS = process.argv[2];
const PORT = 5400 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = os.tmpdir() + '/t_join_qr_ui_' + process.pid + '.json', TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jqr-'));
const CEL = 'u0000000000c2', salt = 'aa11bb22cc33dd44ee55ff66';
fs.writeFileSync(DATA, JSON.stringify({
  ['user:' + CEL]: { id: CEL, name: 'Celine', salt, pin: crypto.scryptSync('2222', salt, 32).toString('hex'), role: 'member', createdAt: 1, agreedAt: 1, noMain: true, clubs: { cel001: { role: 'owner', joinedAt: 1 } } },
  'name:celine': CEL, 'clubdef:cel001': { id: 'cel001', name: 'Celestia', createdAt: 1, createdBy: CEL }
}));
const api = (p, b, t) => fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (t || '') }, body: JSON.stringify(b || {}) }).then(r => r.json());
let n = 0; const ok = m => console.log('ok', ++n, m);
const shot = async (pg, name, opt) => { if(SHOTS){ fs.mkdirSync(SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS, name + '.png'), ...opt }); } };
// decode a QR image with OpenCV (independent of the encoder in the page)
const decode = file => execFileSync('python3', ['-I', '-c', 'import cv2,sys\nim=cv2.imread(sys.argv[1])\nd,_,_=cv2.QRCodeDetector().detectAndDecode(im)\nprint(d)', file]).toString().trim();
const noHScroll = pg => pg.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: innerWidth, aw: document.getElementById('auth').scrollWidth, ac: document.getElementById('auth').clientWidth }));

(async () => {
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env, PORT, OWNER_CODE: 'secret', DATA_FILE: DATA, NO_BEACON: '1', NO_PUSH: '1', FAST: '', STAGING: '', CLUB_SWITCHING: '1' }, stdio: ['ignore', 'ignore', 'inherit'] });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try{
    for(let i = 0; i < 50; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await new Promise(r => setTimeout(r, 200)); }
    const OWN = (await api('setup', { code: 'secret', name: 'Sean', pin: '1234', agree: true })).token;
    const inv = (await api('invite', {}, OWN)).code;
    await api('redeem', { code: (await api('invite', {}, OWN)).code, name: 'Alex', pin: '1111', agree: true });
    const ctx = async (w, h, extra) => {
      const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, acceptDownloads: true, ...extra });
      await c.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url(), dir = process.env.FONTS_DIR;
        if(!dir) return r.abort();
        if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css')) });
        const f = path.join(dir, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
        return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
      return c;
    };
    const URLB = BASE + '/join/blindrise';

    // ---- visitor: the join landing, per club, on phones ----
    for(const [w, h] of [[390, 844], [320, 568], [430, 932]]){
      for(const [slug, name] of [['blindrise', 'Blindrise'], ['celestia', 'Celestia']]){
        const c = await ctx(w, h), pg = await c.newPage(), sent = [];
        pg.on('request', r => { if(r.url().endsWith('/api/joinClub')) sent.push(r.postDataJSON()); });
        await pg.goto(BASE + '/join/' + slug); await pg.waitForSelector('#cjForm');
        assert.strictEqual((await pg.textContent('.cj-title')).trim(), `Join the ${name} Club`);
        assert.strictEqual((await pg.textContent('.cj-av')).trim(), name[0]);
        assert.strictEqual(await pg.title(), `Join the ${name} Club`);
        assert.ok(await pg.isHidden('.lux-brand') && await pg.isHidden('#welcome') && await pg.isHidden('#authForm'));
        assert.deepStrictEqual(await pg.$$eval('.cj-perks li', e => e.map(x => x.textContent)), ['Meet & connect with people in the club', 'Get exclusive club events & updates', 'Free poker nights & club tournaments']);
        // from 390 px wide each benefit row is one line, as before (on narrower phones a row may wrap, as before)
        const rows = await pg.$$eval('.cj-perks li', e => e.map(x => { const r = x.getBoundingClientRect(), lh = parseFloat(getComputedStyle(x).lineHeight); return Math.round((r.height - parseFloat(getComputedStyle(x).paddingTop) - parseFloat(getComputedStyle(x).paddingBottom)) / lh); }));
        if(w >= 390) assert.deepStrictEqual(rows, [1, 1, 1], 'benefit rows wrap at ' + w + 'x' + h);
        assert.match(await pg.textContent('.cj-agree'), new RegExp('^\\s*' + name + ' may email me'));
        const fine = await pg.$$eval('.cj-fine', e => e.map(x => x.textContent.trim()));
        assert.deepStrictEqual(fine, ['Free social play · No betting · No real money', 'Your email goes to this club only — never shared with other clubs.']);
        const s = await noHScroll(pg); assert.ok(s.dw <= s.vw && s.aw <= s.ac, 'sideways scroll ' + JSON.stringify(s));
        const go = await pg.$eval('#cjGo', b => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, t: b.textContent.trim() }; });
        assert.strictEqual(go.t, 'JOIN THE CLUB'); assert.ok(go.h >= 48, 'button tall enough');
        if(w === 390) await shot(pg, `landing-${slug}-${w}x${h}`, { fullPage: true });
        // consent unticked: an error, and nothing is sent
        await pg.fill('#cjEmail', `visitor.${w}@example.com`);
        await pg.click('#cjGo');
        assert.match(await pg.textContent('#cjErr'), /tick the box/);
        await pg.waitForTimeout(300); assert.strictEqual(sent.length, 0, 'unticked box must send nothing');
        if(w === 390 && slug === 'blindrise') await shot(pg, `landing-unticked-${w}x${h}`, { fullPage: true });
        // ticked: joined
        await pg.check('#cjAgree'); await pg.click('#cjGo');
        await pg.waitForSelector('#cjDone');
        assert.strictEqual(sent.length, 1); assert.strictEqual(sent[0].slug, slug); assert.strictEqual(sent[0].agree, true); assert.match(sent[0].token, /^j1\./);
        assert.match(await pg.textContent('#cjDone'), new RegExp(name + ' Club has your email'));
        if(w === 390) await shot(pg, `landing-joined-${slug}-${w}x${h}`, { fullPage: true });
        await c.close();
        // the same email again from a new phone: the same result, no error
        const c2 = await ctx(w, h), p2 = await c2.newPage();
        await p2.goto(BASE + '/join/' + slug); await p2.waitForSelector('#cjForm');
        await p2.fill('#cjEmail', `VISITOR.${w}@example.com`); await p2.check('#cjAgree'); await p2.click('#cjGo');
        await p2.waitForSelector('#cjDone'); assert.strictEqual((await p2.textContent('#cjErr').catch(() => '')) || '', '');
        await c2.close();
      }
      ok(`${w}x${h}: both clubs' landings show their own name, fine print and consent; unticked sends nothing; join and duplicate both succeed`);
    }
    // an unknown club and the invite links on /join/ keep their own screens
    { const c = await ctx(390, 844), pg = await c.newPage();
      await pg.goto(BASE + '/join/nothing-here-yet'); await pg.waitForSelector('.cj-title');
      assert.strictEqual((await pg.textContent('.cj-title')).trim(), 'This club link is not active');
      await pg.goto(BASE + '/join/' + inv); await pg.waitForSelector('#welcome:not([hidden])');
      assert.ok(await pg.isVisible('#wInvite')); assert.strictEqual((await pg.textContent('#wJoin')).trim(), 'Accept invitation');
      await c.close(); ok('unknown slug shows "not active"; a 12-character invite link still opens the invitation'); }

    // ---- owner: Director QR card ----
    const c = await ctx(390, 844), pg = await c.newPage();
    await pg.addInitScript(() => {
      window.__shared = null; window.__printed = null;
      navigator.share = d => { window.__shared = { title: d.title, text: d.text, url: d.url, files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })) }; return Promise.resolve(); };
      navigator.canShare = d => !!d;
      window.print = () => { window.__printed = { cls: document.body.classList.contains('print-qr'), img: !!document.querySelector('#qrPrint img'), alt: (document.querySelector('#qrPrint img') || {}).alt }; };
    });
    await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), OWN); await pg.reload();
    await pg.waitForSelector('#dirTab:not([hidden])'); await pg.click('#dirTab');
    await pg.waitForFunction(() => { const cv = document.querySelector('[data-qr]'); return cv && cv.width > 100; });
    assert.strictEqual(await pg.$$eval('.qr-card', e => e.length), 1, 'the main owner sees only their own club');
    assert.strictEqual((await pg.textContent('.qr-card .qr-club b')).trim(), 'Blindrise');
    assert.strictEqual((await pg.textContent('.qr-card .qr-club small')).trim(), '2 members');
    assert.strictEqual((await pg.textContent('.qr-card .status-pill')).trim(), 'LIVE');
    const acts = await pg.$$eval('.qr-acts .btn', bs => bs.map(b => { const r = b.getBoundingClientRect(), p = b.closest('.qr-card').getBoundingClientRect(); return r.left >= p.left && r.right <= p.right; }));
    assert.deepStrictEqual(acts, [true, true, true], 'Share, Download and Print fit inside the card');
    assert.strictEqual((await pg.textContent('.qr-url')).trim(), URLB);
    // sign-ups: only Blindrise's (one per phone size, duplicates not repeated), never Celestia's
    const leads = await pg.$$eval('.qr-leads .trow b', e => e.map(x => x.textContent));
    assert.deepStrictEqual(leads.sort(), ['visitor.320@example.com', 'visitor.390@example.com', 'visitor.430@example.com']);
    assert.match(await pg.textContent('.qr-leads summary'), /Email sign-ups · 3/);
    assert.ok(!(await pg.content()).includes('celestia'), 'no Celestia data in the main owner view');
    ok('owner card: Blindrise, 2 members, LIVE, join address shown; 3 sign-ups, duplicates collapsed, no other club');
    // the QR on screen decodes to the join address
    const png = Buffer.from((await pg.$eval('[data-qr]', cv => cv.toDataURL('image/png'))).split(',')[1], 'base64');
    fs.writeFileSync(path.join(TMP, 'screen.png'), png);
    assert.strictEqual(decode(path.join(TMP, 'screen.png')), URLB);
    if(SHOTS) fs.copyFileSync(path.join(TMP, 'screen.png'), path.join(SHOTS, 'qr-canvas.png'));
    ok('on-screen QR decodes (OpenCV) to exactly ' + URLB);
    await pg.$eval('.qr-card', el => el.scrollIntoView({ block: 'start' })); await pg.evaluate(() => document.getElementById('lobbyBody').scrollBy(0, -8));
    await shot(pg, 'owner-qr-390x844');
    // Share: the join address and the QR image
    await pg.click('[data-qshare="0"]');
    await pg.waitForFunction(() => window.__shared);
    const sh = await pg.evaluate(() => window.__shared);
    assert.strictEqual(sh.url, URLB); assert.strictEqual(sh.title, 'Join the Blindrise Club');
    assert.deepStrictEqual(sh.files.map(f => [f.name, f.type]), [['blindrise-join-qr.png', 'image/png']]); assert.ok(sh.files[0].size > 1000);
    ok('Share hands over the join address plus blindrise-join-qr.png');
    // Download: a real PNG that decodes to the same address
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-qdl="0"]')]);
    assert.strictEqual(dl.suggestedFilename(), 'blindrise-join-qr.png');
    const dlf = path.join(TMP, 'download.png'); await dl.saveAs(dlf);
    assert.strictEqual(decode(dlf), URLB);
    if(SHOTS) fs.copyFileSync(dlf, path.join(SHOTS, 'download-blindrise-join-qr.png'));
    ok('Download saves blindrise-join-qr.png, which decodes to ' + URLB);
    // Print: the print sheet is in place when print() runs, and in print media only the sheet shows
    await pg.click('[data-qprint="0"]');
    await pg.waitForFunction(() => window.__printed);
    const pr = await pg.evaluate(() => window.__printed);
    assert.deepStrictEqual(pr, { cls: true, img: true, alt: 'QR code for ' + URLB });
    await pg.evaluate(() => document.body.classList.add('print-qr'));
    await pg.emulateMedia({ media: 'print' });
    const vis = await pg.evaluate(() => ({ app: getComputedStyle(document.querySelector('.app')).display, sheet: getComputedStyle(document.getElementById('qrPrint')).display }));
    assert.deepStrictEqual(vis, { app: 'none', sheet: 'block' });
    const pf = path.join(TMP, 'print.png'); await pg.screenshot({ path: pf, fullPage: true });
    assert.strictEqual(decode(pf), URLB);
    if(SHOTS){ fs.copyFileSync(pf, path.join(SHOTS, 'print-preview.png')); await pg.pdf({ path: path.join(SHOTS, 'print-blindrise-join-qr.pdf'), format: 'A4' }); }
    await pg.emulateMedia({ media: 'screen' }); await pg.evaluate(() => document.body.classList.remove('print-qr'));
    ok('Print opens the print dialog with only the QR sheet, and the printed page decodes to ' + URLB);
    await c.close();

    // a member sees no QR card and no Director tab
    const mt = (await api('login', { name: 'Alex', pin: '1111' })).token;
    const cm = await ctx(390, 844), pm = await cm.newPage();
    await pm.goto(BASE + '/'); await pm.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), mt); await pm.reload();
    await pm.waitForSelector('#lobby:not([hidden])'); await pm.waitForTimeout(500);
    assert.ok(await pm.isHidden('#dirTab')); assert.strictEqual(await pm.$$eval('.qr-card', e => e.length), 0);
    await cm.close(); ok('a member gets no QR card');
    console.log(`t_join_qr_ui: ${n} ok, 0 failed`);
  }catch(e){ console.error('FAIL', e); process.exitCode = 1; }
  finally{ await browser.close(); srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){} fs.rmSync(TMP, { recursive: true, force: true }); }
})();
