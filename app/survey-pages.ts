import { visibleQuestions } from "./branching";
import { otherKey } from "../scripts/survey-features.mjs";
import {
  validateAnswers,
  type Survey,
  type Question,
  type AnswerMap,
} from "./survey-model";
export type QuestionPage = { id: string; questions: Question[] };
export function groupQuestionPages(questions: Question[]): QuestionPage[] {
  const pages: QuestionPage[] = [];
  for (const question of questions) {
    if (!pages.length || question.startNewPage !== false)
      pages.push({ id: question.id, questions: [] });
    pages[pages.length - 1].questions.push(question);
  }
  return pages;
}
export function visiblePages(
  survey: Survey,
  answers: AnswerMap,
): QuestionPage[] {
  const visible = new Set(visibleQuestions(survey, answers).map((q) => q.id));
  return groupQuestionPages(survey.questions)
    .map((page) => ({
      ...page,
      questions: page.questions.filter((q) => visible.has(q.id)),
    }))
    .filter((page) => page.questions.length > 0);
}
export function pageAnswerError(
  survey: Survey,
  page: QuestionPage,
  answers: AnswerMap,
): string | null {
  for (const q of page.questions) {
    const error = validateAnswers(
      { ...survey, questions: [{ ...q, showWhen: undefined }] },
      {
        [q.id]: answers[q.id],
        ...(q.otherOption ? { [otherKey(q.id)]: answers[otherKey(q.id)] } : {}),
      },
      true,
    );
    if (error) return error;
  }
  return null;
}
