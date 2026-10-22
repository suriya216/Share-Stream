import { useEffect, useState } from "react";
import { fetchHistory, type HistoryItem } from "./account";

export function History({ token }: { token: string }) {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    fetchHistory(token).then(setItems).catch(() => setItems([]));
  }, [token]);

  if (!items.length) return null;
  return (
    <section className="history">
      <h2>Recent</h2>
      <ul>
        {items.map((h, i) => (
          <li key={i}>
            <span className="title">{h.source}</span>
            <span className="muted">
              {h.role === "host" ? "hosted" : "joined"} · {new Date(h.at).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
