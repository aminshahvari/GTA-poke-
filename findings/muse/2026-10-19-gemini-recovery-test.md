# Gemini API recovery test — 2026-10-19 (Muse, per owner directive)

Owner directive (2026-10-19): Google AI Studio billing restored, prepaid balance CA$24.96; CAD $10/month Gemini budget APPROVED subject to a verified hard spending limit; run ONE minimal connectivity test with the existing `gemini_exchange.py` + the stored `custom.gemini` credential; record the result here; notify Claude via GitHub only if successful; if unsuccessful, report the exact error and stop.

## Test record

- Timestamp: 2026-10-19T14:47:32-04:00 (America/Toronto)
- Command (exactly as directed): `gemini_exchange.py ask --prompt "Reply OK" --max-tokens 5`
- Model: `gemini-2.5-flash` (the script's default)
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- API status: **HTTP 404 Not Found** (urllib.error.HTTPError, exit code 1)
- Model response: none (request rejected before generation)
- **Result: FAIL — model access, not billing.**

## Reading

A depleted-billing failure on this API returns **HTTP 402 Payment Required** — the exact error this account produced on every generation attempt while the prepay balance was empty (verified repeatedly, most recently 2026-10-19 ~01:40 EDT). A 404 on `generateContent` means the named model is not served to this account, consistent with Muse's standing finding: the 2.5 model family is closed to this account while 3.x Flash models are listed as available. The restored balance is therefore NOT contradicted by this result; the test never reached generation.

Per the owner's stop rule, **no second attempt was made.** The Gemini collaboration workflow is **not yet operational**.

## Unblock (one owner decision)

Authorize ONE retest with a 3.x Flash model as the exchange default (one-line default change in `gemini_exchange.py` + the same minimal command). On PASS, Muse updates STATUS.json and notifies Claude on GitHub that the workflow is operational.

## CAD $10/month spending-limit enforcement (verified 2026-10-19)

1. **Prepay balance = hard stop (empirically verified on this account).** When the prepaid balance reaches $0, every API key on the billing account fails with HTTP 402 until topped up. This is a true ceiling — provided **auto-reload stays OFF** (auto-reload would silently refill and destroy the ceiling).
2. **AI Studio per-project Monthly spend cap.** AI Studio's Spend page offers "Monthly spend cap > Edit spend cap" per project; at the cap, service pauses until the next cycle. Google labels it experimental and enforcement can lag ~10 minutes, so a small overrun past the cap is possible. Setting it to CAD $10 is an account-holder action in AI Studio (owner only).
3. **Google Cloud Billing budgets are alerts only** — they never stop usage (the owner's caution was correct).
4. **Tier caps** (e.g. Tier 1: $250/month billing-account cap) also hard-pause service but are far above the approved budget; they are a backstop, not the control.
5. **Muse-side discipline (in force):** no automated or unattended Gemini calls; every call is agent-initiated, token-bounded, and recorded in this hub. The exchange script's docstring already carries the cap rule.

Recommended stack: AI Studio project spend cap = CAD $10 (owner sets) + auto-reload OFF + balance kept modest + the hub logging discipline above.

— Muse (Marlowe), 2026-10-19

## Retest — PASS (owner-authorized, same day)

The owner authorized ONE retest with a 3.x Flash model plus the one-line default change in `gemini_exchange.py`.

- Default model changed: `gemini-2.5-flash` → `gemini-3-flash-preview` (the model family this account's model list actually serves).
- Timestamp: 2026-10-19T15:00:28-04:00 (America/Toronto)
- Command: `gemini_exchange.py ask --prompt "Reply OK" --max-tokens 5`
- API status: HTTP 200, exit code 0
- Model response: `OK`
- **Result: PASS — the Gemini collaboration workflow is OPERATIONAL** under the CAD $10/month budget and the enforcement stack recorded above (prepay hard stop with auto-reload OFF + AI Studio project spend cap set by the owner + no automated/unattended calls; every call logged in this hub).

— Muse (Marlowe), 2026-10-19
