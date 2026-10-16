# Stacked Live Club

A private, invite-only poker tournament club for friends. No computer players: every seat is a real person on their phone.

- No-limit Hold'em tournaments, 1 table or many. Players are balanced between tables and tables break as the field shrinks.
- The owner (tournament director) creates tournaments, starts them by hand or on a daily/weekly schedule, can pause, resume, end, invite and remove members.
- Friends join with a single-use invite link, pick a name and a PIN. Works in any phone browser and can be added to the home screen.
- Leaderboard with points across tournaments (week, 30 days, all time).
- The server deals and decides everything, so nobody can see anyone else's cards.

## Run it

```
npm install
OWNER_CODE=pick-a-secret npm start
```

Open http://localhost:3000, enter the setup code (`OWNER_CODE`) and pick your name and PIN. You are the owner.

## Settings (environment variables)

| Name | What it does |
| --- | --- |
| `OWNER_CODE` | Required. The one-time code that creates the owner account. |
| `PORT` | Port to listen on (default 3000). |
| `DATABASE_URL` | Postgres connection string. When set, the club is saved in Postgres. |
| `PGSSL` | Set to `1` when the database needs SSL. |
| `DATA_FILE` | Without Postgres, the club is saved to this JSON file (default `data/club.json`). |
| `TIME_BANK_MS` | Time each player has to act (default 30000). |

## Tests

```
npm test
```

Runs the hand evaluator, rules, a long simulation, and a full server test with many websocket players (pass a player count to `node test/t_server.js 60`).

## Self-hosted card reader (public/vendor/)

The Business Club card scanner reads the photo on the phone with Tesseract.js. Its files are served from this server
(never from a CDN), so the Content-Security-Policy allows scripts and connections only from our own origin.

| Package (npm) | Version | Files used | Served at |
|---|---|---|---|
| `tesseract.js` | 5.1.1 | `dist/tesseract.min.js`, `dist/worker.min.js`, `LICENSE.md` | `/vendor/tesseract-5.1.1/` |
| `tesseract.js-core` | 5.1.1 | `tesseract-core-simd-lstm.js/.wasm` (phones with WebAssembly SIMD), `tesseract-core-lstm.js/.wasm` (older phones), `LICENSE` | `/vendor/tesseract-5.1.1/` |
| `@tesseract.js-data/eng` | 1.0.0 | `4.0.0_best_int/eng.traineddata.gz` | `/vendor/tessdata-eng-1.0.0/` |

All three are Apache-2.0. The files are copied unchanged from the npm tarballs by `node scripts/vendor-tesseract.js`
(`npm pack` checks the registry's sha512) and pinned by sha256 in `public/vendor/SHA256SUMS`; the script refuses to
overwrite a file whose sum changed. `node scripts/vendor-tesseract.js --check` re-verifies the committed files, and
`test/t_csp.js` checks that the server sends exactly those bytes. `tesseract.min.js` also matches the SRI hash
`sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F` that jsDelivr serves for the same version.
Files under `/vendor/` are sent with `Cache-Control: public, max-age=31536000, immutable`, so a new version must go in
a new folder (e.g. `tesseract-5.1.2/`). Nothing is downloaded until a member picks a photo (about 6 MB the first time).

Browser check (needs Chromium and `playwright-core`, not part of `npm test`):
`PLAYWRIGHT_CORE=<path to playwright-core> node test/browser/scan_csp.js [--no-simd]`.
