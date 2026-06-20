import { getToken, type User } from "./api.ts";

export type OnlineUser = Pick<User, "id" | "username" | "language">;

/** Kết nối presence WS để biết ai đang online. Trả về hàm đóng. */
export function connectPresence(onOnline: (users: OnlineUser[]) => void): () => void {
  const token = getToken();
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/presence?token=${token}`;
  const ws = new WebSocket(url);
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.type === "online") onOnline(m.users as OnlineUser[]);
    } catch {
      /* bỏ qua */
    }
  };
  return () => ws.close();
}
