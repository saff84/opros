import { checkPassword, credentials, visitorSecret } from "./credentials";
import { createHash, randomBytes } from "node:crypto";
import { getDatabase } from "./runtime";
export function cookie(req: Request, key: string) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(key + "="))
    ?.slice(key.length + 1);
}
export function originOK(req: Request) {
  return (
    req.headers.get("origin") ===
    (process.env.PUBLIC_ORIGIN || new URL(req.url).origin)
  );
}
export function secureCookie() {
  return (process.env.PUBLIC_ORIGIN || "").startsWith("https:")
    ? "; Secure"
    : "";
}
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
export const passwordOK = checkPassword;
export function tokenHash(token: string) {
  return createHash("sha256")
    .update(token + ":" + credentials().generation)
    .digest("hex");
}
export function createAdminSession() {
  const db = getDatabase(),
    token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM admin_sessions WHERE expires<?").run(Date.now());
  db.prepare("INSERT INTO admin_sessions VALUES (?,?)").run(
    tokenHash(token),
    Date.now() + 8 * 3600_000,
  );
  return token;
}
export async function isAdmin(req: Request) {
  return !!(await adminIdentity(req));
}
export type AdminIdentity = {
  id: string;
  username: string;
  role: "owner" | "admin" | "editor" | "viewer";
};
export async function adminIdentity(
  req: Request,
): Promise<AdminIdentity | null> {
  const token =
    cookie(req, "survey_admin") ||
    req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  if (
    getDatabase()
      .prepare("SELECT 1 FROM admin_sessions WHERE token_hash=? AND expires>?")
      .get(tokenHash(token), Date.now())
  )
    return { id: "owner", username: "admin", role: "owner" };
  const user = getDatabase()
    .prepare(
      "SELECT u.id,u.username,u.role FROM team_sessions s JOIN team_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1",
    )
    .get(tokenHash(token), Date.now());
  return user ? (user as AdminIdentity) : null;
}
export async function canEdit(req: Request) {
  const u = await adminIdentity(req);
  return !!u && u.role !== "viewer";
}
export async function canManage(req: Request) {
  const u = await adminIdentity(req);
  return !!u && ["owner", "admin"].includes(u.role);
}
export function revokeAdmin(req: Request) {
  for (const token of [
    cookie(req, "survey_admin"),
    req.headers.get("authorization")?.replace(/^Bearer /, ""),
  ])
    if (token) {
      getDatabase()
        .prepare("DELETE FROM admin_sessions WHERE token_hash=?")
        .run(tokenHash(token));
      getDatabase()
        .prepare("DELETE FROM team_sessions WHERE token_hash=?")
        .run(tokenHash(token));
    }
}
export function rateLimit(key: string, max: number, windowMs: number) {
  const db = getDatabase(),
    now = Date.now();
  db.prepare("DELETE FROM rate_limits WHERE reset<?").run(now);
  const row = db
    .prepare(
      "INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
    .get(key, now + windowMs) as { count: number };
  return row.count <= max;
}
export async function readBody(req: Request) {
  if (Number(req.headers.get("content-length")) > 100_000)
    throw Error("Слишком большой запрос");
  const reader = req.body?.getReader();
  if (!reader) throw Error("Пустой запрос");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 100_000) {
      await reader.cancel();
      throw Error("Слишком большой запрос");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function sessionKey() {
  const secret = visitorSecret();
  if (!secret || secret.length < 16) throw Error("Session secret unavailable");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("survey-session-v2:" + secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function signSession(id: string, surveyId: string) {
  const sig = await crypto.subtle.sign(
    "HMAC",
    await sessionKey(),
    new TextEncoder().encode(id + ":" + surveyId),
  );
  return id + "." + Buffer.from(sig).toString("hex");
}
export async function verifySession(token: unknown, surveyId: string) {
  if (typeof token !== "string" || !/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(token))
    return null;
  const [id, hex] = token.split(".");
  return (await crypto.subtle.verify(
    "HMAC",
    await sessionKey(),
    Buffer.from(hex, "hex"),
    new TextEncoder().encode(id + ":" + surveyId),
  ))
    ? id
    : null;
}
// Legacy tokens are accepted only for their original survey, never as a plain visitor ID.
export async function verifyLegacySession(token: unknown) {
  if (typeof token !== "string" || !/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(token))
    return null;
  const [id, hex] = token.split(".");
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || secret.length < 16) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("survey-session:" + secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return (await crypto.subtle.verify(
    "HMAC",
    key,
    Buffer.from(hex, "hex"),
    new TextEncoder().encode(id),
  ))
    ? id
    : null;
}

// Upgrade signatures issued before the independent visitor secret was introduced.
export async function verifyPreviousSession(token: unknown, surveyId: string) {
  if (typeof token !== "string" || !/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(token))
    return null;
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || secret.length < 16) return null;
  const [id, hex] = token.split(".");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("survey-session-v2:" + secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return (await crypto.subtle.verify(
    "HMAC",
    key,
    Buffer.from(hex, "hex"),
    new TextEncoder().encode(id + ":" + surveyId),
  ))
    ? id
    : null;
}
