# Invitation links today, privacy, and venue-specific QR attribution

All behaviour below was checked by reading the code, at live `5c7ee11` unless a branch is named. Line numbers refer to `server/index.js`. **Nothing here is implemented by this document.**

## 1. Today's behaviour (live)

**Codes:**
- A code is `crypto.randomBytes(9).toString('base64url')`: 12 characters, 72 random bits (`:143`).
- The URL is `/join/<code>` (`:208`, `public/app.js:61`).

**Kinds of link:**

| Kind | Who makes it | Uses | Expiry | Notes |
|---|---|---|---|---|
| Personal | Owner | 1 | none | `{code, createdAt, by}`, then `usedBy`, `usedAt` |
| Owner group | Owner | 100 (`GROUP_MAX`) | 30 days | The open one is **reused**. The owner cannot hold two open group links at once (`:146`) |
| Member link | Any member (owner can switch off: `membersInvite`) | 10 | 7 days | One open link per member, reused (`:135-139`) |

**Redeem** (`redeem`, `:73-90`):
- The new member chooses a name (unique per deployment) and a PIN of 4–8 digits, and confirms 19+ and the rules.
- **No email or phone number is collected.**
- The member record gets `invitedBy = <link creator's user id>` (`:84`).
- The link records the new member's id (`uses[]` or `usedBy`).
- **Auto-join:** if a tournament is registering, or running with late registration open, the new member is signed up for it (`:87`).

**Revoke:**
- The owner can revoke; the link then refuses any further joins (`:433`).
- Expired or full links are refused with a "closed" message.

**What the owner sees:**
- Director lists each open link with "N of M joined" (`:290`).
- Members show "invited by <name>".

**What members see:**
- The member list carries `invitedBy` for everyone (`membersView`, `:271`).
- So **any member can see who invited whom**.

## 2. Privacy implications
- **Minimal data.** No email, phone, location, IP history or device id is stored for members. Login rate limits use IP in memory only; this was inferred from the code and is not persisted to the kv store.
- **Social graph visible.** Who invited whom is visible to all members. In a restaurant pilot, a venue link would show "invited by <owner>" on every venue joiner. That is harmless, but it does reveal the join route.
- **The link is the only gate.** Anyone holding a group link can join until it fills or expires. A printed QR is a public link: anyone who photographs it can join, from anywhere.
- **Auto-join** enrolls venue joiners into the running tournament, which may surprise someone who scanned a table card.

## 3. Is venue-specific attribution supported?

**On live: no.** A link has no label, and the owner can hold only one open group link. "Who joined from Celestia" cannot be separated from other group-link joins.

**On the `public-onboarding` branch (`8b2b1fa`): yes, in effect.** It adds owner-made public "campaign" links:
- an owner-set `source` label (`[a-z0-9-]{2,24}`, e.g. `celestia-oct`);
- a cap of 1–2000 and an expiry of 1 hour to 30 days;
- **no tournament auto-join**;
- a consent page before the name/PIN form (free, no real money, 19+, what members see, use a nickname);
- a per-IP limit of 5 new accounts per hour;
- a Director "Public links" report per source: joined, how many played at least one hand, and names visible to the owner only;
- hiding of "invited by" from campaign joiners;
- additive fields only: `invite.campaign.source` and `user.campaign`.

Muse PASSed it at `8b2b1fa` (`91bfd7f`), but it is built on Shape A `bf24ceb` and must be rebased onto R2 and delta-audited.

## 4. Requirements for venue QR attribution
1. A venue label on the link, counted per venue, with **no new personal data**: no tracking pixels, no third-party analytics, no IP stored at rest.
2. A **QR that outlives a 30-day link.** A printed card cannot change, so either:
   - reprint when the link rotates, or
   - add a stable venue path.
3. A clear consent and expectations page that **claims no membership benefits or restaurant offers** unless the owner approves them in writing.
4. Owner-only creation and revocation. A revoked or full link shows a polite "closed" page, never an error.
5. Abuse limits on a public link: cap, expiry, per-IP rate.
6. Works in iPhone Safari, Android Chrome and in-app browsers (Instagram, WhatsApp).

## 5. Minimal secure design (proposal)

**Step A: rebase `public-onboarding` onto R2.**
- No new feature. Delta audit by Muse.
- This alone gives `source: "celestia"` attribution.

**Step B: optional stable venue path, only if the owner wants a print-once QR.**
- Route: `GET /v/<source>` (for example `/v/celestia`).
- It resolves server-side to the **newest open campaign link with that source**, then redirects (302) to `/join/<code>`.
- If none is open, it shows the "This link has closed" page.

| Aspect | Delta |
|---|---|
| Data model | None. It reuses `invite.campaign.source`. Optionally `settings.venueAliases = {celestia: true}`, which the owner sets to allow a source to be served at `/v/` |
| Migration | **None.** Additive and read-only, and older code ignores it |
| Security | The path reveals only a redirect to a link that is already public. No enumeration: unknown or disallowed sources get the same "closed" page |

**Tests for Step B:**
- the redirect targets the newest open link;
- after revoke, `/v/` shows "closed";
- an unknown source shows "closed", identical to the revoked case;
- no `Set-Cookie` and no new kv keys are written on a scan;
- a campaign joiner is not auto-joined to a tournament;
- the rate limit applies;
- the existing `t_campaign` suite still passes.

**Muse criteria (proposed):**
- C1: no personal data added (diff of the user record shape);
- C2: public links never auto-join;
- C3: consent page text has no benefit claims;
- C4: "closed" behaviour is identical for unknown, revoked and expired sources;
- C5: per-source counts are correct against a fixture;
- C6: exact-SHA PASS with server and package diffs listed.

## 6. QR generation (for the print assets)
- **Generate with a vetted library**, never an AI-drawn image. Options: python `segno` or `qrcode`, or Node `qrcode`. None is installed in this environment; one must be added on the owner's word (inferred: `segno` is a pure-Python package).
- **Encode the exact HTTPS URL only.** Use error correction **M or Q**, a quiet zone of at least 4 modules, and at least 25 mm printed size for A5 at table distance (inferred guideline). Print it dark on light: gold-on-black QR codes scan unreliably, so the QR sits on an ivory panel.
- **Verification:**
  1. Decode the QR from the final print PDF, rasterised at 300 dpi, with an independent decoder (e.g. `zbarimg`, or a JS decoder such as jsQR). The decoded string must equal the intended URL byte for byte.
  2. Scan the printed proof on an iPhone (camera app) and an Android phone, at about 40 cm and under restaurant lighting.
  3. Complete a join on a **staging or preview** link, never production, for the rehearsal.
