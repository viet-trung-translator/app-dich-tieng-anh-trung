import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { pool, type UserRow } from "./db.js";
import { hashPassword, verifyPassword, signToken, verifyToken } from "./auth.js";

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const pub = (u: UserRow) => ({
  id: u.id,
  username: u.username,
  language: u.language,
  role: u.role,
  status: u.status,
});

function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const p = verifyToken(req.headers.authorization);
  if (!p) {
    reply.code(401).send({ error: "Chưa đăng nhập" });
    return null;
  }
  return p;
}

export function registerRoutes(app: FastifyInstance): void {
  // ----- Đăng ký -----
  app.post("/api/register", async (req, reply) => {
    const body = req.body as { username?: string; password?: string; language?: string };
    const username = norm(body.username);
    const password = String(body.password ?? "");
    const language = body.language === "zh" ? "zh" : "vi";

    if (username.length < 3) return reply.code(400).send({ error: "Tên phải từ 3 ký tự" });
    if (password.length < 4) return reply.code(400).send({ error: "Mật khẩu phải từ 4 ký tự" });

    const exists = await pool.query("SELECT 1 FROM users WHERE username=$1", [username]);
    if (exists.rowCount) return reply.code(409).send({ error: "Tên đã tồn tại" });

    // Tài khoản đầu tiên = chủ (owner) và được duyệt sẵn; còn lại chờ duyệt.
    const { rows: cnt } = await pool.query<{ n: string }>("SELECT count(*)::int AS n FROM users");
    const first = Number(cnt[0].n) === 0;
    const role = first ? "owner" : "user";
    const status = first ? "approved" : "pending";

    const hash = await hashPassword(password);
    await pool.query(
      "INSERT INTO users (username,password_hash,language,role,status) VALUES ($1,$2,$3,$4,$5)",
      [username, hash, language, role, status],
    );
    return reply.send({
      ok: true,
      role,
      status,
      message: first
        ? "Đã tạo tài khoản CHỦ. Bạn có thể đăng nhập."
        : "Đăng ký thành công. Chờ chủ duyệt rồi mới đăng nhập được.",
    });
  });

  // ----- Đăng nhập -----
  app.post("/api/login", async (req, reply) => {
    const body = req.body as { username?: string; password?: string };
    const username = norm(body.username);
    const { rows } = await pool.query<UserRow>("SELECT * FROM users WHERE username=$1", [username]);
    const user = rows[0];
    if (!user || !(await verifyPassword(String(body.password ?? ""), user.password_hash))) {
      return reply.code(401).send({ error: "Sai tên hoặc mật khẩu" });
    }
    if (user.status === "pending") return reply.code(403).send({ error: "Tài khoản đang chờ chủ duyệt" });
    if (user.status === "disabled") return reply.code(403).send({ error: "Tài khoản đã bị khóa" });

    const token = signToken({ sub: user.id, username: user.username, role: user.role, language: user.language });
    return reply.send({ ok: true, token, user: pub(user) });
  });

  // ----- Thông tin mình (lấy mới từ DB) -----
  app.get("/api/me", async (req, reply) => {
    const p = requireAuth(req, reply);
    if (!p) return;
    const { rows } = await pool.query<UserRow>("SELECT * FROM users WHERE id=$1", [p.sub]);
    if (!rows[0]) return reply.code(404).send({ error: "Không tìm thấy" });
    return reply.send({ user: pub(rows[0]) });
  });

  // ----- Tìm người để gọi (chỉ approved, trừ chính mình) -----
  app.get("/api/users/search", async (req, reply) => {
    const p = requireAuth(req, reply);
    if (!p) return;
    const q = norm((req.query as { q?: string }).q);
    const { rows } = await pool.query<UserRow>(
      "SELECT * FROM users WHERE status='approved' AND id<>$1 AND username LIKE $2 ORDER BY username LIMIT 20",
      [p.sub, `%${q}%`],
    );
    return reply.send({ users: rows.map(pub) });
  });

  // ----- Hay liên lạc (xếp theo số lần gọi + gần đây), gồm cả người offline -----
  app.get("/api/contacts", async (req, reply) => {
    const p = requireAuth(req, reply);
    if (!p) return;
    const { rows } = await pool.query<UserRow>(
      `SELECT u.* FROM interactions i
       JOIN users u ON u.id = i.peer_id
       WHERE i.user_id = $1 AND u.status = 'approved'
       ORDER BY i.cnt DESC, i.last_at DESC
       LIMIT 30`,
      [p.sub],
    );
    return reply.send({ users: rows.map(pub) });
  });

  // ===== Quản trị (chỉ chủ) =====
  const requireOwner = (req: FastifyRequest, reply: FastifyReply) => {
    const p = requireAuth(req, reply);
    if (!p) return null;
    if (p.role !== "owner") {
      reply.code(403).send({ error: "Chỉ chủ tài khoản mới được dùng" });
      return null;
    }
    return p;
  };

  app.get("/api/admin/users", async (req, reply) => {
    if (!requireOwner(req, reply)) return;
    const { rows } = await pool.query<UserRow>("SELECT * FROM users ORDER BY created_at DESC");
    return reply.send({ users: rows.map(pub) });
  });

  app.post("/api/admin/users/:id/:action", async (req, reply) => {
    const owner = requireOwner(req, reply);
    if (!owner) return;
    const { id, action } = req.params as { id: string; action: string };
    const targetId = Number(id);
    if (targetId === owner.sub) return reply.code(400).send({ error: "Không thao tác trên chính mình" });

    const status =
      action === "approve" ? "approved" : action === "disable" ? "disabled" : null;
    if (!status) return reply.code(400).send({ error: "Hành động không hợp lệ" });

    const { rowCount } = await pool.query(
      "UPDATE users SET status=$1 WHERE id=$2 AND role<>'owner'",
      [status, targetId],
    );
    if (!rowCount) return reply.code(404).send({ error: "Không tìm thấy hoặc là chủ" });
    return reply.send({ ok: true });
  });

  app.delete("/api/admin/users/:id", async (req, reply) => {
    const owner = requireOwner(req, reply);
    if (!owner) return;
    const targetId = Number((req.params as { id: string }).id);
    if (targetId === owner.sub) return reply.code(400).send({ error: "Không xóa chính mình" });
    const { rowCount } = await pool.query("DELETE FROM users WHERE id=$1 AND role<>'owner'", [targetId]);
    if (!rowCount) return reply.code(404).send({ error: "Không tìm thấy hoặc là chủ" });
    return reply.send({ ok: true });
  });
}
