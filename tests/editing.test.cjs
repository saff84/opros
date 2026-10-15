require("./register.cjs");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const directory = mkdtempSync(join(tmpdir(), "sanext-edit-tests-"));
process.env.DATABASE_PATH = join(directory, "editing.sqlite");
process.env.ADMIN_PASSWORD = "editing-test-password-only";
process.env.PUBLIC_ORIGIN = "https://editing.test";
const runtime = require("../app/runtime.ts"),
  security = require("../app/security.ts"),
  model = require("../app/survey-model.ts");
const api = require("../app/api/surveys/route.ts"),
  session = require("../app/api/session/route.ts"),
  results = require("../app/api/results/route.ts");
const cookie = "survey_admin=" + security.createAdminSession();
function req(path, body, admin = false) {
  return new Request("https://editing.test" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: process.env.PUBLIC_ORIGIN,
      "Content-Type": "application/json",
      ...(admin ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function save(survey, create = false) {
  const r = await api.POST(req("/api/surveys", { survey, create }, true));
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  return (await r.json()).survey;
}
async function start(s, token) {
  const r = await session.POST(
    req("/api/session", {
      surveyId: s.id,
      action: "start",
      sessionToken: token,
    }),
  );
  assert.equal(r.status, 200);
  return r.json();
}
async function submit(s, visitor, answers, action = "submit") {
  return session.POST(
    req("/api/session", {
      surveyId: s.id,
      revision: s.revision,
      sessionToken: visitor.sessionToken,
      name: "Сотрудник",
      answers,
      action,
    }),
  );
}
async function report(s, version) {
  const r = await results.GET(
    req(
      "/api/results?survey=" + s.id + (version ? "&version=" + version : ""),
      undefined,
      true,
    ),
  );
  assert.equal(r.status, 200);
  return r.json();
}
const q = (id, title, type = "text", options = [], rows = []) => ({
  id,
  title,
  type,
  options,
  rows,
  required: true,
  description: "",
  exclusive: [],
  maxChoices: 2,
});
after(() => {
  runtime.getDatabase().close();
  assert.ok(directory.startsWith(join(tmpdir(), "sanext-edit-tests-")));
  rmSync(directory, { recursive: true, force: true });
});
test("Current survey supports editing, deleting, adding and reordering after responses", async (t) => {
  let s = await save(
    {
      ...model.legacySurvey,
      id: "",
      title: "Редактируемый опрос",
      questions: [
        q("keep", "Неизменный вопрос"),
        q("edit", "Старая формулировка"),
        q("remove", "Удаляемый вопрос"),
        q("matrix", "Матрица", "matrix", ["Да", "Нет"], ["Строка"]),
      ],
    },
    true,
  );
  const original = structuredClone(s),
    visitor = await start(s),
    draft = await start(s);
  const answers = {
    keep: "Сохраняется",
    edit: "Ответ на старую формулировку",
    remove: "Архивный ответ",
    matrix: { Строка: 0 },
  };
  assert.equal((await submit(s, visitor, answers)).status, 200);
  assert.equal((await submit(s, draft, answers, "save")).status, 200);
  await t.test("All four operations save on the same survey ID", async () => {
    s = await save({
      ...s,
      questions: [
        { ...s.questions[3], options: ["Да", "Нет", "Затрудняюсь"] },
        s.questions[0],
        { ...s.questions[1], title: "Новая формулировка" },
        q("added", "Добавленный вопрос"),
      ],
    });
    assert.equal(s.id, original.id);
    assert.equal(s.schemaVersion, 2);
    assert.deepEqual(
      s.questions.map((q) => q.id),
      ["matrix", "keep", "edit", "added"],
    );
    assert.equal(
      runtime.getSurveyVersion(s.id, 1).questions.find((q) => q.id === "edit")
        .title,
      "Старая формулировка",
    );
  });
  await t.test(
    "Old completed and draft answers remain unchanged and separate",
    async () => {
      const current = await report(s),
        old = await report(s, 1);
      assert.equal(current.rows.length, 0);
      assert.equal(old.rows.length, 2);
      assert.ok(old.survey.questions.some((q) => q.id === "remove"));
      assert.equal(
        old.rows.find((r) => r.id === visitor.id).answers.remove,
        "Архивный ответ",
      );
      assert.equal(
        old.rows.find((r) => r.id === visitor.id).status,
        "completed",
      );
      assert.equal(old.rows.find((r) => r.id === draft.id).status, "draft");
      assert.equal(current.versions.length, 2);
      assert.equal(current.currentSurvey.schemaVersion, 2);
    },
  );
  await t.test("Public link immediately serves updated questions", async () => {
    const r = await api.GET(req("/api/surveys?public=1&id=" + s.id));
    const d = await r.json();
    assert.equal(d.survey.schemaVersion, 2);
    assert.equal(
      d.survey.questions.some((q) => q.id === "remove"),
      false,
    );
    assert.ok(d.survey.questions.some((q) => q.id === "added"));
  });
  await t.test(
    "Stale clients cannot overwrite old or new answers",
    async () => {
      const r = await submit(original, draft, answers, "save");
      assert.equal(r.status, 409);
      assert.equal((await r.json()).code, "SURVEY_UPDATED");
      assert.equal(
        runtime.getEntries(s.id, 1).find((r) => r.id === draft.id).answers
          .remove,
        "Архивный ответ",
      );
    },
  );
  let renewed;
  await t.test(
    "Reopening starts a new version and keeps only unchanged answers",
    async () => {
      renewed = await start(s, visitor.sessionToken);
      assert.notEqual(renewed.id, visitor.id);
      assert.equal(renewed.status, "draft");
      assert.equal(renewed.answers.keep, "Сохраняется");
      assert.equal(renewed.answers.edit, "");
      assert.equal(renewed.answers.added, "");
      assert.deepEqual(renewed.answers.matrix, {});
      assert.equal(renewed.answers.remove, undefined);
      assert.equal(runtime.getEntries(s.id, 1).length, 2);
    },
  );
  await t.test(
    "Added required questions are validated; statistics use only this version",
    async () => {
      assert.equal((await submit(s, renewed, renewed.answers)).status, 400);
      const updated = {
        keep: "Сохраняется",
        edit: "Ответ на новую формулировку",
        added: "Новый ответ",
        matrix: { Строка: 2 },
      };
      assert.equal((await submit(s, renewed, updated)).status, 200);
      const d = await report(s);
      assert.equal(d.rows.length, 1);
      assert.equal(d.rows[0].schema_version, 2);
      assert.equal(d.rows[0].answers.added, "Новый ответ");
      assert.equal((await report(s, 1)).rows.length, 2);
    },
  );
  await t.test(
    "Cosmetic changes do not split statistics; next structural edit creates version 3",
    async () => {
      s = await save({ ...s, intro: "Новое вступление", accent: "#156b50" });
      assert.equal(s.schemaVersion, 2);
      assert.equal((await report(s)).rows.length, 1);
      s = await save({
        ...s,
        questions: s.questions.map((q) =>
          q.id === "edit"
            ? { ...q, type: "single", options: ["Вариант А", "Вариант Б"] }
            : q,
        ),
      });
      assert.equal(s.schemaVersion, 3);
      assert.equal((await report(s)).rows.length, 0);
      assert.equal(
        (await report(s, 2)).rows[0].answers.edit,
        "Ответ на новую формулировку",
      );
    },
  );
  await t.test(
    "Empty questionnaire and stale administrator revisions are rejected",
    async () => {
      assert.equal(
        (
          await api.POST(
            req("/api/surveys", { survey: { ...s, questions: [] } }, true),
          )
        ).status,
        400,
      );
      assert.equal(
        (await api.POST(req("/api/surveys", { survey: original }, true)))
          .status,
        409,
      );
      assert.equal(runtime.getSurvey(s.id).schemaVersion, 3);
    },
  );
  await t.test(
    "Historical JSON re-import preserves both definitions and current version",
    () => {
      const old = runtime.getSurveyVersion(s.id, 1),
        rows = runtime
          .getEntries(s.id, 1)
          .map((r) => ({ ...r, id: crypto.randomUUID() }));
      const file = join(directory, "history.json");
      writeFileSync(file, JSON.stringify({ version: 2, survey: old, rows }));
      const r = spawnSync(
        process.execPath,
        ["scripts/import-responses.mjs", file],
        { encoding: "utf8" },
      );
      assert.equal(r.status, 0, r.stderr);
      assert.equal(runtime.getSurvey(s.id).schemaVersion, 3);
      assert.equal(runtime.getEntries(s.id, 1).length, 4);
      assert.equal(runtime.getEntries(s.id, 2).length, 1);
    },
  );
  await t.test(
    "Editor exposes add, delete and editable fields for a live survey",
    () => {
      const React = require("react"),
        { renderToStaticMarkup } = require("react-dom/server"),
        Editor = require("../app/results/editor.tsx").default;
      const html = renderToStaticMarkup(
        React.createElement(Editor, {
          initial: s,
          onSave: async () => {},
          onCancel: () => {},
        }),
      );
      assert.match(html, /Добавить вопрос/);
      assert.match(html, /Удалить/);
      assert.match(html, /Новая формулировка/);
      assert.doesNotMatch(html, /<fieldset disabled/);
      assert.doesNotMatch(html, /<button disabled="">Удалить/);
    },
  );
});

test("Upgrade of an existing multi-survey database preserves entries and seeds question history", () => {
  const { DatabaseSync } = require("node:sqlite");
  const filename = join(directory, "previous-version.sqlite");
  const db = new DatabaseSync(filename);
  db.exec(
    "CREATE TABLE surveys(id TEXT PRIMARY KEY,definition TEXT NOT NULL); CREATE TABLE entries(id TEXT PRIMARY KEY,survey_id TEXT,created TEXT,updated TEXT,status TEXT,name TEXT,answers TEXT); CREATE TABLE migrations(name TEXT PRIMARY KEY);",
  );
  const previous = {
    ...model.legacySurvey,
    id: "existing",
    revision: 7,
    questions: [q("keep", "Прежний вопрос")],
  };
  db.prepare("INSERT INTO surveys VALUES (?,?)").run(
    previous.id,
    JSON.stringify(previous),
  );
  db.prepare("INSERT INTO migrations VALUES (?)").run("multi-survey-v1");
  db.prepare("INSERT INTO entries VALUES (?,?,?,?,?,?,?)").run(
    crypto.randomUUID(),
    previous.id,
    new Date().toISOString(),
    new Date().toISOString(),
    "completed",
    "Имя",
    JSON.stringify({ keep: "Старый ответ" }),
  );
  db.close();
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      "require('./tests/register.cjs');const r=require('./app/runtime.ts');console.log(JSON.stringify({survey:r.getSurvey('existing'),rows:r.getEntries('existing'),versions:r.getSurveyVersions('existing')}));r.getDatabase().close()",
    ],
    { env: { ...process.env, DATABASE_PATH: filename }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.survey.revision, 7);
  assert.equal(data.survey.schemaVersion, 1);
  assert.equal(data.rows[0].schema_version, 1);
  assert.equal(data.rows[0].answers.keep, "Старый ответ");
  assert.equal(data.versions[0].total, 1);
});
