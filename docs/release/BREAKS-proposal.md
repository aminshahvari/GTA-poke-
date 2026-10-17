# Scheduled tournament breaks — what exists, what is missing, minimal proposal

Claude, 2026-10-17. Code read on `rc-2026-10-17`. **No code changed.** Nothing here touches a live tournament.

## What exists today

| Piece | Where | Behaviour |
|---|---|---|
| Server clock | `server/club.js` `tick()` (~185) | every 1 s: when `now >= levelEndsAt`, `level+1` and `levelEndsAt += levelMin`. Server-authoritative; clients only display `levelEndsAt` / `pausedLeft` |
| Director Pause / Resume | `club.js` `pause()` / `unpause()` (~190), Director tab buttons | pause stores `pausedLeft`; the clock stops; **no new hand starts** (`waitUnpaused()` before each hand, ~230/294); a hand already running continues but action timers are held (`deadline += 250` while paused, ~242). Resume sets `levelEndsAt = now + pausedLeft` |
| Restart / deploy recovery | `saveLive()` / `resume()` (~150-170) | the time left in the level (or `pausedLeft`) is saved with the stacks; on boot the level gets that time back; a paused tournament stays paused |
| Notices | `hooks.onNotice('open' / 'start' / 'soon')` | push + in-app notices exist for tournament open, start and "starting soon" |
| Late registration | `lateOpen()` (~102) | closed while paused or in hand-for-hand |

**Scheduled breaks: not implemented.** There is no break setting, no break state and no break countdown. The only way to stop play today is the Director's manual Pause.

## Minimal proposal (built on the existing Pause machinery)

1. **Settings** (Director, New/Edit tournament): *Break every* Off / 2-12 levels; *Break length* 5 / 10 / 15 / 20 min. Stored on the tournament (`breakEvery`, `breakMin`). Default Off, so existing tournaments are unchanged.
2. **Entering a break** (`tick()`): when a level ends and it is a break level, set `onBreak: true, breakEndsAt: now + breakMin`. The level does **not** advance. As with Pause, no new hand is dealt; hands already in progress finish normally (standard: break starts when the current hand is over).
3. **Leaving a break**: when `now >= breakEndsAt` and the Director has not paused, `onBreak: false`, `level+1`, `levelEndsAt: now + levelMin`, and a "Play resumes: blinds X/Y" notice.
4. **Director Pause during a break** freezes the break countdown (`pausedLeft` covers it); Resume continues the break.
5. **Extension**: Director "+5 min" on the break card, at most 30 extra minutes per break; each extension appended to `breakLog [{at, by, addMin}]` (audit trail, visible in the Director tab).
6. **Display**: lobby, table and clock show "Break · 4:32 · next level 7 blinds 600/1,200". One minute before a break level ends: "Break after this level (5 min)". In-app notice on break start and on resume (push only for players not on the page).
7. **Restart / deploy**: `saveLive()` also stores `breakLeft`; `resume()` restores `breakEndsAt`. Seats and stacks are untouched (the existing snapshot).
8. **Late registration (decision needed)**: today it closes while paused. Proposed: registration stays open during a break that follows a level still inside late registration (common practice: "late reg through level 6" includes the break after level 6), and closes when the next level starts.

## Tests (new `test/t_breaks.js`, server-level with a short level length)

- break starts after N levels; level does not advance during the break; no hand is dealt; a hand in progress finishes
- break ends on time; next level starts with full length; notices sent
- Director pause during a break freezes it; resume continues it
- extension adds time, is capped, and is logged; non-owner cannot extend
- restart mid-break restores the remaining break time; stacks and seats identical
- late registration open/closed at the boundary per the decision above
- Off = identical behaviour to today (existing `t_server.js` run unchanged)

## Risk

**Medium.** It changes the tournament clock and the "may a hand start" check, the core of live play. Mitigations: reuse the audited Pause path rather than a new one; feature Off by default; dedicated tests above + the phase1 restart suite; Muse review before any deploy.

**Recommendation:** do not put this into today's Release 1 freeze. Build it on its own branch after the owner says yes, have Muse audit it, and ship it as a follow-up between games.

## Owner decisions (2026-10-17, for Release 2; nothing implemented in R1)

- Late entrants get exactly the original starting stack and join at the current level (already true in code).
- Director picks the last late-registration level from 1 to 12. Preferred setup: open through the end of level 8, closed at the start of level 9. Existing tournaments and defaults are not changed silently.
- Late registration stays open during a scheduled break while the window has not expired (break after level 6 → open; levels 7-8 → open; level 9 starts → closed), judged by server-side progression.
- Scheduled break and Director pause are separate states, even if they share timing code.
