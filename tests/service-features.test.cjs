require("./register.cjs");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  utimesSync,
} = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { spawnSync } = require("node:child_process");
const directory = mkdtempSync(join(tmpdir(), "sanext-service-"));
process.env.DATABASE_PATH = join(directory, "service.sqlite");
process.env.ADMIN_PASSWORD = "service-features-owner-password";
process.env.PUBLIC_ORIGIN = "https://service.test";
const runtime = require("../app/runtime.ts"),
  security = require("../app/security.ts"),
  model = require("../app/survey-model.ts");
const surveys = require("../app/api/surveys/route.ts"),
  sessions = require("../app/api/session/route.ts"),
  results = require("../app/api/results/route.ts"),
  team = require("../app/api/team/route.ts"),
  login = require("../app/api/login/route.ts"),
  backups = require("../app/api/backups/route.ts"),
  templates = require("../app/api/templates/route.ts"),
  images = require("../app/api/images/route.ts");
const owner = "survey_admin=" + security.createAdminSession();
const q = (id, type = "text", options = [], extra = {}) => ({
  id,
  title: id,
  description: "",
  type,
  options,
  rows: [],
  required: true,
  maxChoices: 3,
  exclusive: [],
  ...extra,
});
function req(
  path,
  body,
  cookie = owner,
  method = body === undefined ? "GET" : "POST",
) {
  return new Request(process.env.PUBLIC_ORIGIN + path, {
    method,
    headers: {
      Origin: process.env.PUBLIC_ORIGIN,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function create(questions, extra = {}) {
  const response = await surveys.POST(
    req("/api/surveys", {
      create: true,
      survey: { ...model.legacySurvey, id: "", questions, ...extra },
    }),
  );
  assert.equal(
    response.status,
    200,
    JSON.stringify(await response.clone().json()),
  );
  return (await response.json()).survey;
}
async function start(s, extra = {}) {
  const response = await sessions.POST(
    req("/api/session", { surveyId: s.id, action: "start", ...extra }, ""),
  );
  assert.equal(response.status, 200);
  return response.json();
}
async function answer(s, v, answers, action = "submit", extra = {}) {
  return sessions.POST(
    req(
      "/api/session",
      {
        surveyId: s.id,
        revision: s.revision,
        sessionToken: v.sessionToken,
        name: "",
        answers,
        action,
        ...extra,
      },
      "",
    ),
  );
}
after(() => {
  runtime.getDatabase().close();
  rmSync(directory, { recursive: true, force: true });
});
let tracked, visitor;
test("Sources are first-touch, events require signed sessions, and funnel includes distinct starts, pages and submissions", async () => {
  tracked = await create([q("answer")]);
  visitor = await start(tracked, { source: "email", campaign: "autumn" });
  await start(tracked, {
    sessionToken: visitor.sessionToken,
    source: "changed",
  });
  for (const action of ["begin", "page", "page"])
    assert.equal(
      (
        await sessions.POST(
          req(
            "/api/session",
            {
              action,
              surveyId: tracked.id,
              sessionToken: visitor.sessionToken,
              pageId: "answer",
            },
            "",
          ),
        )
      ).status,
      200,
    );
  assert.equal(
    (
      await sessions.POST(
        req(
          "/api/session",
          {
            action: "page",
            surveyId: tracked.id,
            sessionToken: visitor.sessionToken,
            pageId: "missing",
          },
          "",
        ),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await sessions.POST(
        req("/api/session", { action: "begin", surveyId: tracked.id }, ""),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await answer(tracked, visitor, { answer: "Да" }, "submit", {
        department: "Продажи",
        region: "Москва",
      })
    ).status,
    200,
  );
  const data = await (
    await results.GET(req("/api/results?survey=" + tracked.id))
  ).json();
  assert.equal(data.events.length, 2);
  assert.equal(data.rows[0].source, "email");
  assert.equal(data.rows[0].campaign, "autumn");
  assert.equal(data.rows[0].department, "Продажи");
  const { funnel, sourceSummary } = require("../app/funnel.ts");
  const stats = funnel(tracked, data.rows, data.events);
  assert.equal(stats.opened, 1);
  assert.equal(stats.started, 1);
  assert.equal(stats.completed, 1);
  assert.equal(stats.pages[0].visited, 1);
  assert.equal(sourceSummary(data.rows)[0].completed, 1);
});
test("Schedule restricts public reads and submissions while admins can edit; invalid schedule is rejected", async () => {
  const future = new Date(Date.now() + 86400000).toISOString(),
    past = new Date(Date.now() - 86400000).toISOString();
  const s = await create([q("a")], { startsAt: future });
  assert.equal(
    (await surveys.GET(req("/api/surveys?public=1&id=" + s.id))).status,
    404,
  );
  assert.equal((await surveys.GET(req("/api/surveys?id=" + s.id))).status, 200);
  assert.equal(
    (
      await sessions.POST(
        req("/api/session", { action: "start", surveyId: s.id }, ""),
      )
    ).status,
    410,
  );
  assert.equal(
    (
      await surveys.POST(
        req("/api/surveys", { survey: { ...s, endsAt: past } }),
      )
    ).status,
    400,
  );
  const opened = await surveys.POST(
    req("/api/surveys", { survey: { ...s, startsAt: past, endsAt: future } }),
  );
  assert.equal(opened.status, 200);
  assert.equal(
    (await surveys.GET(req("/api/surveys?public=1&id=" + s.id))).status,
    200,
  );
});
test("Team roles enforce server permissions, disable sessions and allow user password changes without owner password changes", async () => {
  assert.equal(
    (
      await team.POST(
        req("/api/team", {
          username: "observer",
          password: "observer-initial-password",
          role: "viewer",
        }),
      )
    ).status,
    200,
  );
  const logged = await login.POST(
    req(
      "/api/login",
      { username: "observer", password: "observer-initial-password" },
      "",
    ),
  );
  assert.equal(logged.status, 200);
  const cookie = logged.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await login.GET(req("/api/login", undefined, cookie))).status,
    200,
  );
  assert.equal(
    (
      await results.GET(
        req("/api/results?survey=" + tracked.id, undefined, cookie),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await surveys.POST(
        req("/api/surveys", { create: true, survey: tracked }, cookie),
      )
    ).status,
    403,
  );
  assert.equal((await images.POST(req("/api/images", {}, cookie))).status, 403);
  assert.equal(
    (await team.GET(req("/api/team", undefined, cookie))).status,
    403,
  );
  assert.equal(
    (await backups.GET(req("/api/backups", undefined, cookie))).status,
    403,
  );
  const changed = await login.PATCH(
    req(
      "/api/login",
      {
        currentPassword: "observer-initial-password",
        newPassword: "observer-changed-password",
      },
      cookie,
      "PATCH",
    ),
  );
  assert.equal(changed.status, 200);
  assert.equal(
    (await results.GET(req("/api/results", undefined, cookie))).status,
    401,
  );
  assert.equal(security.passwordOK(process.env.ADMIN_PASSWORD), true);
  const users = (await (await team.GET(req("/api/team"))).json()).users;
  const user = users.find((u) => u.username === "observer");
  assert.equal(
    (
      await team.POST(
        req("/api/team", { id: user.id, role: "viewer", active: false }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await login.POST(
        req(
          "/api/login",
          { username: "observer", password: "observer-changed-password" },
          "",
        ),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await team.POST(
        req("/api/team", {
          username: "editor",
          password: "editor-initial-password",
          role: "editor",
        }),
      )
    ).status,
    200,
  );
  const editorLogin = await login.POST(
    req(
      "/api/login",
      { username: "editor", password: "editor-initial-password" },
      "",
    ),
  );
  const editor = editorLogin.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (
      await surveys.POST(
        req("/api/surveys", { create: true, survey: tracked }, editor),
      )
    ).status,
    200,
  );
  assert.equal(
    (await team.GET(req("/api/team", undefined, editor))).status,
    403,
  );
});
test("Scale, stars, NPS, ranking, image choices and inline Other validate and export meaningful answers", async () => {
  const questions = [
    q(
      "rating",
      "rating",
      Array.from({ length: 10 }, (_, i) => String(i + 1)),
    ),
    q("stars", "stars", ["1", "2", "3", "4", "5"]),
    q(
      "nps",
      "nps",
      Array.from({ length: 11 }, (_, i) => String(i)),
    ),
    q("rank", "ranking", ["A", "B", "C"]),
    q("image", "image", ["Фото A", "Фото Б"]),
    q("other", "multiple", ["A", "Другое"], { otherOption: "Другое" }),
  ];
  const s = await create(questions),
    v = await start(s);
  const answers = {
    rating: "8",
    stars: "5",
    nps: "10",
    rank: ["B", "A", "C"],
    image: "Фото A",
    other: ["Другое"],
  };
  assert.equal((await answer(s, v, answers)).status, 400);
  answers.other__other = "Свой ответ";
  assert.equal(
    (await answer(s, v, { ...answers, rank: ["A", "A", "C"] })).status,
    400,
  );
  assert.equal((await answer(s, v, { ...answers, nps: "11" })).status, 400);
  assert.equal((await answer(s, v, answers, "save")).status, 200);
  assert.equal(
    (await answer(s, v, { ...answers, other: ["A"] }, "save")).status,
    200,
  );
  assert.equal(runtime.getEntries(s.id)[0].answers.other__other, undefined);
  assert.equal((await answer(s, v, answers)).status, 200);
  const stats = require("../app/statistics.ts"),
    input = require("../app/question-input.tsx");
  assert.equal(
    stats.numericSummary(questions[2], runtime.getEntries(s.id)).nps,
    100,
  );
  assert.equal(
    stats.rankingStats(questions[3], runtime.getEntries(s.id))[0].label,
    "B",
  );
  assert.match(input.answerText(questions[5], answers), /Свой ответ/);
  assert.equal(
    model.validateSurvey({
      ...s,
      questions: [{ ...questions[0], options: ["1", "2"] }],
    }),
    false,
  );
});
test("Image choice assets are public only while referenced by an open survey and included in portable image references", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5FoAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = await images.POST(
    new Request(process.env.PUBLIC_ORIGIN + "/api/images", {
      method: "POST",
      headers: {
        Origin: process.env.PUBLIC_ORIGIN,
        Cookie: owner,
        "Content-Type": "image/png",
      },
      body: png,
    }),
  );
  assert.equal(upload.status, 201);
  const image = (await upload.json()).image;
  const s = await create([
    q("picture", "image", ["A", "B"], { optionImages: { A: image, B: image } }),
  ]);
  const imageRoute = require("../app/api/images/[id]/route.ts");
  const get = () =>
    imageRoute.GET(req(image.src, undefined, ""), {
      params: Promise.resolve({ id: image.src.split("/").pop() }),
    });
  assert.equal((await get()).status, 200);
  assert.deepEqual(require("../scripts/welcome.mjs").surveyImageSources(s), [
    image.src,
  ]);
  const v = await start(s);
  assert.equal((await answer(s, v, { picture: "B" })).status, 200);
  assert.equal(
    (
      await surveys.POST(
        req("/api/surveys", { survey: { ...s, status: "draft" } }),
      )
    ).status,
    200,
  );
  assert.equal((await get()).status, 404);
});

test("JSON preserves attribution and page events and portable new question types", async () => {
  const data = await (
    await results.GET(req("/api/results?survey=" + tracked.id))
  ).json();
  const target = join(directory, "imported.sqlite"),
    file = join(directory, "portable.json");
  const initialized = spawnSync(
    process.execPath,
    [
      "-e",
      "require('./tests/register.cjs');require('./app/runtime.ts').getDatabase().close()",
    ],
    { env: { ...process.env, DATABASE_PATH: target }, encoding: "utf8" },
  );
  assert.equal(initialized.status, 0, initialized.stderr);
  writeFileSync(
    file,
    JSON.stringify({
      version: 2,
      survey: tracked,
      rows: data.rows,
      events: data.events,
      images: [],
    }),
  );
  const imported = spawnSync(
    process.execPath,
    ["scripts/import-responses.mjs", file],
    { env: { ...process.env, DATABASE_PATH: target }, encoding: "utf8" },
  );
  assert.equal(imported.status, 0, imported.stderr);
  const { DatabaseSync } = require("node:sqlite"),
    db = new DatabaseSync(target);
  assert.equal(
    db
      .prepare("SELECT source FROM entry_context WHERE entry_id=?")
      .get(visitor.id).source,
    "email",
  );
  assert.equal(db.prepare("SELECT count(*) AS n FROM entry_events").get().n, 2);
  db.close();
});
test("Template library and publication checks support safe reusable surveys", async () => {
  const { builtInTemplates, templateSurvey } = require("../app/templates.ts");
  for (const template of builtInTemplates)
    assert.equal(
      model.validateSurvey(templateSurvey(model.legacySurvey, template)),
      true,
      template.id,
    );
  const saved = await templates.POST(
    req("/api/templates", { survey: tracked }),
  );
  assert.equal(saved.status, 200);
  const list = await (await templates.GET(req("/api/templates"))).json();
  assert.equal(list.templates.length, 1);
  const check = require("../app/publication.ts").publicationCheck;
  assert.ok(
    check({
      ...tracked,
      questions: [
        q("a", "multiple", ["A", "B"], { minChoices: 3, maxChoices: 2 }),
      ],
    }).errors.length,
  );
  assert.ok(
    check({ ...tracked, questions: [q("a", "image", ["A", "B"])] }).warnings
      .length,
  );
});
test("Automated backup creates consistent downloadable files, honours schedule and retention, and never deletes unrelated files", async () => {
  const response = await backups.POST(req("/api/backups", { action: "run" }));
  assert.equal(response.status, 200);
  let status = await (await backups.GET(req("/api/backups"))).json();
  assert.ok(status.lastSuccess);
  assert.ok(status.files.length);
  const file = status.files[0].name;
  const downloaded = await backups.GET(
    req("/api/backups?file=" + encodeURIComponent(file)),
  );
  assert.equal(downloaded.status, 200);
  assert.equal(
    Buffer.from(await downloaded.arrayBuffer())
      .subarray(0, 15)
      .toString(),
    "SQLite format 3",
  );
  assert.equal(
    (await backups.GET(req("/api/backups?file=..%2Fservice.sqlite"))).status,
    404,
  );
  const oldName =
      "auto-2020-01-01T00-00-00-000Z-" + crypto.randomUUID() + ".sqlite",
    oldPath = join(directory, "backups", oldName),
    unrelated = join(directory, "backups", "keep-me.txt");
  writeFileSync(oldPath, "old");
  utimesSync(oldPath, new Date("2020-01-01"), new Date("2020-01-01"));
  writeFileSync(unrelated, "keep");
  assert.equal(
    (await backups.POST(req("/api/backups", { action: "run" }))).status,
    200,
  );
  assert.equal(readFileSync(unrelated, "utf8"), "keep");
  status = await (await backups.GET(req("/api/backups"))).json();
  assert.equal(
    status.files.some((f) => f.name === oldName),
    false,
  );
  assert.equal(
    (
      await backups.POST(
        req("/api/backups", {
          enabled: false,
          everyHours: 24,
          retentionDays: 7,
        }),
      )
    ).status,
    200,
  );
  const worker = spawnSync(
    process.execPath,
    ["scripts/backup-worker.mjs", "--once"],
    { encoding: "utf8" },
  );
  assert.equal(worker.status, 0, worker.stderr);
  const next = await (await backups.GET(req("/api/backups"))).json();
  assert.equal(next.files.length, status.files.length);
  assert.equal(
    (
      await backups.POST(
        req("/api/backups", { enabled: true, everyHours: 0, retentionDays: 7 }),
      )
    ).status,
    400,
  );
});
test("PDF is a real downloadable document with Cyrillic and charts; QR codes are generated locally", async () => {
  const { reportDocument } = require("../app/pdf-report.ts"),
    pdf = require("pdfmake/build/pdfmake"),
    fonts = require("pdfmake/build/vfs_fonts");
  pdf.addVirtualFileSystem(fonts);
  const doc = reportDocument(
    tracked,
    runtime.getEntries(tracked.id),
    "Отдел: Продажи",
  );
  const bytes = await pdf.createPdf(doc).getBuffer();
  assert.match(bytes.subarray(0, 8).toString(), /^%PDF-/);
  assert.ok(bytes.length > 5000);
  const qr = require("qrcode"),
    png = await qr.toBuffer(
      "https://service.test/?survey=" + tracked.id + "&source=email",
    );
  assert.equal(png.subarray(1, 4).toString(), "PNG");
});
test("Live updates preserve only compatible answers and remove deleted or stale Other fields", () => {
  const { recoverCompatibleAnswers } = require("../app/live-survey.ts");
  const previous = [q("same"), q("changed"), q("removed")],
    next = {
      ...tracked,
      questions: [
        q("same"),
        q("changed", "text", [], { title: "Edited" }),
        q("new"),
      ],
    };
  const answers = recoverCompatibleAnswers(next, previous, {
    same: "keep",
    changed: "old",
    removed: "gone",
  });
  assert.equal(answers.same, "keep");
  assert.equal(answers.changed, "");
  assert.equal(answers.new, "");
  assert.equal(answers.removed, undefined);
});
