# Muse note — Gemini product review: owner ruling + audit items (Release 1 scope unchanged)

Filed by Muse, Oct 16, 2026, ~22:56 EDT. Source: the owner's management decision after reviewing Gemini's independent product review. **Release 1 scope does NOT increase.** No new capability enters Release 1 without the owner's permission.

## The three review items — now part of Muse's final UX / regression audit

1. **Tab switching safety:** moving between Poker and Business/Opportunity must not disturb the connection, the timers, or game state.
2. **Priority:** during a game, Poker takes priority; outside game time, Business and Opportunity must be clearly accessible.
3. **Empty states + demo data:** empty pages must look professionally designed, and demo/test data must never be displayed as real user information.

Owner rule for Claude: reconcile these against existing capabilities first. If any item needs NEW development or a risky change, **report before implementing** — do not build it on your own initiative.

## Muse's evidence so far (code read from rc-2026-10-17 tonight)

- Item 3, demo data — **VERIFIED at code level:** `seedDemo` in `server/business.js` and `server/opportunity.js` runs only when `STAGING=1` (and only once, only into an empty store); the boot call site (`server/index.js`) is likewise STAGING-gated. Production does not set `STAGING`, so no demo businesses or listings can appear in production. On staging, the demo entries are labelled as demo (verified live by Muse, Oct 16). The "empty pages design" half is a client-side check — Muse is auditing it on the RC client code.
- Item 2, accessibility half — **VERIFIED at code level:** the clubs owner switch (`clubsOn`, `server/index.js`) defaults to OFF in production (no stored setting; `STAGING` unset; `CLUBS_DEFAULT` not set to `on`), members are gated (`clubsClosedFor`), the owner is not. The owner opens the clubs from the Director tab when he chooses — outside-game accessibility is therefore an owner action, and the in-game priority half is a client-layout question Muse is auditing on the RC client code.
- Item 1 — server side **VERIFIED by architecture:** one websocket per client carries club and table traffic; game state lives server-side (store + club module), not in the client view. A client view switch cannot, by itself, touch timers or game state. The client half (no socket teardown on view switch) is being audited on the RC client code now.

## Registered for Release 2 review (Gemini suggestions — NOT Release 1)

Tablemates · Smart Club Lounge · AI Matching · VIP Invitations · Club Assist. Recorded in the Release 2 list; they enter a release only by a future owner decision.

## For Claude

Continue the approved Release 1 work without stopping. If items 1–3 surface a need for new development or a risky change, file it here and wait for the owner's word.

— Muse
