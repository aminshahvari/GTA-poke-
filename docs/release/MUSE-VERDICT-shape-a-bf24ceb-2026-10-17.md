# Blindrise Shape A (Premium UI on the Production Backend) — Final Production Audit

**Auditor:** Muse / Marlowe — 2026-10-17 (expedited, independent)
**Candidate:** `bf24ceb8c15132183a3f50d6c8589e54cc543b40` on `shape-a-premium-ui` — one commit on base `49d9ece` (live production, deploy `dep-db9sr9e1egvs73d4qgh0`).

## Verdict: CONDITIONAL GO — conditions below; no blockers found

**1. Exact SHA & zero server change — VERIFIED.** Branch tip is exactly the named SHA; merge-base is exactly `49d9ece`. The diff is 24 files (+651/−7): 3 under `public/` (style.css, index.html, app.js), the ported premium test, and documentation/evidence. **`git diff 49d9ece..bf24ceb -- server package.json package-lock.json` is EMPTY** — server, engine, auth, schema and dependencies are byte-identical to production. Claude's central claim is true.
**2. Accounts, invitations, data — PRESERVED by construction and by test.** With the server untouched there is no migration and no data path changes; the new client writes nothing the old one didn't. Muse's run of the Welcome UI suite on the candidate passes in full, including *invite link → Accept invitation → new name + PIN → lobby* and sign-in. The share image `og.png` is byte-identical to production's, so link previews are unchanged.
**3. The port is faithful to the audited design — VERIFIED in the diff.** Crest header, Lounge / Leaderboard / Salon / Director tabs, the member home with the four doors — the code is the audited `7dabbc3` layer adapted to production: **only Poker is a working door; The Exchange, The Bulletin and the Scanner render "Opening soon", `aria-disabled`, inert** — matching the live Welcome behavior, with no R2 screens or club logic carried over. One audited MINOR (dialog buttons at 320 px) is fixed by an added wrap rule; the other (Opportunities chips) does not exist in this build.
**4. Tests — Muse's independent runs.** Full `npm test`: **exit 0**. Premium UI battery: **207 ok / 1 failed — exactly Claude's numbers.**
**5. The one failure — PRE-EXISTING and cosmetic, proven, not asserted.** At 320×568 on the poker table, the Chat and Lobby menu buttons measure 44×32 and 77×32 against a 44 px tap-target guideline. Those buttons and their sizing rules are production's own stylesheet, byte-identical in both builds (the premium layer only adds a 32 px minimum); Claude's baseline run shows the same table checks failing *worse* on the current production build (16 failures). The buttons remain easy to tap; the real table-layout fixes live in the R2 line for its own release. **Non-blocking.**
**6. Rollback — EXACT.** Render rollback to deployment `dep-db9sr9e1egvs73d4qgh0` (equivalently, return `main` to `49d9ece`). Client-only change; no data recovery involved.

## Conditions (all operational, none code)

1. **Fresh production backup** created immediately before the merge (standing rule; minutes of work).
2. **Window:** merge only while no game is running, and either **at least 45 minutes before tonight's 20:00 tournament** with the first boot monitored, **or after the tournament ends**. Do not merge into a live game or into final registration minutes.
3. **Post-deploy smoke by the owner:** sign in, Lounge renders, open the table view, and confirm the WhatsApp/link preview still shows the crest card.
4. The founder's explicit GO names this SHA (`bf24ceb`).

*Scope notes: this verdict covers the UI-only release only. R2 (staging-accepted at `c4445ed`), the Feedback Hub (`67ed7fc`) and any club opening remain separate tracks with their own gates. Contrast ratios and reduced-motion remain unmeasured, as in the preview audit — cosmetic class, carried as record items.*
