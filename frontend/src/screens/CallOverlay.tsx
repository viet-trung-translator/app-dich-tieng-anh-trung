import type { Peer } from "../signaling.ts";
import type { SpeakerMode } from "../call-session.ts";
import { useI18n } from "../i18n.ts";

export type CallPhase =
  | { phase: "idle" }
  | { phase: "outgoing"; callId: string | null; to: Peer }
  | { phase: "incoming"; callId: string; from: Peer }
  | { phase: "active"; callId: string; peer: Peer };

export function CallOverlay(props: {
  state: CallPhase;
  myText?: string;
  theirText?: string;
  speakerMode?: SpeakerMode;
  onToggleSpeaker?: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onHangup: () => void;
}) {
  const { t } = useI18n();
  const s = props.state;
  if (s.phase === "idle") return null;

  const langLabel = (l: string) => (l === "zh" ? t("chinese") : t("vietnamese"));
  const who = s.phase === "outgoing" ? s.to : s.phase === "incoming" ? s.from : s.peer;
  const loud = props.speakerMode === "loud";

  return (
    <div className="call-overlay">
      <div className="call-box">
        <div className="call-avatar">{who.username.charAt(0).toUpperCase()}</div>
        <div className="call-name">{who.username}</div>
        <div className="call-sub">{langLabel(who.language)}</div>

        {s.phase === "outgoing" && <div className="call-status">{t("calling")}</div>}
        {s.phase === "incoming" && <div className="call-status">{t("incoming")}</div>}
        {s.phase === "active" && <div className="call-status green">{t("in_call")}</div>}

        {s.phase === "active" && (
          <>
            <button className="speaker-toggle" onClick={props.onToggleSpeaker}>
              {loud ? `🔊 ${t("speaker_loud")}` : `🔈 ${t("speaker_ear")}`}
            </button>

            {/* Loa ngoài: hiện cả lời mình nói + bản dịch nhận về. Loa trong: chỉ bản dịch. */}
            {loud && (
              <div className="call-line">
                <div className="call-line-label">{t("you_said")}</div>
                <div className="call-line-body">{props.myText || "…"}</div>
              </div>
            )}
            <div className="call-subtitle">
              {props.theirText?.trim() ? (
                props.theirText
              ) : (
                <span className="placeholder">{t("subtitle_ph", { name: who.username })}</span>
              )}
            </div>
          </>
        )}

        <div className="call-actions">
          {s.phase === "outgoing" && (
            <button className="hangup" onClick={props.onCancel}>
              {t("cancel")}
            </button>
          )}
          {s.phase === "incoming" && (
            <>
              <button className="reject" onClick={props.onReject}>
                {t("reject")}
              </button>
              <button className="accept-call" onClick={props.onAccept}>
                {t("accept")}
              </button>
            </>
          )}
          {s.phase === "active" && (
            <button className="hangup" onClick={props.onHangup}>
              {t("hangup")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
