# Celestia remediation: consent fails closed, staging flag, production baseline merged (NOT deployed, OFF)

Claude, 2026-10-19. Ordered by the owner's 19 Oct directive:
- "Make Celestia consent fail closed and resolve the staging flag behavior."
- "Prepare both branches for safe integration with the latest approved production baseline, without merging or deploying."

The branch is `celestia-fix`, cut from `celestia-campaign` `0de4a98` (Muse verdict commit). Production `origin/main` `4423a07` is merged into it; nothing is merged into `main`.

The pilot stays OFF. Nothing was deployed. Nothing was printed or distributed, and there was no outreach. No venue data was added beyond what the branch already had, and no Render, production or real data was used.

## Muse's findings (`MUSE-VERDICT-celestia-9edd938-2026-10-19.md`) and what was done

| # | Finding | Severity | Status |
|---|---|---|---|
| D1 | Base is `8eee0a5`, not production; merging would drop the table redesign, the Round-2 gameplay UI and the rotation fix | MAJOR | **Fixed.** `origin/main` `4423a07` merged in (see Integration). A Muse delta re-audit on the new SHA is still required |
| D5 | Consent screen is client-enforced; if `campaignInfo` fails, the client falls back to the ordinary join | blocker for launch | **Fixed**, on the server and in the client |
| D2 | `STAGING=1` also enables campaigns | must fix or accept | **Fixed.** On only with `CAMPAIGNS=1` exactly |
| D3 | `/v/` rate limit bypassed when `FAST=1` | noted | **Fixed.** The bypass is removed |
| D4 | `visits` counts scans of a mapped path even after its link died | noted | **Not changed**: needs an owner decision (see Remaining) |
| D6 | The owner report includes a per-joiner roster (names and opted-in emails), broader than "aggregate counts" | noted | **Not changed**: needs an owner decision (see Remaining) |

## Changes (file:line at the head of `celestia-fix`)

### Consent fails closed: server, authoritative
- **`server/index.js:218-221`**: the notice version `CAMPAIGN_CONSENT_V = 1` and a per-process random key.
  - The token is `c1.` + HMAC-SHA256(key, `<code>|<version>`), in base64url.
  - It is checked with `timingSafeEqual` and refused unless it is a string of at most 100 characters.
- **`server/index.js:151-154`** (`campaignInfo`): only an **open** campaign link's welcome page receives the `consent` token.
  - A closed link's page receives only `{ campaign: true, open: false }`: no token, source, venue or notice.
  - No welcome view is counted for a closed link. Previously its source, venue and notice were returned too.
- **`server/index.js:73, 85-87`** (`redeem`): a campaign join must send back the token for **this link and this notice version**.
  - The check runs after the agreement box and before the email, the per-connection limit, `createUser` and every write.
  - Missing, null, empty, non-string, malformed, forged, another link's, another version's, truncated, padded, oversized or pre-restart tokens are refused with "Please read the welcome page for this invitation and tick its box again before joining."
  - Nothing is stored: no account, no name, no `contact:` record, no use of the link, and nothing in any report or payload.
- A server restart issues a new key, so a join begun before a restart is sent back to the welcome page. This is deliberate: it fails closed, and the joiner re-reads and re-ticks.
- Ordinary invites need no token and are unchanged. An email sent with an ordinary invite is ignored and never stored (tested).

### Consent fails closed: client
- **`public/app.js:62-71`** (`campaignLookup`): an invite link shows the ordinary "Accept invitation" only on a definite answer.
  - The definite answers are `404 {"error":"Not found"}` (campaigns off) or `{campaign:false}`.
  - A campaign answer with a token, or a closed campaign, shows the campaign page.
  - **Anything else** shows `campaignUnavailable()`: a network error, a 5xx, an unreadable answer, or an open campaign with no token.
- **`public/app.js:73-83`** (`campaignUnavailable`): "This invitation could not be opened", with Try again and Sign in. There is no join form.
- **`public/app.js:148`**: the join sends `consent: campaign.consent`.
- **`public/app.js:157`**: if the server refuses consent, the joiner goes back to the welcome and consent page with the box unticked.

### Staging flag (D2)
- **`server/index.js:200-203`**: `campaignsOn = () => process.env.CAMPAIGNS === '1'`.
  - `STAGING=1` keeps its other effects (seeding, the production-database guard, the clubs default) but no longer switches campaigns on.
  - Staging tests campaigns only if `CAMPAIGNS=1` is also set there.

