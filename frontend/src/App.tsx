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

  const recorderRef = useRef<MicRecorder | null>(null);
  const playerRef = useRef<StreamPlayer | null>(null);
  const socketRef = useRef<TranslateSocket | null>(null);

  async function start() {
    setUi("active");
    setSource("");
    setTranslation("");
    setStatusMsg("Đang kết nối...");

    const player = new StreamPlayer();
    const socket = new TranslateSocket();
    const recorder = new MicRecorder();
    recorder.onLevel = setLevel;
    playerRef.current = player;
    socketRef.current = socket;
    recorderRef.current = recorder;

    // Mic chạy độc lập; nếu WS đang đứt thì sendAudio tự bỏ qua, có lại là gửi tiếp.
    try {
      await recorder.start((pcm) => socket.sendAudio(pcm));
    } catch (err) {
      setUi("error");
      setStatusMsg("Không truy cập được micro: " + String(err));
      return;
    }

    socket.connect(
      (e) => handleServerEvent(e, player),
      (s) => handleConnState(s),
    );
  }

  function handleConnState(s: ConnState) {
    setConn(s);
    switch (s) {
      case "connecting":
        setStatusMsg("Đang kết nối...");
        break;
      case "open":
        setStatusMsg("Đang nghe... (nói tiếng Trung hoặc tiếng Anh)");
        break;
      case "reconnecting":
        setStatusMsg("Mất kết nối — đang kết nối lại...");
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
    socketRef.current?.close();
    await recorderRef.current?.stop();
    await playerRef.current?.close();
    recorderRef.current = null;
    playerRef.current = null;
    socketRef.current = null;
    setUi("idle");
    setConn("closed");
    setLevel(0);
    setStatusMsg("Đã dừng. Bấm micro để bắt đầu lại.");
  }

  const active = ui === "active";
  const reconnecting = conn === "reconnecting";

  return (
    <div className="app">
      <h1>Phiên dịch Trung ↔ Anh</h1>
      <p className="subtitle">Gemini 3.5 Live Translate · dịch giọng nói thời gian thực</p>

      <button
        className={`mic ${active ? "on" : ""}`}
        onClick={active ? stop : start}
        style={{ boxShadow: active ? `0 0 ${20 + level * 60}px rgba(99,102,241,.8)` : undefined }}
      >
        {active ? "■" : "🎤"}
      </button>

      <div className={`status ${reconnecting ? "warn" : ""}`}>{statusMsg}</div>

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
