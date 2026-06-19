import { GoogleGenAI, Modality } from "@google/genai";
import type { Session } from "@google/genai";
import { config } from "../config.js";
import type { BrainEvent, TranslatorBrain } from "./TranslatorBrain.js";

/**
 * Dịch 2 chiều thật giữa 2 ngôn ngữ bằng Gemini 3.5 Live Translate.
 *
 * Model chỉ nhận 1 ngôn ngữ ĐÍCH (translationConfig.targetLanguageCode). Để dịch
 * 2 chiều A<->B ta chạy 2 LUỒNG song song (đích A và đích B), feed cùng audio.
 *
 * QUAN TRỌNG: thực tế cả 2 luồng đều có thể phát audio (echoTargetLanguage không
 * chặn triệt để), nên KHÔNG dựa vào nó. Thay vào đó, ta tự NHẬN DIỆN ngôn ngữ đang
 * nói (chữ Hán -> "zh", còn lại -> "vi") từ transcript đầu vào, rồi CHỈ phát luồng
 * có ngôn ngữ đích KHÁC với tiếng đang nói:
 *   - Nói Trung (zh) -> chỉ phát luồng đích vi (ra tiếng Việt).
 *   - Nói Việt (vi) -> chỉ phát luồng đích zh (ra tiếng Trung).
 *
 * Mỗi luồng tự "seamless rollover" trước mốc 15 phút để chạy liên tục.
 */
const OLD_SESSION_GRACE_MS = 3000;

/** Một luồng dịch: cố định 1 ngôn ngữ đích, tự rollover phiên. */
class TranslationStream {
  private sessions = new Set<Session>();
  private current: Session | null = null;
  private rolloverTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private ai: GoogleGenAI,
    private targetLang: string,
    private emit: (e: BrainEvent) => void,
    private emitSource: boolean, // chỉ 1 luồng phát transcript câu gốc (tránh trùng)
    private onInput: (text: string) => void, // mọi luồng báo transcript đầu vào để nhận diện ngôn ngữ
    private onFirstOpen: () => void,
  ) {}

  async start(): Promise<void> {
    await this.open();
  }

  private async open(): Promise<void> {
    const session = await this.ai.live.connect({
      model: config.geminiModel,
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        translationConfig: {
          targetLanguageCode: this.targetLang,
          echoTargetLanguage: false,
        },
      },
      callbacks: {
        onopen: () => this.onFirstOpen(),
        onmessage: (msg: any) => {
          if (this.sessions.has(session)) this.handle(msg);
        },
        onerror: (e: any) =>
          this.emit({ type: "error", message: `Gemini error: ${e?.message ?? e}` }),
        onclose: () => this.sessions.delete(session),
      },
    });

    const old = this.current;
    this.sessions.add(session);
    this.current = session;

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
      this.open().catch((err) =>
        this.emit({ type: "error", message: `Rollover lỗi: ${err?.message ?? err}` }),
      );
    }, config.sessionRolloverMs);
  }

  private handle(msg: any): void {
    const sc = msg?.serverContent;
    if (!sc) return;

    if (sc.interrupted) this.emit({ type: "interrupted" });

    if (sc.inputTranscription?.text) {
      this.onInput(sc.inputTranscription.text); // nhận diện ngôn ngữ (mọi luồng)
      if (this.emitSource) {
        this.emit({
          type: "source",
          text: sc.inputTranscription.text,
          final: Boolean(sc.turnComplete),
        });
      }
    }

    if (sc.outputTranscription?.text) {
      this.emit({ type: "text", text: sc.outputTranscription.text, final: Boolean(sc.turnComplete) });
    }

    const parts = sc.modelTurn?.parts ?? [];
    for (const part of parts) {
      const data = part?.inlineData?.data;
      if (data) this.emit({ type: "audio", dataBase64: data, sampleRate: 24000 });
    }
  }

  sendAudio(chunk: Buffer): void {
    this.current?.sendRealtimeInput({
      audio: { data: chunk.toString("base64"), mimeType: "audio/pcm;rate=16000" },
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
  }
}

/** Nhận diện ngôn ngữ đơn giản theo chữ viết: có chữ Hán -> "zh", còn lại -> "vi". */
function detectLang(text: string): string {
  return /[㐀-鿿豈-﫿]/.test(text) ? "zh" : "vi";
}

export class GeminiLiveBrain implements TranslatorBrain {
  private ai: GoogleGenAI;
  private streams: TranslationStream[] = [];
  private greeted = false;
  private inputLang: string | null = null; // ngôn ngữ đang nói (cập nhật liên tục)

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }

  async start(onEvent: (e: BrainEvent) => void): Promise<void> {
    if (!config.geminiApiKey) {
      onEvent({
        type: "error",
        message: "Thiếu GEMINI_API_KEY ở backend. Hãy điền vào file .env rồi khởi động lại.",
      });
      return;
    }

    const greetOnce = () => {
      if (!this.greeted) {
        this.greeted = true;
        onEvent({ type: "status", message: "Đã kết nối Gemini Live." });
      }
    };

    const onInput = (text: string) => {
      this.inputLang = detectLang(text);
    };

    const [a, b] = config.languages;
    const targets = [a, b];

    // CHỈ phát luồng có đích KHÁC tiếng đang nói (luồng dịch ra đúng tiếng đang nói
    // là echo/vô nghĩa -> bỏ). Nhờ vậy nói Trung ra Việt, nói Việt ra Trung.
    const makeEmit = (idx: number) => (e: BrainEvent): void => {
      if (e.type === "audio" && this.inputLang && targets[idx] === this.inputLang) return;
      onEvent(e);
    };

    this.streams = [
      new TranslationStream(this.ai, a, makeEmit(0), true, onInput, greetOnce),
      new TranslationStream(this.ai, b, makeEmit(1), false, onInput, greetOnce),
    ];
    await Promise.all(this.streams.map((s) => s.start()));
  }

  sendAudio(pcmChunk: Buffer): void {
    for (const s of this.streams) s.sendAudio(pcmChunk);
  }

  async stop(): Promise<void> {
    await Promise.all(this.streams.map((s) => s.stop()));
    this.streams = [];
    this.inputLang = null;
  }
}
