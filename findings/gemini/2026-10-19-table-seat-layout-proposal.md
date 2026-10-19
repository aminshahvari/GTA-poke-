# Gemini proposal — vertical 6-max seat layout fix (relayed by owner, 2026-10-19)

Provenance: produced by Gemini, relayed verbatim by the owner (Amin) in chat on 2026-10-19 ~17:09 EDT, and **accepted by Claude** — Claude reports the table is fixed per this spec and is completing a few small remaining defects. Filed by Muse for the record so the spec is not lost. Muse's independent measurement (per the Issue #4 correction brief, rules R1–R8) still applies when Claude reports completion. The text below is verbatim as received, including Gemini's closing note to the owner.

---

حق دارید خسته شوید؛ وقتی به مدل‌های هوش مصنوعی در مورد چیدمان دایره‌ای یا بیضی‌شکل در حالت عمودی (Portrait) دستور کلی داده می‌شود، معمولاً زاویه‌ها را به صورت مساوی تقسیم می‌کنند و چون عرض صفحه موبایل کم است، المان‌های پایین روی هم می‌افتند.
چرا کلود این اشتباه را تکرار می‌کند؟
۱. توزیع زاویه‌ای غلط: در یک میز ۶ نفره (6-Max)، کلود صندلی‌های پایین (A و E) را خیلی نزدیک به زاویه صندلی اصلی (Hero در پایین‌ترین نقطه) قرار داده است. به همین خاطر در عرض کمِ موبایل، باکس‌های اطلاعاتی Ana، Test و Eli به هم چسبیده‌اند.
۲. بزرگ بودن بیش از حد کارت‌های بازیکن اصلی (Hero): کارت‌های Q♣ و 3♦ بیش از حد بزرگ هستند و به سمت چپ و راست کشیده شده‌اند و فضای صندلی‌های کناری را اشغال کرده‌اند.
۳. استفاده نکردن از فضای عمودی میز: در اپ‌های استانداردی مثل WSOP یا WPT (در حالت عمودی)، صندلی‌ها به جای تجمع در قوس پایینی، در دیواره‌های چپ و راست به سمت بالا و پایین پخش می‌شوند.
پرامپت آماده و دقیق برای کلود (Claude)
متن انگلیسی زیر را دقیقاً کپی کنید و به همراه همین عکس برای کلود بفرستید (پرامپت به زبان انگلیسی نوشته شده تا کلود دستورات فنی CSS و مختصات را بدون خطا متوجه شود):

> Prompt to copy:
> Look at the attached screenshot. The current poker table seat positioning is broken and cluttered at the bottom. It looks nothing like professional vertical poker apps (such as WPT Global or WSOP/Pokerrrr 2).
> Here is exactly what is wrong right now:
>  * Bottom Crowding / Overlap: Seats A (Ana), Hero (Test), and E (Eli) are completely squished together at the bottom of the oval. Their player pods and the Hero's oversized hole cards are colliding.
>  * Poor Vertical Distribution: There is a massive empty gap between the bottom seats (A/E) and the middle seats (B/D), while the bottom arc is overcrowded.
> I need you to completely refactor the seat positioning and sizing using these exact layout rules for a 6-Max Vertical Table:
>  * Explicit Clock-Face Coordinates (Percentage-based relative to the table container):
>    * Hero (Test - Bottom Center / 6 o'clock): bottom: -6%, left: 50%, transform: translateX(-50%).
>    * Seat A (Ana - Bottom Left / 8 o'clock): Move it UP the left rail! Set it around top: 68%, left: -4%. It must NOT be at the bottom curve next to the Hero.
>    * Seat B (Ben - Top Left / 10 o'clock): Move it higher up the left rail. Set it around top: 28%, left: -4%.
>    * Seat C (Carla - Top Center / 12 o'clock): top: -6%, left: 50%, transform: translateX(-50%).
>    * Seat D (Dev - Top Right / 2 o'clock): Move it higher up the right rail. Set it around top: 28%, right: -4%.
>    * Seat E (Eli - Bottom Right / 4 o'clock): Move it UP the right rail! Set it around top: 68%, right: -4%.
>  * Fix Hero Section & Hole Cards (WPT/WSOP Style):
>    * Scale down the Hero's hole cards (Q♣, 3♦) by about 25-30%.
>    * Overlap the two hole cards slightly and tilt them subtly (e.g., -4deg and 4deg) so they take up much less horizontal width.
>    * Tuck the lower edge of the hole cards slightly behind the Hero's name/stack pod (Test 27,675) so it looks like a compact, unified HUD element.
>  * Fix Community Cards & Dealer Button:
>    * Center the 5 community card slots horizontally inside the green felt (left: 50%, transform: translateX(-50%)). Right now, the D (Dealer) button is pushing the flop cards off-center to the right.
>    * Place the Dealer button (D) dynamically near the active dealer seat's inner border, NOT inline with the community cards.
> Apply these exact layout adjustments right now and give me the updated code.

یک نکته کوچک: اگر کدهای شما با فریم‌ورک خاصی (مثل React، Tailwind یا CSS معمولی) نوشته شده، بعد از کپی کردن این متن، فقط در خط آخر به او بگویید که کدِ کدام فایل را به شما بدهد تا مستقیماً جایگزین کنید.
