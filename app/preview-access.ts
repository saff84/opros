import { createHash, randomBytes } from "node:crypto";
import { getDatabase, getSurvey } from "./runtime";
import type { Survey } from "./survey-model";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export function createPreviewLink(id: string) {
  const token = randomBytes(32).toString("hex");
  const expires = Date.now() + 7 * 24 * 3600_000;
  getDatabase().prepare("INSERT INTO survey_preview_links VALUES (?,?,?) ON CONFLICT(survey_id) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires")
    .run(id, hash(token), expires);
  return { token, expires };
}
export function previewSurvey(token: string | null): Survey | null {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = getDatabase().prepare("SELECT survey_id FROM survey_preview_links WHERE token_hash=? AND expires>?")
    .get(hash(token), Date.now()) as { survey_id: string } | undefined;
  return row ? getSurvey(row.survey_id) : null;
}
export function previewWithImages(s: Survey, token: string): Survey {
  const image = (value: { src: string; alt: string }) => ({ ...value, src: value.src + "?preview=" + token });
  return {
    ...s,
    questions: s.questions.map(q => ({ ...q,
      ...(q.image ? { image: image(q.image) } : {}),
      ...(q.optionImages ? { optionImages: Object.fromEntries(Object.entries(q.optionImages).map(([key, value]) => [key, image(value)])) } : {}),
    })),
    ...(s.welcome ? { welcome: { ...s.welcome, images: s.welcome.images?.map(image) } } : {}),
  };
}
