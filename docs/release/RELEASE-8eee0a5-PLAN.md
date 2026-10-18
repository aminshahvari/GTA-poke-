# Release plan: stabilization candidate `8eee0a5` (prepared, NOT authorized)

Claude, 2026-10-18 ~15:50 UTC. Ordered by the founder's "Post-audit release preparation" message (15:38 UTC). Nothing here has been executed on production.

**Candidate:** `8eee0a5ef7bd7715ec62f8d422e1be99734accb1`. This is the client-only diff against live `5c7ee11`; the server and package diff is empty. Muse PASS: `MUSE-VERDICT-stabilization-rc-8eee0a5-2026-10-18.md` (`1f61b65` on `r2-hotfix`). The deploy uses **this exact SHA**, not the branch tip, which carries docs and test-only commits.

## 1. Facts checked (Render API, read-only, ~15:45 UTC)
| | Production `gta-poker` | Preview `blindrise-preview` |
|---|---|---|
| Branch | `main` | `preview-premium-ui` |
| Auto-deploy | **yes, on every commit** | yes, on every commit |
| Live commit | `5c7ee11` (`dep-dba1ktbrjlhs73c6fdig`, live since 01:02 UTC Oct 18) | moved to `8eee0a5` at ~15:46 UTC for the founder's iPhone test |
| Health check path | none | none |

`origin/main` = `5c7ee11`, unchanged since the R2 deploy.

## 2. Can Auto-Deploy publish anything unintentionally?
- Production deploys **only** when a commit lands on `main`. Pushes to every other branch (`r2-hotfix`, `invite-privacy`, `table-redesign`, `club-switching`, `celestia-campaign`, `preview-premium-ui`, Muse's `r2-dev`) do not touch production. Preview previews and pull-request previews are off.
- Nothing has written to `main` since `5c7ee11`. Claude pushes to `main` only after a founder GO naming the SHA. Muse never writes to `main`.
- Residual risk: anyone with write access to the repository can push or merge to `main` and it ships immediately. Two optional hardenings exist. Both are founder settings changes, so neither has been made:
  - (a) GitHub branch protection on `main` (require a pull request, block force-push). This needs no Render change.
  - (b) Turn Render Auto-Deploy off and use a manual "Deploy latest commit" on GO. This adds a manual step to every deploy, and a forgotten step leaves `main` ahead of production.
  - **Recommendation: (a).**

## 3. Fresh backup (inside the window, before the merge)
1. Confirm the quiet window (section 5).
2. Render → `gta-poker-db` → Recovery → **Create export**. Wait for **Completed**.
3. **Record:**
   - the export's creation time (UTC);
   - its size;
   - the status "Completed";
   - "downloaded: yes/no".
   Post these four facts in the project before the GO. This closes the G4 gap Muse flagged on R2.
4. If a game starts between the export and the merge, take a new export.

## 4. Deploy and rollback
1. GO message naming `8eee0a5`. Claude re-checks that `origin/main` is still `5c7ee11` and that `8eee0a5` is a fast-forward of it. It is: `5c7ee11` is an ancestor.
2. `git push origin 8eee0a5ef7bd7715ec62f8d422e1be99734accb1:main`. This is a fast-forward with no new commit, so the deployed SHA is the audited SHA.
3. Watch the Render boot. Expect `store: postgres, N keys, lease epoch 2`, with N ≥ 1326, no stack trace and no lease-lost line. Watch logs for 15 minutes.
4. Founder phone smoke (below). Pass means "smoke OK".

**Rollback target: `dep-dba1ktbrjlhs73c6fdig` (`5c7ee11`)**, the build that is live now.
- Muse's verdict names `dep-dba1b6m1egvs73d8ut00` (`5838e14`). That was the target for the R2 deploy and is no longer the right one; flagged to Muse.
- Render → `gta-poker` → Deploys → that deploy → Rollback. Then `git revert` the range on `main`.
- No data step either way: the candidate changes no server code, storage keys or formats.
- Verified: `git diff 5c7ee11 8eee0a5 -- server package.json package-lock.json` is empty. The lease epoch simply increments on each boot, as it did on R2.

## 5. Proposed quiet window
- Any time **at least 45 minutes before** the next scheduled tournament, and **not** while any tournament is registering, running or in late registration, or anyone is seated. The founder confirms this in Director → Tournaments.
- Claude cannot see the schedule from here. **Proposal:** today, 17:00–17:30 Toronto time (21:00–21:30 UTC), if nothing is scheduled before 18:15. Otherwise the next morning, 10:00–10:30 Toronto time.
- The deploy itself takes about 1 minute. Allow 30 minutes for the backup, deploy, log watch and smoke.

## 6. Founder iPhone acceptance (on the preview, before the GO)
Open https://blindrise-preview.onrender.com in Safari on iPhone. It runs `8eee0a5` on test data only. Use the preview's test director account; the details are in the project from the preview setup and are not repeated here.
1. Lounge → "Try a practice table". Play several hands.
2. Mid-hand, scroll or tap near the bottom so Safari's toolbar slides in and out. The felt and seats must not move or resize.
3. Rotate to landscape and back. The table returns exactly as it was.
4. Open table chat, type, close the keyboard. The table does not jump, and the action buttons stay reachable.
5. Director → Members → Create invite link. Names in the invite rows read on one line, including "Unused invite".
6. If you have a home-screen app icon, repeat steps 1–2 there.
Pass means all 6 steps. Report "iPhone OK" or the first failing step.

## 7. After the deploy
Repeat the phone smoke on production with steps 1–4 of section 6 (the practice table runs only on the phone), plus:
- sign in with your real account;
- check that the leaderboard and members are unchanged.
Claude records the result in the release tracker.
