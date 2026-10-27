# KeyRush

A Formula-racing-inspired typing game. Your typing speed and accuracy drive your car; mistakes slow it down, sustained errors crash it, and correcting them lets you recover. Race AI bots solo, or friends in private rooms with server-authoritative multiplayer.

## Quick start

Requires Node.js 20+ (tested on Node 24).

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173 (Vite; proxies `/api` and `/socket.io` to the backend)
- Backend: http://localhost:4000 (Express + Socket.IO)

To play multiplayer locally, open the game in two browser windows (or a normal + private window), create a room in one and join with the code in the other. Phones on the same network can join via the "Network" URL Vite prints.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Backend (tsx watch) + frontend (Vite) together |
| `npm test` | Shared engine unit tests + backend multiplayer integration tests |
| `npm run typecheck` | TypeScript checks for all three packages |
| `npm run build` | Builds `frontend/dist` and bundles `backend/dist/server.js` |
| `npm start` | Runs the built backend (`NODE_ENV=production` recommended) |

## Project structure

```
shared/            Game rules used by BOTH client and server (single source of truth)
  src/constants.ts     All tunables: penalties, crash thresholds, light timings, limits
  src/typing/engine.ts Typing engine (cursor, errors, backspace, WPM, accuracy)
  src/racing/car.ts    Car model: typing performance -> speed/distance, crash/recovery
  src/bots/bot.ts      Bot drivers: generate keystrokes (incl. mistakes) through the engine
  src/passages/        Original passage library + seeded, duration-aware generator
  src/race/sim.ts      RaceSim: timing, false starts, fixed-step simulation, results
  src/scoring/         Deterministic ranking
  src/events.ts        Typed Socket.IO protocol
  test/                Unit tests
backend/
  src/server.ts        Entry point
  src/app.ts           Express app, REST endpoints, Socket.IO server, static hosting
  src/rooms/           RoomManager: rooms, codes, host, readiness, races, reconnects
  src/socket/          Event handlers with validation + rate limits
  src/validation/      Zod schemas and name sanitising
  src/persistence/     History store (MongoDB or in-memory fallback)
  test/                Socket.IO integration tests (real server + clients)
frontend/
  src/App.tsx          Screen flow
  src/race/controller.ts  SoloRace (local RaceSim + bots) and NetRace (prediction + server state)
  src/net/mpClient.ts  Socket connection, clock sync, rejoin
  src/game/            Canvas track, car art, start lights, typing panel
  src/screens/         Welcome, mode select, setups, lobby, race, results, stats
  src/services/        Sound (WebAudio), storage, history
```

## Game rules (as implemented)

**Typing.** Text is committed word by word: a correctly typed space locks the word, so backspace edits only the current word. The first wrong character makes every following character an active error until it is backspaced. At most 8 characters can be typed past an error. Held keys don't auto-repeat, and paste/drop is rejected.

**Formulas** (`shared/src/typing/engine.ts`, used everywhere):

- Raw WPM = (all typed characters / 5) / minutes
- Effective WPM = max(0, (correct-progress characters / 5) / minutes − 1 × active errors / minutes)
- Accuracy = correct keystrokes / (correct + error keystrokes) × 100. Corrected errors still count against accuracy.
- Minutes are floored at 1 second, so WPM can never divide by zero.

**Car.** Distance is measured in passage characters. The car chases your typed frontier (it can never pass it) at a speed set by your rolling 5-second typing rate. Each active error multiplies target speed by 0.62. With 3+ active errors the car is *critical*; 2.5 s critical, or 6 active errors, causes a **crash** (stopped for 1.6 s, then slower recovery acceleration). A crash never erases typed progress, but lost ground is only regained gradually through a capped catch-up boost. The simulation runs in fixed 50 ms steps, so frame rate never affects scoring.

**Start.** Five lights come on one second apart, followed by a random 0.4–2.6 s hold before lights out. The schedule is in server time; clients estimate their clock offset over several round trips. Typing before lights out is a jump start: input is locked until 2 s after lights out.

**Ranking.** 1) distance, 2) effective WPM, 3) accuracy, 4) player id (stable tie-break). Timed races always last the full duration. The passage is extended automatically, in the same order for everyone, when anyone gets within 600 characters of its end.

