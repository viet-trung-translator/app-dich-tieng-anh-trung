import { useState, type FormEvent } from "react";
import { api, type User } from "../api.ts";
import type { OnlineUser } from "../signaling.ts";
import { useI18n } from "../i18n.ts";

export function Home(props: {
  user: User;
  online: OnlineUser[];
  connected: boolean;
  onCall: (userId: number, domain?: string, glossary?: string) => void;
  onOpenSolo: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const { user, online } = props;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<User[]>([]);

  const langLabel = (l: string) => (l === "zh" ? t("chinese") : t("vietnamese"));
  const startCall = (id: number) => props.onCall(id);

  async function doSearch(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return setResults([]);
    try {
      const r = await api.search(q.trim());
      setResults(r.users);
    } catch {
      setResults([]);
    }
  }

  const onlineIds = new Set(online.map((u) => u.id));
  const others = online.filter((u) => u.id !== user.id);

  return (
    <div className="home">
      <header className="topbar">
        <div>
          <b>{user.username}</b>
          <span className="badge">{langLabel(user.language)}</span>
          {user.role === "owner" && <span className="badge owner">{t("owner")}</span>}
        </div>
        <div className="actions">
          {user.role === "owner" && (
            <button className="link-btn" onClick={props.onOpenAdmin}>
              {t("admin")}
            </button>
          )}
          <button className="link-btn" onClick={props.onLogout}>
            {t("logout")}
          </button>
        </div>
      </header>

      {!props.connected && (
        <div className="status warn" style={{ marginBottom: 12 }}>
          {t("connecting_server")}
        </div>
      )}

      <section className="card">
        <h3>{t("call_others")}</h3>
        <form onSubmit={doSearch} className="search">
          <input placeholder={t("search_ph")} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="primary" type="submit">
            {t("search_btn")}
          </button>
        </form>
        {results
          .filter((u) => u.id !== user.id)
          .map((u) => (
            <div key={u.id} className="user-row">
              <span>
                {onlineIds.has(u.id) && <span className="dot" />} {u.username}{" "}
                <small>· {langLabel(u.language)}</small>
              </span>
              <button className="call" disabled={!onlineIds.has(u.id)} onClick={() => startCall(u.id)}>
                📞 {onlineIds.has(u.id) ? t("call") : t("offline")}
              </button>
            </div>
          ))}
      </section>

      <section className="card">
        <h3>
          {t("online")} ({others.length})
        </h3>
        {others.length === 0 && <div className="placeholder">{t("nobody_online")}</div>}
        {others.map((u) => (
          <div key={u.id} className="user-row">
            <span>
              <span className="dot" /> {u.username} <small>· {langLabel(u.language)}</small>
            </span>
            <button className="call" onClick={() => startCall(u.id)}>
              📞 {t("call")}
            </button>
          </div>
        ))}
      </section>

      <button className="link-btn center" onClick={props.onOpenSolo}>
        {t("solo_mode")}
      </button>
    </div>
  );
}
