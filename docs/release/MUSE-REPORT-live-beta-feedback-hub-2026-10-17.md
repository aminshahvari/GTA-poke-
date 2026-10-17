# Blindrise — Live Beta Readiness (Track 1) + Feedback Hub Audit Criteria (Track 2)

**Author:** Muse / Marlowe (independent audit) — 2026-10-17
**Scope:** Blindrise only. Track 1 continues the R2 release audit; Track 2 prepares the Feedback Hub audit. The two tracks are judged independently — a verdict on one never implies a verdict on the other. **Nothing in this report authorizes production deployment; a separate explicit owner GO remains required.**

---

# Track 1 — R2 Controlled Production Beta

## 1.1 Assessment of the beta strategy

The strategy fits the evidence. R2's remaining known defects are cosmetic; its safety-critical surfaces (authentication, privacy filter, poker engine, data store) are either byte-identical to the build Muse acceptance-tested live on staging, or at final audit PASS. Delaying member feedback over pixel-level polish buys no safety. Muse supports the controlled beta on the criteria below.

## 1.2 Genuine blockers — none known

| Non-negotiable (owner) | Evidence (Muse's own verification) |
|---|---|
| No authentication failures | Server auth/session code byte-identical to the staging-acceptance build; live staging probes passed (login, PIN, session resume, wrong-PIN refusal, no login oracle); `t_welcome` + `t_registration` + `t_security` pass on the exact candidate `c4445ed`. |
| No privacy leaks | F1 contact filter at FINAL PASS, blob-identical in the candidate (`server/content.js` = `ea6c84c4…`); clubs ship closed by default; chat isolation verified live with exact delivery arithmetic in the R2 staging acceptance. |
| No corrupted data | Zero store/schema/package changes in the release (full server diff vs the accepted staging build = the one audited filter file); staging persistence and a clean lease handover verified. |
| No poker integrity problems | Engine/fairness code untouched; full suite exit 0 on Muse's run at the candidate, including evaluator, fairness and simulation suites. |
| No critical registration defects | Registration browser test passes; invite auto-registration is the pre-existing, owner-accepted behavior — unchanged (server diff proves it). |

## 1.3 Acceptable for beta (cosmetic; documented; none affects gameplay or essential information)

1. Action badge grazes the stack's bounding box by 1–2 px at five viewport sizes in Chromium (stack numerals remain fully legible — Muse's screenshots). Claude's `t_mobile_ux` "pass" does not reproduce in Muse's environment (15/72 checks, all hairlines + item 2); reconciliation of that test record is a pre-production paperwork condition, not a beta blocker under the owner's philosophy.
2. 320×568 top bar may not fit the player's own full name (verify on the smallest real device during the smoke pass; identity is never ambiguous — full names appear on seats/profiles).
3. 320×568 chip labels can touch the pot/dealer button when all nine players have bet (pre-existing, disclosed).
4. Coach tip, while open, covers the hero's cards and the two lowest seats; it closes on the player's turn and never shrinks the table (documented design trade-off).
5. Own cards overlap own name plate (pre-existing, accepted).
6. Welcome-screen footer microcopy (~11 px) contrast ≈ 4.0–4.5:1 (MINOR, from the Welcome audit).

## 1.4 Minimum safe beta criteria — status

Owner conditions 1–6, with Muse's additions marked ◆.

