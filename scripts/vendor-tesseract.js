// Copies the on-phone business card reader (Tesseract.js) into public/vendor/ so it is served from our own origin.
// Pinned versions, fetched from the npm registry with `npm pack` (which checks the registry's sha512), then pinned by sha256 in public/vendor/SHA256SUMS.
// Usage: node scripts/vendor-tesseract.js          (writes the files, fails if any sum differs)
//        node scripts/vendor-tesseract.js --check  (only verifies the files already in public/vendor/)
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', 'public', 'vendor');
// [npm package spec, file inside the package, destination under public/vendor/]; the sha256 pins live in public/vendor/SHA256SUMS
const FILES = [
  ['tesseract.js@5.1.1', 'dist/tesseract.min.js', 'tesseract-5.1.1/tesseract.min.js'],
  ['tesseract.js@5.1.1', 'dist/worker.min.js', 'tesseract-5.1.1/worker.min.js'],
  ['tesseract.js@5.1.1', 'LICENSE.md', 'tesseract-5.1.1/LICENSE.md'],
  // createWorker('eng', 1) is LSTM-only, so the worker only ever needs an "lstm" core: SIMD for current phones, plain for older ones.
  // We load the small .js loader plus the separate .wasm (streamed, application/wasm) instead of the *.wasm.js files that inline it as base64.
  ['tesseract.js-core@5.1.1', 'tesseract-core-simd-lstm.js', 'tesseract-5.1.1/tesseract-core-simd-lstm.js'],
  ['tesseract.js-core@5.1.1', 'tesseract-core-simd-lstm.wasm', 'tesseract-5.1.1/tesseract-core-simd-lstm.wasm'],
  ['tesseract.js-core@5.1.1', 'tesseract-core-lstm.js', 'tesseract-5.1.1/tesseract-core-lstm.js'],
  ['tesseract.js-core@5.1.1', 'tesseract-core-lstm.wasm', 'tesseract-5.1.1/tesseract-core-lstm.wasm'],
  ['tesseract.js-core@5.1.1', 'LICENSE', 'tesseract-5.1.1/LICENSE-core'],
  ['@tesseract.js-data/eng@1.0.0', '4.0.0_best_int/eng.traineddata.gz', 'tessdata-eng-1.0.0/eng.traineddata.gz']
];
const SUMS = path.join(ROOT, 'SHA256SUMS');
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const pinned = fs.existsSync(SUMS) ? Object.fromEntries(fs.readFileSync(SUMS, 'utf8').trim().split('\n').map(l => l.split(/\s+/).reverse())) : {};

if(process.argv.includes('--check')){
  let bad = 0;
  for(const [, , dest] of FILES){
    const f = path.join(ROOT, dest), got = fs.existsSync(f) ? sha(fs.readFileSync(f)) : 'missing';
    if(got !== pinned[dest]){ bad++; console.error('MISMATCH', dest, got); } else console.log('ok', dest);
  }
  process.exit(bad ? 1 : 0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-tess-'));
const unpacked = {};
function pkg(spec){
  if(unpacked[spec]) return unpacked[spec];
  const out = execFileSync('npm', ['pack', spec, '--pack-destination', tmp, '--silent'], { encoding: 'utf8' }).trim().split('\n').pop();
  const dir = path.join(tmp, out.replace(/\.tgz$/, ''));
  fs.mkdirSync(dir);
  execFileSync('tar', ['xzf', path.join(tmp, out), '-C', dir]);
  return (unpacked[spec] = path.join(dir, 'package'));
}
const lines = [];
let changed = 0;
for(const [spec, src, dest] of FILES){
  const buf = fs.readFileSync(path.join(pkg(spec), src)), sum = sha(buf);
  if(pinned[dest] && pinned[dest] !== sum){ console.error(`sha256 changed for ${dest}: ${pinned[dest]} -> ${sum}. Refusing.`); process.exit(1); }
  if(!pinned[dest]) changed++;
  fs.mkdirSync(path.dirname(path.join(ROOT, dest)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, dest), buf);
  lines.push(`${sum}  ${dest}`);
  console.log(sum, buf.length, dest, `(${spec} ${src})`);
}
fs.writeFileSync(SUMS, lines.join('\n') + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(changed ? `wrote ${changed} new sums to public/vendor/SHA256SUMS` : 'all files match public/vendor/SHA256SUMS');