**Bots** type through the same engine and car model. Difficulty sets their WPM range (easy ≈ 22–40, medium ≈ 42–64, hard ≈ 68–98), timing jitter, error rate, how many characters they type before noticing a mistake, and hesitation. Your skill decides the result.

## Multiplayer architecture

- Server-authoritative: the server owns the passage seed, light schedule, race clock, every player's typing state and car, and the results. Clients send only keystroke operations (`race:input { seq, ops }`).
- Sequence numbers: a duplicate or replayed `seq` is ignored; a gap triggers a resync (`race:self`). The client predicts its own typing locally and reconciles by replaying unacknowledged inputs on top of the server state.
- Input is rate-limited per player (token bucket: 30 chars/s, burst 60). Payloads are validated with Zod. Room creation is limited per IP.
- State is broadcast at 10 Hz in compact snapshots. The full passage is sent once per race (plus append-only extensions).
- Each seat gets a secret reconnect token (kept in `sessionStorage`). A refresh or brief disconnect rejoins with progress and the race clock intact. Display names never grant identity. The grace period is 60 s in a race (then marked DNF) and 30 s in the lobby.
- Host leaves the lobby → host passes to the longest-connected player. Host drops mid-race → the race continues on the server.
- Room states: `WAITING → COUNTDOWN → RACING → FINISHED` (→ back to `WAITING`), or `CLOSED`.

## Persistence

Active races live in server memory. Final results are saved per profile (an anonymous id kept in `localStorage`): in MongoDB when `MONGODB_URI` is set, otherwise in memory. History is also cached in the browser, so the stats screen works when the server or database is down. Solo races are simulated in the browser and are stored with `source: "client"` (self-reported).

## Deployment

Single service (simplest, WebSocket-friendly):

```bash
npm ci
npm run build
NODE_ENV=production PORT=8080 STATIC_DIR=../frontend/dist npm start
```

`npm start` runs from `backend/`, so `STATIC_DIR` is relative to it. Use a host that supports long-lived WebSocket connections (Render, Fly.io, Railway, a VM, etc.). With more than one instance you need sticky sessions plus a shared room store or the Socket.IO Redis adapter. That is not implemented: rooms live in one process.

Split hosting: build the frontend with `VITE_SERVER_URL` and `VITE_API_URL` pointing at the backend, and set `CLIENT_ORIGINS` on the backend to the frontend origin.

## Testing

Automated (`npm test`, 44 tests):

- Typing engine: progress once per correct char, error penalties, backspace correction and history invariants, word locking, held-key cap, end-of-text, zero-elapsed WPM, smart-quote normalisation, control-char rejection.
- Racing: more WPM gives more distance, the frontier cap, crash on a sustained critical state, recovery after correction, determinism.
- Passages: determinism per seed, duration scaling, seamless extension, no sentence repeats, theme avoidance.
- Bots: difficulty ordering, real mistakes and corrections, deterministic simulation.
- Lights, false-start penalty, post-finish rejection, ranking tie-breaks.
- Multiplayer (real Socket.IO server and clients): unique codes, case-insensitive join, invalid/full rooms, name sanitising, host-only settings/start, readiness gate, host transfer, identical passage/duration/schedule, false start, duplicate seq ignored, fabricated result events ignored, identical results across clients, post-finish input ignored, disconnect/reconnect without losing progress, forged token rejected, lobby return with clean progress.

Manual checks are in [docs/MANUAL_TESTS.md](docs/MANUAL_TESTS.md).

## Known limitations

- Single process. Rooms and races live in memory, so a server restart ends active races.
- Anti-cheat is basic: rate limits, sequence numbers and server-side scoring. A scripted client typing at human-like speed can't be detected. Solo results are client-side and self-reported.
- Clock-offset estimation can't remove asymmetric network latency. The start time is shared, but players with high latency see lights-out slightly later.
- No accounts. Stats are tied to an anonymous browser profile id.
- The reference screenshot mentioned in the brief wasn't available, so the 5-light gantry follows the standard F1 layout (5 pods of 2 lights).
- Sounds are synthesised and simple. Fonts load from Google Fonts, with system fallbacks offline.
- Mobile keyboard handling was tested in Chrome's mobile emulation, not on physical iOS/Android devices.
