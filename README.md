# ShareStream

Watch a video together in sync. The host starts a session and shares a 4-character code; guests join with it. The host controls play, pause and seek.

**Stack:** TypeScript, React + Vite, Node + Express, Socket.IO (Redis optional later).

## Run

```bash
npm install
npm run dev        # server :4000, client :5173
npm test           # server tests
```

## Accounts (optional)

Accounts are off by default. Set `MONGODB_URI` and the server enables register/login and a "Recent" list of sessions you hosted or joined:

```bash
MONGODB_URI=mongodb://localhost:27017/sharestream JWT_SECRET=change-me npm run dev
```

- `POST /api/auth/register`, `POST /api/auth/login` → `{ token, username }` (7-day JWT, bcrypt cost 12)
- `GET /api/history` (Bearer token) → last 20 sessions
- Server tests start an in-memory MongoDB; the first run downloads ~600 MB and can take a few minutes.

## Structure

```
server/   Express + Socket.IO (sessions, sync)
client/   React app (Home, Session)
shared/   Event/payload types used by both
```

## Scope (MVP)

- No accounts or names: a session is just a code.
- Video sources: direct `.mp4` / `.m3u8` URL, YouTube link.
- Sessions live in memory, expire after 24h or when the host leaves. Max 50 viewers.
- Codes are 4 characters (A-Z, 2-9, no look-alikes), case-insensitive.

## Socket events

| Event | Direction | Notes |
|---|---|---|
| `session:create {source}` | client → server | ack returns `SessionInfo` |
| `session:join {code}` | client → server | ack returns `SessionInfo` incl. current playback |
| `session:leave` | client → server | host leaving ends the session |
| `playback:update {position, playing}` | host → server | ignored from guests |
| `playback:state` | server → guests | position projected to send time |
| `viewers:count`, `session:ended` | server → all | |

## Jobs

- [x] 1. Workspace scaffold, README
- [x] 2. Server bootstrap (Express + Socket.IO, health)
- [x] 3. Session store + code generator
- [x] 4. Create / join / leave events, expiry
- [x] 5. Playback sync events
- [x] 6. Client shell + Home screen
- [x] 7. Session screen + player
- [x] 8. Client sync + drift correction
- [x] 9. Join rate limiting (5 failed joins/min/IP)
- [x] 11. Local files: each viewer opens the same file; only the name and playback state are shared
- [x] 12. Accounts + history (optional, needs MongoDB)
- [ ] 10. Redis store + Socket.IO Redis adapter, Dockerfile (deferred: only needed to run several server instances)

## How sync works

The host's player is the source of truth. On play, pause or seek, and every 3s while playing, the host sends `{position, playing}`. The server stores it and relays it to guests with the position projected to send time, so no clock sync is needed. Guests seek only if more than 0.5s off. Late joiners receive the current state in the join ack. If the browser blocks autoplay, the guest sees a "Tap to sync" button.

YouTube has no seek event in its IFrame API, so the host's changes are detected by polling every 500ms.
