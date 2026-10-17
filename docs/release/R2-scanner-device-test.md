# R2 · Business Card Scanner — real-device test

Claude, 2026-10-17. The scanner code is the same in R1 and R2, so this pass runs on **staging** (https://gta-poker-staging.onrender.com, test data only, clubs open there). No deploy and no production access is needed. Only a person with real phones can do it; Claude cannot reach real devices.

## Already verified in Chromium (desktop, phone-size window 390x844)
`test/browser/scan_csp.js` on r2-dev, 2026-10-17: synthetic card read in ~2 s with the fast (SIMD) reader and with the older-phone reader (`--no-simd`); all 8 fields filled; 0 CSP violations; 0 third-party requests; 0 page errors; the photo is never uploaded. Not verified: iPhone Safari (WebKit), Android Chrome on a real phone, real camera capture, slow mobile data.

## Test card
Use your own business card, or show `/mnt/project-files/poker-club/reports/r2-scanner/test-card-fake.png` full-screen on a second screen (fake data: Northview Bakery, Sam Taylor, 647-555-0142, sam@northviewbakery.example).

## Steps (each phone)
1. Open staging, sign in as a test player (e.g. `Test Player 01`, PIN `135711`; staging seed, no real data).
2. Business tab, then **Scan your business card**.
3. **Take a photo**: the camera opens (rear camera). Photograph the card.
4. Note the time from shutter to the review form (first scan downloads ~6 MB).
5. On the review form: check each field; tap into a field, type, and check the keyboard does not cover the field or the Save button.
6. Tap **Scan a card again** and use **Choose a photo** (from the photo library) instead.
7. Repeat once on mobile data (Wi-Fi off) if possible.
8. Cancel; do not publish (or publish and then delete, it is staging).

## Results to record
| Phone / OS / browser | Camera opens | First scan time | Second scan time | Fields right (of 8) | Library pick works | Keyboard OK | Errors seen |
|---|---|---|---|---|---|---|---|
| iPhone ___ / iOS ___ / Safari | | | | | | | |
| Android ___ / ___ / Chrome | | | | | | | |
| (optional) iPhone SE / small phone | | | | | | | |

## Pass rule (from the R2 backlog)
Passes on a real iPhone (Safari) and a real Android (Chrome): camera opens, card read in under ~20 s first time, at least 5 of 8 fields right on a clear card, keyboard does not hide the form. If it fails on either and cannot be fixed, the scan buttons are hidden and members type details in.
