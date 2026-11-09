import { getDatabase } from "../../runtime";
import { homePageTitle } from "../../page-titles";
import { canManage, json, originOK, readBody } from "../../security";
export async function GET() { return json({ pageTitle: homePageTitle() }); }
export async function POST(req: Request) {
  if (!originOK(req) || !(await canManage(req))) return json({ error: "Нужны права администратора" }, 403);
  let body;
  try { body = await readBody(req); } catch { return json({ error: "Некорректный запрос" }, 400); }
  if (typeof body?.pageTitle !== "string" || body.pageTitle.length > 160)
    return json({ error: "Заголовок страницы: до 160 символов" }, 400);
  getDatabase().prepare("INSERT INTO settings VALUES ('home_page_title',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(body.pageTitle.trim());
  return json({ ok: true, pageTitle: homePageTitle() });
}
