require("./register.cjs");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomUUID, createHmac } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const directory = mkdtempSync(join(tmpdir(), "sanext-tests-"));
process.env.DATABASE_PATH = join(directory, "test.sqlite");
process.env.ADMIN_PASSWORD = "test-password-not-for-production";
process.env.PUBLIC_ORIGIN = "https://survey.test";
const legacyId = randomUUID();
const oldAnswers = {
  usage: { Каталог: 0 },
  benefit: ["Каталог"],
  barriers: [],
  barrierOther: "",
  improve: "Прежний ответ",
  needs: [],
  needOther: "",
  ideas: ["Идея", "", ""],
};
const old = new DatabaseSync(process.env.DATABASE_PATH);
old.exec(
  "CREATE TABLE responses (id TEXT PRIMARY KEY,created TEXT,updated TEXT,status TEXT,name TEXT,answers TEXT)",
);
old
  .prepare("INSERT INTO responses VALUES (?,?,?,?,?,?)")
  .run(
    legacyId,
    "2026-10-14T00:00:00Z",
    "2026-10-14T00:00:00Z",
    "draft",
    "Старый участник",
    JSON.stringify(oldAnswers),
  );
old.close();
const runtime = require("../app/runtime.ts"),
  security = require("../app/security.ts"),
  session = require("../app/api/session/route.ts"),
  login = require("../app/api/login/route.ts"),
  surveys = require("../app/api/surveys/route.ts"),
  results = require("../app/api/results/route.ts");
const model = require("../app/survey-model.ts"),
  statistics = require("../app/statistics.ts"),
  exportsModule = require("../app/exports.ts");
