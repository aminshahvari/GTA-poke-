# R2 production deploy runbook (prepared, NOT authorized)

Claude, 2026-10-17, on the owner's "Keep execution moving" message (23:32 UTC). It covers the deploy checklist, the backup and quiet window, the phone smoke test, rollback, and the OWNER_CODE decision. Nothing in it has been executed. Every production step below waits for: Muse's PASS on the exact SHA, then the founder's GO naming that SHA and a window.

Facts checked while writing this (2026-10-17 ~23:40 UTC):
- Render `gta-poker` (`srv-db81l3eq1p3s7397u4s0`): branch `main`, **auto-deploy on commit = yes**, so a push or merge to `main` is the deploy. Live deploy `dep-db9vl2142hec73d4pds0` = `bf24ceb`. Health check path is empty, so Render marks a deploy live as soon as the port opens; the smoke test below is the real check.
- Environment variable values are not visible to Claude. Muse recorded production's names as exactly `DATABASE_URL`, `NODE_VERSION`, `OWNER_CODE` (R2 audit report). The owner confirms in the dashboard that there is still no `STAGING` and no `CLUBS_DEFAULT`, because either would change what the clubs switch does.
- Candidate server code and package files: byte-identical to the audited R2 RC `c4445ed` (`git diff --quiet c4445ed <candidate> -- server package.json package-lock.json`).

## 1. Gates (all must be true before step 3)

| # | Gate | Who | Evidence |
|---|---|---|---|
| G1 | Muse PASS on the exact candidate SHA | Muse | verdict file on a branch |
| G2 | Founder GO naming that SHA and the window | Founder | message in the project |
| G3 | No game running, registering or late-registering, and none scheduled within 45 min | Founder | Director tab, Tournaments |
| G4 | Fresh export taken after G3, status Completed, downloaded | Founder or Muse | time and size recorded |
| G5 | OWNER_CODE decision made (section 6) | Founder | message in the project |
| G6 | Production env has no `STAGING` / `CLUBS_DEFAULT` | Founder | dashboard, Environment tab |
| G7 | Rollback target confirmed live: `dep-db9vl2142hec73d4pds0` (`bf24ceb`) | Claude | Render deploy list |

## 2. Quiet window and backup (procedure, not executed)

Quiet window:
1. The Toronto tournament is at 20:00. Valid windows: after tonight's tournament has fully finished (prizes shown, no table open), or any time at least 45 minutes before the next start.
2. In Director, confirm: no tournament "Registering", "Running" or with late registration open; nobody seated at a club table.
3. Why it matters: the first R2 boot takes a lease (epoch fencing). For up to ~90 s the old process (unfenced) and the new one overlap. With no game in play nothing is written during that overlap.

Fresh backup (same window, right before the merge):
1. Render dashboard → `gta-poker-db` → Recovery → Create export.
2. Wait for **Completed**. Record the time and the size. Download it and keep it at least 7 days.
3. The backup is valid only if no game started between the export and the merge. If one did, take a new export.
4. Muse's content audit (post-deploy, pre-club-opening) uses this same export.

## 3. Deploy (only after G1–G7)

1. Claude re-confirms `origin/main` is still `bf24ceb` and the candidate is a fast-forward of it.
2. Fast-forward `main` to the candidate SHA (`git push origin <sha>:main`). No new commit; the deployed SHA equals the audited SHA.
3. Watch Render: build `npm install --omit=dev`, then boot. Expect in logs: the Postgres store loads (key count about 1324 or more, never fewer), the lease epoch line, no stack traces.
4. Confirm the deploy reports `live` with the candidate SHA.
5. Claude watches logs for 15 minutes for errors and restarts.

## 4. Phone smoke test (owner, real phone, about 10 minutes)

Do it on your own iPhone in Safari, then once in the Instagram in-app browser if you have time. Stop at the first failure and say "rollback".

Sign-in and Lounge
1. Open https://gta-poker.onrender.com. The welcome screen shows. Sign In with your name and PIN works.
2. The Lounge shows the crest, the brand line and the five tabs at the bottom.
3. The Poker door opens the poker lobby. As the owner you still see the club doors (the owner is exempt from the switch); the member view is checked in step 6.
4. There is no sideways scrolling on any tab.

Clubs closed
5. Director → the clubs switch reads Closed. Do not open it.
6. On a second phone (or a private Safari tab) signed in as a member: no Exchange tab; Exchange, Bulletin and Scanner read "Opening soon", the label does not cover the titles, and tapping them does nothing.

