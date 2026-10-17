# Welcome UI — production release record (closed)

- **Deployed:** `49d9ecebb88884b9296f8c934f34d762dc637a26` to `gta-poker` (main fast-forwarded from `d00b592`), Render deploy `dep-db9sr9e1egvs73d4qgh0`, live 2026-10-17 19:34:28 UTC (15:34 EDT). No Release 2 code.
- **Gates:** Muse CONDITIONAL PASS (`82e1d00`); owner GO + owner confirmation that no game was running (19:33 UTC).
- **Render health:** build successful; `store: postgres, 1322 keys`; server listening; drand beacon ok; no error logs after live.
- **Owner acceptance (19:40 UTC):** tested on a real iPhone — welcome experience and sign-in work. Accepted; no further design changes requested.
- **Not separately confirmed:** invitation-link flow on production and the WhatsApp link preview / `og.png` (checked only in Chromium before deploy).
- **Rollback (still available):** Render rollback to `dep-db9bto942hec73cir180` (`d00b592`), then `git revert 49d9ece` on main.
