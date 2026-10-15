import {
  getEntries,
  getSurvey,
  getSurveyVersion,
  getSurveyVersions,
} from "../../runtime";
import { json, isAdmin } from "../../security";
export async function GET(req: Request) {
  if (!(await isAdmin(req))) return json({ error: "Требуется вход" }, 401);
  const params = new URL(req.url).searchParams,
    current = getSurvey(params.get("survey") || "legacy");
  if (!current) return json({ error: "Опрос не найден" }, 404);
  const version = params.has("version")
    ? Number(params.get("version"))
    : current.schemaVersion || 1;
  if (!Number.isInteger(version) || version < 1)
    return json({ error: "Некорректная версия" }, 400);
  const survey =
    version === (current.schemaVersion || 1)
      ? current
      : getSurveyVersion(current.id, version);
  if (!survey) return json({ error: "Версия не найдена" }, 404);
  return json({
    survey,
    currentSurvey: current,
    versions: getSurveyVersions(current.id),
    rows: getEntries(current.id, version),
  });
}
