# Kế hoạch: App Phiên Dịch Real-time Trung ↔ Anh

> Web app có 1 nút mic. Bấm vào: thu âm liên tục, dịch real-time (nghe Trung → ra Anh,
> nghe Anh → ra Trung), chữ chạy liên tục + loa phát giọng dịch liên tục, cho tới khi bấm tắt.
> "Bộ não": Google Gemini Live API (model-agnostic, đổi model dễ dàng).

---

## 0. Model: Gemini 3.5 Live Translate (đã xác minh)

- **Model ID:** `gemini-3.5-live-translate-preview`
- **Ra mắt:** 09/06/2026. Streaming **speech-to-speech**, low-latency, audio-to-audio.
- **Input:** Audio (giọng nói) streaming → **Output:** Audio (giọng dịch) + Text (transcript).
- **70+ ngôn ngữ, tự nhận diện**, dịch **2 chiều** (bidirectional) tự động → Trung↔Anh không cần cấu hình tay.
- **Kết nối:** Gemini **Live API** qua WebSocket (hoặc GenAI SDK), public preview qua Google AI Studio.
- **Lưu ý:** caching KHÔNG hỗ trợ với model này.
- Model ID để trong biến môi trường `GEMINI_MODEL=gemini-3.5-live-translate-preview` → đổi model dễ.
- Lớp "brain" vẫn là interface `TranslatorBrain` để linh hoạt về sau.

> Nguồn: ai.google.dev/gemini-api/docs/models/gemini-3.5-live-translate-preview ;
> blog.google (Gemini 3.5 Live Translate, 09/06/2026).

---

## 1. Hướng dẫn lấy Gemini API Key (làm trước tiên)

1. Vào **Google AI Studio**: https://aistudio.google.com
2. Đăng nhập bằng tài khoản Google.
3. Bấm **"Get API key"** → **"Create API key"**.
4. Copy key (dạng `AIza...`).
5. Lưu key vào file `.env` ở backend (KHÔNG commit lên git, KHÔNG để lộ ra frontend):
   ```
   GEMINI_API_KEY=AIza...
   GEMINI_MODEL=gemini-2.5-flash-live   # đổi tên theo model live hiện có
   ```
6. Kiểm tra hạn mức (quota) miễn phí; nếu chạy nhiều có thể cần bật billing.

> ⚠️ API key = tiền. Không bao giờ nhúng key vào code chạy ở trình duyệt. Luôn đi qua backend.

---

## 1b. Thông số kỹ thuật Live API (đã xác minh)

**Audio vào (mic → Gemini):**
- PCM thô, **16kHz**, **16-bit little-endian**, **mono**
- MIME: `audio/pcm;rate=16000`
- Gửi: `session.sendRealtimeInput({ audio: { data: base64Chunk, mimeType: "audio/pcm;rate=16000" } })`

**Audio ra (Gemini → loa):**
- PCM thô **24kHz**, trả theo từng chunk qua server events
- Lấy ở: `response.serverContent.modelTurn.parts[].inlineData.data`

**Text (chữ chạy):**
- Bật `outputTranscription` (và `inputTranscription` nếu muốn hiện cả câu gốc) trong config

**Kết nối (JS SDK `@google/genai`):**
```js
const session = await ai.live.connect({
  model: "gemini-3.5-live-translate-preview",
  config: { responseModalities: [...], outputTranscription: {}, realtimeInputConfig: {...} },
  callbacks: { onopen, onmessage, onerror, onclose },
});
```

**VAD (phát hiện giọng nói):** tự động mặc định; chỉnh `silence_duration_ms` ~500–800ms.
Có cờ `interrupted` khi người dùng nói chen ngang.

**⚠️ GIỚI HẠN PHIÊN: audio-only tối đa 15 phút/phiên.**
→ Để "chạy liên tục cho tới khi tắt", BẮT BUỘC làm **auto-reconnect**: gần hết 15 phút
   thì mở phiên mới và nối tiếp liền mạch (seamless session rollover), không để đứt tiếng/chữ.

---

## 2. Kiến trúc

```
┌─────────── Trình duyệt (React) ─────────────┐
│  [Nút Mic]   [Khung chữ chạy]   [Loa phát]   │
│     │              ▲                ▲         │
│  getUserMedia      │ text          │ audio    │
│  AudioWorklet      │               │          │
│     └──── WebSocket tới Backend ───┘          │
└───────────────────────┬──────────────────────┘
                        │ (giữ key bí mật)
┌───────────────── Backend (Node) ─────────────┐
│  Proxy WebSocket · giữ GEMINI_API_KEY         │
│  TranslatorBrain interface                    │
│   └─ GeminiLiveBrain ⇄ Gemini Live API        │
└──────────────────────────────────────────────┘
```

**Vì sao có backend:** giấu API key + proxy WebSocket giữa trình duyệt và Gemini.

---

## 3. Tech stack

