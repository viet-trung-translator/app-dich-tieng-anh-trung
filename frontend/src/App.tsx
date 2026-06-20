import { useEffect, useState } from "react";
import { api, getToken, clearToken, type User } from "./api.ts";
import { Auth } from "./screens/Auth.tsx";
import { Home } from "./screens/Home.tsx";
import { Admin } from "./screens/Admin.tsx";
import { SoloTranslator } from "./screens/SoloTranslator.tsx";

type View = "home" | "admin" | "solo";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("home");

  // Có token sẵn -> lấy thông tin mình; token hỏng/hết hạn -> về đăng nhập.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  function logout() {
    clearToken();
    setUser(null);
    setView("home");
  }

  if (loading) return <div className="app center-screen">Đang tải...</div>;
  if (!user) return <Auth onAuthed={setUser} />;

  if (view === "admin") return <Admin onBack={() => setView("home")} />;
  if (view === "solo") return <SoloTranslator onBack={() => setView("home")} />;

  return (
    <Home
      user={user}
      onOpenSolo={() => setView("solo")}
      onOpenAdmin={() => setView("admin")}
      onLogout={logout}
    />
  );
}
