export type User = {
  id: number;
  username: string;
  language: "vi" | "zh";
  role: "owner" | "user";
  status: "pending" | "approved" | "disabled";
};

const TOKEN_KEY = "token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function req<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) ?? {}),
  };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Lỗi ${res.status}`);
  return data as T;
}

export const api = {
  register: (b: { username: string; password: string; language: string }) =>
    req("/api/register", { method: "POST", body: JSON.stringify(b) }),
  login: (b: { username: string; password: string }) =>
    req<{ token: string; user: User }>("/api/login", { method: "POST", body: JSON.stringify(b) }),
  me: () => req<{ user: User }>("/api/me"),
  search: (q: string) =>
    req<{ users: User[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
  adminList: () => req<{ users: User[] }>("/api/admin/users"),
  adminAction: (id: number, action: "approve" | "disable") =>
    req(`/api/admin/users/${id}/${action}`, { method: "POST", body: "{}" }),
  adminDelete: (id: number) => req(`/api/admin/users/${id}`, { method: "DELETE" }),
};
