// Builds the Celestia A5 tabletop card: A5 portrait (148 x 210 mm) plus 3 mm bleed on every side = 154 x 216 mm.
// The QR is the machine-generated SVG from qr_svg.py (reportlab encoder); it encodes only CARD_URL.
// Usage: FONTS=<dir with fonts.css + ttf> PLAYWRIGHT=/path/to/playwright-core CHROMIUM=... node build_card.js <outDir>
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const OUT = process.argv[2] || '.', FONTS = process.env.FONTS;
const CARD_URL = 'https://gta-poker.onrender.com/v/celestia', SHOWN_URL = 'gta-poker.onrender.com/v/celestia';
const DRAFT = process.env.FINAL !== '1'; // stays a draft until the owner authorizes printing
fs.mkdirSync(OUT, { recursive: true });
const qrFile = path.join(OUT, 'celestia-qr.svg');
console.log(execFileSync('python3', ['-I', path.join(__dirname, 'qr_svg.py'), CARD_URL, qrFile, 'Q']).toString().trim());
const qr = fs.readFileSync(qrFile, 'utf8');
const fontCss = FONTS ? fs.readFileSync(path.join(FONTS, 'fonts.css'), 'utf8').replace(/url\(([^)]+)\)/g, (m, f) => `url(file://${path.join(FONTS, f)})`) : '';
const crest = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22.5" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="24" cy="24" r="18.5" fill="none" stroke="currentColor" stroke-width=".6" opacity=".55"/><path d="M24 11c4.6 5.3 10 8.8 10 14a5.3 5.3 0 0 1-9 3.8l1.7 6.2h-5.4l1.7-6.2a5.3 5.3 0 0 1-9-3.8c0-5.2 5.4-8.7 10-14z" fill="currentColor"/></svg>';
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
@page{size:154mm 216mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:154mm;height:216mm;background:#06070b}
.card{position:relative;width:154mm;height:216mm;overflow:hidden;color:#f4eee2;font-family:"IBM Plex Sans",sans-serif;
  background:radial-gradient(120mm 90mm at 50% 0%,rgba(42,58,92,.55),transparent 70%),radial-gradient(90mm 70mm at 50% 100%,rgba(216,180,106,.10),transparent 70%),linear-gradient(180deg,#0a0e18,#05060a)}
/* trim is 3 mm in; the frame sits 9 mm inside the trim (12 mm from the page edge), safe text area inside it */
.frame{position:absolute;inset:12mm;border:.35mm solid #c9a55c;border-radius:3mm}
.frame::after{content:"";position:absolute;inset:1.6mm;border:.15mm solid rgba(216,180,106,.45);border-radius:2mm}
.in{position:absolute;inset:16mm;display:flex;flex-direction:column;align-items:center;text-align:center}
.crest{width:15mm;height:15mm;color:#d8b46a;margin-top:5mm}
.word{margin-top:4mm;font-family:"Cormorant Garamond",serif;font-weight:600;font-size:30pt;letter-spacing:.32em;padding-left:.32em;
  background:linear-gradient(180deg,#f1dfb0,#c9a55c 60%,#9c7a3c);-webkit-background-clip:text;color:transparent}
.line{margin-top:3.5mm;font-family:"IBM Plex Sans Condensed",sans-serif;font-weight:600;font-size:8.6pt;letter-spacing:.3em;padding-left:.3em;text-transform:uppercase;color:#d8b46a}
.rule{width:22mm;height:.3mm;margin:5mm auto 0;background:linear-gradient(90deg,transparent,#d8b46a,transparent)}
.tag{margin-top:5mm;font-family:"Cormorant Garamond",serif;font-style:italic;font-weight:500;font-size:25pt;line-height:1.05;color:#f4eee2}
.body{margin-top:4mm;max-width:92mm;font-size:9.4pt;line-height:1.5;color:#c3c8d3}
.qrbox{margin-top:7mm;padding:2.6mm;background:#fff;border-radius:2.4mm;box-shadow:0 0 0 .5mm #c9a55c,0 0 0 1.6mm rgba(216,180,106,.18)}
.qrbox svg{display:block;width:38mm;height:38mm}
.scan{margin-top:4.5mm;font-family:"IBM Plex Sans Condensed",sans-serif;font-weight:600;font-size:9pt;letter-spacing:.24em;padding-left:.24em;text-transform:uppercase;color:#f1dfb0}
.url{margin-top:1.6mm;font-size:9.6pt;letter-spacing:.02em;color:#f4eee2}
.fine{margin-top:auto;font-size:7.4pt;line-height:1.5;color:#9aa1b0;letter-spacing:.04em}
.draft{position:absolute;left:0;right:0;height:9mm;display:grid;place-items:center;background:#b3261e;color:#fff;font:700 9pt "IBM Plex Sans",sans-serif;letter-spacing:.24em}
.draft.top{top:0}.draft.bot{bottom:0}
</style></head><body><div class="card">
<div class="frame"></div>
<div class="in">
  <div class="crest">${crest}</div>
  <div class="word">BLINDRISE</div>
  <div class="line">Play. Connect. Belong. Grow.</div>
  <div class="rule"></div>
  <div class="tag">Together We Rise.</div>
  <p class="body">A private members' community for friendly games and good company. Scan to see what membership means, then join if you like.</p>
  <div class="qrbox">${qr}</div>
  <div class="scan">Scan to join</div>
  <div class="url">${SHOWN_URL}</div>
  <p class="fine">Free to join · Adults 19+ · No real money, no betting · Points have no cash value<br>Blindrise is independent of this venue. No offers or benefits come with joining.</p>
</div>
${DRAFT ? '<div class="draft top">DRAFT — NOT FOR DISTRIBUTION</div><div class="draft bot">DRAFT — NOT FOR DISTRIBUTION</div>' : ''}
</div></body></html>`;
fs.writeFileSync(path.join(OUT, 'celestia-a5-card.html'), html);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const p = await b.newPage({ viewport: { width: Math.round(154 / 25.4 * 96), height: Math.round(216 / 25.4 * 96) }, deviceScaleFactor: 300 / 96 });
  await p.goto('file://' + path.join(path.resolve(OUT), 'celestia-a5-card.html'));
  await p.evaluate(() => document.fonts.ready);
  const fams = await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight + ' ' + f.style));
  console.log('fonts loaded:', [...new Set(fams)].join(', ') || 'none (system fallback)');
  await p.pdf({ path: path.join(OUT, 'celestia-a5-card.pdf'), width: '154mm', height: '216mm', printBackground: true, preferCSSPageSize: true });
  await p.screenshot({ path: path.join(OUT, 'celestia-a5-card-preview.png') });
  // the QR's printed size, from the layout
  const mm = await p.evaluate(() => document.querySelector('.qrbox svg').getBoundingClientRect().width / 96 * 25.4);
  console.log(`QR printed width ${mm.toFixed(1)} mm (including the 4-module quiet zone)`);
  await b.close();
})();
