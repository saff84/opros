require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { legacySurvey } = require("../app/survey-model.ts");
const { responseTable, workbook } = require("../app/exports.ts");
const {
  otherResponses,
  otherResponseTable,
} = require("../app/other-responses.ts");
const { reportDocument, participantDocument } = require("../app/pdf-report.ts");
const q = {
  id: "choice",
  title: "Что улучшить?",
  description: "",
  type: "multiple",
  required: false,
  options: ["Материалы", "Другое"],
  rows: [],
  maxChoices: 2,
  exclusive: [],
  otherOption: "Другое",
};
const survey = { ...legacySurvey, questions: [q] };
const row = {
  id: "participant-1",
  name: "Иван Иванов",
  department: "Продажи",
  region: "Москва",
  status: "completed",
  created: "2026-10-16",
  updated: "2026-10-16",
  answers: { choice: ["Материалы", "Другое"], choice__other: "Нужны образцы" },
};
test("Excel separates Other details and participant metadata; unselected details excluded", () => {
  const table = responseTable(survey, [row]);
  const i = table[0].findIndex((x) => x.includes("уточнение"));
  assert.ok(i >= 0);
  assert.equal(table[1][i], "Нужны образцы");
  assert.deepEqual(otherResponseTable(survey, [row])[1], [
    "Что улучшить?",
    "Другое",
    "Нужны образцы",
    "participant-1",
    "Иван Иванов",
    "Продажи",
    "Москва",
    "completed",
  ]);
  assert.equal(
    otherResponses(survey, q, [
      { ...row, answers: { ...row.answers, choice: ["Материалы"] } },
    ]).length,
    0,
  );
  const bytes = Buffer.from(workbook(survey, [row]));
  assert.ok(bytes.includes(Buffer.from("Уточнения Другое")));
  assert.ok(bytes.includes(Buffer.from("Нужны образцы")));
});
test("summary PDF and individual PDF retain Other text and participant identity", () => {
  const summary = JSON.stringify(reportDocument(survey, [row]));
  assert.ok(summary.includes("Нужны образцы"));
  assert.ok(summary.includes("Иван Иванов"));
  const individual = JSON.stringify(participantDocument(survey, row));
  for (const text of [
    "Нужны образцы",
    "Иван Иванов",
    "Продажи",
    "Москва",
    "Материалы",
  ])
    assert.ok(individual.includes(text), text);
});
