import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlaybackState, SessionInfo, VideoSource } from "../../shared/types";
import { Player, type PlayerApi } from "./Player";
import { socket } from "./socket";

/** Guests seek only when further than this (seconds) from the host */
const DRIFT_TOLERANCE = 0.5;
const GUEST_CHECK_MS = 2000;
const HOST_HEARTBEAT_MS = 3000;

interface Props {
  session: SessionInfo;
  initialFile?: File;
  onExit: (notice?: string) => void;
}

export function Session({ session, initialFile, onExit }: Props) {
  const { isHost } = session;
  const [file, setFile] = useState<File | undefined>(initialFile);
  const isLocal = session.source.type === "local";
  // Local files play from a blob URL on this device only
  const playable = useMemo<VideoSource | null>(() => {
    if (!isLocal) return session.source;
    return file ? { type: "url", url: URL.createObjectURL(file) } : null;
  }, [isLocal, file, session.source]);
  useEffect(() => () => {
    if (isLocal && playable) URL.revokeObjectURL(playable.url);
  }, [isLocal, playable]);
  const [viewers, setViewers] = useState(session.viewers);
  const [copied, setCopied] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const api = useRef<PlayerApi | null>(null);
  const latest = useRef<{ state: PlaybackState; receivedAt: number }>({
    state: session.playback,
    receivedAt: Date.now(),
  });

  // Guest: move the local player to where the host is now
  const apply = useCallback(async () => {
    const a = api.current;
    if (!a) return;
    const { state, receivedAt } = latest.current;
    const target = state.playing ? state.position + (Date.now() - receivedAt) / 1000 : state.position;
    if (Math.abs(a.time() - target) > (state.playing ? DRIFT_TOLERANCE : 0.1)) a.seek(target);
    if (state.playing && !a.playing()) {
      try {
        await a.play();
        setBlocked(false);
      } catch {
        setBlocked(true); // browser blocked autoplay until the user taps
      }
    } else if (!state.playing && a.playing()) {
      a.pause();
    }
  }, []);

  // Host: publish current state
  const publish = useCallback(() => {
    const a = api.current;
    if (a) socket.emit("playback:update", { position: a.time(), playing: a.playing() });
  }, []);

  useEffect(() => {
    socket.on("viewers:count", setViewers);
    socket.on("session:ended", onExit);
    return () => {
      socket.off("viewers:count", setViewers);
      socket.off("session:ended", onExit);
    };
  }, [onExit]);

  useEffect(() => {
    if (isHost) {
      const t = setInterval(() => api.current?.playing() && publish(), HOST_HEARTBEAT_MS);
      return () => clearInterval(t);
    }
    const onState = (state: PlaybackState) => {
      latest.current = { state, receivedAt: Date.now() };
      apply();
    };
    socket.on("playback:state", onState);
    const t = setInterval(apply, GUEST_CHECK_MS);
    return () => {
      socket.off("playback:state", onState);
      clearInterval(t);
    };
  }, [isHost, apply, publish]);

  const leave = () => {
    socket.emit("session:leave");
    onExit();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(session.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="session">
      <header>
        <button className="code-chip" onClick={copy} title="Copy code">
          {copied ? "Copied" : session.code}
        </button>
        <span className="muted">
          {viewers} watching · {isHost ? "You control playback" : "Host controls playback"}
        </span>
        <button className="ghost" onClick={leave}>
          {isHost ? "End" : "Leave"}
        </button>
      </header>

      <div className="stage">
        {playable ? (
          <Player
            key={playable.url}
            source={playable}
            isHost={isHost}
            onReady={(a) => {
              api.current = a;
              if (!isHost) apply();
            }}
            onHostChange={publish}
          />
        ) : (
          <div className="pick">
            <p>
              The host is playing <b>{session.source.url}</b>. Choose the same file from your device.
            </p>
            <label className="primary pick-btn">
              Choose file
              <input type="file" accept="video/*" hidden onChange={(e) => setFile(e.target.files?.[0])} />
            </label>
          </div>
        )}
        {blocked && (
          <button className="primary overlay" onClick={apply}>
            Tap to sync
          </button>
        )}
      </div>
    </div>
  );
}
