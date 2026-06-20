// Test bắt tay cuộc gọi (không cần DB): ký 2 token giả, nối 2 WS, chạy call flow.
import WebSocket from "ws";
import { signToken } from "./src/auth.js";

const tA = signToken({ sub: 9001, username: "alice", role: "user", language: "vi" });
const tB = signToken({ sub: 9002, username: "bob", role: "user", language: "zh" });
const base = "ws://localhost:8787/presence?token=";

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

const open = (ws: WebSocket) => new Promise((r) => ws.on("open", r));

const a = new WebSocket(base + tA);
const b = new WebSocket(base + tB);
await Promise.all([open(a), open(b)]);
console.log("Hai client da ket noi.");

let ok = true;
const check = (c: boolean, label: string) => {
  console.log((c ? "  OK  " : " FAIL ") + label);
  if (!c) ok = false;
};

// alice goi bob
a.send(JSON.stringify({ type: "call", toUserId: 9002 }));
const incoming = await wait(b, (m) => m.type === "incoming");
check(incoming.from?.username === "alice", "bob nhan 'incoming' tu alice");
const ringing = await wait(a, (m) => m.type === "ringing");
check(ringing.to?.username === "bob", "alice nhan 'ringing' toi bob");
const callId = incoming.callId;

// bob nghe may
b.send(JSON.stringify({ type: "accept", callId }));
const accA = await wait(a, (m) => m.type === "accepted");
const accB = await wait(b, (m) => m.type === "accepted");
check(accA.peer?.username === "bob", "alice nhan 'accepted' peer=bob");
check(accB.peer?.username === "alice", "bob nhan 'accepted' peer=alice");

// alice cup may
a.send(JSON.stringify({ type: "hangup", callId }));
const ended = await wait(b, (m) => m.type === "ended");
check(ended.reason === "hangup", "bob nhan 'ended' khi alice cup may");

a.close();
b.close();
console.log(ok ? "\n✅ PASS" : "\n❌ FAIL");
process.exit(ok ? 0 : 1);
