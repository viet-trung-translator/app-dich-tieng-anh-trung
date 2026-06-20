import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export type TokenPayload = {
  sub: number; // user id
  username: string;
  role: "owner" | "user";
  language: string;
};

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(p: TokenPayload): string {
  return jwt.sign(p, config.jwtSecret, { expiresIn: "30d" });
}

/** Giải mã token từ header "Authorization: Bearer ..."; null nếu sai/thiếu. */
export function verifyToken(authHeader: string | undefined): TokenPayload | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(authHeader.slice(7), config.jwtSecret) as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/** Token dạng query (?token=) dùng cho WebSocket. */
export function verifyRawToken(token: string | undefined): TokenPayload | null {
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret) as unknown as TokenPayload;
  } catch {
    return null;
  }
}
