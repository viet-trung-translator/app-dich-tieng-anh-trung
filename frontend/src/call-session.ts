import { MicRecorder } from "./audio/recorder.ts";
import { StreamPlayer } from "./audio/player.ts";
import { getToken } from "./api.ts";

/**
 * Phiên audio trong cuộc gọi: thu mic gửi lên server, nhận tiếng dịch của
 * đối phương phát ra loa + chữ dịch hiển thị.
 */
export class CallSession {
  private ws: WebSocket | null = null;
  private rec: MicRecorder | null = null;
  private player: StreamPlayer | null = null;
  onText: (text: string, final: boolean) => void = () => {};

  async start(callId: string): Promise<void> {
    const token = getToken();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/call-media?callId=${callId}&token=${token}`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    const player = new StreamPlayer();
    this.player = player;
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      try {
        const m = JSON.parse(ev.data);
        if (m.type === "audio") player.enqueueBase64(m.dataBase64);
        else if (m.type === "text") this.onText(m.text, Boolean(m.final));
        else if (m.type === "interrupted") player.flush();
      } catch {
        /* bỏ qua */
      }
    };

    const rec = new MicRecorder();
    this.rec = rec;
    await rec.start((pcm) => {
      // Mic LUÔN thu (full-duplex). Dựa vào AEC của trình duyệt để lược tiếng loa.
      if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
    });
  }

  async stop(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    await this.rec?.stop();
    await this.player?.close();
    this.rec = null;
    this.player = null;
  }
}
