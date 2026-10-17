# Welcome + sign-in redesign (A+C "Luxury private club") — handoff for Muse

Branch `welcome-ui`, based on **`d00b592`** (= `origin/main` = live production build). No Release 2 code; nothing deployed.

## What changed (visual only)
| File | Change |
|---|---|
| `public/index.html` | New markup for the `#auth` screen (brand, three feature cards, Join / Sign In buttons, invite banner, invite-only note). Open Graph + Twitter meta tags, page title, theme colour, Cormorant Garamond added to the existing Google Fonts link (already allowed by the CSP). |
| `public/style.css` | Old `#auth`-only rules replaced by a new block scoped to `#auth` (midnight navy, champagne gold, glass cards, entrance animation, reduced-motion respected, small-phone + desktop layouts). Nothing outside `#auth` changes; modals keep their style. |
| `public/app.js` | Removed the old canvas "globe" drawing. Added `welcomeScreen()`. `connect()` shows the welcome instead of the sign-in form when there is no token (setup/first-run still goes straight to the setup form; an expired token still goes straight to Sign In). The forms, their fields, the API calls and the token handling are unchanged, plus a `‹ Back` link and a PIN placeholder. |
| `public/og.png` | 1200×630 share image, 97 KB (source `docs/welcome/og-source.html`). |
| `test/ui/t_welcome.js` | New browser test (below). |

Not touched: `server/` (no auth, engine, schema, API or CSP change), `package.json`, the lobby, the table, chat, timers, the service worker.

## Flow
- `/` with no saved token → Welcome. **Join Blindrise** → explains invite-only (no account is created without an invite link). **Already a Member? Sign In** → the existing PIN form → lobby.
- `/join/<code>` → Welcome with a "Private invitation" banner, button **Accept invitation** → the existing join form (name, PIN, 19+ agreement) → `/api/redeem` as before.
- Saved valid token → straight to the lobby (welcome never shown). Existing sessions are not invalidated.
- Stale token → straight to Sign In (as before).
- No owner yet → setup form (as before).

## Evidence
- `docs/welcome/before/` — production `d00b592` at 390×844, 320×568, 1280×800.
- `docs/welcome/after/` — welcome, sign-in, invite and join screens at 320×568, 375×667, 390×844, 430×932, 360×800, 412×915, 1280×800.
- `node test/ui/t_welcome.js` (Chromium, mobile emulation): for each of the six phone sizes: welcome content, invite-only note, wrong PIN refused, existing PIN → lobby, reload with token → lobby, stale token → Sign In, invite link → join → lobby → re-login; no sideways scrolling and no clipped controls; focused name/PIN fields visible in a keyboard-height viewport. Plus: setup mode with no owner; OG tags on `/join/…`; og.png served as image/png, 1200×630, under 300 KB.
- `npm test` (evaluator, rules, sim, full-stack server tournament, coach, players, push, extra-time, security): pass.

## Limits
- Chromium only. iPhone Safari (incl. Home Screen app) and a real Android phone were not tested by machine; keyboard behaviour is emulated. Owner check needed on a real phone.
- Fonts were blocked in the sandbox, so screenshots use fallback fonts; on phones the Google fonts load (Inter-like Plex + Cormorant), falling back to Georgia/system.
- The WhatsApp preview can only be confirmed after deploy (WhatsApp fetches the public URL; it caches previews per link).

## Deploy and rollback
- Deploy = merge `welcome-ui` into `main` (Render auto-deploys `gta-poker`). A deploy restarts the server: **do it before the tournament starts, never during play.** Tokens are stored in the database, so members stay signed in; open apps reconnect on their own.
- Rollback: Render → gta-poker → Deploys → "Rollback" to the `d00b592` deploy, or `git revert` the merge on `main` and push. No data migration either way.
