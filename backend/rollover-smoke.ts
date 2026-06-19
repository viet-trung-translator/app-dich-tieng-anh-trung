// Smoke test: xác minh 2 luồng dịch (vi & zh) connect được và translationConfig
// được Gemini chấp nhận (không lỗi). Không cần mic.
// Chạy:  npx tsx rollover-smoke.ts
import { GeminiLiveBrain } from "./src/brain/GeminiLiveBrain.js";

const brain = new GeminiLiveBrain();
let connected = false;
let errors = 0;

await brain.start((e) => {
  if (e.type === "status") {
    console.log("[status]", e.message);
    if (e.message.includes("kết nối")) connected = true;
  } else if (e.type === "error") {
    errors++;
    console.log("[ERROR]", e.message);
  }
});

// Chờ vài giây xem có lỗi config/connect không.
await new Promise((r) => setTimeout(r, 6000));
await brain.stop();

console.log(`\nKẾT QUẢ: connected=${connected}, errors=${errors}`);
console.log(connected && errors === 0 ? "✅ PASS" : "❌ FAIL");
process.exit(connected && errors === 0 ? 0 : 1);
