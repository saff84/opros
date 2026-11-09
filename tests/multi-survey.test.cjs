require("./register.cjs");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const directory = mkdtempSync(join(tmpdir(), "sanext-multi-"));
process.env.DATABASE_PATH = join(directory, "test.sqlite");
process.env.ADMIN_PASSWORD = "multi-survey-test-owner-password";
process.env.PUBLIC_ORIGIN = "https://multi.test";
const runtime = require("../app/runtime.ts");
const security = require("../app/security.ts");
const { legacySurvey } = require("../app/survey-model.ts");
const surveys = require("../app/api/surveys/route.ts");
const sessions = require("../app/api/session/route.ts");
const results = require("../app/api/results/route.ts");
const owner = "survey_admin=" + security.createAdminSession();
function req(path, body, admin = false) {
  return new Request(process.env.PUBLIC_ORIGIN + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Origin: process.env.PUBLIC_ORIGIN, "Content-Type": "application/json", ...(admin ? { Cookie: owner } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function ok(response, status = 200) {
  const r = await response;
  const data = await r.json();
  assert.equal(r.status, status, JSON.stringify(data));
  return data;
}
after(() => {
  runtime.getDatabase().close();
  assert.ok(directory.startsWith(join(tmpdir(), "sanext-multi-")));
  rmSync(directory, { recursive: true, force: true });
});
for (const count of [2, 3, 4]) {
  test(`${count} active surveys: concurrent sessions, answers, links, reports and independent closure`, async () => {
    const active = await Promise.all(Array.from({ length: count }, async (_, i) => {
      const data = await ok(surveys.POST(req("/api/surveys", {
        create: true,
        survey: { ...legacySurvey, id: "", title: `Batch ${count}, survey ${i}`, status: "active",
          questions: [{ id: "shared-question-id", title: "Ответ", description: "", type: "text", required: true, options: [], rows: [], maxChoices: 1, exclusive: [] }] },
      }, true)));
      return data.survey;
    }));
    assert.equal(new Set(active.map(s => s.id)).size, count);
    const list = await ok(surveys.GET(req("/api/surveys?public=1")));
    for (const s of active) {
      assert.ok(list.surveys.some(item => item.id === s.id));
      const linked = await ok(surveys.GET(req(`/api/surveys?public=1&id=${s.id}`)));
      assert.equal(linked.survey.title, s.title);
    }
    const visitors = await Promise.all(active.flatMap((s, index) => Array.from({ length: 12 }, async (_, n) => {
      const visitor = await ok(sessions.POST(req("/api/session", { action: "start", surveyId: s.id, source: `source-${index}`, campaign: `batch-${count}` })));
      return { s, visitor, answer: `${s.id}: participant ${n}` };
    })));
    assert.equal(new Set(visitors.map(v => v.visitor.id)).size, count * 12);
    const first = visitors[0];
    await ok(sessions.POST(req("/api/session", { action: "start", surveyId: active[1].id, sessionToken: first.visitor.sessionToken })), 403);
    for (const action of ["save", "submit"]) {
      await Promise.all(visitors.map(({ s, visitor, answer }) => ok(sessions.POST(req("/api/session", {
        action, surveyId: s.id, sessionToken: visitor.sessionToken, revision: s.revision,
        name: "Участник", answers: { "shared-question-id": answer },
      })))));
    }
    for (const s of active) {
      const report = await ok(results.GET(req(`/api/results?survey=${s.id}`, undefined, true)));
      assert.equal(report.rows.length, 12);
      assert.ok(report.rows.every(row => row.survey_id === s.id && row.status === "completed" && row.answers["shared-question-id"].startsWith(s.id + ":")));
      for (const { visitor } of visitors.filter(v => v.s.id === s.id)) {
        const resumed = await ok(sessions.POST(req("/api/session", { action: "start", surveyId: s.id, sessionToken: visitor.sessionToken })));
        assert.equal(resumed.id, visitor.id);
        assert.equal(resumed.status, "completed");
      }
    }
    await ok(surveys.POST(req("/api/surveys", { survey: { ...active[0], status: "archived" } }, true)));
    await ok(surveys.GET(req(`/api/surveys?public=1&id=${active[0].id}`)), 404);
    await ok(sessions.POST(req("/api/session", { action: "start", surveyId: active[0].id })), 410);
    for (const s of active.slice(1)) {
      await ok(surveys.GET(req(`/api/surveys?public=1&id=${s.id}`)));
      await ok(sessions.POST(req("/api/session", { action: "start", surveyId: s.id })));
    }
    await ok(surveys.GET(req("/api/surveys?public=1&id=missing-survey")), 404);
  });
}
