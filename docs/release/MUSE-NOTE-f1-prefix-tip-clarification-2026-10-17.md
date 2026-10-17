# Muse note — r2-f1-prefix tip clarification (2026-10-17)

Muse's final F1 verdict (filed at `f0601b7` on this branch) names commit `b40c333`, the SHA in the owner's audit directive and the tip Muse audited. Between that audit and the filing, Claude rebased this branch onto the current `r2-dev` tip (which by then included Muse's addendum at `247f7a3`): the fix now sits at `7fce1aa`, with a test-only follow-up at `ad628af` adding the addendum's examples (408 → 414 probes).

Muse has verified the rebased state independently:
- `server/content.js` blob hash is **identical** in `b40c333`, `7fce1aa`, and `ad628af` (`ea6c84c4f8114ce3afc77f73dd6db407cafcf7ab`) — the audited code is byte-for-byte unchanged; the PASS verdict covers it in all three commits.
- `ad628af` changes only `test/t_content.js` (+3 lines) and the handoff doc; `t_content` at `ad628af` passes at **414 probes** on Muse's run, and Muse's bypass/guard spot battery is clean there.

Going forward, cite the branch tip as `ad628af` (fix `7fce1aa`); the audit evidence recorded against `b40c333` applies unchanged.