### Rate limit (D3)
- **`server/index.js:255`**: `vLimited` returns `a.length > 60` with no `FAST` exception.
  - No suite needs the bypass. `t_campaign` already ran with `FAST=''`, and the UI suites make fewer than 60 scans.

### Docs
- `docs/release/CELESTIA-CAMPAIGN-handoff.md` item 6 now says `CAMPAIGNS=1` only, and points here.

## Flag behaviour (proven by `test/t_campaign_consent.js`)

| `CAMPAIGNS` | `STAGING` | Campaigns | `/api/campaignInfo` | `/api/campaign` (signed out) | `/v/celestia` |
|---|---|---|---|---|---|
| unset | unset | **OFF** | 404 `Not found` | 404 | 404 (unknown path) |
| unset | `1` | **OFF** | 404 | 404 | 404 |
| `true` | unset | **OFF** | 404 | 404 | 404 |
| `yes` | unset | **OFF** | 404 | 404 | 404 |
| `0` | unset | **OFF** | 404 | 404 | 404 |
| `" 1"` | unset | **OFF** | 404 | 404 | 404 |
| `1` | unset | **ON** | 200 | 400 (owner only) | 200 neutral page (unmapped) |
| `1` | `1` | **ON** | 200 | 400 | 200 neutral page |

With `STAGING=1` alone on data that already holds a campaign link:
- `/api/campaign`, `/api/vmap` and `/api/campaignInfo` answer exactly like an unknown endpoint;
- the stored link cannot be redeemed;
- the owner payload carries no `campaigns`.

Production sets neither flag, so it is OFF.

## Consent behaviour

| Join request to an open campaign link | Result | Stored or shared |
|---|---|---|
| No `consent` / `null` / `""` / number / `true` / object / array | 400, welcome-page message | nothing |
| Malformed, forged MAC, truncated, padded, case-changed, over 100 characters | 400 | nothing |
| Another campaign link's token | 400 | nothing |
| Token with another notice version (`c2.`) | 400 | nothing |
| Token issued before a server restart | 400 | nothing |
| Valid token, agreement box not ticked | 400 | nothing |
| Valid token and box, email without its box | 400 (existing) | nothing |
| Valid token and box (email optional, with its own box) | account created | user, `campaign` tag; `contact:` only with the email box |
| Closed (full, expired, cancelled) link | generic refusal; its page gets no token | nothing |

## Integration with production `4423a07`
- The merge commit is `7cd7f46` (`Merge production baseline origin/main 4423a07 into celestia-fix`).
- The only conflict was at the tail of `public/style.css`. Production's landscape-table block (`#game.land …`, `#game.h700 .helper .h-have`) is kept **verbatim and first**, and the campaign CSS (`#auth .camp-*`, `.consent-list`, `.camp-st`, `#lobby .camp-row`) follows it, at `public/style.css:1801-1814`.
- These are the files where the branch now differs from `origin/main` (`git diff origin/main --stat`):
  - **code:** `server/index.js`, `public/app.js` and `public/style.css` (14 added lines of campaign CSS);
  - **tests:** `package.json` (test chain) and the campaign tests;
  - **assets and docs:** the Celestia assets and docs.
- **Not one production line of `public/style.css` is removed or changed.**
  - The 19 `-` lines in the `app.js` and `index.js` diff are all lines the campaign code extends (redeem, auth form, director HTML, the invite filters, hello).
  - None of them touches the table or mobile code.
- **Production's mobile table fixes:**
  - `t_positions`, `t_table_layout`, `t_table_small` and `t_stability` all come from production and pass on this branch (counts below).
  - That includes the late-Safari rotation relayout from `4423a07`.
- **The `invitedBy` privacy filter** is at `server/index.js:411` and is byte-identical to production's `server/index.js:286`:
  `members: isOwner(u) ? members : members.map(m => m.invitedBy ? { ...m, invitedBy: null } : m),`
  It is checked by `t_invite_privacy` (7/0) and by `t_campaign` and `t_campaign_consent`.
- **Off parity against production:** `BASELINE=<checkout of 4423a07> node test/t_campaign_off.js` gave **21 checks passed**.
  - With campaigns off, the club views of owner and member are identical to production on the same data.
  - The `/v/celestia`, `/join/…` and `/` statuses are the same.
  - `/api/campaignInfo` answers the same.

## Tests (Claude's runs on the `celestia-fix` head, Chromium only; WebKit is not available here)

