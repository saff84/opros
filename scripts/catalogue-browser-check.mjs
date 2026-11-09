import { chromium, expect } from "@playwright/test";
export async function runCatalogueBrowserChecks({ origin, password }) {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : process.platform === "win32" ? { channel: "msedge" } : {}) });
  const adminContext = await browser.newContext({ baseURL: origin });
  const publicContext = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 } });
  const viewerContext = await browser.newContext({ baseURL: origin });
  const errors = [];
  try {
    const admin = await adminContext.newPage();
    admin.on("pageerror", e => errors.push(e.message));
    await admin.goto("/results");
    await admin.getByLabel("Пароль", { exact: true }).fill(password);
    await admin.getByRole("button", { name: "Войти →" }).click();
    await expect(admin.getByRole("heading", { name: "Опросы команды" })).toBeVisible();
    const original = (await (await adminContext.request.get("/api/surveys?id=legacy")).json()).survey;
    const suffix = crypto.randomUUID().slice(0, 8);
    async function post(path, data) {
      const r = await adminContext.request.post(path, { headers: { Origin: origin }, data });
      expect(r.ok(), await r.text()).toBeTruthy();
      return r.json();
    }
    const s = (await post("/api/surveys", { create: true, survey: { ...original, title: "Обложка " + suffix, status: "active" } })).survey;
    const hidden = (await post("/api/surveys", { create: true, survey: { ...original, title: "Скрытый " + suffix, pageTitle: "Title скрытого " + suffix, status: "active", unlisted: true } })).survey;
    await admin.reload();
    await admin.locator("article.survey-card").filter({ has: admin.getByRole("heading", { name: s.title, exact: true }) })
      .getByRole("button", { name: "Редактировать", exact: true }).click();
    await admin.getByRole("button", { name: "Вопросы и тексты", exact: true }).click();
    await admin.getByLabel("Title страницы · заголовок вкладки браузера").fill("Title опроса " + suffix);
    await admin.getByText("Обложка в списке опросов", { exact: true }).click();
    await admin.getByLabel("Загрузить обложку", { exact: false }).setInputFiles({ name: "cover.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=", "base64") });
    await expect(admin.locator(".cover-preview img")).toBeVisible();
    await admin.getByLabel("Описание изображения", { exact: true }).fill("Тестовая обложка");
    await admin.getByLabel("Размещение", { exact: false }).selectOption("contain");
    await admin.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
    await expect(admin.getByRole("status")).toContainText("Опрос сохранён");
    const username = "viewer-" + suffix;
    await post("/api/team", { username, password: "browser-viewer-password", role: "viewer", surveyIds: [] });
    await admin.getByRole("button", { name: "Доступ и резервные копии", exact: true }).click();
    await admin.getByLabel("Title страницы · заголовок вкладки браузера").fill("Главная " + suffix);
    await admin.getByRole("button", { name: "Сохранить title", exact: true }).click();
    await expect(admin.getByRole("status").filter({ hasText: "Заголовок главной страницы сохранён" })).toBeVisible();
    await expect.poll(async () => (await (await adminContext.request.get("/api/site-settings")).json()).pageTitle).toBe("Главная " + suffix);
    const row = admin.getByRole("row").filter({ has: admin.getByRole("cell", { name: username, exact: true }) });
    await row.getByLabel(s.title, { exact: true }).check();
    await row.getByRole("button", { name: "Сохранить доступ", exact: true }).click();
    await expect(admin.getByRole("status").filter({ hasText: "Доступ к опросам сохранён" })).toBeVisible();
    const participant = await publicContext.newPage();
    participant.on("pageerror", e => errors.push(e.message));
    await participant.goto("/");
    await expect(participant).toHaveTitle("Главная " + suffix);
    const card = participant.locator("a.survey-card").filter({ has: participant.getByRole("heading", { name: s.title, exact: true }) });
    await expect(card).toBeVisible();
    await expect(participant.getByRole("heading", { name: hidden.title, exact: true })).toHaveCount(0);
    await expect(card.getByAltText("Тестовая обложка")).toHaveJSProperty("naturalWidth", 1);
    await expect(card.locator("img")).toHaveCSS("object-fit", "contain");
    expect(await participant.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await card.click();
    await expect(participant).toHaveTitle("Title опроса " + suffix);
    await participant.goto("/?survey=" + hidden.id);
    await expect(participant).toHaveTitle(hidden.pageTitle);
    const viewer = await viewerContext.newPage();
    viewer.on("pageerror", e => errors.push(e.message));
    await viewer.goto("/results");
    await viewer.getByLabel("Логин", { exact: true }).fill(username);
    await viewer.getByLabel("Пароль", { exact: true }).fill("browser-viewer-password");
    await viewer.getByRole("button", { name: "Войти →" }).click();
    await expect(viewer.locator("article.survey-card")).toHaveCount(1);
    await expect(viewer.getByRole("heading", { name: s.title, exact: true })).toBeVisible();
    await viewer.reload();
    await expect(viewer.locator("article.survey-card")).toHaveCount(1);
    expect(errors).toEqual([]);
    console.log("Catalogue browser checks PASSED: cover upload/preview, mobile cards, hidden direct links, page titles, user assignments and restricted login after reload.");
  } finally {
    await viewerContext.close(); await publicContext.close(); await adminContext.close(); await browser.close();
  }
}
