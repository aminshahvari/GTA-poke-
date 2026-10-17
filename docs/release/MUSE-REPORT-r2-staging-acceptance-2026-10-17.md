# Blindrise Release 2 — Independent STAGING ACCEPTANCE Audit

**Auditor:** Muse / Marlowe (independent)
**Date:** 2026-10-17 (testing window 17:31–18:05 UTC)
**Environment:** https://gta-poker-staging.onrender.com — STAGING ONLY. No production access, no production change, Release 1 untouched.
**Build under test:** `c0daed48c9b78f38811fc479bb324ddfda2adb20` (the F1 re-audit PASS build).
**Owner context:** the owner confirmed R2 opens and works on his real iPhone — a limited smoke test, NOT full mobile acceptance — and delegated the remaining staging acceptance testing to Muse. This report distinguishes real-device evidence (owner smoke only), browser emulation (Chromium), and live protocol testing (real server over HTTPS/WSS) throughout. Nothing untested is marked PASS.

**Method:** Muse's own live probes against the deployed server (Node scripts over HTTPS + secure WebSocket, run 2026-10-17; full machine-readable evidence in the probe logs): 10 independent test accounts created by Muse through the app's own invite/redeem registration (plus the seeded Test Director / Test Players), two-table live tournament play with 9 of Muse's accounts seated, live Business/Opportunity saves, and a Chromium emulation pass for visuals and the card scanner. Claude's Mobile Acceptance Checklist material (the scanner device-test sheet + the R2 acceptance criteria) was reviewed and used as a cross-check — every PASS below rests on Muse's own evidence, not on Claude's reports.

---

## 1. Deployed build & integrity — PASS

- Git refs re-read by Muse today: `origin/staging` = `c0daed4…` (the approved build), `origin/main` = `d00b592…` (production, untouched), `r2-dev` carries docs-only commits after `c0daed4`.
- **Behavioral fingerprint:** the live server refuses exactly the three F1 bypass classes fixed in `c0daed4` (Persian digits, comma phones, letter-swaps — §5) and still accepts the ONE documented LOW gap of that build (bullet separator, §5). A different build would be very unlikely to reproduce both sides of that fingerprint.
- Live health during testing: `/healthz` → `ok:true, mode:postgres, epoch:35, leaseLost:false, dirty:0, lastWriteError:null`.
- **Render corroboration (read-only dashboard read, 2026-10-17):** staging service `gta-poker-staging` live deploy `dep-db9poou1egvs73d1f8hg` = commit `c0daed48…`, Auto-Deploy, live 12:03:47 PM EDT. Boot lines verbatim: `store: postgres, 74 keys, lease epoch 34`; `Blindrise poker club on :10000`; `fair deal: drand beacon ok (round 33149897)`; live 12:04:26 PM EDT. The old instance fenced out cleanly (`lease lost… ours was 33`, `final save… "dirty":0`, answering 503 until SIGTERM). Log searches over the last 4 hours: `fenced` 0, `store write failed` 0, `Error`/`error` 0 after boot. **Production service `gta-poker`: live deploy `dep-db9bto942hec73cir180` = `d00b592…` (Oct 16, 8:18:41 PM EDT); NO deploy on Oct 17; no errors — production untouched by this release and by this audit.**
- **Restart note:** the deploy boot claimed lease epoch 34; the live server now reports epoch 35 — exactly one additional lease claim occurred between 16:04 UTC and Muse's first health read at ~17:31 UTC. It produced no error lines in the Render log and all seed/member data survived intact (every seeded account still logs in; club state preserved), which is itself real cross-restart persistence evidence (§9). Consistent with a platform instance cycle — the ~9-minute window in which Muse's early probe requests hung (17:31–17:40 UTC) sits in the same period. Not a code change and not an authorization event: the deployed commit never changed.

## 2. Login, PIN authentication & session security — PASS (live)

