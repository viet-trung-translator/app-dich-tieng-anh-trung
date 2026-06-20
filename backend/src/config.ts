import "dotenv/config";

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.5-live-translate-preview",
  port: Number(process.env.PORT ?? 8787),
  // Phiên Gemini audio giới hạn ~15 phút. Mở phiên mới trước mốc này để chạy liên tục.
  sessionRolloverMs: Number(process.env.SESSION_ROLLOVER_MS ?? 14 * 60 * 1000),
  // Cặp ngôn ngữ dịch 2 chiều (BCP-47). Mặc định vi <-> zh (Việt <-> Trung).
  // Mỗi tiếng là 1 ngôn ngữ đích của 1 luồng -> dịch qua lại.
  languages: (process.env.LANGUAGE_PAIR ?? "vi,zh").split(",").map((s) => s.trim()),
  // Tài khoản + đăng nhập (GĐ gọi điện).
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-doi-trong-production",
};

export function assertConfig(): void {
  if (!config.geminiApiKey) {
    console.warn(
      "[config] GEMINI_API_KEY chưa được đặt. Copy .env.example -> .env và điền key.\n" +
        "         Mic vẫn thu được nhưng phần dịch sẽ không hoạt động cho tới khi có key.",
    );
  }
}
