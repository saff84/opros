import { getDatabase } from "../../runtime";
import { json, isAdmin, canEdit, originOK, readBody } from "../../security";
import { validateSurvey } from "../../survey-model";
export async function GET(req: Request) {
  if (!(await isAdmin(req))) return json({ error: "Требуется вход" }, 401);
  return json({
    templates: getDatabase()
      .prepare("SELECT * FROM survey_templates ORDER BY title")
      .all()
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
  const id = crypto.randomUUID();
  getDatabase()
    .prepare("INSERT INTO survey_templates VALUES (?,?,?)")
    .run(id, b.survey.title, JSON.stringify(b.survey));
  return json({ id });
}
