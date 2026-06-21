import { MicRecorder } from "./audio/recorder.ts";
import { StreamPlayer } from "./audio/player.ts";
import { getToken } from "./api.ts";

export type SpeakerMode = "earpiece" | "loud"; // loa trong (nhỏ) | loa ngoài (to)

/**
 * Phiên audio trong cuộc gọi: thu mic gửi lên, nhận giọng dịch của đối phương + chữ.
 * - onMine: câu GỐC mình vừa nói (server gửi về).
 * - onTheirs: BẢN DỊCH nhận về từ đối phương.
 * - Loa trong: âm lượng nhỏ, mic luôn thu. Loa ngoài: âm lượng to, tự ngắt mic khi đang phát.
 */
export class CallSession {
  private ws: WebSocket | null = null;
  private rec: MicRecorder | null = null;
  private player: StreamPlayer | null = null;
  private mode: SpeakerMode = "earpiece";
  onMine: (text: string, final: boolean) => void = () => {};
  onTheirs: (text: string, final: boolean) => void = () => {};

  async start(callId: string, mode: SpeakerMode): Promise<void> {
    this.mode = mode;
    const token = getToken();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/call-media?callId=${callId}&token=${token}`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    const player = new StreamPlayer();
    this.player = player;
    player.setVolume(mode === "loud" ? 1 : 0.4);
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      try {
        const m = JSON.parse(ev.data);
        if (m.type === "audio") player.enqueueBase64(m.dataBase64);
        else if (m.type === "text") this.onTheirs(m.text, Boolean(m.final));
        else if (m.type === "source") this.onMine(m.text, Boolean(m.final));
        else if (m.type === "interrupted") player.flush();
      } catch {
        /* bỏ qua */
      }
    };

    const rec = new MicRecorder();
    this.rec = rec;
    await rec.start((pcm) => {
      // BÁN SONG CÔNG LUÔN LUÔN: đang phát bản dịch thì KHÔNG thu mic.
      // Đây là cách duy nhất chống lặp triệt để khi dùng loa (nói theo lượt).
      if (this.player?.isPlaying()) return;
      if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
    });
  }

  setMode(mode: SpeakerMode): void {
    this.mode = mode;
    this.player?.setVolume(mode === "loud" ? 1 : 0.4);
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
