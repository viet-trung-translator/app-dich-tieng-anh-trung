import type { FastifyInstance } from "fastify";
import { verifyRawToken } from "./auth.js";

type Conn = { userId: number; username: string; language: string; socket: any };

// Ai đang online (userId -> kết nối). Sau này dùng luôn cho tín hiệu gọi (GĐ2).
const online = new Map<number, Conn>();

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

export function registerPresence(app: FastifyInstance): void {
  app.get("/presence", { websocket: true }, (socket: any, req) => {
    const token = (req.query as { token?: string }).token;
    const p = verifyRawToken(token);
    if (!p) {
      socket.close();
      return;
    }
    // Nhiều tab cùng tài khoản -> giữ kết nối mới nhất.
    online.set(p.sub, { userId: p.sub, username: p.username, language: p.language, socket });
    broadcastOnline();

    socket.on("close", () => {
      if (online.get(p.sub)?.socket === socket) {
        online.delete(p.sub);
        broadcastOnline();
      }
    });
  });
}
