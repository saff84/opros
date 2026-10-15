require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
test("Comparison matches semantic questions and applies independent cohorts", () => {
  const {
    compatibleQuestions,
    cohort,
  } = require("../app/results/comparison.tsx");
  const q = {
    id: "rating",
    title: "Оцените поддержку",
    type: "rating",
    options: Array.from({ length: 10 }, (_, i) => String(i + 1)),
  };
  assert.equal(compatibleQuestions(q, { ...q, id: "copy-id" }), true);
  assert.equal(
    compatibleQuestions(q, { ...q, title: "Оцените мероприятие" }),
    false,
  );
  assert.equal(compatibleQuestions(q, { ...q, options: ["1", "2"] }), false);
  const row = {
    id: "test",
    status: "completed",
    updated: "2026-10-15T12:00:00Z",
    department: "Продажи",
    region: "Москва",
    source: "email",
  };
  assert.equal(
    cohort([row], {
      from: "2026-10-01",
      to: "2026-10-31",
      department: "Продажи",
      region: "Москва",
      source: "email",
    }).length,
    1,
  );
  assert.equal(
    cohort([row], {
      from: "2026-10-16",
      to: "",
      department: "",
      region: "",
      source: "",
    }).length,
    0,
  );
});
