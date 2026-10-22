require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { importQuestions } = require("../app/question-import.ts");
const { validateSurvey, validateAnswers } = require("../app/survey-model.ts");
const example = JSON.parse(readFileSync(require.resolve("../public/templates/questions-example.json"), "utf8"));
const parse = value => importQuestions(JSON.stringify(value));

test("example imports all nine types into a fresh valid draft without images", () => {
  const s = parse(example);
  assert.equal(validateSurvey(s), true);
  assert.equal(new Set(s.questions.map(q => q.type)).size, 9);
  assert.equal(s.id, "");
  assert.equal(s.status, "draft");
  assert.equal(s.revision, 0);
  assert.equal(s.questions[1].startNewPage, false);
  assert.equal(s.questions.find(q => q.type === "nps").options.length, 11);
  assert.equal(s.questions.find(q => q.type === "rating").options.length, 10);
  assert.equal(s.questions.find(q => q.type === "stars").options.length, 5);
});

test("imported questions retain answer validation, exclusive choices and other clarification", () => {
  const s = parse(example);
  s.questions = [s.questions.find(q => q.id === "priorities")];
  assert.match(validateAnswers(s, { priorities: ["Качество"] }, true), /не менее/);
  assert.equal(validateAnswers(s, { priorities: ["Ничего"] }, true), null);
  assert.match(validateAnswers(s, { priorities: ["Качество", "Другое"] }, true), /Уточните/);
  assert.equal(validateAnswers(s, { priorities: ["Качество", "Другое"], priorities__other: "Обучение" }, true), null);
});

test("invalid files fail before creating a survey", () => {
  assert.throws(() => importQuestions("{"), /JSON/);
  assert.throws(() => importQuestions(" ".repeat(90001)), /90 КБ/);
  assert.throws(() => parse({ ...example, version: 2 }), /версии 1/);
  assert.throws(() => parse({ ...example, questions: [] }), /1 до 60/);
  for (const patch of [
    { type: "unknown" }, { required: "yes" }, { options: ["A", "A"] },
    { minChoices: 4, maxChoices: 2, type: "multiple" },
    { image: { src: "/api/images/abc", alt: "" } },
    { showWhen: null },
  ]) {
    const value = structuredClone(example);
    Object.assign(value.questions[0], patch);
    assert.throws(() => parse(value), /Вопрос 1/);
  }
});

test("rejects duplicate IDs, forward conditions and other-key collisions", () => {
  const duplicate = structuredClone(example);
  duplicate.questions[1].id = duplicate.questions[0].id;
  assert.throws(() => parse(duplicate), /повторяется id/);
  const forward = structuredClone(example);
  forward.questions[1].showWhen.questionId = "nps";
  assert.throws(() => parse(forward), /вопрос выше/);
  const collision = structuredClone(example);
  collision.questions[1].id = "experience__other";
  assert.throws(() => parse(collision), /__other/);
});

test("accepts UTF-8 BOM and rejects unknown fields rather than losing settings", () => {
  assert.equal(importQuestions("\uFEFF" + JSON.stringify(example)).title, example.title);
  assert.throws(() => parse({ ...example, rows: [] }), /Неизвестные поля/);
  const bad = structuredClone(example);
  bad.questions[0].maxChoice = 2;
  assert.throws(() => parse(bad), /maxChoice/);
});
