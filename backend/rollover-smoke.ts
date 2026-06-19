// Smoke test cơ chế seamless rollover (không cần mic).
// Hạ SESSION_ROLLOVER_MS xuống thấp rồi xem brain có mở phiên mới đều, không lỗi.
// Chạy:  SESSION_ROLLOVER_MS=4000 tsx rollover-smoke.ts
import { GeminiLiveBrain } from "./src/brain/GeminiLiveBrain.js";

const brain = new GeminiLiveBrain();
let rollovers = 0;
let errors = 0;

await brain.start((e) => {
  if (e.type === "status") {
    console.log("[status]", e.message);
    if (e.message.includes("làm mới")) rollovers++;
  } else if (e.type === "error") {
    errors++;
    console.log("[ERROR]", e.message);
  }
});

// Chạy ~10s để rollover kích hoạt 2 lần (ở 4s và 8s).
await new Promise((r) => setTimeout(r, 10000));
await brain.stop();

console.log(`\nKẾT QUẢ: rollover=${rollovers}, errors=${errors}`);
console.log(rollovers >= 1 && errors === 0 ? "✅ PASS" : "❌ FAIL");
process.exit(rollovers >= 1 && errors === 0 ? 0 : 1);
