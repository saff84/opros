export const singleTypes = ["single", "rating", "stars", "nps", "image"];
export const questionTypes = [
  "text",
  "multiple",
  "matrix",
  "ranking",
  ...singleTypes,
];
export function isSurveyOpen(s, now = Date.now()) {
  return (
    s.status === "active" &&
    (!s.startsAt || Date.parse(s.startsAt) <= now) &&
    (!s.endsAt || now < Date.parse(s.endsAt))
  );
}
export function validSchedule(s) {
  return (
    [s.startsAt, s.endsAt].every(
      (v) =>
        v === undefined ||
        v === "" ||
        (typeof v === "string" && Number.isFinite(Date.parse(v))),
    ) &&
    (!s.startsAt || !s.endsAt || Date.parse(s.startsAt) < Date.parse(s.endsAt))
  );
}
export function validFeatureQuestion(q) {
  if (
    q.otherOption !== undefined &&
    (typeof q.otherOption !== "string" ||
      !["single", "multiple", "image"].includes(q.type) ||
      !q.options.includes(q.otherOption))
  )
    return false;
  if (
    q.optionImages !== undefined &&
    (!q.optionImages ||
      typeof q.optionImages !== "object" ||
      Array.isArray(q.optionImages) ||
      Object.entries(q.optionImages).some(
        ([key, image]) =>
          !q.options.includes(key) ||
          !image ||
          !/^\/api\/images\/[0-9a-f-]{36}$/.test(image.src) ||
          typeof image.alt !== "string" ||
          image.alt.length > 300,
      ))
  )
    return false;
  const expected =
    q.type === "nps"
      ? Array.from({ length: 11 }, (_, i) => String(i))
      : q.type === "stars"
        ? ["1", "2", "3", "4", "5"]
        : q.type === "rating"
          ? Array.from({ length: 10 }, (_, i) => String(i + 1))
          : null;
  return !expected || JSON.stringify(q.options) === JSON.stringify(expected);
}
export function otherKey(id) {
  return id + "__other";
}
export function otherSelected(q, answers) {
  const value = answers[q.id];
  return (
    !!q.otherOption &&
    (Array.isArray(value)
      ? value.includes(q.otherOption)
      : value === q.otherOption)
  );
}
export function knownAnswerKey(s, key) {
  return s.questions.some(
    (q) => q.id === key || (q.otherOption && otherKey(q.id) === key),
  );
}
export function featureAnswerError(q, answers, complete) {
  const value = answers[q.id];
  if (
    q.type === "ranking" &&
    value !== undefined &&
    (!Array.isArray(value) ||
      new Set(value).size !== value.length ||
      value.some((v) => !q.options.includes(v)) ||
      (complete && value.length > 0 && value.length !== q.options.length))
  )
    return "Расположите все варианты по порядку: " + q.title;
  if (otherSelected(q, answers)) {
    const other = answers[otherKey(q.id)];
    if (
      other !== undefined &&
      (typeof other !== "string" || other.length > 3000)
    )
      return "Уточнение должно быть текстом до 3000 символов: " + q.title;
    if (complete && (typeof other !== "string" || !other.trim()))
      return "Уточните вариант «" + q.otherOption + "»: " + q.title;
  }
  return null;
}
