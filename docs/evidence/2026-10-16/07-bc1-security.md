# 07. BC1 security: CSP, vendored card reader, browser checks

Labels: **IMPLEMENTED** (in code at the cited commit), **TESTED** (run now; output in `logs/`), **PROPOSED**, **NOT VERIFIED**.

Commits: `1e6953f` (staging before BC1), `8a33fbb` + `18bb929` (BC1), `7e946e3` (BC1 security closure: self-hosted card reader, tighter CSP; merged into staging as `e9eefb9`), `a3c67e9` (staging tip: also contains Opportunity Club `ef77d53` + `7e0cce4`).

## 1. Content-Security-Policy as served (TESTED now)

`scripts/csp-headers.js` checked out each commit into a temporary detached worktree in the OS temp folder (node_modules symlinked), started it locally (STAGING=1, throwaway data), fetched `GET /` and `POST /api/status`, printed the headers and removed the worktree. Log: `logs/csp-headers-run.log`; JSON: `raw/csp-headers.json`.

| Commit | Exact `Content-Security-Policy` header |
|---|---|
| `1e6953f` before BC1 | `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'` |
| `18bb929` BC1 | `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss: https://cdn.jsdelivr.net; frame-ancestors 'none'` |
| `a3c67e9` staging tip | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' wss:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` |

