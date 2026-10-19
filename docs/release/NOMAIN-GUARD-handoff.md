# noMain rollback guard, production line: handoff

Claude, 2026-10-19, on the owner directive "Design and test a safe rollback guard. Preserve strict club privacy and authorization boundaries." Branch `nomain-guard`, cut from `origin/main` `4423a07` (current production). Not merged, not deployed, nothing pushed to `main` or `club-switching`. Companion: section 7 of `docs/release/CLUB-SWITCHING-REMEDIATION-handoff.md` on branch `club-switching-fix` (commit `d00a2de`) (same guard for the flag-off path there).

## 1. Why

Club switching (branch `club-switching-fix`) creates accounts through another club's invite that are **not** main-club members: `{ …, role: 'member', noMain: true, clubs: { <cid>: {…} } }` (`server/index.js:90` on that branch). Production `4423a07` does not know `noMain`, so if a deployment that ever held such accounts is rolled back to this code line, every one of them becomes a full main-club member: listed in every member's roster, can sign in, sit at tables, chat, use the Exchange and rewards (reproduced, section 4). This branch is option 1 of that handoff's section 4: ship the guard to the production line **before** club switching is ever enabled, so any later rollback lands on code that knows `noMain`.

## 2. The change (one file of server code)

`server/store.js:101-115` (was the single `module.exports` line 101):

```js
const hidden = k => { const u = k.startsWith('user:') ? cache.get(k) : k.startsWith('avatar:') ? cache.get('user:' + k.slice(7)) : null; return !!(u && u.noMain); };
const shown = {
  get: k => hidden(k) ? undefined : get(k),
  set: (k, v) => hidden(k) ? v : set(k, v),
  del: k => { if(!hidden(k)) del(k); },
  keys: prefix => keys(prefix).filter(k => !hidden(k))
};
shown.values = prefix => shown.keys(prefix).map(k => cache.get(k));
module.exports = { init, ...shown, flush, freeze, health, onLost: fn => { onLost = fn; } };
```

For this code line a `noMain` account does not exist: `get`/`keys`/`values` never return its `user:` record or its `avatar:` picture, and `set`/`del` on those two keys do nothing, so the stored record is never overwritten (re-enabling club switching finds it intact). Everything else is unchanged: the internal `get/set/del/keys/values`, the cache, file and Postgres persistence, the lease, and every key that is not the `user:`/`avatar:` key of a `noMain` account.

**Why the store and not the call sites.** Every place this code decides main membership reads the account through the store, so one choke point covers all of them, including any added later:

| Decision | Where (this branch) | Effect for a noMain account |
|---|---|---|
| Sign-in by name + PIN | `server/index.js:92` `login` | "Name or PIN is not right." (the same answer as a wrong PIN) |
| Old session token (HTTP + socket hello + every socket message) | `server/index.js:34` `userByToken`, `:388` | treated as signed out; socket gets `auth ok:false` |
| Roster / member view, profile | `server/index.js:266` `membersView`, `:410` `profile` | not listed; profile request answered with nothing |
| Organizer extras | `:149` `invitedCount`, `:296` households / muted ids, `:354` `notice` (push list) | not counted, not listed, not notified |
| Owner actions on a uid | `:402` mute, `:411` avatarClear, `:421` household, `:436` remove | no-op on the account (record byte-identical afterwards) |
| Tables | `server/club.js:111` start, `:416` late join, `:36` names | cannot be seated (and cannot connect to ask) |
| Exchange / Opportunity | `server/business.js:30`, `:99`; `server/opportunity.js:32`, `:71` | 401 "Sign in first." |
| Chat, rewards | socket only | unreachable (socket refused) |
| Picture | `server/players.js:115` `photo` via `/avatar/<uid>` | 404 |
| New account / invite with that name | `server/index.js` `redeem` (`name:` key still set) | "That name is taken." No takeover or recreation of the account. |

Other diffs: `package.json:9` (adds `node test/t_nomain_guard.js` to `npm test`, before `t_csp`), new `test/t_nomain_guard.js`, new `test/t_nomain_parity.js`, this file. No client, engine, rules, business, opportunity or rewards file is touched (`git diff origin/main --stat`).

**Accounts without noMain are byte-identical.** `hidden(k)` is false for every key unless that `user:` record has a truthy `noMain`, and then each wrapper returns exactly what the plain function returns. Production data has no `noMain` account, so on today's data every answer is unchanged. Proven by `test/t_nomain_parity.js` (section 3). Cost: one `startsWith` per key on `keys()`/`values()` and one Map lookup on `user:`/`avatar:` reads.

## 3. Tests (Claude, this worktree; Chromium only, real IBM Plex fonts; no assertion skipped or loosened)

