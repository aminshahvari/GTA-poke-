# Release evidence: 4423a07 to production (18 Oct 2026)

Production release of `4423a074e946c31b4aeccb7b4a0f4baa8c70fcdc` (branch `r2-integration`) to `gta-poker` (Render service srv-db81l3eq1p3s7397u4s0). Recorded by Claude from the release thread, the Render API and the owner's own messages. Times are UTC (EDT = UTC-4).

## Candidate
- 4423a07 = 958e7c0 (landscape layout rounds 1-2, gameplay-UI fixes: whole pot, no stale action pill, one action per turn) + the iPhone rotation re-layout fix (`public/app.js` settleTurn) + a t_stability late-size turn test.
- Server diff vs live 5c7ee11: the invitedBy privacy filter only. `5c7ee11` is an ancestor of 4423a07 (fast-forward).
- Tests on 4423a07 (Claude, 21:15): npm exit 0; t_stability 220/0; t_table_layout 2304/0; t_positions 356/0; t_hotfix 42/0 (46 counted on the r2-hotfix test branch); t_premium_ui 296/0; t_clubs_closed 25/0; t_mobile_ux, t_table_small, t_welcome pass. Chromium only; no WebKit/Safari.

## Gates
| Gate | Evidence | Time |
|---|---|---|
| Owner iPhone acceptance of the preview build | Owner on the preview (blindrise-preview, deploy dep-dbajg5rm8hqs73bg6ek0 serving 4423a07): "Ok", then "همه چی عالی بود" ("everything was great"). Owner-reported; no device logs. 958e7c0 had FAILED on rotation at 21:01 and is not approved. | 21:26:27 |
| Muse PASS on the exact SHA | Issue #3 comment 6255560651; `MUSE-VERDICT-integration-4423a07-2026-10-18.md`. Muse verified the preview serves 4423a07 (app.js SHA-256 c056b1cb…). | 21:48 |
| Idle production | Owner: "No game running" (21:46:28) and "Owner confirmed no gaming" (21:47:00). Claude: Render app logs for gta-poker empty 17:00–21:46 and again 21:30–21:53:56. Empty logs alone are weak evidence; the owner's confirmation is the primary one. | 21:46–21:54 |
| Fresh backup | Render → gta-poker-db (dpg-db81kuom7kps73cmh9dg-a, plan 0.1c-256mb) → Recovery → Create export. Owner screenshots: started 17:50 EDT (in progress), then **Completed, created 18 Oct 2026 17:51 EDT, `.dir.tar.gz` available**. Render's page shows no size; size was not recorded. Earlier exports on the page: 17 Oct 18:40 and 17 Oct 00:41 EDT. | 21:51–21:53 |
| Rollback ready | Previous live deploy dep-dba1ktbrjlhs73c6fdig (5c7ee11) — Render rollback; no data step (client changes + a read filter only). | — |
| Owner GO naming the SHA | Owner: "Go 4423a07". | 21:53:51 |

## Deploy
- Pre-push checks: origin/main = 5c7ee11; `git merge-base --is-ancestor 5c7ee11 4423a07` true.
- `git push origin 4423a074e946c31b4aeccb7b4a0f4baa8c70fcdc:main` → `5c7ee11..4423a07`.
- Render deploy dep-dbak01ivcj2c73ab5kmg: build 21:54:14, live 21:54:46.
- Boot log: `store: postgres, 1814 keys, lease epoch 2`; `fair deal: drand beacon ok`. Old instance: `lease lost: epoch 2 held by …, ours was 1`; `final save skipped or incomplete {"mode":"postgres","epoch":1,"leaseLost":true,"dirty":0,"lastWriteError":null}` — expected fencing hand-over, nothing unsaved (dirty 0).
- No app log lines 21:54:48–21:56:37 (no errors).
- Owner smoke test on production: "همه چی عالی" ("everything great"), 21:56:31.
- Muse later verified production serves 4423a07 (issue #3 comment 6259894528: app.js SHA-256 c056b1cb…, /healthz ok, epoch 2, dirty 0). The 22:00 EDT tournament ran on this build.

## Not in this release
Gameplay options (rabbit hunt etc.), club switching, the Celestia campaign, the Rewards Shop: off or absent. The owner asked about adding rabbit hunt at 00:06 UTC; Claude advised against it (unaudited server/fairness change before the tournament) and the owner agreed ("Ok Thanks").