All three: the same header on API responses (`POST /api/status`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. Source at `a3c67e9`: `server/index.js:139-144` (header), applied to every response by `send()` `:147-150`, the avatar route `:182` and the logo route `:189`.

Reading the change:
- BC1 (`18bb929`) **widened** the policy: scripts and `connect-src` from `cdn.jsdelivr.net`, `blob:` workers, `'wasm-unsafe-eval'`.
- The closure (`7e946e3`, in `a3c67e9`) **removed** jsDelivr and `blob:` workers, kept only `'wasm-unsafe-eval'` (WebAssembly compile, not JavaScript `eval`), and **added** `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, and dropped plain `ws:` from `connect-src`. Net result at `a3c67e9` is stricter than before BC1 except for `'wasm-unsafe-eval'`.
- Still present since before BC1 (not introduced by BC1): `style-src 'unsafe-inline'` and Google Fonts (`fonts.googleapis.com` stylesheet, `fonts.gstatic.com` fonts) linked from `public/index.html:14-15`. `connect-src` allows `wss:` to any host (narrower would be `'self'` only, since modern browsers treat same-origin `wss:` as covered by `'self'`; NOT VERIFIED on Safari).

### Third-party script origins (TESTED)

`public/index.html` at `a3c67e9` loads seven scripts, all same-origin: `/engine.js`, `/learn.js`, `/fair-verify.js`, `/cardparse.js`, `/opportunity.js`, `/business.js`, `/app.js` (`public/index.html:86-92`). The only external tags are the two Google Fonts `<link>` elements (`:14-15`). `script-src 'self' 'wasm-unsafe-eval'` blocks any other script origin; the negative control below proves it in a real browser.

## 2. Vendored files (TESTED now)

`public/vendor/` (added in `7e946e3`; `git log --oneline -1 -- public/vendor` → `7e946e3`). Log: `logs/vendor-check.log`.

| File | sha256 recomputed now | = SHA256SUMS | = npm registry package |
|---|---|---|---|
| `tesseract-5.1.1/tesseract.min.js` | `a8e29918d098b2b06e1012bdaeffb4aec0445c5d5654709023e0bd1f442a80e8` | OK | MATCH (`tesseract.js@5.1.1` `dist/tesseract.min.js`) |
| `tesseract-5.1.1/worker.min.js` | `aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc` | OK | MATCH |
| `tesseract-5.1.1/LICENSE.md` | `b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1` | OK | MATCH |
| `tesseract-5.1.1/tesseract-core-simd-lstm.js` | `4135a3f6f1cccf3bc92058c1273c49bb4cff6356e1ba15d1b8b4e76e9890526b` | OK | MATCH (`tesseract.js-core@5.1.1`) |
| `tesseract-5.1.1/tesseract-core-simd-lstm.wasm` | `66b601224a0c4a8977bc9d92dd39841189f9ca22cc4122fcd7208cdb0961eeef` | OK | MATCH |
| `tesseract-5.1.1/tesseract-core-lstm.js` | `fc54a973687325599214294ec90ea9665309cbdf6ca727c43a64651f24e923f7` | OK | MATCH |
| `tesseract-5.1.1/tesseract-core-lstm.wasm` | `5db58ea4d1bd4256be81e8ae3b4fa226c4625dfba1850b1b3308dbf3700e9929` | OK | MATCH |
| `tesseract-5.1.1/LICENSE-core` | `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08` | OK | MATCH |
| `tessdata-eng-1.0.0/eng.traineddata.gz` | `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91` | OK | MATCH (`@tesseract.js-data/eng@1.0.0` `4.0.0_best_int/eng.traineddata.gz`) |

- `sha256sum -c SHA256SUMS`: 9 × OK, exit 0. `node scripts/vendor-tesseract.js --check`: 9 × ok, exit 0.
- Independent provenance (new in this package): `scripts/vendor-provenance.js` downloaded the three pinned packages from the npm registry again (`npm pack`, which checks the registry's sha512), unpacked them and compared: **all 9 files byte-identical**; no extra files in `public/vendor/`. Log: `logs/vendor-provenance.log`. This proves the files are the published npm versions; it does not audit the npm packages themselves.
- Served with `Cache-Control: public, max-age=31536000, immutable` for `/vendor/` paths (`server/index.js:197`) and `application/wasm` for `.wasm` (`:138`).

## 3. Browser checks (TESTED now, desktop Chromium headless only)

### 3.1 Existing test `test/browser/scan_csp.js` (sign-in + card scanner), both cores

Log: `logs/scan-csp-browser.log`. Both runs exit 0:

```
CSP on / : default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; ... frame-ancestors 'none'
signed in as Test Player 07
scanner open; OCR files requested so far: 0
worker started: /vendor/tesseract-5.1.1/worker.min.js
card read in 1.5s, fields: {"name":"Rivera Plumbing","fullName":"Alex Rivera","jobTitle":"Owner","phone":"416-555-0100","email":"alex@example.com","website":"riveraplumbing.example","address":"123 Queen St W, Toronto, ON M5H 2M9","category":"trades"}
OCR files loaded from our origin: [".../tesseract.min.js",".../worker.min.js",".../tesseract-core-simd-lstm.js",".../tesseract-core-simd-lstm.wasm",".../eng.traineddata.gz"]
negative control (cdn.jsdelivr.net script): blocked by CSP: script-src-elem blocked https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js (:1)
CSP violations during sign-in + scan: 0
third-party requests during sign-in + scan: 0
pre-existing Google Fonts requests (not BC1, aborted in this sandbox): 1
page errors: 0
scan + CSP browser test passed (SIMD core)
...
scan + CSP browser test passed (plain core, no SIMD)
```

### 3.2 Opportunity Club pages on the merged tree (new: `scripts/csp-opportunity.js`)

The staging tree now also contains Opportunity Club, which `scan_csp.js` does not open. This script walks 15 Opportunity screens as a member, a poster and the director, and collects `securitypolicyviolation` events, CSP console messages, page errors and every request leaving our origin. Log: `logs/csp-opportunity-run.log`:

```
screens visited: Home with Community Opportunities; Business tab -> Opportunities feed; feed filtered; listing detail;
  contact request sheet; report sheet; create form (I need help); My opportunities; Requests I sent;
  poster: My opportunities with an incoming request; share-contact sheet;
  director: Opportunities feed; Director view (closed/expired/hidden); Reports queue; listing detail with director controls
member (Test Player 06): CSP violations 0; page errors 0; blocked non-origin requests (excluding Google Fonts) 0
poster (Test Player 02): CSP violations 0; page errors 0; blocked non-origin requests (excluding Google Fonts) 0
director: CSP violations 0; page errors 0; blocked non-origin requests (excluding Google Fonts) 0
negative control (cdn.jsdelivr.net script injected): blocked and reported: script-src-elem https://cdn.jsdelivr.net/...
PASS: 15 Opportunity Club screens, 0 CSP violations, 0 page errors, 0 third-party requests; control blocked
```

The acceptance run (`01-opportunity-acceptance.md`) and the moderation run also blocked and counted any non-origin request; none occurred (the Google Fonts requests are expected, see 1).

### 3.3 `test/t_csp.js` (part of `npm test`)

A server-side check of the header and `/vendor/` serving. See `04-phase1-tests.md` section 3 for the `npm test` runs that reached it.

## 4. PENDING: real devices (NOT VERIFIED)

Everything above is **desktop Chromium headless** with a synthetic card image. Not verified:
- iPhone Safari 16/17/18, iOS home-screen app, Android Chrome, Samsung Internet, low-end Android;
- WebKit's handling of `'wasm-unsafe-eval'` and `worker-src 'self'` (Safari < 16 is expected to block the card reader; NOT VERIFIED);
- camera permission flows, first-load time on mobile data (about 6 MB of card-reader files), memory on low-end phones.

The checklist is `bc1-device-test-checklist.md` in the shared reports folder (copied here as [`external/bc1-device-test-checklist.md`](external/bc1-device-test-checklist.md)); at the time of writing every Result cell is empty. Status: **NOT VERIFIED**.

## 5. How to re-run

```
node docs/evidence/2026-10-16/scripts/csp-headers.js                 # 1e6953f 18bb929 a3c67e9
(cd public/vendor && sha256sum -c SHA256SUMS); node scripts/vendor-tesseract.js --check
node docs/evidence/2026-10-16/scripts/vendor-provenance.js           # needs npm registry access
PLAYWRIGHT_CORE=$PWD/node_modules/playwright-core PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/browser/scan_csp.js [--no-simd]
node docs/evidence/2026-10-16/scripts/csp-opportunity.js
```
