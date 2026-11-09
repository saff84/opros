import { getDatabase } from "./runtime";
import type { Survey } from "./survey-model";
export const DEFAULT_HOME_TITLE = "SANEXT · Ваш опыт меняет маркетинг";
export const DEFAULT_HOME_DESCRIPTION = "Какая маркетинговая поддержка нужна отделам продаж SANEXT";
export function homePageDescription() {
  const setting = getDatabase().prepare("SELECT value FROM settings WHERE key='home_page_description'").get() as { value: string } | undefined;
  return setting?.value || DEFAULT_HOME_DESCRIPTION;
}
export function surveyPageDescription(survey: Pick<Survey, "description" | "pageDescription">) {
  return survey.pageDescription?.trim() || survey.description;
}
export function homePageTitle() {
  const setting = getDatabase().prepare("SELECT value FROM settings WHERE key='home_page_title'").get() as { value: string } | undefined;
  return setting?.value || DEFAULT_HOME_TITLE;
}
export function surveyPageTitle(survey: Pick<Survey, "title" | "pageTitle">) {
  return survey.pageTitle?.trim() || `${survey.title} · SANEXT`;
}
