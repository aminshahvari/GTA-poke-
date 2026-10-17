# Release 2 — staging deploy plan and isolation evidence (for Muse)

Claude, 2026-10-17. Owner decision (Oct 17, 14:08 UTC): staging CONDITIONAL GO, only after Muse confirms staging is isolated from Production and the deploy cannot affect Release 1, production data, secrets or live users. **Nothing has been deployed.**

## The only action
Move the `staging` branch to the exact approved `r2-dev` commit (`git push origin <sha>:staging`). Render service `gta-poker-staging` auto-deploys from `staging`. Nothing else changes: no Render setting, no env var, no database action, no `main` change.

## Isolation evidence (read by Claude from Render, 2026-10-17)
| Check | Staging | Production | Source |
|---|---|---|---|
| Service | `gta-poker-staging` srv-db8qnn6i0phs738m9ajg, branch `staging`, free plan, https://gta-poker-staging.onrender.com | `gta-poker` srv-db81l3eq1p3s7397u4s0, branch `main` | Render get_service |
| Database instance | `gta-poker-staging-db` dpg-db8qnj49v7es73dhrdm0-a (db `gta_poker_staging_db`, user `gta_poker_staging_db_user`, free, expires 2026-11-15) | `gta-poker-db` dpg-db81kuom7kps73cmh9dg-a (db `gta_poker_db`, paid 0.1c-256mb) | Render list_postgres_instances |
| Data actually loaded at boot | `store: postgres, 74 keys, lease epoch 31` (13:15 UTC Oct 17; epochs 27-31 today) | `store: postgres, 944 keys` (no lease epoch: production runs older code) | Render logs |
| Branch push affects production? | No: production deploys only from `main`; `main` is not touched | — | service config |

The two key counts and lease epochs show two different datasets. Claude **cannot read env var values** through its tools, so these remain for Muse (or the owner, in the Render dashboard → gta-poker-staging → Environment) to confirm by name/host only, without copying values anywhere:
1. `DATABASE_URL` host/db name is the staging instance (`gta_poker_staging_db`), not `gta_poker_db`.
2. `OWNER_CODE` on staging differs from production (production's is being rotated under R1 condition 3; staging must not share it).
3. `STAGING=1` is set (test-data seed, clubs open for testing).
4. Push keys (VAPID) are not production's, or push is off (`NO_PUSH=1`), so no notification can reach a real member's phone.
5. No production secret (DB URL, OWNER_CODE) appears in staging env.

## Data and compatibility risk
- Staging data is test-only (74 keys: seeded test director + Test Player 01-12, no real members).
- R2 adds new record shapes (fair records with `live`/`void`), read back compatibly; R1 code ignores them. No migration, no deletion. Rollback = move `staging` back to `a8eef11`.
- Staging runs on the free plan: it sleeps when idle; first load after sleep is slow. Not a risk to production.

## After deploy (owner, real devices)
iPhone (Safari, tab and home-screen) and Android (Chrome): scanner incl. camera permission prompt and denial, 9-player table at the phone's real size (Director → test tournament with the 12 test players), touch controls (fold/call/raise slider, chat, throw), layout. Plan and result table: `R2-scanner-device-test.md`; table checks: `R2-table-small-phones.md`.
