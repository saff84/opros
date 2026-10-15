import { sanitizeAnswers } from "../../branching";
import { getDatabase, getSurvey, getSurveyVersion } from "../../runtime";
import {
  json,
  originOK,
  readBody,
  verifySession,
  verifyPreviousSession,
  verifyLegacySession,
  signSession,
  rateLimit,
} from "../../security";
import { emptyAnswers, validateAnswers, AnswerMap } from "../../survey-model";
export async function POST(req: Request) {
  try {
    if (!originOK(req)) return json({ error: "Запрос отклонён" }, 403);
    let body;
    try {
      body = await readBody(req);
    } catch {
      return json({ error: "Некорректный запрос" }, 400);
    }
    if (
      !body ||
      !["start", "save", "submit"].includes(body.action) ||
      typeof body.surveyId !== "string"
    )
      return json({ error: "Некорректный запрос" }, 400);
    const s = getSurvey(body.surveyId);
    if (!s || s.status !== "active")
      return json({ error: "Этот опрос не принимает ответы" }, 410);
    const db = getDatabase();
    let id = await verifySession(body.sessionToken, s.id);
    if (!id) id = await verifyPreviousSession(body.sessionToken, s.id);
    if (!id && s.id === "legacy")
      id = await verifyLegacySession(body.sessionToken);
    const latest = getSurvey(s.id);
    if (!latest || latest.status !== "active")
      return json({ error: "Этот опрос не принимает ответы" }, 410);
    if (latest.revision !== s.revision)
      return json(
        { error: "Опрос обновлён. Обновите страницу.", code: "SURVEY_UPDATED" },
        409,
      );
    if (body.sessionToken && !id)
      return json(
        {
          error:
            "Сессия устарела. Создайте новую сессию, сохранив локальный черновик.",
          code: "SESSION_EXPIRED",
        },
        403,
      );
    if (body.action === "start") {
      if (!id) {
        if (!rateLimit("new-session", 300, 3600_000))
          return json({ error: "Лимит новых сессий. Попробуйте позже." }, 429);
        id = crypto.randomUUID();
      }
      const previous = db
        .prepare("SELECT * FROM entries WHERE id=? AND survey_id=?")
        .get(id, s.id) as any;
      const version = s.schemaVersion || 1;
      let initial = emptyAnswers(s),
        initialName = "";
      if (previous && previous.schema_version !== version) {
        const old = getSurveyVersion(s.id, previous.schema_version);
        const values = JSON.parse(previous.answers) as AnswerMap;
        for (const q of s.questions) {
          const before = old?.questions.find((x) => x.id === q.id);
          if (
            before &&
            JSON.stringify(before) === JSON.stringify(q) &&
            values[q.id] !== undefined
          )
            initial[q.id] = values[q.id];
        }
        initialName = previous.name;
        if (!rateLimit("new-session", 300, 3600_000))
          return json({ error: "Лимит новых сессий. Попробуйте позже." }, 429);
        id = crypto.randomUUID();
      }
      const now = new Date().toISOString();
      db.prepare(
        "INSERT OR IGNORE INTO entries (id,survey_id,created,updated,status,name,answers,schema_version) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        id,
        s.id,
        now,
        now,
        previous && previous.schema_version !== version ? "draft" : "visited",
        initialName,
        JSON.stringify(sanitizeAnswers(s, initial)),
        version,
      );
      const row = db
        .prepare("SELECT * FROM entries WHERE id=? AND survey_id=?")
        .get(id, s.id) as any;
      return json({
        id,
        sessionToken: await signSession(id, s.id),
        answers: JSON.parse(row.answers),
        name: row.name,
        status: row.status,
        updated: row.updated,
      });
    }
    if (!id) return json({ error: "Требуется подтверждённая сессия" }, 403);
    if (!rateLimit("save:" + id, 180, 60_000))
      return json({ error: "Слишком много запросов. Подождите минуту." }, 429);
    if (body.revision !== s.revision)
      return json(
        { error: "Опрос обновлён. Обновите страницу.", code: "SURVEY_UPDATED" },
        409,
      );
    if (typeof body.name !== "string" || body.name.length > 120)
      return json({ error: "Имя должно быть не длиннее 120 символов" }, 400);
    const error = validateAnswers(s, body.answers, body.action === "submit");
    if (error) return json({ error }, 400);
    const result = db
      .prepare(
        "UPDATE entries SET updated=?,status=?,name=?,answers=? WHERE id=? AND survey_id=? AND status!='completed' AND schema_version=?",
      )
      .run(
        new Date().toISOString(),
        body.action === "submit" ? "completed" : "draft",
        body.name.trim(),
        JSON.stringify(sanitizeAnswers(s, body.answers)),
        id,
        s.id,
        s.schemaVersion || 1,
      );
    const entryVersion = db
      .prepare("SELECT schema_version FROM entries WHERE id=? AND survey_id=?")
      .get(id, s.id) as { schema_version: number } | undefined;
    if (entryVersion && entryVersion.schema_version !== (s.schemaVersion || 1))
      return json(
        {
          error: "Вопросы изменились. Обновите страницу.",
          code: "SURVEY_UPDATED",
        },
        409,
      );
    if (!result.changes) {
      const existing = db
        .prepare("SELECT status FROM entries WHERE id=? AND survey_id=?")
        .get(id, s.id);
      return json(
        {
          error: existing ? "Ответ уже отправлен" : "Откройте опрос заново",
          code: existing ? "COMPLETED" : "MISSING_SESSION",
        },
        409,
      );
    }
    return json({ ok: true, id });
  } catch (error) {
    console.error("Survey request failed", error);
    return json(
      {
        error: "Не удалось сохранить ответы. Черновик остаётся на устройстве.",
      },
      503,
    );
  }
}
