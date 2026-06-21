import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

/** Tạo bảng nếu chưa có (chạy lúc khởi động). */
export async function initDb(): Promise<void> {
  if (!config.databaseUrl) {
    console.warn("[db] DATABASE_URL chưa đặt -> phần tài khoản/gọi điện sẽ không hoạt động.");
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      language      TEXT NOT NULL DEFAULT 'vi',
      role          TEXT NOT NULL DEFAULT 'user',     -- 'owner' | 'user'
      status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'disabled'
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS interactions (
      user_id  INTEGER NOT NULL,
      peer_id  INTEGER NOT NULL,
      cnt      INTEGER NOT NULL DEFAULT 0,
      last_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, peer_id)
    );
  `);
  console.log("[db] Sẵn sàng (bảng users, interactions).");
}

/** Ghi 1 lượt liên lạc giữa 2 người (cả 2 chiều) để xếp hạng "hay liên lạc". */
export async function recordInteraction(a: number, b: number): Promise<void> {
  const sql = `INSERT INTO interactions (user_id, peer_id, cnt, last_at)
               VALUES ($1, $2, 1, now())
               ON CONFLICT (user_id, peer_id)
               DO UPDATE SET cnt = interactions.cnt + 1, last_at = now()`;
  await pool.query(sql, [a, b]);
  await pool.query(sql, [b, a]);
}

export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  language: string;
  role: "owner" | "user";
  status: "pending" | "approved" | "disabled";
  created_at: string;
};
