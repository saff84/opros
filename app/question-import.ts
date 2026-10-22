import { Survey, Question, validateSurvey } from "./survey-model";
import { branchingError } from "./branching";
import { questionTypes } from "../scripts/survey-features.mjs";

export const MAX_QUESTION_IMPORT_BYTES = 90_000;
const questionKeys = new Set([
  "id", "title", "description", "type", "required", "options", "rows",
  "maxChoices", "minChoices", "exclusive", "otherOption", "showWhen", "startNewPage",
]);
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** The file describes content only; publication and appearance use fresh defaults. */
export function importQuestions(text: string): Survey {
  if (new TextEncoder().encode(text).length > MAX_QUESTION_IMPORT_BYTES)
    throw Error("Файл слишком большой. Максимальный размер — 90 КБ.");
  let input: unknown;
  try { input = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw Error("Не удалось прочитать JSON. Проверьте запятые и кавычки в файле."); }
  if (!object(input) || input.format !== "sanext-questions" || input.version !== 1)
    throw Error("Ожидается шаблон sanext-questions версии 1. Скачайте пример рядом с кнопкой загрузки.");
  const unknown = Object.keys(input).filter(k => !["format", "version", "title", "questions"].includes(k));
  if (unknown.length) throw Error("Неизвестные поля шаблона: " + unknown.join(", "));
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 160)
    throw Error("Укажите название опроса: от 1 до 160 символов.");
  if (!Array.isArray(input.questions) || !input.questions.length || input.questions.length > 60)
    throw Error("Шаблон должен содержать от 1 до 60 вопросов.");
  const ids = new Set<string>();
  const questions = input.questions.map((raw, index): Question => {
    const fail = (message: string): never => { throw Error(`Вопрос ${index + 1}: ${message}`); };
    if (!object(raw)) return fail("ожидается объект.");
    const extra = Object.keys(raw).filter(k => !questionKeys.has(k));
    if (extra.length) return fail("неизвестные поля: " + extra.join(", ") + ". Изображения добавляются в редакторе.");
    if (typeof raw.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id))
      return fail("id должен содержать 1–80 латинских букв, цифр, знаков _ или -.");
    if (ids.has(raw.id)) return fail("повторяется id «" + raw.id + "».");
    ids.add(raw.id);
    if (!questionTypes.includes(raw.type as string)) return fail("неизвестный тип вопроса.");
    const type = raw.type as Question["type"];
    const scale = type === "nps" ? Array.from({ length: 11 }, (_, i) => String(i))
      : type === "rating" ? Array.from({ length: 10 }, (_, i) => String(i + 1))
      : type === "stars" ? ["1", "2", "3", "4", "5"] : [];
    const q = {
      description: "", required: true, options: scale, rows: [], maxChoices: 3,
      exclusive: [], ...raw,
    } as unknown as Question;
    // Reuse the actual survey validator, including type-specific option rules.
    const { showWhen, ...withoutRule } = q;
    if (!validateSurvey(baseSurvey("Проверка", [withoutRule])))
      return fail("проверьте название (до 300 символов), описание, варианты, строки матрицы, обязательность и лимиты выбора. Шкалы: rating 1–10, stars 1–5, nps 0–10.");
    if (showWhen !== undefined && (!object(showWhen) || Object.keys(showWhen).some(k => !["questionId", "operator", "value", "row"].includes(k))))
      return fail("некорректные поля условия showWhen.");
    return q;
  });
  const survey = baseSurvey(input.title.trim(), questions);
  const ruleError = branchingError(survey);
  if (ruleError) throw Error(ruleError);
  if (!validateSurvey(survey))
    throw Error("Проверьте идентификаторы: id вопроса не должен совпадать с id другого вопроса с суффиксом __other.");
  // Match the existing server limit, including metadata and create wrapper.
  if (new TextEncoder().encode(JSON.stringify({ survey, create: true })).length > 98_000)
    throw Error("Содержимое опроса превышает лимит сохранения. Сократите тексты или число вариантов.");
  return survey;
}

function baseSurvey(title: string, questions: Question[]): Survey {
  const now = new Date().toISOString();
  return {
    id: "", title, description: "Поделитесь своим мнением",
    intro: "Ваши ответы помогут нам стать лучше.", thanks: "Спасибо! Ваше мнение принято.",
    accent: "#004ecc", background: "#daeaf2", status: "draft", questions,
    created: now, updated: now, revision: 0, schemaVersion: 1,
  };
}
