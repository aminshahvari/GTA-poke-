# Rabbit Hunt + Show Cards: release log and Claude's thread messages (2026-10-19)

Owner request: put every Claude message on GitHub so ChatGPT, Muse and Gemini can read them.
English summary first, then each Claude message in full, in order (Persian, as sent in the project thread).

## Summary (English)
- **Owner P0 (16:31 UTC):** before tonight's game, Rabbit Hunt (reveal remaining board only after the hand is finished; never change results, chips or hand history; synced for all players) and Show Cards (players may voluntarily reveal one or both hole cards after the hand; never reveal folded or hidden cards without consent). Release rule: no production merge or deploy without explicit owner GO.
- **Existing work found:** branch `gameplay-options` `e391f8d` (Muse PASS on branch, `aed6f2c` §2c) already had both features behind the `GAMEPLAY_OPTIONS` server switch; Show Cards was winner-of-uncontested-pot only.
- **Candidate:** branch `claude/rabbit-hunt-show-cards-w5t68a`, code SHA **`49cca50fd8f3a4eb47a300a099a3e66dd8134738`**, base production `4423a07`. `0a7d3e8` = cherry-pick of `e391f8d`; `49cca50` = Show Cards widened to every player dealt in whose cards are still face down (folded included), uncontested winner may also Muck; one card can be followed by the other; nothing can be un-shown. Engine untouched. Handoff: `docs/release/RABBIT-SHOW-handoff.md`; spec: `docs/release/SPEC-show-cards.md`, `SPEC-rabbit-hunt.md`.
- **Tests on `49cca50` (clean checkout, all exit 0):** `npm test`; `t_extras` 28/0; `t_extras_parity 3000`: 31,051 hands, 1,130,434 public views, outcomes and views identical 3000/3000 extras on vs off, 2,764 rabbit hands verified against the seal, 31,784 shows (24,027 by folded players), 0 problems; mutations caught (another player's pick shown: 687 problems; face-up hand allowed to answer: 1,136). `t_extras_ui` 13/0 at 390x844 and 844x390; t_stability 220/0; t_table_layout 2304/0; t_positions 356/0; t_hotfix 42/0; t_premium_ui 296/0; t_clubs_closed 25/0; t_mobile_ux, t_table_small, t_welcome pass.
- **Staging (owner choice, 16:58 UTC):** old `staging` head saved as branch `staging-backup-c4445ed`; `staging` fast-forwarded to `c2dd01e` (docs only above `49cca50`). `gta-poker-staging` deploy `dep-dbb4ojh42hec7385e6v0` live 16:59:56 UTC, clean boot (own test DB, drand ok).
- **Owner iPhone acceptance (owner-reported):** "everthing was perfect", "i check in my iphone and played" (17:14–17:15 UTC).
- **Production:** owner "Go 49cca50" (17:15:28 UTC), "no gaming now go ahead" (17:15:43 UTC). Idle: no production app logs 15:00–17:15 UTC. `main` fast-forwarded `4423a07..c2dd01e`; deploy `dep-dbb50le1egvs73av2e5g` live 17:16:48 UTC. `GAMEPLAY_OPTIONS=1` set on `gta-poker`; deploy `dep-dbb50p1mfruc73ba6rm0` live 17:17:23 UTC. Boots: postgres 2489 keys both times, lease epochs 3 then 4, drand ok, old instances fenced with dirty:0, no errors.
- **Owner turned both options on in Director** for tonight's tournament (owner-reported, 17:20 UTC).
- **Not met before GO (owner accepted):** Muse verdict (Muse is now reviewing); fresh export (last one 2026-10-18 21:51 UTC; this change has no data migration).
- **Rollback:** unset `GAMEPLAY_OPTIONS` (both features off at once) or redeploy `dep-dbak01ivcj2c73ab5kmg` (`4423a07`).
- **Open for Muse:** gameplay integrity, privacy, synchronization, iPhone UX on production `49cca50`.

## Claude's messages in the thread (verbatim)

**16:31 UTC**
> اول بررسی می‌کنم Rabbit Hunt و Show Cards الان در کد چقدر پیاده شده‌اند.

**16:40 UTC (decision card)**
> نسخه‌ی آزمایشی Rabbit Hunt و Show Cards را روی کدام سرور تست بگذارم؟
> کد آماده است (49cca50، روی همان نسخه‌ی production یعنی 4423a07) و تست‌های کامل الان در حال اجراست. preview الان دست thread طراحی میز stadium است. gta-poker-staging دیتابیس و داده‌ی تستی جدا دارد و از ۱۷ اکتبر بیکار است. برای هر دو باید به شاخه‌ای غیر از شاخه‌ی خودم push کنم، و این اجازه‌ی شما را لازم دارد. production دست نمی‌خورد.
> گزینه‌ها: gta-poker-staging (پیشنهادی) / preview / فعلاً هیچ‌کدام

**16:53 UTC**
> هر دو قابلیت آماده‌ی تست هستند: SHA کد **`49cca50`** است، روی شاخه‌ی `claude/rabbit-hunt-show-cards-w5t68a` و روی همان پایه‌ی production یعنی `4423a07`. فقط باید از کارت بالا انتخاب کنید روی کدام سرور تست بگذارم. پیشنهاد من gta-poker-staging است. production دست نخورده است.
>
> **چه چیزی آماده است**
> - **Rabbit Hunt:** اگر دست روی flop یا turn تمام شود، turn و river استفاده‌نشده بعد از پرداخت pot، کم‌رنگ روی میز نشان داده می‌شوند. این کارت‌ها از همان دسته‌کارت مُهرشده‌ی همان دست برداشته می‌شوند و بُر جدیدی زده نمی‌شود. روی نتیجه، chips یا hand history هیچ اثری ندارند. همه‌ی بازیکنان و تماشاچی‌ها همین کارت‌ها را می‌بینند.
> - **Show Cards:** بعد از هر دست، هر بازیکنی که کارت‌هایش هنوز رو نشده، حتی اگر fold کرده باشد، می‌تواند Show left، Show right یا Show both را بزند. برنده‌ی دستی که کسی call نکرده Muck هم دارد. هیچ کارتی بدون اجازه‌ی صاحبش رو نمی‌شود و قبل از تمام شدن دست هم چیزی نشان داده نمی‌شود.
>
> **تست‌ها روی `49cca50`:** همه سبز شدند. `npm test` کامل اجرا شد. در تست fairness، ۳٬۰۰۰ تورنمنت را یک بار با این قابلیت‌ها و یک بار بدون آن‌ها اجرا کردم. نتیجه‌ها و نمای میز در هر ۳۰۰۰ تورنمنت یکی بود و هیچ کارتی بی‌اجازه رو نشد. تست layout با 2304/0، stability با 220/0 و تست مرورگر با 13/0 در حالت عمودی و افقی هم سبز بودند. تست روی Safari آیفون هنوز مانده و باید روی گوشی خودتان انجام شود.
>
> **برای روشن کردن در production**، علاوه بر GO شما، دو کار لازم است. اول باید `GAMEPLAY_OPTIONS=1` روی سرویس تنظیم شود که سرور را restart می‌کند. بعد باید در Director، برای تورنمنت امشب گزینه‌های «Show cards» و «Rabbit hunt» را روشن کنید. تورنمنتی که هنوز در حال ثبت‌نام است قابل ویرایش است.
>
> Handoff برای Muse همراه با عکس‌ها: RABBIT-SHOW-handoff.md

**16:58 UTC**
> باشه، نسخه‌ی قبلی staging را backup می‌گیرم و `49cca50` را روی gta-poker-staging می‌گذارم.

**17:00 UTC**
> نسخه‌ی `49cca50` الان روی https://gta-poker-staging.onrender.com در دسترس است و دو کار مانده: تأیید Muse و تست آیفون شما.
>
> سرور ساعت 16:59 UTC بدون خطا بالا آمد، با دیتابیس تستی خودش و اتصال drand سالم. شاخه‌ی staging قبلی هم به اسم `staging-backup-c4445ed` نگه داشته شده است.
>
> **برای تست روی آیفون:**
> 1. با حساب Director وارد شوید و یک تورنمنت بسازید. در فرم آن «Show cards: Players may show» و «Rabbit hunt: Show the unused cards» را روشن کنید.
> 2. با چند بازیکن تستی بازی کنید. وقتی دستی روی flop یا turn تمام شد، کارت‌های rabbit باید کم‌رنگ روی میز بیایند. بعد از هر دست هم دکمه‌های Show برای کسانی که کارت‌شان رو نشده، از جمله fold‌کرده‌ها، باید ظاهر شوند.
> 3. این کار را در هر دو حالت عمودی و افقی چک کنید.
>
> من خودم از داخل محیطم به آدرس staging دسترسی ندارم. برای همین وضعیت سرور را فقط از روی لاگ‌های Render بررسی کرده‌ام.

**17:15 UTC**
> عالی، تست آیفون شما روی staging را به‌عنوان تأیید ثبت کردم.
>
> قبل از دست زدن به production فقط می‌خواهم مطمئن شوم «go» یعنی انتشار روی production. اگر همین است، لطفاً بنویسید **Go 49cca50** تا مثل دفعه‌ی قبل مستقیم به همین SHA وصل باشد.
>
> دو چیز هنوز باز است. اول، Muse هنوز تأیید نکرده. اگر بدون تأیید Muse منتشر کنیم، این ریسک را شما قبول کرده‌اید. دوم، یک export تازه از دیتابیس production قبل از انتشار لازم است. لطفاً آن را از Render بگیرید و عکسش را بفرستید.
>
> بعد از GO، این کارها را انجام می‌دهم: (1) چک می‌کنم بازی‌ای در جریان نباشد. (2) `49cca50` را merge و deploy می‌کنم. (3) `GAMEPLAY_OPTIONS=1` را تنظیم می‌کنم. (4) لاگ‌های بالا آمدن سرور را بررسی می‌کنم.
>
> برای برگشت، deploy فعلی `4423a07` آماده است.

**17:15 UTC**
> GO برای 49cca50 دریافت شد. اول بیکار بودن production را چک می‌کنم، بعد merge، deploy و تنظیم GAMEPLAY_OPTIONS.

**17:18 UTC**
> `49cca50` الان روی production فعال است. تنها کاری که مانده با شماست: در Director، برای تورنمنت امشب گزینه‌های «Show cards: Players may show» و «Rabbit hunt: Show the unused cards» را روشن کنید. اگر تورنمنت هنوز در حال ثبت‌نام است، با Edit می‌توانید این کار را بکنید. این دو گزینه به‌طور پیش‌فرض خاموش‌اند.
>
> - **انتشار:** main از `4423a07` روی نسخه‌ی جدید رفت، بدون force-push. deploy کد ساعت 17:16:48 UTC و deploy مربوط به `GAMEPLAY_OPTIONS=1` ساعت 17:17:23 UTC بالا آمدند.
> - **لاگ‌ها:** دیتابیس سالم است، همان 2489 کلید در هر دو بار بالا آمدن سرور. drand درست کار می‌کند و نمونه‌های قبلی سرور بدون از دست رفتن داده کنار رفتند. هیچ خطایی دیده نشد.
> - **ریسک‌های قبول‌شده با GO شما:** Muse هنوز بررسی نکرده است. export تازه هم گرفته نشد و آخرین export مال دیروز ساعت 21:51 UTC است. این تغییر به ساختار داده دست نمی‌زند.
> - **برگشت:** اگر مشکلی پیش آمد، با برداشتن `GAMEPLAY_OPTIONS` هر دو قابلیت فوراً خاموش می‌شوند. برگشت کامل هم با redeploy کردن `4423a07` ممکن است.
>
> لطفاً بعد از روشن کردن گزینه‌ها، یک دست سریع روی production امتحان کنید.

**17:20 UTC**
> خواهش می‌کنم، بازی خوبی داشته باشید. اگر Muse ایرادی پیدا کرد، همین‌جا بفرستید تا رسیدگی کنم.

**17:21 UTC**
> باشه. همه‌ی پیام‌هایم را در یک فایل روی GitHub و یک issue می‌گذارم. به main دست نمی‌زنم چون production را restart می‌کند.
