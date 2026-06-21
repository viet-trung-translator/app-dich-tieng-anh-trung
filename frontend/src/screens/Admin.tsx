import { useEffect, useState } from "react";
import { api, type User } from "../api.ts";
import { useI18n } from "../i18n.ts";

export function Admin({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const langLabel = (l: string) => (l === "zh" ? t("chinese") : t("vietnamese"));
  const statusLabel: Record<string, string> = {
    pending: t("st_pending"),
    approved: t("st_approved"),
    disabled: t("st_disabled"),
  };
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
    if (!confirm(t("confirm_delete", { name: u.username }))) return;
    await api.adminDelete(u.id);
    load();
  }

  return (
    <div className="home">
      <header className="topbar">
        <button className="link-btn" onClick={onBack}>
          {t("back_home")}
        </button>
        <b>{t("admin_title")}</b>
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
                    {t("approve")}
                  </button>
                )}
                {u.status === "approved" && (
                  <button className="warn-btn" onClick={() => act(u, "disable")}>
                    {t("lock")}
                  </button>
                )}
                <button className="danger" onClick={() => del(u)}>
                  {t("delete")}
                </button>
              </span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
