import { GoogleGenAI, Modality } from "@google/genai";
import type { Session } from "@google/genai";
import { config } from "../config.js";
import type { BrainEvent, TranslatorBrain } from "./TranslatorBrain.js";

/**
 * Dịch 2 chiều thật giữa 2 ngôn ngữ bằng Gemini 3.5 Live Translate.
 *
 * Model chỉ nhận 1 ngôn ngữ ĐÍCH (translationConfig.targetLanguageCode) và sẽ
 * IM LẶNG khi input đã là tiếng đích (echoTargetLanguage=false). Vì vậy để dịch
 * 2 chiều giữa A và B, ta chạy 2 LUỒNG song song, feed cùng audio:
 *   - Luồng đích A: nghe B -> ra A; nghe A -> im.
 *   - Luồng đích B: nghe A -> ra B; nghe B -> im.
 * Mỗi câu chỉ đúng 1 luồng lên tiếng -> không trùng.
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
          echoTargetLanguage: false, // im lặng khi input đã là tiếng đích
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

    if (this.emitSource && sc.inputTranscription?.text) {
      this.emit({
        type: "source",
        text: sc.inputTranscription.text,
        final: Boolean(sc.turnComplete),
      });
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

const AUDIO_OWNER_RELEASE_MS = 1000;

export class GeminiLiveBrain implements TranslatorBrain {
  private ai: GoogleGenAI;
  private streams: TranslationStream[] = [];
  private greeted = false;
  // Mỗi lượt chỉ cho 1 luồng phát audio -> tránh 2 giọng chồng nhau gây "giật lác".
  private audioOwner: number | null = null;
  private audioOwnerTimer: ReturnType<typeof setTimeout> | null = null;

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

    // Lọc audio theo "chủ sở hữu lượt": luồng đầu tiên phát audio giữ quyền, audio
    // luồng kia bị bỏ; im ~1s thì nhả quyền cho lượt sau (có thể là chiều ngược lại).
    const makeEmit = (idx: number) => (e: BrainEvent): void => {
      if (e.type === "interrupted") {
        this.audioOwner = null;
        if (this.audioOwnerTimer) clearTimeout(this.audioOwnerTimer);
      } else if (e.type === "audio") {
        if (this.audioOwner === null) this.audioOwner = idx;
        if (this.audioOwner !== idx) return; // bỏ audio luồng không sở hữu
        if (this.audioOwnerTimer) clearTimeout(this.audioOwnerTimer);
        this.audioOwnerTimer = setTimeout(() => (this.audioOwner = null), AUDIO_OWNER_RELEASE_MS);
      }
      onEvent(e);
    };

    const [a, b] = config.languages;
    // 2 luồng ngược chiều -> dịch 2 chiều thật. Chỉ luồng A phát transcript gốc.
    this.streams = [
      new TranslationStream(this.ai, a, makeEmit(0), true, greetOnce),
      new TranslationStream(this.ai, b, makeEmit(1), false, greetOnce),
    ];
    await Promise.all(this.streams.map((s) => s.start()));
  }

  sendAudio(pcmChunk: Buffer): void {
    for (const s of this.streams) s.sendAudio(pcmChunk);
  }

  async stop(): Promise<void> {
    if (this.audioOwnerTimer) clearTimeout(this.audioOwnerTimer);
    this.audioOwner = null;
    await Promise.all(this.streams.map((s) => s.stop()));
    this.streams = [];
  }
}
