# Celestia campaign: owner decision sheet

Claude, 2026-10-19, on branch `celestia-fix`. **The campaign stays OFF.** Production does not set `CAMPAIGNS=1`, nothing is deployed, printed or distributed, and nothing here is a legal conclusion. Items marked **Counsel** are questions for Ontario counsel to answer, not answers.

Fixed scope (no decision needed, restated so nothing below reopens it):
- **No real money.** Free to join, no buy-in, no betting; chips and points have no cash value.
- **No rewards for invites.** Nobody earns anything for bringing a joiner, and the card makes no offer, discount or prize claim.
- **Investment solicitation stays closed.** The campaign does not touch it and no option below opens it.

Background: `CELESTIA-REMEDIATION-handoff.md` (D4, D6, consent records) and `CELESTIA-CAMPAIGN-handoff.md` (launch checklist).

---

## D4. Do scans of a closed or dead link count as visits?
Today a scan of `/v/celestia` counts as a visit whenever the path is mapped, even if the link behind it is full, expired or cancelled (the scanner sees the neutral page).

| Option | Consequence |
|---|---|
| A. Keep as is (every scan of a mapped path) | Measures card interest after the link dies, but "visits" can exceed what anyone could act on. |
| B. Count only scans that were redirected to an open link | "Visits" means "reached the welcome page"; dead-period scans are invisible. |
| C. Split into two counters: live scans and dead scans | Both numbers are visible; one more integer per source, still no personal data. |

**Recommendation: C.** It loses no information and makes a lapsed 30-day link obvious (dead scans climbing means re-point `/v/celestia`). Small code change plus a test.

## D6. What does the owner report show about each joiner?
Today the Director report lists every campaign joiner's display name and, if they opted in, their email. The approved scope said "aggregate counts".

| Option | Consequence |
|---|---|
| A. Keep the roster (name + opted-in email), amend the scope wording | Owner can follow up per person; the report is broader than "aggregate". |
| B. Counts only in the report; emails in a separate owner-only export | Report matches "aggregate"; emails are pulled only when needed. |
| C. Counts only; no email view at all until an emailing tool exists | Least exposure; opted-in emails are stored but unused. |

**Recommendation: B.** The report becomes aggregate as approved, and the emails people agreed to give stay reachable to the owner only. **Counsel:** does the consent wording ("Blindrise may email me about club events") cover the owner holding a per-person list of names with emails?

## D7. Record which notice version each joiner accepted?
Today the server proves the joiner's browser received the current notice (signed token, version 1) but does not store the version on the member. The email consent wording and time are stored.

| Option | Consequence |
|---|---|
| A. Don't store it | Nothing new kept; if the notice changes, we cannot show who accepted which text. |
| B. Store `{ notice: 1, at }` on the member record (owner-only, never in member payloads) | A per-member record of what was shown; a few bytes; one small change plus a test. |
| C. B plus keep each notice version's exact text in the repo/store | Can reproduce the exact words any member accepted. |

**Recommendation: C**, if counsel wants a consent record (it is cheap and does not reach members). **Counsel:** is a per-member record of the accepted notice version and time expected?

## D8. How long are campaign contact emails kept?
Today `contact:` records are kept until the owner deletes them by hand; there is no button and no expiry.

| Option | Consequence |
|---|---|
| A. Until the member leaves or asks (status quo, plus a delete button) | Simple; depends on the owner acting on requests. |
| B. Fixed period, e.g. 12 months after joining, then deleted automatically | Bounded exposure; contacts lapse even for active members. |
| C. Delete when the member is removed, and also after 12 months of no sign-in | Tied to actual use; needs a small scheduled cleanup. |

**Recommendation: C**, with an owner-side delete button for requests either way. **Counsel:** what retention period and deletion-on-request process is appropriate for an Ontario-based club holding opt-in emails?

## D9. Open launch gates (none done; all required before `CAMPAIGNS=1`)

| Gate | Question for the owner | Status |
|---|---|---|
| G1. Celestia written approval | Has Celestia agreed in writing to cards on site and to being named on the welcome page? | Open |
| G2. Ontario counsel review | Has counsel reviewed the card, the welcome and consent page, D6-D8 above, and the rewards shop question (Muse `aed6f2c` §2b)? | Open |
| G3. Muse PASS on the exact `celestia-fix` SHA | Has Muse re-audited the remediated build? | Open |
| G4. Printed proof scan | Has a printed `FINAL=1` proof been scanned on an iPhone and an Android phone, joined once with a test account, then removed? | Open (needs the deploy below first) |
| G5. Owner GO for `CAMPAIGNS=1` | Will the owner authorize the env change in a no-game window, with a fresh backup and rollback recorded? | Open |

Also outstanding: owner iPhone acceptance (WebKit was not run here).

**Recommendation:** decide D4, D6, D7 and D8 first, so counsel (G2) reviews the final behaviour once, then G1, G3, G5 and finally G4.

## Counsel questions, collected
1. Does the card and welcome and consent page copy raise any issue for a free, no-money, 19+ poker club in Ontario?
2. Does the email consent wording support the owner seeing names with emails (D6)?
3. Should the accepted notice version be recorded per member (D7)?
4. What retention and deletion process fits the opt-in emails (D8)?
5. Does naming the venue on the welcome page need anything beyond Celestia's written approval (G1)?
