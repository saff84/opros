import { type Survey, type AnswerMap, emptyAnswers } from "./survey-model";
import { sanitizeAnswers } from "./branching";
export function recoverCompatibleAnswers(
  next: Survey,
  previousQuestions: Survey["questions"],
  previousAnswers: AnswerMap,
  serverAnswers: AnswerMap = emptyAnswers(next),
) {
  const answers = { ...serverAnswers };
  for (const q of next.questions) {
    const before = previousQuestions.find((p) => p.id === q.id);
    if (
      before &&
      JSON.stringify(before) === JSON.stringify(q) &&
      previousAnswers[q.id] !== undefined
    ) {
      answers[q.id] = previousAnswers[q.id];
      if (q.otherOption && previousAnswers[q.id + "__other"] !== undefined)
        answers[q.id + "__other"] = previousAnswers[q.id + "__other"];
    }
  }
  return sanitizeAnswers(next, answers);
}
export function announceSurveyUpdate() {
  try {
    localStorage.setItem("sanext-survey-updated", String(Date.now()));
  } catch {}
}
