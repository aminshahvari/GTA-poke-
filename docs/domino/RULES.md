# Domino rule presets and fixtures

These presets cover physical play with a double-six set: 28 tiles and 168 pips. Each player starts with 7 tiles. The scorepad records what happened at the table, and the server computes every score (`server/domino/rules.js`). Each fixture below is a test in `test/t_domino_engine.js`.

| Preset | Target | Scoring during the hand | Going out | Blocked hand |
|---|---|---|---|---|
| All Fives | 150 | Open ends adding to a multiple of 5 score that number (5–60) | The opponents' pips, rounded to the nearest 5 (halves up) | The side with fewer pips scores the other side's pips, rounded to the nearest 5 |
| Block | 100 | none | The opponents' pips | The side with fewer pips scores the other side's pips |
| Draw | 100 | none | The opponents' pips | The side with fewer pips scores the other side's pips |

The director can change two things:
- **Target:** 50, 61, 100, 150, 200 or 250.
- **Blocked-hand scoring:** *difference* instead of *opponents*.

**Partnership (2v2):** partners sit opposite each other. When a player goes out, their side scores both opponents' hands; the partner's remaining pips don't count. In a blocked hand, the side with the lower team total scores.

**Blocked tie:** nobody scores.

**Limits:**
- One hand can hold 0–84 pips.
- All hands together can't exceed 168 pips.
- The player who went out must have 0 pips.

## Fixtures

| # | Preset | Hands | Result |
|---|---|---|---|
| F1 | Block 1v1 | a goes out, b has 23 | a +23 |
| F2 | All Fives 1v1 | a goes out, b has 23 | a +25 (23 rounds to 25) |
| F3 | Block 1v1, blocked | a 8, b 14 | a +14 |
| F4 | Block, difference option, blocked | a 8, b 14 | a +6 |
| F5 | Block, blocked tie | a 9, b 9 | nobody scores |
| F6 | Draw 2v2 | a goes out; partner c 5, b 10, d 12 | a's side +22 (c's 5 doesn't count) |
| F7 | Draw 2v2, blocked | a 3 + c 20 = 23, b 9 + d 10 = 19 | b's side +23 |
| F8 | All Fives, blocked | a 4, b 18 | a +20 |
| Rounding | All Fives | 12→10, 13→15, 15→15, 17→15, 18→20, 2→0, 3→5 | |

**For the owner to confirm:** the targets (All Fives 150, Block and Draw 100) and blocked-hand scoring by *opponents*. Both are common house rules, and each can be changed per tournament.
