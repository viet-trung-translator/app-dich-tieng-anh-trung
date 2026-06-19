import { useRef, useState } from "react";
import { MicRecorder } from "./audio/recorder.ts";
import { StreamPlayer } from "./audio/player.ts";
import { TranslateSocket, type ConnState, type ServerEvent } from "./ws/client.ts";

type UiState = "idle" | "active" | "error";

export function App() {
  const [ui, setUi] = useState<UiState>("idle");
  const [conn, setConn] = useState<ConnState>("closed");
  const [level, setLevel] = useState(0);
  const [source, setSource] = useState(""); // câu gốc
  const [translation, setTranslation] = useState(""); // bản dịch
  const [statusMsg, setStatusMsg] = useState("Bấm micro để bắt đầu.");
  const [playing, setPlaying] = useState(false); // loa đang phát bản dịch

  const recorderRef = useRef<MicRecorder | null>(null);
  const playerRef = useRef<StreamPlayer | null>(null);
  const socketRef = useRef<TranslateSocket | null>(null);
  const everOpenRef = useRef(false); // đã từng kết nối thành công chưa
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lần đầu chưa kết nối được thường do máy chủ free đang "thức dậy" (~50s).
  const COLD_START = "Máy chủ đang khởi động (gói free), có thể chờ tới ~50 giây...";

  async function start() {
    setUi("active");
    setSource("");
    setTranslation("");
    everOpenRef.current = false;
    setStatusMsg("Đang kết nối...");

    const player = new StreamPlayer();
    const socket = new TranslateSocket();
    const recorder = new MicRecorder();
    recorder.onLevel = setLevel;
    playerRef.current = player;
    socketRef.current = socket;
    recorderRef.current = recorder;

    // Chế độ song song: thu mic LIÊN TỤC, loa dịch và phát theo cùng lúc, không ngắt.
    // (Dùng tai nghe để loa không lọt lại vào mic -> tránh vọng âm.)
    try {
      await recorder.start((pcm) => socket.sendAudio(pcm));
    } catch (err) {
      setUi("error");
      setStatusMsg("Không truy cập được micro: " + String(err));
      return;
    }

    // Theo dõi trạng thái phát để cập nhật UI + biết khi nào tạm ngắt thu.
    playTimerRef.current = setInterval(() => {
      setPlaying(Boolean(playerRef.current?.isPlaying()));
    }, 150);

    socket.connect(
      (e) => handleServerEvent(e, player),
      (s) => handleConnState(s),
    );
  }

  function handleConnState(s: ConnState) {
    setConn(s);
    switch (s) {
      case "connecting":
        setStatusMsg(everOpenRef.current ? "Đang kết nối lại..." : COLD_START);
        break;
      case "open":
        everOpenRef.current = true;
        setStatusMsg("Đang nghe... (nói tiếng Trung hoặc tiếng Việt)");
        break;
      case "reconnecting":
        setStatusMsg(everOpenRef.current ? "Mất kết nối — đang kết nối lại..." : COLD_START);
        break;
      case "closed":
        setStatusMsg("Đã dừng.");
        break;
    }
  }

  function handleServerEvent(e: ServerEvent, player: StreamPlayer) {
    switch (e.type) {
      case "source":
        setSource((prev) => prev + e.text + (e.final ? "\n" : ""));
        break;
      case "text":
        setTranslation((prev) => prev + e.text + (e.final ? "\n" : ""));
        break;
      case "audio":
        player.enqueueBase64(e.dataBase64);
        break;
      case "interrupted":
        player.flush();
        break;
      case "error":
        setUi("error");
        setStatusMsg("Lỗi: " + e.message);
        break;
      // "status" từ backend: bỏ qua để ưu tiên trạng thái kết nối của client.
    }
  }

  async function stop() {
    if (playTimerRef.current) clearInterval(playTimerRef.current);
    playTimerRef.current = null;
    socketRef.current?.close();
    await recorderRef.current?.stop();
    await playerRef.current?.close();
    recorderRef.current = null;
    playerRef.current = null;
    socketRef.current = null;
    setUi("idle");
    setConn("closed");
    setLevel(0);
    setPlaying(false);
    setStatusMsg("Đã dừng. Bấm micro để bắt đầu lại.");
  }

  const active = ui === "active";
  const reconnecting = conn === "reconnecting";
  // Chế độ song song: vừa nghe vừa phát bản dịch cùng lúc.
  const displayStatus =
    ui !== "error" && conn === "open" && playing
      ? "🔊 Đang nghe & dịch ra loa cùng lúc..."
      : statusMsg;

  return (
    <div className="app">
      <h1>Phiên dịch Trung ↔ Việt</h1>
      <p className="subtitle">Gemini 3.5 Live Translate · dịch giọng nói thời gian thực</p>

      <button
        className={`mic ${active ? "on" : ""}`}
        onClick={active ? stop : start}
        style={{ boxShadow: active ? `0 0 ${20 + level * 60}px rgba(99,102,241,.8)` : undefined }}
      >
        {active ? "■" : "🎤"}
      </button>

      <div className={`status ${reconnecting ? "warn" : ""}`}>{displayStatus}</div>

      <div className="panes">
        <div className="pane">
          <div className="pane-label">Bản gốc</div>
          <div className="pane-body">
            {source || <span className="placeholder">Câu bạn nói sẽ hiện ở đây...</span>}
          </div>
        </div>
        <div className="pane">
          <div className="pane-label">Bản dịch</div>
          <div className="pane-body">
            {translation || <span className="placeholder">Bản dịch sẽ chạy ở đây...</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
