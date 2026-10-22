require("./register.cjs");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const directory = mkdtempSync(join(tmpdir(), "sanext-preview-"));
process.env.DATABASE_PATH = join(directory, "test.sqlite");
process.env.ADMIN_PASSWORD = "preview-test-administrator-password";
process.env.PUBLIC_ORIGIN = "https://preview.test";
const { getDatabase } = require("../app/runtime.ts");
const security = require("../app/security.ts");
const api = require("../app/api/preview/route.ts");
const surveys = require("../app/api/surveys/route.ts");
const imageApi = require("../app/api/images/[id]/route.ts");
const { previewSurvey, previewWithImages } = require("../app/preview-access.ts");
const { legacySurvey } = require("../app/survey-model.ts");
const cookie = "survey_admin=" + security.createAdminSession();
const db = getDatabase();
const imageId = "00000000-0000-4000-8000-000000000001";
const otherImageId = "00000000-0000-4000-8000-000000000002";
const survey = { ...legacySurvey, id: "preview-test", status: "draft", questions: [{
  id: "q", title: "Question", type: "text", required: false,
  description: "", options: [], rows: [], exclusive: [], maxChoices: 3,
  image: { src: "/api/images/" + imageId, alt: "Preview image" },
}] };
db.prepare("INSERT INTO surveys VALUES (?,?)").run(survey.id, JSON.stringify(survey));
for (const id of [imageId, otherImageId]) db.prepare("INSERT INTO images VALUES (?,?,?,?)").run(id, "image/png", Buffer.from("fake-image"), new Date().toISOString());
function req(method = "POST", body = { surveyId: survey.id }, auth = true, origin = process.env.PUBLIC_ORIGIN) {
  return new Request(process.env.PUBLIC_ORIGIN + "/api/preview", {
    method, headers: { Origin: origin, "Content-Type": "application/json", ...(auth ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}
const tokenOf = data => new URL(data.path, process.env.PUBLIC_ORIGIN).searchParams.get("token");
after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

test("preview link requires editor permission and matching origin", async () => {
  assert.equal((await api.POST(req("POST", undefined, false))).status, 403);
  assert.equal((await api.POST(req("POST", undefined, true, "https://foreign.test"))).status, 403);
  assert.equal((await api.POST(req("POST", { surveyId: "missing" }))).status, 404);
  // A read-only account cannot mint preview access.
  db.prepare("INSERT INTO team_users VALUES (?,?,?,?,?,1)").run("viewer-preview", "viewer-preview", "salt", "unused", "viewer");
  const viewerToken = "b".repeat(64);
  db.prepare("INSERT INTO team_sessions VALUES (?,?,?)").run(security.tokenHash(viewerToken), "viewer-preview", Date.now() + 60000);
  const viewer = req();
  viewer.headers.set("Cookie", "survey_admin=" + viewerToken);
  assert.equal((await api.POST(viewer)).status, 403);
});

test("draft preview exposes current definition and scoped images without creating responses or publication", async () => {
  const before = db.prepare("SELECT count(*) AS n FROM entries").get().n;
  const response = await api.POST(req());
  assert.equal(response.status, 200);
  const token = tokenOf(await response.json());
  assert.equal(previewSurvey(token).id, survey.id);
  assert.equal(previewSurvey(token).status, "draft");
  const image = id => imageApi.GET(new Request(process.env.PUBLIC_ORIGIN + "/api/images/" + id + "?preview=" + token), { params: Promise.resolve({ id }) });
  assert.equal((await image(imageId)).status, 200);
  assert.equal((await image(otherImageId)).status, 404);
  const bundled = previewWithImages(survey, token);
  assert.match(bundled.questions[0].image.src, /\?preview=/);
  assert.equal(survey.questions[0].image.src, "/api/images/" + imageId);
  assert.equal((await surveys.GET(new Request(process.env.PUBLIC_ORIGIN + "/api/surveys?public=1&id=" + survey.id))).status, 404);
  db.prepare("UPDATE surveys SET definition=? WHERE id=?").run(JSON.stringify({ ...survey, title: "Updated draft" }), survey.id);
  assert.equal(previewSurvey(token).title, "Updated draft");
  assert.equal(db.prepare("SELECT count(*) AS n FROM entries").get().n, before);
});

test("preview links rotate, expire and can be revoked", async () => {
  const first = tokenOf(await (await api.POST(req())).json());
  const second = tokenOf(await (await api.POST(req())).json());
  assert.equal(previewSurvey(first), null);
  assert.ok(previewSurvey(second));
  db.prepare("UPDATE survey_preview_links SET expires=0 WHERE survey_id=?").run(survey.id);
  assert.equal(previewSurvey(second), null);
  const third = tokenOf(await (await api.POST(req())).json());
  assert.ok(previewSurvey(third));
  assert.equal((await api.DELETE(req("DELETE"))).status, 200);
  assert.equal(previewSurvey(third), null);
  assert.equal(previewSurvey("invalid"), null);
});

test("scales fill cumulatively while only the actual answer is selected", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { QuestionInput } = require("../app/question-input.tsx");
  function render(type, options, value, disabled = false) {
    return renderToStaticMarkup(React.createElement(QuestionInput, {
      question: { ...survey.questions[0], type, options, image: undefined }, value, disabled, onChange() {},
    }));
  }
  const options = ["1", "2", "3", "4", "5"];
  for (const type of ["stars", "rating", "nps"]) {
    const values = type === "nps" ? ["0", ...options] : options;
    const html = render(type, values, "3");
    assert.equal((html.match(/scale-step filled/g) || []).length, type === "nps" ? 4 : 3);
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
    assert.equal((render(type, values, "").match(/scale-step filled/g) || []).length, 0);
    assert.equal((render(type, values, "1").match(/scale-step filled/g) || []).length, type === "nps" ? 2 : 1);
    if (type === "stars") assert.equal((html.match(/<svg/g) || []).length, 5);
    assert.equal((render(type, values, "3", true).match(/disabled=""/g) || []).length, values.length);
  }
  assert.equal((render("nps", ["0", "1", "2"], "0").match(/scale-step filled/g) || []).length, 1);
});
