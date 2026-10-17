# Blindrise R2 — Re-Audit Addendum for `6f57c75`: false positives + preceding-number bypass

**Auditor:** Muse / Marlowe — 2026-10-17
**Companion to:** `MUSE-REVIEW-separators-6f57c75-2026-10-17.md` (filed `523a284`) — this addendum covers the two investigation items the owner added after that verdict: the size-list false positives (directive item 7) and the preceding-number bypass reported in Claude's handoff (item 8). All other directive items (1–6, 9) were verified in the main review: commit boundaries (content.js + tests + docs only), the 353 probes reproduced, the control failing on previous code, the full separator matrix, legitimate content, byte-for-byte preservation, and no interaction with Welcome UI, production, or tournament code.

## Verdict: CONDITIONAL PASS

The commit itself passes everything in its scope (verdict in the main review stands). The condition attaches to F1 as a whole, from item 8 below.

## Item 7 — False positives: parity, not regression (Muse's probes)

- `Sizes 10_12_14_16` → REFUSED on `6f57c75`; `Sizes 10-12-14-16` (ASCII dashes) → REFUSED on the previous code `7ab1b4f`. The underscore fold inherits the long-standing dash behavior exactly, as Claude's handoff discloses. `Rooms 101_102_103` likewise refused (dash-group pattern).
- `Sizes 10 12 14 16` (plain spaces) → also REFUSED — and also refused on `7ab1b4f`: pre-existing, untouched by this commit.
- `Sizes: 10, 12, 14, 16` (commas) → ALLOWED on both.
- Assessment: a known LOW false-positive family, in the safe direction (a refusal with an explanatory message; the member rewords with commas). Not a blocker; recorded so it is a decision, not a surprise. If the owner wants size/room lists loosened, that is a separate tuning change with its own risk trade-off (it would reopen dash-group shapes) — Muse does not recommend it.

## Item 8 — Preceding-number bypass: CONFIRMED, pre-existing, comma/bullet forms only

Muse reproduced the handoff's report and mapped its exact shape on `6f57c75`:

- **Bypass works (phone ACCEPTED):** `We tutor grades 6-12. 416,829,5953` · `$1,500. 416,829,5953` · `Order 55. 416,829,5953` · `6-12 416,829,5953` (no period needed) · `Grades 6-12. 416•829•5953` (bullet form).
- **Bypass fails (phone REFUSED):** any word between the numbers (`Ages 6-12. Call 416,829,5953`, `grades 6-12, then 416,829,5953`, `Price $1,500 — call 416,829,5953`); the phone at the start of the text; and the dash, space, and new underscore forms after a preceding number (`416-829-5953`, `416 829 5953`, `416_829_5953` all refused in the same constructions).
- **Mechanism:** with only whitespace/sentence punctuation between a preceding digit run and a comma/bullet-written phone, the run analysis spans both, producing an over-long run that no longer matches the phone shape. The dash-family analysis does not merge this way.
- **Attribution:** present identically on `7ab1b4f` (verified) — it predates the separator fix, was found by Claude's mobile run, and was disclosed in his handoff as out of scope. Claude's handling was correct.
- **Severity:** LOW, same F1 family. It needs a deliberate construction (a number immediately before the phone), and F1 remains a heuristic layer, not a proof. But it is a working leak for comma/bullet-written numbers, the two most natural ways to write a phone in a post.

## Condition

Before Opportunity Club opens, one of:
1. Claude ships the small fix (treat sentence/run boundaries as breaks in the comma-shape analysis) under a new owner GO, with Muse re-audit; or
2. The owner explicitly accepts this bypass as a known LOW residual, on the record.

This condition does not block the R2 code line itself: `6f57c75` remains undeployed (staging `c0daed4`, production untouched), and the standing pre-open `scripts/content-audit.js` run on production data is unchanged.

*No merge or deployment is authorized by this addendum.*
