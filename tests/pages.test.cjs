require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  groupQuestionPages,
  visiblePages,
  pageAnswerError,
} = require("../app/survey-pages.ts");
const {
  legacySurvey,
  validateSurvey,
  emptyAnswers,
} = require("../app/survey-model.ts");
const q = (id, patch = {}) => ({
  id,
  title: id,
  description: "",
  type: "text",
  required: true,
  options: [],
  rows: [],
  exclusive: [],
  maxChoices: 3,
  ...patch,
});
const survey = (questions) => ({ ...legacySurvey, id: "pages", questions });
test("Old surveys keep one question per page; consecutive questions can be grouped", () => {
  assert.equal(
    groupQuestionPages(legacySurvey.questions).length,
    legacySurvey.questions.length,
  );
  const pages = groupQuestionPages([
    q("a"),
    q("b", { startNewPage: false }),
    q("c", { startNewPage: false }),
    q("d"),
    q("e", { startNewPage: false }),
  ]);
  assert.deepEqual(
    pages.map((p) => p.questions.map((q) => q.id)),
    [
      ["a", "b", "c"],
      ["d", "e"],
    ],
  );
  assert.equal(
    groupQuestionPages([q("first", { startNewPage: false })]).length,
    1,
  );
  assert.equal(
    validateSurvey(survey([q("a", { startNewPage: "same" })])),
    false,
  );
});
test("Hidden page boundaries remain stable and empty pages are skipped; conditions react within a page", () => {
  const rule = { questionId: "gate", operator: "equals", value: "Yes" };
  const s = survey([
    q("gate", { type: "single", options: ["Yes", "No"] }),
    q("conditional", { showWhen: rule }),
    q("always", { startNewPage: false }),
    q("last", { showWhen: rule }),
  ]);
  assert.deepEqual(
    visiblePages(s, { gate: "No" }).map((p) => ({
      id: p.id,
      qs: p.questions.map((q) => q.id),
    })),
    [
      { id: "gate", qs: ["gate"] },
      { id: "conditional", qs: ["always"] },
    ],
  );
  assert.equal(visiblePages(s, { gate: "Yes" }).length, 3);
  const same = survey([
    s.questions[0],
    q("details", { startNewPage: false, showWhen: rule }),
  ]);
  assert.equal(visiblePages(same, { gate: "No" })[0].questions.length, 1);
  assert.equal(visiblePages(same, { gate: "Yes" })[0].questions.length, 2);
});
test("Next requires every visible mandatory answer on the current page, but never future or hidden questions", () => {
  const s = survey([
    q("gate", { type: "single", options: ["Yes", "No"] }),
    q("details", {
      startNewPage: false,
      showWhen: { questionId: "gate", operator: "equals", value: "Yes" },
    }),
    q("future"),
  ]);
  let answers = { ...emptyAnswers(s), gate: "Yes" };
  assert.match(
    pageAnswerError(s, visiblePages(s, answers)[0], answers),
    /details/,
  );
  answers.details = "Done";
  assert.equal(pageAnswerError(s, visiblePages(s, answers)[0], answers), null);
  answers.gate = "No";
  answers.details = "";
  assert.equal(pageAnswerError(s, visiblePages(s, answers)[0], answers), null);
  const range = survey([
    q("choices", { type: "multiple", options: ["A", "B", "C"], minChoices: 2 }),
    q("rating", {
      type: "matrix",
      options: ["Good", "Bad"],
      rows: ["Item"],
      startNewPage: false,
    }),
  ]);
  assert.match(
    pageAnswerError(range, visiblePages(range, {})[0], { choices: ["A"] }),
    /не менее 2/,
  );
  assert.notEqual(
    pageAnswerError(range, visiblePages(range, {})[0], { choices: ["A", "B"] }),
    null,
  );
  assert.equal(
    pageAnswerError(range, visiblePages(range, {})[0], {
      choices: ["A", "B"],
      rating: { Item: 0 },
    }),
    null,
  );
});
