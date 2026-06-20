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
  console.log("[db] Sẵn sàng (bảng users).");
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
