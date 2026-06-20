# Kế hoạch: Nâng app thành "Gọi điện có phiên dịch real-time"

> Mỗi người có tài khoản riêng (tên + mật khẩu) và chọn sẵn ngôn ngữ của mình.
> A gọi B → B đổ chuông → nghe máy → A nói tiếng Việt, B nghe bản dịch tiếng Trung
> theo thời gian thực (giữ ngữ điệu/cảm xúc); B nói tiếng Trung, A nghe tiếng Việt.
> Kèm chữ bản dịch chạy to trên màn hình. Bộ não: Gemini 3.5 Live Translate.

## Quyết định đã chốt
- Đăng nhập: **tên + mật khẩu** (mật khẩu băm an toàn).
- Ngôn ngữ: **cố định theo tài khoản** (lúc đăng ký chọn Việt hoặc Trung). Trong cuộc gọi,
  dịch lời người kia sang ĐÚNG tiếng của mình → chắc chắn, không nhầm.
- Triển khai: **từng giai đoạn**, test được sau mỗi giai đoạn.
- Hạ tầng: **có cơ sở dữ liệu + máy chủ ổn định** (chấp nhận nâng cấp).
- **Tài khoản CHỦ (admin):** đây là app để bán. Chủ duyệt/cho phép hoặc xóa tài khoản con.
  Tài khoản đầu tiên = chủ (tự duyệt). Người đăng ký sau ở trạng thái **chờ duyệt**, phải
  được chủ đồng ý mới dùng được. Chủ có thể xóa/khóa bất kỳ tài khoản con nào.
- **Chất lượng dịch:** phải chuẩn, hiểu **chuyên ngành** và **bối cảnh**. Thêm tùy chọn
  "lĩnh vực" (vd y tế, kỹ thuật, thương mại) để mớm ngữ cảnh cho Gemini — sẽ kiểm tra mức
  hỗ trợ của model ở GĐ 3 và tận dụng tối đa.

## Vì sao bản gọi điện DỄ dịch đúng hơn app 1 máy
Trong cuộc gọi, ngôn ngữ mỗi đầu đã biết trước (theo tài khoản), nên mỗi chiều dịch là
**1 phiên Gemini đích cố định** (A→B luôn ra tiếng B). Không cần đoán ngôn ngữ → hết nhầm.

## Kiến trúc

```
   Bên A                              SERVER (Node/Fastify)                 Bên B
 mic A ─PCM16k─▶ media WS ─▶  Gemini A→B (đích = tiếng B) ─dịch+chữ─▶ WS ─▶ loa B + chữ to
 loa A + chữ ◀─ WS ◀─dịch+chữ─ Gemini B→A (đích = tiếng A)  ◀─ media WS ◀─PCM16k─ mic B
                              + DB (tài khoản) + presence/signaling
```

- **media WS:** mỗi client gửi audio mic lên; server đẩy vào phiên Gemini tương ứng;
  audio dịch (24kHz) + transcript được chuyển sang client bên kia.
- **2 phiên Gemini / cuộc gọi** (mỗi chiều 1 phiên, tự rollover 14 phút như hiện tại).

## Hạ tầng & công nghệ
| Phần | Chọn |
|---|---|
| DB | **Postgres (Neon free)** — lưu tài khoản |
| Mật khẩu | băm bằng **argon2/bcrypt** |
| Phiên đăng nhập | **JWT** (token) |
| Realtime/presence/tín hiệu gọi | **WebSocket** (Fastify) |
| Audio | tái dùng worklet PCM 16kHz + player 24kHz hiện có |
| Brain | Gemini 3.5 Live Translate (`gemini-3.5-live-translate-preview`) |
| Hosting | Render Web Service (**nên nâng Starter ~$7** cho ổn định) |

Biến môi trường mới: `DATABASE_URL`, `JWT_SECRET` (thêm vào cạnh `GEMINI_API_KEY`).

## Lộ trình theo giai đoạn

### GĐ 1 — Tài khoản + đăng nhập + quản trị + danh bạ
- DB bảng `users` (id, username duy nhất, password_hash, language, **role** [owner/user],
  **status** [pending/approved/disabled], created_at).
- API: đăng ký (tạo trạng thái pending; tài khoản đầu tiên = owner+approved), đăng nhập
  (chỉ approved mới vào được; trả JWT), lấy thông tin mình, tìm người theo tên.
- API quản trị (chỉ owner): liệt kê tài khoản, **duyệt**, **khóa**, **xóa**.
- Presence WS: sau đăng nhập giữ 1 kết nối → biết ai đang online.
- Giao diện: Đăng ký (tên, mật khẩu, chọn ngôn ngữ) · Đăng nhập · Trang chính (tên mình +
  ô tìm người + danh sách online) · **Trang quản trị cho chủ** (duyệt/khóa/xóa tài khoản con).
- ✅ Xong GĐ1: tạo tài khoản, chủ duyệt, đăng nhập, tìm người online.

### GĐ 2 — Gọi + đổ chuông (chưa dịch)
- Tín hiệu qua presence WS: A gọi B → B đổ chuông → B bấm Nghe/Từ chối → vào màn hình
  "đang gọi" → cúp máy. Xử lý bận, offline, hủy.
- ✅ Xong GĐ2: A gọi B, B nghe máy, hai bên thấy "đang trong cuộc gọi", cúp được.

### GĐ 3 — Dịch real-time trong cuộc gọi
- Khi nghe máy: server mở 2 phiên Gemini (A→B, B→A).
- Mỗi client stream mic PCM lên; server định tuyến audio dịch + chữ sang người kia.
- Màn hình cuộc gọi: **chữ bản dịch TO**, phát giọng dịch, mức mic, nút cúp.
- Tái dùng MicRecorder/StreamPlayer/worklet đã có; TranslationStream giờ 1 chiều đích cố định.
- ✅ Xong GĐ3: cuộc gọi dịch hoàn chỉnh 2 chiều, có chữ to.

### GĐ 4 (tùy chọn) — hoàn thiện
- Lịch sử cuộc gọi, danh bạ bạn bè, thông báo khi có cuộc gọi đến, UI đẹp.

## Lưu ý quan trọng
- 💰 **Chi phí:** mỗi cuộc gọi chạy 2 phiên Gemini liên tục → tốn API ~2x thời lượng gọi.
- 🔒 **Bảo mật:** mật khẩu băm (không lưu thô), JWT bí mật, chạy HTTPS.
- 🧩 App dịch 1 máy hiện tại **giữ nguyên**; tính năng gọi là phần thêm (màn hình mới).
- ⚠️ Quy ước viết code: KHÔNG nhúng ký tự Hán literal vào source (bị lỗi mã hóa trên máy này);
  nhận diện/so khớp tiếng Hán bằng mã codepoint.
