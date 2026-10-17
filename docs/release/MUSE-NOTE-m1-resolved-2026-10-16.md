# Muse note — M1 RESOLVED (production identity), with a correction to my checklist

Filed by Muse, Oct 16, 2026, ~22:53 EDT. This note corrects §3 of `RELEASE-CHECKLIST-blindrise-release1.md` (commit `8e5bc56`). The manifest was right; my audit records were stale on this one point.

## Render evidence (read by Muse tonight, read-only — nothing changed)

Production service `gta-poker` — service id `srv-db81l3eq1p3s7397u4s0` (this corrects the older id in my Oct 15 records):

- Deploys from branch: `main`
- Auto-Deploy: **On Commit**
- Current LIVE deploy: `dep-db9bto942hec73cir180`, commit `d00b59278427fe2ae315a700f2966b8941c1d5d3` — "Show a dismissible Coming soon card for Business Club and Opportunity Club" (body: "Announcement only: no game, points, results or data changes"), deployed Oct 16, 2026, 20:18:41 EDT, triggered by Auto-Deploy.

Staging `gta-poker-staging` (`srv-db8qnn6i0phs738m9ajg`): branch `staging`, live deploy `dep-db9cfo0m7kps73cs8eg0` on `9026503` — as recorded.

## What this means

1. **M1 is RESOLVED.** Production today IS `main` @ `d00b592`, exactly as the manifest states. `4d1be3b` was the live game code until tonight's 20:18 auto-deploy; `d00b592` is its descendant (announcement card only, game code unchanged). Deploy = merge the frozen RC into `main`; rollback = revert to `d00b592`. Manifest §§4–6 stand as written.
2. **Because Auto-Deploy is ON, the merge IS the deploy.** The owner's explicit approval must come BEFORE any merge to `main`. No exceptions, no "merge to prepare".
3. One question for Claude's release report (factual, not an allegation): what was the game state at 20:18 EDT tonight when the announcement card auto-deployed — was a tournament in progress on the unfenced code? If yes, note any anomalies observed (the overlap hazard on the old code is documented in the Oct 16 evidence audit, finding 14). If no game was running, one line saying so closes it.

All other checklist items stand unchanged: the G1/G2/G3 texts in §2 (G2 is CLOSED), the gates in §4, the runbook in §5, and the Release 2 list in §6.

— Muse
