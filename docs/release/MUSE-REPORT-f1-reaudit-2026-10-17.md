# Blindrise — Release 2 F1 Re-Audit (commit c0daed4)
### Independent verdict by Muse (Marlowe) — 2026-10-17

Candidate: branch `r2-dev`, commit **`c0daed4`** ("R2-F1: catch Persian/Arabic-Indic digits, comma-separated and letter-for-digit phones; allow reference numbers"). Delta vs the previously audited `8919df3` is narrow and as declared: `server/content.js` (+48/−…) and `test/t_content.js` (+19) only, plus docs/evidence. Nothing else moved.
Sources: `docs/release/R2-F1-gaps-muse-oct17.md`, updated `docs/release/R2-AUDIT-HANDOFF.md`. Method: A/B reproduction against BOTH code versions (old = `8919df3` content.js; new = `c0daed4`), my own 50-probe battery, and my own full test runs. Claude's logs were not accepted as evidence.

---

## 1. The three bypasses — REPRODUCED on old code, BLOCKED on new code (PASS)

| Probe | Old (8919df3) | New (c0daed4) |
|---|---|---|
| `۴۱۶-۵۵۵-۰۱۰۰` (Persian digits) | allowed | **phone** |
| `٤١٦ ٥٥٥ ٠١٠٠` (Arabic-Indic) | allowed | **phone** |
| `text me at ۴۱۶ ۸۲۹ ۵۹۵۳` (my own spaced form) | allowed | **phone** |
| `416,829,5953` / `416, 829, 5953` | allowed | **phone** |
| `416-555-O1OO` / `4l6 555 OlOO` / `Call 416 555 OIOO` | allowed | **phone** |

## 2. Stored content is never modified by normalization (PASS)
`digits()` runs only inside `prep()` on the detection copy; `check()` returns the caller's original string. Verified in code and by experiment: `check()` on a legitimate Persian text returned the input **byte-for-byte identical**, and the delta touches no save path (content.js only). Claude's server-side test asserts the same at the API level and is included in my full run below.

## 3. Comma phones vs legitimate numbers (PASS)
Blocked: `1,416,829,5953`, `1,800,555,0100`, a phone embedded in a comma list (`10, 416 555 0100, 12`), piece-wise recheck works. Allowed: `$1,500,000`, `1,250.50`, `12,500,000 budget`, `2,500 sq ft`, dates `17/10/2026` and Persian-calendar `1403/07/26`, postal `M5V 2T6`, and — an improvement — `Sizes 10, 12, 14, 16` (comma form; the space-only form remains a disclosed false positive). `call 140/307/2626` (date-shaped attack) still blocked.

## 4. Letter-for-digit + vocabulary (PASS)
Blocked: `416 555 OIOO`, all §1 forms. Allowed: `Oil change specials`, `OIL and gas`, `I/O boards in stock`, `lol 5 stars`, `Studio O1O Interiors`, `room 1O1, 55 King St`, `Suite 1O0O, 88 Queen`. The adjacency + must-contain-a-digit conditions keep ordinary vocabulary intact.

## 5. Invoice/order (REF) exception — cannot be exploited for NANP phones (PASS)
11/11 attacks still blocked: the cover word does not rescue any number that is NANP-shaped (`4168295953`, `416-829-5953`, `1-416-829-5953`, `555-0100`, plain 7-digit), spaced, dotted, or bracketed — across cover words Order/Ref/Invoice/Model/PO/Tracking. Legitimate references allowed as designed: `Order no. 4471-2290`, `Invoice #20261017-0042`, `Serial 123456789012`, `Ticket 416-555-010`, `Order 1043, 1044, 1045`.

## 6. Suites — run by Muse at c0daed4 (PASS)
`t_content` standalone: **passed** — 261 probes (32 links, 11 emails, 54 social, 51 phones, 113 allowed; server fields and visibility). Full `npm test`: **exit 0** — evaluator 42/42, server, chat, coach, players, push, extra-time, security, business units, business club, opportunity club, content, clubs switch, csp+vendor all passed. (Claude's old-code control — 25 matrix failures on the previous code — is consistent with my own A/B reproduction in §1.)

## 7. Disclosed remaining limitations — evaluated (all accepted, severities mine)
- **False positives** (`SKU 1234567` plain 7-digit; `Rooms 101, 102, 1003` 3-3-4 comma list; space-separated digit lists; a bare long number like `Budget 1500000`; also `Highway 401 400 404` — confirmed all still block): **MINOR.** The block message tells the member to rephrase; moderation can assist. No legitimate *prose* is affected.
- **Other letter look-alikes** (`S→5`, `B→8`, `Z→2` — I confirmed `S55-O1OO` and `B29 5953` pass): **LOW.** Extending the map would start eating real words (the reason O/I/l were chosen is they are rare in vocabulary next to digits).
- **Letters-only groups not adjacent to a digit group** (`OIOO-OIOO-OIOO` passes): **LOW** — no anchor digit anywhere; deep obfuscation, moderation backstop.
- **Structural limits** (digits split by words/emoji, number-words in other languages, phone split across two fields, contact info in images, REF cover for non-NANP layouts like `Order 4471-2290`): **LOW.** These are inherent to per-field text filtering; the club is a known-member community with owner moderation, which is the designed backstop.

## 8. One additional bypass found by Muse (NEW, LOW)
`416•829•5953` — bullet `•` (U+2022) as the separator is **not caught** (the separator class covers space . , - – — / ( ) but not •). Same family as the disclosed residuals; trivial for Claude to add • to the separator class in a future touch. Does not change this verdict; recorded so it is fixed deliberately, not silently.

## 9. VERDICT — PASS (F1 fix, commit c0daed4)
All seven requirements verified independently: the three bypasses reproduced on the old code and blocked on the new; normalization never alters stored text; comma logic separates phones from prices/lists/dates/postal codes/measurements; letter substitutions are caught without breaking ordinary vocabulary; the reference-number exception is fenced against every NANP shape I could construct; the disclosed limitations are as stated and LOW/MINOR.
**Release effect:** F1 is cleared as an R2 item. For the staging step, the audited candidate should move from `8919df3` to **`c0daed4`** (content.js-only delta, re-audited here) so the fix ships with R2. The remaining R2 conditions from my main verdict are unchanged: staging only on the owner's explicit authorization; the real-device pass gates any production discussion; `scripts/content-audit.js` runs on production data before either club opens. Production remains NOT approved; Release 1's parked conditions still stand ahead of it.
