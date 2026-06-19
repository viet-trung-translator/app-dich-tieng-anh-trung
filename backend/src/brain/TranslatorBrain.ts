/**
 * Lớp trừu tượng cho "bộ não" dịch.
 * Hôm nay là Gemini 3.5 Live Translate; mai có thể là model khác.
 * App chỉ phụ thuộc vào interface này, không phụ thuộc vào nhà cung cấp cụ thể.
 */

/** Sự kiện brain trả về cho client (qua WebSocket). */
export type BrainEvent =
  | { type: "source"; text: string; final: boolean } // transcript câu GỐC (người nói)
  | { type: "text"; text: string; final: boolean } // transcript bản DỊCH (chữ chạy)
  | { type: "audio"; dataBase64: string; sampleRate: number } // PCM giọng dịch
  | { type: "interrupted" } // người dùng nói chen ngang
  | { type: "status"; message: string }
  | { type: "error"; message: string };

export interface TranslatorBrain {
  /** Mở phiên dịch. `onEvent` được gọi mỗi khi có text/audio trả về. */
  start(onEvent: (e: BrainEvent) => void): Promise<void>;

  /** Đẩy 1 chunk audio PCM 16kHz/16-bit/mono lên brain. */
  sendAudio(pcmChunk: Buffer): void;

  /** Đóng phiên, dọn tài nguyên. */
  stop(): Promise<void>;
}
