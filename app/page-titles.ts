import { getDatabase } from "./runtime";
import type { Survey } from "./survey-model";
export const DEFAULT_HOME_TITLE = "SANEXT · Ваш опыт меняет маркетинг";
export function homePageTitle() {
  const setting = getDatabase().prepare("SELECT value FROM settings WHERE key='home_page_title'").get() as { value: string } | undefined;
  return setting?.value || DEFAULT_HOME_TITLE;
}
export function surveyPageTitle(survey: Pick<Survey, "title" | "pageTitle">) {
  return survey.pageTitle?.trim() || `${survey.title} · SANEXT`;
}
