# Minimum viable Celestia × Blindrise pilot (proposal)

**Venue:** Celestia Restaurant & Lounge, 10178 Yonge St, Richmond Hill, Ontario.

**Goal:** customers scan a tabletop card and join Blindrise on their phone, and the owner can see how many joined from Celestia. Nothing is advertised that is not built or approved.

**Shape (owner's Strategy Integration Directive, 05:22 UTC):** a **six-week** invitation pilot with **two non-wagering social events** at Celestia, measured with aggregate counts only (`ROADMAP.md` Stage C4). It comes after stabilization (Stage A) and legal and privacy readiness (Stage B). The event format matches point 5 of the founder's Gemini summary, which is unverified (see `ROADMAP.md`).

## What the pilot is, and is not
- **Is:** an invitation into the existing Blindrise club (free poker tournaments, Learn, and the Exchange if the clubs are open), with joins counted under a "celestia" source.
- **Is not:**
  - a "Celestia club" (per-business clubs do not exist yet, Phase 2);
  - a loyalty programme;
  - any restaurant offer or discount (none approved);
  - anything linked to game results.
- **Copy rules for print:**
  - no "Celestia members get…";
  - no prizes;
  - no "win";
  - no money language.
  - Use the approved lines only: "Your Night. Your People. Your Club." and "Play. Connect. Belong. Grow."

## Options
| | A: an existing owner group link plus a real QR | **B: a campaign link with source `celestia` (recommended)** |
|---|---|---|
| Code change | None | Rebase `public-onboarding` `8b2b1fa` onto R2 (already Muse PASS; delta audit) |
| Attribution | **None.** Joins mix with all other group-link joins | Per-source count, and played at least one hand, in Director |
| Capacity / expiry | 100 people / 30 days; shared with every other use of the group link | Owner-set cap of up to 2000 and up to 30 days, separate from other links |
| Auto-join tournament | Yes. A diner scanning mid-tournament is enrolled | No. The joiner lands in the lobby |
| Consent page | No | Yes: free, no real money, 19+, what members see, use a nickname |
| Abuse limits | Cap and expiry only | Plus 5 new accounts per IP per hour |
| Printed-card lifetime | 30 days | 30 days. A print-once card needs the optional `/v/celestia` path (`INVITES-AND-VENUE-ATTRIBUTION.md` §5, Step B) |

**Recommendation: B.** It is the smallest option that meets the directive's "invite attribution" requirement and avoids surprise enrolment. Most of the work is already built and audited. Muse rules **Option A NO-GO** for the card (`aed6f2c` §3): no consent page, surprise auto-enrolment, no attribution.

## Pilot steps (each one gated)
0. Prerequisites: the combined stabilization RC live (Stage A1), invite-source privacy (`invite-privacy` `06e6e9c`, Stage B2) live or folded into the rebase, clubs switch state and content audit settled (B3), counsel review (B4).
1. Rebase `public-onboarding` onto the current R2 line, re-run `t_campaign`, `t_campaign_ui` and the full suite, then get Muse's delta audit on the exact SHA.
2. Owner decisions (below). If the owner wants a print-once card, add `/v/<source>` with its tests and Muse criteria.
3. Owner GO and deploy in a quiet window with a fresh backup.
4. Owner creates the `celestia` link in Director. Claude generates the QR from the **final URL** with a vetted library, then decodes it from the print PDF (byte-equal check).
5. Print proof: scan on iPhone and Android at the table distance, then do one full join rehearsal on the preview service.
6. Run the pilot for six weeks with two social events (no wagering, no prizes, nothing tied to game results). Review the Director "Public links" report weekly; formal reviews at weeks 3 and 6.

## Pilot metrics (aggregate only)
| Metric | Source | Success threshold |
|---|---|---|
| Sign-ups from `celestia` | Director campaign report | **OWNER DECISION** |
| Attendance at each of the two events | Owner's head count; `celestia` joiners who played at least one hand | **OWNER DECISION** |
| Repeat engagement and 30-day retention | `celestia` joiners active again after 2+ weeks, and within 30 days | **OWNER DECISION** |
| Venue feedback | The owner asks Celestia's management at weeks 3 and 6 | Qualitative |
| QR scans | Not counted unless the owner approves the `/v/` aggregate hit counter | n/a |

No personal data is added for the pilot: no new fields, no tracking scripts, no per-person scan logs.

## Acceptance tests
| # | Test | Pass condition |
|---|---|---|
| P1 | Decode the QR from the print PDF at 300 dpi | The decoded string equals the intended URL exactly |
| P2 | Scan the printed proof with iPhone Camera / Safari and with Android Chrome | Opens the welcome and consent page within 1 tap |
| P3 | Join on a phone from the scan (preview service) | Name + PIN created, landing in the lobby, **not** enrolled in a tournament |
| P4 | Director → Public links | The `celestia` row shows joined +1 and the right cap and expiry |
| P5 | Cancel the link, then scan again | "This link has closed", with an offer to sign in |
| P6 | 6 sign-ups from one connection within an hour | The 6th is refused |
| P7 | The card and brochure text | No benefit, prize, money or "Celestia club" claim. Owner signs off on the final copy |
| P8 | The existing personal, group and member links | Unchanged behaviour (`t_campaign` checks all three), and the regression suite is green |
| P9 | iPhone viewport | The combined stabilization RC (Stage A1) is live first; the owner does the phone smoke test |
| P10 | Member payloads on the pilot build (Muse `aed6f2c` §3) | No `invitedBy` and no join source for any member in a member's payload; the Director's per-source report stays correct (`t_invite_privacy`, `t_campaign`) |
| P11 | Print file record (Muse `aed6f2c` §3) | The founder's copy sign-off and the decoded-URL check are filed with the print file; the destination URL is printed in words under the QR |

## Owner decisions
0. **Success thresholds** for the three counted metrics above (no numbers are proposed by Claude).
1. **Option A or B**: B is recommended.
2. **Print-once card** (stable `/v/celestia`, a small server addition) **or reprint every 30 days**.
3. **The domain printed on the card.** Today it is `gta-poker.onrender.com`. A custom domain is a production settings change and needs its own approval.
4. **Cap and expiry** for the Celestia link.
5. **Celestia's consent** to the use of its name and address on the materials, and any restaurant offer. Offers stay off the card until approved in writing.
6. **Whether Exchange content is open** when the pilot starts. The clubs switch state must be confirmed and the content audit run first.
7. **Adding a QR library** (e.g. `segno`) to the tooling, outside the app.
8. **Legal check:** the legal notes advise an Ontario gaming or contest lawyer review "before you open the club beyond friends" (`docs/ontario-social-club-legal-notes.md`, line 3). A public table card in a restaurant opens the club to the public. Venue promotion is not covered by the notes. Inferred: this needs counsel before printing, especially with prizes in the rewards shop and an alcohol-licensed venue.
9. **The rewards shop and points** (Muse `aed6f2c` §2b): whether the existing shop counts as a game-outcome-linked prize under principle 10. This is an explicit owner decision with counsel, not something the documents infer.

## Print assets
The draft layout is `docs/vision/print/celestia-a5-draft.html`: A5 portrait, black and gold, with a **QR placeholder box** and no real code. The final card must also print the destination in words under the QR (`/v/celestia` if adopted, otherwise the join URL), as the defence against sticker swaps and for guests whose camera fails (Muse `aed6f2c` §2d). Final assets are produced only after decisions 1–5, with the QR generated and verified as in `INVITES-AND-VENUE-ATTRIBUTION.md` §6. Celestia's logo is not used without its permission.
