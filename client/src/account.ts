export const serverUrl: string =
  import.meta.env.VITE_SERVER_URL ?? `${location.protocol}//${location.hostname}:4000`;

const KEY = "sharestream.account";

export interface Account {
  token: string;
  username: string;
}

export interface HistoryItem {
  code: string;
  role: "host" | "guest";
  sourceType: "url" | "youtube" | "local";
  source: string;
  at: string;
}

export function loadAccount(): Account | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function saveAccount(a: Account | null) {
  if (a) localStorage.setItem(KEY, JSON.stringify(a));
  else localStorage.removeItem(KEY);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${serverUrl}/api${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Something went wrong");
  return body;
}

export const authenticate = (mode: "login" | "register", username: string, password: string) =>
  call<Account>(`/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

export const fetchHistory = (token: string) =>
  call<HistoryItem[]>("/history", { headers: { Authorization: `Bearer ${token}` } });

/** The server only offers accounts when it is connected to MongoDB */
export const accountsEnabled = () =>
  fetch(`${serverUrl}/health`)
    .then((r) => r.json())
    .then((h) => !!h.accounts)
    .catch(() => false);
