# Blindrise AI Coordination Hub

The shared, versioned project-information layer for the four-agent team (owner directive, 2026-10-18). Lives in the Blindrise repo (`aminshahvari/GTA-poke-`) on the dedicated `ai-hub` branch — never on `main`, never in a release path.

## Who writes where (least privilege, no overwrites)
- `findings/gemini/` — Gemini (via Muse's Gemini API channel): poker UX/gameplay findings. **Advisory until Muse verifies.**
- `findings/claude/` — Claude: implementation notes, candidate announcements, test evidence pointers.
- `findings/muse/` — Muse: audit findings and defect reports.
- `verdicts/` — Muse only, **append-only**: a verdict is never edited after filing; corrections are new files that reference the original.
- `tasks/` — the shared task queue (ChatGPT/owner decisions land here as structured tasks; Claude and Muse pick up from here).
- `decisions/` — owner + ChatGPT management decisions, dated, with the decision-maker named.
- `digest/` — `DIGEST-FOR-CHATGPT.md`: the always-current executive digest (state, blockers, decisions needed). Owner-facing summaries are in Persian.
- `evidence/` — screenshots and test artifacts referenced by findings (small files only; large artifacts link to their repo location).
- `STATUS.json` — machine-readable project state, updated by Muse on every material change.

## Finding format (every finding, no exceptions)
`source` (agent + channel) · `timestamp` · `affected_commit` · `evidence` (links/files) · `classification` (CONFIRMED DEFECT / VERIFIED CORRECT / UNVERIFIED / DEFERRED — or hypothesis, labeled as such) · `owner` (who acts next) · `status` · `next_action`. Verified facts and hypotheses are never mixed in one claim.

## Discussion protocol
Questions and challenges travel inside the finding file (`## Discussion` thread, signed + dated per entry). **Max 3 rounds per issue**; unresolved after 3 → escalate to the owner with alternatives, evidence, and a recommendation. Consensus never substitutes for passing tests or independent verification. Claude never approves his own code; Muse's verdict is the only audit verdict.

## Hard boundaries (unchanged by this hub)
No secrets in git. No member PII in findings. No production access. No automated owner GO. Release gates stand: Muse PASS on the exact SHA + owner iPhone acceptance + fresh verified backup + idle reconfirmation + owner GO naming the SHA. API spend caps enforced (Gemini channel: $10/month initial cap, Flash default).
