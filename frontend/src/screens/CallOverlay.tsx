import type { Peer } from "../signaling.ts";

export type CallPhase =
  | { phase: "idle" }
  | { phase: "outgoing"; callId: string | null; to: Peer }
  | { phase: "incoming"; callId: string; from: Peer }
  | { phase: "active"; callId: string; peer: Peer };

const langLabel = (l: string) => (l === "zh" ? "Tiếng Trung" : "Tiếng Việt");

export function CallOverlay(props: {
  state: CallPhase;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onHangup: () => void;
}) {
  const s = props.state;
  if (s.phase === "idle") return null;

  const who =
    s.phase === "outgoing" ? s.to : s.phase === "incoming" ? s.from : s.peer;

  return (
    <div className="call-overlay">
      <div className="call-box">
        <div className="call-avatar">{who.username.charAt(0).toUpperCase()}</div>
        <div className="call-name">{who.username}</div>
        <div className="call-sub">{langLabel(who.language)}</div>

        {s.phase === "outgoing" && <div className="call-status">Đang gọi...</div>}
        {s.phase === "incoming" && <div className="call-status">Cuộc gọi đến</div>}
        {s.phase === "active" && <div className="call-status green">Đang trong cuộc gọi</div>}

        <div className="call-actions">
          {s.phase === "outgoing" && (
            <button className="hangup" onClick={props.onCancel}>
              Hủy
            </button>
          )}
          {s.phase === "incoming" && (
            <>
              <button className="reject" onClick={props.onReject}>
                Từ chối
              </button>
              <button className="accept-call" onClick={props.onAccept}>
                Nghe
              </button>
            </>
          )}
          {s.phase === "active" && (
            <button className="hangup" onClick={props.onHangup}>
              Cúp máy
            </button>
          )}
        </div>

        {s.phase === "active" && (
          <div className="call-note">
            (Phần dịch giọng nói real-time sẽ thêm ở giai đoạn kế tiếp.)
          </div>
        )}
      </div>
    </div>
  );
}