| Phần | Công nghệ |
|---|---|
| Frontend | React + Vite + TypeScript |
| Thu âm | Web Audio API + AudioWorklet (PCM 16kHz) |
| Phát âm | Web Audio API (phát PCM streaming) |
| Giao tiếp | WebSocket (browser ⇄ backend ⇄ Gemini) |
| Backend | Node.js + Fastify + `ws` |
| Brain | Gemini Live API qua `@google/genai` SDK |
| Config | dotenv (`.env`) |

---

## 4. Cấu trúc thư mục (dự kiến)

```
app-dich-tieng-anh-trung/
├─ PLAN.md
├─ frontend/
│  ├─ index.html
│  ├─ src/
│  │  ├─ main.tsx
│  │  ├─ App.tsx              # UI: nút mic, chữ chạy, trạng thái
│  │  ├─ audio/
│  │  │  ├─ recorder.ts       # capture mic → PCM chunks
│  │  │  ├─ player.ts         # phát audio streaming ra loa
│  │  │  └─ worklet.js        # AudioWorklet xử lý PCM
│  │  └─ ws/client.ts         # WebSocket tới backend
│  └─ vite.config.ts
└─ backend/
   ├─ src/
   │  ├─ server.ts            # Fastify + WebSocket endpoint
   │  ├─ brain/
   │  │  ├─ TranslatorBrain.ts   # interface
   │  │  └─ GeminiLiveBrain.ts   # nối Gemini Live API
   │  └─ config.ts
   ├─ .env                    # KEY (gitignore)
   └─ package.json
```

---

## 5. Lộ trình theo giai đoạn (task cụ thể)

### GĐ 0 — Khung dự án
- [ ] `npm create vite@latest frontend` (React + TS)
- [ ] Khởi tạo `backend` (Fastify + ws + dotenv)
- [ ] Tạo `.gitignore` (node_modules, .env)
- [ ] Chạy thử FE và BE rỗng OK

### GĐ 1 — Mic + hiển thị trạng thái
- [ ] Nút Mic (toggle Bật/Tắt)
- [ ] `getUserMedia({ audio: { echoCancellation, noiseSuppression } })`
- [ ] AudioWorklet lấy PCM 16kHz mono, chia chunk nhỏ
- [ ] Hiển thị trạng thái "Đang nghe..." + mức âm lượng (visual)

### GĐ 2 — Nối Gemini Live (chữ chạy)
- [ ] Backend mở WebSocket endpoint `/translate`
- [ ] `GeminiLiveBrain` kết nối Gemini Live API, cấu hình:
      tự nhận ngôn ngữ, dịch chéo Trung↔Anh, output cả text + audio
- [ ] FE stream PCM lên BE → BE đẩy sang Gemini
- [ ] Nhận text dịch về → **chữ chạy liên tục** trên màn hình (partial + final)

### GĐ 3 — Phát giọng dịch ra loa
- [ ] Nhận audio chunks (PCM) từ Gemini qua BE
- [ ] `player.ts` xếp hàng và phát streaming ra loa, liên tục, không giật

### GĐ 4 — Dịch 2 chiều tự động
- [ ] Cấu hình system instruction: phát hiện ngôn ngữ nguồn,
      nếu Trung → dịch Anh, nếu Anh → dịch Trung
- [ ] Test cả 2 chiều

### GĐ 5 — Chống echo + ổn định
- [ ] Bật `echoCancellation`; cân nhắc tạm ngắt mic khi đang phát loa (chống dịch vòng)
- [ ] Nút **Stop** dứt khoát: đóng WebSocket, dừng mic, dừng loa, dọn tài nguyên
- [ ] Tự kết nối lại khi rớt mạng (reconnect)
- [ ] **Seamless session rollover**: trước mốc 15 phút, mở phiên mới nối tiếp để chạy "vô hạn"
- [ ] Xử lý lỗi quyền mic / mất kết nối / hết quota

### GĐ 6 — Hoàn thiện
- [ ] UI gọn đẹp, hiển thị song ngữ (gốc + bản dịch)
- [ ] (tuỳ chọn) lịch sử hội thoại cuộn
- [ ] Deploy: FE (Vercel) + BE (Render/Fly.io, hỗ trợ WebSocket), bắt buộc **HTTPS**
      (trình duyệt chỉ cho dùng mic trên HTTPS/localhost)

---

## 6. Các rủi ro & cách xử lý

| Rủi ro | Cách xử lý |
|---|---|
| Echo loop (loa → mic → dịch lại vô tận) | Echo cancellation + tạm ngắt thu khi phát |
| Độ trễ cao | Chunk audio nhỏ, dùng Live API streaming, BE proxy mỏng |
| Lộ API key | Key chỉ ở backend, không bao giờ ra frontend |
| Mic bị từ chối quyền | Thông báo rõ + hướng dẫn cấp quyền |
| Mất kết nối giữa chừng | Auto reconnect + báo trạng thái |
| Tên model live thay đổi | Để trong `GEMINI_MODEL`, đổi 1 dòng |
| Chi phí vượt quota | Theo dõi usage, đặt giới hạn |

---

## 7. Việc cần bạn chuẩn bị
1. Lấy **Gemini API key** theo mục 1.
2. Cài **Node.js** (LTS) trên máy: https://nodejs.org
3. Báo mình khi xong → bắt đầu GĐ 0.
