import { useState, type FormEvent } from "react";
import { api, setToken, type User } from "../api.ts";
import { useI18n } from "../i18n.ts";
import { Brand } from "./Logo.tsx";

export function Auth({ onAuthed }: { onAuthed: (u: User) => void }) {
  const { t, lang, setLang } = useI18n();
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
        setMsg((r as { message?: string }).message ?? "OK");
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
      <div className="ui-lang">
        <button className={lang === "vi" ? "on" : ""} onClick={() => setLang("vi")}>
          VI
        </button>
        <button className={lang === "zh" ? "on" : ""} onClick={() => setLang("zh")}>
          中文
        </button>
      </div>

      <div className="brand-hero">
        <Brand size={56} />
      </div>
      <p className="subtitle">{t("app_sub")}</p>

      <div className="tabs">
        <button className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
          {t("login")}
        </button>
        <button className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>
          {t("register")}
        </button>
      </div>

      <form onSubmit={submit} className="form">
        <input
          placeholder={t("username")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
        />
        <input
          type="password"
          placeholder={t("password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "register" && (
          <label className="lang-pick">
            {t("your_language")}
            <select value={language} onChange={(e) => setLanguage(e.target.value as "vi" | "zh")}>
              <option value="vi">{t("vietnamese")}</option>
              <option value="zh">{t("chinese")}</option>
            </select>
          </label>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? t("processing") : mode === "login" ? t("login") : t("register")}
        </button>
      </form>

      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}
