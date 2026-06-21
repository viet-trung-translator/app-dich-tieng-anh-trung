import { GoogleGenAI } from "@google/genai";
import type { FastifyInstance } from "fastify";
import { config } from "./config.js";
import { verifyRawToken } from "./auth.js";
import { getCall } from "./presence.js";
import { TranslationStream } from "./brain/GeminiLiveBrain.js";
import type { BrainEvent } from "./brain/TranslatorBrain.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

// callId -> (userId -> media socket). Dùng để gửi audio/chữ đã dịch sang người nghe.
const rooms = new Map<string, Map<number, any>>();

const langName = (l: string) => (l === "zh" ? "Chinese (Mandarin)" : l === "vi" ? "Vietnamese" : l);

// Mô tả lĩnh vực (giúp model hiểu ngữ cảnh để dùng đúng thuật ngữ).
const DOMAIN_DESC: Record<string, string> = {
  factory:
    "factory / manufacturing shop floor: machinery, production lines, assembly, quality control (QC), " +
    "equipment operation, maintenance, materials, work orders, safety and worker instructions",
  medical: "medical / healthcare",
  technical: "technical / engineering",
  legal: "legal",
  business: "business / commerce",
};

/** Chỉ thị cho model đa năng ở chế độ chuyên ngành (dịch sang targetLang + glossary). */
function domainInstruction(targetLang: string, domain?: string, glossary?: string): string | undefined {
  const hasDomain = domain && domain !== "general";
  if (!hasDomain && !glossary) return undefined; // không bật chế độ chuyên ngành
  let s =
    `You are ONLY a professional real-time simultaneous interpreter — NOT an assistant. ` +
    `Translate everything the speaker says into ${langName(targetLang)}, preserving tone, emotion and intent. ` +
    `Output ONLY the spoken translation in ${langName(targetLang)} — no explanations, no extra words. ` +
    `CRITICAL: Never answer, comment, or chat. Translate ONLY new speech. ` +
    `If the speaker is silent or there is nothing new to translate, stay COMPLETELY SILENT — ` +
    `never repeat a previous sentence, never add filler, never keep talking on your own. ` +
    `If you hear audio that is already your own previous translation, ignore it and stay silent.`;
  if (hasDomain) {
    const desc = DOMAIN_DESC[domain] ?? domain;
    s += ` Context domain: ${desc}. Use correct, precise terminology for this domain.`;
  }
  if (glossary) s += ` Use this glossary exactly when relevant: ${glossary}.`;
  return s;
}

/**
 * Kênh audio cuộc gọi. Mỗi client:
 *  - GỬI: audio mic (PCM 16kHz, binary).
 *  - NHẬN: audio dịch (24kHz) + chữ dịch của ĐỐI PHƯƠNG (JSON).
 *
 * Server: lời của TÔI -> 1 phiên Gemini đích = tiếng NGƯỜI NGHE -> gửi sang socket người nghe.
 * Hai người = 2 phiên ngược chiều -> dịch 2 chiều.
 */
export function registerCallMedia(app: FastifyInstance): void {
  app.get("/call-media", { websocket: true }, (socket: any, req) => {
    const q = req.query as { token?: string; callId?: string };
    const p = verifyRawToken(q.token);
    const call = q.callId ? getCall(q.callId) : undefined;
    if (!p || !call || call.state !== "active" || (p.sub !== call.callerId && p.sub !== call.calleeId)) {
      socket.close();
      return;
    }
    const callId = call.id;
    const me = p.sub;
    const peerId = me === call.callerId ? call.calleeId : call.callerId;
    const peerLang = call.langs[peerId] ?? "vi";

    let room = rooms.get(callId);
    if (!room) {
      room = new Map();
      rooms.set(callId, room);
    }
    room.set(me, socket);

    // Lời tôi -> dịch sang tiếng người nghe -> gửi audio/chữ sang socket người nghe.
    const sendToPeer = (e: BrainEvent) => {
      if (e.type !== "audio" && e.type !== "text" && e.type !== "interrupted") return;
      const ps = rooms.get(callId)?.get(peerId);
      if (ps && ps.readyState === ps.OPEN) ps.send(JSON.stringify(e));
    };
    // Luôn dùng model dịch chuyên dụng (nhanh, dịch liên tục, không tự lặp).
    // (Model hội thoại + glossary tạm tắt vì không hợp dịch liên tục — để dành nâng cấp sau.)
    void domainInstruction; // giữ hàm cho tương lai
    const translator = new TranslationStream(ai, peerLang, sendToPeer, false, () => {}, () => {});
    translator.start().catch((err) => app.log.error(err));

    socket.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) translator.sendAudio(data);
    });

    socket.on("close", () => {
      void translator.stop();
      const r = rooms.get(callId);
      if (r && r.get(me) === socket) r.delete(me);
      if (r && r.size === 0) rooms.delete(callId);
    });
  });
}
