require("./register.cjs");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const directory = mkdtempSync(join(tmpdir(), "sanext-access-"));
process.env.DATABASE_PATH = join(directory, "test.sqlite");
process.env.ADMIN_PASSWORD = "access-test-owner-password";
process.env.PUBLIC_ORIGIN = "https://access.test";
const runtime = require("../app/runtime.ts");
const security = require("../app/security.ts");
const { legacySurvey, validateSurvey } = require("../app/survey-model.ts");
const surveys = require("../app/api/surveys/route.ts");
const sessions = require("../app/api/session/route.ts");
const results = require("../app/api/results/route.ts");
const team = require("../app/api/team/route.ts");
const login = require("../app/api/login/route.ts");
const preview = require("../app/api/preview/route.ts");
const images = require("../app/api/images/route.ts");
const image = require("../app/api/images/[id]/route.ts");
const templates = require("../app/api/templates/route.ts");
const owner = "survey_admin=" + security.createAdminSession();
function req(path, body, cookie = owner) {
  return new Request(process.env.PUBLIC_ORIGIN + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Origin: process.env.PUBLIC_ORIGIN, Cookie: cookie, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function ok(response, status = 200) {
  const r = await response;
  const data = await r.json();
  assert.equal(r.status, status, JSON.stringify(data));
  return data;
}
async function create(patch = {}, cookie = owner) {
  return (await ok(surveys.POST(req("/api/surveys", { create: true, survey: { ...legacySurvey, id: "", title: "Тест доступа", status: "active", ...patch } }, cookie)))).survey;
}
async function account(username, role, surveyIds = []) {
  await ok(team.POST(req("/api/team", { username, role, surveyIds, password: "participant-password-1234" })));
  const data = await login.POST(req("/api/login", { username, password: "participant-password-1234" }, ""));
  assert.equal(data.status, 200);
  return data.headers.get("set-cookie").split(";")[0];
}
async function upload(cookie = owner) {
  const data = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=", "base64");
  return (await ok(images.POST(new Request(process.env.PUBLIC_ORIGIN + "/api/images", { method: "POST", headers: { Origin: process.env.PUBLIC_ORIGIN, Cookie: cookie, "Content-Type": "image/png" }, body: data })), 201)).image;
}
function getImage(src, cookie = "", suffix = "") {
  return image.GET(req(src + suffix, undefined, cookie), { params: Promise.resolve({ id: src.split("/").pop() }) });
}
after(() => {
  runtime.getDatabase().close();
  assert.ok(directory.startsWith(join(tmpdir(), "sanext-access-")));
  rmSync(directory, { recursive: true, force: true });
});
test("Unlisted surveys hide from catalogue, keep direct links, sessions and public covers", async () => {
  const cover = { ...await upload(), fit: "contain", position: "top", alt: "Обложка" };
  const hidden = await create({ unlisted: true, cover });
  const visible = await create({ cover });
  const list = await ok(surveys.GET(req("/api/surveys?public=1", undefined, "")));
  assert.ok(!list.surveys.some(s => s.id === hidden.id));
  assert.deepEqual(list.surveys.find(s => s.id === visible.id).cover, cover);
  assert.equal((await ok(surveys.GET(req(`/api/surveys?public=1&id=${hidden.id}`, undefined, "")))).survey.id, hidden.id);
  await ok(sessions.POST(req("/api/session", { action: "start", surveyId: hidden.id }, "")));
  assert.equal((await getImage(cover.src)).status, 200);
  assert.equal((await getImage(cover.src, "", "?format=json")).status, 401);
  const updated = (await ok(surveys.POST(req("/api/surveys", { survey: { ...hidden, cover: { ...cover, fit: "cover" } } })))).survey;
  assert.equal(updated.schemaVersion, hidden.schemaVersion);
  assert.ok(updated.revision > hidden.revision);
  const draftCover = await upload();
  const draft = await create({ status: "draft", cover: draftCover });
  assert.equal((await getImage(draftCover.src)).status, 404);
  const link = await ok(preview.POST(req("/api/preview", { surveyId: draft.id })));
  const token = new URL("https://x" + link.path).searchParams.get("token");
  assert.equal((await getImage(draftCover.src, "", "?preview=" + token)).status, 200);
});
test("Server enforces per-survey roles and assigns editor-created surveys", async () => {
  const a = await create({ title: "Доступный" });
  const b = await create({ title: "Чужой черновик", status: "draft" });
  const editor = await account("assigned-editor", "editor", [a.id]);
  const viewer = await account("assigned-viewer", "viewer", [a.id]);
  const empty = await account("empty-viewer", "viewer");
  assert.equal((await login.GET(req("/api/login", undefined, empty))).status, 200);
  assert.deepEqual((await ok(surveys.GET(req("/api/surveys", undefined, empty)))).surveys, []);
  for (const cookie of [editor, viewer]) {
    assert.deepEqual((await ok(surveys.GET(req("/api/surveys", undefined, cookie)))).surveys.map(s => s.id), [a.id]);
    await ok(results.GET(req(`/api/results?survey=${a.id}`, undefined, cookie)));
    await ok(results.GET(req(`/api/results?survey=${b.id}`, undefined, cookie)), 403);
    await ok(surveys.GET(req(`/api/surveys?id=${b.id}`, undefined, cookie)), 403);
    await ok(surveys.POST(req("/api/surveys", { survey: b }, cookie)), 403);
    await ok(preview.POST(req("/api/preview", { surveyId: b.id }, cookie)), 403);
  }
  await ok(surveys.POST(req("/api/surveys", { survey: a }, viewer)), 403);
  await ok(surveys.POST(req("/api/surveys", { survey: { ...a, description: "Правка редактора" } }, editor)));
  const own = await create({ title: "Создан редактором" }, editor);
  assert.equal(await security.canAccessSurvey(req("/", undefined, editor), own.id), true);
  await ok(team.GET(req("/api/team", undefined, editor)), 403);
  const admin = await account("full-admin", "admin");
  await ok(results.GET(req(`/api/results?survey=${b.id}`, undefined, admin)));
  await ok(templates.POST(req("/api/templates", { survey: b }, editor)), 403);
  const user = (await ok(team.GET(req("/api/team")))).users.find(u => u.username === "assigned-editor");
  assert.deepEqual(new Set(user.surveyIds), new Set([a.id, own.id]));
  await ok(team.POST(req("/api/team", { ...user, active: true, surveyIds: ["missing-id"] })), 400);
  await ok(team.POST(req("/api/team", { ...user, active: true, surveyIds: [b.id, b.id] })));
  assert.equal((await login.GET(req("/api/login", undefined, editor))).status, 401);
  assert.deepEqual((await ok(team.GET(req("/api/team")))).users.find(u => u.id === user.id).surveyIds, [b.id]);
});
test("300 new sessions per survey; exhausted survey does not block others or resuming", async () => {
  const a = await create(), b = await create();
  const visitor = await ok(sessions.POST(req("/api/session", { action: "start", surveyId: a.id }, "")));
  runtime.getDatabase().prepare("UPDATE rate_limits SET count=300 WHERE key=?").run("new-session:" + a.id);
  await ok(sessions.POST(req("/api/session", { action: "start", surveyId: a.id }, "")), 429);
  await ok(sessions.POST(req("/api/session", { action: "start", surveyId: b.id }, "")));
  const resumed = await ok(sessions.POST(req("/api/session", { action: "start", surveyId: a.id, sessionToken: visitor.sessionToken }, "")));
  assert.equal(resumed.id, visitor.id);
});
test("Cover and visibility validation rejects unsafe input", () => {
  for (const patch of [{ unlisted: "yes" }, { cover: { src: "https://external.test/x.png", alt: "" } }, { cover: { src: "/api/images/00000000-0000-0000-0000-000000000000", alt: "", fit: "bad" } }]) {
    assert.equal(validateSurvey({ ...legacySurvey, ...patch }), false);
  }
});
test("Assigned editors can use uploaded and historical images but cannot read or copy another draft image", async () => {
  const privateCover = await upload();
  const assignedCover = await upload();
  const assigned = await create({ status: "draft", cover: assignedCover });
  await create({ status: "draft", cover: privateCover });
  const editor = await account("image-editor", "editor", [assigned.id]);
  assert.equal((await getImage(privateCover.src, editor)).status, 404);
  assert.equal((await getImage(assignedCover.src, editor)).status, 200);
  const own = await upload(editor);
  assert.equal((await getImage(own.src, editor)).status, 200);
  await ok(surveys.POST(req("/api/surveys", { survey: { ...assigned, cover: privateCover } }, editor)), 403);
  const changed = (await ok(surveys.POST(req("/api/surveys", { survey: { ...assigned, cover: own, questions: [...assigned.questions, { ...assigned.questions.at(-1), id: "added-q" }] } }, editor)))).survey;
  assert.equal((await getImage(assignedCover.src, editor, "?format=json")).status, 200);
  const saved = await ok(templates.POST(req("/api/templates", { survey: changed }, editor)));
  assert.ok((await ok(templates.GET(req("/api/templates", undefined, editor)))).templates.some(t => t.id === saved.id));
});
test("Home and individual survey page titles persist, render in metadata and reset to defaults", async () => {
  const settings = require("../app/api/site-settings/route.ts");
  const titles = require("../app/page-titles.ts");
  const { generateMetadata } = require("../app/page.tsx");
  const viewer = await account("title-viewer", "viewer");
  await ok(settings.POST(req("/api/site-settings", { pageTitle: "Чужая правка" }, viewer)), 403);
  await ok(settings.POST(req("/api/site-settings", { pageTitle: "Заголовок главной" })));
  assert.equal(titles.homePageTitle(), "Заголовок главной");
  assert.equal((await generateMetadata({ searchParams: Promise.resolve({}) })).title, "Заголовок главной");
  const s = await create({ pageTitle: "Заголовок анкеты", title: "Название анкеты" });
  assert.equal((await generateMetadata({ searchParams: Promise.resolve({ survey: s.id }) })).title, "Заголовок анкеты");
  const reset = (await ok(surveys.POST(req("/api/surveys", { survey: { ...s, pageTitle: "" } })))).survey;
  assert.equal(reset.schemaVersion, s.schemaVersion);
  assert.equal(titles.surveyPageTitle(reset), "Название анкеты · SANEXT");
  await ok(settings.POST(req("/api/site-settings", { pageTitle: "x".repeat(161) })), 400);
  await ok(settings.POST(req("/api/site-settings", { pageTitle: "" })));
  assert.equal(titles.homePageTitle(), titles.DEFAULT_HOME_TITLE);
  assert.equal(validateSurvey({ ...s, pageTitle: "x".repeat(161) }), false);
});
test("Portable JSON retains cover image, visibility and page title; invalid cover is rejected", async () => {
  const cover = { ...await upload(), fit: "contain", position: "bottom" };
  const s = await create({ cover, unlisted: true, pageTitle: "Переносимый заголовок" });
  const bundled = await ok(getImage(cover.src, owner, "?format=json"));
  const id = crypto.randomUUID();
  const fixture = { version: 2, survey: { ...s, id }, rows: [], images: [bundled] };
  const file = join(directory, "portable.json");
  writeFileSync(file, JSON.stringify(fixture));
  const imported = spawnSync(process.execPath, ["scripts/import-responses.mjs", file], { encoding: "utf8", env: process.env });
  assert.equal(imported.status, 0, imported.stderr);
  assert.deepEqual(runtime.getSurvey(id).cover, cover);
  assert.equal(runtime.getSurvey(id).unlisted, true);
  assert.equal(runtime.getSurvey(id).pageTitle, s.pageTitle);
  fixture.survey.id = crypto.randomUUID();
  fixture.survey.cover.src = "https://external.test/image.png";
  writeFileSync(file, JSON.stringify(fixture));
  const invalid = spawnSync(process.execPath, ["scripts/import-responses.mjs", file], { encoding: "utf8", env: process.env });
  assert.notEqual(invalid.status, 0);
  assert.equal(runtime.getSurvey(fixture.survey.id), null);
});
