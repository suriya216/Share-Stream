# ShareStream

Watch a video together, in sync. The host starts a session and shares a 4-character code; guests join with it. Only the host controls play, pause and seek.

**Live demo:** <https://stream-share-vv00.onrender.com/> (free Render instance, so the first load after idle can take ~50s)

**Stack:** TypeScript, React 18 + Vite, Node + Express, Socket.IO, hls.js. MongoDB is optional (accounts and history).

## Features

- **Sources:** direct video URL (`.mp4`, `.m3u8` via hls.js), YouTube link, or a local file (each viewer opens the same file; only the file name and playback state are shared).
- **Host-driven sync** with drift correction and late-join support.
- **Short codes:** 4 characters from `A-Z` / `2-9` without look-alikes (no `0 O 1 I L`), case-insensitive.
- **Limits:** up to 50 viewers per session; sessions expire after 24h or when the host leaves.
- **Join rate limiting:** 5 failed joins per minute per IP.
- **Optional accounts:** register/login and a "Recent" list of the last 20 sessions you hosted or joined.

## Getting started

Requires Node 20.19+ (or 22.12+) and npm.

```bash
npm install
npm run dev        # server on :4000, client on :5173
npm test           # server tests (vitest)
npm run build      # build server (dist/) and client (client/dist)
npm start -w server  # production: serves API, Socket.IO and the built client
```

Open http://localhost:5173, start a session as host, and open the same page in another tab or device to join with the code.

### Enabling accounts

Accounts are off by default. Set `MONGODB_URI` and the server enables auth and history:

```bash
MONGODB_URI=mongodb://localhost:27017/sharestream JWT_SECRET=change-me npm run dev
```

The client detects this through `GET /health` (`{ ok, accounts }`).

### Configuration

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `PORT` | server | `4000` | HTTP/Socket.IO port |
| `CLIENT_ORIGIN` | server | `http://localhost:5173` | Allowed CORS origin (set to your public URL in production) |
| `MONGODB_URI` | server | unset | Enables accounts + history |
| `JWT_SECRET` | server | random per start | Signs login tokens; set it, or logins reset on restart |
| `VITE_SERVER_URL` | client (build time) | dev: `<page host>:4000`; production build: same origin | Server URL |

## Deployment (Render)

The server also serves the built client, so one Web Service runs everything.

| Setting | Value |
|---|---|
| Build command | `npm install && npm run build` |
| Start command | `npm start -w server` |
| Environment | `CLIENT_ORIGIN=https://<your-service>.onrender.com`, `JWT_SECRET=<long random string>`, optional `MONGODB_URI` |

Sessions are in memory, so a restart or free-tier sleep ends active sessions.

## Project structure

```
server/src/
  index.ts        Entry point; connects MongoDB if configured
  app.ts          Express + Socket.IO setup, CORS, static client serving, expiry sweeper (every 60s)
  sessions.ts     In-memory SessionStore, code generation, TTL/limits
  socket.ts       Socket event handlers, source validation, playback projection
  ratelimit.ts    Fixed-window FailureLimiter
  auth.ts         /api auth + history routes, JWT, history recording
  db.ts           Mongoose models (User, History)
  *.test.ts       Tests for auth, rate limiting, sessions, sockets
client/src/
  App.tsx, Home.tsx, Session.tsx, Player.tsx, Auth.tsx, History.tsx
  socket.ts       Socket.IO client (sends JWT in handshake)
  account.ts      Server URL, account storage, REST helpers
shared/types.ts   Event and payload types used by both sides
```

## Socket events

| Event | Direction | Notes |
|---|---|---|
| `session:create {source}` | client → server | Ack returns `SessionInfo`; source must be an http(s) URL (or a local file name) |
| `session:join {code}` | client → server | Ack returns `SessionInfo` including current playback |
| `session:leave` | client → server | Host leaving ends the session |
| `playback:update {position, playing}` | host → server | Ignored from guests |
| `playback:state` | server → guests | Position projected to send time |
| `viewers:count` | server → all | |
| `session:ended` | server → all | Host left or session expired |

## REST API (accounts enabled only)

| Endpoint | Notes |
|---|---|
| `GET /health` | `{ ok, accounts }` (always available) |
| `POST /api/auth/register` | Username 3-30 chars (`a-z 0-9 _`), password 8-72 chars → `{ token, username }` (7-day JWT, bcrypt cost 12) |
| `POST /api/auth/login` | → `{ token, username }`; 5 failures/min/IP, then 429 |
| `GET /api/history` | Bearer token required; last 20 sessions |

Server tests use an in-memory MongoDB; the first run downloads it and can take a few minutes.

## How sync works

The host's player is the source of truth. On play, pause or seek, and every 3s while playing, the host sends `{position, playing}`. The server stores it and relays it to guests with the position projected to send time, so no clock sync is needed. Guests seek only if more than 0.5s off. Late joiners receive the current state in the join ack. If the browser blocks autoplay, the guest sees a "Tap to sync" button.

YouTube's IFrame API has no seek event, so the host's changes are detected by polling every 500ms.
