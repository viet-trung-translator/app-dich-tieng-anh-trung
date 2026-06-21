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
export class TranslationStream {
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
    private domainInstruction?: string, // có -> dùng model đa năng + chỉ thị (chế độ chuyên ngành)
  ) {}

  async start(): Promise<void> {
    await this.open();
  }

  private async open(): Promise<void> {
    // Chế độ chuyên ngành: model đa năng + systemInstruction (glossary/lĩnh vực).
    // Mặc định: model Live Translate nhanh + translationConfig.
    const liveConfig: any = this.domainInstruction
      ? {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: { parts: [{ text: this.domainInstruction }] },
        }
      : {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          translationConfig: { targetLanguageCode: this.targetLang, echoTargetLanguage: false },
        };
    const session = await this.ai.live.connect({
      model: this.domainInstruction ? config.domainModel : config.geminiModel,
      config: liveConfig,
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
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    // Dải chữ Hán (CJK): 0x3400-0x9FFF, 0xF900-0xFAFF. Chỉ dùng mã, tránh lỗi mã hóa.
    if ((c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff)) return "zh";
  }
  return "vi";
}
function detectLangLegacy(text: string): string {
  return /[㐀-鿿豈-﫿]/.test(text) ? "zh" : "vi";
}

export class GeminiLiveBrain implements TranslatorBrain {
  private ai: GoogleGenAI;
  private streams: TranslationStream[] = [];
  private greeted = false;

  private targets: string[] = [];
  private out: (e: BrainEvent) => void = () => {};
  // LÚC NÀO CŨNG chỉ 1 luồng được phát -> không bao giờ chồng tiếng/hỗn loạn.
  // Chuyển luồng theo ngôn ngữ nhận diện từ transcript đầu vào.
  private activeIdx = 0;

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
    this.out = onEvent;

    const greetOnce = () => {
      if (!this.greeted) {
        this.greeted = true;
        onEvent({ type: "status", message: "Đã kết nối Gemini Live." });
      }
    };

    const [a, b] = config.languages;
    this.targets = [a, b];

    this.streams = [
      new TranslationStream(this.ai, a, this.makeEmit(0), true, (t) => this.onInput(t), greetOnce),
      new TranslationStream(this.ai, b, this.makeEmit(1), false, (t) => this.onInput(t), greetOnce),
    ];
    await Promise.all(this.streams.map((s) => s.start()));
  }

  /** Transcript đầu vào -> chọn luồng có đích KHÁC tiếng đang nói làm luồng phát. */
  private onInput(text: string): void {
    const lang = detectLang(text);
    this.activeIdx = this.targets[0] !== lang ? 0 : 1;
  }

  /** Chỉ luồng đang active mới được phát audio + chữ dịch. */
  private makeEmit(idx: number) {
    return (e: BrainEvent): void => {
      if ((e.type === "audio" || e.type === "text") && idx !== this.activeIdx) return;
      this.out(e);
    };
  }

  sendAudio(pcmChunk: Buffer): void {
    for (const s of this.streams) s.sendAudio(pcmChunk);
  }

  async stop(): Promise<void> {
    await Promise.all(this.streams.map((s) => s.stop()));
    this.streams = [];
  }
}
