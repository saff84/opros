import { getDatabase } from "../../../runtime";
import { isAdmin, json } from "../../../security";
import { surveyImageSources } from "../../../../scripts/welcome.mjs";
import { isSurveyOpen } from "../../../../scripts/survey-features.mjs";
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id))
    return json({ error: "Картинка не найдена" }, 404);
  const db = getDatabase(),
    admin = await isAdmin(req);
  const row = db.prepare("SELECT mime,data FROM images WHERE id=?").get(id) as
    { mime: string; data: Uint8Array } | undefined;
  if (!row) return json({ error: "Картинка не найдена" }, 404);
  const src = "/api/images/" + id;
  if (!admin) {
    const referenced = (
      db.prepare("SELECT definition FROM surveys").all() as {
        definition: string;
      }[]
    ).some((r) => {
      const s = JSON.parse(r.definition);
      return isSurveyOpen(s) && surveyImageSources(s).includes(src);
    });
    if (!referenced) return json({ error: "Картинка не найдена" }, 404);
  }
  if (new URL(req.url).searchParams.get("format") === "json") {
    if (!admin) return json({ error: "Требуется вход" }, 401);
    return json({
      id,
      mime: row.mime,
      data: Buffer.from(row.data).toString("base64"),
    });
  }
  return new Response(Buffer.from(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(row.data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
