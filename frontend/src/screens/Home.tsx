import { useState, type FormEvent } from "react";
import { api, type User } from "../api.ts";
import type { OnlineUser } from "../signaling.ts";

const langLabel = (l: string) => (l === "zh" ? "Tiếng Trung" : "Tiếng Việt");

export function Home(props: {
  user: User;
  online: OnlineUser[];
  onCall: (userId: number) => void;
  onOpenSolo: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
  const { user, online } = props;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<User[]>([]);

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
          {user.role === "owner" && <span className="badge owner">CHỦ</span>}
        </div>
        <div className="actions">
          {user.role === "owner" && (
            <button className="link-btn" onClick={props.onOpenAdmin}>
              Quản trị
            </button>
          )}
          <button className="link-btn" onClick={props.onLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      <section className="card">
        <h3>Gọi cho người khác</h3>
        <form onSubmit={doSearch} className="search">
          <input placeholder="Tìm theo tên..." value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="primary" type="submit">
            Tìm
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
              <button className="call" disabled={!onlineIds.has(u.id)} onClick={() => props.onCall(u.id)}>
                📞 {onlineIds.has(u.id) ? "Gọi" : "Offline"}
              </button>
            </div>
          ))}
      </section>

      <section className="card">
        <h3>Đang online ({others.length})</h3>
        {others.length === 0 && <div className="placeholder">Chưa có ai khác online.</div>}
        {others.map((u) => (
          <div key={u.id} className="user-row">
            <span>
              <span className="dot" /> {u.username} <small>· {langLabel(u.language)}</small>
            </span>
            <button className="call" onClick={() => props.onCall(u.id)}>
              📞 Gọi
            </button>
          </div>
        ))}
      </section>

      <button className="link-btn center" onClick={props.onOpenSolo}>
        🎤 Dùng chế độ dịch 1 máy
      </button>
    </div>
  );
}
