# BC1 Business Club: real-device test checklist

Branch `bc1-business-club` (security closure commit `7e946e3`), on staging https://gta-poker-staging.onrender.com once the coordinator merges it. Fake accounts only: **Test Player 01–12**, PIN `1357` + last digit twice (Test Player 07 → `135777`); Director **Test Director** / `246810`. Use only fake business cards (print the synthetic card or make one up); never scan a real person's card.

> **Status: the business card scanner is NOT verified on real devices.** All scanner evidence so far comes from desktop Chromium (headless) with a synthetic card image. It stays "not verified" until every scanner row below has a Result filled in on at least one iPhone and one Android phone.

**Devices to cover**

| Code | Platform | Browser / mode |
|---|---|---|
| iOS16-S | iPhone, iOS 16.x | Safari |
| iOS17-S | iPhone, iOS 17.x | Safari |
| iOS18-S | iPhone, iOS 18.x | Safari |
| iOS-PWA | iPhone (any of the above) | "Add to Home Screen", opened from the home-screen icon |
| AND-C | Android 12+ | Chrome |
| AND-SI | Android (Samsung) | Samsung Internet |
| AND-LOW | Low-end Android (2–3 GB RAM) | Chrome |

Fill one row per device you try (copy the row if you test the same step on several devices). Result: **Pass** / **Fail** (+ short note or screenshot name).

## 1. Sign-in and Home

| # | Step | Expected result | Result | Device | Tester | Date |
|---|---|---|---|---|---|---|
| 1.1 | Open the staging URL, sign in as Test Player 07 | Lobby opens on Home; Tournament card on top; "Meet the Members" carousel below it | | | | |
| 1.2 | Same in the home-screen app (iOS-PWA) | Opens full screen without the Safari bar; sign-in kept after closing and reopening | | | | |
| 1.3 | Swipe the "Meet the Members" carousel left and right | Smooth sideways scroll that snaps to cards; page does not scroll up/down by accident | | | | |
| 1.4 | Tap one carousel card once | That business's detail page opens (1 tap) | | | | |
| 1.5 | Tap "See all ›" | Business tab opens with the directory | | | | |
| 1.6 | Tap × on "Introduce your business", reload | Prompt stays gone | | | | |

## 2. Directory

| # | Step | Expected result | Result | Device | Tester | Date |
|---|---|---|---|---|---|---|
| 2.1 | Business tab | Member Spotlight, search box, industry chips, New to the Club, business cards | | | | |
| 2.2 | Type "bake" in search | List filters instantly; keyboard does not cover results; no zoom-in jump on focus | | | | |
| 2.3 | Tap an industry chip, then tap it again | List filters, then shows all again | | | | |
| 2.4 | Search for nonsense ("zzzz") | "No match" empty state with a way to clear the search | | | | |
| 2.5 | Open a detail page; tap Website / Email / Call / Instagram (only those shown) | Website opens in a new tab; Email opens the mail app; Call opens the dialer; Instagram opens instagram.com/<handle> | | | | |
| 2.6 | Director only (Test Director): spotlight a business, hide one | Spotlight moves; hidden business disappears for members | | | | |

## 3. My Business (create, edit, hide, delete, logo)

| # | Step | Expected result | Result | Device | Tester | Date |
|---|---|---|---|---|---|---|
| 3.1 | As Test Player 08: Add your business → Type it in; fill the form; Save | Saved as a draft; status "Not listed"; another member cannot see it | | | | |
| 3.2 | Publish to the club (confirm) | Status "Listed"; it appears in the directory and the Home carousel for another member | | | | |
| 3.3 | Edit: change the description and switch Phone to "Show to members"; Save | Changes visible to another member; phone now shown | | | | |
| 3.4 | Hide | Gone from directory and Home for others; still editable by the owner | | | | |
| 3.5 | Logo: pick a photo from the gallery | Preview shows the shrunk logo; after Save it appears on the card and detail page | | | | |
| 3.6 | Logo: take a new photo with the camera | Same as 3.5 | | | | |
| 3.7 | Logo: a very large photo (12+ MP) and a HEIC photo (iPhone) | Shrunk and accepted, or a clear error; no freeze | | | | |
| 3.8 | Delete (confirm) | Profile and logo gone; "Add your business" shown again | | | | |

