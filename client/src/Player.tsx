import { useEffect, useRef } from "react";
import type { VideoSource } from "../../shared/types";

/** What the sync logic needs from any player implementation. */
export interface PlayerApi {
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  time(): number;
  playing(): boolean;
}

export interface PlayerProps {
  source: VideoSource;
  isHost: boolean;
  onReady: (api: PlayerApi) => void;
  /** Host changed play/pause/seek through the built-in controls */
  onHostChange: () => void;
}

export function Player(props: PlayerProps) {
  return (
    // Guests cannot touch the player; only the host controls work
    <div className={props.isHost ? "player" : "player locked"}>
      {props.source.type === "youtube" ? <YouTubePlayer {...props} /> : <HtmlPlayer {...props} />}
    </div>
  );
}

function HtmlPlayer({ source, isHost, onReady, onHostChange }: PlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const hostChange = useRef(onHostChange);
  hostChange.current = onHostChange;

  useEffect(() => {
    const v = ref.current!;
    let hls: { destroy(): void } | undefined;
    let cancelled = false;
    const isHls = /\.m3u8(\?|$)/i.test(source.url);

    if (isHls && !v.canPlayType("application/vnd.apple.mpegurl")) {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) return;
        const h = new Hls();
        h.loadSource(source.url);
        h.attachMedia(v);
        hls = h;
      });
    } else {
      v.src = source.url;
    }

    onReady({
      play: () => v.play(),
      pause: () => v.pause(),
      seek: (t) => (v.currentTime = t),
      time: () => v.currentTime,
      playing: () => !v.paused,
    });
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [source.url]);

  const notify = () => isHost && hostChange.current();
  return <video ref={ref} controls={isHost} playsInline onPlay={notify} onPause={notify} onSeeked={notify} />;
}

// ---- YouTube ----------------------------------------------------------

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<any> | undefined;
function loadYouTube(): Promise<any> {
  ytApi ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytApi;
}

export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/);
    return u.searchParams.get("v") ?? m?.[1] ?? null;
  } catch {
    return null;
  }
}

function YouTubePlayer({ source, isHost, onReady, onHostChange }: PlayerProps) {
  const host = useRef<HTMLDivElement>(null);
  const hostChange = useRef(onHostChange);
  hostChange.current = onHostChange;

  useEffect(() => {
    const id = youTubeId(source.url);
    if (!id) return;
    let player: any;
    let poll: number | undefined;
    let cancelled = false;
    const mount = document.createElement("div");
    host.current!.appendChild(mount);

    loadYouTube().then((YT) => {
      if (cancelled) return;
      let lastTime = 0;
      let lastPlaying = false;
      // The IFrame API has no seek event, so host changes are detected by polling
      const check = () => {
        const t: number = player.getCurrentTime?.() ?? 0;
        const playing = player.getPlayerState?.() === YT.PlayerState.PLAYING;
        const expected = lastPlaying ? lastTime + 0.5 : lastTime;
        if (isHost && (playing !== lastPlaying || Math.abs(t - expected) > 1.5)) hostChange.current();
        lastTime = t;
        lastPlaying = playing;
      };
      player = new YT.Player(mount, {
        videoId: id,
        width: "100%",
        height: "100%",
        playerVars: { controls: isHost ? 1 : 0, disablekb: isHost ? 0 : 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            poll = window.setInterval(check, 500);
            onReady({
              play: async () => player.playVideo(),
              pause: () => player.pauseVideo(),
              seek: (t) => player.seekTo(t, true),
              time: () => player.getCurrentTime(),
              playing: () => player.getPlayerState() === YT.PlayerState.PLAYING,
            });
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearInterval(poll);
      player?.destroy?.();
    };
  }, [source.url]);

  return <div ref={host} className="yt" />;
}
