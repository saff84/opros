import { getDatabase } from "../../runtime";
import { homePageTitle, homePageDescription } from "../../page-titles";
import { canManage, json, originOK, readBody } from "../../security";
export async function GET() { return json({ pageTitle: homePageTitle(), pageDescription: homePageDescription() }); }
export async function POST(req: Request) {
  if (!originOK(req) || !(await canManage(req))) return json({ error: "Нужны права администратора" }, 403);
  let body;
  try { body = await readBody(req); } catch { return json({ error: "Некорректный запрос" }, 400); }
  if (typeof body?.pageTitle !== "string" || body.pageTitle.length > 160)
    return json({ error: "Заголовок страницы: до 160 символов" }, 400);
  if (body.pageDescription !== undefined && (typeof body.pageDescription !== "string" || body.pageDescription.length > 1000))
    return json({ error: "Meta description: до 1000 символов" }, 400);
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
  getDatabase().prepare("INSERT INTO settings VALUES ('home_page_title',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(body.pageTitle.trim());
  if (body.pageDescription !== undefined)
    db.prepare("INSERT INTO settings VALUES ('home_page_description',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(body.pageDescription.trim());
  db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return json({ ok: true, pageTitle: homePageTitle(), pageDescription: homePageDescription() });
}
