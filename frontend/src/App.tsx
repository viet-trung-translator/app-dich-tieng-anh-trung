import { useEffect, useRef, useState } from "react";
import { api, getToken, clearToken, type User } from "./api.ts";
import { Signaling, type OnlineUser, type Peer } from "./signaling.ts";
import { CallSession } from "./call-session.ts";
import { Auth } from "./screens/Auth.tsx";
import { Home } from "./screens/Home.tsx";
import { Admin } from "./screens/Admin.tsx";
import { SoloTranslator } from "./screens/SoloTranslator.tsx";
import { CallOverlay, type CallPhase } from "./screens/CallOverlay.tsx";

type View = "home" | "admin" | "solo";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("home");
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [call, setCall] = useState<CallPhase>({ phase: "idle" });
  const [subtitle, setSubtitle] = useState("");

  const sigRef = useRef<Signaling | null>(null);
  const callSessRef = useRef<CallSession | null>(null);

  // Khi cuộc gọi sang "active" -> mở phiên audio (thu mic + phát tiếng dịch + chữ).
  const activeCallId = call.phase === "active" ? call.callId : null;
  useEffect(() => {
    if (!activeCallId) return;
    const cs = new CallSession();
    cs.onText = (t, final) => setSubtitle((p) => (p + t + (final ? "\n" : "")).slice(-1500));
    cs.start(activeCallId).catch(() => {});
    callSessRef.current = cs;
    return () => {
      void cs.stop();
      callSessRef.current = null;
      setSubtitle("");
    };
  }, [activeCallId]);

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
          alert(e.reason === "busy" ? "Người này đang bận." : "Người này không online.");
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
    };
  }, [user]);

  function startCall(userId: number) {
    const peer = online.find((u) => u.id === userId) as Peer | undefined;
    if (!peer) return;
    setCall({ phase: "outgoing", callId: null, to: peer });
    sigRef.current?.call(userId);
  }

  function logout() {
    sigRef.current?.close();
    clearToken();
    setUser(null);
    setView("home");
    setCall({ phase: "idle" });
  }

  if (loading) return <div className="app center-screen">Đang tải...</div>;
  if (!user) return <Auth onAuthed={setUser} />;

  const overlay = (
    <CallOverlay
      state={call}
      subtitle={subtitle}
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
        onCall={startCall}
        onOpenSolo={() => setView("solo")}
        onOpenAdmin={() => setView("admin")}
        onLogout={logout}
      />
    );

  return (
    <>
      {screen}
      {overlay}
    </>
  );
}
