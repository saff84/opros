import assert from "node:assert/strict";
export async function runHttpChecks({ origin, password }) {
  async function request(
    path,
    body,
    cookie = "",
    method = body === undefined ? "GET" : "POST",
  ) {
    return fetch(origin + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  for (const path of [
    "/",
    "/results",
    "/sanext_logo.svg",
    "/fonts/manrope-400.woff2",
  ])
    assert.equal((await fetch(origin + path)).status, 200, path);
  assert.equal((await request("/api/results")).status, 401);
  const login = await request("/api/login", { password });
  assert.equal(login.status, 200);
  let cookie = login.headers.get("set-cookie").split(";")[0];
  assert.ok(cookie.startsWith("survey_admin="));
  assert.equal((await login.json()).token, undefined);
  const publicList = await (await request("/api/surveys")).json();
  assert.equal(publicList.surveys.length, 1);
  const original = (await (await request("/api/surveys?id=legacy")).json())
    .survey;
  const definition = {
    ...original,
    title: "HTTP smoke",
    status: "active",
    questions: [
      {
        id: "answer",
        title: "Ваш ответ",
        description: "",
        type: "text",
        required: true,
        options: [],
        rows: [],
        maxChoices: 1,
        exclusive: [],
      },
    ],
  };
  const created = await request(
    "/api/surveys",
    { create: true, survey: definition },
    cookie,
  );
  assert.equal(created.status, 200);
  let survey = (await created.json()).survey;
  assert.notEqual(survey.id, "legacy");
  const start = await request("/api/session", {
    surveyId: survey.id,
    action: "start",
  });
  assert.equal(start.status, 200);
  const session = await start.json();
  const previousCookie = cookie,
    newPassword = "changed-smoke-" + crypto.randomUUID();
  const changedPassword = await request(
    "/api/login",
    { currentPassword: password, newPassword },
    cookie,
    "PATCH",
  );
  assert.equal(changedPassword.status, 200);
  cookie = changedPassword.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await request("/api/results", undefined, previousCookie)).status,
    401,
  );
  assert.equal((await request("/api/login", { password })).status, 401);
  const signedInAgain = await request(
    "/api/login",
    { password: newPassword },
    cookie,
  );
  assert.equal(signedInAgain.status, 200);
  cookie = signedInAgain.headers.get("set-cookie").split(";")[0];
  const payload = {
    surveyId: survey.id,
    revision: survey.revision,
    sessionToken: session.sessionToken,
    name: "Проверка",
    answers: { answer: "Реальный HTTP-запрос" },
    action: "submit",
  };
  assert.equal(
    (await request("/api/session", { ...payload, sessionToken: "" })).status,
    403,
  );
  assert.equal((await request("/api/session", payload)).status, 200);
  assert.equal(
    (await request("/api/session", { ...payload, action: "save" })).status,
    409,
  );
  const data = await (
    await request("/api/results?survey=" + survey.id, undefined, cookie)
  ).json();
  assert.equal(data.rows[0].answers.answer, "Реальный HTTP-запрос");
  assert.equal(data.rows[0].status, "completed");
  const editResponse = await request(
    "/api/surveys",
    {
      survey: {
        ...survey,
        questions: [
          { ...survey.questions[0], title: "Updated question" },
          { ...survey.questions[0], id: "added", title: "Added question" },
        ],
      },
    },
    cookie,
  );
  assert.equal(editResponse.status, 200);
  survey = (await editResponse.json()).survey;
  assert.equal(survey.schemaVersion, 2);
  const historical = await (
    await request(
      "/api/results?survey=" + survey.id + "&version=1",
      undefined,
      cookie,
    )
  ).json();
  assert.equal(historical.rows[0].answers.answer, "Реальный HTTP-запрос");
  assert.equal(historical.survey.questions.length, 1);
  const current = await (
    await request("/api/results?survey=" + survey.id, undefined, cookie)
  ).json();
  assert.equal(current.rows.length, 0);
  const renewal = await (
    await request("/api/session", {
      surveyId: survey.id,
      action: "start",
      sessionToken: session.sessionToken,
    })
  ).json();
  assert.notEqual(renewal.id, session.id);
  assert.equal(
    (
      await request("/api/session", {
        surveyId: survey.id,
        revision: survey.revision,
        sessionToken: renewal.sessionToken,
        name: "Test",
        action: "submit",
        answers: { answer: "Updated answer", added: "New answer" },
      })
    ).status,
    200,
  );
  const deleted = await request(
    "/api/surveys",
    { survey: { ...survey, questions: [survey.questions[1]] } },
    cookie,
  );
  assert.equal(deleted.status, 200);
  survey = (await deleted.json()).survey;
  assert.equal(survey.schemaVersion, 3);
  const versionTwo = await (
    await request(
      "/api/results?survey=" + survey.id + "&version=2",
      undefined,
      cookie,
    )
  ).json();
  assert.equal(versionTwo.rows[0].answers.answer, "Updated answer");
  const live = await (
    await request("/api/surveys?public=1&id=" + survey.id)
  ).json();
  assert.deepEqual(
    live.survey.questions.map((q) => q.id),
    ["added"],
  );
  const archived = await request(
    "/api/surveys",
    { survey: { ...survey, status: "archived" } },
    cookie,
  );
  assert.equal(archived.status, 200);
  survey = (await archived.json()).survey;
  assert.equal(
    (await request("/api/session", { surveyId: survey.id, action: "start" }))
      .status,
    410,
  );
  assert.equal((await request("/api/surveys?id=" + survey.id)).status, 404);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5FoAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = await fetch(origin + "/api/images", {
    method: "POST",
    headers: { Origin: origin, Cookie: cookie, "Content-Type": "image/png" },
    body: png,
  });
  assert.equal(upload.status, 201);
  const image = (await upload.json()).image;
  assert.equal((await fetch(origin + image.src)).status, 404);
  const branchDefinition = {
    ...definition,
    title: "Branch smoke",
    welcome: {
      heading: "Docker welcome",
      images: [{ ...image, alt: "Welcome image" }],
    },
    questions: [
      {
        ...definition.questions[0],
        id: "gate",
        type: "single",
        options: ["Yes", "No"],
        image,
      },
      {
        ...definition.questions[0],
        id: "details",
        showWhen: { questionId: "gate", operator: "equals", value: "Yes" },
      },
    ],
  };
  const branchCreated = await request(
    "/api/surveys",
    { create: true, survey: branchDefinition },
    cookie,
  );
  assert.equal(branchCreated.status, 200);
  const branchSurvey = (await branchCreated.json()).survey;
  assert.equal(branchSurvey.welcome.heading, "Docker welcome");
  assert.equal(
    (await fetch(origin + image.src)).headers.get("content-type"),
    "image/png",
  );
  const imageJson = await (
    await request(image.src + "?format=json", undefined, cookie)
  ).json();
  assert.equal(imageJson.data, png.toString("base64"));
  const branchSession = await (
    await request("/api/session", {
      surveyId: branchSurvey.id,
      action: "start",
    })
  ).json();
  assert.equal(
    (
      await request("/api/session", {
        surveyId: branchSurvey.id,
        revision: branchSurvey.revision,
        sessionToken: branchSession.sessionToken,
        action: "submit",
        name: "Branch",
        answers: { gate: "No", details: "Hidden" },
      })
    ).status,
    200,
  );
  const branchResult = await (
    await request("/api/results?survey=" + branchSurvey.id, undefined, cookie)
  ).json();
  assert.deepEqual(branchResult.rows[0].answers, { gate: "No" });
  const active = await (await request("/api/surveys?public=1")).json();
  assert.equal(active.surveys.length, 2);
  assert.ok(active.surveys.some((s) => s.id === branchSurvey.id));
  for (const summary of active.surveys) {
    const live = (
      await (
        await request("/api/surveys?id=" + summary.id, undefined, cookie)
      ).json()
    ).survey;
    assert.equal(
      (
        await request(
          "/api/surveys",
          { survey: { ...live, status: "draft" } },
          cookie,
        )
      ).status,
      200,
    );
  }
  assert.equal(
    (await (await request("/api/surveys?public=1")).json()).surveys.length,
    0,
  );
  assert.equal((await fetch(origin + image.src)).status, 404);
  assert.equal(
    (await request("/api/login", undefined, cookie, "DELETE")).status,
    200,
  );
  assert.equal((await request("/api/results", undefined, cookie)).status, 401);
  console.log(
    "HTTP smoke passed: standalone server, pages/assets, login/logout, surveys, signed sessions, submission, editing/deleting/adding questions, historical versions, password rotation, branching, images, zero/multiple active surveys, archive and isolation.",
  );
  return {
    password: newPassword,
    surveyId: branchSurvey.id,
    imagePath: image.src,
    visitorToken: branchSession.sessionToken,
    visitorId: branchSession.id,
  };
}