1. **Exact integrated SHA verified — DONE.** Candidate `c4445ed` (code state `3dad54f`) audited end-to-end; CONDITIONAL PASS filed (`d7f2ad4` on `r2-rc`). Any code change voids the verdict.
2. **Staging healthy — IN PROGRESS.** Owner authorized the staging deploy of the exact candidate; Claude is executing. Muse's pre-deploy baselines are captured (staging branch `c0daed4`, health OK on Postgres, lease epoch 36, nothing dirty; production healthy on `49d9ece`). Muse will independently verify the deployment (live SHA/lineage, boot handover, production isolation, live probes) when Claude reports completion, and issue a concise staging acceptance verdict.
3. **Real-device smoke — OWNER, PENDING.** The one load-bearing check no machine can substitute (real Safari, real camera, phone keyboards). Six steps per Claude's staging plan: welcome → sign-in; one table hand (badge/names/coach/action buttons); Business publish → appears without reload; F1 refusals on staging; scanner with camera permission allowed and denied; report pass/fail per line.
4. **Read-only production content audit — REQUIRED BEFORE CLUBS OPEN, not before deploy.** The beta may deploy with Business and Opportunity clubs closed (release default); the audit runs on production data under its own owner GO; club opening is a separate later switch. Scanner availability likewise follows its device check (criterion 3).
5. **Rollback verified and ready — PLAN VERIFIED; one datum owed.** Code rollback = fast-forward reversal to the live Welcome build `49d9ece` (Render rollback equivalent). Claude's readiness report must name the exact live production deployment ID as the target; Muse will verify it. ◆ **Fresh production backup immediately before deploy** (Muse's addition): rollback repairs code, not data; the current backup predates today's play. Owner-authorized export, ~5 minutes.
6. **Separate explicit owner GO — OUTSTANDING by design.** Deploy-moment rules still apply: no game running, outside tournament hours, monitored first boot (health, single lease handover, zero errors) before play resumes.

**Track 1 sequencing:** Claude's staging deploy → Muse's staging acceptance verdict → owner device smoke → Claude's readiness report (Muse-checked) → fresh backup → owner GO → production deploy (clubs closed) → content audit → clubs/scanner enabled as separate steps.

---

# Track 2 — Feedback Hub: Independent Acceptance & Security Criteria

Prepared in advance of implementation. When Claude delivers an exact commit SHA, Muse will audit that SHA against every criterion below and issue a separate PASS / CONDITIONAL PASS / FAIL. **The Feedback Hub verdict is independent of the R2 approval.** One structural warning up front: the audited R2 candidate `c4445ed` does **not** contain the Hub. If the Hub is merged into the release line, the release SHA changes — the Hub audit (incl. criterion 10, full regression) is then a required delta audit of the combined candidate before any production GO can rest on it.

Severity key: **[BLOCKER]** = failure keeps the Hub off production (and off the beta if the Hub is bundled with it). **[CONDITION]** = may ship to staging/beta closed or limited, must close before general availability.

## 2.1 The owner's ten checks, as testable criteria

