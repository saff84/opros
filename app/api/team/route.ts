import { getDatabase } from "../../runtime";
import {
  canManage,
  originOK,
  json,
  readBody,
  adminIdentity,
} from "../../security";
import { passwordRecord } from "../../team";
export async function GET(req: Request) {
  if (!(await canManage(req)))
    return json({ error: "Нужны права администратора" }, 403);
  return json({
    users: getDatabase()
      .prepare(
        "SELECT id,username,role,active FROM team_users ORDER BY username",
      )
      .all(),
  });
}
export async function POST(req: Request) {
  if (!originOK(req)) return json({ error: "Запрос отклонён" }, 403);
  if (!(await canManage(req)))
    return json({ error: "Нужны права администратора" }, 403);
  let b;
  try {
    b = await readBody(req);
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }
  const db = getDatabase(),
    self = await adminIdentity(req);
  if (b?.id) {
    if (typeof b.id !== "string" || b.id === self?.id)
      return json(
        { error: "Нельзя менять собственные права в этом разделе" },
        400,
      );
    const user = db.prepare("SELECT id FROM team_users WHERE id=?").get(b.id);
    if (!user) return json({ error: "Пользователь не найден" }, 404);
    if (
      !["admin", "editor", "viewer"].includes(b.role) ||
      typeof b.active !== "boolean"
    )
      return json({ error: "Проверьте роль и статус" }, 400);
    if (
      b.password &&
      (typeof b.password !== "string" ||
        b.password.length < 16 ||
        b.password.length > 256)
    )
      return json({ error: "Пароль: 16–256 символов" }, 400);
    db.prepare("UPDATE team_users SET role=?,active=? WHERE id=?").run(
      b.role,
      b.active ? 1 : 0,
      b.id,
    );
    if (b.password) {
      const record = passwordRecord(b.password);
      db.prepare("UPDATE team_users SET salt=?,password_hash=? WHERE id=?").run(
        record.salt,
        record.hash,
        b.id,
      );
    }
    db.prepare("DELETE FROM team_sessions WHERE user_id=?").run(b.id);
  } else {
    if (
      typeof b?.username !== "string" ||
      !/^[a-zA-Z0-9._-]{3,40}$/.test(b.username) ||
      b.username.toLowerCase() === "admin" ||
      !["admin", "editor", "viewer"].includes(b.role) ||
      typeof b.password !== "string" ||
      b.password.length < 16 ||
      b.password.length > 256
    )
      return json(
        {
          error:
            "Логин: 3–40 латинских символов, пароль: 16–256 символов. Выберите роль.",
        },
        400,
      );
    if (
      db
        .prepare("SELECT id FROM team_users WHERE username=?")
        .get(b.username.toLowerCase())
    )
      return json({ error: "Этот логин уже используется" }, 409);
    const record = passwordRecord(b.password);
    db.prepare("INSERT INTO team_users VALUES (?,?,?,?,?,1)").run(
      crypto.randomUUID(),
      b.username.toLowerCase(),
      record.salt,
      record.hash,
      b.role,
    );
  }
  return json({ ok: true });
}