## 4. Business card scanner (NOT verified on real devices yet)

| # | Step | Expected result | Result | Device | Tester | Date |
|---|---|---|---|---|---|---|
| 4.1 | Scan your business card → **Take a photo**, first time | The browser asks for camera permission (or opens the camera app directly on iOS); no crash | | | | |
| 4.2 | Deny camera permission, then try again | Clear way back: choose a photo or type it in; app keeps working | | | | |
| 4.3 | Take a photo of a fake card (flat, good light) | "Reading your card…" with progress; review form opens with company, name, title, phone, email, website, address filled | | | | |
| 4.4 | **Choose a photo** from the gallery (same fake card) | Same as 4.3 | | | | |
| 4.5 | First scan on **mobile data** (Wi-Fi off), clear site data first | Reader files (about 6 MB) load from the club's own site; note seconds from tapping to the review form: ____ s; no "couldn't start" error | | | | |
| 4.6 | Second scan right after | Much faster (files cached); note seconds: ____ s | | | | |
| 4.7 | Review screen: edit a wrong field, Save | Edited values saved as a draft; contact fields from a scan start hidden ("Show to members" off) | | | | |
| 4.8 | Blurry or dark photo | "We couldn't read that clearly…" with Try again and Type it in; no freeze | | | | |
| 4.9 | Non-English card (e.g. French or Persian text) | Latin-script fields (email, phone, website) still found where present; other text may be wrong but is editable; no crash | | | | |
| 4.10 | Card photographed in landscape vs portrait phone orientation; vertical card layout | Both readable, or a clear "couldn't read" message; rotate-to-fix not expected | | | | |
| 4.11 | Turn on airplane mode, clear site data, try to scan | "The card reader couldn't start. Check your internet connection…" and manual entry still works | | | | |
| 4.12 | Airplane mode after a successful scan (files cached) | Note whether scanning still works offline: ____ | | | | |
| 4.13 | Low-end Android (AND-LOW): scan 3 cards in a row | No tab reload or crash; note seconds per scan: ____ | | | | |
| 4.14 | iPhone: scan while other heavy tabs are open | No "This webpage was reloaded" message; if it happens, note it | | | | |
| 4.15 | Home-screen app (iOS-PWA): take a photo and choose a photo | Camera and gallery both open from the installed app; reading works | | | | |

## 5. Tournament safety

| # | Step | Expected result | Result | Device | Tester | Date |
|---|---|---|---|---|---|---|
| 5.1 | Director starts a tournament with Test Player 07 seated; look at Home on 07's phone | No Business Club sections on Home while seated; table view unchanged; no pop-ups about businesses | | | | |
| 5.2 | After busting out / tournament end | Business sections come back on Home | | | | |

## 6. Accessibility

| # | Step | Expected result | Result | Device | Tester | Date |
|---|---|---|---|---|---|---|
| 6.1 | iOS: Settings → Display → Text Size at largest (and Larger Accessibility Sizes) | Business cards, detail and form readable; no text cut off; buttons still tappable | | | | |
| 6.2 | Android: Font size and Display size at maximum | Same as 6.1 | | | | |
| 6.3 | VoiceOver (iOS): swipe through Home carousel, directory, detail, scanner | Each card read as business name + industry + member; buttons have names; scan progress announced | | | | |
| 6.4 | TalkBack (Android): same as 6.3 | Same as 6.3 | | | | |
| 6.5 | Landscape phone orientation on Home and directory | Layout usable, no horizontal page scroll | | | | |

## Sign-off

| Item | Done | Who | Date |
|---|---|---|---|
| All scanner rows (section 4) have a Result on at least one iPhone and one Android | | | |
| Any Fail has an issue written up | | | |
| Scanner may be called "verified on real devices" | | | |
