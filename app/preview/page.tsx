import { previewSurvey, previewWithImages } from "../preview-access";
import PreviewForm from "./preview-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Предпросмотр опроса", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const survey = previewSurvey(token || null);
  if (!survey || !token) return <main className="dashboard"><h1>Предпросмотр недоступен</h1><p>Ссылка отключена или срок её действия истёк. Попросите организатора создать новую.</p></main>;
  return <PreviewForm survey={previewWithImages(survey, token)} />;
}
