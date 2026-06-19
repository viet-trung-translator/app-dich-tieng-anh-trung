# App Phiên Dịch Real-time Trung ↔ Việt

Web app dịch giọng nói thời gian thực 2 chiều (Trung ↔ Việt) bằng
**Gemini 3.5 Live Translate** (`gemini-3.5-live-translate-preview`).

- Bấm 1 nút mic → thu âm liên tục
- Nghe tiếng Trung → dịch tiếng Việt, nghe tiếng Việt → dịch tiếng Trung (tự nhận diện)
- Chữ chạy liên tục + loa phát giọng dịch liên tục, cho tới khi bấm tắt

> Đổi cặp ngôn ngữ: đặt biến môi trường `LANGUAGE_PAIR` (mặc định `vi,zh`).
> Cơ chế: chạy 2 luồng Gemini song song (mỗi tiếng 1 ngôn ngữ đích) vì model chỉ
> nhận 1 ngôn ngữ đích/phiên. **Lưu ý: dùng ~2x lượng API so với 1 chiều.**

Xem [PLAN.md](PLAN.md) để biết kiến trúc & lộ trình.

## Cấu trúc

```
backend/    Node + Fastify + WebSocket, proxy tới Gemini Live API (giữ API key)
frontend/   React + Vite + TS, nút mic, thu PCM 16kHz, chữ chạy, phát loa
```

## Chạy dev

1. **Lấy Gemini API key** tại https://aistudio.google.com → Get API key.
2. Backend:
   ```bash
   cd backend
   cp .env.example .env          # rồi điền GEMINI_API_KEY
   npm install
   npm run dev                   # chạy ở http://localhost:8787
   ```
3. Frontend (terminal khác):
   ```bash
   cd frontend
   npm install
   npm run dev                   # mở http://localhost:5173
   ```
4. Mở trình duyệt, cho phép quyền micro, bấm nút mic.

> Mic chỉ chạy trên `localhost` hoặc HTTPS.

## Deploy HTTPS cố định (link vĩnh viễn)

App đóng gói thành **1 service Docker**: backend Fastify phục vụ luôn frontend đã build,
WebSocket `/translate` cùng origin. Đã có sẵn [Dockerfile](Dockerfile) và [render.yaml](render.yaml).

### Cách 1 — Render.com (khuyến nghị, free, hỗ trợ WebSocket)

1. Đẩy thư mục này lên một repo GitHub:
   ```bash
   git remote add origin https://github.com/<bạn>/<repo>.git
   git push -u origin main
   ```
2. Vào https://render.com → **New → Blueprint** → chọn repo → Render tự đọc `render.yaml`.
3. Khi hỏi, dán **GEMINI_API_KEY** (giữ bí mật, không nằm trong repo).
4. Deploy → nhận link HTTPS cố định dạng `https://<tên>.onrender.com`.
   Mở trên iPhone là dùng được mic + dịch, không cần bật máy bạn nữa.

> Lưu ý gói free của Render "ngủ" sau ~15 phút không dùng → lần mở đầu chờ ~30s khởi động lại.
> Muốn luôn sẵn sàng thì nâng lên gói trả phí.

### Cách 2 — Nền tảng Docker khác (Fly.io, Railway...)

Dùng chung [Dockerfile](Dockerfile). Chỉ cần đặt biến môi trường `GEMINI_API_KEY`
(và `GEMINI_MODEL` nếu muốn đổi model). Host tự cấp `PORT`.
