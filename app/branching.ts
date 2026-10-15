import type { Survey, Question, AnswerMap } from "./survey-model";
import * as core from "../scripts/branching.mjs";
export type ShowWhen = {
  questionId: string;
  operator: "equals" | "notEquals" | "contains" | "answered";
  value: string;
  row?: string;
};
export const visibleQuestions = core.visibleQuestions as (
  survey: Survey,
  answers: AnswerMap,
) => Question[];
export const sanitizeAnswers = core.sanitizeAnswers as (
  survey: Survey,
  answers: AnswerMap,
) => AnswerMap;
export const branchingError = core.branchingError as (
  survey: Survey,
) => string | null;
