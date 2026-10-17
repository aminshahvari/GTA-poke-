# Welcome UI — production deploy checklist (for after Muse PASS + owner GO)

Candidate `49d9ece`. Production now: `d00b592` (deploy `dep-db9bto942hec73cir180`). Service `gta-poker` (srv-db81l3eq1p3s7397u4s0), auto-deploys `main`.

## Timing
- Render build+start for this app: **about 30–40 s** (last three production deploys: 27 s, 39 s, 30 s), then about 30 s of overlap while the old instance hands over the lease.
- Members' open apps show "Reconnecting…" for a few seconds, then reconnect. Nobody is signed out (tokens are in the database).
- **Safety window: deploy at least 30 minutes before the tournament starts**, so a rollback (another ~1 min) and a phone check both fit with room to spare. **Never deploy while any table is playing.**

## Before
1. [ ] Muse PASS for exactly `49d9ece` (recorded).
2. [ ] Owner GO, in writing, naming `49d9ece` and the time.
3. [ ] No game running: Director tab shows no running tournament or live table, and no cash/sit-n-go table is mid-hand.
4. [ ] `origin/main` is still `d00b592` (nothing else slipped in).

## Deploy
5. [ ] Fast-forward `main` to `49d9ece` (`git push origin 49d9ece:main`; it is a fast-forward of `d00b592`, no merge commit). Render starts the deploy automatically.
6. [ ] Render shows the deploy for `49d9ece` as **live**; logs show `store: postgres, … keys, lease epoch N` and the old instance fenced with nothing dirty.

## Health checks (right after)
7. [ ] `GET /healthz` → `{"ok":true}`.
8. [ ] Open `/` on a phone in a private tab → new welcome screen. Tap Sign In → sign in with a real PIN → lobby with the tournament tab.
9. [ ] On a phone already signed in → it reconnects to the lobby without asking for the PIN.
10. [ ] Open an invite link in a private tab → "Private invitation" → Accept → the join form appears (don't submit unless a real person is joining).
11. [ ] `https://gta-poker.onrender.com/og.png` opens the share image. Paste the site link into a WhatsApp chat with yourself → the preview shows the image and "Blindrise — Where Connections Rise." (a link already shared before may show WhatsApp's old cached preview).
12. [ ] Render logs: no errors in the first few minutes.

## Rollback (any check fails)
- Render → gta-poker → Deploys → `d00b592` deploy (`dep-db9bto942hec73cir180`) → **Rollback**. About 1 minute, same reconnect behaviour, no data change.
- Then reset `main` back with `git revert 49d9ece` (push), so the next auto-deploy does not bring it back.
