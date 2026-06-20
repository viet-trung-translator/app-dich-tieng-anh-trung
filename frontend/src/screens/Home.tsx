import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type User } from "../api.ts";
import { connectPresence, type OnlineUser } from "../presence-client.ts";

const langLabel = (l: string) => (l === "zh" ? "Tiếng Trung" : "Tiếng Việt");

export function Home(props: {
  user: User;
  onOpenSolo: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
  const { user } = props;
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const closeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    closeRef.current = connectPresence(setOnline);
    return () => closeRef.current?.();
  }, []);

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

  // GĐ1 chưa có gọi điện -> nút Gọi tạm khóa.
  const call = (u: { username: string }) =>
    alert(`Tính năng gọi sẽ có ở giai đoạn sau. (Sẽ gọi: ${u.username})`);

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
        {results.map((u) => (
          <div key={u.id} className="user-row">
            <span>
              {u.username} <small>· {langLabel(u.language)}</small>
            </span>
            <button className="call" onClick={() => call(u)}>
              📞 Gọi
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
            <button className="call" onClick={() => call(u)}>
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
