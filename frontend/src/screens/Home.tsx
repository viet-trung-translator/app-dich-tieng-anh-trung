import { useState, type FormEvent } from "react";
import { api, type User } from "../api.ts";
import type { OnlineUser } from "../signaling.ts";

const langLabel = (l: string) => (l === "zh" ? "Tiếng Trung" : "Tiếng Việt");

const DOMAINS = [
  { key: "general", label: "Thường (mặc định, nhanh nhất)" },
  { key: "medical", label: "Y tế" },
  { key: "technical", label: "Kỹ thuật" },
  { key: "legal", label: "Pháp lý" },
  { key: "business", label: "Thương mại" },
];

export function Home(props: {
  user: User;
  online: OnlineUser[];
  connected: boolean;
  onCall: (userId: number, domain?: string, glossary?: string) => void;
  onOpenSolo: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
  const { user, online } = props;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [domain, setDomain] = useState("general");
  const [glossary, setGlossary] = useState("");

  const startCall = (id: number) => props.onCall(id, domain, glossary.trim() || undefined);

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

      {!props.connected && (
        <div className="status warn" style={{ marginBottom: 12 }}>
          Đang kết nối máy chủ... (gói free có thể chờ ~50 giây lần đầu)
        </div>
      )}

      <section className="card">
        <h3>Chế độ dịch</h3>
        <label className="lang-pick">
          Lĩnh vực:
          <select value={domain} onChange={(e) => setDomain(e.target.value)}>
            {DOMAINS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        {domain !== "general" && (
          <textarea
            className="glossary"
            placeholder="Thuật ngữ riêng (tùy chọn), vd: huyết áp => 血压, nhồi máu cơ tim => 心肌梗死"
            value={glossary}
            onChange={(e) => setGlossary(e.target.value)}
            rows={3}
          />
        )}
        <div className="hint">
          {domain === "general"
            ? "Dịch nhanh, giữ ngữ điệu tốt nhất."
            : "Dùng model hiểu ngữ cảnh chuyên ngành (có thể trễ hơn chút)."}
        </div>
      </section>

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
              <button className="call" disabled={!onlineIds.has(u.id)} onClick={() => startCall(u.id)}>
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
            <button className="call" onClick={() => startCall(u.id)}>
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
