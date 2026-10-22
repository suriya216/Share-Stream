import { randomInt } from "node:crypto";
import type { PlaybackState, VideoSource } from "../../shared/types.js";

/** Uppercase + digits without look-alikes (0/O, 1/I/L): 31^4 ≈ 923k codes */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_VIEWERS = 50;

export interface Session {
  code: string;
  hostId: string;
  source: VideoSource;
  playback: PlaybackState;
  members: Set<string>;
  expiresAt: number;
}

export function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

export class SessionStore {
  private sessions = new Map<string, Session>();

  create(hostId: string, source: VideoSource, now = Date.now()): Session {
    let code = generateCode();
    while (this.sessions.has(code)) code = generateCode();
    const session: Session = {
      code,
      hostId,
      source,
      playback: { position: 0, playing: false, updatedAt: now },
      members: new Set([hostId]),
      expiresAt: now + SESSION_TTL_MS,
    };
    this.sessions.set(code, session);
    return session;
  }

  get(code: string, now = Date.now()): Session | undefined {
    const s = this.sessions.get(normalizeCode(code));
    if (s && s.expiresAt <= now) {
      this.sessions.delete(s.code);
      return undefined;
    }
    return s;
  }

  delete(code: string): void {
    this.sessions.delete(code);
  }

  /** Removes expired sessions and returns them so callers can notify members. */
  sweep(now = Date.now()): Session[] {
    const expired = [...this.sessions.values()].filter((s) => s.expiresAt <= now);
    expired.forEach((s) => this.sessions.delete(s.code));
    return expired;
  }
}
