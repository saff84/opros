"use client";
import { useState } from "react";
import type { Survey } from "../survey-model";
import { SurveyChooser } from "../survey-list";
import { apiJson } from "../api-client";
export default function CoverEditor({ survey, onChange, onBusy, onError }: {
  survey: Survey; onChange: (cover: Survey["cover"]) => void;
  onBusy: (busy: boolean) => void; onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { onError("Обложка должна быть не больше 4 МБ"); return; }
    setBusy(true); onBusy(true); onError("");
    try {
      const data = await apiJson(await fetch("/api/images", { method: "POST", headers: { "Content-Type": file.type }, body: file }));
      onChange({ ...data.image, fit: survey.cover?.fit || "cover", position: survey.cover?.position || "center" });
    } catch (error) { onError((error as Error).message); }
    finally { setBusy(false); onBusy(false); }
  }
  return <details className="question-config">
    <summary>Обложка в списке опросов</summary>
    <p className="small">Изображение карточки на главной странице. Если доступен один опрос, сразу открывается его анкета.</p>
    <fieldset disabled={busy}>
      <label className="label">Загрузить обложку · PNG, JPEG, WebP или GIF, до 4 МБ
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {busy && <p role="status">Загружаем обложку…</p>}
      {survey.cover && <>
        <label className="label">Описание изображения
          <input maxLength={300} value={survey.cover.alt} onChange={(e) => onChange({ ...survey.cover!, alt: e.target.value })} />
        </label>
        <div className="form-grid">
          <label className="label">Размещение
            <select value={survey.cover.fit || "cover"} onChange={(e) => onChange({ ...survey.cover!, fit: e.target.value as "cover" | "contain" })}>
              <option value="cover">Заполнить с обрезкой</option><option value="contain">Показать целиком</option>
            </select>
          </label>
          <label className="label">Фокус изображения
            <select value={survey.cover.position || "center"} onChange={(e) => onChange({ ...survey.cover!, position: e.target.value as "center" | "top" | "bottom" })}>
              <option value="center">По центру</option><option value="top">Сверху</option><option value="bottom">Снизу</option>
            </select>
          </label>
        </div>
        <button type="button" onClick={() => onChange(undefined)}>Убрать обложку</button>
      </>}
    </fieldset>
    <div className="cover-preview" inert><SurveyChooser surveys={[survey]} /></div>
  </details>;
}
