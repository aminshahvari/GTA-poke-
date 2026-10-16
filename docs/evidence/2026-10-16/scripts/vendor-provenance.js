// Independent provenance check of the vendored card-reader files (evidence item 7).
// `scripts/vendor-tesseract.js --check` only compares public/vendor/ with the repo's own SHA256SUMS. This script instead
// downloads the pinned packages again from the npm registry (`npm pack`, which verifies the registry's sha512 integrity),
// unpacks them in a temp folder and compares sha256 of each file with what is committed in public/vendor/.
// Usage (from the repository root): node docs/evidence/2026-10-16/scripts/vendor-provenance.js
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..'), VENDOR = path.join(ROOT, 'public', 'vendor');
// same mapping as scripts/vendor-tesseract.js (package spec, file inside the package, path under public/vendor/)
const FILES = [
  ['tesseract.js@5.1.1', 'dist/tesseract.min.js', 'tesseract-5.1.1/tesseract.min.js'],
  ['tesseract.js@5.1.1', 'dist/worker.min.js', 'tesseract-5.1.1/worker.min.js'],
  ['tesseract.js@5.1.1', 'LICENSE.md', 'tesseract-5.1.1/LICENSE.md'],
  ['tesseract.js-core@5.1.1', 'tesseract-core-simd-lstm.js', 'tesseract-5.1.1/tesseract-core-simd-lstm.js'],
  ['tesseract.js-core@5.1.1', 'tesseract-core-simd-lstm.wasm', 'tesseract-5.1.1/tesseract-core-simd-lstm.wasm'],
  ['tesseract.js-core@5.1.1', 'tesseract-core-lstm.js', 'tesseract-5.1.1/tesseract-core-lstm.js'],
  ['tesseract.js-core@5.1.1', 'tesseract-core-lstm.wasm', 'tesseract-5.1.1/tesseract-core-lstm.wasm'],
  ['tesseract.js-core@5.1.1', 'LICENSE', 'tesseract-5.1.1/LICENSE-core'],
  ['@tesseract.js-data/eng@1.0.0', '4.0.0_best_int/eng.traineddata.gz', 'tessdata-eng-1.0.0/eng.traineddata.gz']
];
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-prov-'));
const dirs = {};
let bad = 0;
for(const [spec, inner, dest] of FILES){
  if(!dirs[spec]){
    const tgz = execFileSync('npm', ['pack', spec, '--pack-destination', tmp, '--silent'], { encoding: 'utf8' }).trim().split('\n').pop();
    const d = path.join(tmp, tgz.replace(/\.tgz$/, '')); fs.mkdirSync(d);
    execFileSync('tar', ['xzf', path.join(tmp, tgz), '-C', d]);
    dirs[spec] = path.join(d, 'package');
    console.log(`npm pack ${spec} -> ${tgz}`);
  }
  const a = sha(path.join(dirs[spec], inner)), b = fs.existsSync(path.join(VENDOR, dest)) ? sha(path.join(VENDOR, dest)) : 'missing';
  if(a !== b) bad++;
  console.log(`${a === b ? 'MATCH   ' : 'MISMATCH'} ${dest}  registry=${a.slice(0, 16)}… repo=${b.slice(0, 16)}…`);
}
const extra = fs.readdirSync(VENDOR, { recursive: true }).filter(f => fs.statSync(path.join(VENDOR, f)).isFile() && f !== 'SHA256SUMS' && !FILES.some(x => x[2] === f));
console.log('files in public/vendor/ not in the pinned list:', extra.length ? extra.join(', ') : 'none');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `${bad} MISMATCH(ES)` : `all ${FILES.length} vendored files are byte-identical to the npm registry packages`);
process.exit(bad ? 1 : 0);
