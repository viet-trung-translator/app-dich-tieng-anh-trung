// Verify model chuyên ngành (đa năng + systemInstruction) connect được.
import { GoogleGenAI } from "@google/genai";
import { TranslationStream } from "./src/brain/GeminiLiveBrain.js";
import { config } from "./src/config.js";
import type { BrainEvent } from "./src/brain/TranslatorBrain.js";

console.log("Domain model:", config.domainModel);
const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
let connected = false;
let errors = 0;
const emit = (e: BrainEvent) => {
  if (e.type === "error") {
    errors++;
    console.log("[ERR]", e.message);
  }
};
const ts = new TranslationStream(
  ai,
  "vi",
  emit,
  false,
  () => {},
  () => {
    connected = true;
    console.log("connected (domain model OK)");
  },
  "You are a professional interpreter. Translate everything into Vietnamese. Medical domain.",
);
await ts.start();
await new Promise((r) => setTimeout(r, 6000));
await ts.stop();
console.log(connected && errors === 0 ? "\n✅ PASS" : "\n❌ FAIL");
process.exit(connected && errors === 0 ? 0 : 1);
