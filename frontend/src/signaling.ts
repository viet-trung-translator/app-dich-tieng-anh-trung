import { getToken } from "./api.ts";

export type OnlineUser = { id: number; username: string; language: "vi" | "zh" };
export type Peer = { id: number; username: string; language: "vi" | "zh" };

export type CallEvent =
  | { type: "incoming"; callId: string; from: Peer }
  | { type: "ringing"; callId: string; to: Peer }
  | { type: "accepted"; callId: string; peer: Peer }
  | { type: "ended"; callId: string; reason: string }
  | { type: "unavailable"; reason: string };

/** Một kết nối WS duy nhất: cập nhật online + tín hiệu cuộc gọi. */
export class Signaling {
  private ws: WebSocket | null = null;
  private shouldRun = false;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  onOnline: (users: OnlineUser[]) => void = () => {};
  onCall: (e: CallEvent) => void = () => {};
  onConn: (connected: boolean) => void = () => {};

  connect(): void {
    this.shouldRun = true;
    this.open();
  }

  private open(): void {
    const token = getToken();
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/presence?token=${token}`;
    const ws = new WebSocket(url);
    ws.onopen = () => {
      this.retries = 0;
      this.onConn(true);
    };
    ws.onmessage = (ev) => {
      let m: any;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.type === "online") this.onOnline(m.users as OnlineUser[]);
      else this.onCall(m as CallEvent);
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      this.ws = null;
      this.onConn(false);
      if (!this.shouldRun) return;
      // Tự nối lại (máy chủ ngủ dậy / rớt mạng / đổi WiFi-4G).
      const delay = Math.min(1000 * 2 ** this.retries, 8000);
      this.retries++;
      this.timer = setTimeout(() => this.shouldRun && this.open(), delay);
    };
    this.ws = ws;
  }

  private send(obj: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  call(toUserId: number, domain?: string, glossary?: string) {
    this.send({ type: "call", toUserId, domain, glossary });
  }
  accept(callId: string) {
    this.send({ type: "accept", callId });
  }
  reject(callId: string) {
    this.send({ type: "reject", callId });
  }
  cancel(callId: string) {
    this.send({ type: "cancel", callId });
  }
  hangup(callId: string) {
    this.send({ type: "hangup", callId });
  }
  close() {
    this.shouldRun = false;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }
}
