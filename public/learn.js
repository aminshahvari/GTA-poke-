// Poker school: lessons shown in the Learn tab. Plain data, rendered by app.js.
window.LEARN = {

terms: `
<ol class="terms">
<li><b>Private, invite-only club.</b> Members join only by a personal invite from the organizer. You must be 19 or older and live in Canada (outside Québec). One account per person.</li>
<li><b>Free to play. No purchase necessary.</b> There are no fees, buy-ins, subscriptions or donations to join, play or win prizes, and paying for anything would never improve your chances.</li>
<li><b>Chips have no value.</b> Tournament chips are for play only. They can't be bought, sold, transferred or cashed out, and they reset after each tournament.</li>
<li><b>No wagering.</b> No betting on games or between members. The club takes no rake, fee or share of anything.</li>
<li><b>Points.</b> Points are earned only by finishing places, as shown on the leaderboard. They have no cash value, can't be bought, sold, transferred or exchanged for cash.</li>
<li><b>Prizes.</b> Prizes are chosen, bought and paid for by the organizer, at the organizer's discretion. The prize list shows each prize's quantity and approximate value. Points can only be used for listed prizes, while they last. The organizer may swap a prize for one of equal or greater value. Prizes are earned by tournament results, not by random draw.</li>
<li><b>Skill-testing question.</b> To claim a prize you must answer a math question correctly, without help.</li>
<li><b>Checks.</b> The organizer may confirm your age and identity before giving a prize. Travel or event prizes depend on meeting that event's age, travel and entry rules.</li>
<li><b>Fair play.</b> Sharing cards, soft-playing a friend, chip dumping, more than one account, or bots means disqualification and loss of points and prizes. People who live together or share a connection are seated at different tables when possible.</li>
<li><b>Changes.</b> The organizer may change, pause or end the prize program with notice. Unused points have no value and no cash alternative.</li>
<li><b>Taxes and costs.</b> Winners are responsible for any taxes or costs not included in a prize. This is a private social club, not a gambling service.</li>
<li><b>Questions.</b> Ask the organizer. Their decisions on rules and prizes are final.</li>
</ol>`,
lessons: [
{ id: 'rankings', title: 'Hand rankings', mins: 2, body: `
<p>You make the best five-card hand from your two cards plus the five on the board. You can use both, one or none of your own cards.</p>
<table class="ltable"><tr><th>Hand</th><th>Example</th><th>What it is</th></tr>
<tr><td>Straight flush</td><td class="cards">9♥ 8♥ 7♥ 6♥ 5♥</td><td>Five in a row, same suit. A-K-Q-J-T is a royal flush.</td></tr>
<tr><td>Four of a kind</td><td class="cards">Q♠ Q♥ Q♦ Q♣ 7♠</td><td>Four cards of one rank.</td></tr>
<tr><td>Full house</td><td class="cards">8♠ 8♥ 8♦ K♣ K♠</td><td>Three of a kind plus a pair. Higher three wins.</td></tr>
<tr><td>Flush</td><td class="cards">A♦ J♦ 8♦ 6♦ 2♦</td><td>Five of one suit. Highest card wins, then the next.</td></tr>
<tr><td>Straight</td><td class="cards">T♣ 9♦ 8♠ 7♥ 6♣</td><td>Five in a row. A-2-3-4-5 is the lowest straight.</td></tr>
<tr><td>Three of a kind</td><td class="cards">7♠ 7♥ 7♦ A♣ 4♠</td><td>Three of one rank.</td></tr>
<tr><td>Two pair</td><td class="cards">J♠ J♥ 4♦ 4♣ A♠</td><td>Higher pair first, then lower pair, then the kicker.</td></tr>
<tr><td>Pair</td><td class="cards">T♠ T♥ A♦ 8♣ 3♠</td><td>Two of one rank. Kickers break ties.</td></tr>
<tr><td>High card</td><td class="cards">A♠ Q♥ 9♦ 6♣ 3♠</td><td>Nothing else. Highest cards in order.</td></tr></table>
<p class="tipbox"><b>Kickers matter.</b> With A♠ K♦ against A♣ 9♥ on a board of A♥ 7♣ 4♠ 2♦ J♠, both have a pair of aces, but your king kicker wins. Suits never break a tie; equal hands split the pot.</p>` },

{ id: 'flow', title: 'How a hand works', mins: 3, body: `
<ol class="steps"><li><b>Blinds and ante.</b> The two players left of the button post the small blind and big blind. From the first level there is also an ante. Most of our games use the online style: every player posts a small ante each hand. The organizer can instead pick the WSOP/WPT live style, where the big blind posts one ante for the whole table (the "big blind ante").</li>
<li><b>Preflop.</b> Everyone gets two cards. Action starts left of the big blind. You can fold, call, or raise.</li>
<li><b>Flop, turn, river.</b> Three shared cards, then one, then one. Each street has a betting round, starting with the first player still in on the button's left.</li>
<li><b>Showdown.</b> If two or more players are left after the river, the best hand wins. The app shows the winning hand and splits pots automatically.</li></ol>
<h4>Your options</h4>
<ul><li><b>Check</b>: pass when nobody has bet.</li><li><b>Bet / Raise</b>: put chips in. A raise must be at least as big as the last bet or raise in that round.</li>
<li><b>Call</b>: match the current bet.</li><li><b>Fold</b>: give up the hand.</li><li><b>All-in</b>: everything you have. If you can't cover a bet you can still call all-in, and side pots are made for the rest.</li></ul>
<p class="tipbox">The button moves one seat each hand. Being on the button is the best seat: you act last on every street after the flop.</p>` },

{ id: 'position', title: 'Position: why your seat matters', mins: 3, body: `
<p>Acting <b>after</b> your opponents is a huge advantage: you see what they do before you decide. That's why the same hand can be a raise on the button and a fold under the gun.</p>
<table class="ltable"><tr><th>Seat</th><th>Name</th><th>How to play</th></tr>
<tr><td>Early</td><td>UTG, UTG+1, UTG+2</td><td>Most players still to act. Play only strong hands.</td></tr>
<tr><td>Middle</td><td>LJ, HJ</td><td>A little wider.</td></tr>
<tr><td>Late</td><td>CO, BTN</td><td>Best seats. Open much wider and steal the blinds.</td></tr>
<tr><td>Blinds</td><td>SB, BB</td><td>You act last preflop but first after the flop. Defend the big blind against small raises, but don't overplay weak hands.</td></tr></table>
<p class="tipbox">Your hand review shows your position on every hand. Look for a pattern: most players lose most of their chips playing too many hands from early position and the small blind.</p>` },

{ id: 'starting', title: 'Starting hands', mins: 4, body: `
<p>When nobody has entered the pot yet, <b>raise or fold</b>. Don't just call the big blind ("limp"). A good opening raise is 2 to 2.5 big blinds.</p>
<table class="ltable"><tr><th>Position</th><th>Open-raise with (about 9 players, 20+ BB)</th></tr>
<tr><td>Early</td><td>88+, AJs+, AQo+, KQs</td></tr>
<tr><td>Middle</td><td>66+, ATs+, AJo+, KJs+, KQo, QJs, JTs</td></tr>
<tr><td>Cutoff</td><td>22+, A2s+, ATo+, K9s+, KJo+, Q9s+, QJo, J9s+, T9s, 98s</td></tr>
<tr><td>Button</td><td>22+, any suited ace, A7o+, K7s+, KTo+, Q8s+, QTo+, J8s+, JTo, T8s+, 97s+, 87s, 76s</td></tr>
<tr><td>Small blind</td><td>Similar to the cutoff when it's folded to you</td></tr></table>
<p><b>"s"</b> means suited, <b>"o"</b> means offsuit, <b>"+"</b> means that hand and better (88+ is 88, 99, TT, JJ, QQ, KK, AA).</p>
<h4>When someone already raised</h4>
<ul><li>Re-raise (3-bet) with QQ+, AK, and sometimes AQs or JJ.</li><li>Call with pairs and strong suited hands that play well: TT-77, AQ, AJs, KQs.</li><li>Fold the rest, even hands that look pretty, like KJo or A9o.</li></ul>` },

{ id: 'tournament', title: 'Tournament thinking', mins: 4, body: `
<p>A tournament is not a cash game. Your chips can't be bought back, the blinds keep rising, and you only get paid if you outlast most of the field.</p>
<h4>Count your stack in big blinds</h4>
<p>30,000 chips at 100/200 is 150 BB: deep and relaxed. The same 30,000 at 1,500/3,000 is just 10 BB: time to go all-in or fold. The clock and your stack are always shown at the top of the table.</p>
<table class="ltable"><tr><th>Stack</th><th>Plan</th></tr>
<tr><td>40+ BB</td><td>Play normally. Open with good hands, see flops, avoid huge pots without a huge hand.</td></tr>
<tr><td>20 to 40 BB</td><td>Fewer speculative hands. Re-raise all-in becomes an option against late-position opens.</td></tr>
<tr><td>12 to 20 BB</td><td>Open less often; when you do, be ready to get it in.</td></tr>
<tr><td>Under 12 BB</td><td>All-in or fold. A small raise only commits you without scaring anyone.</td></tr></table>
<h4>The stages</h4>
<ul><li><b>Early:</b> blinds are small. Play tight, don't risk your tournament on one pair.</li>
<li><b>Middle:</b> antes arrive. Stealing blinds from late position becomes important.</li>
<li><b>Bubble:</b> one or two eliminations from the money. Medium stacks should tighten up; big stacks can pressure them.</li>
<li><b>Final table:</b> every place pays more. Think about how many chips the others have, not just your cards.</li></ul>` },

{ id: 'patience', title: 'Patience and discipline', mins: 3, body: `
<p>Most tournaments are lost, not won. The most common way to lose: getting impatient and playing hands that aren't good enough.</p>
<ul><li><b>Fold a lot.</b> Good players fold about 75 to 80% of their hands before the flop. Your review shows what share you played (VPIP). If it's above 30%, you're probably playing too many.</li>
<li><b>Don't chase.</b> Calling bets with a weak draw "because it might hit" is how stacks disappear. Check the price first (see Pot odds).</li>
<li><b>Survive the bad beat.</b> When you get it in as a favorite and lose, you did the right thing. The hand review tells you your equity when the money went in. Don't play the next hands angry ("tilt").</li>
<li><b>Big pot, big hand.</b> One pair is rarely good enough to put your whole stack in after the flop.</li>
<li><b>Take a breath.</b> You have a time bank. Use it on big decisions. Ask: what could they have? What do I beat?</li>
<li><b>Stay at the table.</b> If you time out, you're marked away and every hand you're dealt is folded while you're gone, even in the big blind. Tap "I'm back" right away.</li></ul>` },

{ id: 'odds', title: 'Pot odds and outs', mins: 4, body: `
<p><b>Pot odds</b> tell you how often you need to win to call. Price = call ÷ (pot + call).</p>
<p class="tipbox">Pot is 3,000 and your opponent bets 1,000. You call 1,000 to win 4,000 (the pot plus the bet). You need to win 1,000 ÷ 5,000 = <b>20%</b> of the time.</p>
<p><b>Outs</b> are the cards that make your hand. Quick estimate (the rule of 2 and 4):</p>
<ul><li>On the flop, all-in or seeing both cards: outs × 4 ≈ % to hit.</li><li>With one card to come: outs × 2 ≈ % to hit.</li></ul>
<table class="ltable"><tr><th>Draw</th><th>Outs</th><th>Flop → river</th><th>Next card</th></tr>
<tr><td>Flush draw</td><td>9</td><td>35%</td><td>19%</td></tr>
<tr><td>Open-ended straight</td><td>8</td><td>32%</td><td>17%</td></tr>
<tr><td>Gutshot</td><td>4</td><td>16%</td><td>9%</td></tr>
<tr><td>Two overcards</td><td>6</td><td>24%</td><td>13%</td></tr></table>
<p>If your chance to hit is bigger than the price, calling is profitable. If not, fold, unless you're also likely to win more when you hit.</p>` },

{ id: 'short', title: 'Short stack: all-in or fold', mins: 3, body: `
<p>With 10 big blinds or less and nobody in the pot yet, move all-in with these hands (roughly, about 9 players):</p>
<table class="ltable"><tr><th>Seat</th><th>10 BB</th><th>6 BB</th></tr>
<tr><td>Early</td><td>66+, ATs+, AJo+, KQs</td><td>44+, A8s+, ATo+, KJs+</td></tr>
<tr><td>Middle</td><td>44+, A8s+, ATo+, KTs+, QJs</td><td>22+, A2s+, A8o+, K9s+, QTs+</td></tr>
<tr><td>Cutoff</td><td>22+, A2s+, A8o+, K9s+, KJo, QTs+</td><td>22+, any ace, K7s+, KTo+, Q9s+</td></tr>
<tr><td>Button</td><td>22+, any ace, K7s+, KTo+, Q9s+, J9s+, T9s</td><td>Most of the deck: any pair, ace, king, suited connectors</td></tr>
<tr><td>Small blind</td><td>Very wide: any pair, ace, most kings, suited connectors</td><td>Almost any two cards</td></tr></table>
<p><b>Calling</b> someone else's all-in needs a stronger hand than shoving does, because you can't make them fold.</p>
<p class="tipbox">Each orbit costs you about 1.5 BB plus the ante. Waiting for aces with 8 BB means blinding away; pick a good spot and push.</p>` },

{ id: 'bubble', title: 'The bubble and the money', mins: 3, body: `
<p>About 15% of the field gets paid. The player who finishes one place short of the money is "on the bubble".</p>
<ul><li><b>Medium stack:</b> fold marginal hands. Losing all your chips just before the money costs far more than winning a small pot gains.</li>
<li><b>Short stack:</b> you still need chips. Pick spots where you're first in, and let other short stacks bust first when you can.</li>
<li><b>Big stack:</b> this is your moment. Raise more often; medium stacks don't want to call you.</li></ul>
<p>The coach flags calls of a big part of your stack near the bubble so you can check whether the risk was worth it.</p>` },

{ id: 'review', title: 'Using your hand review', mins: 2, body: `
<p>Every hand you play is saved under <b>Learn → My hands</b>. You see your cards, your seat, every action, the board and the result. The coach adds notes:</p>
<ul><li><span class="nk mistake">Mistake</span> a decision that loses chips over time (limping, calling off light, folding for a tiny price…).</li>
<li><span class="nk tip">Tip</span> a spot where a better play usually exists.</li>
<li><span class="nk good">Good</span> a play that's solid.</li>
<li><span class="nk luck">Luck</span> your equity when all the chips went in, so you can tell a bad beat from a bad call.</li></ul>
<p>Check your stats at the top: hands played, how often you put money in (VPIP), how often you raised (PFR) and how often you limped. Pick one leak, fix it next tournament.</p>
<p class="tipbox">The coach uses simple, well-known rules of thumb, not a solver. Treat its notes as a second opinion to think about, not the final word.</p>` }
],

rules: `
<h4>Club and prize terms</h4><p>Free to play, no purchase necessary. Chips and points have no cash value. Prizes are paid for by the organizer. Full terms are on the sign-up screen and below.</p>
<details class="terms-d"><summary>Read the full club and prize terms</summary>%%TERMS%%</details>
<p>These are the tournament rules this club plays by. They follow the Tournament Directors Association (TDA) rules used by the WSOP and WPT, adapted for an online table where the software deals.</p>
<h4>Blinds, antes and the button</h4>
<ul><li>Blinds go up at the end of each level. A new level starts with the next hand.</li>
<li>We use the WSOP Main Event blind structure: 100/200, then 200/300, 200/400 and so on, with an ante from level 1.</li>
<li><b>Ante, online style</b> (the default): every player posts an ante of about one eighth of the big blind before the cards are dealt (25 at 100/200). Antes go into the pot but don't count toward the bet you have to call. A player who can't cover the ante is all-in for what they have.</li>
<li><b>Ante, WSOP/WPT live style</b> (if the organizer picks it): the big blind posts one ante for the whole table, equal to the big blind. If the big blind can't cover both, the blind is posted first and the rest goes to the ante.</li>
<li><b>Tables:</b> the organizer picks 9-handed (WSOP/WPT), 8-handed or 6-max. A new table opens for every full table's worth of players. As players bust, tables are balanced and broken until everyone left plays at one final table.</li>
<li><b>Late registration:</b> if the organizer turns it on, new players can join after the start (until the end of level 2, 4 or 6) with a full starting stack. They're seated at the table with the fewest players, or at a new table when all are full. Once you're knocked out you can't join the same tournament again.</li>
<li><b>Time to act:</b> the organizer sets 10, 15, 20 or 30 seconds per decision. When it runs out you get your time bank (30 seconds for the whole tournament). When that's gone too, your hand is checked or folded.</li>
<li>The button moves by the "dead button" rule, so nobody skips or pays the big blind twice when players bust.</li>
<li>Heads-up, the button posts the small blind and acts first before the flop, last after it.</li></ul>
<h4>Betting (no-limit)</h4>
<ul><li>The minimum bet is the big blind. A raise must be at least the size of the largest bet or raise already made in that round.</li>
<li>An all-in that's less than a full raise doesn't reopen the betting for players who already acted and aren't facing at least a full raise.</li>
<li>There's no limit on the number of raises.</li></ul>
<h4>Showdown and pots</h4>
<ul><li>Cards speak: the best hand wins.</li><li>At showdown the last player who bet or raised on the river shows first; if the river was checked, the first player left of the button shows first. Winning hands are always shown; losing hands are mucked automatically.</li><li>When a player is all-in and the betting is over, all hands are turned face up before the remaining cards are dealt.</li>
<li>Side pots are built automatically. A player can only win the pots they put chips into.</li><li>Equal hands split the pot. An odd chip goes to the first player left of the button.</li></ul>
<h4>Eliminations and prizes</h4>
<ul><li>If two players bust in the same hand at the same table, the one who started the hand with more chips (after the big blind ante) finishes higher. Equal stacks tie and share the places.</li><li><b>Hand-for-hand:</b> when one more elimination reaches the money and there are 2 or more tables, every table plays one hand and waits for the others. Players who bust in the same hand-for-hand round at different tables tie and share those places.</li>
<li>Like the WSOP, the top 15% of the field finish "in the money" (at least the winner). Those places earn the most points.</li></ul>
<h4>Tables</h4>
<ul><li>Tables are kept balanced. When a table is 2 or more players short, the player who is next to be big blind at the bigger table moves, and takes the seat that will post the big blind soonest.</li><li>As players bust, tables break and players move to random seats. Nobody is seated between the small blind and the button, so nobody skips the blinds.</li></ul>
<h4>Time and absence</h4>
<ul><li>You have a time bank for each decision. If it runs out, you check if you can, otherwise fold, and you're marked away.</li>
<li>While away you're still dealt in and post blinds and antes, but your hand is dead (folded) every time, as at the WSOP. Tap "I'm back" to play again.</li>
<li>The director can pause the clock for breaks.</li></ul>
<h4>Etiquette</h4>
<ul><li>One player, one account. No sharing hands with others at the table, no outside help.</li><li>Be kind to each other. The director's decisions are final.</li></ul>`
};
window.LEARN.rules = window.LEARN.rules.replace('%%TERMS%%', window.LEARN.terms);

