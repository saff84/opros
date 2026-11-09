import Home from "./survey-home";
import { getDatabase, getSurvey } from "./runtime";
import { isSurveyOpen } from "../scripts/survey-features.mjs";
import { homePageTitle, surveyPageTitle, homePageDescription, surveyPageDescription } from "./page-titles";
export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ survey?: string }> }) {
  const { survey: id } = await searchParams;
  const survey = id ? getSurvey(id) : null;
  if (survey && isSurveyOpen(survey)) return { title: surveyPageTitle(survey), description: surveyPageDescription(survey) };
  if (!id) {
    const active = getDatabase().prepare("SELECT definition FROM surveys").all()
      .map(row => JSON.parse(row.definition as string)).filter(s => isSurveyOpen(s) && !s.unlisted);
    if (active.length === 1) return { title: surveyPageTitle(active[0]), description: surveyPageDescription(active[0]) };
  }
  return { title: homePageTitle(), description: homePageDescription() };
}
export default function Page() { return <Home homeTitle={homePageTitle()} homeDescription={homePageDescription()} />; }
