# Blindrise — Feedback Hub: Independent Security & Acceptance Audit

**Auditor:** Muse / Marlowe — 2026-10-17
**Candidate:** `67ed7fcf31459fc788570bf81844d3f102934579` on `r2-feedback` (single feature commit on the audited R2 candidate `c4445ed`; not merged anywhere, not deployed).
**Criteria:** Muse's Track 2 criteria (filed at `0c13010` on `r2-rc`) — the owner's ten checks plus cross-cutting items. This verdict is independent of the R2 release approval and of the Premium UI review. **No production authorization is implied.**

## Verdict: PASS

The implementation meets every criterion, including all BLOCKER-class items, on Muse's own evidence: a full read of `server/feedback.js` and the `server/index.js` wiring, the complete test suite, Claude's feature tests, and **31 independent Muse probes** (API, WebSocket, restart, hostile-input and browser-rendering) — all passing. Two probe-side errors on Muse's side (an expected-count miscalculation and an env-passing bug in Muse's own script) were identified, corrected and re-run; no product defect was involved in either.

## Evidence by criterion

1. **Submission from relevant sections — PASS.** Feedback buttons in the lobby top bar and the table chat header open one sheet (Bug / Idea / UX, optional screenshot). Author identity comes from the server session: Muse's forgery probe (client-sent `uid`, `author`, `version`, `token`, `pin` fields) stored a record authored by the actual session member, with the server's own build as `ctx.version`, a bogus section coerced to `other`, out-of-range viewport values dropped, and **none of the forged strings anywhere in the stored record**.
2. **Admin-only dashboard — PASS.** Every read/write endpoint and the screenshot route enforce the existing owner role server-side. Member calls return 403 with an `{error}`-only body; unauthenticated calls 401; the owner inbox (Director tab) is the only reader.
3. **Cross-member isolation — PASS, strongest form.** There is no member-facing read endpoint at all — members cannot see even their own submissions after sending, and the note's own sender gets **404** fetching their own screenshot. IDs are 64-bit random (`crypto.randomBytes`), never client-chosen.
4. **Validation & abuse protection — PASS.** Category from a fixed map (exact string keys only); text cleaned (NFC, control/zero-width/bidi stripped) and bounded to 5–2,000 chars; rate limits **5/hour and 20/day per member, stored in the database** — Muse verified a 6th send is refused (429) and is *still* refused after a server restart. The one stored-XSS shot that matters — a `<script>`/event-handler payload opened in the owner's real inbox in a browser — rendered as **literal text, zero injected elements, no execution** (the client builds the inbox with `textContent` throughout).
5. **Screenshot uploads — PASS.** JPEG only, proven by a real segment parser (not extension or declared type): HTML-in-JPEG-clothing and PNG data URLs are refused (400). Muse's crafted JPEG carrying EXIF GPS, XMP, an ICC profile and a comment segment came back from the owner's download with **all four metadata segments stripped and the picture intact** (valid SOI→EOI). Caps: ~100 KB per shot (data-URL length), 5/member/day, 200 stored club-wide, and the `/api/fbSend` body limit (150 KB) sits just above the shot cap — an oversized body is cut by the platform's pre-existing socket-destroy pattern, creates no record, and leaves the server healthy (verified). Downloads are owner-only, `image/jpeg`, `Content-Disposition: attachment`, `no-store`.
6. **No sensitive capture — PASS.** Stored context is a fixed whitelist: server build version, section (fixed list), device *class* derived server-side from the user-agent (raw UA not kept), viewport ints. The module logs nothing. The member form itself discloses this honestly: "We add the app version, the screen you are on and your device type. Never your PIN, chat or cards."
7. **Persistence — PASS.** Feedback, screenshots and rate-limit records are ordinary keys in the existing store (`fb:`, `fbshot:`, `fblimit:`) — they ride the existing backups, and Muse verified notes and limits survive a restart. Deleting a note deletes its screenshot too.
8. **Tournament safety — PASS.** The module starts no timers and broadcasts nothing (the only "timer/broadcast" text in the file is its own header comment saying so); the `server/index.js` diff is additive routes plus two one-line integrations (club payload flags, member-removal cleanup). Sends are bounded request/response store writes.
9. **Mobile usability & accessibility — PASS.** Claude's UI test passes at 320 and 390 px (44 px targets in the inbox); Muse's own 320×568 render of the form is clean (no sideways scroll, real text labels, visible counter and errors, large send button).
10. **No regressions — PASS.** Full `npm test` exit 0 on Muse's run (including the new `t_feedback`), plus `t_feedback_ui`, `t_welcome`, `t_registration`, `t_bizsearch`, and the scanner CSP test in both SIMD modes.

**Cross-cutting:** both kill switches verified by Muse — `FEEDBACK=off` makes every Hub endpoint and `/fbshot/*` answer 404 while the app runs normally, and the owner's Director toggle (real WebSocket path) closes sending to members (403) while the owner keeps the inbox; a member's attempt to flip that toggle over the socket has no effect. No new dependencies or external origins (the only `package.json` change adds the new test to the chain).

## Notes (not conditions)

- Feedback text is intentionally **not** run through the clubs' contact filter: notes land only in the owner-only inbox, where a member may legitimately include a way to reach them. Nothing member-typed is ever published by the Hub.
- Members get no sent-history (fire-and-forget by design). Acceptable — arguably privacy-better — and worth revisiting only if members ask for it.
- If the Hub is merged into the R2 release line, the combined SHA requires the standing delta audit before any production GO relies on it (the Hub branch is based on `c4445ed`, so the delta is exactly this feature, already audited here at its own SHA).

**Bottom line:** a careful, security-first implementation — owner-only by architecture rather than by hiding buttons, metadata-stripped screenshots, restart-proof limits, and two working off-switches. PASS at `67ed7fc`.
