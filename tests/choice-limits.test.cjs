require("./register.cjs");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const directory = mkdtempSync(join(tmpdir(), "sanext-limits-"));
process.env.DATABASE_PATH = join(directory, "test.sqlite");
process.env.ADMIN_PASSWORD = "choice-limits-test-password";
process.env.PUBLIC_ORIGIN = "https://limits.test";
const model = require("../app/survey-model.ts");
const runtime = require("../app/runtime.ts");
const security = require("../app/security.ts");
const api = require("../app/api/surveys/route.ts");
const session = require("../app/api/session/route.ts");
const question = {
  id: "choices",
  title: "Выберите причины",
  description: "",
  type: "multiple",
  required: true,
  options: ["A", "B", "C", "D", "Нет"],
  rows: [],
  exclusive: ["Нет"],
  minChoices: 2,
  maxChoices: 3,
};
const definition = { ...model.legacySurvey, id: "", questions: [question] };
after(() => {
  runtime.getDatabase().close();
  rmSync(directory, { recursive: true, force: true });
});
function req(path, body, cookie = "") {
  return new Request(process.env.PUBLIC_ORIGIN + path, {
    method: "POST",
    headers: {
      Origin: process.env.PUBLIC_ORIGIN,
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}
test("Multiple choice enforces minimum only on submission, maximum on drafts too, and permits exclusive choice", () => {
  for (const selected of [["A", "B"], ["A", "B", "C"], ["Нет"]])
    assert.equal(
      model.validateAnswers(definition, { choices: selected }, true),
      null,
    );
  assert.match(
    model.validateAnswers(definition, { choices: ["A"] }, true),
    /не менее 2/,
  );
  assert.equal(
    model.validateAnswers(definition, { choices: ["A"] }, false),
    null,
  );
  assert.notEqual(
    model.validateAnswers(definition, { choices: ["A", "B", "C", "D"] }, false),
    null,
  );
  const optional = {
    ...definition,
    questions: [{ ...question, required: false }],
  };
  assert.equal(model.validateAnswers(optional, { choices: [] }, true), null);
  assert.notEqual(
    model.validateAnswers(optional, { choices: ["A"] }, true),
    null,
  );
  const exact = { ...definition, questions: [{ ...question, maxChoices: 2 }] };
  assert.equal(
    model.validateAnswers(exact, { choices: ["A", "B"] }, true),
    null,
  );
  assert.notEqual(
    model.validateAnswers(exact, { choices: ["A", "B", "C"] }, true),
    null,
  );
});
test("Limits reject fractions, negative values, minimum above maximum or available non-exclusive options; old surveys remain valid", () => {
  for (const minChoices of [-1, 1.5, 4, NaN])
    assert.equal(
      model.validateSurvey({
        ...definition,
        questions: [{ ...question, minChoices }],
      }),
      false,
    );
  assert.equal(
    model.validateSurvey({
      ...definition,
      questions: [{ ...question, minChoices: 5, maxChoices: 6 }],
    }),
    false,
  );
  const { minChoices, ...oldQuestion } = question;
  assert.equal(
    model.validateSurvey({ ...definition, questions: [oldQuestion] }),
    true,
  );
  assert.equal(
    model.validateAnswers(
      { ...definition, questions: [oldQuestion] },
      { choices: ["A"] },
      true,
    ),
    null,
  );
});
test("API stores limits, rejects too few answers, accepts drafts and exports/imports limits", async () => {
  const cookie = "survey_admin=" + security.createAdminSession();
  const created = await api.POST(
    req("/api/surveys", { create: true, survey: definition }, cookie),
  );
  assert.equal(created.status, 200);
  const survey = (await created.json()).survey;
  assert.equal(runtime.getSurvey(survey.id).questions[0].minChoices, 2);
  const visitor = await (
    await session.POST(
      req("/api/session", { surveyId: survey.id, action: "start" }),
    )
  ).json();
  const payload = {
    surveyId: survey.id,
    revision: survey.revision,
    sessionToken: visitor.sessionToken,
    name: "",
    answers: { choices: ["A"] },
  };
  assert.equal(
    (await session.POST(req("/api/session", { ...payload, action: "save" })))
      .status,
    200,
  );
  assert.equal(
    (await session.POST(req("/api/session", { ...payload, action: "submit" })))
      .status,
    400,
  );
  payload.answers.choices = ["A", "B"];
  assert.equal(
    (await session.POST(req("/api/session", { ...payload, action: "submit" })))
      .status,
    200,
  );
  const rows = runtime.getEntries(survey.id);
  const path = join(directory, "import.json");
  const portable = {
    version: 2,
    survey: { ...survey, id: crypto.randomUUID() },
    rows: rows.map((r) => ({ ...r, id: crypto.randomUUID() })),
  };
  portable.rows.forEach((r) => (r.survey_id = portable.survey.id));
  writeFileSync(path, JSON.stringify(portable));
  const imported = spawnSync(
    process.execPath,
    ["scripts/import-responses.mjs", path],
    { encoding: "utf8" },
  );
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(
    runtime.getSurvey(portable.survey.id).questions[0].minChoices,
    2,
  );
  portable.rows[0].answers.choices = ["A"];
  writeFileSync(path, JSON.stringify(portable));
  const invalid = spawnSync(
    process.execPath,
    ["scripts/import-responses.mjs", path],
    { encoding: "utf8" },
  );
  assert.notEqual(invalid.status, 0);
});
test("Question displays range, exact count, selected count and maximum reached hint", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { QuestionInput } = require("../app/question-input.tsx");
  const render = (q, value) =>
    renderToStaticMarkup(
      React.createElement(QuestionInput, {
        question: q,
        value,
        onChange: () => {},
      }),
    );
  assert.match(render(question, ["A"]), /от 2 до 3/);
  assert.match(render({ ...question, maxChoices: 2 }, ["A", "B"]), /ровно 2/);
  assert.match(render(question, ["A", "B", "C"]), /Лимит достигнут/);
  assert.match(render(question, ["A"]), /Выбрано: 1 из 3/);
  const Editor = require("../app/results/editor.tsx").default;
  const editor = renderToStaticMarkup(
    React.createElement(Editor, {
      initial: definition,
      onSave: async () => {},
      onCancel: () => {},
    }),
  );
  assert.match(editor, /Минимум вариантов/);
  assert.match(editor, /Максимум вариантов/);
  assert.equal((editor.match(/<details\b/g) || []).length, 3);
  assert.ok(
    editor.indexOf("Формулировка") < editor.indexOf("Картинка к вопросу"),
  );
  assert.match(editor, /У первого вопроса нет предыдущих ответов/);
  assert.match(editor, /только если выше выбрано/);
});

test("At maximum every unselected option including exclusive is disabled; deselecting frees all options", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { QuestionInput } = require("../app/question-input.tsx");
  const buttons = (value, q = question) => {
    const html = renderToStaticMarkup(
      React.createElement(QuestionInput, {
        question: q,
        value,
        onChange: () => {},
      }),
    );
    return [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].map(
      ([, attributes, body]) => ({
        disabled: attributes.includes('disabled=""'),
        selected: attributes.includes('aria-pressed="true"'),
        body,
      }),
    );
  };
  const full = buttons(["A", "B", "C"]);
  assert.equal(
    full.filter((b) => b.selected).every((b) => !b.disabled),
    true,
  );
  assert.equal(
    full.filter((b) => !b.selected).every((b) => b.disabled),
    true,
  );
  assert.equal(
    buttons(["A", "B"]).every((b) => !b.disabled),
    true,
  );
  const exclusiveAtOne = buttons(["Нет"], {
    ...question,
    minChoices: 0,
    maxChoices: 1,
  });
  assert.equal(
    exclusiveAtOne.filter((b) => !b.selected).every((b) => b.disabled),
    true,
  );
});
