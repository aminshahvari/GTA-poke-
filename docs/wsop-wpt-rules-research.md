# WSOP / WPT / TDA tournament rules: implementer checklist for an online NLHE freezeout engine

Researched 2026-10-15. Scope: rules that map to server-dealt online No-Limit Hold'em freezeouts. Live-only matters are left out: physical chips and chip races, verbal declarations, phones, dress code, dealer procedure, cash and tax payouts.

## Sources and how they were read

| Abbrev | Document | URL | How it was read |
|---|---|---|---|
| **TDA26** | Poker TDA Rules, **2026 v1.1 (Sept 21, 2026)**, the current official text | https://www.pokertda.com/view-poker-tda-rules/ | WebFetch of the official HTML rules page (Rules 1–74). Direct download was blocked by the proxy. The RP and Illustration Addendum PDFs sit in Dropbox folders and could not be fetched. |
| **TDA24** | Poker TDA Rules 2024 (requested edition) | Dropbox folder linked from https://www.pokertda.com/poker-tda-rules/ | **Not fetchable.** Content was taken from secondary sources: poker.org's 2024 changes summary, https://www.poker.org/latest-news/whats-new-in-the-2024-tda-poker-tournament-rules-update-ayEOG4F466jL/, and the rule mirror https://alinenkarl.net/poker-tda-2024. The mirror's numbering looks like the older 2022 numbering, e.g. 43 = raise amounts and 47 = re-opening. |
| **TDA-RP** | TDA Recommended Procedures (RP-8 hand-for-hand, RP-11 ante format, RP-28 timekeeping, etc.) | https://tdaguide.com/ (secondary, partial) and the alinenkarl mirror | Secondary sources only |
| **WSOP26** | 2026 World Series of Poker Official Tournament Rules | https://pokerexklusiv.com/wp-content/uploads/2026/04/2026-WSOP-Tournament-Rules.pdf (re-host of the WSOP PDF). The official 2025 version is at https://www.wsop.com/2025/2025-WSOP-Tournament-Rules.pdf | WebFetch of the full 2026 PDF text, about 123k characters |
| **WSOP-BBA** | WSOP announcement of the big blind ante (2019) | https://www.wsop.com/news/2019/Jan/10853/BIGGER-STARTING-STACKS-AND-BIG-BLIND-ANTE-COMING-TO-2019-WSOP.html | Primary |
| **WSOP-ME25** | 2025 WSOP Event #81 $10,000 Main Event structure sheet | https://wsop.gg-global-cdn.com/wsop/pdfs/structuresheets/structure_5771_24782.pdf | Primary |
| **WSOP-37** | 2025 WSOP Event #37 $1,500 Monster Stack structure | https://wsop.gg-global-cdn.com/wsop/pdfs/structuresheets/structure_5771_24654.pdf | Primary |
| **WSOP-64** | 2025 WSOP Event #64 $1,000 Super Seniors structure | https://wsop.gg-global-cdn.com/wsop/pdfs/structuresheets/structure_5771_24729.pdf | Primary |
| **WPT-CHO** | WPT Choctaw Championship event rules and structure | https://www.worldpokertour.com/event/wpt-choctaw-championship/details | Primary |
| **WPT-AUS** | WPT Australia Championship event rules | https://www.worldpokertour.com/event/main-tour-wpt-australia-season-2025/details | Primary |
| Others | PokerNews: 2025 ME payouts (https://www.pokernews.com/news/2025/07/2025-wsop-main-event-registration-closed-49088.htm), 2026 ME shot clock (https://www.pokernews.com/news/2026/07/wsop-main-event-shot-clock-debate-51856.htm), WPT Action Clock (https://www.pokernews.com/news/2017/07/world-poker-tour-action-clock-season-xvi-28629.htm), 2025 $250K SHR (https://www.pokernews.com/tours/wsop/2025-wsop/event-46-250000-super-high-roller/chips.746182.htm); TDA forum on H4H ties (https://www.pokertda.com/forum/index.php?topic=281.0); casinos.com TDA summit BBA (https://www.casinos.com/us/news/tda-summit-wraps-with-new-rules-for-big-blind-ante-and-dealer-talk); ClubWPT Gold online H4H and simultaneous elimination help (https://support.clubwptgold.com/portal/en/kb/articles/tournaments-hand-for-hand-play, https://support.clubwptgold.com/portal/en/kb/articles/tournaments-simultaneous-elimination) | | Secondary |

**WPT rules:** WPT has no standalone rulebook of its own. Its event pages say: *"Tournament Director Association (TDA) rules will be used, unless House Rules apply"* (WPT-CHO). In practice, WPT = TDA plus the event-page specifics noted below.

**WSOP.com online rules:** no public WSOP.com online tournament rulebook could be found or fetched. The only online-specific guidance found was ClubWPT Gold's help pages, used where noted.

**Rule numbers:** "TDA nn" means the **2026 v1.1** numbering, which is the official text online today. The 2024 text could not be fetched. On every point below, the 2024 content is substantively the same as far as the secondary sources show; RP-11, big-blind-first BBA, was itself new in 2024. Check the numbers before citing 2024 specifically.

---

## 1. Blinds and antes

- [ ] **1.1 Ante format: Big Blind Ante (BBA), paid by the big blind player, amount = BB.** All WSOP NLHE events use BBA (WSOP-BBA). Every level on the WSOP-ME25, WSOP-37 and WSOP-64 sheets has ante = BB. WPT: *"Single ante will be posted by the player in the big blind, in the amount equivalent to the big blind"* (WPT-AUS). TDA RP-11 recommends BBA when a single-payer ante is used.
- [ ] **1.2 BB short of blind + ante → the blind has priority, the remainder goes to the ante.**
  - TDA RP-11: "big-blind-first calculation" (2024, per poker.org).
  - TDA Summit ruling: "the big blind would be fulfilled first, then the ante" (casinos.com).
  - WSOP: "If a player can't cover both, the big blind is collected first, then the ante" (WSOP-BBA).
  - WPT-AUS: *"The big blind is before the ante when a player has less than a big blind and ante amount, per new TDA recommendations."*
  - WPT-CHO's text says the ante is "posted ... before the blind". That reads as posting order, and it conflicts with WPT-AUS. Treat WPT as BB-first, per the TDA.
- [ ] **1.3 The ante is dead money in the main pot.** It does not count toward the BB player's bet for calling or raising purposes. A short BB who posts the full blind and a partial ante is all-in for the blind amount and is eligible for the main pot, which includes all ante money.
- [ ] **1.4 The ante is never reduced,** including at the final table and heads-up (TDA RP-11, per poker.org). WPT-CHO: "maintained until the end of the tournament".
- [ ] **1.5 Short or all-in blinds do not lower the betting unit.** Pre-flop pot calculations assume full blinds were posted (TDA 56-B). The minimum bet is the BB (WSOP26 §VIII No-Limit b), and the minimum raise is measured from the full BB (TDA 45-A, inferred). Players facing a short-all-in BB still owe a full BB to call. This last point is standard practice, inferred from TDA 45-A/56-B and not written as an explicit rule.
- [ ] **1.6 Dead button.** TDA 34: "Tournament play will use a dead button." WSOP26 85: "Dead Button is defined as a button that cannot be advanced due to elimination of a Participant or the seating of a new Participant into a position between the small blind and the button."
  - Implementation: the BB always advances to the next seated player. The SB goes to whoever was BB last hand; if that seat is now empty, the SB is dead and nobody posts it. The button goes to the seat that was SB last hand, even if that seat is empty (dead button).
  - TDA 36-B lets the button skip over several vacant seats "to keep blind progression and seat the most incoming players", provided no player misses or posts consecutive big blinds.
- [ ] **1.7 Button errors** found before substantial action are corrected. After substantial action they stand (TDA 36-A). Not relevant for server-run play.
- [ ] **1.8 Heads-up.** TDA 36-C / WSOP26 87: the SB is the button. The button acts first pre-flop and last on every later street, and is dealt the last card. On the transition to heads-up, *"the button may be adjusted so no player takes the big blind twice in a row."* Rule: whoever was BB on the last 3-handed hand must not be BB again on the first heads-up hand. With BBA, the ante stays with the BB (the non-button player).
- [ ] **1.9 New, moved, re-entered or late-registered players: no posting, no waiting for the BB.**
  - TDA 9 / TDA 11-A: they *"may take any seat, including the small blind, big blind, or button"*. They are dealt in **except between the small blind and the button**.
  - WSOP26 66: they "assume the rights and responsibilities of the position. They can get the big blind, the small blind or the button. The only place they cannot get a hand is between the small blind and the button."
  - WSOP26 14: late registrants "do not have to post" and take the first available position, including button, SB or BB, even on their first hand.
  - Software: when a hand is dealt, if a player's seat lies strictly between the SB and the button (going clockwise from the SB toward the button through the seats behind the button), deal them out for that hand. Otherwise deal them in at once, including posting the BB/SB if the seat is a blind.
- [ ] **1.10 Level changes take effect on the next hand.** A hand in progress finishes at the old level (TDA 25-A, WSOP26 79).

## 2. Betting (No-Limit)

- [ ] **2.1 Minimum bet = big blind** on every street (WSOP26 §VIII No-Limit b).
- [ ] **2.2 Minimum raise.** A raise must be "at least equal to the largest prior full bet or raise of the current betting round" (TDA 45-A). WSOP26 96: "all raises must be equal to or greater than the size of the previous bet or raise on that betting round". The TDA Addendum describes this as the "last legal increment".
- [ ] **2.3 Incomplete all-in raises do not reopen betting.** TDA 49-A: in NL/PL, *"an all-in wager (or cumulative short all-ins) totaling less than a full bet or raise will not reopen the betting for players who have already acted and are not facing at least a full bet or raise."* WSOP26 96 says the same.
  - Per-player test: a player who has already acted may re-raise only if (current bet) − (amount the player had to match when they last acted) ≥ last full raise size. A player who has not yet acted always has full options.
- [ ] **2.4 Cumulative short all-ins can reopen, and the minimum raise stays at the last full raise.**
  - TDA 49-A: "If short all-ins do reopen the action, the minimum raise is the last full valid bet or raise of the round."
  - WSOP26 96 example: A bets 500, B raises to 1,000, C calls, D goes all-in for 1,300, E goes all-in for 1,700. A acts first. B and C may then re-raise, and *"the last complete raise was 500; therefore B or C would be allowed to call 1,700 and raise 500 for a total wager of 2,200."*
  - So the minimum raise-to = current bet + last *full* raise increment. The cumulative 700 does **not** count as a raise increment.
  - Limit only: the 50% rule for reopening (TDA 49-B) does not apply in NL.
- [ ] **2.5 No cap on raises in NL** (TDA 50, WSOP26 100).
- [ ] **2.6 Live-only, skip:** the 50% under-raise rule (TDA 45-A, WSOP26 95), string bets (WSOP26 103), oversized chips (TDA 46, WSOP26 97), multi-chip bets (TDA 47, WSOP26 92), undercalls (TDA 53) and acting out of turn (TDA 55). Software should simply accept only legal amounts, so none of these can arise.

## 3. Showdown

- [ ] **3.1 All-in with betting complete → every hand is tabled at once.** TDA 17 / WSOP26 70: once a player is all-in and all betting is complete, all hands in the main and side pots are turned face up. No mucking.
- [ ] **3.2 Non-all-in showdown order.** TDA 18 / WSOP26 72: the last aggressive player on the final street shows first. If nobody bet on the final street, the first player to act on that street shows first, i.e. the first seat left of the button in flop games. Showing then proceeds clockwise.
- [ ] **3.3 Mucking is allowed when there was no all-in.** A player may muck face down without showing and forfeits any claim to the pot (TDA 18, 19; WSOP26 72). The winner must show to take the pot (WSOP26 72; TDA 20: all hole cards must be tabled to win any part of the pot). An uncontested pot need not be shown (TDA 18).
- [ ] **3.4 Right to see a hand.** A river caller has an "inalienable right" to see the last aggressor's hand (TDA 19). Other requests are at the TD's discretion. Players who mucked lose the right. Software equivalent: the last aggressor's hand is always revealed to callers when a river bet was called.
- [ ] **3.5 Cards speak** (TDA 13, WSOP26 69). The software evaluates hands; claims are irrelevant.
- [ ] **3.6 Odd chips.** TDA 21 / WSOP26 73: break the remainder down to the **smallest denomination in play**. In board games, the odd chip goes to the **first winning seat left of the button**, counted from the button position even when the button is dead.
- [ ] **3.7 Side pots are split separately** (TDA 23, WSOP26 74). Apply the odd-chip rule to each pot on its own. Each player is eligible only for pots they contributed to.

## 4. Simultaneous eliminations

- [ ] **4.1 Same table, same hand:** the player who started the hand with more chips finishes higher.
  - WSOP26 126(b): at the same table, the player who began the hand with the higher chip count finishes higher.
  - TDA 22 (BBA games, in the money): *"the player with the larger starting stack after the ante is put in will finish higher."* The same applies to bounties.
  - So in BBA games, measure the stack **after the BB's ante is deducted**: the BB's stack counts minus the ante, and other players' stacks are unchanged.
  - Equal stacks → tie, and the prizes for the tied places are split.
- [ ] **4.2 Different tables, same hand-for-hand hand → TIE, split prizes (WSOP).** WSOP26 126(b): players eliminated on the same hand at different tables "tie" for that place. Payout eligibility starts at the hand-for-hand announcement, and busting players "may share in places paid on that hand" (126c).
  - TDA RP-8 (secondary): players who bust on the same hand share the paid place(s). Example: 52 left, 50 paid, three bust on the same hand → they split the 50th-place payout.
  - **Online alternative** (ClubWPT Gold): the starting-stack comparison is applied across tables too, since online counts are exact. Pick one. To be "WSOP-exact", use the tie and split.
- [ ] **4.3 Outside hand-for-hand,** neither WSOP nor TDA requires cross-table ordering. Busts are ordered by the time they happen.

## 5. Hand-for-hand

- [ ] **5.1 WSOP26 126:**
  - (a) Starts "upon nearing the money". All tables finish their current hand, then each table deals one hand and waits until every table is done. Repeat until the bubble bursts.
  - (b) Ties as in §4.
  - (c)/(d) "each hand will run 2 minutes off the clock, regardless of how long the hand actually takes". Remove the time per hand, not per batch.
  - (e) Blinds keep increasing as levels are reached.
  - (g) After an all-in and a call, cards stay face down until instructed. Not needed in software, but avoid revealing results to other tables before all tables finish.
- [ ] **5.2 TDA RP-8** matches: payout eligibility from the announcement; up to 2–3 minutes deducted per hand.
- [ ] **5.3 WPT variant:** WPT-CHO plays **round-for-round** instead of hand-for-hand on the bubble.
- [ ] **5.4 Online practice (ClubWPT Gold):** start at (paid places + 1) players left, optionally a few places earlier. Sometimes also used at the final-table bubble.
- [ ] **5.5 Software trigger:** start when `players_remaining ≤ paid_places + 1`, plus a margin if desired, and the field is on more than one table. End when `players_remaining ≤ paid_places`. One table alone is naturally hand-for-hand.

## 6. Table balancing and breaking

- [ ] **6.1 When to balance.**
  - TDA 12-D: play halts on a table that is **3 or more players short** of the largest table, once blinds are affected. TDA: balance more tightly as the event goes on.
  - WSOP26 67: for 8/9/10-max, halt a table that is 3+ short of the fullest. 67(c): from **12 tables** (or when manageable), tables are kept **within one player** until the final table.
  - Software: move a player whenever the difference is 2 or more. That keeps tables within 1 and satisfies both rules.
- [ ] **6.2 Who moves, and to which seat.**
  - TDA 12-A: in flop games, *"the player who will be big blind next moves to the worst position, even if that means that seat gets the big blind twice. The small blind is never the worst position."*
  - WSOP26 67(a): "the Participant who will be the big blind next will be moved from the big blind to the worst position, including taking a single big blind. Worst position is never the small blind."
  - **Worst position** = the empty seat at the short table that will post the BB soonest. That is the BB seat for the next hand if it is open; otherwise the next open seat after it in blind order. It is never the seat that would be SB, and never a seat between SB and button where the player would get a free hand.
- [ ] **6.3 Which table gives up the player** (WSOP26 67):
  - More than 20 tables: the next numerical table at full capacity.
  - Fewer than 20 tables: the next full table in the breaking order.
  - A player can be moved until the first card of the hand is dealt. After that, the next player to move stays for that hand.
  - Software: take the player from the largest table, preferring the next table in breaking order, between that table's hands.
- [ ] **6.4 Breaking tables.**
  - Break order is posted when registration closes (WSOP26 66). Tables added late break first (WSOP26 35). Random breaking is allowed (TDA 12-C).
  - Players from a broken table are reseated by a **2-step random process**: random table, then random seat (TDA 11-B). They may land in the SB, BB or button, but are not dealt in between SB and button (TDA 11-A, WSOP26 66).
  - Break a table when the remaining players fit into one fewer table.
- [ ] **6.5 Final table size** (WSOP26 68, TDA RP-9): a 9-handed event combines to a **10-player** final table; 8-max at 9; 7-max at 8; 6-max at 7. This requires a seat beyond max size, so it is optional for the app.
- [ ] **6.6 Redraws** (WSOP26 67(c)): new seats are drawn at 3 tables, 2 tables and the final table for events with 100+ entrants. For 51–99 entrants: at 2 tables and the final table. The button is also drawn at 3, 2 and 1 tables (WSOP26 85). WPT: redraws at 24, 16 and 9 players. Optional.

## 7. Clock, time bank, away players

- [ ] **7.1 Clock.**
  - TDA 31: 25 seconds + a 5-second countdown. When time runs out: facing a bet → **hand dead (fold)**; not facing a bet → **checked**.
  - WSOP26 80: 0–25 seconds + 5-second countdown, then the hand is dead. WSOP26 108: exceeding the clock while facing a bet = dead hand. A "player shot clock" may be used.
- [ ] **7.2 Shot clocks and time banks.**
  - WPT Action Clock: **30 s per action** plus **time-extension chips of 30 s each**. Chips accumulate and are not reset (WPT-CHO, WPT-AUS). It applies late in events (e.g. from Level 16, Day 2).
  - WSOP Main Event 2026 (Day 7+): **20 s per action + 6 extension chips × 30 s per day**.
  - TDA RP-28: the first action can get less time than later actions (e.g. 20 s vs 30 s).
  - Stalling, or burning time banks on purpose to move up the payouts, is penalized (WSOP26 80).
- [ ] **7.3 At your seat / absent players.**
  - TDA 32: *"To have a live hand, players must be at their seats when the last card is dealt to all players on the initial deal. Players not then at their seats may not look at their cards which are killed immediately."* Their blinds and antes go into the pot.
  - WSOP26 82: "A Participant must be at his or her seat by the time all Participants have been dealt complete initial hands to have a live hand."
  - WSOP26 84: once action has begun, a hand may be treated as abandoned and mucked if the player is not at their seat.
  - TDA 74-A: "Players away from the table or on penalty may be anted or blinded out." TDA 74-C: cards are dealt, blinds and antes posted, and the hand is killed after the initial deal.
- [ ] **7.4 Software mapping.**
  - A player flagged *away* at deal time: deal cards, post their blinds and BBA, **kill the hand at once**. They never auto-check and can never win a pot.
  - If everyone else folds, the last live hand wins. If the only other live hand is the SB facing a killed BB, the SB wins.
  - A player who is present but times out in a hand: check if possible, otherwise fold (TDA 31).

## 8. Late registration, re-entry, chips

- [ ] **8.1 Late registration** runs through the level stated on the structure sheet; if that level ends at a break, it stays open until play resumes (WSOP26 12, 14). Main Event 2025: 7 levels. $1,500 events: 8–10 levels. WPT: until the start of Level 9 (Choctaw) or Level 11 (Australia).
- [ ] **8.2 Re-entry** is allowed only when the structure sheet says so, and only at zero chips (WSOP26 13). A player may forfeit a stack and re-enter while registration is open (WSOP26 13, WPT-CHO). Re-entrants get a full stack, a random seat, and are dealt in except between SB and button (TDA 9). WSOP: often 1 re-entry or one per flight. WPT: unlimited.
- [ ] **8.3 Online:** chip races and color-ups do not apply. Chip denominations matter only for the odd chip (§3.6).

## 9. Levels and breaks

- [ ] **9.1 Level length.**
  - WSOP Main Event: **120 min**, 20-min break after every level, 75-min dinner break (WSOP-ME25).
  - WSOP $1,000–$1,500 events: **60 min**, 20-min breaks every 2 levels on Day 1 and 15 min on later days, plus a 60–75-min dinner break (WSOP-37, WSOP-64).
  - WPT Main Tour: **60 min** on Day 1, 90 min on later days, 15-min break every 2 levels, 45–60-min dinner (WPT-AUS, WPT-CHO).
- [ ] **9.2 Starting stacks:** WSOP ME **60,000** (300 BB); $1,500 Monster Stack 50,000; $1,000 Super Seniors 20,000; $1,500 NLH 25,000 since 2019.
- [ ] **9.3 WSOP standard NLHE structure** (Main Event 2025 = Monster Stack 2025 for Levels 1–18), as [SB, BB, BB ante]:

| Lvl | SB | BB | BBA | | Lvl | SB | BB | BBA |
|---|---|---|---|---|---|---|---|---|
| 1 | 100 | 200 | 200 | | 16 | 4,000 | 8,000 | 8,000 |
| 2 | 200 | 300 | 300 | | 17 | 5,000 | 10,000 | 10,000 |
| 3 | 200 | 400 | 400 | | 18 | 6,000 | 12,000 | 12,000 |
| 4 | 300 | 500 | 500 | | 19 | 10,000 | 15,000 | 15,000 |
| 5 | 300 | 600 | 600 | | 20 | 10,000 | 20,000 | 20,000 |
| 6 | 400 | 800 | 800 | | 21 | 10,000 | 25,000 | 25,000 |
| 7 | 500 | 1,000 | 1,000 | | 22 | 15,000 | 30,000 | 30,000 |
| 8 | 600 | 1,200 | 1,200 | | 23 | 20,000 | 40,000 | 40,000 |
| 9 | 1,000 | 1,500 | 1,500 | | 24 | 25,000 | 50,000 | 50,000 |
| 10 | 1,000 | 2,000 | 2,000 | | 25 | 30,000 | 60,000 | 60,000 |
| 11 | 1,000 | 2,500 | 2,500 | | 26 | 40,000 | 80,000 | 80,000 |
| 12 | 1,500 | 3,000 | 3,000 | | 27 | 50,000 | 100,000 | 100,000 |
| 13 | 2,000 | 4,000 | 4,000 | | 28 | 60,000 | 120,000 | 120,000 |
| 14 | 3,000 | 5,000 | 5,000 | | 29 | 100,000 | 150,000 | 150,000 |
| 15 | 3,000 | 6,000 | 6,000 | | 30 | 100,000 | 200,000 | 200,000 |

  Continuing (ME): 125k/250k, 150k/300k, 200k/400k, 250k/500k, 300k/600k, 400k/800k, 500k/1M, 600k/1.2M, 800k/1.6M, 1M/2M, 1.25M/2.5M, 1.5M/3M, 2M/4M, 2.5M/5M, 3M/6M, 4M/8M, 5M/10M. The ante always equals the BB.

  Known variants:
  - Monster Stack L19: 8k/16k.
  - WPT: L11 1,500/2,500; L21 15k/25k; L28 75k/125k.

  The WPT Choctaw structure is otherwise the same: 100/200/200, 200/300/300, 200/400/400 ...
- [ ] **9.4 Smallest denomination (chip removal).** The 100 chip goes after L8 (smallest = 500), the 500 after L13 (smallest = 1,000), the 1,000 after L18 (smallest = 5,000), and the 5,000 after L28 (WSOP-ME25). This affects the odd-chip unit if you follow "smallest denomination in play".

## 10. Payouts

- [ ] **10.1 WSOP pays about 15% of the field, rounded up.**
  - 2025 Main Event: 9,735 entries → **1,461 paid** = ceil(0.15 × 9,735). Min-cash **$15,000 = 1.5× buy-in**.
  - 2025 $250K Super High Roller: 63 entries → **10 paid** = ceil(0.15 × 63).
  - WPT: **1 in 8 entries paid (~12.5%)** (WPT-CHO, WPT-AUS).
- [ ] **10.2 2025 Main Event final table as a share of the $90,535,500 pool:**

  | Place | Share of pool |
  |---|---|
  | 1 | 11.05% |
  | 2 | 6.63% |
  | 3 | 4.42% |
  | 4 | 3.31% |
  | 5 | 2.65% |
  | 6 | 2.10% |
  | 7 | 1.66% |
  | 8 | 1.38% |
  | 9 | 1.10% |

  Ratios to 1st: 1 : .60 : .40 : .30 : .24 : .19 : .15 : .125 : .10.
- [ ] **10.3 Tied places** (simultaneous busts, §4): add up the prizes for the tied places and split them equally.

## 11. Deals, dead hands, misdeals

- [ ] **11.1 Deal-making** is allowed with house supervision (TDA RP-27). WSOP has no deal rule in the visible text. Optional feature: an ICM or chip-chop split agreed by all remaining players.
- [ ] **11.2 Dead hands** in software arise only from:
  - absent at deal (§7.3)
  - clock expired while facing a bet (TDA 31, WSOP26 108)
  - fold, including folding when a check was available, which is binding (WSOP26 84)
- [ ] **11.3 Misdeal or server fault.**
  - A re-deal is an exact replay: same button, no new players, same limits (TDA 37-C).
  - No misdeal can be declared after substantial action (TDA 37-D). Substantial action = 2 in-turn actions with at least one putting chips in, or 3 in-turn actions; posted blinds do not count (TDA 38).
  - A fouled deck voids the hand and all chips are returned (TDA 37-E).
  - Software: if a server fault happens mid-hand, restore stacks to the start of the hand and re-deal with the same button and level.

## 12. WSOP/WPT differences from TDA that matter for software

| Topic | TDA | WSOP | WPT |
|---|---|---|---|
| Cross-table busts in hand-for-hand | Share the paid places (RP-8) | **Tie and split** (126b) | Round-for-round, ties per TDA |
| Same-table simultaneous busts | Larger stack **after the ante is posted** finishes higher (22) | Larger stack at the start of the hand (126b) | TDA |
| Clock | 25 + 5 s, then check or fold (31) | 0–25 + 5 s, then dead; shot clock 20 s + 6 × 30 s chips (ME Day 7+) | Action Clock 30 s + 30-s extension chips, accumulating |
| Balancing | Halt at 3+ short; balance tighter later | Same, plus within 1 player from 12 tables; source = next full table in break order | TDA |
| Final table size | RP-9: combine to 9 from two tables of 5 | Combine at 10 for a 9-max event (68) | Redraw at 9 |
| Payout % | n/a | ~15%, ceil | 12.5% |
| BBA priority | BB first (RP-11) | BB first | BB first (AUS text) |

---

## Comparison with the current engine

| # | Engine behavior | Verdict | Rule | Recommended exact behavior |
|---|---|---|---|---|
| A | Levels 100/200, 100/300, 200/400, BBA only from L3 | **MISMATCH** | WSOP-ME25 / WSOP-37 / WPT-CHO | BBA = BB **from Level 1**. L2 = 200/300/300, not 100/300. Use the §9.3 list. |
| B | BB posts blind first, blind has priority, dead ante to main pot only | OK | TDA RP-11, WSOP-BBA, WPT-AUS | Keep. Also apply 1.5: a short BB does not lower the min bet/raise or the call amount, and the ante never counts as the BB's bet. |
| C | Dead button | OK, verify details | TDA 34/36, WSOP26 85/87 | BB always advances one player; dead SB allowed; heads-up: button = SB, no consecutive BB on the transition. |
| D | Min raise = last full raise; short all-in doesn't reopen; cumulative short all-ins reopen | OK, verify the reopened min | TDA 49-A, WSOP26 96 | After a reopen, min raise-to = current bet + **last full raise** (WSOP example: 1,700 + 500 = 2,200). Use the per-player test in 2.3. |
| E | Odd chips to the first seat left of the button, in 100-chip units | Mostly OK | TDA 21/23, WSOP26 73/74 | Award to the first *winning* seat clockwise from the button position (works with a dead button), **separately for each side pot**. For strict TDA, the unit is the smallest denomination in play (100 → 500 → 1,000 → 5,000 per the chip-removal schedule). Keeping 100 is a defensible online simplification. |
| F | Same-hand busts: lower starting stack gets lower place | Mostly OK | TDA 22, WSOP26 126b | Compare stacks at the start of the hand **after the BB's ante is deducted** (TDA 22). Equal stacks → tie and split. |
| G | Busts at different tables processed in order of finish, no hand-for-hand | **MISMATCH (high)** | WSOP26 126, TDA RP-8 | Add hand-for-hand from (paid + 1) left: all tables deal in sync and wait for the slowest. Busts on the same H4H hand at different tables **tie** and the prizes for the places they occupy are pooled and split equally. Busts at the same table are ordered by starting stack (F). |
| H | Balancing when the difference is ≥2 | OK | TDA 12-D, WSOP26 67(c) | Keep. Source = the fullest table, next in breaking order. Move only between hands. |
| I | Moved players get a random empty seat | **MISMATCH (high)** | TDA 12-A, WSOP26 67(a) | Move **the player who will be BB next** at the source table into the **worst position** at the target: the seat that posts the BB soonest, never the SB. Deal them in immediately, BB included. Broken-table players use random table → random seat (TDA 11-B). |
| J | No "between SB and button" rule mentioned | **MISMATCH (high)** | TDA 9/11-A, WSOP26 14/66 | Any new, moved, broken-table or late-registered player whose seat lies between the SB and the button is dealt out until the button passes. Otherwise they are dealt in at once with no posting requirement. |
| K | Table breaks when the field fits into fewer tables; random seat | OK | TDA 11-B / 12-C, WSOP26 66 | Keep. Fix the break order (e.g. highest-numbered table first, or post it at the start). Optional: final table at 10 for 9-max (WSOP26 68), and redraws at 3/2/1 tables. |
| L | Away players: auto-check or fold after 2.5 s; blinds and antes posted | **MISMATCH (medium)** | TDA 32, 74-A/C; WSOP26 82/84 | Post blinds and BBA, but **kill the away player's hand at the deal**: no auto-check, cannot win. A present player who times out: check if possible, else fold (TDA 31). |
| M | Time bank 30 s per decision | OK (WPT-like) | TDA 31 (25 + 5 = 30 s), WPT Action Clock, RP-28 | Keep 30 s. Optionally add extension chips (WPT: 30 s each, accumulating; WSOP ME: 6 × 30 s per day) and a 20 s first-action time (RP-28). |
| N | Payouts: ≤3 → 1; ≤6 → 2; ≤10 → 3; ≤20 → 5; ≤40 → 9; above that 15% | **MISMATCH (medium)** | WSOP ~15% (ME 1,461/9,735; SHR 10/63); WPT 12.5% | paid = **ceil(0.15 × N)** for every N: 2–6 → 1, 7–13 → 2, 14–20 → 3, 21–26 → 4, 27–33 → 5, 34–40 → 6. Weight the top places like the WSOP ME (1 : .60 : .40 : .30 : .24 : .19 : .15 : .125 : .10) and normalize. Today the engine pays 22–33% of small fields. |
| O | All live hands shown automatically, no mucking | **MISMATCH (low)** | TDA 17/18/19/20, WSOP26 70/72 | All-in with betting complete → show everyone (as now). Otherwise reveal the last river aggressor first, or the first seat left of the button if the river was checked through. Proceed clockwise: a player who cannot beat or tie the best shown hand may muck (auto-muck by default). The winner always shows. An uncontested pot is not shown. Chip results are unaffected. |
| P | Level change timing | Verify | TDA 25, WSOP26 79 | The new level applies from the next hand dealt. |
