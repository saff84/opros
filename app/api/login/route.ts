import { changePassword } from "../../credentials";
import {
  json,
  isAdmin,
  originOK,
  passwordOK,
  createAdminSession,
  revokeAdmin,
  secureCookie,
  rateLimit,
  readBody,
  adminIdentity,
} from "../../security";
import { loginTeam, passwordRecord, checkTeamPassword } from "../../team";
import { getDatabase } from "../../runtime";
export async function GET(req: Request) {
  const user = await adminIdentity(req);
  return user ? json({ user }) : json({ error: "Требуется вход" }, 401);
}
export async function POST(req: Request) {
  if (!originOK(req)) return json({ error: "Запрос отклонён" }, 403);
  if (!rateLimit("admin-login", 30, 15 * 60_000))
    return json(
      { error: "Слишком много попыток. Повторите через 15 минут." },
      429,
      { "Retry-After": "900" },
    );
  let body;
  try {
    body = await readBody(req);
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }
  let teamToken: string | null = null;
  const username =
    typeof body?.username === "string"
      ? body.username.trim().toLowerCase()
      : "";
  if (username && username !== "admin")
    teamToken = loginTeam(username, body?.password);
  if (
    !teamToken &&
    ((username && username !== "admin") || !passwordOK(body?.password))
  )
    return json({ error: "Неверный пароль" }, 401);
  revokeAdmin(req);
  const token = teamToken || createAdminSession();
  return json({ ok: true }, 200, {
    "Set-Cookie": `survey_admin=${token}; Path=/; HttpOnly${secureCookie()}; SameSite=Strict; Max-Age=28800`,
  });
}
export async function DELETE(req: Request) {
  if (!originOK(req)) return json({ error: "Запрос отклонён" }, 403);
  revokeAdmin(req);
  return json({ ok: true }, 200, {
    "Set-Cookie": `survey_admin=; Path=/; HttpOnly${secureCookie()}; SameSite=Strict; Max-Age=0`,
  });
}

export async function PATCH(req: Request) {
  if (!originOK(req)) return json({ error: "Запрос отклонён" }, 403);
  if (!(await isAdmin(req))) return json({ error: "Требуется вход" }, 401);
  if (!rateLimit("password-change", 10, 15 * 60_000))
    return json({ error: "Слишком много попыток. Подождите 15 минут." }, 429);
  let body;
  try {
    body = await readBody(req);
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }
  if (
    typeof body?.newPassword !== "string" ||
    body.newPassword.length < 16 ||
    body.newPassword.length > 256
  )
    return json(
      { error: "Новый пароль должен содержать от 16 до 256 символов" },
      400,
    );
  if (body.newPassword === body.currentPassword)
    return json({ error: "Новый пароль должен отличаться от текущего" }, 400);
  const identity = await adminIdentity(req);
  if (identity && identity.id !== "owner") {
    const user = getDatabase()
      .prepare("SELECT * FROM team_users WHERE id=?")
      .get(identity.id) as any;
    if (!user || !checkTeamPassword(user, body.currentPassword))
      return json({ error: "Текущий пароль неверен" }, 400);
    const record = passwordRecord(body.newPassword);
    getDatabase()
      .prepare("UPDATE team_users SET salt=?,password_hash=? WHERE id=?")
      .run(record.salt, record.hash, identity.id);
    getDatabase()
      .prepare("DELETE FROM team_sessions WHERE user_id=?")
      .run(identity.id);
    const token = loginTeam(identity.username, body.newPassword)!;
    return json({ ok: true }, 200, {
      "Set-Cookie": `survey_admin=${token}; Path=/; HttpOnly${secureCookie()}; SameSite=Strict; Max-Age=28800`,
    });
  }
  if (!changePassword(body.currentPassword, body.newPassword))
    return json({ error: "Текущий пароль неверен" }, 400);
  const token = createAdminSession();
  return json({ ok: true }, 200, {
    "Set-Cookie": `survey_admin=${token}; Path=/; HttpOnly${secureCookie()}; SameSite=Strict; Max-Age=28800`,
  });
}
