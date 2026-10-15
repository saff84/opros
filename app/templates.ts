import type { Survey, Question } from "./survey-model";
const question = (
  id: string,
  title: string,
  type: Question["type"],
  options: string[] = [],
  extra: Partial<Question> = {},
): Question => ({
  id,
  title,
  type,
  description: "",
  required: true,
  options,
  rows: [],
  maxChoices: 3,
  exclusive: [],
  ...extra,
});
export const builtInTemplates = [
  {
    id: "builtin-satisfaction",
    title: "Удовлетворённость",
    questions: [
      question("satisfaction", "Насколько вы довольны?", "stars", [
        "1",
        "2",
        "3",
        "4",
        "5",
      ]),
      question(
        "nps",
        "Насколько вероятно, что вы порекомендуете нас?",
        "nps",
        Array.from({ length: 11 }, (_, i) => String(i)),
      ),
      question("comment", "Что стоит улучшить?", "text", [], {
        required: false,
      }),
    ],
  },
  {
    id: "builtin-event",
    title: "После мероприятия",
    questions: [
      question(
        "rating",
        "Оцените мероприятие",
        "rating",
        Array.from({ length: 10 }, (_, i) => String(i + 1)),
      ),
      question("useful", "Что оказалось полезнее всего?", "text"),
      question("improve", "Что улучшить в следующий раз?", "text", [], {
        required: false,
      }),
    ],
  },
  {
    id: "builtin-team",
    title: "Потребности команды",
    questions: [
      question("priorities", "Расположите задачи по важности", "ranking", [
        "Обучение",
        "Материалы",
        "Поддержка",
        "Мероприятия",
      ]),
      question(
        "needs",
        "Какая поддержка нужна?",
        "multiple",
        ["Обучение", "Материалы", "Другое"],
        { otherOption: "Другое" },
      ),
      question("comment", "Ваши предложения", "text", [], { required: false }),
    ],
  },
];
export function templateSurvey(
  base: Survey,
  template: { title: string; questions: Question[] },
): Survey {
  return {
    ...base,
    id: "",
    title: template.title,
    description: "Ваше мнение помогает нам стать лучше.",
    intro: "Ответьте на несколько вопросов. Можно оставить отзыв без имени.",
    startsAt: undefined,
    endsAt: undefined,
    status: "draft",
    revision: 0,
    schemaVersion: 1,
    questions: structuredClone(template.questions),
  };
}
