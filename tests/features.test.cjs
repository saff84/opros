require("./register.cjs");
const { test, after } = require("node:test"),
  assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs"),
  { tmpdir } = require("node:os"),
  { join } = require("node:path"),
  { spawnSync } = require("node:child_process");
const directory = mkdtempSync(join(tmpdir(), "sanext-features-"));
process.env.DATABASE_PATH = join(directory, "features.sqlite");
process.env.ADMIN_PASSWORD = "initial-administrator-test-secret";
process.env.PUBLIC_ORIGIN = "https://features.test";
const bootstrap = process.env.ADMIN_PASSWORD;
const dbModule = require("../app/runtime.ts"),
  security = require("../app/security.ts"),
  login = require("../app/api/login/route.ts"),
  surveys = require("../app/api/surveys/route.ts"),
  session = require("../app/api/session/route.ts"),
  images = require("../app/api/images/route.ts"),
  imageRoute = require("../app/api/images/[id]/route.ts"),
  model = require("../app/survey-model.ts"),
  branch = require("../app/branching.ts");
let cookie = "survey_admin=" + security.createAdminSession();
const nextPassword = "new-administrator-test-password";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5FoAAAAASUVORK5CYII=",
  "base64",
);
function req(
  path,
  body,
  admin = false,
  method = body === undefined ? "GET" : "POST",
) {
  return new Request(process.env.PUBLIC_ORIGIN + path, {
    method,
    headers: {
      Origin: process.env.PUBLIC_ORIGIN,
      "Content-Type": "application/json",
      ...(admin ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function create(questions, status = "active") {
  const r = await surveys.POST(
    req(
      "/api/surveys",
      {
        create: true,
        survey: {
          ...model.legacySurvey,
          id: "",
          title: "Тест возможностей",
          questions,
          status,
        },
      },
      true,
    ),
  );
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  return (await r.json()).survey;
}
const q = (id, title, type = "text", options = [], showWhen) => ({
  id,
  title,
  type,
  options,
  rows: [],
  required: true,
  description: "",
  maxChoices: 3,
  exclusive: [],
  ...(showWhen ? { showWhen } : {}),
});
const condition = (questionId, value, operator = "equals") => ({
  questionId,
  value,
  operator,
});
async function start(s) {
  const r = await session.POST(
    req("/api/session", { action: "start", surveyId: s.id }),
  );
  assert.equal(r.status, 200);
  return r.json();
}
async function answer(s, visitor, answers, action = "submit") {
  return session.POST(
    req("/api/session", {
      action,
      surveyId: s.id,
      revision: s.revision,
      name: "Тест",
      answers,
      sessionToken: visitor.sessionToken,
    }),
  );
}
async function imageGet(id, admin = false, query = "") {
  return imageRoute.GET(req("/api/images/" + id + query, undefined, admin), {
    params: Promise.resolve({ id }),
  });
}
after(() => {
  dbModule.getDatabase().close();
  assert.ok(directory.startsWith(join(tmpdir(), "sanext-features-")));
  rmSync(directory, { recursive: true, force: true });
});
test("Password change rejects unauthenticated, malformed and weak requests", async () => {
  assert.equal(
    (
      await login.PATCH(
        req(
          "/api/login",
          { currentPassword: bootstrap, newPassword: nextPassword },
          false,
          "PATCH",
        ),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await login.PATCH(
        req(
          "/api/login",
          { currentPassword: "wrong", newPassword: nextPassword },
          true,
          "PATCH",
        ),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await login.PATCH(
        req(
          "/api/login",
          { currentPassword: bootstrap, newPassword: "short" },
          true,
          "PATCH",
        ),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await login.PATCH(
        req(
          "/api/login",
          { currentPassword: bootstrap, newPassword: bootstrap },
          true,
          "PATCH",
        ),
      )
    ).status,
    400,
  );
});
test("Changing password revokes old admin sessions, preserves visitor sessions and persists across restarts", async () => {
  const oldCookie = cookie,
    second = "survey_admin=" + security.createAdminSession(),
    visitor = await security.signSession(crypto.randomUUID(), "legacy");
  const changed = await login.PATCH(
    req(
      "/api/login",
      { currentPassword: bootstrap, newPassword: nextPassword },
      true,
      "PATCH",
    ),
  );
  assert.equal(changed.status, 200);
  cookie = changed.headers.get("set-cookie").split(";")[0];
  assert.equal(
    await security.isAdmin(
      new Request(process.env.PUBLIC_ORIGIN, {
        headers: { Cookie: oldCookie },
      }),
    ),
    false,
  );
  assert.equal(
    await security.isAdmin(
      new Request(process.env.PUBLIC_ORIGIN, { headers: { Cookie: second } }),
    ),
    false,
  );
  assert.equal(
    await security.isAdmin(req("/api/results", undefined, true)),
    true,
  );
  assert.equal(security.passwordOK(bootstrap), false);
  assert.equal(security.passwordOK(nextPassword), true);
  assert.ok(await security.verifySession(visitor, "legacy"));
  assert.equal(
    (await login.POST(req("/api/login", { password: bootstrap }))).status,
    401,
  );
  assert.equal(
    (await login.POST(req("/api/login", { password: nextPassword }))).status,
    200,
  );
  const stored = dbModule
    .getDatabase()
    .prepare("SELECT value FROM settings WHERE key='admin_credential'")
    .get().value;
  assert.equal(stored.includes(nextPassword), false);
  assert.equal(stored.includes(bootstrap), false);
  const restarted = spawnSync(
    process.execPath,
    [
      "-e",
      "require('./tests/register.cjs');const c=require('./app/credentials.ts');console.log(c.checkPassword(process.env.TEST_PASSWORD));require('./app/runtime.ts').getDatabase().close()",
    ],
    { env: { ...process.env, TEST_PASSWORD: nextPassword }, encoding: "utf8" },
  );
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.equal(restarted.stdout.trim(), "true");
});
let branched;
test("Branching supports required follow-ups, chains and sanitizes hidden stale answers", async () => {
  branched = await create([
    q("gate", "Есть опыт?", "single", ["Да", "Нет"]),
    q("details", "Какой опыт?", "text", [], condition("gate", "Да")),
    q(
      "deep",
      "Уточните",
      "text",
      [],
      condition("details", "каталог", "contains"),
    ),
  ]);
  assert.deepEqual(
    branch
      .visibleQuestions(branched, { gate: "Нет", details: "каталог" })
      .map((q) => q.id),
    ["gate"],
  );
  assert.equal(model.validateAnswers(branched, { gate: "Нет" }, true), null);
  const no = await start(branched);
  assert.equal(
    (
      await answer(branched, no, {
        gate: "Нет",
        details: "Устаревший ответ",
        deep: "Скрытый ответ",
      })
    ).status,
    200,
  );
  assert.deepEqual(
    dbModule.getEntries(branched.id).find((r) => r.id === no.id).answers,
    { gate: "Нет" },
  );
  const yes = await start(branched);
  assert.equal((await answer(branched, yes, { gate: "Да" })).status, 400);
  assert.equal(
    (await answer(branched, yes, { gate: "Да", details: "КАТАЛОГ" })).status,
    400,
  );
  assert.equal(
    (
      await answer(branched, yes, {
        gate: "Да",
        details: "КАТАЛОГ",
        deep: "Подробности",
      })
    ).status,
    200,
  );
  const draft = await start(branched);
  assert.equal(
    (
      await answer(
        branched,
        draft,
        { gate: "Да", details: "каталог", deep: "Черновик" },
        "save",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await answer(
        branched,
        draft,
        { gate: "Нет", details: "каталог", deep: "Черновик" },
        "save",
      )
    ).status,
    200,
  );
  assert.deepEqual(
    dbModule.getEntries(branched.id).find((r) => r.id === draft.id).answers,
    { gate: "Нет" },
  );
});
test("Conditions support multiple choice, text, answered, not-equals and a matrix row", () => {
  const matrix = {
    ...q("matrix", "Матрица", "matrix", ["Да", "Нет"]),
    rows: ["Строка"],
  };
  const s = {
    ...branched,
    questions: [
      q("many", "Выбор", "multiple", ["A", "B"]),
      q("not", "Не выбран B", "text", [], condition("many", "B", "notEquals")),
      matrix,
      q("row", "После строки", "text", [], {
        ...condition("matrix", "Да"),
        row: "Строка",
      }),
      q("text", "Текст"),
      q("filled", "Заполнен", "text", [], condition("text", "", "answered")),
    ],
  };
  assert.ok(model.validateSurvey(s));
  assert.deepEqual(
    branch
      .visibleQuestions(s, { many: ["A"], matrix: { Строка: 0 }, text: "abc" })
      .map((q) => q.id),
    ["many", "not", "matrix", "row", "text", "filled"],
  );
  assert.deepEqual(
    branch.visibleQuestions(s, {}).map((q) => q.id),
    ["many", "matrix", "text"],
  );
});
test("Invalid cycles, forward references, removed parents and invalid options cannot be saved", async () => {
  for (const questions of [
    [q("a", "A", "text", [], condition("b", "X")), q("b", "B")],
    [q("a", "A", "text", [], condition("a", "X"))],
    [
      q("a", "A", "single", ["Да", "Нет"]),
      q("b", "B", "text", [], condition("a", "Другой")),
    ],
  ]) {
    assert.equal(model.validateSurvey({ ...branched, questions }), false);
    assert.equal(
      (
        await surveys.POST(
          req("/api/surveys", { survey: { ...branched, questions } }, true),
        )
      ).status,
      400,
    );
  }
});
let image, imageSurvey;
test("Image upload requires admin and rejects SVG and oversized files", async () => {
  const raw = (bytes, admin = true) =>
    new Request(process.env.PUBLIC_ORIGIN + "/api/images", {
      method: "POST",
      headers: {
        Origin: process.env.PUBLIC_ORIGIN,
        "Content-Type": "image/png",
        ...(admin ? { Cookie: cookie } : {}),
      },
      body: bytes,
    });
  assert.equal((await images.POST(raw(png, false))).status, 401);
  assert.equal(
    (await images.POST(raw(Buffer.from('<svg onload="alert(1)"></svg>'))))
      .status,
    400,
  );
  assert.equal(
    (await images.POST(raw(Buffer.alloc(4 * 1024 * 1024 + 1)))).status,
    413,
  );
  const uploaded = await images.POST(raw(png));
  assert.equal(uploaded.status, 201);
  image = (await uploaded.json()).image;
  const id = image.src.split("/").pop();
  assert.equal((await imageGet(id)).status, 404);
  const privateFile = await imageGet(id, true);
  assert.equal(privateFile.status, 200);
  assert.deepEqual(Buffer.from(await privateFile.arrayBuffer()), png);
});
test("Question image appears publicly only on an active survey and remains in historical versions", async () => {
  imageSurvey = await create([
    {
      ...q("pic", "Картинка"),
      image: { ...image, alt: "Описание <картинки>" },
    },
  ]);
  const id = image.src.split("/").pop();
  const publicFile = await imageGet(id);
  assert.equal(publicFile.status, 200);
  assert.equal(publicFile.headers.get("content-type"), "image/png");
  assert.equal(publicFile.headers.get("x-content-type-options"), "nosniff");
  const changed = await surveys.POST(
    req(
      "/api/surveys",
      { survey: { ...imageSurvey, questions: [q("pic", "Без картинки")] } },
      true,
    ),
  );
  assert.equal(changed.status, 200);
  imageSurvey = (await changed.json()).survey;
  assert.equal((await imageGet(id)).status, 404);
  assert.equal((await imageGet(id, true)).status, 200);
  assert.equal(
    dbModule.getSurveyVersion(imageSurvey.id, 1).questions[0].image.src,
    image.src,
  );
  const missing = await surveys.POST(
    req(
      "/api/surveys",
      {
        survey: {
          ...imageSurvey,
          questions: [
            {
              ...q("pic", "Missing"),
              image: { src: "/api/images/" + crypto.randomUUID(), alt: "" },
            },
          ],
        },
      },
      true,
    ),
  );
  assert.equal(missing.status, 400);
});
test("Portable JSON imports image bytes and branching into a fresh database", async () => {
  const id = image.src.split("/").pop(),
    bundled = await (await imageGet(id, true, "?format=json")).json();
  assert.equal(bundled.data, png.toString("base64"));
  const definition = {
    ...branched,
    id: crypto.randomUUID(),
    questions: branched.questions.map((q, i) =>
      i === 0 ? { ...q, image } : q,
    ),
  };
  const file = join(directory, "portable.json");
  writeFileSync(
    file,
    JSON.stringify({
      version: 2,
      survey: definition,
      rows: [],
      images: [bundled],
    }),
  );
  const fresh = join(directory, "fresh.sqlite");
  const env = { ...process.env, DATABASE_PATH: fresh };
  const init = spawnSync(
    process.execPath,
    [
      "-e",
      "require('./tests/register.cjs');require('./app/runtime.ts').getDatabase().close()",
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(init.status, 0, init.stderr);
  const imported = spawnSync(
    process.execPath,
    ["scripts/import-responses.mjs", file],
    { env, encoding: "utf8" },
  );
  assert.equal(imported.status, 0, imported.stderr);
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(fresh);
  assert.deepEqual(
    Buffer.from(db.prepare("SELECT data FROM images WHERE id=?").get(id).data),
    png,
  );
  assert.ok(
    JSON.parse(
      db.prepare("SELECT definition FROM surveys WHERE id=?").get(definition.id)
        .definition,
    ).questions[1].showWhen,
  );
  db.close();
});
test("Public list supports zero or multiple active surveys and never lists inactive ones", async () => {
  const db = dbModule.getDatabase();
  for (const row of db.prepare("SELECT definition FROM surveys").all()) {
    const s = JSON.parse(row.definition);
    await surveys.POST(
      req("/api/surveys", { survey: { ...s, status: "draft" } }, true),
    );
  }
  const empty = await (await surveys.GET(req("/api/surveys?public=1"))).json();
  assert.equal(empty.surveys.length, 0);
  const a = await create([q("a", "Первый")]),
    b = await create([q("b", "Второй")]);
  const list = await (await surveys.GET(req("/api/surveys?public=1"))).json();
  assert.deepEqual(
    new Set(list.surveys.map((s) => s.id)),
    new Set([a.id, b.id]),
  );
  for (const s of [a, b])
    assert.equal(
      (
        await (
          await surveys.GET(req("/api/surveys?public=1&id=" + s.id))
        ).json()
      ).survey.id,
      s.id,
    );
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    { SurveyChooser } = require("../app/survey-list.tsx");
  assert.match(
    renderToStaticMarkup(React.createElement(SurveyChooser, { surveys: [] })),
    /нет активных опросов/,
  );
  const html = renderToStaticMarkup(
    React.createElement(SurveyChooser, { surveys: list.surveys }),
  );
  assert.ok(html.includes("/?survey=" + a.id));
  assert.ok(html.includes("/?survey=" + b.id));
});
test("Image and condition controls render; image descriptions are escaped", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    Editor = require("../app/results/editor.tsx").default,
    { QuestionImage } = require("../app/question-input.tsx");
  const html = renderToStaticMarkup(
    React.createElement(Editor, {
      initial: branched,
      onSave: async () => {},
      onCancel: () => {},
    }),
  );
  assert.match(html, /Условие показа/);
  assert.match(html, /type="file"/);
  const rendered = renderToStaticMarkup(
    React.createElement(QuestionImage, {
      question: {
        ...q("p", "Pic"),
        image: { ...image, alt: "<script>alert(1)</script>" },
      },
    }),
  );
  assert.doesNotMatch(rendered, /<script>/);
  assert.match(rendered, /&lt;script&gt;/);
});
test("Old signed visitor sessions are upgraded without storing the bootstrap password in the database", async () => {
  const id = crypto.randomUUID();
  const signature = require("node:crypto")
    .createHmac("sha256", "survey-session-v2:" + bootstrap)
    .update(id + ":legacy")
    .digest("hex");
  const response = await session.POST(
    req("/api/session", {
      action: "start",
      surveyId: "legacy",
      sessionToken: id + "." + signature,
    }),
  );
  // The original survey was made inactive in the list test; reactivate it before checking its old token.
  if (response.status === 410) {
    const old = dbModule.getSurvey("legacy");
    await surveys.POST(
      req("/api/surveys", { survey: { ...old, status: "active" } }, true),
    );
  }
  const reopened = await session.POST(
    req("/api/session", {
      action: "start",
      surveyId: "legacy",
      sessionToken: id + "." + signature,
    }),
  );
  assert.equal(reopened.status, 200);
  const data = await reopened.json();
  assert.equal(data.id, id);
  assert.notEqual(data.sessionToken, id + "." + signature);
  assert.ok(await security.verifySession(data.sessionToken, "legacy"));
  for (const row of dbModule
    .getDatabase()
    .prepare("SELECT value FROM settings")
    .all()) {
    assert.equal(row.value.includes(bootstrap), false);
    assert.equal(row.value.includes(nextPassword), false);
  }
});
test("Branch statistics exclude hidden questions from denominators", () => {
  const { summaryTable } = require("../app/statistics.ts");
  const records = [
    { id: "1", answers: { gate: "Нет" } },
    { id: "2", answers: { gate: "Да", details: "Другой опыт" } },
  ];
  const table = summaryTable(branched, records);
  const detail = table.find((row) => row[0] === "Какой опыт?");
  assert.equal(detail[2], "1");
  assert.equal(detail[3], "1");
  const deep = table.find((row) => row[0] === "Уточните");
  assert.equal(deep[3], "0");
});
test("SQLite backup includes question images and credential settings", () => {
  const file = join(directory, "image-backup.sqlite");
  const result = spawnSync(process.execPath, ["scripts/backup.mjs", file], {
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const { DatabaseSync } = require("node:sqlite");
  const backup = new DatabaseSync(file, { readOnly: true });
  assert.deepEqual(
    Buffer.from(
      backup
        .prepare("SELECT data FROM images WHERE id=?")
        .get(image.src.split("/").pop()).data,
    ),
    png,
  );
  assert.ok(
    backup
      .prepare("SELECT value FROM settings WHERE key='admin_credential'")
      .get(),
  );
  backup.close();
});
test("Welcome block stores custom text and images without changing question version, keeps assets private and imports them", async () => {
  cookie = "survey_admin=" + security.createAdminSession();
  const uploaded = await images.POST(
    new Request(process.env.PUBLIC_ORIGIN + "/api/images", {
      method: "POST",
      headers: {
        Origin: process.env.PUBLIC_ORIGIN,
        Cookie: cookie,
        "Content-Type": "image/png",
      },
      body: png,
    }),
  );
  assert.equal(uploaded.status, 201);
  const asset = (await uploaded.json()).image;
  assert.equal((await imageGet(asset.src.split("/").pop())).status, 404);
  const base = await create([q("answer", "Ваш ответ")]);
  const welcome = {
    heading: "Привет, команда!",
    description: "Цель\nопроса",
    eyebrow: "Начнём",
    footer: "Спасибо",
    symbol: "★",
    showFooter: true,
    showStripe: false,
    align: "center",
    textColor: "#112233",
    titleSize: 52,
    imagePosition: "top",
    imageFit: "cover",
    images: [{ ...asset, alt: "Наша команда" }],
  };
  const response = await surveys.POST(
    req("/api/surveys", { survey: { ...base, welcome } }, true),
  );
  assert.equal(response.status, 200);
  const saved = (await response.json()).survey;
  assert.deepEqual(saved.welcome, welcome);
  assert.equal(saved.schemaVersion, base.schemaVersion);
  assert.equal(saved.revision, base.revision + 1);
  assert.equal((await imageGet(asset.src.split("/").pop())).status, 200);
  const publicSurvey = await surveys.GET(
    req("/api/surveys?public=1&id=" + saved.id),
  );
  assert.deepEqual((await publicSurvey.json()).survey.welcome, welcome);
  const {
    surveyImageSources,
    validWelcome,
  } = require("../scripts/welcome.mjs");
  assert.deepEqual(surveyImageSources(saved), [asset.src]);
  for (const invalid of [
    { titleSize: 100 },
    { align: "right" },
    { textColor: "red" },
    { images: [{ src: "https://bad.test/img", alt: "" }] },
    { images: Array(5).fill(asset) },
  ]) {
    assert.equal(validWelcome(invalid), false);
    assert.equal(model.validateSurvey({ ...saved, welcome: invalid }), false);
  }
  const unknown = await surveys.POST(
    req(
      "/api/surveys",
      {
        survey: {
          ...saved,
          welcome: {
            images: [{ src: "/api/images/" + crypto.randomUUID(), alt: "" }],
          },
        },
      },
      true,
    ),
  );
  assert.equal(unknown.status, 400);
  const file = join(directory, "welcome-import.json");
  const portable = {
    version: 2,
    survey: { ...saved, id: crypto.randomUUID() },
    rows: [],
    images: [
      {
        id: asset.src.split("/").pop(),
        mime: "image/png",
        data: png.toString("base64"),
      },
    ],
  };
  writeFileSync(file, JSON.stringify(portable));
  const imported = spawnSync(
    process.execPath,
    ["scripts/import-responses.mjs", file],
    { encoding: "utf8" },
  );
  assert.equal(imported.status, 0, imported.stderr);
  assert.deepEqual(dbModule.getSurvey(portable.survey.id).welcome, welcome);
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    { WelcomeBlock } = require("../app/welcome-block.tsx");
  const html = renderToStaticMarkup(
    React.createElement(WelcomeBlock, { survey: saved }),
  );
  assert.match(html, /Привет, команда!/);
  assert.match(html, /Наша команда/);
  assert.match(html, /welcome-no-stripe/);
  assert.match(html, /text-align:center/);
  assert.match(html, /object-fit:cover/);
  const hidden = renderToStaticMarkup(
    React.createElement(WelcomeBlock, {
      survey: {
        ...saved,
        welcome: { heading: "<script>", showFooter: false, images: [] },
      },
    }),
  );
  assert.match(hidden, /&lt;script&gt;/);
  assert.doesNotMatch(hidden, /aside-bottom/);
  const archived = await surveys.POST(
    req("/api/surveys", { survey: { ...saved, status: "archived" } }, true),
  );
  assert.equal(archived.status, 200);
  // The imported survey also references this file, so close it before checking privacy.
  const copy = dbModule.getSurvey(portable.survey.id);
  assert.equal(
    (
      await surveys.POST(
        req("/api/surveys", { survey: { ...copy, status: "draft" } }, true),
      )
    ).status,
    200,
  );
  assert.equal((await imageGet(asset.src.split("/").pop())).status, 404);
  assert.equal((await imageGet(asset.src.split("/").pop(), true)).status, 200);
});

test("Environment password recovery revokes admins and keeps signed visitor sessions", async () => {
  const visitor = await security.signSession(crypto.randomUUID(), "legacy"),
    old = cookie;
  process.env.ADMIN_PASSWORD = "environment-recovery-test-password";
  try {
    assert.equal(security.passwordOK(process.env.ADMIN_PASSWORD), true);
    assert.equal(security.passwordOK(nextPassword), false);
    assert.equal(
      await security.isAdmin(
        new Request(process.env.PUBLIC_ORIGIN, { headers: { Cookie: old } }),
      ),
      false,
    );
    assert.ok(await security.verifySession(visitor, "legacy"));
  } finally {
    process.env.ADMIN_PASSWORD = bootstrap;
  }
});