| Suite | Result |
|---|---|
| `npm test` (full chain, now including `t_campaign_consent`) | **exit 0** |
| `test/t_campaign_consent.js` (new, in `npm test`) | **53 checks** passed |
| `test/t_campaign.js` | **128 checks** passed (was 126) |
| `test/t_campaign_off.js` | **14 checks** passed (was 13) |
| `test/t_campaign_off.js` with `BASELINE` = production `4423a07` | **21 checks** passed |
| `test/t_invite_privacy.js` | 7 ok / 0 failed |
| `test/ui/t_celestia_ui.js` | **33 ok / 0 failed** (was 29) |
| `test/ui/t_stability.js` | 220 ok / 0 failed |
| `test/ui/t_positions.js` | 356 ok / 0 failed |
| `test/ui/t_hotfix.js` | 46 ok / 0 failed |
| `test/ui/t_premium_ui.js` | 296 ok / 0 failed |
| `test/ui/t_clubs_closed.js` | 25 ok / 0 failed |
| `test/ui/t_mobile_ux.js` | 75 ok, passed |
| `test/ui/t_welcome.js` | 32 ok, passed |
| `test/ui/t_table_small.js` | 20 ok, passed |
| `test/ui/t_table_layout.js` | 2304 ok / 0 failed |

The UI suites ran with `PLAYWRIGHT=/opt/node-tools/node_modules/playwright-core`, `NODE_PATH=/opt/node-tools/node_modules`, `CHROMIUM=/opt/pw-browsers/chromium` and `FONTS_DIR=…/r2-mobile-local/harness/fontcache`.

**New tests:**
- **`t_campaign_consent` (53 checks).**
  - Each of 15 bad consent values is refused with the welcome-page message.
  - A valid token without the agreement box is refused.
  - A closed link's page gets only `{campaign, open}`.
  - The owner report shows 0 joined, 0 emails and no members, the member list holds none of the attempts, a member payload carries none of it, and no account exists.
  - On disk there is no user record, no reserved name, no `contact:` key, no `@example.com` anywhere, and the link has no uses.
  - After a restart, the old token is refused, a new one is issued and the join works, and exactly one contact record exists.
  - An ordinary invite ignores an email.
  - `STAGING=1` alone is OFF on existing campaign data.
  - The 8 flag combinations in the table above are checked.
- **`t_campaign`:**
  - its join helper now sends the welcome page's token, fetched once per link so the view counts stay exact;
  - +1 check: a join without a token is refused;
  - +1 check: the token is versioned and does not carry the code;
  - the exact key list of `campaignInfo` now includes `consent`.
  - No assertion was removed or loosened.
- **`t_campaign_off`:** +1 check: a token issued while campaigns were on cannot redeem once they are off.
- **`t_celestia_ui`:**
  - +4 checks: a network failure and a 500 on `campaignInfo` both show no join form and no "Accept invitation";
  - Try again then shows the consent page;
  - a refused token returns the joiner to the consent page with the box unticked.

## Remaining blockers and not fixed (and why)
1. **Muse delta re-audit on the `celestia-fix` SHA.** D1's remedy requires it, and this build is not cleared until Muse PASSes the exact SHA.
2. **D4 (`visits` after a link dies): not changed.** Whether a scan of a dead path is a "visit" is a measurement definition for the owner. The count holds no personal data. Options:
   - count only redirected scans;
   - or split the count into live and dead scans.
3. **D6 (per-joiner roster in the owner report): not changed.** Removing names or emails would change what the owner approved (owner-only email contact). It is owner-only and absent from member payloads. Owner decision needed:
   - keep the roster and amend the scope wording;
   - or reduce the report to counts and give emails a separate export.
4. **Consent records.** The server now proves the welcome page's token was presented, but it does not store which notice version a joiner accepted. The email consent is stored. If counsel wants a per-member record of the notice version, that is a small addition, deliberately not made without an owner or counsel ask.
5. **Launch gates unchanged** (from the campaign handoff):
   - Celestia's written approval;
   - counsel review;
   - Muse PASS;
   - owner iPhone acceptance;
   - backup and rollback;
   - a verified idle window;
   - explicit owner GO for `CAMPAIGNS=1`;
   - a printed-proof phone scan.
   The QR still targets a `/v/` path that does not exist on production, which is correct only while the card stays an unprinted DRAFT.
6. **WebKit/iPhone**: not run here, only Chromium.

## Rollback
This is unchanged: unset `CAMPAIGNS`, or deploy the previous release. Campaign keys are additive. The consent key is in memory only, so it has nothing to migrate.
