import { getDatabase } from "../../runtime";
import { json, isAdmin, adminIdentity, canManage, canEdit, canAccessSurvey, originOK, readBody } from "../../security";
import { validateSurvey } from "../../survey-model";
export async function GET(req: Request) {
  if (!(await isAdmin(req))) return json({ error: "Требуется вход" }, 401);
  const user = await adminIdentity(req);
  const all = await canManage(req);
  return json({
    templates: getDatabase()
      .prepare(all ? "SELECT * FROM survey_templates ORDER BY title" : "SELECT t.* FROM survey_templates t JOIN template_owners o ON o.template_id=t.id WHERE o.user_id=? ORDER BY t.title")
      .all(...(all ? [] : [user!.id]))
      .map((row: any) => ({ ...row, definition: JSON.parse(row.definition) })),
  });
}
export async function POST(req: Request) {
  if (!originOK(req) || !(await canEdit(req)))
    return json({ error: "Недостаточно прав" }, 403);
  let b;
  try {
    b = await readBody(req);
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }
  if (!validateSurvey(b?.survey))
    return json({ error: "Сначала исправьте ошибки в опросе" }, 400);
  if (!(await canManage(req)) && !(await canAccessSurvey(req, b.survey.id)))
    return json({ error: "Нет доступа к опросу" }, 403);
  const id = crypto.randomUUID();
  getDatabase()
    .prepare("INSERT INTO survey_templates VALUES (?,?,?)")
    .run(id, b.survey.title, JSON.stringify(b.survey));
  const user = await adminIdentity(req);
  if (user && !["owner", "admin"].includes(user.role))
    getDatabase().prepare("INSERT INTO template_owners VALUES (?,?)").run(id, user.id);
  return json({ id });
}
