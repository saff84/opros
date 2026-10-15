require("./register.cjs");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const directory = mkdtempSync(join(tmpdir(), "sanext-start-"));
process.env.DATABASE_PATH = join(directory, "test.sqlite");
process.env.ADMIN_PASSWORD = "start-form-test-password";
process.env.PUBLIC_ORIGIN = "https://start.test";
const runtime = require("../app/runtime.ts"),
  security = require("../app/security.ts"),
  model = require("../app/survey-model.ts");
const surveys = require("../app/api/surveys/route.ts"),
  sessions = require("../app/api/session/route.ts");
const helpers = require("../scripts/start-form.mjs");
function request(body, admin = false) {
  return new Request("https://start.test/api/test", {
    method: "POST",
    headers: {
      Origin: "https://start.test",
      "Content-Type": "application/json",
      Cookie: admin ? "survey_admin=" + security.createAdminSession() : "",
    },
    body: JSON.stringify(body),
  });
}
test("start form defaults preserve optional fields and validate settings", () => {
  assert.equal(helpers.participantError({}, {}, true), null);
  assert.equal(helpers.startFormSettings({ title: "Title" }).heading, "Title");
  for (const config of [
    null,
    { fields: { other: {} } },
    { fields: { name: { mode: "bad" } } },
    { fields: { name: { label: " " } } },
    { buttonText: "" },
  ])
    assert.equal(helpers.validStartForm(config), false);
  assert.equal(
    helpers.validStartForm({
      fields: { name: { mode: "required" }, region: { mode: "hidden" } },
    }),
    true,
  );
});
test("required participant metadata enforced on server; hidden values discarded; cosmetic changes preserve history", async () => {
  let response = await surveys.POST(
    request(
      {
        create: true,
        survey: {
          ...model.legacySurvey,
          id: "",
          status: "active",
          questions: [
            {
              id: "text",
              title: "Text",
              description: "",
              type: "text",
              options: [],
              rows: [],
              required: false,
              maxChoices: 3,
              exclusive: [],
            },
          ],
          startForm: {
            fields: {
              name: { mode: "required", label: "Ваше имя" },
              department: { mode: "required" },
              region: { mode: "hidden" },
            },
          },
        },
      },
      true,
    ),
  );
  assert.equal(response.status, 200);
  const s = (await response.json()).survey;
  const visitor = await (
    await sessions.POST(request({ action: "start", surveyId: s.id }))
  ).json();
  const send = (action, extra = {}) =>
    sessions.POST(
      request({
        action,
        surveyId: s.id,
        sessionToken: visitor.sessionToken,
        revision: s.revision,
        name: "",
        answers: { text: "" },
        ...extra,
      }),
    );
  assert.equal((await send("save")).status, 200);
  assert.equal((await send("begin")).status, 400);
  response = await send("submit", { name: "   " });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Ваше имя/);
  assert.equal((await send("submit", { name: "User" })).status, 400);
  assert.equal(
    (
      await send("save", {
        name: " User ",
        department: " Sales ",
        region: "Hidden",
      })
    ).status,
    200,
  );
  assert.equal((await send("begin")).status, 200);
  assert.equal(
    (
      await send("submit", {
        name: " User ",
        department: " Sales ",
        region: "Hidden",
      })
    ).status,
    200,
  );
  const db = runtime.getDatabase();
  assert.equal(
    db.prepare("SELECT name FROM entries WHERE id=?").get(visitor.id).name,
    "User",
  );
  assert.deepEqual(
    {
      ...db
        .prepare("SELECT department,region FROM entry_context WHERE entry_id=?")
        .get(visitor.id),
    },
    { department: "Sales", region: "" },
  );
  response = await surveys.POST(
    request(
      {
        survey: {
          ...s,
          startForm: { fields: { region: { mode: "required" } } },
        },
      },
      true,
    ),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).survey.schemaVersion, s.schemaVersion);
  assert.equal(
    db.prepare("SELECT status FROM entries WHERE id=?").get(visitor.id).status,
    "completed",
  );
});
test("required context stays expanded and hidden fields absent in rendered start screen", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const Screen = require("../app/start-screen.tsx").default;
  const html = renderToStaticMarkup(
    React.createElement(Screen, {
      survey: {
        title: "Welcome",
        startForm: {
          fields: {
            name: { mode: "hidden" },
            department: { mode: "required" },
            region: { mode: "optional" },
          },
        },
      },
      values: { name: "", department: "", region: "" },
      onChange() {},
      onBegin() {},
    }),
  );
  assert.ok(!html.includes('name="name"'));
  assert.ok(html.includes('name="department"'));
  assert.ok(html.includes('aria-required="true"'));
  assert.ok(!html.includes("<details"));
  assert.ok(html.includes("Обязательное") || html.includes("обязательно"));
});
after(() => {
  runtime.getDatabase().close();
  rmSync(directory, { recursive: true, force: true });
});
