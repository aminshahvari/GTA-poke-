# Muse review request: product vision documents (Claude, 2026-10-18)

The owner's directive of 2026-10-18 ("Official Product Vision & Phased Development Directive"), deliverable 8.

**Branch:** `product-vision`, cut from `strategy-review` `a4ce7ea`, which was cut from live `5c7ee11`. This branch contains **documents only**:
- no code changes;
- `git diff 5c7ee11 -- server public package.json package-lock.json test` is empty.

The exact SHA is the head of this branch at submission (given in the handoff message).

## Files
| # | File | Deliverable |
|---|---|---|
| 1 | `BLINDRISE-PRODUCT-VISION.md` | Vision, recorded from the owner's text |
| 2 | `ROADMAP.md` | Phases, dependencies, milestones, acceptance criteria |
| 3 | `docs/vision/CAPABILITY-INVENTORY.md` | IMPLEMENTED / PARTIAL / PROPOSED / NOT VERIFIED |
| 4 | `docs/vision/CELESTIA-PILOT.md` | Minimum viable pilot, acceptance tests P1–P9, owner decisions |
| 5 | `docs/vision/INVITES-AND-VENUE-ATTRIBUTION.md` | Today's invites, privacy, venue attribution design, QR generation and verification |
| 6 | `docs/vision/MULTI-CLUB-FEASIBILITY.md` | Feasibility and risk, staged path |
| 7 | `docs/vision/SAFE-ISOLATED-WORK.md` | Branch-safe work vs owner decisions |
| — | `docs/vision/print/celestia-a5-draft.html` (+ `.png` preview) | Draft layout with a QR **placeholder**. Not for print |

## What to verify
1. **Every code claim** in files 3 and 5 against `5c7ee11` and `public-onboarding` `8b2b1fa`, especially:
   - there is no email in onboarding;
   - there is no QR code generation in the app;
   - `invitedBy` is visible to all members (`membersView`);
   - the owner cannot hold two open group links (`:146`);
   - every live redeem auto-joins an open tournament;
   - campaign links do not auto-join.
2. **No feature is described as available when it is not**, including on the draft card. The card text must make no benefit, offer, prize or "Celestia club" claim.
3. **The proposed `/v/<source>` design** (file 5 §5): enumeration safety, no personal data added, and criteria C1–C6.
4. **Multi-club risks and staging** (file 6) are complete for isolation (principle 5).
5. **The roadmap's acceptance criteria** are testable, and the gates match the standing release rules.
6. **The vision file** matches the owner's directive text (brand lines verbatim, 10 principles, 5 phases).

## Open owner decisions (collected)
1. Celestia pilot option: A (existing group link) or **B (campaign link on R2), recommended**.
2. A print-once card with a stable `/v/celestia` path, or reprinting every 30 days.
3. The domain printed on the card: currently `gta-poker.onrender.com`; a custom domain is a production settings change.
4. Cap and expiry for the Celestia link.
5. Celestia's consent to use its name; any restaurant offer, in writing.
6. Clubs switch state confirmed, and a content audit on a fresh export, before the pilot.
7. Adding a QR library to the tooling (outside the app).
8. Counsel review before opening the club to the public via a venue (legal notes, line 3).
9. Email onboarding: wanted? It is an auth change.
10. Multi-club: stage 0 (deployment per club) now, and a design document for stages 2–3.
