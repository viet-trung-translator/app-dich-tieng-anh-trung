import { useState, type FormEvent } from "react";
import { api, setToken, type User } from "../api.ts";

export function Auth({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState<"vi" | "zh">("vi");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      if (mode === "login") {
        const r = await api.login({ username, password });
        setToken(r.token);
        onAuthed(r.user);
      } else {
        const r = await api.register({ username, password, language });
        setMsg((r as { message?: string }).message ?? "Đăng ký thành công.");
        setMode("login");
      }
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <h1>Phiên dịch gọi điện</h1>
      <p className="subtitle">Trung ↔ Việt · Gemini 3.5 Live Translate</p>

      <div className="tabs">
        <button className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
          Đăng nhập
        </button>
        <button className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>
          Đăng ký
        </button>
      </div>

      <form onSubmit={submit} className="form">
        <input
          placeholder="Tên đăng nhập"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
        />
        <input
          type="password"
          placeholder="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "register" && (
          <label className="lang-pick">
            Ngôn ngữ của bạn:
            <select value={language} onChange={(e) => setLanguage(e.target.value as "vi" | "zh")}>
              <option value="vi">Tiếng Việt</option>
              <option value="zh">Tiếng Trung</option>
            </select>
          </label>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Đăng ký"}
        </button>
      </form>

      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}