// Change log shown to the organizer in the Director tab, newest first.
window.LEARN.news = [
  { date: 'Oct 15, 2026', items: [
    'Tables can be 6-max, 8-handed or 9-handed (Change settings). 6-max is the default.',
    'Late registration: players can join after the start, until the end of level 2, 4 or 6. They get a full stack and the emptiest seat; a new table opens when all are full.',
    'Fixed: when two tables were breaking at the same time a moved player could lose their seat. Players are never dropped now.',
    'New action buttons like the big apps: Fold / Check-Call / Raise, a sizing panel (2.5-4 BB before the flop, ⅓-pot to all-in after), and pre-actions (Check/Fold, Check, Call any) while you wait.',
    'Every player posts an ante (online style). The WSOP big blind ante is still available in settings.',
    'Time to act: 10, 15, 20 or 30 seconds, plus a 30-second time bank per player for the whole tournament.',
    'Play again: one tap on the Tournament tab opens the next tournament with the same settings. Invite and Start now are there too.',
    'Group invite links: one link for a WhatsApp or Telegram group, up to 20 people, 7 days. Personal one-time links still work.',
    'Table chat with quick phrases and bubbles. Tap a player to throw a tomato, rose, beer and more. You can turn chat off or mute someone in Director.',
    'Provably fair shuffle: a sealed secret plus a public random number (drand) for every hand. After a tournament anyone can tap "Check the shuffle" to verify every deck.',
    'Faster pace between actions and hands.',
    'Start now is greyed out until at least 2 players have joined.'
  ] },
  { date: 'Oct 14, 2026', items: [
    'WSOP/WPT tournament rules: levels, dead button, showdown order, hand-for-hand at the bubble, tie rules.',
    'Hand review with a coach, poker lessons, club rules and the Learn tab.',
    'Points for every finish and a prize shop you stock yourself.',
    'People in the same home, on the same internet or on the same phone are seated at different tables.',
    'Install on your phone and share invites in one tap.'
  ] }
];
