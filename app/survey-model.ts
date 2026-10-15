import { visibleQuestions, branchingError, ShowWhen } from "./branching";
import { tools, ratings, barriers, needs, titles, Answers } from "./data";
import { validWelcome } from "../scripts/welcome.mjs";
export type Welcome = {
  eyebrow?: string;
  heading?: string;
  description?: string;
  footer?: string;
  symbol?: string;
  showFooter?: boolean;
  showStripe?: boolean;
  align?: "left" | "center";
  textColor?: string;
  titleSize?: number;
  imagePosition?: "top" | "bottom";
  imageFit?: "contain" | "cover";
  images?: { src: string; alt: string }[];
};
export type Question = {
  id: string;
  title: string;
  description: string;
  type: "text" | "single" | "multiple" | "matrix";
  required: boolean;
  options: string[];
  rows: string[];
  maxChoices: number;
  minChoices?: number;
  exclusive: string[];
  showWhen?: ShowWhen;
  image?: { src: string; alt: string };
};
export type Survey = {
  welcome?: Welcome;
  id: string;
  title: string;
  description: string;
  intro: string;
  thanks: string;
  accent: string;
  background: string;
  status: "draft" | "active" | "archived";
  questions: Question[];
  created: string;
  updated: string;
  revision: number;
  schemaVersion?: number;
};
export type Answer = string | string[] | Record<string, number>;
export type AnswerMap = Record<string, Answer>;
export type Entry = {
  id: string;
  survey_id: string;
  created: string;
  updated: string;
  status: "visited" | "draft" | "completed";
  name: string;
  answers: AnswerMap;
  schema_version?: number;
};
const special = [
  "Использовал, но заметной пользы не получил",
  "Пока сложно оценить пользу",
  "Не использовал инструменты",
];
const q = (
  id: string,
  title: string,
  type: Question["type"],
  options: string[] = [],
  rows: string[] = [],
  required = true,
  maxChoices = 3,
  exclusive: string[] = [],
): Question => ({
  id,
  title,
  description: "",
  type,
  options,
  rows,
  required,
  maxChoices,
  exclusive,
});
export const legacySurvey: Survey = {
  id: "legacy",
  title: "Маркетинг × Продажи · 2027",
  description: "Сильные продажи. Полезный маркетинг.",
  intro:
    "Расскажите, какие материалы и мероприятия помогают в работе с клиентами, что стоит изменить и чего не хватает. Оценивайте последние 12 месяцев.",
  thanks:
    "Ваши ответы сохранены и помогут определить приоритеты маркетинговой поддержки.",
  accent: "#004ecc",
  background: "#daeaf2",
  status: "active",
  created: "2026-10-14T00:00:00.000Z",
  updated: "2026-10-14T00:00:00.000Z",
  revision: 1,
  questions: [
    q("usage", titles[0], "matrix", ratings, tools),
    q(
      "benefit",
      titles[1],
      "multiple",
      [...tools, ...special],
      [],
      true,
      3,
      special,
    ),
    q("barriers", titles[2], "multiple", barriers, [], true, 3, [
      "Ничего не мешает",
    ]),
    q(
      "barrierOther",
      "Другая причина (если выбрали «Другое»)",
      "text",
      [],
      [],
      false,
    ),
    q("improve", titles[3], "text", [], [], false),
    q("needs", titles[4], "multiple", needs, [], true, 3, [
      "Поддержки достаточно",
    ]),
    q(
      "needOther",
      "Другая задача (если выбрали «Другое»)",
      "text",
      [],
      [],
      false,
    ),
    ...[0, 1, 2].map((i) =>
      q("idea" + i, "Предложение на 2027 год · " + (i + 1), "text"),
    ),
  ],
};
export function convertLegacy(a: Answers): AnswerMap {
  return {
    usage: a.usage,
    benefit: a.benefit,
    barriers: a.barriers,
    barrierOther: a.barrierOther,
    improve: a.improve,
    needs: a.needs,
    needOther: a.needOther,
    idea0: a.ideas[0] || "",
    idea1: a.ideas[1] || "",
    idea2: a.ideas[2] || "",
  };
}
export function emptyAnswers(s: Survey): AnswerMap {
  return Object.fromEntries(
    s.questions.map((q) => [
      q.id,
      q.type === "matrix" ? {} : q.type === "multiple" ? [] : "",
    ]),
  );
}
export function validateAnswers(
  s: Survey,
  value: unknown,
  complete: boolean,
): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "Некорректные ответы";
  const a = value as AnswerMap;
  if (Object.keys(a).some((k) => !s.questions.some((q) => q.id === k)))
    return "Неизвестный вопрос";
  for (const q of visibleQuestions(s, a)) {
    const v = a[q.id],
      missing = v === undefined || v === "" || (Array.isArray(v) && !v.length);
    if (
      v !== undefined &&
      (((q.type === "text" || q.type === "single") && typeof v !== "string") ||
        (q.type === "multiple" && !Array.isArray(v)) ||
        (q.type === "matrix" &&
          (!v || typeof v !== "object" || Array.isArray(v))))
    )
      return "Некорректный тип ответа: " + q.title;
    if (missing) {
      if (complete && q.required) return "Заполните: " + q.title;
      continue;
    }
    if (q.type === "text" && (typeof v !== "string" || v.length > 3000))
      return "Текст должен быть не длиннее 3000 символов";
    if (q.type === "text" && complete && q.required && !String(v).trim())
      return "Заполните: " + q.title;
    if (
      q.type === "single" &&
      (typeof v !== "string" || !q.options.includes(v))
    )
      return "Выберите вариант: " + q.title;
    if (q.type === "multiple" && Array.isArray(v) && v.length > q.maxChoices)
      return `Выберите не более ${q.maxChoices} вариантов: ${q.title}`;
    if (
      q.type === "multiple" &&
      (!Array.isArray(v) ||
        v.length > q.maxChoices ||
        new Set(v).size !== v.length ||
        v.some((x) => !q.options.includes(x)) ||
        (v.some((x) => q.exclusive.includes(x)) && v.length > 1))
    )
      return "Проверьте варианты: " + q.title;
    if (
      q.type === "multiple" &&
      complete &&
      Array.isArray(v) &&
      !v.some((x) => q.exclusive.includes(x)) &&
      v.length < (q.minChoices || 0)
    )
      return `Выберите не менее ${q.minChoices} вариантов: ${q.title}`;
    if (q.type === "matrix") {
      if (
        !v ||
        typeof v !== "object" ||
        Array.isArray(v) ||
        Object.entries(v).some(
          ([k, n]) =>
            !q.rows.includes(k) ||
            !Number.isInteger(n) ||
            n < 0 ||
            n >= q.options.length,
        )
      )
        return "Проверьте оценки: " + q.title;
      if (complete && q.required && Object.keys(v).length !== q.rows.length)
        return "Оцените все строки: " + q.title;
    }
  }
  if (
    s.id === "legacy" &&
    (s.schemaVersion || 1) === 1 &&
    s.questions.some((q) => q.id === "usage") &&
    Array.isArray(a.benefit) &&
    a.benefit.some(
      (option) =>
        tools.includes(option) &&
        ![0, 1].includes((a.usage as Record<string, number>)?.[option]),
    )
  )
    return "Выберите пользу только для использованных инструментов";
  if (
    s.id === "legacy" &&
    (s.schemaVersion || 1) === 1 &&
    complete &&
    s.questions.some((q) => q.id === "barrierOther")
  ) {
    if (
      (a.barriers as string[])?.includes("Другое") &&
      !String(a.barrierOther || "").trim()
    )
      return "Уточните другую причину";
    if (
      (a.needs as string[])?.includes("Другое") &&
      !String(a.needOther || "").trim()
    )
      return "Уточните другую задачу";
  }
  return null;
}
export function validateSurvey(value: unknown): value is Survey {
  if (!value || typeof value !== "object") return false;
  const s = value as Survey;
  if (!validWelcome(s.welcome)) return false;
  if (
    typeof s.title !== "string" ||
    !s.title.trim() ||
    s.title.length > 160 ||
    ![s.description, s.intro, s.thanks].every(
      (x) => typeof x === "string" && x.length <= 4000,
    ) ||
    ![s.accent, s.background].every(
      (x) => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x),
    ) ||
    !["draft", "active", "archived"].includes(s.status) ||
    !Array.isArray(s.questions) ||
    !s.questions.length ||
    s.questions.length > 60
  )
    return false;
  const ids = new Set<string>();
  for (const q of s.questions) {
    if (
      !q ||
      typeof q.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(q.id) ||
      ids.has(q.id) ||
      typeof q.title !== "string" ||
      !q.title.trim() ||
      q.title.length > 300 ||
      typeof q.description !== "string" ||
      q.description.length > 2000 ||
      typeof q.required !== "boolean" ||
      !["text", "single", "multiple", "matrix"].includes(q.type) ||
      !Number.isInteger(q.maxChoices) ||
      q.maxChoices < 1 ||
      q.maxChoices > 100
    )
      return false;
    if (
      q.image &&
      (typeof q.image.src !== "string" ||
        !/^\/api\/images\/[0-9a-f-]{36}$/.test(q.image.src) ||
        typeof q.image.alt !== "string" ||
        q.image.alt.length > 300)
    )
      return false;
    ids.add(q.id);
    for (const list of [q.options, q.rows, q.exclusive])
      if (
        !Array.isArray(list) ||
        list.length > 100 ||
        new Set(list).size !== list.length ||
        list.some((x) => typeof x !== "string" || !x.trim() || x.length > 300)
      )
        return false;
    if (q.type !== "text" && q.options.length < 2) return false;
    if (q.type === "matrix" && !q.rows.length) return false;
    if (q.exclusive.some((x) => !q.options.includes(x))) return false;
    if (
      q.type === "multiple" &&
      q.minChoices !== undefined &&
      (!Number.isInteger(q.minChoices) ||
        q.minChoices < 0 ||
        q.minChoices > q.maxChoices ||
        q.minChoices > q.options.filter((x) => !q.exclusive.includes(x)).length)
    )
      return false;
  }
  return !branchingError(s);
}
