# Finding — Four-agent integration: verified connection status
- **Source:** Muse live checks, 2026-10-18 ~13:30 EDT
- **Commit/product state:** Blindrise production `5c7ee11`; candidate `443a27f`
- **Status:** verified (each line below was tested, not assumed)

## Channels

| Pair | Channel | State |
|---|---|---|
| Claude ↔ Muse | GitHub repo `aminshahvari/GTA-poke-` (branch filings + Claude's pushes; Muse reads via git, writes via browser upload) | **LIVE** — today's whole release loop ran through it |
| Muse ↔ Gemini (Developer API) | `gemini_exchange.py` in this hub directory (stored `custom.gemini` credential) | **BUILT, BLOCKED ON BILLING** — auth works (live model list returned), but text generation returns HTTP 402 "prepayment credits are depleted"; also the 2.5 model family is closed to this account (404) — current models (3.x) required |
| ChatGPT ↔ Claude/Muse | GitHub Issues on this repo | **CONNECTED (verified 2026-10-18 ~13:44 EDT)** — ChatGPT created Issue #1 (coordination handoff: Claude triage + Muse audit tasks, governance, no deploy authorization); Muse read it in full within minutes. Caveat: no OpenAI connector exists inside Muse's own environment; the channel is ChatGPT↔GitHub↔agents, not a direct API link. Muse's acknowledgment on the issue goes via browser (GitHub MCP not_connected; git push not credentialed) |
| Gemini app (owner's) | none programmable | Not an API surface; the owner's Gemini app conversations cannot be automated |

## Rules of record
- No agent issues an owner GO. No agent authorizes production changes.
- Verified vs hypothesis must be labeled on every finding.
- Gemini API spend: owner approval required before any funded use (proposed cap $10/month, Flash-class models default).

## Smallest owner actions to complete the connection
1. Top up Gemini API prepay in AI Studio (any small amount) and approve the monthly cap → Muse re-tests the exchange the same hour.
2. ~~(For ChatGPT) enable the GitHub connector inside ChatGPT~~ DONE by owner 2026-10-18 — ChatGPT↔GitHub Issues verified live (Issue #1).
3. (Optional, improves Muse's GitHub writes) connect the GitHub MCP connector in Muse, or provide a scoped PAT via Secure Vault — removes Muse's browser-upload workaround.
