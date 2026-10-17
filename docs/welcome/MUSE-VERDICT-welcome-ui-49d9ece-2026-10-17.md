# Blindrise — Welcome UI Release: Independent Audit Verdict

**Auditor:** Muse / Marlowe — 2026-10-17 (deadline 17:00 EDT; tournament 20:00 EDT)
**Candidate:** `49d9ecebb88884b92946f8c934f34d762dc637a26` (branch `welcome-ui`; audit docs on `welcome-audit` at `398d3ab`)
**Base:** production `d00b592` (live deploy `dep-db9bto942hec73cir180`)

## Verdict: CONDITIONAL PASS

The code is verified clean. The conditions are deploy-moment gates (§Conditions), not code defects. No merge or deployment is authorized by this verdict — the owner's separate written GO naming `49d9ece` is still required.

## Independently verified (Muse's own runs, not Claude's claims)

1. **Scope — PASS.** `49d9ece` is a direct child of `d00b592` (rev-list count 1). The full diff touches only `public/app.js`, `public/index.html`, `public/style.css`, new `public/og.png`, new `test/ui/t_welcome.js`, and `docs/welcome/*` evidence. **Zero changes** to `server/`, `package.json`/lockfile, or the service worker. No new dependencies (one added Google Font family via the existing fonts stylesheet).
2. **No Release 2 code — PASS.** `r2-dev` is not an ancestor. The candidate tree has no `server/content.js`, no Business/Opportunity client code, no `clubsOn` writer. The club cards are static HTML marked "Opening soon" — production clubs stay closed, and the copy is honest about it.
3. **Auth / invitations / sessions / poker preserved — PASS.**
   - The form submit handler is **byte-identical** to `d00b592`; `post()`, token storage, and the WebSocket `hello` handshake are untouched by the diff. The only behavioral change is the entry point: no token → welcome screen; invite link → welcome with the invitation banner → join form; stale token → sign-in form; no owner → setup form (unchanged).
   - Full base suite at `49d9ece`, run by Muse: **exit 0** — evaluator, rules 42/42, sim, server, coach, players, push, extra, security all pass.
   - Claude's browser test `test/ui/t_welcome.js`, run by Muse locally (Chromium, 6 phone viewports 320×568 → 430×932 + Android sizes): **all checks pass** — welcome → Sign In → existing PIN → lobby; returning member (saved token) straight to lobby; expired session lands on Sign In; invite link → register → lobby; wrong PIN refused with a message; no horizontal scrolling; focused fields stay visible at keyboard height.
4. **Open Graph / WhatsApp — PASS (pre-deploy portion).** All `og:*` and `twitter:*` tags present in the HTML served for `/` and `/join/<code>`; `og:image` is an absolute URL on the real production origin (`https://gta-poker.onrender.com/og.png`); the image file is exactly **1200×630**, **99,197 bytes** (under WhatsApp's ~300 KB preview threshold), served `200 image/png` by the candidate build. WhatsApp's own fetch/render can only be confirmed after deploy (checklist item 11).
5. **Mobile / accessibility — PASS with one MINOR note.** Muse's own screenshot at 390×844 (settled state) matches the approved luxury direction: no overlap, no clipping, cards and CTAs fully inside the viewport. Tap targets measured **52 px** tall. Form inputs keep `<label for>`; decorative SVGs are `aria-hidden`; every changed CSS selector is `#auth`-scoped — lobby, table, chat and modal styles are untouched; `-webkit-` prefixes present for backdrop-filter. MINOR (non-blocking): the 11 px footer microcopy ("Private · Invite only · Free to play") sits at roughly 4.0–4.5:1 contrast — cosmetic; polish later, not tonight. Observation: the welcome elements animate in with a sub-second stagger (≤ ~0.9 s total) — an instant screenshot shows a partial screen; harmless.
6. **Security — PASS.** No server code changed, so no server attack surface changed. CSP untouched (`img-src 'self'` still serves og.png same-origin). The removed globe canvas code eliminates a small script, nothing else.
7. **Rollback — SAFE and documented.** Code-only change (no schema/store/server changes): Render rollback to `dep-db9bto942hec73cir180` plus the `git revert` step in `docs/welcome/DEPLOY-CHECKLIST.md` returns production to `d00b592` behavior with no data impact. The checklist's deploy mechanics (fast-forward push, ≥30 min before the tournament, health checks 7–12) are sound.

## NOT verified by Muse

- **Real-device Safari/Android rendering** — still outstanding (acknowledged by owner and Claude). Chromium evidence across six viewports is strong, and the post-deploy phone checks are the mitigation.
- **Live WhatsApp preview** — only confirmable after deploy.
- **Current production game state** — Muse has no production access; this is the deploy-moment check below.

## Conditions (all must hold at deploy time)

1. Owner GO in writing naming `49d9ece`.
2. **No game running** — Director tab shows no running tournament or live table, and no table is mid-hand (checklist step 3). Never deploy mid-game.
3. Deploy **at least 30 minutes before 20:00** (by ~19:30 EDT) so a rollback fits inside the window.
4. Immediately after deploy, the owner runs the checklist phone checks (welcome on the real phone, PIN sign-in, returning-session reconnect, invite link, og.png + WhatsApp self-chat preview). Any failure → roll back first, diagnose after.

## Repo nit (non-blocking)

~7.5 MB of before/after screenshots under `docs/welcome/` ride in the repository. They are not under `public/` and are never served to clients; prune in a later cleanup, not tonight.

*This verdict covers `49d9ece` only. Any change to the candidate voids it. The R2 separator-family re-audit is a separate track and is not covered here.*
