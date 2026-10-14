# Stacked Live Club

A private, invite-only poker tournament club for friends. No computer players: every seat is a real person on their phone.

- No-limit Hold'em tournaments, 1 table or many. Players are balanced between tables and tables break as the field shrinks.
- The owner (tournament director) creates tournaments, starts them by hand or on a daily/weekly schedule, can pause, resume, end, invite and remove members.
- Friends join with a single-use invite link, pick a name and a PIN. Works in any phone browser and can be added to the home screen.
- Leaderboard with points across tournaments (week, 30 days, all time).
- The server deals and decides everything, so nobody can see anyone else's cards.

## Run it

```
npm install
OWNER_CODE=pick-a-secret npm start
```

Open http://localhost:3000, enter the setup code (`OWNER_CODE`) and pick your name and PIN. You are the owner.

## Settings (environment variables)

| Name | What it does |
| --- | --- |
| `OWNER_CODE` | Required. The one-time code that creates the owner account. |
| `PORT` | Port to listen on (default 3000). |
| `DATABASE_URL` | Postgres connection string. When set, the club is saved in Postgres. |
| `PGSSL` | Set to `1` when the database needs SSL. |
| `DATA_FILE` | Without Postgres, the club is saved to this JSON file (default `data/club.json`). |
| `TIME_BANK_MS` | Time each player has to act (default 30000). |

## Tests

```
npm test
```

Runs the hand evaluator, rules, a long simulation, and a full server test with many websocket players (pass a player count to `node test/t_server.js 60`).