`test/t_nomain_guard.js` (new, in `npm test`). Same file as on `club-switching-fix`. On this branch (no `server/clubs.js`) step 1 writes the data exactly as the club-switching code writes it (a `noMain` account `Bonly` in club B with a live session token and a picture; `clubdef:`, `club:<B>:owner`; Director and Omid also members of B), on top of a real setup (Director, Mina, Omid via invites, Mina's picture). Step 2 restarts the server on that data and checks: Bonly refused by name+PIN (either case), old token refused on socket / Exchange / Opportunity / account / invite, name not reusable by a main invite; Director, Mina and Omid sign in; every roster is `Director,Mina,Omid`; Bonly's id, name and club B's name appear in no main view; invited count is 2; Bonly's profile and picture not served, Mina's are; owner mute/household/remove/avatarClear aimed at Bonly change nothing; a tournament starts with only Mina and Omid seated; chat, Exchange and rewards work for main members; Bonly's stored record is byte-identical afterwards. Step 4 checks the store API directly (reads, key listings, writes and deletes for a noMain account vs a normal one). `ROLLBACK_DIR=<checkout>` runs step 2 on another code line.

| Run | Result |
|---|---|
| `node test/t_nomain_guard.js` | 36 ok, 0 failed |
| Same, `ROLLBACK_DIR=` a worktree of `origin/main` `4423a07` (no guard) | **FAIL** at `rollback line: Bonly cannot sign in with name and PIN` (exit 1): the test catches the unguarded line |
| From `club-switching-fix`, real flag-on data, `ROLLBACK_DIR=` this branch (cross-line rollback) | 41 ok, 0 failed |
| `node test/t_nomain_parity.js` (part 1 of `t_club_parity`, base `4423a074e946`) | 3 ok, 0 failed: 28 answers, every HTTP answer and socket message identical to production, same kinds of keys stored |
| `npm test` (full chain) | exit 0 |
| — `t_rules` | 42 passed, 0 failed |
| — `t_sim 20` | 3000 random tournaments / 30981 hands, problems 0; 20 AI tournaments, problems 0 |
| — `t_server`, `t_chat`, `t_coach`, `t_players`, `t_push`, `t_extra`, `t_security`, `t_bizunit`, `t_business`, `t_opportunity`, `t_content` (414 probes), `t_clubs`, `t_csp` | passed |
| — `t_invite_privacy` | 7 ok, 0 failed |
| — `t_nomain_guard` | 36 ok, 0 failed |
| `test/ui/t_stability.js` | 220 ok, 0 failed |
| `test/ui/t_positions.js` | 351 ok, 0 failed; rerun 356 ok, 0 failed (unguarded `4423a07` in a temp worktree: 356 ok, 0 failed) |
| `test/ui/t_hotfix.js` | 46 ok, 0 failed; rerun 42 ok, 0 failed (unguarded `4423a07`: 42 ok, 0 failed) |
| `test/ui/t_premium_ui.js` | 296 ok, 0 failed |
| `test/ui/t_clubs_closed.js` | 25 ok, 0 failed |
| `test/ui/t_mobile_ux.js` | passed (75 ok lines, exit 0) |
| `test/ui/t_welcome.js` | passed (32 ok lines, exit 0) |

UI env: `PLAYWRIGHT=/opt/node-tools/node_modules/playwright-core NODE_PATH=/opt/node-tools/node_modules CHROMIUM=/opt/pw-browsers/chromium FONTS_DIR=…/r2-mobile-local/harness/fontcache`. The `t_positions` / `t_hotfix` totals vary between runs because some checks run once per element on screen (in `t_hotfix`, one per "Unused invite" row: 8 rows in the first run, 4 in the rerun and in the production run); every run was 0 failed, and the rerun equals production exactly. No client file is changed on this branch.

### The rollback probe (handoff section 4), reproduced

Data made by `club-switching-fix` with `CLUB_SWITCHING=1` (organizer opens club B, a new person joins B only), then each code line started on a copy of it with club switching off (scratch script, not committed):

| Rollback line | Main roster (organizer) | Bonly signs in | Bonly's old token (socket) |
|---|---|---|---|
| `club-switching-fix` 139a7c4 (before the guard), flag off | Bonly,Director | 200, token issued, sees 2 members | accepted, main club |
| production `4423a07` | Bonly,Director | 200, token issued, sees 2 members | accepted, main club |
| `club-switching-fix` + guard, flag off | Director | 400 "Name or PIN is not right." | refused |
| **`nomain-guard`** (4423a07 + guard) | Director | 400 "Name or PIN is not right." | refused |

## 4. What this does not do / open points

- **Not deployed.** Shipping it to production is a separate owner GO. It must ship before club switching is enabled anywhere that might later be rolled back to the production line; until then it changes nothing (no `noMain` data exists in production).
- A `noMain` account that wants to join main after a rollback cannot: its name is taken and it cannot sign in. That is the intended fail-closed behaviour; re-enabling club switching (where main can invite it with `joinClub`/existing name + PIN) is the way in.
- The guard hides `user:` and `avatar:` only. A `noMain` account's `session:`, `push:` and `name:` keys stay stored (needed when club switching returns); none of them is shown by any main view, and a session token resolves to no account. Club B's own data (`club:<id>:*`, `clubdef:*`) stays dormant as before.
- Option 2 of the remediation handoff (one-off cleanup before rollback) is still not written; with this guard it is no longer needed for privacy, only if the owner wants those accounts gone.
- Muse audit of this branch is still needed. Only Chromium was run; WebKit/iPhone Safari not run (no client code changed).