Live results (Muse's probes):
- Seeded director + member logins succeed; name matching is case-insensitive.
- Wrong PIN → `400 "Name or PIN is not right."`; unknown name → the **identical** error (no account-existence oracle).
- API endpoints refuse missing/garbage tokens with 401 (spot-checked on club endpoints).
- WebSocket: a garbage token gets `auth ok:false` and no club view.
- Registration (invite → redeem), tested live 10×: invite codes are **single-use** ("This invite link has already been used or was cancelled"), the 19+/rules agreement is **required** ("Please confirm you are 19 or older and agree to the club rules"), duplicate names refused ("That name is taken"), name rules enforced (2–16 letters/numbers).
- Deliberately NOT hammered live: the 10-failure account lock and recovery throttles (to avoid locking seed accounts during parallel testing). Those were verified by Muse in the R2 code audit (B6 suites: per-IP limit, club-wide cap, session revocation on owner reset) — code-level PASS carried forward, live lockout NOT re-tested.

## 3. Poker Club & the 9-player table — PASS (live)

- A 9-max tournament ("Friday Night Tournament", created by the parallel browser smoke) was running with 16 registered test players across **2 tables**. Muse seated 9 independent accounts; all 9 connected, registered, and played.
- Hands complete and advance on the live server: hand 1 produced a result in ≈52 s at real (non-test) pacing with several disconnected seats timing out; hand 2 started. Shuffle seal: empty during registration, a proper 64-hex seal once running (`f8550eb9…`, read live); no shuffle secret (`fairSeed`) appears in any client payload.
- The 9-player table layout at phone sizes: see §7 (emulation).

## 4. Chat isolation & privacy — PASS (live)

- A table-chat message sent by a seated player was received by **exactly** that player's tablemates (4 of Muse's accounts sat at the sender's table — all 4 received it), and by **nobody else**: the 4 Muse accounts at the other table, a signed-in lobby member, and the (unseated) director all received nothing. Post-hoc seat-map read confirms the 5/4 split that matches the delivery count exactly.
- (Carried from the R2 audit: the local isolation battery `t_chat`, 1,849 checks, passed on this build.)

## 5. Opportunity Club & contact protection (F1) — PASS (live), one known LOW gap

Live against the deployed server:
- Business free-text with a Persian-digit phone (`۴۱۶ ۵۵۵ ۰۱۰۰`) → **refused**: "Please remove the phone number from description…"
- Comma-separated phone (`416,829,5953`) in services → **refused**.
- Letter-swap phone (`416 555 O1OO`) → **refused**.
- Opportunity post details with a Persian-digit phone → **refused**; request message containing a phone → **refused**.
- Legitimate Persian text («قیمت ۴۱۶ هزار دلار، فروش نقدی») → **saved**, and reads back **byte-for-byte identical** (storage never rewrites content).
- **Known LOW gap (confirmed live):** the bullet-separator phone `416•829•5953` was **accepted** (HTTP 200). This is the gap Muse found in the F1 re-audit, recorded there as LOW and deliberately not fixed in `c0daed4`. It does not block staging acceptance; it must be on the fix list before Opportunity Club opens to real members, or explicitly accepted by the owner.
- Contact-privacy flow, end to end, live: a member's business phone appears **nowhere** in another member's Opportunity list payload; a contact request carries **no** contact details; the poster's phone becomes visible to the requester **only after** the poster explicitly shares it (`oppReply` share); a third member sees neither the request nor the shared contact at any point.

## 6. Business Club — PASS (live)

- Save/publish/list all work live; a published listing becomes visible to other members; directory responses carry `noindex` headers (verified in the code-audit suites; spot behavior consistent live).
- The F1 refusals and the byte-exact Persian save in §5 were Business Club saves.

## 7. Mobile responsiveness & visual consistency — PASS at the tested sizes, with an explicit emulation limit

**Live, through a real browser (Chromium) signed in as MuseQA 02 — native window (~1920×1080; the app renders as a centered ~600 px column):** login, lobby, the live poker table (seated; all 8 seats, pot, hero cards, FOLD / CALL / RAISE buttons, timer and time-bank all visible, nothing clipped), Business directory + profile form, Opportunity list + new-post form — **no horizontal overflow, no overlap, no cut-off elements on any screen**. One MINOR visual note: the login PIN field renders as a solid black rectangle with no visible placeholder/border, unlike the Table-name field beside it — worth a designer's look; not a functional defect.

**Per-viewport emulation matrix (320×568 / 360×640 / 375×667 / 390×844 / 412×915) against the live app: NOT TESTED — tooling limit, recorded plainly.** The managed browser offers no viewport resize or device emulation. Muse's alternate route (Playwright Chromium pointed at the live URL) cannot leave this sandbox: its HTTPS tunnel through the environment's egress proxy fails (`ERR_TUNNEL_CONNECTION_FAILED`) across six proxy configurations, while curl and Node fetch traverse the same proxy without issue — a sandbox/Chromium limitation, not an app or staging fault. What exists instead: the live native-viewport browser pass above, plus LOCAL Playwright suites at phone sizes on this exact client code (`t_table_small` at 375×667, `scan_csp` at 390×844, registration and business-search suites) — §11. The phone-size behavior of the LIVE deployment therefore rests on the owner's real-device pass (condition 1), not on emulation.

**Not tested anywhere:** real iPhone Safari / Android Chrome rendering, keyboard-overlap behavior, touch targets on hardware. The owner's limited iPhone smoke is the only real-device evidence.

## 8. Business Card Scanner — instruction flow PASS live; OCR pick NOT TESTED live (tooling); camera NOT TESTED

- Live in the browser: the scan screen opens with instructions, a card frame, "Take a photo" / "Choose a photo" choices, and the honest note that the photo is read on the device and a ~6 MB reader downloads on first scan. With no camera present, "Take a photo" produced no visible response (no error, no black view) — recorded as observed, not scored as an app failure.
- Library-pick OCR against the live app: **NOT TESTED** — the managed browser's upload tool cannot drive this picker (the "Choose a photo" control exposes no file input to it), and the Playwright route is blocked by the sandbox proxy issue in §7. Locally, `scan_csp` read a synthetic card in ~2 s with 8/8 fields, 0 CSP violations, 0 third-party requests, on both the SIMD and older-phone readers — LOCAL evidence (§11), not live proof.
- Real camera capture, iPhone Safari, Android Chrome: **NOT TESTED** — impossible from this environment; the pass rule on Claude's device sheet (camera opens, first read < ~20 s, ≥5/8 fields right, keyboard clear of the review form) can only be signed off on the owner's devices.

## 9. Database persistence & recovery — PASS (with stated limits)

- Cross-restart: the staging instance restarted once today (epoch 34 → 35, §1) and all seeded accounts, club state, and listings survived — observed directly by Muse's logins and reads at epoch 35.
- Same-boot integrity: data written by Muse (business profile, opportunity post, requests) re-read byte-exact across fresh logins/sessions.
- The deploy handover earlier today recorded the old instance leaving with `dirty:0` (nothing unsaved).
- NOT tested: a forced mid-write crash/restart on staging (would require a restart/deploy — outside this assignment's authority). The ≤1 s flush-window loss trade-off stands as owner-accepted from the R2 audit.

## 10. Navigation, performance & consistency — PASS (observed)

- Single-page app: shell 4.6 KB; main bundles `app.js` 147 KB, `business.js` 39 KB served 200; all first-load responses < 1 s from the test network (a datacenter connection — NOT a mobile-data measurement). The scanner's ~6 MB OCR pack downloads once, on first scan use only.
- Security headers live: CSP `default-src 'self'` with `wasm-unsafe-eval` for the local OCR worker; club API responses are `noindex`.
- Transient note: between ~17:31–17:40 UTC several probe requests hung (the epoch-35 restart window); the service recovered on its own and all subsequent testing was clean. [To be reconciled with the Render event log when the read lands.]

## 11. LOCAL VERIFIED set (recorded separately — NOT staging proof)

Full local suite re-run 2026-10-17 at the same commit (`c0daed4`, clean checkout), per the owner's instruction that local results be recorded separately:

- Evaluator 42/42; hand evaluator all-pass over 200,000 random hands; stress 3,000 tournaments / 30,873 hands, 0 problems; fair-deal 438 hands verified.
- `t_server`: **one transient failure** in the chained run — "member could add a reward" — then **PASS on two consecutive standalone re-runs** (73 s / 76 s, different random outcomes). Code read confirms reward-adding is owner-gated (`own(u)` in `server/index.js`); the test waits a fixed 150 ms for the refusal and the chained run was under heavy parallel load. Graded: test-timing flake, not a product defect — recorded here so it is not silently lost.
- All other suites PASS: `t_chat`, `t_coach`, `t_players`, `t_push`, `t_extra`, `t_security`, `t_bizunit` (incl. card parser), `t_business`, `t_opportunity`, `t_content` (261 probes), `t_clubs`, `t_csp`.
- (From the R2 audit, same build: Playwright UI suites at phone sizes — `t_table_small`, `t_registration`, `t_bizsearch`, `scan_csp` incl. the no-SIMD reader — all PASS, local Chromium.)

## 12. Limitations of this audit (explicit)

- Real-device testing: only the owner's limited iPhone smoke exists. Safari-specific behavior, Android Chrome, real camera capture, keyboard overlap, and mobile-data performance are **NOT TESTED** and are not claimed as PASS anywhere above.
- Live lockout/recovery throttles not re-hammered (§2) — code-audit PASS carried forward.
- The two CHECK-grade items from the live run were resolved by follow-up reads (seal-at-start; two-table chat arithmetic) and are reported as PASS with their evidence above.
- One probe FAIL was Muse's own test defect (an over-long generated name tripped name validation before the invite checks); both affected checks were re-proven PASS in the earlier clean run of the same script.
- Staging test data left by this audit (all fake, staging-only): Muse's QA member accounts (MuseQA 01–10 + a few one-off registration-check accounts), and from the parallel browser smoke the MuseSmokeA1 / MuseSmokeB accounts, a "Smoke Test Co" draft business profile, a live "Looking for a reliable web designer" opportunity post, and a group invite link. Muse's own business listing and opportunity post were deleted at the end of the probes; the "Friday Night Tournament" (created by the browser smoke) was left running with its test players, undisturbed by Muse's cleanup.
- During the parallel browser work, the shared browser profile was twice seen signed in as a different test account ("Sign in first" on one save attempt, cleared by reload): an artifact of two test sessions sharing one browser profile, not an application defect; every affected check was re-confirmed under the correct session.

---

## VERDICT — CONDITIONAL PASS (staging acceptance)

**Blindrise Release 2 at `c0daed4` is ACCEPTED on staging**, on Muse's independent live evidence: the deployed build is verified (§1), and login/session security, the 9-player poker club, chat isolation, the Business Club, and the Opportunity Club with its F1 contact protection all PASS against the live server (§2–§6), with persistence proven across a real restart (§9) and a full LOCAL suite pass recorded separately (§11). An independent browser smoke through the real UI reproduced the F1 and chat results (§1, §4).

**Conditions — all must clear before R2 is considered for production authorization:**

1. **Owner's real-device pass (still owed).** iPhone Safari + Android Chrome on staging: scanner camera flow including the permission-denial path, first card read < ~20 s, ≥5/8 fields correct, keyboard not covering the review form; the 9-player table at real phone sizes; registration and business search end to end. Live phone-size emulation could not be run from this environment (§7) and the scanner's live OCR pick is untested (§8) — the device pass is the evidence that closes both.
2. **Bullet-separator F1 gap** (`416•829•5953` passes the filter — LOW, §5): fix it, or record the owner's explicit acceptance, before Opportunity Club opens to real members.
3. **`scripts/content-audit.js` on production data** before either club opens (standing gate from the R2 audit).

**Production: NOT approved by this audit, and R2 is not yet ready to be considered for production authorization** — condition 1 is outstanding. Production requires the owner's separate explicit authorization; Release 1 remains parked with its own conditions (OWNER_CODE rotation at an owner-performed session, fresh window reconfirmation, final approval) and is untouched by this verdict. Release 1 is preserved; no code was changed, nothing was deployed, and no production setting was read beyond the read-only verification in §1.
