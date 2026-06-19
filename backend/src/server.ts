import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { config, assertConfig } from "./config.js";
import { GeminiLiveBrain } from "./brain/GeminiLiveBrain.js";
import type { BrainEvent } from "./brain/TranslatorBrain.js";

assertConfig();

const app = Fastify({ logger: true });
await app.register(websocket);

app.get("/health", async () => ({ ok: true, model: config.geminiModel }));

/**
 * Endpoint phiên dịch.
 * - Client gửi: binary frames = PCM 16kHz/16-bit/mono.
 * - Server gửi về: JSON events (text / audio / status / error).
 */
app.get("/translate", { websocket: true }, (socket) => {
  const brain = new GeminiLiveBrain();

  const send = (e: BrainEvent) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(e));
  };

  brain
    .start(send)
    .catch((err) => send({ type: "error", message: String(err?.message ?? err) }));

  socket.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      brain.sendAudio(data);
    }
    // (text control messages có thể xử lý ở đây sau này)
  });

  socket.on("close", () => {
    void brain.stop();
  });
});

// Khi đã build frontend (prod / 1 service): Fastify phục vụ luôn file tĩnh.
// Nhờ vậy chỉ cần 1 origin HTTPS, WS /translate cùng origin.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = process.env.STATIC_DIR ?? path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(path.join(staticDir, "index.html"))) {
  await app.register(fastifyStatic, { root: staticDir });
  // SPA fallback: GET không khớp -> trả index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET") return reply.sendFile("index.html");
    return reply.code(404).send({ error: "not found" });
  });
  app.log.info(`Phục vụ frontend tĩnh từ: ${staticDir}`);
} else {
  app.log.info("Chưa có frontend build (dev). Dùng Vite dev server cho frontend.");
}

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`Backend chạy ở http://localhost:${config.port}  (model: ${config.geminiModel})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
