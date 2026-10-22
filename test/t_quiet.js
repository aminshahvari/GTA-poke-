// The quiet-luxury design switch (owner GO for preview/development only, 2026-10-21):
//  - without UI_QUIET the page is byte for byte the file on disk: no marker, no extra stylesheet
//  - with UI_QUIET=1 the page is marked html[data-ui="quiet"] and loads /quiet.css
//  - every rule in quiet.css applies only under that marker, so it cannot change the page without the switch
//  - UI_BOARD is held off here (with both on, the board wins: test/t_board.js)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const shell = require('../server/shell');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };

async function serve(env){
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_quiet_')), PORT = 6500 + Math.floor(Math.random() * 200);
  const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(tmp, 'data.json'), DATABASE_URL: '', STAGING: '', UI_QUIET: '', UI_BOARD: '', ...env }, stdio: 'ignore' });
  const base = 'http://localhost:' + PORT;
  for(let i = 0; i < 60; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const pages = {}; for(const p of ['/', '/login', '/join/blindrise']) pages[p] = await (await fetch(base + p)).text();
  const css = await fetch(base + '/quiet.css');
  srv.kill(); fs.rmSync(tmp, { recursive: true, force: true });
  return { pages, cssStatus: css.status };
}

(async () => {
  const disk = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const off = await serve({});
  check(Object.values(off.pages).every(p => p === disk), 'switch off: every page is exactly index.html as it is on disk');
  check(!/data-ui|quiet\.css/.test(off.pages['/']), 'switch off: no marker and no quiet stylesheet');
  const on = await serve({ UI_QUIET: '1' });
  check(Object.values(on.pages).every(p => p.includes('<html lang="en" data-ui="quiet">') && p.includes('<link rel="stylesheet" href="/quiet.css">')), 'switch on: every page is marked and loads quiet.css');
  // (the app shell that comes with the design, server/shell.js and test/t_board.js, undone first)
  check(Object.values(on.pages).every(p => p.includes(shell.BOOT_DIV)), 'switch on: every page has the app shell (the mark from the first paint)');
  check(shell.unshellPage(on.pages['/']).replace('<html lang="en" data-ui="quiet">', '<html lang="en">').replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^>]*>\n<link rel="stylesheet" href="\/quiet\.css">\n/, '') === disk, 'switch on: nothing else in the page changes');
  check(on.cssStatus === 200, 'quiet.css is served');
  // every selector in quiet.css starts with the marker (keyframe steps and at-rule wrappers aside)
  const src = fs.readFileSync(path.join(ROOT, 'public', 'quiet.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
  const sels = []; src.replace(/([^{}]+)\{[^{}]*\}/g, (m, s) => { s = s.trim(); if(!s.startsWith('@')) sels.push(...s.split(/,(?![^()]*\))/).map(x => x.trim())); return m; });
  const loose = sels.filter(s => !s.startsWith('[data-ui="quiet"]'));
  check(sels.length > 50 && !loose.length, `all ${sels.length} selectors in quiet.css sit under html[data-ui="quiet"]${loose.length ? ': ' + loose.join(' | ') : ''}`);
  console.log(`\n${n} checks passed`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
