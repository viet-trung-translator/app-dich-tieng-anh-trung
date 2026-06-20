// Test plumbing /call-media (không cần audio thật): dựng 1 cuộc gọi active qua
// tín hiệu, rồi kiểm tra kết nối audio hợp lệ MỞ được, callId sai bị TỪ CHỐI.
import WebSocket from "ws";
import { signToken } from "./src/auth.js";

const tA = signToken({ sub: 9001, username: "alice", role: "user", language: "vi" });
const tB = signToken({ sub: 9002, username: "bob", role: "user", language: "zh" });
const pres = "ws://localhost:8787/presence?token=";
const media = "ws://localhost:8787/call-media?";

const open = (ws: WebSocket) => new Promise((r) => ws.on("open", r));
const wait = (ws: WebSocket, pred: (m: any) => boolean) =>
  new Promise<any>((res) => {
    const h = (d: any) => {
      const m = JSON.parse(d.toString());
      if (pred(m)) {
        ws.off("message", h);
        res(m);
      }
    };
    ws.on("message", h);
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let ok = true;
const check = (c: boolean, label: string) => {
  console.log((c ? "  OK  " : " FAIL ") + label);
  if (!c) ok = false;
};

const a = new WebSocket(pres + tA);
const b = new WebSocket(pres + tB);
await Promise.all([open(a), open(b)]);
a.send(JSON.stringify({ type: "call", toUserId: 9002 }));
const incoming = await wait(b, (m) => m.type === "incoming");
const callId = incoming.callId;
b.send(JSON.stringify({ type: "accept", callId }));
await wait(a, (m) => m.type === "accepted");
console.log("Cuoc goi active, callId =", callId);

// Kết nối audio hợp lệ (2 phía) -> phải mở và đứng vững.
const ma = new WebSocket(media + `callId=${callId}&token=${tA}`);
const mb = new WebSocket(media + `callId=${callId}&token=${tB}`);
await Promise.all([open(ma), open(mb)]);
await sleep(1500);
check(ma.readyState === WebSocket.OPEN, "media A mo & dung vung (auth + Gemini ok)");
check(mb.readyState === WebSocket.OPEN, "media B mo & dung vung");

// callId sai -> phải bị đóng.
const bad = new WebSocket(media + `callId=khong-co-that&token=${tA}`);
const badClosed = await new Promise<boolean>((res) => {
  bad.on("close", () => res(true));
  bad.on("open", () => setTimeout(() => res(false), 600));
});
check(badClosed, "media callId sai bi tu choi (dong)");

[a, b, ma, mb].forEach((w) => w.close());
console.log(ok ? "\n✅ PASS" : "\n❌ FAIL");
process.exit(ok ? 0 : 1);