Poker
7. Leaderboard loads with the same standings as before the deploy.
8. Start "Try a practice table" (it runs only on the phone, nothing is saved): the table shows the green felt inside the navy rail, seats, cards and buttons readable.
9. Throw an egg or tomato at a seat: the splat lands on the avatar and clears.

Invites and accounts
10. Director → Members: existing members are all listed; the count matches before the deploy.
11. Director → Members → Create invite link → Group link: the same group link as before is shown (it survives the deploy). Do not send it anywhere for this test.
12. Sign out and sign back in. Session and PIN still work.

Pass = all 12. Report "smoke OK" in the project; Claude records it.

## 5. Rollback

When: any smoke step fails, a boot error, a crash loop, missing members or standings, or the founder says so.

1. Render dashboard → `gta-poker` → Deploys → `dep-db9vl2142hec73d4pds0` (`bf24ceb`) → Rollback. This puts Shape A back in about a minute. Note: auto-deploy stays on, so the next push to `main` deploys again.
2. Then bring `main` back so code and service agree: `git revert` the fast-forward range on `main` (a new commit, no history rewrite). Resetting `main` to `bf24ceb` needs the founder's word.
3. Data: no migration either way. Rehearsed on one data file: `bf24ceb` → candidate → `bf24ceb` → candidate kept sessions, PIN logins, single invites, the 100-use group link and Business data (`docs/evidence/r2-release/rollback-rehearsal/`). R2-only keys are ignored by `bf24ceb`.
4. Restore from the export only if data is actually damaged, and only on the founder's word. It replaces everything written after the export.
5. Same quiet-window rule applies to the rollback when possible.

## 6. OWNER_CODE rotation: decision note (nothing changed)

What it is: an environment value on the production service. It is the only thing that (a) creates the owner account the first time (`setup`) and (b) resets the owner's PIN if forgotten (`resetOwner`), which also signs out every owner device. It is not used for normal sign-in and members never see it.

Why rotation was a condition: Release 1 audit condition 3 (Muse). The current value has been handled during setup and by several working sessions. Anyone who knows it can reset the owner PIN and take over the Director account. Exposure is limited, not zero.

Protections already in place: comparison is timing-safe. In the candidate, wrong codes lock the caller's address after 5 tries and the whole club after 60 in 10 minutes (live `bf24ceb` has the older, looser limit: 10 per owner account, 30 per address). R2 therefore lowers the guessing risk but not the risk of someone who already knows the code.

Options:
- **A. Rotate in the deploy window (recommended).** The owner sets a new random value in Render → Environment, saved together with the deploy so the service restarts once. Keep the new value only in a password manager. No member impact; owner sessions stay valid. Claude never sees or posts the value.
- **B. Rotate later, in a separate quiet window.** Saving an environment value restarts the service, so it needs its own no-game window.
- **C. Do not rotate.** Accept that people who handled the old value could reset the owner PIN. Muse records it as an accepted risk.

Cost of A or B: one extra restart (zero if combined with the deploy). Risk: if the new value is lost, owner PIN recovery is impossible until it is set again in Render, which the owner can always do.

## 7. Scope check (what is in and out of this candidate)

In: R2 RC `c4445ed`, ux-fonts follow-up `30853e1` (Muse criteria item 2), premium UI `7dabbc3` with Muse's verdict `87dc8fb`, live `bf24ceb` (merged, its client changes superseded), Muse MINOR-1/2 and the in-flow "Opening soon" label (`a1fd5d3`), the closed-clubs test, docs.

Out, verified by `git merge-base --is-ancestor` (none is an ancestor): Feedback Hub `67ed7fc`, campaign link `7a78d7d`, Shape A table polish `754b838` (R2 already has its own splats), felt fix `5838e14` (R2 has the native two-layer felt). Client diff from the audited premium UI `87dc8fb` is limited to `public/style.css` (fixes above) and new tests.

## 8. After the deploy

1. Muse runs the read-only content and privacy audit (`MUSE-PROCEDURE-production-content-privacy-audit-2026-10-17.md`) on the export from G4.
2. Business and Opportunity must both report 0 fields to review, or the founder accepts named exceptions.
3. Opening the clubs is a separate founder GO, with the Director switch. It can be closed again instantly.