const url = "https://survey.test";
let adminCookie = "";
function req(path, body, options = {}) {
  return new Request(url + path, {
    method: options.method || "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: url,
      ...options.headers,
    },
    ...(body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });
}
async function post(body) {
  return session.POST(req("/api/session", body));
}
async function admin(body) {
  return surveys.POST(
    req("/api/surveys", body, { headers: { cookie: adminCookie } }),
  );
}
const template = {
  ...model.legacySurvey,
  id: "",
  title: "Тест",
  status: "active",
  revision: 0,
  questions: [
    {
      id: "choice",
      title: "Выберите",
      description: "",
      type: "multiple",
      required: true,
      options: ["Да", "Нет", "Ничего"],
      rows: [],
      maxChoices: 2,
      exclusive: ["Ничего"],
    },
    {
      id: "matrix",
      title: "Оценка",
      description: "",
      type: "matrix",
      required: true,
      options: ["Хорошо", "Плохо"],
      rows: ["A", "B"],
      maxChoices: 1,
      exclusive: [],
    },
    {
      id: "text",
      title: "Текст",
      description: "",
      type: "text",
      required: false,
      options: [],
      rows: [],
      maxChoices: 1,
      exclusive: [],
    },
  ],
};
let survey, other, visitor;
after(() => {
  runtime.getDatabase().close();
  assert.ok(directory.startsWith(join(tmpdir(), "sanext-tests-")));
  rmSync(directory, { recursive: true, force: true });
});
test("Migration preserves legacy source and converts answers once", () => {
  assert.equal(runtime.getEntries("legacy")[0].answers.idea0, "Идея");
  assert.equal(runtime.getEntries("legacy")[0].id, legacyId);
  assert.equal(
    runtime.getDatabase().prepare("SELECT COUNT(*) AS n FROM responses").get()
      .n,
    1,
  );
  assert.equal(
    runtime.getDatabase().prepare("SELECT COUNT(*) AS n FROM entries").get().n,
    1,
  );
});
test("Unauthenticated results and mutations are denied", async () => {
  assert.equal(
    (await results.GET(new Request(url + "/api/results"))).status,
    401,
  );
  assert.equal((await admin({ create: true, survey: template })).status, 401);
});
test("Login validates malformed body, password and origin", async () => {
  assert.equal((await login.POST(req("/api/login", "{bad"))).status, 400);
  assert.equal(
    (await login.POST(req("/api/login", { password: "wrong" }))).status,
    401,
  );
  assert.equal(
    (
      await login.POST(
        req(
          "/api/login",
          { password: process.env.ADMIN_PASSWORD },
          { headers: { Origin: "https://evil.test" } },
        ),
      )
    ).status,
    403,
  );
  const r = await login.POST(
    req("/api/login", { password: process.env.ADMIN_PASSWORD }),
  );
  assert.equal(r.status, 200);
  assert.match(
    r.headers.get("set-cookie"),
    /HttpOnly; Secure; SameSite=Strict/,
  );
  assert.equal((await r.json()).token, undefined);
  adminCookie = r.headers.get("set-cookie").split(";")[0];
});
test("Create independent surveys; draft definitions remain private", async () => {
  survey = (await (await admin({ create: true, survey: template })).json())
    .survey;
  other = (
    await (
      await admin({
        create: true,
        survey: { ...template, status: "draft", title: "Другой" },
      })
    ).json()
  ).survey;
  assert.notEqual(survey.id, other.id);
  const publicList = await (
    await surveys.GET(new Request(url + "/api/surveys"))
  ).json();
  assert.equal(
    publicList.surveys.some((s) => s.id === other.id),
    false,
  );
  assert.equal(
    publicList.surveys.some((s) => s.questions),
    false,
  );
  assert.equal(
    (await surveys.GET(new Request(url + "/api/surveys?id=" + other.id)))
      .status,
    404,
  );
});
test("Sessions require signatures; copied IDs and cross-survey tokens are rejected", async () => {
  assert.equal(
    (
      await post({
        surveyId: survey.id,
        action: "save",
        name: "",
        answers: {},
        revision: survey.revision,
      })
    ).status,
    403,
  );
  const r = await post({ surveyId: survey.id, action: "start" });
  assert.equal(r.status, 200);
  visitor = await r.json();
  assert.ok(visitor.sessionToken);
  const forged = await session.POST(
    req(
      "/api/session",
      { surveyId: survey.id, action: "start" },
      { headers: { cookie: "survey_id=" + visitor.id } },
    ),
  );
  assert.notEqual((await forged.json()).id, visitor.id);
  assert.equal(
    (
      await post({
        surveyId: "legacy",
        sessionToken: visitor.sessionToken,
        action: "start",
      })
    ).status,
    403,
  );
});
test("Legacy signed session resumes existing answers; tampering fails", async () => {
  const signature = createHmac(
    "sha256",
    "survey-session:" + process.env.ADMIN_PASSWORD,
  )
    .update(legacyId)
    .digest("hex");
  const r = await post({
    surveyId: "legacy",
    sessionToken: legacyId + "." + signature,
    action: "start",
  });
  const d = await r.json();
  assert.equal(d.id, legacyId);
  assert.equal(d.answers.improve, "Прежний ответ");
  assert.equal(
    (
      await post({
        surveyId: "legacy",
        sessionToken: legacyId + "." + "a".repeat(64),
        action: "start",
      })
    ).status,
    403,
  );
});
test("Answer validation rejects invalid choices, exclusive combinations, missing matrix rows and oversized text", async () => {
  const base = {
    surveyId: survey.id,
    sessionToken: visitor.sessionToken,
    name: "",
    action: "submit",
    revision: survey.revision,
  };
  for (const answers of [
    { choice: ["Unknown"], matrix: { A: 0, B: 0 } },
    { choice: ["Да", "Ничего"], matrix: { A: 0, B: 0 } },
    { choice: ["Да"], matrix: { A: 0 } },
    { choice: ["Да"], matrix: { A: 0, B: 0 }, text: "a".repeat(3001) },
  ])
    assert.equal((await post({ ...base, answers })).status, 400);
  assert.equal((await post({ ...base, revision: 0, answers: {} })).status, 409);
  assert.equal(
    (
      await session.POST(
        req(
          "/api/session",
          { ...base },
          { headers: { Origin: "https://evil.test" } },
        ),
      )
    ).status,
    403,
  );
});
test("Cosmetic edits keep the question version; stale revisions are rejected", async () => {
  const r = await admin({ survey: { ...survey, accent: "#156b50" } });
  assert.equal(r.status, 200);
  const updated = (await r.json()).survey;
  assert.equal((await admin({ survey })).status, 409);
  assert.equal(updated.schemaVersion, survey.schemaVersion);
  survey = updated;
});
test("Submission is immutable under simultaneous submit/save and isolated per survey", async () => {
  const base = {
    surveyId: survey.id,
    sessionToken: visitor.sessionToken,
    name: "Участник",
    answers: { choice: ["Да"], matrix: { A: 0, B: 1 }, text: "Ответ" },
    revision: survey.revision,
  };
  const saved = await post({ ...base, action: "save" });
  assert.equal(saved.status, 200);
  const response = await post({ ...base, action: "submit" });
  assert.equal(response.status, 200);
  const attempts = await Promise.all([
    post({ ...base, action: "save", name: "Перезапись" }),
    post({ ...base, action: "submit" }),
  ]);
  assert.ok(attempts.every((r) => r.status === 409));
  const r = await results.GET(
    new Request(url + "/api/results?survey=" + survey.id, {
      headers: { cookie: adminCookie },
    }),
  );
  const data = await r.json();
  const completed = data.rows.find((r) => r.id === visitor.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.name, "Участник");
  assert.equal(runtime.getEntries(other.id).length, 0);
});
test("Archive closes collection while preserving statistics and answers", async () => {
  const r = await admin({ survey: { ...survey, status: "archived" } });
  assert.equal(r.status, 200);
  survey = (await r.json()).survey;
  assert.equal(
    (
      await post({
        surveyId: survey.id,
        sessionToken: visitor.sessionToken,
        action: "start",
      })
    ).status,
    410,
  );
  assert.equal(
    (await surveys.GET(new Request(url + "/api/surveys?id=" + survey.id)))
      .status,
    404,
  );
  assert.equal(
    (
      await results.GET(
        new Request(url + "/api/results?survey=" + survey.id, {
          headers: { cookie: adminCookie },
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    runtime.getEntries(survey.id).find((r) => r.id === visitor.id).status,
    "completed",
  );
});
test("Statistics use question/row denominators and count a participant once", () => {
  const rows = runtime
    .getEntries(survey.id)
    .filter((r) => r.status === "completed");
  const stat = statistics.questionStats(survey.questions[0], rows);
  assert.equal(stat.base.length, 1);
  assert.equal(stat.counts[0].percent, 100);
  const matrix = statistics.matrixStats(survey.questions[1], rows);
  assert.deepEqual(
    matrix.map((m) => m.counts),
    [
      [1, 0],
      [0, 1],
    ],
  );
  assert.equal(statistics.summaryTable(survey, rows).length, 9);
});
test("CSV escapes formulas, quotes, delimiters and multiline answers", () => {
  const value = exportsModule.csv([
    ["=1+1", "a;b", 'two"quotes', "line\nnext"],
  ]);
  assert.match(value, /'=1\+1/);
  assert.match(value, /"a;b"/);
  assert.match(value, /two""quotes/);
  assert.match(value, /line\nnext/);
});
test("Excel is a valid ZIP with two worksheets and inline strings (no formulas)", () => {
  const rows = runtime.getEntries(survey.id);
  const bytes = Buffer.from(exportsModule.workbook(survey, rows));
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  const files = {};
  let p = 0;
  while (bytes.readUInt32LE(p) === 0x04034b50) {
    const len = bytes.readUInt32LE(p + 18),
      nameLen = bytes.readUInt16LE(p + 26),
      extra = bytes.readUInt16LE(p + 28);
    const name = bytes.subarray(p + 30, p + 30 + nameLen).toString();
    const start = p + 30 + nameLen + extra;
    files[name] = bytes.subarray(start, start + len).toString();
    p = start + len;
  }
  assert.ok(files["xl/worksheets/sheet1.xml"]);
  assert.ok(files["xl/worksheets/sheet2.xml"]);
  assert.match(files["xl/workbook.xml"], /Ответы/);
  assert.match(files["xl/worksheets/sheet1.xml"], /Участник/);
  assert.doesNotMatch(files["xl/worksheets/sheet1.xml"], /<f>/);
});
test("Version 2 JSON imports atomically and duplicate IDs are skipped", () => {
  const copy = { ...survey, id: randomUUID(), title: "Импорт" };
  const exported = {
    version: 2,
    survey: copy,
    rows: runtime
      .getEntries(survey.id)
      .map((r) => ({ ...r, id: randomUUID(), survey_id: copy.id })),
  };
  const file = join(directory, "export.json");
  writeFileSync(file, JSON.stringify(exported));
  const run = () =>
    spawnSync(process.execPath, ["scripts/import-responses.mjs", file], {
      encoding: "utf8",
    });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(runtime.getEntries(copy.id).length, exported.rows.length);
  assert.match(run().stdout, /Imported 0/);
  writeFileSync(
    file,
    JSON.stringify({
      ...exported,
      survey: { ...copy, questions: copy.questions.slice(1) },
    }),
  );
  assert.notEqual(run().status, 0);
});
test("Backup and restore include surveys, history and answers", () => {
  const path = join(directory, "backup.sqlite"),
    restored = join(directory, "restored.sqlite");
  const backup = spawnSync(process.execPath, ["scripts/backup.mjs", path], {
    encoding: "utf8",
  });
  assert.equal(backup.status, 0, backup.stderr);
  const restore = spawnSync(process.execPath, ["scripts/restore.mjs", path], {
    env: { ...process.env, DATABASE_PATH: restored },
    encoding: "utf8",
  });
  assert.equal(restore.status, 0, restore.stderr);
  const db = new DatabaseSync(restored, { readOnly: true });
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM surveys").get().n >= 3);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM entries").get().n,
    runtime.getDatabase().prepare("SELECT COUNT(*) AS n FROM entries").get().n,
  );
  db.close();
});
test("Public view hides drafts even with an administrator cookie", async () => {
  const response = await surveys.GET(
    new Request(url + "/api/surveys?public=1", {
      headers: { cookie: adminCookie },
    }),
  );
  const data = await response.json();
  assert.equal(
    data.surveys.some((s) => s.id === other.id),
    false,
  );
  assert.equal(
    data.surveys.some((s) => s.questions),
    false,
  );
  assert.equal(
    (
      await surveys.GET(
        new Request(url + "/api/surveys?public=1&id=" + other.id, {
          headers: { cookie: adminCookie },
        }),
      )
    ).status,
    404,
  );
});
test("Legacy follow-up can be reached and incorrect answer types are rejected", () => {
  const q = model.legacySurvey.questions.find((q) => q.id === "barriers");
  assert.equal(
    model.validateAnswers(
      { ...model.legacySurvey, questions: [q] },
      { barriers: ["Другое"] },
      true,
    ),
    null,
  );
  assert.notEqual(model.validateAnswers(template, { text: [] }, false), null);
  const full = {
    ...model.emptyAnswers(model.legacySurvey),
    usage: Object.fromEntries(
      model.legacySurvey.questions[0].rows.map((t) => [t, 0]),
    ),
    benefit: ["Каталог"],
    barriers: ["Другое"],
    needs: ["Поддержки достаточно"],
    idea0: "Идея",
    idea1: "Нет идей",
    idea2: "Нет идей",
  };
  assert.equal(
    model.validateAnswers(model.legacySurvey, full, true),
    "Уточните другую причину",
  );
  assert.equal(
    model.validateAnswers(
      model.legacySurvey,
      { ...full, barrierOther: "Уточнение" },
      true,
    ),
    null,
  );
});
test("Expired or revoked administrator tokens cannot access results", async () => {
  const token = adminCookie.split("=")[1];
  runtime
    .getDatabase()
    .prepare("UPDATE admin_sessions SET expires=0 WHERE token_hash=?")
    .run(security.tokenHash(token));
  assert.equal(
    (
      await results.GET(
        new Request(url + "/api/results", { headers: { cookie: adminCookie } }),
      )
    ).status,
    401,
  );
  const r = await login.POST(
    req("/api/login", { password: process.env.ADMIN_PASSWORD }),
  );
  adminCookie = r.headers.get("set-cookie").split(";")[0];
  const logout = await login.DELETE(
    req("/api/login", undefined, {
      method: "DELETE",
      headers: { cookie: adminCookie },
    }),
  );
  assert.equal(logout.status, 200);
  assert.equal(
    (
      await results.GET(
        new Request(url + "/api/results", { headers: { cookie: adminCookie } }),
      )
    ).status,
    401,
  );
});
test("Rate limiter stops repeated attempts and malformed/large payloads are rejected", async () => {
  assert.equal(security.rateLimit("test", 1, 60_000), true);
  assert.equal(security.rateLimit("test", 1, 60_000), false);
  assert.equal((await session.POST(req("/api/session", "null"))).status, 400);
  assert.equal(
    (
      await post({
        surveyId: "legacy",
        action: "start",
        padding: "x".repeat(100001),
      })
    ).status,
    400,
  );
  const wrong = req("/api/login", { password: "wrong" });
  for (let i = 0; i < 30; i++) await login.POST(wrong.clone());
  assert.equal(
    (await login.POST(req("/api/login", { password: "wrong" }))).status,
    429,
  );
});
