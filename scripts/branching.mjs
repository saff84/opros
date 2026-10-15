export function visibleQuestions(s, answers) {
  const visible = [];
  for (const q of s.questions) {
    const rule = q.showWhen;
    if (!rule) {
      visible.push(q);
      continue;
    }
    const parent = visible.find((p) => p.id === rule.questionId);
    if (!parent) continue;
    let value = answers[parent.id];
    if (parent.type === "matrix") {
      const index = value?.[rule.row || ""];
      value = Number.isInteger(index) ? parent.options[index] : "";
    }
    const answered = Array.isArray(value)
      ? value.length > 0
      : typeof value === "string"
        ? !!value.trim()
        : false;
    if (!answered) continue;
    const matches = Array.isArray(value)
      ? value.includes(rule.value)
      : typeof value === "string" &&
        (rule.operator === "contains"
          ? value.toLocaleLowerCase().includes(rule.value.toLocaleLowerCase())
          : value.trim() === rule.value.trim());
    if (
      rule.operator === "answered" ||
      (rule.operator === "notEquals" ? !matches : matches)
    )
      visible.push(q);
  }
  return visible;
}
export function sanitizeAnswers(s, answers) {
  const visible = visibleQuestions(s, answers);
  const clean = Object.fromEntries(
    visible
      .filter((q) => answers[q.id] !== undefined)
      .map((q) => [q.id, answers[q.id]]),
  );
  for (const q of visible)
    if (otherSelected(q, answers) && answers[otherKey(q.id)] !== undefined)
      clean[otherKey(q.id)] = answers[otherKey(q.id)];
  return clean;
}
export function branchingError(s) {
  for (let i = 0; i < s.questions.length; i++) {
    const q = s.questions[i],
      rule = q.showWhen;
    if (!rule) continue;
    if (
      typeof rule !== "object" ||
      !["equals", "notEquals", "contains", "answered"].includes(
        rule.operator,
      ) ||
      typeof rule.value !== "string" ||
      rule.value.length > 3000
    )
      return "Некорректное условие: " + q.title;
    const parent = s.questions
      .slice(0, i)
      .find((p) => p.id === rule.questionId);
    if (!parent)
      return (
        "Условие вопроса «" +
        q.title +
        "» должно ссылаться на вопрос выше. Проверьте порядок и удалённые вопросы."
      );
    if (
      parent.type === "matrix" &&
      (!rule.row || !parent.rows.includes(rule.row))
    )
      return "Выберите строку матрицы в условии: " + q.title;
    if (
      rule.operator !== "answered" &&
      (!rule.value.trim() ||
        (parent.type !== "text" && !parent.options.includes(rule.value)))
    )
      return "Выберите существующий ответ в условии: " + q.title;
  }
  return null;
}
import { otherKey, otherSelected } from "./survey-features.mjs";
