import { useEffect, useState } from "react";
import { api, type User } from "../api.ts";

const langLabel = (l: string) => (l === "zh" ? "Trung" : "Việt");
const statusLabel: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  disabled: "Đã khóa",
};

export function Admin({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [err, setErr] = useState("");

  async function load() {
    try {
      const r = await api.adminList();
      setUsers(r.users);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function act(u: User, action: "approve" | "disable") {
    await api.adminAction(u.id, action);
    load();
  }
  async function del(u: User) {
    if (!confirm(`Xóa tài khoản "${u.username}"?`)) return;
    await api.adminDelete(u.id);
    load();
  }

  return (
    <div className="home">
      <header className="topbar">
        <button className="link-btn" onClick={onBack}>
          ← Về trang chính
        </button>
        <b>Quản trị tài khoản</b>
      </header>

      {err && <div className="msg">{err}</div>}

      <section className="card">
        {users.map((u) => (
          <div key={u.id} className="user-row admin-row">
            <span>
              <b>{u.username}</b> <small>· {langLabel(u.language)}</small>
              <span className={`badge st-${u.status}`}>{statusLabel[u.status]}</span>
              {u.role === "owner" && <span className="badge owner">CHỦ</span>}
            </span>
            {u.role !== "owner" && (
              <span className="admin-actions">
                {u.status !== "approved" && (
                  <button className="ok" onClick={() => act(u, "approve")}>
                    Duyệt
                  </button>
                )}
                {u.status === "approved" && (
                  <button className="warn-btn" onClick={() => act(u, "disable")}>
                    Khóa
                  </button>
                )}
                <button className="danger" onClick={() => del(u)}>
                  Xóa
                </button>
              </span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
