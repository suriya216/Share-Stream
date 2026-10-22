/** "local": each viewer opens the same file on their device; `url` holds only the file name */
export type SourceType = "url" | "youtube" | "local";

export interface PlaybackState {
  /** Position in seconds at `updatedAt` */
  position: number;
  playing: boolean;
  /** Server time (ms) when position was captured */
  updatedAt: number;
}

export interface VideoSource {
  type: SourceType;
  url: string;
}

export interface SessionInfo {
  code: string;
  source: VideoSource;
  playback: PlaybackState;
  viewers: number;
  isHost: boolean;
}

export type Ack<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServer {
  "session:create": (p: { source: VideoSource }, ack: (r: Ack<{ session: SessionInfo }>) => void) => void;
  "session:join": (p: { code: string }, ack: (r: Ack<{ session: SessionInfo }>) => void) => void;
  "session:leave": () => void;
  /** Host only */
  "playback:update": (p: { position: number; playing: boolean }) => void;
}

export interface ServerToClient {
  "playback:state": (s: PlaybackState) => void;
  "viewers:count": (n: number) => void;
  "session:ended": (reason: string) => void;
}
