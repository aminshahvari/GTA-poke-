# Muse — urgent audit request: Welcome UI release candidate `49d9ece`

**From:** Claude · **Owner direction:** Sean, 2026-10-17 19:05 UTC ("Welcome UI Release Decision")
**Release candidate:** `49d9ecebb88884b9296f8c934f34d762dc637a26` on branch `welcome-ui`. This audit note lives on the separate docs branch `welcome-audit` so the candidate SHA does not change.
**Goal:** live before tonight's tournament, only with your PASS **and** a separate owner GO. Nothing is merged or deployed.

## Please verify
1. **Base is production only.** `git merge-base origin/welcome-ui origin/main` = `d00b592…` (live on Render as `dep-db9bto942hec73cir180`). `git rev-list --count origin/main..49d9ece` = 1. `git log 49d9ece --not d00b592` lists only `49d9ece`; no R2 commit (`r2-dev` is not an ancestor).
2. **Scope.** `git diff --name-status d00b592 49d9ece`: `public/app.js`, `public/index.html`, `public/style.css`, `public/og.png` (new), `test/ui/t_welcome.js` (new), `docs/welcome/*` (evidence). Nothing in `server/`, `package*.json` or the service worker.
3. **Auth unchanged.** In `public/app.js`, the sign-in/join/setup/reset form submit code, `post()`, the token storage and the WebSocket `hello` are byte-identical. Only the entry point changes: no token → `welcomeScreen()` instead of the login form; a stale token still goes to `authScreen('login')`; no owner still goes to setup. Added: `‹ Back` link, PIN placeholder, removed globe canvas.
4. **CSS is scoped.** Every new rule is under `#auth`. The old `#auth` block was removed. The lobby, table, chat and modals are unaffected.
5. **Sharing.** `og:title/description/url/image` (+ size/type/alt) and the `twitter:*` tags are in `index.html`, which is served for `/` and `/join/<code>`. `og:image` = `https://gta-poker.onrender.com/og.png`, PNG 1200×630, 97 KB; CSP unchanged (`img-src 'self'`).
6. **Copy is honest.** Business Club and Opportunity Club show "Opening soon" (both are still closed in production). Join without an invite only explains that Blindrise is invite-only.

## Evidence (on `welcome-ui`)
`docs/welcome/HANDOFF.md`, `docs/welcome/before/`, `docs/welcome/after/`, `test/ui/t_welcome.js`. Re-run: `npm test` and `PLAYWRIGHT_CORE=… CHROMIUM=… node test/ui/t_welcome.js`.

## Known limits
- Chromium only. No real iPhone Safari or Android device is available to Claude; the owner's phone check is still needed.
- The WhatsApp preview can only be confirmed after the deploy.

Deploy checklist and rollback: `docs/welcome/DEPLOY-CHECKLIST.md`.
