# R2 · B6 — owner session revocation and recovery limits

Claude, 2026-10-17, branch `r2-dev`. Requested by the owner ("B6 owner-session revocation and recovery security"). Auth change: needs Muse's audit before any release.

## What was wrong (Muse R1 audit §4.2, phase1 `sessions_owner_reset`)
a) `resetOwner` set a new PIN but every token issued before stayed valid, and open sockets kept working.
b) Wrong setup codes were counted on one shared key (`acct:#owner`, 10 per 10 min) from any address, so a stranger could lock the real owner out of recovery for 10 minutes.

## What changed (`server/index.js`)
- `revokeSessions(uid)`: deletes every `session:*` of that user and closes their open sockets (code 4003). The app reconnects, its old token is refused, and it shows the sign-in screen.
- `resetOwner` calls it after setting the new PIN, then issues one fresh token. Member removal (B7) now uses the same helper (same behaviour as before).
- Every socket message re-checks that the socket's own session still exists (`ws.sess`), so a revoked token cannot keep acting on an already-open socket.
- Setup code compared in constant time (`crypto.timingSafeEqual`).
- Recovery limits (`/api/setup`, `/api/resetOwner`): 5 wrong codes lock **only the address they came from** for 10 min; a club-wide cap of 60 wrong codes per 10 min stops guessing spread over many addresses. The shared `acct:#owner` key is gone. Only "setup code is not right" counts (a bad new PIN does not). The general 30-per-address API limit and the member login limit are unchanged.
- Trade-off for the owner: the club-wide cap means someone using 12+ addresses could still pause recovery for 10 minutes. A long random OWNER_CODE (rotated per the R1 conditions) is the real protection against guessing.

## Evidence
- `test/phase1/t_sessions_owner_reset.js` rewritten to assert the fixed behaviour (EXPECT_FAIL=false): old tokens refused, old PIN refused, pre-reset owner socket closed and gets no broadcasts, 6th wrong code from one address = 429, 12 wrong codes from 12 addresses do not lock out the owner (200), club-wide cap reached at 61, removed member silenced (B7).
- On the frozen R1 code the same test FAILS with all of those issues; on r2-dev it PASSES. Logs: `docs/evidence/r2/b6-phase1.log` (11 pass, 1 expected fail = B5, being fixed separately), `docs/evidence/r2/b6-npm-test.log` (`npm test` exit 0).
- Reproduce: `node test/phase1/t_sessions_owner_reset.js`.

## Not changed / follow-ups
- Member PIN change does not exist yet; when "owner resets a member's PIN" (R2 #12) is built it must call `revokeSessions`.
- The per-name login limit (10 wrong PINs lock that name for 10 min) can still be tripped by a stranger for any member, owner included; the owner can then use the setup code. Left as is; flag for Muse.
