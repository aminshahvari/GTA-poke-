# Work that can proceed safely on isolated branches

"Safe" means all of the following:
- branch only;
- no production, configuration or data access;
- default-off or documents;
- reversible by deleting the branch.

Each item still needs a Muse verdict and an owner GO before any release.

## Can proceed now (within existing authorization)
| Work | Branch | Notes |
|---|---|---|
| Viewport stability fix → one SHA with the Lounge hotfix | `mobile-stability` → `r2-hotfix` | In progress. Client only |
| Table redesign for 2–9 players | `table-redesign` | In progress. Client only, engine untouched |
| `t_table_small` harness fix (wait for animations to finish) | `r2-hotfix` or its own branch | Test only |
| Rebase the campaign link onto R2 | new `public-onboarding-r2` | Already Muse PASS on Shape A; needs a delta audit. No new behaviour |
| Desktop layout port onto R2 | new `desktop-ux-r2` | CSS only |
| Feedback Hub port onto R2 | new `r2-feedback-r2` | Muse PASS `fd7c911` on the old base |
| Gameplay options (done, default-off) | `gameplay-options` `e391f8d` | Awaiting Muse |
| Tournament result logging (results and standings to logs or an export file) | new branch | Additive; makes results verifiable without database access |
| Print draft layout (QR placeholder only) | `product-vision` | Documents and assets |
| Multi-club design and migration rehearsal plan | documents | No code |

## Needs an owner decision first
| Work | Why |
|---|---|
| `/v/<source>` stable venue path | New public route; only if a print-once card is wanted |
| Final Celestia print assets and QR | Needs the final URL, Celestia's consent and the copy sign-off |
| Email onboarding / member PIN recovery | Auth change (standing rule: needs the owner's explicit request) |
| Branding config (stage 1) | Changes what members see |
| Any content rule for investment posts | Changes content rules; legal |
| Custom domain on production | Production settings change |
| Tenant keys / shared identity (stages 2–3) | Data migration (separate approval) |
| Any revenue feature | Legal review first |
| Turning on `GAMEPLAY_OPTIONS` anywhere outside staging | Environment change and restart |
