/** Sự kiện server trả về (khớp với BrainEvent ở backend). */
export type ServerEvent =
  | { type: "source"; text: string; final: boolean }
  | { type: "text"; text: string; final: boolean }
  | { type: "audio"; dataBase64: string; sampleRate: number }
  | { type: "interrupted" }
  | { type: "status"; message: string }
  | { type: "error"; message: string };

/** Trạng thái kết nối để UI hiển thị. */
export type ConnState = "connecting" | "open" | "reconnecting" | "closed";

// Mặc định: cùng origin với trang (Vite proxy /translate -> backend; prod thì Fastify phục vụ).
const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/translate`;

/**
 * WebSocket có tự kết nối lại (auto-reconnect).
 * Khi điện thoại chuyển WiFi/4G hay rớt sóng, kết nối đứt -> tự mở lại
 * với backoff tăng dần, mic vẫn chạy nền nên nói tiếp là dịch tiếp.
 */
export class TranslateSocket {
  private ws: WebSocket | null = null;
  private shouldRun = false;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onEvent: (e: ServerEvent) => void = () => {};
  private onState: (s: ConnState) => void = () => {};

  connect(onEvent: (e: ServerEvent) => void, onState: (s: ConnState) => void): void {
    this.onEvent = onEvent;
    this.onState = onState;
    this.shouldRun = true;
    this.open();
  }

  private open(): void {
    this.onState(this.retries === 0 ? "connecting" : "reconnecting");
    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      this.retries = 0;
      this.onState("open");
    };
    ws.onmessage = (ev) => {
      try {
        this.onEvent(JSON.parse(ev.data) as ServerEvent);
      } catch {
        /* bỏ qua frame không phải JSON */
      }
    };
    ws.onerror = () => ws.close(); // -> kích hoạt onclose -> reconnect
    ws.onclose = () => {
      this.ws = null;
      if (this.shouldRun) this.scheduleReconnect();
      else this.onState("closed");
    };

    this.ws = ws;
  }

  private scheduleReconnect(): void {
    this.onState("reconnecting");
    const delay = Math.min(1000 * 2 ** this.retries, 8000); // 1s,2s,4s,8s,8s...
    this.retries++;
    this.timer = setTimeout(() => {
      if (this.shouldRun) this.open();
    }, delay);
  }

  sendAudio(pcm: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm);
  }

  close(): void {
    this.shouldRun = false;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }
}
