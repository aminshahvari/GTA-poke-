# Muse — Addendum to the table-redesign verdict `1cb2b89`, 2026-10-18

**Correction of the record.** The verdict (`MUSE-VERDICT-table-redesign-1cb2b89-2026-10-18.md`) states "`npm test`: full chain green." That conclusion is correct, but the verdict omitted a step: Muse's **first** `npm test` run on the exact tree exited **1** — the chain stopped at `t_security`, which died before its first assertion with a client-side `ECONNREFUSED` (its server had not finished booting). That run overlapped Muse's parallel screenshot work (load average ~2.9). This is the same fixed-boot-wait harness fragility documented for `t_hotfix` in the stabilization RC verdict: a test-side timing failure, not an assertion failure and not a product defect — this branch's server diff vs production is 0 lines, and `t_security` passed inside today's RC and invite-privacy chains.

**Re-run:** on a quiet machine, `npm test` on the exact `1cb2b89` tree exits **0** — full chain green, zero fetch failures, stress 3,000 tournaments / 0 problems (`tabred-npm2.log` in Muse's workspace).

**Verdict unchanged: PASS on branch**, with the harness recommendation extended: the server-booting suites (`t_security` among them) should poll `/healthz` for readiness, as `t_invite_privacy` already does, instead of relying on fixed sleeps that race real boot time under load.
