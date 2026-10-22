import { useRef, useState, type FormEvent } from "react";
import type { Ack, SessionInfo, VideoSource } from "../../shared/types";
import { socket } from "./socket";

type Result = Ack<{ session: SessionInfo }>;

export function Home({ onEnter }: { onEnter: (s: SessionInfo, file?: File) => void }) {
  const [tab, setTab] = useState<"start" | "join">("start");
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const ready = tab === "start" ? !!file || !!value.trim() : !!value.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const done = (r: Result) => {
      setBusy(false);
      if (r.ok) onEnter(r.session, file ?? undefined);
      else setError(r.error);
    };
    if (tab === "start") {
      // Local files never leave the device: only the name is shared
      const source: VideoSource = file ? { type: "local", url: file.name } : { type: "url", url: value };
      socket.emit("session:create", { source }, done);
    } else {
      socket.emit("session:join", { code: value }, done);
    }
  };

  const switchTab = (t: "start" | "join") => {
    setTab(t);
    setValue("");
    setFile(null);
    setError("");
  };

  return (
    <form className="card" onSubmit={submit}>
      <div className="tabs">
        <button type="button" className={tab === "start" ? "active" : ""} onClick={() => switchTab("start")}>
          Start
        </button>
        <button type="button" className={tab === "join" ? "active" : ""} onClick={() => switchTab("join")}>
          Join
        </button>
      </div>

      {tab === "start" ? (
        <>
          {file ? (
            <div className="file-chip">
              <span>{file.name}</span>
              <button type="button" className="ghost" onClick={() => setFile(null)}>
                ✕
              </button>
            </div>
          ) : (
            <>
              <input
                autoFocus
                placeholder="Paste a video or YouTube link"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <button type="button" className="ghost" onClick={() => picker.current?.click()}>
                or choose a file from this device
              </button>
            </>
          )}
          <input
            ref={picker}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </>
      ) : (
        <input
          autoFocus
          className="code"
          placeholder="CODE"
          maxLength={4}
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
        />
      )}

      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || !ready}>
        {tab === "start" ? "Start watching" : "Join"}
      </button>
    </form>
  );
}
