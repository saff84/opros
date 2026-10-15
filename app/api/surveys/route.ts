import { getDatabase, getSurvey } from "../../runtime";
import { isAdmin, canEdit, json, originOK, readBody } from "../../security";
import { Survey, validateSurvey } from "../../survey-model";
import { surveyImageSources } from "../../../scripts/welcome.mjs";
import { isSurveyOpen } from "../../../scripts/survey-features.mjs";
export async function GET(req: Request) {
  const db = getDatabase(),
    admin =
      new URL(req.url).searchParams.get("public") !== "1" &&
      (await isAdmin(req));
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const s = getSurvey(id);
    return s && (admin || isSurveyOpen(s))
      ? json({ survey: s })
      : json({ error: "Опрос не найден или закрыт" }, 404);
  }
  const surveys = (
    db
      .prepare("SELECT definition FROM surveys ORDER BY rowid DESC")
      .all() as any[]
  )
    .map((r) => JSON.parse(r.definition) as Survey)
    .filter((s) => admin || isSurveyOpen(s));
  return json({
    surveys: surveys.map((s) =>
      admin
        ? {
            ...s,
            ...db
              .prepare(
                "SELECT COUNT(*) AS total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM entries WHERE survey_id=?",
              )
              .get(s.id),
          }
        : {
            id: s.id,
            title: s.title,
            description: s.description,
            accent: s.accent,
          },
    ),
  });
}
export async function POST(req: Request) {
  if (!originOK(req)) return json({ error: "Запрос отклонён" }, 403);
  if (!(await isAdmin(req))) return json({ error: "Требуется вход" }, 401);
  if (!(await canEdit(req)))
    return json({ error: "У вас доступ только к просмотру" }, 403);
  let body;
  try {
    body = await readBody(req);
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }
  if (!validateSurvey(body?.survey))
    return json(
      { error: "Проверьте название, вопросы, варианты и цвета" },
      400,
    );
  const input = body.survey as Survey,
    db = getDatabase();
  if (
    body.create !== true &&
    (typeof input.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(input.id) ||
      !Number.isInteger(input.revision))
  )
    return json({ error: "Некорректный ID или версия опроса" }, 400);
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = body.create ? null : getSurvey(input.id);
    if (!body.create && !current) {
      db.exec("ROLLBACK");
      return json({ error: "Опрос не найден" }, 404);
    }
    if (current && input.revision !== current.revision) {
      db.exec("ROLLBACK");
      return json(
        { error: "Опрос изменён в другой вкладке. Обновите страницу." },
        409,
      );
    }
    if (
      surveyImageSources(input).some(
        (src) =>
          !db
            .prepare("SELECT id FROM images WHERE id=?")
            .get(src.split("/").pop()!),
      )
    ) {
      db.exec("ROLLBACK");
      return json(
        { error: "Загрузите изображения заново: файл не найден" },
        400,
      );
    }
    const structureChanged =
      !!current &&
      JSON.stringify(current.questions) !== JSON.stringify(input.questions);
    const now = new Date().toISOString();
    const s: Survey = {
      title: input.title.trim(),
      description: input.description,
      intro: input.intro,
      thanks: input.thanks,
      accent: input.accent,
      background: input.background,
      status: input.status,
      questions: input.questions,
      ...(input.startsAt ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt ? { endsAt: input.endsAt } : {}),
      ...(input.welcome ? { welcome: input.welcome } : {}),
      schemaVersion: current
        ? (current.schemaVersion || 1) + (structureChanged ? 1 : 0)
        : 1,
      id: current?.id || crypto.randomUUID(),
      created: current?.created || now,
      updated: now,
      revision: (current?.revision || 0) + 1,
    };
    db.prepare(
      "INSERT INTO surveys VALUES (?,?) ON CONFLICT(id) DO UPDATE SET definition=excluded.definition",
    ).run(s.id, JSON.stringify(s));
    if (current)
      db.prepare("INSERT OR IGNORE INTO survey_versions VALUES (?,?,?)").run(
        current.id,
        current.schemaVersion || 1,
        JSON.stringify(current),
      );
    db.prepare(
      "INSERT INTO survey_versions VALUES (?,?,?) ON CONFLICT(survey_id,version) DO UPDATE SET definition=excluded.definition",
    ).run(s.id, s.schemaVersion || 1, JSON.stringify(s));
    db.exec("COMMIT");
    return json({ survey: s });
  } catch (e) {
    db.exec("ROLLBACK");
    console.error(e);
    return json({ error: "Не удалось сохранить опрос" }, 503);
  }
}
