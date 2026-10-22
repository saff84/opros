import { getDatabase, getSurvey } from "../../runtime";
import { canEdit, originOK, readBody, json } from "../../security";
import { createPreviewLink } from "../../preview-access";

async function change(req: Request, revoke: boolean) {
  if (!originOK(req) || !(await canEdit(req))) return json({ error: "Недостаточно прав" }, 403);
  let body;
  try { body = await readBody(req); }
  catch { return json({ error: "Некорректный запрос" }, 400); }
  if (typeof body?.surveyId !== "string" || !getSurvey(body.surveyId))
    return json({ error: "Сначала сохраните опрос" }, 404);
  if (revoke) {
    getDatabase().prepare("DELETE FROM survey_preview_links WHERE survey_id=?").run(body.surveyId);
    return json({ ok: true });
  }
  const { token, expires } = createPreviewLink(body.surveyId);
  return json({ path: "/preview?token=" + token, expires });
}
export async function POST(req: Request) { return change(req, false); }
export async function DELETE(req: Request) { return change(req, true); }
