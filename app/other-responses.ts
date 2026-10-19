import type { Survey, Question, Entry } from "./survey-model";
import { visibleQuestions } from "./branching";
export function otherResponses(s: Survey, q: Question, rows: Entry[]) {
  if (!q.otherOption) return [];
  return rows
    .filter((r) => {
      const selected = r.answers[q.id];
      return (
        visibleQuestions(s, r.answers).some((item) => item.id === q.id) &&
        (Array.isArray(selected)
          ? selected.includes(q.otherOption!)
          : selected === q.otherOption) &&
        typeof r.answers[q.id + "__other"] === "string" &&
        String(r.answers[q.id + "__other"]).trim()
      );
    })
    .map((r) => ({ entry: r, text: String(r.answers[q.id + "__other"]) }));
}
export function otherResponseTable(s: Survey, rows: Entry[]): string[][] {
  return [
    [
      "Вопрос",
      "Вариант",
      "Уточнение",
      "ID участника",
      "Имя / ФИО",
      "Отдел",
      "Регион",
      "Статус",
    ],
    ...s.questions.flatMap((q) =>
      otherResponses(s, q, rows).map(({ entry: r, text }) => [
        q.title,
        q.otherOption!,
        text,
        r.id,
        r.name,
        r.department || "",
        r.region || "",
        r.status,
      ]),
    ),
  ];
}