1. **Submission from relevant sections [CONDITION].** A signed-in member can submit feedback from, at minimum, the lobby, the table view, and the Business/Opportunity sections (or a single global entry point reachable from each in ≤2 taps). Submissions record: author identity (server-side, from the session — never client-supplied), section/context, timestamp, text. Test: submit from each section on a local build; confirm records land with correct context and the *session's* identity even if the client sends a forged author field.
2. **Admin-only dashboard [BLOCKER].** Every dashboard read/write endpoint enforces an owner/admin check **server-side** (the same authority class as the Director functions). Tests: unauthenticated request → refused; ordinary member token → refused (403/404, no data in body); direct URL navigation by a member shows no dashboard data; responses contain no feedback records in any member-facing API payload.
3. **Cross-member isolation, server-side [BLOCKER].** A member can never read, enumerate, or infer another member's feedback: no member-facing list endpoint, or one strictly filtered to the caller's own submissions; IDs (if any) are unguessable or ownership-checked on every access. Test: two member accounts; A attempts to fetch B's submission by ID/parameter tampering → refused; list endpoints return only A's own.
4. **Validation & abuse protection [BLOCKER for the unsafe cases].** Server-side: non-empty text required; length cap enforced (suggested ≤ 2,000 chars); per-member rate limit (suggested ≤ 5 submissions/hour, with a clear client message); HTML/script content stored inert and rendered escaped everywhere (stored-XSS via the dashboard is the classic kill shot — tested explicitly); control characters/newline flooding bounded; malformed JSON/oversized bodies rejected like the rest of the API. Tests: script payload submitted → dashboard renders it as text; 10 rapid submissions → rate limit engages; 100 KB body → refused.
5. **Screenshot uploads [BLOCKER].** If included: images only, verified by content (magic bytes), not by filename/extension; size cap (suggested ≤ 5 MB); stored outside any executable path and served back with an image content type + `Content-Disposition` that prevents HTML/JS execution from the app origin (an uploaded "image" that renders as a page is a stored-XSS vector); filenames randomized (no path traversal, no member-controlled names); EXIF metadata stripped or never served (GPS in a member's screenshot is a privacy leak); uploads require auth and inherit criterion 4's rate limits. If screenshots are **not** included, this criterion is satisfied by absence — Claude's handoff must state which.
6. **No sensitive capture [BLOCKER].** The submission payload and stored record must never contain: PINs, session tokens, or auth headers; other players' private data; hand histories beyond what the submitting member themselves saw; chat content of tables the author wasn't in. Automatic context attachment (if any) is limited to: app version/build, current section, device class — stated in Claude's handoff and verified in the stored record. Logs must not record feedback bodies with tokens attached (check server logging of the new routes).
7. **Persistence across restarts [CONDITION].** Feedback lives in the same Postgres-backed store as the rest of the app (not process memory, not local files on the instance). Test: submit → restart the server → record intact; record also survives a store save/load cycle alongside existing keys without disturbing them (store key count grows by exactly the new feedback keys).
8. **Tournament safety [BLOCKER].** The Hub is inert during play: no changes to the table/engine code paths; new routes are request/response only (no new timers, intervals, or broadcast traffic); a feedback submission during a running hand adds no latency to table broadcasts (test: submit mid-hand in the local harness while a table state is live; hand flow unaffected); image handling, if any, is size-bounded so it cannot stall the event loop on a phone-photo-sized payload.
9. **Mobile usability & accessibility [CONDITION].** On 320×568 and 390×844: the entry point is reachable and tappable (≥ 44 px targets), the form fits without horizontal scroll, the submit button and any error message are visible without hunting (the share-sheet lesson from R2 applies), labels are real text (not placeholder-only), and error/success states are announced in text. The dashboard is usable at desktop width and not broken at phone width.
10. **No regressions [BLOCKER].** On the exact Hub SHA: the full existing suite passes (`npm test` exit 0), and the browser tests Muse designates (`t_welcome`, `t_registration`, table and club UI tests, scanner CSP both modes) pass. Diff discipline: the Hub's diff must be additive (new files/routes/UI) — any change to existing auth, engine, store-format, or club code is itemized by Claude and re-audited by Muse line-by-line.

## 2.2 Cross-cutting criteria

- **Kill switch [CONDITION].** The Hub can be disabled (env flag or owner toggle) without a code change, and disabling it hides entry points and refuses the endpoints — the beta's rapid-learning loop needs an off-ramp if feedback volume or abuse surprises.
- **Data ownership & retention [CONDITION].** Dashboard supports resolving/deleting a submission; deleted feedback is gone from the store (verified across a restart). No feedback data leaves the app (no third-party analytics calls from the new code — checked in the diff and at runtime via the CSP test).
- **CSP & dependencies [BLOCKER if violated].** No new external origins, no new dependencies without itemization; the strict CSP stays intact (scanner CSP test with the Hub enabled passes).
- **Backups [CONDITION].** Feedback records ride the existing store backups automatically (they're store keys — verified under criterion 7); no separate data silo.

## 2.3 What Muse needs from Claude's handoff to begin

Exact commit SHA + branch; the diff stat vs its base; a statement of: storage location, admin authority used, whether screenshots are included, what context is auto-attached, rate limits/length caps implemented, and the kill-switch mechanism. Muse then runs §§2.1–2.2 against that SHA and files a separate verdict.

---

## Closing status

- Track 1: beta criteria defined; staging verification in progress (awaiting Claude's deploy report); production **not** authorized.
- Track 2: criteria ready; audit begins when Claude delivers an exact SHA.
- No production changes of any kind were made in preparing this report.
