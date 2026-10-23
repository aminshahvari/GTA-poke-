// The app shell for the preview designs (Issue #32 comment 6329679268), used only when UI_BOARD or UI_QUIET is on.
// Without either switch none of this runs and every page is byte for byte the file on disk (test/t_board.js).
//  - boardOn: the UI_BOARD switch. On the production database it also needs UI_BOARD_LIVE=1 (owner GO for the live
//    site, 2026-10-23, decision card "New design, no media"), so UI_BOARD alone never turns it on there
//  - boardPage: html[data-ui="board"] and /board.css (the system font stack: no hosted font is added)
//  - shellPage: the Blindrise mark on the welcome screen's navy from the very first paint. The page's stylesheets
//    (and the small style after them) move, in the same order, from the head to just after the mark at the top of
//    the body, so the browser can paint the mark before they arrive; the app's scripts still wait for them. The mark
//    fades as soon as the app shows a screen (or a sheet).
//  - notFoundPage: unknown pages (/demo, /guest, /table ...) in the app's look: navy and gold, the mark, one line of
//    copy and a way back home (sent with HTTP 404)
const boardOn = (env, prodHost) => env.UI_BOARD === '1' && (env.UI_BOARD_LIVE === '1' || !String(env.DATABASE_URL || '').includes(prodHost));
const boardPage = buf => Buffer.from(String(buf).replace('<html lang="en">', '<html lang="en" data-ui="board">').replace('</head>', '<link rel="stylesheet" href="/board.css">\n</head>'));

const FACE = '-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,"IBM Plex Sans",sans-serif';
// the welcome screen's own ground (style.css, #auth.lux), so the mark hands over to it without a jump
const GROUND = 'radial-gradient(120% 60% at 50% -8%,#1b2a4a 0%,#0d1527 46%,#070a12 100%)';
const MARK = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22.5" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="24" cy="24" r="18.5" fill="none" stroke="currentColor" stroke-width=".6" opacity=".55"/><path d="M24 11c4.6 5.3 10 8.8 10 14a5.3 5.3 0 0 1-9 3.8l1.7 6.2h-5.4l1.7-6.2a5.3 5.3 0 0 1-9-3.8c0-5.2 5.4-8.7 10-14z" fill="currentColor"/></svg>';
const BOOT_CSS = '<style id="br-boot-css">html{background:#070a12;color-scheme:dark}'
  + '#br-boot{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:' + GROUND + ';color:#d8b46a;transition:opacity .35s ease,visibility 0s .35s}'
  + '#br-boot svg{width:56px;height:56px;filter:drop-shadow(0 0 14px rgba(216,180,106,.35));animation:br-boot-in .6s ease both}'
  + '#br-boot b{font:500 18px/1 ' + FACE + ';letter-spacing:.42em;margin-right:-.42em;color:#e6cf98;animation:br-boot-in .6s .1s ease both}'
  + 'body:has(.screen:not([hidden])) #br-boot,body:has(#modalRoot>*) #br-boot{opacity:0;visibility:hidden}'
  + '@supports not selector(:has(a)){#br-boot{animation:br-boot-out .35s 3s forwards}}'
  + '@keyframes br-boot-in{from{opacity:0}}@keyframes br-boot-out{to{opacity:0;visibility:hidden}}'
  + '@media (prefers-reduced-motion:reduce){#br-boot,#br-boot svg,#br-boot b{animation:none;transition:none}}</style>';
const BOOT_DIV = '<div id="br-boot" aria-hidden="true">' + MARK + '<b>BLINDRISE</b></div>';
function shellPage(buf){
  let s = String(buf); const a = s.indexOf('<link rel="stylesheet"'), b = s.indexOf('</head>');
  if(a < 0 || b < 0 || a > b || !s.includes('<body>\n')) return Buffer.from(s);
  const sheets = s.slice(a, b);
  s = s.slice(0, a) + BOOT_CSS + '\n' + s.slice(b);
  return Buffer.from(s.replace('<body>\n', '<body>\n' + BOOT_DIV + '\n' + sheets));
}
const notFoundPage = mode => '<!doctype html>\n<html lang="en" data-ui="' + mode + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  + '<meta name="theme-color" content="#070a12">\n<meta name="robots" content="noindex">\n<link rel="icon" href="/icon.svg" type="image/svg+xml">\n<title>Page not found · Blindrise</title>\n'
  + '<style>html,body{height:100%;margin:0}body{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px 20px;box-sizing:border-box;'
  + 'background:' + GROUND + ';color:#f4f0e7;font:400 15px/1.5 ' + FACE + ';text-align:center;-webkit-font-smoothing:antialiased}'
  + 'main{display:flex;flex-direction:column;align-items:center;gap:12px}'
  + 'svg{width:56px;height:56px;color:#d4b26c;filter:drop-shadow(0 0 14px rgba(216,180,106,.35))}'
  + '.w{font-weight:500;font-size:18px;letter-spacing:.42em;margin:0 -.42em 0 0;color:#e6cf98}'
  + 'p{margin:8px 0 0;max-width:30ch;color:rgba(244,240,231,.78)}'
  + 'a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:8px;padding:0 22px;border-radius:999px;color:#1a1206;font-weight:600;text-decoration:none;'
  + 'background:linear-gradient(180deg,#d8ad5f,#9c7238)}a:focus-visible{outline:2px solid #f1d48c;outline-offset:3px}</style>\n</head>\n<body>\n<main>\n'
  + MARK + '\n<h1 class="w">BLINDRISE</h1>\n<p>This page isn’t part of Blindrise.</p>\n<a href="/">Back to Blindrise</a>\n</main>\n</body>\n</html>\n';

// the inverse of shellPage, for the tests: the page as it was before the shell (null if it has no shell)
function unshellPage(page){
  const i = page.indexOf(BOOT_DIV + '\n'); if(i < 0 || !page.includes(BOOT_CSS + '\n')) return null;
  let j = i + BOOT_DIV.length + 1, sheets = '';
  for(;;){ const e = page.indexOf('\n', j), line = page.slice(j, e);
    if(e < 0 || !/^(<link rel="stylesheet"[^>]*>|<style>[^<]*<\/style>)$/.test(line)) break;
    sheets += line + '\n'; j = e + 1; }
  return (page.slice(0, i) + page.slice(j)).replace(BOOT_CSS + '\n', sheets);
}

module.exports = { boardOn, boardPage, shellPage, unshellPage, notFoundPage, BOOT_CSS, BOOT_DIV, MARK };
