import { useCallback, useEffect, useState } from "react";
import type { SessionInfo } from "../../shared/types";
import { accountsEnabled, loadAccount, saveAccount, type Account } from "./account";
import { Auth } from "./Auth";
import { History } from "./History";
import { Home } from "./Home";
import { Session } from "./Session";
import { setSocketToken } from "./socket";

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [file, setFile] = useState<File | undefined>();
  const [notice, setNotice] = useState("");
  const [account, setAccount] = useState<Account | null>(loadAccount);
  const [enabled, setEnabled] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    accountsEnabled().then(setEnabled);
  }, []);

  const exit = useCallback((reason?: string) => {
    setSession(null);
    setNotice(reason ?? "");
  }, []);

  const changeAccount = (a: Account | null) => {
    saveAccount(a);
    setSocketToken(a?.token);
    setAccount(a);
    setSigningIn(false);
  };

  if (session)
    return (
      <main className="wide">
        <Session session={session} initialFile={file} onExit={exit} />
      </main>
    );

  return (
    <main>
      {enabled && (
        <nav>
          {account ? (
            <>
              <span className="muted">{account.username}</span>
              <button className="ghost" onClick={() => changeAccount(null)}>
                Sign out
              </button>
            </>
          ) : (
            !signingIn && (
              <button className="ghost" onClick={() => setSigningIn(true)}>
                Sign in
              </button>
            )
          )}
        </nav>
      )}
      <h1>ShareStream</h1>
      {notice && <p className="notice">{notice}</p>}
      {signingIn ? (
        <Auth onDone={changeAccount} onCancel={() => setSigningIn(false)} />
      ) : (
        <>
          <Home
            onEnter={(s, f) => {
              setNotice("");
              setFile(f);
              setSession(s);
            }}
          />
          {account && <History token={account.token} />}
        </>
      )}
    </main>
  );
}
