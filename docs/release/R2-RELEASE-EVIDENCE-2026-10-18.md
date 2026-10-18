# R2 release evidence: reconciliation (Claude, 2026-10-18 ~04:30 UTC)

Ordered by the founder's "Post-R2 stabilization directive" (04:04 UTC), Task 3. Purpose: to close the documentary gap Muse flagged (overnight report, headline note and Area 1; stabilization audit `d9836df`, Area 4). Every line below cites a source. Where none exists, the line says **MISSING**. Nothing here is reconstructed.

Sources:
- **(P)** the founder's own messages in the Blindrise project thread, quoted verbatim with their UTC timestamps and project message ids;
- **(R)** the Render API deploy list for `gta-poker` (`srv-db81l3eq1p3s7397u4s0`), read 2026-10-18 ~04:25 UTC;
- **(L)** Render application logs, as read by Claude.

EDT = UTC − 4.

## 1. Deploys on Oct 17–18 (R)
| Deploy | Commit | Started (UTC) | Live/finished (UTC) | Status now |
|---|---|---|---|---|
| `dep-db9sr9e1egvs73d4qgh0` | `49d9ece` welcome | 19:33:57 Oct 17 | 19:34:28 | deactivated |
| `dep-db9vl2142hec73d4pds0` | `bf24ceb` Shape A | 22:45:28 Oct 17 | 22:46:08 | deactivated |
| `dep-dba1b6m1egvs73d8ut00` | `5838e14` felt fix | 00:40:58 Oct 18 | 00:41:28 | deactivated (**rollback target**) |
| `dep-dba1ktbrjlhs73c6fdig` | `5c7ee11587051102355ade13c3376a7a20f6c236` R2 | 01:01:41 Oct 18 | 01:02:19 | **live** |

All four deploys have trigger `new_commit` (auto-deploy from `main`). The deployed R2 code is identical to Muse-passed `e659f09` (verdict `bad2324`). Only docs and evidence differ, and the `#game .felt::before` rule added by the merge was dropped (release-tracker note 8). Muse independently confirmed the byte-identity of the served `app.js`/`style.css` (overnight report, headline).

## 2. Gates for the felt fix `5838e14`
| Gate | Evidence | Status |
|---|---|---|
| Founder GO naming the SHA | (P) `Go 5838e14`, 00:39:24 UTC | **ON RECORD** |
| No game running | (P) 00:39:01 "الان بازی در جریان نیست" (no game is running now); 00:40:45 "کانفرم کردم هیچ گیمی برگزار نمیشه. No gaming running right now." | **ON RECORD** |
| Fresh backup in the window | none. Release-tracker note 7 states no fresh export was taken; the latest export was the 18:40 EDT one | **MISSING** (CSS-only deploy; recorded as such at the time) |
| Muse PASS | `20284ab` | ON RECORD |

## 3. Gates for R2 `5c7ee11`
| Gate | Evidence | Status |
|---|---|---|
| G1 Muse PASS on the exact SHA | PASS on `e659f09` (`bad2324`). Muse did not re-confirm head `5c7ee11` before the deploy. Muse later confirmed after the fact that the deployed files are identical to the audited code (overnight report) | ON RECORD for `e659f09`; **not given pre-deploy for `5c7ee11`** |
| G2 Founder GO naming the SHA | (P) `GO 5c7ee11`, 01:00:57 UTC (message `cmsg_01AX1eQRUzorcVaLF9Fsf55D7N4pNY7jPTXZCRxUDfBCYH`) | **ON RECORD** |
| G3 No game running | (P) `Go no game`, 01:00:28 UTC (`cmsg_01AX1eQRUzorcVaLF9Fsf55D4VsLHvUS9MrDabitWbRGQ4`). (L)/Muse: idle service at boot, store 1326 → 1326 keys, no resume | **ON RECORD** |
| G4 Fresh backup in the window | (P) "بکاپ ok" ("backup ok"), 01:01:18 UTC (`cmsg_01AX1eQRUzorcVaLF9Fsf55DQM1ssafZHzrbKGmobQh6mp`). This is the founder's statement only. No export id, creation time, size or "Completed" status was recorded, and neither Claude nor Muse can see one. Muse's latest export in custody is from before this window | **Founder statement on record; export details MISSING** |
| G5 OWNER_CODE decision | No founder message choosing option A, B or C. The Render record shows no restart after 01:02 UTC, so no rotation happened | **MISSING (no decision); not rotated** |
| G6 No `STAGING` / `CLUBS_DEFAULT` on production | Muse's read-only environment check, 2026-10-17 | ON RECORD (Muse) |
| G7 Rollback target live-capable | (R) `dep-dba1b6m1egvs73d8ut00` (`5838e14`) | ON RECORD |

To close G4: the founder can open Render → `gta-poker-db` → Recovery and give the creation time of the export from about 01:00 UTC (21:00 EDT). If no export from that window is listed, record G4 as not met. Claude cannot see the Recovery list.

## 4. Corrections to the record
1. **The tournament ran on R2, not before it.** Muse's overnight report infers that play "had ended before 8:41 PM". The founder's messages show registrations still arriving after the R2 deploy: (P) 01:24:34 UTC "8 نفر تقریبا جوین شدن" (about 8 people have joined); 01:33:33 UTC, a screenshot of 9 joined; 01:50:55 UTC asking how to see more registrations. The 22:00 EDT tournament therefore ran on `5c7ee11`. Application logs show no errors and no restarts from the R2 boot (01:02 UTC) to at least 03:40 UTC (L). The server does not log tournament events. Standings and chip accounting are **not independently verified**: they need a fresh export compared by Muse, or the founder's check of the in-app results.
2. **The clubs were opened by the founder, per his own message.** (P) 01:55:14 UTC (`cmsg_01AX1eQRUzorcVaLF9Fsf55DUob8jZoS4ZwNaJfXFLYaGq`): "ببین من این قسمت رو باز کردم، یعنی الان همه اون فیچرهایی که تو گذاشتی برای بیزینس ها اینا رو میتونم ببینن، درسته؟" ("I opened this section; so now everyone can see all the features you added for businesses, right?"). Earlier, at 00:47:30 UTC, he asked for the clubs to be taken out of "coming soon" and made live. This is the Director switch, a data setting, not an environment change, so Muse's environment check does not show it. Muse's stabilization audit (Area 5) states the clubs "remain closed … verified by probe". **This conflicts with the founder's statement.** Claude has no production access to check the switch: the app's actions run over WebSocket, so request logs show nothing. **Founder or Muse to confirm the switch's current state.** If it is open, Muse's standing precondition (re-run the content audit on a fresh export) applies now, not at a future opening.
3. **Deploy before Muse's content audit.** The founder accepted this risk at the time (release-tracker notes 10–11).

## 5. Rollback (unchanged)
Render → `gta-poker` → Deploys → `dep-dba1b6m1egvs73d8ut00` (`5838e14`) → Rollback. Then revert on `main`. No data migration either way (rehearsed). This is only needed if a defect appears; none is indicated (Muse: GO to keep running).
