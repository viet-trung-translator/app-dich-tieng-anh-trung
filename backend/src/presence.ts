import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { verifyRawToken } from "./auth.js";

type Conn = { userId: number; username: string; language: string; socket: any };
type PeerInfo = { id: number; username: string; language: string };
export type Call = {
  id: string;
  callerId: number;
  calleeId: number;
  state: "ringing" | "active";
  langs: Record<number, string>; // userId -> ngôn ngữ
};

// Ai đang online + cuộc gọi đang diễn ra.
const online = new Map<number, Conn>();
const calls = new Map<string, Call>();
const userCall = new Map<number, string>(); // userId -> callId (đang bận)

/** Cho module audio cuộc gọi tra cứu cuộc gọi đang hoạt động. */
export function getCall(callId: string): Call | undefined {
  return calls.get(callId);
}

function sendTo(userId: number, obj: unknown): void {
  const c = online.get(userId);
  if (c && c.socket.readyState === c.socket.OPEN) c.socket.send(JSON.stringify(obj));
}

function peerOf(userId: number): PeerInfo | null {
  const c = online.get(userId);
  return c ? { id: c.userId, username: c.username, language: c.language } : null;
}

function broadcastOnline(): void {
  const users = [...online.values()].map((c) => ({
    id: c.userId,
    username: c.username,
    language: c.language,
  }));
  const msg = JSON.stringify({ type: "online", users });
  for (const c of online.values()) {
    if (c.socket.readyState === c.socket.OPEN) c.socket.send(msg);
  }
}

/** Kết thúc cuộc gọi: báo người còn lại + dọn dẹp. */
function endCall(callId: string, reason: string, except?: number): void {
  const call = calls.get(callId);
  if (!call) return;
  for (const uid of [call.callerId, call.calleeId]) {
    userCall.delete(uid);
    if (uid !== except) sendTo(uid, { type: "ended", callId, reason });
  }
  calls.delete(callId);
}

function handleSignal(self: Conn, msg: any): void {
  const me = self.userId;
  switch (msg?.type) {
    case "call": {
      const toId = Number(msg.toUserId);
      if (userCall.has(me)) return; // mình đang bận
      const callee = online.get(toId);
      if (!callee) return sendTo(me, { type: "unavailable", reason: "offline" });
      if (userCall.has(toId)) return sendTo(me, { type: "unavailable", reason: "busy" });

      const callId = randomUUID();
      calls.set(callId, {
        id: callId,
        callerId: me,
        calleeId: toId,
        state: "ringing",
        langs: { [me]: self.language, [toId]: callee.language },
      });
      userCall.set(me, callId);
      userCall.set(toId, callId);
      sendTo(toId, { type: "incoming", callId, from: peerOf(me) });
      sendTo(me, { type: "ringing", callId, to: peerOf(toId) });
      break;
    }
    case "accept": {
      const call = calls.get(String(msg.callId));
      if (!call || call.calleeId !== me || call.state !== "ringing") return;
      call.state = "active";
      sendTo(call.callerId, { type: "accepted", callId: call.id, peer: peerOf(call.calleeId) });
      sendTo(call.calleeId, { type: "accepted", callId: call.id, peer: peerOf(call.callerId) });
      break;
    }
    case "reject": {
      const call = calls.get(String(msg.callId));
      if (!call || call.calleeId !== me) return;
      endCall(call.id, "rejected", me);
      break;
    }
    case "cancel": {
      const call = calls.get(String(msg.callId));
      if (!call || call.callerId !== me) return;
      endCall(call.id, "canceled", me);
      break;
    }
    case "hangup": {
      const call = calls.get(String(msg.callId));
      if (!call || (call.callerId !== me && call.calleeId !== me)) return;
      endCall(call.id, "hangup", me);
      break;
    }
  }
}

let heartbeatStarted = false;
/** Nhịp tim: 30s/lần ping mọi kết nối; ai không "pong" lại -> coi là chết, đóng + dọn. */
function startHeartbeat(): void {
  if (heartbeatStarted) return;
  heartbeatStarted = true;
  setInterval(() => {
    for (const conn of online.values()) {
      const ws = conn.socket;
      if (ws.isAlive === false) {
        ws.terminate(); // -> kích hoạt 'close' -> dọn dẹp + broadcast
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }
  }, 30000);
}

export function registerPresence(app: FastifyInstance): void {
  startHeartbeat();
  app.get("/presence", { websocket: true }, (socket: any, req) => {
    const p = verifyRawToken((req.query as { token?: string }).token);
    if (!p) {
      socket.close();
      return;
    }
    socket.isAlive = true;
    socket.on("pong", () => (socket.isAlive = true));
    const conn: Conn = { userId: p.sub, username: p.username, language: p.language, socket };
    online.set(p.sub, conn);
    broadcastOnline();

    socket.on("message", (data: Buffer) => {
      try {
        handleSignal(conn, JSON.parse(data.toString()));
      } catch {
        /* bỏ qua tin nhắn hỏng */
      }
    });

    socket.on("close", () => {
      if (online.get(p.sub)?.socket !== socket) return; // đã bị tab mới thay
      // Đang trong cuộc gọi -> kết thúc, báo người kia.
      const callId = userCall.get(p.sub);
      if (callId) endCall(callId, "disconnected", p.sub);
      online.delete(p.sub);
      broadcastOnline();
    });
  });
}
