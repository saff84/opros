import { type Survey, validateSurvey } from "./survey-model";
import { branchingError } from "./branching";
export function publicationCheck(s: Survey) {
  const errors: string[] = [],
    warnings: string[] = [];
  if (!validateSurvey(s))
    errors.push(
      "Проверьте обязательные поля, типы вопросов, варианты, лимиты, цвета и даты.",
    );
  const branch = branchingError(s);
  if (branch) errors.push(branch);
  for (const q of s.questions) {
    if (q.type === "multiple" && (q.minChoices || 0) > q.maxChoices)
      errors.push(`«${q.title}»: минимум больше максимума.`);
    if (q.type === "multiple" && q.maxChoices > q.options.length)
      warnings.push(
        `«${q.title}»: максимум больше числа вариантов; выбрать можно только доступные варианты.`,
      );
    if (q.type === "image" && q.options.some((o) => !q.optionImages?.[o]))
      warnings.push(`«${q.title}»: добавьте изображения для всех вариантов.`);
    if (q.image && !q.image.alt)
      warnings.push(
        `«${q.title}»: нет описания картинки для экранного диктора.`,
      );
    if (q.showWhen && !s.questions.some((p) => p.id === q.showWhen?.questionId))
      errors.push(`«${q.title}»: источник условия удалён.`);
  }
  if (new Set(s.questions.map((q) => q.title)).size < s.questions.length)
    warnings.push(
      "Есть одинаковые формулировки вопросов: участники могут их перепутать.",
    );
  if (s.endsAt && Date.parse(s.endsAt) <= Date.now())
    warnings.push("Дата завершения уже прошла: опрос будет закрыт.");
  if (s.startsAt && Date.parse(s.startsAt) > Date.now())
    warnings.push(
      "Опрос откроется по расписанию, до этого ссылка недоступна участникам.",
    );
  if (!s.questions.some((q) => q.required))
    warnings.push("Все вопросы необязательные: можно отправить пустую анкету.");
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
