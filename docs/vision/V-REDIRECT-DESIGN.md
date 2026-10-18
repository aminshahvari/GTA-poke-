# Stable venue path `/v/<source>` (e.g. `/v/celestia`): design (NOT built)

Claude, 2026-10-18, on the owner's Strategy Integration Directive, item 5. **Design only.** The campaign link it points to (`public-onboarding` `8b2b1fa`) is still on the old Shape A line and is not on R2 yet. Moving it is roadmap step C1 (about 60 lines of `server/index.js` and 94 lines of `public/app.js` to port into R2's different client, then a Muse delta audit). So `/v/` is built only after C1, on a branch stacked on it. Nothing here claims that a Celestia club exists: `/v/celestia` is a printed shortcut to a Blindrise invitation that counts its joins under the source `celestia`.

## Why
Campaign links expire within 30 days and their codes change when replaced. A printed card must keep working. `/v/celestia` never changes; the owner points it at whichever campaign link is current, from Director.

## Behaviour
1. `GET /v/<slug>`. The slug must match `^[a-z0-9-]{2,24}$`, the same charset as the campaign `source`. Anything else gets the neutral "not active" page (below), never an error dump.
2. Server-side lookup. The mapping key `vpath:<slug>` → `{ code, updatedAt, by }` is set by the owner. If the mapped invite exists, is a campaign link (`inv.campaign`), and is open (`openInvite`), the response is `302 Location: /join/<code>`.
   - The target is built **only** from the stored code: a fixed same-origin path prefix plus a code matching `^[A-Za-z0-9_-]{12}$`.
   - No query or user input is copied into `Location`, so there is no open redirect (Muse C9).
3. Otherwise (no mapping, mapped link revoked, full or expired): a `200` neutral page reading "This invitation is not active right now." with a "Sign in" button for existing members. There is no club or venue claim, no list of other links and no hint whether a mapping exists (uniform for all failure cases).
4. Headers on both outcomes:
   - `Cache-Control: no-store` (Muse C7), because a cached 302 would keep sending guests to a revoked or rotated code;
   - `X-Robots-Tag: noindex`;
   - `Referrer-Policy: no-referrer`;
   - no `Set-Cookie`.
5. No writes on scan by default. The optional hit counter, **only if the owner approves**, increments one integer `vhits:<slug>` per request, with no IP, no timestamp list and no user agent. It is shown in Director next to the campaign report.
6. Rate limit: the same per-IP limiter as the other public surfaces (Muse C8), e.g. 60 requests per IP per minute, after which `429` with the neutral page. Joins stay limited separately by the campaign's 5-new-accounts-per-IP-per-hour rule.

## Director (owner only)
In the campaign list, each active campaign row gets "Use for /v/<source>". Setting it writes `vpath:<source>`. The mapping shows the slug, the current link's status (active / full / expired / cancelled) and, if approved, the hit count. Cancelling or replacing the campaign link does not change the printed URL; the owner re-points the slug. Members never receive `vpath:` data.

## Data model
Additive keys only: `vpath:<slug>` (and optionally `vhits:<slug>`). Existing keys and readers are untouched, so **no migration** is needed. Older code ignores the keys, so a rollback is safe.

## Tests (to write with the build)
| # | Test |
|---|---|
| V1 | A mapped, open campaign link gives 302 to `/join/<code>`, with `Cache-Control: no-store` |
| V2 | Unmapped slug, revoked link, full link and expired link each give 200 with the same neutral page (byte-identical bodies) |
| V3 | Invalid slugs (`..`, `%2F`, uppercase, 25+ chars, unicode) give the neutral page, with no file-system path or server error |
| V4 | A mapping pointing at a non-campaign invite (a group or personal link) is refused at write time and never redirects |
| V5 | `Location` is always `/join/` plus 12 base64url characters; a fuzzed `vpath:` record with a URL or `//host` in `code` is not followed |
| V6 | Only the owner can set or clear a mapping; members and signed-out users get 403/401 |
| V7 | Member payloads contain no `vpath:` or `vhits:` data |
| V8 | Rate limit: the 61st request in a minute from one IP gets 429 |
| V9 | No `Set-Cookie` header on any `/v/` response |
| V10 | Hit counter off (default): no store write on scan. On (owner-approved): exactly +1 per request, no other fields |
| V11 | Re-pointing the slug to a new campaign link takes effect on the next request (proves no-store) |
| V12 | A join through `/v/celestia` is counted under the campaign's `celestia` source in the Director report, and the joiner is not auto-enrolled |

## Muse criteria
C1–C6 in `INVITES-AND-VENUE-ATTRIBUTION.md`, plus Muse's C7 (`no-store`), C8 (rate limited like other public surfaces) and C9 (target from the stored record only, slug charset restricted, no open redirect), from `aed6f2c` §3.

## Owner decisions
1. Adopt `/v/<source>` for a print-once card, or reprint every 30 days.
2. The optional aggregate hit counter: on or off (off by default).
3. The slug: `celestia` is assumed.
