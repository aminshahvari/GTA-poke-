# Shape A table polish: green felt + egg/tomato splats (for Muse)

**Branch:** `shape-a-table`. **Exact SHA:** the commit that adds this file (reported in the thread).
**Base:** `5838e14` (felt fix, on top of live production `bf24ceb`). Not R2, not Feedback Hub. No merge or deploy without Muse's verdict and the owner's release GO.

## What changes vs production `bf24ceb`
1. **Green felt** (`5838e14`): one CSS rule draws the preview's green felt inside the navy rail. The cause was that production's single-layer `.felt` was covered by the premium rail rule.
2. **Egg/tomato splats**, ported with minimal changes from R2 `edccaf0` (in R2 RC `c4445ed`):
   - `public/app.js`:
     - `reducedMotion()` and `avatarPx()` are copied verbatim from R2.
     - `flyThrow()` is replaced by R2's version: an egg or tomato flies to the target's avatar centre and then calls `splatOn()`. Other items fly and pop as before.
     - `blobPath()` and `splatOn()` are copied verbatim from R2. The egg's shell cracks, the white and yolk spread, and a drip runs down. The tomato bursts with pulp, seeds and skin. Both scatter drops and wobble the avatar for 320 ms. The splat stays about 1.6 s, fades, and is removed after 2.1 s.
   - `public/style.css`: the 25 `.splatfx` rules and keyframes are copied verbatim from R2, including the `prefers-reduced-motion` block.
   - Unchanged: the same `throw` / `chat` messages, and no server change.
   - Not ported (they belong with R2): the oval table geometry and the pot glide.
3. `test/ui/t_throws.js` (new) and evidence images in `docs/evidence/shape-a/throws/`.

`git diff --stat bf24ceb <SHA> -- server package.json package-lock.json` is empty.

## Tests on the candidate
- `test/ui/t_throws.js` passes all **108 checks, with 0 failures**. It covers 320, 375, 390 and 430, each with motion on and with reduced motion, and checks that:
  - the egg or tomato flies, or does not fly with reduced motion;
  - the splat is centred on the target avatar within 3 px and covers about 1.9× the avatar;
  - Fold, Call and Raise stay on top and tappable during a splat;
  - the splat clears;
  - a rose does not splat.
- `npm test` exits 0.
- `t_welcome` passes.
- `t_premium_ui`: **207 ok / 1 failed**. The one failure is the same pre-existing 320×568 table item as on `bf24ceb`.

## Performance and safety notes
- Effects draw on `#fx`, which has `pointer-events:none`, and add no timers beyond each splat's own two `setTimeout`s.
- One splat per target at a time: a new splat replaces the previous one.
- The game never waits on an animation.
- Reduced motion: no flight and no wobble. The splat appears in place, its CSS animations are reduced to 0.01 s, and there is no fade transition.
