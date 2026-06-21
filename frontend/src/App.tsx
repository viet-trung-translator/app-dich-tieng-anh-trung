import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, getToken, clearToken, type User } from "./api.ts";
import { Signaling, type OnlineUser, type Peer } from "./signaling.ts";
import { CallSession, type SpeakerMode } from "./call-session.ts";
import { Auth } from "./screens/Auth.tsx";
import { Home } from "./screens/Home.tsx";
import { Admin } from "./screens/Admin.tsx";
import { SoloTranslator } from "./screens/SoloTranslator.tsx";
import { CallOverlay, type CallPhase } from "./screens/CallOverlay.tsx";
import { LangContext, makeT, type Lang } from "./i18n.ts";

type View = "home" | "admin" | "solo";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("home");
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [call, setCall] = useState<CallPhase>({ phase: "idle" });
  const [myText, setMyText] = useState(""); // câu mình vừa nói (gốc)
  const [theirText, setTheirText] = useState(""); // bản dịch nhận về từ bên kia
  const [speakerMode, setSpeakerMode] = useState<SpeakerMode>("earpiece");
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem("uiLang") as Lang) || "vi",
  );
  const t = makeT(lang);
  const setLang = (l: Lang) => {
    localStorage.setItem("uiLang", l);
    setLangState(l);
  };
  // Sau khi đăng nhập -> giao diện theo ngôn ngữ tài khoản (người Trung -> UI tiếng Trung).
  useEffect(() => {
    if (user) setLang(user.language);
  }, [user]);

  const sigRef = useRef<Signaling | null>(null);
  const callSessRef = useRef<CallSession | null>(null);

  // Khi cuộc gọi sang "active" -> mở phiên audio (thu mic + phát tiếng dịch + chữ).
  const activeCallId = call.phase === "active" ? call.callId : null;
  useEffect(() => {
    if (!activeCallId) return;
    const cs = new CallSession();
    cs.onMine = (t, final) => setMyText((p) => (p + t + (final ? "\n" : "")).slice(-1200));
    cs.onTheirs = (t, final) => setTheirText((p) => (p + t + (final ? "\n" : "")).slice(-1200));
    cs.start(activeCallId, speakerMode).catch(() => {});
    callSessRef.current = cs;
    return () => {
      void cs.stop();
      callSessRef.current = null;
      setMyText("");
      setTheirText("");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCallId]);

  // Đổi loa trong/ngoài giữa cuộc gọi mà không phải mở lại phiên.
  useEffect(() => {
    callSessRef.current?.setMode(speakerMode);
  }, [speakerMode]);

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

  // Khi đã đăng nhập -> mở kết nối tín hiệu (online + cuộc gọi).
  useEffect(() => {
    if (!user) return;
    const sig = new Signaling();
    sig.onOnline = setOnline;
    sig.onConn = setConnected;
    sig.onCall = (e) => {
      switch (e.type) {
        case "ringing":
          setCall({ phase: "outgoing", callId: e.callId, to: e.to });
          break;
        case "incoming":
          setCall({ phase: "incoming", callId: e.callId, from: e.from });
          break;
        case "accepted":
          setCall({ phase: "active", callId: e.callId, peer: e.peer });
          break;
        case "ended":
          setCall({ phase: "idle" });
          break;
        case "unavailable":
          alert(makeT(lang)(e.reason === "busy" ? "busy_busy" : "busy_unavailable"));
          setCall({ phase: "idle" });
          break;
      }
    };
    sig.connect();
    sigRef.current = sig;
    return () => {
      sig.close();
      sigRef.current = null;
      setOnline([]);
      setConnected(false);
    };
  }, [user]);

  function startCall(userId: number, domain?: string, glossary?: string) {
    const peer = online.find((u) => u.id === userId) as Peer | undefined;
    if (!peer) return;
    setCall({ phase: "outgoing", callId: null, to: peer });
    sigRef.current?.call(userId, domain, glossary);
  }

  function logout() {
    sigRef.current?.close();
    clearToken();
    setUser(null);
    setView("home");
    setCall({ phase: "idle" });
  }

  const wrap = (node: ReactNode) => (
    <LangContext.Provider value={{ lang, t, setLang }}>{node}</LangContext.Provider>
  );

  if (loading) return wrap(<div className="app center-screen">{t("loading")}</div>);
  if (!user) return wrap(<Auth onAuthed={setUser} />);

  const overlay = (
    <CallOverlay
      state={call}
      myText={myText}
      theirText={theirText}
      speakerMode={speakerMode}
      onToggleSpeaker={() => setSpeakerMode((m) => (m === "earpiece" ? "loud" : "earpiece"))}
      onAccept={() => call.phase === "incoming" && sigRef.current?.accept(call.callId)}
      onReject={() => {
        if (call.phase === "incoming") sigRef.current?.reject(call.callId);
        setCall({ phase: "idle" });
      }}
      onCancel={() => {
        if (call.phase === "outgoing" && call.callId) sigRef.current?.cancel(call.callId);
        setCall({ phase: "idle" });
      }}
      onHangup={() => {
        if (call.phase === "active") sigRef.current?.hangup(call.callId);
        setCall({ phase: "idle" });
      }}
    />
  );

  let screen;
  if (view === "admin") screen = <Admin onBack={() => setView("home")} />;
  else if (view === "solo") screen = <SoloTranslator onBack={() => setView("home")} />;
  else
    screen = (
      <Home
        user={user}
        online={online}
        connected={connected}
        onCall={startCall}
        onOpenSolo={() => setView("solo")}
        onOpenAdmin={() => setView("admin")}
        onLogout={logout}
      />
    );

  return wrap(
    <>
      {screen}
      {overlay}
    </>,
  );
}
