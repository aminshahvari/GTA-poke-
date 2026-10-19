# Club switching remediation: handoff for Muse

Claude, 2026-10-19, on the owner directive of 19 Oct. Branch `club-switching-fix`, cut from `origin/club-switching` (`1915725`, Muse's verdict commit on top of code `06f8662`). Not merged anywhere, not deployed, nothing pushed to `main` or `club-switching`. Club switching stays **off in production by construction** (`CLUB_SWITCHING=1` or `STAGING=1` only, `server/clubs.js:11`).

The directive's three items for this branch:
1. Fix the partial membership-update data-loss issue and add a regression test (done; section 2).
2. Document the rollback risk for `noMain` accounts (done; section 4).
3. Prepare for safe integration with the approved production baseline, without merging or deploying (done: `origin/main` `4423a07` merged **into** this branch; section 3).

## 1. What Muse found (MUSE-VERDICT-club-switching-06f8662-2026-10-19.md, CONDITIONAL PASS for dev/staging)

| # | Condition | Status on this branch |
|---|---|---|
| 1 | MEDIUM: a scoped `set('user:…')` for a non-main club rebuilt the membership from only the fields in the value passed. `{muted:true}` wiped `role`, `joinedAt`, `invitedBy`. | **Fixed** + regression test (section 2) |
| 2 | Composition: client predates the table redesign; needs `4423a07` + new SHA + Muse delta re-audit | **Merged** `4423a07` into the branch (section 3). Delta re-audit by Muse still needed. |
| 3 | Rollback semantics for `noMain` accounts need an owner decision and a cleanup procedure | **Documented** with a reproduced probe (section 4). **Option 1 guard implemented and tested** on this branch and on the production line (branch `nomain-guard`), section 7. Shipping it is still an owner GO. |
| 4 | `STAGING=1` turns the feature on (`server/clubs.js:11`) | Unchanged; restated in section 6 |
| 5 | Flag-ON whole-chain run is timing-dependent (`t_extra` 700 ms boot sleep, `t_opportunity` 150 ms flush race; both pre-existing, byte-unchanged) | Not changed (section 6). Per-suite results below. |

## 2. The fix (Condition 1)

`server/store.js:130-135`, inside `scoped(cid).set` for `user:` keys in a non-main club:

```js
const m = { ...cur.clubs[cid] };
for(const f of MEM) if(Object.prototype.hasOwnProperty.call(v, f)){ if(v[f] === undefined) delete m[f]; else m[f] = v[f]; }
set(k, { ...cur, clubs: { ...cur.clubs, [cid]: m } });
```

Before: `const m = {}; for(const f of MEM) if(v[f] !== undefined) m[f] = v[f];`, so the stored membership was replaced by only what the value carried.

Now the membership fields the value carries are merged over the stored membership. Semantics:
- A field present in the value overwrites it (including `null`, which is how `household` is cleared at `server/index.js:509`).
- A field present as an own property set to `undefined` removes that one field.
- A field absent from the value is kept. This is the one behavioural difference: before, "spread a get, `delete x.f`, set" removed `f`; now it keeps it. No caller does this (checked: no `delete` of a membership field and no `undefined` membership write anywhere in `server/`). Every current caller spreads a scoped `get` first (`server/index.js:485`, `:509-510`, `:523`), so for them the stored result is byte-identical before and after.
- Unchanged: still only `MEM` fields are stored for the club; identity fields, `noMain` and `clubs` in the value are ignored; a non-member club still throws; the main-club path (`server/store.js:127`) is untouched.

### Regression test: `test/t_club_store.js` (new; added to `npm test` in `package.json:9`, right after `t_club_switching.js`)

Store-level unit test in file mode (temp `DATA_FILE`, deleted afterwards). 16 checks, including Muse's exact probe: `clubs[B] = {role:'owner', joinedAt, invitedBy}`, then `B.set(k, {muted:true})`, then role, joinedAt and invitedBy must survive and `muted` must apply. Also covers: another club's membership and main/identity fields untouched; identity/`noMain`/`clubs` in a club write ignored; clearing by `null` and by explicit `undefined`; spread-get-set round-trips byte-identically; remove keeps role/joinedAt; non-member write refused; main write keeps the `clubs` map.

**Proven to catch the bug:** with the pre-fix `server/store.js` (stashed), `node test/t_club_store.js` exits 1 at `FAIL partial write keeps the club role (owner stays owner)`. With the fix: `16 ok / 0 failed`, exit 0.

## 3. Integration with the production baseline (Condition 2)

- Merge commit `235c95b`: `origin/main` (`4423a074e946`, production) merged **into** `club-switching-fix`. Nothing pushed to `main`.
- One conflict, `public/style.css` (both sides appended at the same spot after `#game.h600 .lvl`). Resolution: main's landscape-table block kept byte-identical and in place; club switching's 8 `.club-*` lines appended after it. `diff` of `public/style.css` against `origin/main` shows only those 8 added lines.
- Everything else merged cleanly. Checks:
  - `git diff origin/main` on non-doc files touches only the club-switching feature files: `package.json`, `public/app.js`, `public/business.js`, `public/style.css`, `server/clubs.js`, `server/index.js`, `server/store.js`, `test/t_club_parity.js`, `test/t_club_switching.js`, `test/t_club_store.js`, `test/ui/t_club_switch_ui.js`.
  - For `public/app.js`, `public/business.js` and `server/index.js`, the changed lines vs `origin/main` are exactly the changed lines of the original feature diff `61411c5..06f8662`. So main's mobile table stability/rotation fixes (`4423a07` and the round-2 layout) are carried unchanged, and club switching is carried unchanged.
  - The invitedBy privacy filter (`server/index.js`, `members: isOwner(u) ? members : members.map(m => m.invitedBy ? { ...m, invitedBy: null } : m)`) is untouched context in that diff.
  - Server engine/fairness/business/opportunity/rewards files are byte-identical to `origin/main`.
- `t_club_parity` (flag-off parity) passes against both the default base `61411c5` and `PARITY_BASE=4423a074e946`: 13 ok / 0 failed each.

## 4. Rollback risk for `noMain` accounts (Condition 3)

**What a `noMain` account is.** An account created through another club's invite (`server/index.js:90`): `{ …, role: 'member', noMain: true, clubs: { <cid>: {...} } }`. It has a real `name:` key and PIN, a top-level `role: 'member'` and no `removed` flag. Only the club-switching code knows to hide it from main: `store.scoped('main')` (`server/store.js:118`) and `clubs.memberships` (`server/clubs.js:53`).

**What happens on rollback.** Reproduced locally with a probe (file mode, temp data): with the feature on, the organizer creates club B and a new person joins B only ("Bonly"). Main roster: `Director`. Then the server is restarted on the same data:

| Rollback form | Main roster | Bonly signs in | Bonly's app |
|---|---|---|---|
| Same code, flag removed (`CLUB_SWITCHING` unset, no `STAGING`) | `Director,Bonly` | 200, token issued | main club, sees 2 members |
| Production code `4423a07` | `Director,Bonly` | 200, token issued | main club, sees 2 members |

So **both** rollback forms turn every B-only account into a full main-club member. Removing the flag is not a safe rollback either: with the flag off, the main context is the plain store, which does not know `noMain`. Under either form such an account:
- appears in the main member list for every main member (name, picture, tier);
- can sign in, sit in main tournaments and tables, chat in main, use main's Exchange and rewards.

Accounts that are in main *and* another club are unaffected (they are main members anyway); their other-club data (`club:<id>:*`, `clubdef:*`, `clubs` field) is ignored by old code and stays dormant. Main-club data is never changed by club switching (proven by `t_club_parity` part 2).

**No impact today:** production has the flag off and no club-switching code, so no `noMain` account exists there. The risk starts only once a second club is used for real on a deployment that might later be rolled back (staging, preview, or a future production activation).

**Owner decision needed before any production activation (or before staging holds people who must not see main).** Options (update: option 1 is now implemented on both code lines, not deployed; see section 7):
1. **Guard in both code lines:** make the flag-off main path and the production line treat `noMain` as not a main member (hide from roster, refuse sign-in to main or sign in to "no club"). Needs a small production patch shipped *before* club switching is ever enabled, so any later rollback lands on code that knows `noMain`.
2. **Cleanup procedure before rollback:** a one-off script, run on a fresh export first, that marks every `noMain` account `removed: true` and frees its `name:` key (or exports and deletes them), then a disclosure to those people. One-way: their accounts are lost if switching is re-enabled.
3. **Accept:** B-only accounts become main members on rollback. Only acceptable if every other club's members are already welcome in main.

Recommendation: option 1 before production activation; option 2 as the documented emergency procedure. Both need the owner's GO.

## 5. Test results (Claude, this worktree, after the fix and merge; Chromium only, real IBM Plex fonts)

UI env: `PLAYWRIGHT=/opt/node-tools/node_modules/playwright-core NODE_PATH=/opt/node-tools/node_modules CHROMIUM=/opt/pw-browsers/chromium FONTS_DIR=…/r2-mobile-local/harness/fontcache`. No assertion was skipped or loosened.

| Test | Result |
|---|---|
| `npm test` (full chain, flag off, now includes `t_club_store`) | exit 0 |
| — `t_rules` | 42 passed, 0 failed |
| — `t_sim 20` | 3000 random tournaments / 30518 hands, problems 0; 20 AI tournaments, problems 0 |
| — `t_server`, `t_chat`, `t_coach`, `t_players`, `t_push`, `t_extra`, `t_security`, `t_bizunit`, `t_business`, `t_opportunity`, `t_content` (414 probes), `t_clubs`, `t_csp` | passed |
| — `t_invite_privacy` | 7 ok, 0 failed |
| — `t_club_switching` | 50 ok, 0 failed (plus 2 standalone repeats, 50/50 each) |
| — `t_club_store` (new) | 16 ok / 0 failed |
| `t_club_parity` (base `61411c5`) | 13 ok, 0 failed |
| `t_club_parity` with `PARITY_BASE=4423a074e946` | 13 ok, 0 failed |
| `CLUB_SWITCHING=1 node test/t_club_store.js` | 16 ok / 0 failed |
| `test/ui/t_stability.js` | 220 ok, 0 failed |
| `test/ui/t_positions.js` | 356 ok, 0 failed |
| `test/ui/t_hotfix.js` | 42 ok, 0 failed |
| `test/ui/t_premium_ui.js` | 296 ok, 0 failed |
| `test/ui/t_clubs_closed.js` | 25 ok, 0 failed |
| `test/ui/t_mobile_ux.js` | passed (75 ok lines, exit 0) |
| `test/ui/t_welcome.js` | passed (32 ok lines, exit 0) |
| `test/ui/t_club_switch_ui.js` (the branch's club-switching UI test) | 19 ok, 0 failed |

A local rollback probe (section 4) was run against this worktree and against a temporary detached worktree of `origin/main`; it is not committed (a scratch script, not a suite).

## 6. Remaining blockers and what was not changed

- **Muse delta re-audit** of this branch's new SHA (Condition 2 asks for it after rebase/merge onto `4423a07`).
- **Owner decision on `noMain` rollback** (section 4). Option 1 is now implemented and tested (section 7); shipping `nomain-guard` to production before club switching is enabled anywhere is a separate owner GO.
- **Production activation** of club switching needs a separate owner GO; this branch stays dev/staging only.
- **`STAGING=1` enables the feature** (`server/clubs.js:11`, Condition 4). Putting this branch on the staging or preview service turns switching on there. Not changed: that is the approved dev+staging scope.
- **Harness timing (Condition 5)** not changed: `t_extra`'s fixed 700 ms boot sleep and `t_opportunity`'s 150 ms flush race are pre-existing and byte-identical to `main`; changing them here would diverge test files from production. Per-suite results above are the evidence form.
- **Main-club partial writes**: the main path of `scoped('main').set` (and the plain store) still replaces the whole account record with the value passed, as production always has. Not a club-switching regression and out of scope; every caller spreads a get first.
- Only Chromium tested; WebKit/iPhone Safari not run.

## 7. noMain rollback guard (option 1), implemented on both code lines

Claude, 2026-10-19, on the owner directive "Design and test a safe rollback guard. Preserve strict club privacy and authorization boundaries." and "Verify the membership-data fix". Not merged, not deployed.

### 7.1 Membership-data fix re-verified (section 2)

Independently, in a temporary detached worktree of the pre-fix merge `235c95b` (no `git stash`) with this branch's `test/t_club_store.js` copied in: `node test/t_club_store.js` exits 1 at `FAIL partial write keeps the club role (owner stays owner)`. On this branch: `16 ok / 0 failed` with the flag off and with `CLUB_SWITCHING=1`. The fix commit `553236b` touches only `package.json`, `server/store.js`, `test/t_club_store.js`.

### 7.2 Design

With the flag off, the main context is the plain store (`server/clubs.js:25`), and every place that decides main membership reads the account through it: sign-in `server/index.js:118`; session tokens for HTTP, socket hello and every socket message `:33-37`, `:459`, `:471`; roster and member view `:321`; profile `:493`; invited count `:196`; owner households / muted ids `:348-350`; push list `:428`; owner mute / avatarClear / household / remove `:485`, `:495`, `:505-511`, `:523`; tables `server/club.js:111` (start), `:416` (late join), `:36`; Exchange `server/business.js:30`, `:99`; Opportunity `server/opportunity.js:32`, `:71`; picture `server/players.js:115`; chat and rewards only through the socket. So the guard sits in the store's exported API, one choke point that also covers future call sites:

- `server/store.js:157-158`: `switching()` = `CLUB_SWITCHING=1 || STAGING=1`, now the single definition; `server/clubs.js:11` is `const ON = store.switching` (same test, same env, still evaluated on each call).
- `server/store.js:160-173`: `hidden(k)` is true only for the `user:` key of an account with a truthy `noMain`, or that account's `avatar:` key, **and only while club switching is off**. The exported `get`/`keys`/`values` skip those keys; `set`/`del` on them do nothing, so the stored record can never be overwritten or unhidden by main code. `server/store.js:175` exports the wrapped functions plus `switching`. `scoped()` keeps using the internal functions, so the flag-on path is untouched.
- `server/clubs.js:51`: `memberships()` with the flag off returns `[]` for a `noMain` account (was `[MAIN]`). Not reached today with the flag off (all callers are flag-on paths) but it is the membership decision itself, so it now agrees.
- `package.json:9`: `node test/t_nomain_guard.js` added after `t_club_store`. New `test/t_nomain_guard.js` (201 lines).

Effect with the flag off (rollback by removing the flag): a `noMain` account cannot sign in ("Name or PIN is not right.", same as a wrong PIN), its old session token is treated as signed out everywhere, it is in no roster, profile, count, push list or table, its picture is 404, owner actions aimed at it do nothing, and a main invite cannot reuse its name. Accounts without `noMain` (main-only, and main + another club) are unaffected. The record, name, picture and sessions stay stored, so re-enabling the flag restores B exactly.

The same guard (without the flag condition, since that line has no club switching) is on branch **`nomain-guard`** (commit `dd84e36`) from `origin/main` `4423a07`: `server/store.js:101-115`, `package.json:9`, `test/t_nomain_guard.js`, `test/t_nomain_parity.js`, `docs/release/NOMAIN-GUARD-handoff.md`. So a rollback to the production line is also safe once that branch ships. Shipping it is a separate owner GO.

### 7.3 Tests

`test/t_nomain_guard.js` (same file on both branches). Here: (1) real flow with `CLUB_SWITCHING=1` (the section 4 probe: organizer opens B, `Bonly` joins B only with a live token and a picture, Omid joins B too); (2) restart with the flag off and 28 checks on sign-in, tokens, rosters, views, profile, picture, owner actions, tables, chat, Exchange, rewards and the stored record; (3) flag back on: Bonly signs in to B and only B, main roster unchanged; (4) store API checks, including flag-on passthrough and `scoped('main')` still hiding the account. `ROLLBACK_DIR=<checkout>` runs step 2 on another code line.

| Run | Result |
|---|---|
| `node test/t_nomain_guard.js` | 43 ok, 0 failed |
| Same test in a worktree of this branch before the guard (`139a7c4`), flag off | **FAIL** at `flag off: Bonly cannot sign in with name and PIN` (exit 1) |
| `ROLLBACK_DIR=` worktree of production `4423a07` | **FAIL** at `rollback line: Bonly cannot sign in with name and PIN` (exit 1) |
| `ROLLBACK_DIR=` branch `nomain-guard` (real flag-on data, production-line rollback) | 41 ok, 0 failed |
| `npm test` (full chain, flag off) | exit 0 (see note) |
| — `t_rules` | 42 passed, 0 failed |
| — `t_sim 20` | 3000 random tournaments / 31070 hands, problems 0; 20 AI tournaments, problems 0 |
| — `t_server`, `t_chat`, `t_coach`, `t_players`, `t_push`, `t_extra`, `t_security`, `t_bizunit`, `t_business`, `t_opportunity`, `t_content` (414 probes), `t_clubs`, `t_csp` | passed |
| — `t_invite_privacy` | 7 ok, 0 failed |
| — `t_club_switching` (flag on) | 50 ok, 0 failed (plus 2 standalone repeats, 50/50 each) |
| — `t_club_store` | 16 ok / 0 failed |
| — `t_nomain_guard` | 43 ok, 0 failed |
| `CLUB_SWITCHING=1 node test/t_club_store.js` | 16 ok / 0 failed |
| `t_club_parity` (base `61411c5`) | 13 ok, 0 failed |
| `t_club_parity` with `PARITY_BASE=4423a074e946` | 13 ok, 0 failed |
| `test/ui/t_stability.js` | 220 ok, 0 failed |
| `test/ui/t_positions.js` | 356 ok, 0 failed |
| `test/ui/t_hotfix.js` | 42 ok, 0 failed |
| `test/ui/t_premium_ui.js` | 296 ok, 0 failed |
| `test/ui/t_clubs_closed.js` | 25 ok, 0 failed |
| `test/ui/t_mobile_ux.js` | passed (75 ok lines, exit 0) |
| `test/ui/t_welcome.js` | passed (32 ok lines, exit 0) |
| `test/ui/t_club_switch_ui.js` | 19 ok, 0 failed |

Note: the first full `npm test` run stopped at `t_security` (`owner set up`, 400 !== 200, right after its fixed 900 ms boot sleep on a random port in 3990-3998). `t_security` passed alone straight after, and the full chain passed on the next run. `t_security` and the server code it exercises are byte-identical to `main` apart from the store guard, which does not touch the setup path (no `noMain` data); this looks like the pre-existing fixed-sleep / port timing class of Condition 5 on a shared machine. Not changed.

### 7.4 The probe, after the guard

Data made by this branch with `CLUB_SWITCHING=1`, then each line started on a copy with club switching off:

| Rollback line | Main roster (organizer) | Bonly signs in | Bonly's old token (socket) |
|---|---|---|---|
| this branch before the guard (`139a7c4`), flag off | Bonly,Director | 200, token issued, sees 2 members | accepted, main club |
| production `4423a07` | Bonly,Director | 200, token issued, sees 2 members | accepted, main club |
| **this branch + guard, flag off** | Director | 400 "Name or PIN is not right." | refused |
| **`nomain-guard`** (4423a07 + guard) | Director | 400 "Name or PIN is not right." | refused |

### 7.5 Still open

- Owner GO to ship `nomain-guard` to production **before** club switching is enabled on any deployment that might roll back to the production line. Until then a rollback to production `4423a07` itself is still unsafe (row 2 above).
- Muse audit of both branches (delta for this one, new for `nomain-guard`).
- `STAGING=1` still enables club switching (Condition 4), now via `server/store.js:158`.
