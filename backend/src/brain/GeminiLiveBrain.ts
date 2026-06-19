import { GoogleGenAI, Modality } from "@google/genai";
import type { Session } from "@google/genai";
import { config } from "../config.js";
import type { BrainEvent, TranslatorBrain } from "./TranslatorBrain.js";

/**
 * Nối tới Gemini 3.5 Live Translate qua Live API (WebSocket).
 *
 * Model tự nhận diện ngôn ngữ và dịch 2 chiều (Trung <-> Anh), trả về
 * audio (giọng dịch, 24kHz PCM) + transcript (chữ chạy).
 * Input audio yêu cầu: PCM 16kHz, 16-bit little-endian, mono.
 *
 * SEAMLESS SESSION ROLLOVER:
 *   Phiên Gemini audio giới hạn ~15 phút. Trước mốc đó (config.sessionRolloverMs)
 *   ta mở 1 phiên MỚI, chuyển audio sang phiên mới, và giữ phiên cũ thêm vài giây
 *   để nó phát nốt câu đang dịch rồi mới đóng -> người dùng không thấy gián đoạn.
 *   Nhờ vậy app chạy "liên tục cho tới khi tắt".
 */
const OLD_SESSION_GRACE_MS = 3000;

export class GeminiLiveBrain implements TranslatorBrain {
  private ai: GoogleGenAI;
  private current: Session | null = null;
  private sessions = new Set<Session>(); // các phiên đang còn forward sự kiện
  private onEvent: ((e: BrainEvent) => void) | null = null;
  private rolloverTimer: ReturnType<typeof setTimeout> | null = null;
  private greeted = false;
  private stopped = false;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }

  async start(onEvent: (e: BrainEvent) => void): Promise<void> {
    this.onEvent = onEvent;
    if (!config.geminiApiKey) {
      onEvent({
        type: "error",
        message: "Thiếu GEMINI_API_KEY ở backend. Hãy điền vào file .env rồi khởi động lại.",
      });
      return;
    }
    await this.openSession();
  }

  /** Mở 1 phiên Gemile Live mới, chuyển 'current' sang nó, lên lịch rollover kế tiếp. */
  private async openSession(): Promise<void> {
    const emit = (e: BrainEvent) => this.onEvent?.(e);

    const session = await this.ai.live.connect({
      model: config.geminiModel,
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {}, // transcript bản dịch -> chữ chạy
        inputAudioTranscription: {}, // (tuỳ chọn) transcript câu gốc
      },
      callbacks: {
        onopen: () => {
          if (!this.greeted) {
            this.greeted = true;
            emit({ type: "status", message: "Đã kết nối Gemini Live." });
          }
        },
        // Chỉ forward sự kiện từ phiên còn nằm trong set (current + phiên cũ đang drain).
        onmessage: (msg: any) => {
          if (this.sessions.has(session)) this.handleMessage(msg, emit);
        },
        onerror: (e: any) => emit({ type: "error", message: `Gemini error: ${e?.message ?? e}` }),
        onclose: () => this.sessions.delete(session),
      },
    });

    const old = this.current;
    this.sessions.add(session);
    this.current = session;

    // Giữ phiên cũ thêm vài giây để phát nốt rồi đóng (tránh cắt giữa câu).
    if (old) {
      setTimeout(() => {
        this.sessions.delete(old);
        try {
          old.close();
        } catch {
          /* ignore */
        }
      }, OLD_SESSION_GRACE_MS);
    }

    this.scheduleRollover();
  }

  private scheduleRollover(): void {
    if (this.rolloverTimer) clearTimeout(this.rolloverTimer);
    this.rolloverTimer = setTimeout(() => {
      if (this.stopped) return;
      this.onEvent?.({ type: "status", message: "Đang làm mới phiên (nền)..." });
      this.openSession().catch((err) =>
        this.onEvent?.({ type: "error", message: `Rollover lỗi: ${err?.message ?? err}` }),
      );
    }, config.sessionRolloverMs);
  }

  private handleMessage(msg: any, emit: (e: BrainEvent) => void): void {
    const sc = msg?.serverContent;
    if (!sc) return;

    if (sc.interrupted) emit({ type: "interrupted" });

    // Transcript câu gốc (người nói) -> hiển thị song ngữ.
    if (sc.inputTranscription?.text) {
      emit({ type: "source", text: sc.inputTranscription.text, final: Boolean(sc.turnComplete) });
    }

    // Transcript bản dịch.
    if (sc.outputTranscription?.text) {
      emit({ type: "text", text: sc.outputTranscription.text, final: Boolean(sc.turnComplete) });
    }

    const parts = sc.modelTurn?.parts ?? [];
    for (const part of parts) {
      const data = part?.inlineData?.data;
      if (data) emit({ type: "audio", dataBase64: data, sampleRate: 24000 });
    }
  }

  sendAudio(pcmChunk: Buffer): void {
    if (!this.current) return;
    this.current.sendRealtimeInput({
      audio: { data: pcmChunk.toString("base64"), mimeType: "audio/pcm;rate=16000" },
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.rolloverTimer) clearTimeout(this.rolloverTimer);
    for (const s of this.sessions) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
    this.sessions.clear();
    this.current = null;
    this.onEvent = null;
  }
}
