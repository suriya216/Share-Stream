import type { Server, Socket } from "socket.io";
import type { ClientToServer, PlaybackState, ServerToClient, SessionInfo, VideoSource } from "../../shared/types.js";
import { FailureLimiter } from "./ratelimit.js";
import { MAX_VIEWERS, normalizeCode, type Session, type SessionStore } from "./sessions.js";

type IO = Server<ClientToServer, ServerToClient>;
type Sock = Socket<ClientToServer, ServerToClient, {}, { code?: string; userId?: string }>;

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

/** Returns a cleaned source, or null if the URL is not usable. */
export function parseSource(src: VideoSource | undefined): VideoSource | null {
  if (!src || typeof src.url !== "string") return null;
  if (src.type === "local") {
    const name = src.url.trim();
    return name && name.length <= 255 ? { type: "local", url: name } : null;
  }
  let u: URL;
  try {
    u = new URL(src.url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const type = YOUTUBE_HOSTS.has(u.hostname) ? "youtube" : "url";
  return { type, url: u.toString() };
}

/** Playback state with position projected to the current server time. */
export function currentPlayback(s: Session, now = Date.now()): PlaybackState {
  const { position, playing, updatedAt } = s.playback;
  return { position: playing ? position + (now - updatedAt) / 1000 : position, playing, updatedAt: now };
}

export function toInfo(s: Session, socketId: string): SessionInfo {
  return {
    code: s.code,
    source: s.source,
    playback: currentPlayback(s),
    viewers: s.members.size,
    isHost: s.hostId === socketId,
  };
}

export function endSession(io: IO, store: SessionStore, s: Session, reason: string) {
  io.to(s.code).emit("session:ended", reason);
  io.in(s.code).socketsLeave(s.code);
  store.delete(s.code);
}

export type RecordFn = (userId: string | undefined, s: Session, role: "host" | "guest") => void;

export function registerHandlers(
  io: IO,
  store: SessionStore,
  limiter = new FailureLimiter(),
  record: RecordFn = () => {},
) {
  const leave = (socket: Sock, reason = "Host left the session") => {
    const code = socket.data.code;
    if (!code) return;
    socket.data.code = undefined;
    const s = store.get(code);
    if (!s) return;
    if (s.hostId === socket.id) return endSession(io, store, s, reason);
    s.members.delete(socket.id);
    socket.leave(code);
    io.to(code).emit("viewers:count", s.members.size);
  };

  io.on("connection", (socket: Sock) => {
    socket.on("session:create", (p, ack) => {
      if (typeof ack !== "function") return;
      const source = parseSource(p?.source);
      if (!source) return ack({ ok: false, error: "Enter a valid http(s) video link" });
      leave(socket);
      const s = store.create(socket.id, source);
      socket.data.code = s.code;
      socket.join(s.code);
      record(socket.data.userId, s, "host");
      ack({ ok: true, session: toInfo(s, socket.id) });
    });

    socket.on("session:join", (p, ack) => {
      if (typeof ack !== "function") return;
      const ip = socket.handshake.address;
      if (limiter.blocked(ip)) return ack({ ok: false, error: "Too many attempts, try again in a minute" });
      const s = typeof p?.code === "string" ? store.get(normalizeCode(p.code)) : undefined;
      // Same generic message for missing/expired to avoid leaking which codes exist
      if (!s) {
        limiter.fail(ip);
        return ack({ ok: false, error: "Session not found" });
      }
      if (s.members.size >= MAX_VIEWERS && !s.members.has(socket.id))
        return ack({ ok: false, error: "Session is full" });
      leave(socket);
      s.members.add(socket.id);
      socket.data.code = s.code;
      socket.join(s.code);
      io.to(s.code).emit("viewers:count", s.members.size);
      record(socket.data.userId, s, "guest");
      ack({ ok: true, session: toInfo(s, socket.id) });
    });

    socket.on("playback:update", (p) => {
      const s = socket.data.code ? store.get(socket.data.code) : undefined;
      if (!s || s.hostId !== socket.id) return; // host only
      if (!Number.isFinite(p?.position) || typeof p.playing !== "boolean") return;
      s.playback = { position: Math.max(0, p.position), playing: p.playing, updatedAt: Date.now() };
      socket.to(s.code).emit("playback:state", currentPlayback(s));
    });

    socket.on("session:leave", () => leave(socket));
    socket.on("disconnect", () => leave(socket));
  });
}
