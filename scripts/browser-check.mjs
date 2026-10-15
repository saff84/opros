import { chromium, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
export async function runBrowserChecks({ origin, password }) {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE_PATH
      ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
      : process.platform === "win32"
        ? { channel: "msedge" }
        : {}),
  });
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const errors = [];
  try {
    const admin = await context.newPage();
    admin.on("pageerror", (error) => errors.push(error.message));
    await admin.goto("/results");
    await admin.getByLabel("Пароль", { exact: true }).fill(password);
    await admin.getByRole("button", { name: "Войти →" }).click();
    await expect(
      admin.getByRole("heading", { name: "Опросы команды" }),
    ).toBeVisible();
    const original = (
      await (await context.request.get("/api/surveys?id=legacy")).json()
    ).survey;
    const q = (id, title, type = "text", options = [], extra = {}) => ({
      id,
      title,
      type,
      description: "",
      options,
      rows: [],
      exclusive: [],
      required: true,
      maxChoices: 3,
      ...extra,
    });
    let response = await context.request.post("/api/surveys", {
      headers: { Origin: origin },
      data: {
        create: true,
        survey: {
          ...original,
          id: "",
          title: "Проверка браузера",
          status: "active",
          questions: [
            q("keep", "Постоянный вопрос"),
            q("old", "Старый вопрос"),
          ],
        },
      },
    });
    expect(response.status()).toBe(200);
    let survey = (await response.json()).survey;
    const participant = await context.newPage();
    participant.on("pageerror", (error) => errors.push(error.message));
    await participant.goto(
      "/?survey=" + survey.id + "&source=browser-test&campaign=checks",
    );
    await participant.getByRole("button", { name: "Начать опрос →" }).click();
    await participant
      .getByRole("textbox", { name: "Постоянный вопрос", exact: true })
      .fill("Ответ, сохранённый при обновлении");
    survey = {
      ...survey,
      questions: [
        survey.questions[0],
        q("new", "Новый вопрос", "single", ["Вариант", "Другое"], {
          startNewPage: false,
          otherOption: "Другое",
        }),
      ],
    };
    response = await context.request.post("/api/surveys", {
      headers: { Origin: origin },
      data: { survey },
    });
    expect(response.status()).toBe(200);
    survey = (await response.json()).survey;
    await expect(
      participant
        .getByRole("status")
        .filter({ hasText: "Вопросы опроса обновлены" }),
    ).toBeVisible({ timeout: 15000 });
    await participant.getByRole("button", { name: "Начать опрос →" }).click();
    await expect(
      participant.getByRole("textbox", {
        name: "Постоянный вопрос",
        exact: true,
      }),
    ).toHaveValue("Ответ, сохранённый при обновлении");
    await expect(
      participant.getByRole("heading", { name: "Новый вопрос", exact: true }),
    ).toBeVisible();
    await expect(
      participant.getByRole("heading", { name: "Старый вопрос", exact: true }),
    ).toHaveCount(0);
    await participant
      .getByRole("button", { name: /Другое$/ })
      .click();
    await participant
      .getByLabel("Уточните «Другое»", { exact: true })
      .fill("Свой вариант в браузере");
    await participant
      .getByRole("button", { name: "Отправить ответы ✓" })
      .click();
    await expect(
      participant.getByRole("heading", { name: "Спасибо за ваше мнение." }),
    ).toBeVisible();
    await admin.reload();
    const card = admin
      .locator("article.survey-card")
      .filter({
        has: admin.getByRole("heading", {
          name: "Проверка браузера",
          exact: true,
        }),
      });
    await card
      .getByRole("button", { name: "Редактировать", exact: true })
      .click();
    await admin
      .getByRole("button", { name: "Предпросмотр", exact: true })
      .click();
    await admin
      .getByRole("button", { name: "Телефон · 390 px", exact: true })
      .click();
    await expect(admin.locator(".preview-mobile")).toHaveCSS("width", "390px");
    mkdirSync(resolve("artifacts"), { recursive: true });
    await admin
      .locator(".preview-mobile")
      .screenshot({ path: resolve("artifacts/mobile-preview.png") });
    await admin
      .getByRole("button", { name: /Проверка перед публикацией/ })
      .click();
    await expect(
      admin.getByText("Блокирующих ошибок нет.", { exact: false }),
    ).toBeVisible();
    await admin
      .getByRole("button", { name: "Вопросы и тексты", exact: true })
      .click();
    await admin
      .getByRole("button", {
        name: "Удалить вопрос 2: Новый вопрос",
        exact: true,
      })
      .click();
    await expect(admin.locator(".question-editor")).toHaveCount(1);
    await expect(
      admin.getByRole("status").filter({ hasText: "удалён из редактора" }),
    ).toBeVisible();
    await admin
      .getByRole("button", { name: "Вернуть вопрос", exact: true })
      .click();
    await expect(admin.locator(".question-editor")).toHaveCount(2);
    await admin
      .getByRole("button", { name: "Сохранить изменения", exact: true })
      .click();
    await expect(
      admin.getByRole("button", { name: "Обзор и графики", exact: true }),
    ).toBeVisible();
    await admin.locator(".share-panel summary").click();
    await admin
      .locator(".share-panel")
      .getByLabel("Источник", { exact: true })
      .fill("email");
    await expect(admin.locator(".qr-preview")).toBeVisible();
    const qrDownload = admin.waitForEvent("download");
    await admin
      .getByRole("button", { name: "Скачать PNG", exact: true })
      .click();
    const png = readFileSync(await (await qrDownload).path());
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    await admin
      .getByLabel("Формат экспорта", { exact: true })
      .selectOption("pdf");
    const pdfDownload = admin.waitForEvent("download", { timeout: 60000 });
    await admin.getByRole("button", { name: "Скачать ↓", exact: true }).click();
    const pdf = readFileSync(await (await pdfDownload).path());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    expect(errors).toEqual([]);
    console.log(
      "Browser validation PASSED: login, unsaved draft recovery after live update, removed/new questions, grouped page, inline Other, mobile preview, preflight, delete/undo, QR PNG and PDF downloads.",
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
