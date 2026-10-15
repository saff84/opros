"use client";
import type { Question } from "../survey-model";
export default function ExtendedQuestion({
  question: q,
  onChange,
  onBusy,
  onError,
  disabled,
}: {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  onBusy: (value: boolean) => void;
  onError: (message: string) => void;
  disabled: boolean;
}) {
  async function upload(option: string, file?: File) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      onError("Картинка должна быть не больше 4 МБ");
      return;
    }
    onBusy(true);
    onError("");
    try {
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      onChange({
        optionImages: {
          ...q.optionImages,
          [option]: { ...data.image, alt: option },
        },
      });
    } catch (error) {
      onError((error as Error).message);
    } finally {
      onBusy(false);
    }
  }
  return (
    <>
      {["single", "multiple", "image"].includes(q.type) && (
        <label className="label">
          Текстовое уточнение варианта
          <span>
            При выборе этого варианта появится поле ввода. Уточнение сохранится
            в ответе. Снимать выбор будет скрывать и очищать поле.
          </span>
          <select
            value={q.otherOption || ""}
            onChange={(e) =>
              onChange({ otherOption: e.target.value || undefined })
            }
          >
            <option value="">Не использовать</option>
            {q.options.filter(Boolean).map((option, i) => (
              <option key={i} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      )}
      {q.type === "image" && (
        <details className="question-config" open>
          <summary>Картинки вариантов</summary>
          <p className="small">
            До 4 МБ: PNG, JPEG, WebP, GIF. Подпись варианта остаётся доступной и
            без картинки.
          </p>
          {q.options.filter(Boolean).map((option, i) => (
            <div className="welcome-image-editor" key={option + i}>
              {q.optionImages?.[option] && (
                <img
                  src={q.optionImages[option].src}
                  alt={q.optionImages[option].alt}
                />
              )}
              <label className="label">
                {option}
                <input
                  type="file"
                  disabled={disabled}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void upload(option, file);
                  }}
                />
              </label>
              {q.optionImages?.[option] && (
                <button
                  type="button"
                  onClick={() => {
                    const images = { ...q.optionImages };
                    delete images[option];
                    onChange({ optionImages: images });
                  }}
                >
                  Убрать изображение
                </button>
              )}
            </div>
          ))}
        </details>
      )}
    </>
  );
}
