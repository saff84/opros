"use client";
import { useState } from "react";
import type { Survey, Welcome } from "../survey-model";
import { welcomeDefaults } from "../../scripts/welcome.mjs";
import { WelcomeBlock } from "../welcome-block";
export default function WelcomeEditor({
  survey,
  onChange,
  onBusy,
  onError,
}: {
  survey: Survey;
  onChange: (w: Welcome) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const w = { ...welcomeDefaults, ...survey.welcome } as Required<Welcome>;
  const update = (patch: Welcome) => onChange({ ...survey.welcome, ...patch });
  async function upload(files: File[]) {
    if (!files.length) return;
    if (w.images.length + files.length > 4) {
      onError("В приветственный блок можно добавить до 4 картинок");
      return;
    }
    if (files.some((file) => file.size > 4 * 1024 * 1024)) {
      onError("Каждая картинка должна быть не больше 4 МБ");
      return;
    }
    setUploading(true);
    onBusy(true);
    onError("");
    const added: { src: string; alt: string }[] = [];
    try {
      for (const file of files) {
        const response = await fetch("/api/images", {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const data = await response.json();
        if (!response.ok)
          throw Error(data.error || "Не удалось загрузить картинку");
        added.push(data.image);
      }
    } catch (error) {
      onError((error as Error).message);
    } finally {
      if (added.length) update({ images: [...w.images, ...added] });
      setUploading(false);
      onBusy(false);
    }
  }
  return (
    <div className="welcome-settings">
      <section className="summary-card">
        <h3>Приветственный блок</h3>
        <p className="small">
          Панель рядом с вопросами. Её оформление можно менять без создания
          новой версии вопросов. Пустые заголовок и описание скроют
          соответствующий текст; сброс вернёт название и подзаголовок опроса.
        </p>
        <fieldset disabled={uploading} className="welcome-fields">
          <label className="label">
            Надпись над заголовком
            <input
              maxLength={160}
              value={w.eyebrow}
              onChange={(e) => update({ eyebrow: e.target.value })}
            />
            <span>
              Например: «Помогите нам стать лучше». Можно оставить пустой.
            </span>
          </label>
          <label className="label">
            Заголовок блока
            <textarea
              maxLength={300}
              value={w.heading ?? survey.title}
              onChange={(e) => update({ heading: e.target.value })}
            />
            <span>
              Независим от названия опроса. Переносы строк сохраняются.
            </span>
          </label>
          <label className="label">
            Описание блока
            <textarea
              maxLength={4000}
              value={w.description ?? survey.description}
              onChange={(e) => update({ description: e.target.value })}
            />
            <span>
              Кратко объясните цель опроса или добавьте обращение к участникам.
            </span>
          </label>
          <div className="form-grid">
            <label className="label">
              Выравнивание
              <select
                value={w.align}
                onChange={(e) =>
                  update({ align: e.target.value as Welcome["align"] })
                }
              >
                <option value="left">По левому краю</option>
                <option value="center">По центру</option>
              </select>
            </label>
            <label className="label">
              Размер заголовка
              <input
                type="number"
                min={24}
                max={72}
                value={w.titleSize}
                onChange={(e) => update({ titleSize: Number(e.target.value) })}
              />
              <span>
                От 24 до 72 px, на узком экране уменьшается автоматически.
              </span>
            </label>
            <label className="label">
              Цвет текста
              <input
                type="color"
                value={w.textColor}
                onChange={(e) => update({ textColor: e.target.value })}
              />
              <span>Фон задаётся на вкладке «Оформление».</span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={w.showStripe}
                onChange={(e) => update({ showStripe: e.target.checked })}
              />
              Цветная полоса внизу
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={w.showFooter}
              onChange={(e) => update({ showFooter: e.target.checked })}
            />
            Показывать нижнюю подпись
          </label>
          {w.showFooter && (
            <div className="form-grid">
              <label className="label">
                Символ
                <input
                  maxLength={12}
                  value={w.symbol}
                  onChange={(e) => update({ symbol: e.target.value })}
                />
                <span>Например ↗, ★ или пустая строка.</span>
              </label>
              <label className="label">
                Нижняя подпись
                <textarea
                  maxLength={500}
                  value={w.footer}
                  onChange={(e) => update({ footer: e.target.value })}
                />
              </label>
            </div>
          )}
          <h3>Изображения · {w.images.length} из 4</h3>
          <label className="label">
            Добавить картинки
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading || w.images.length >= 4}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                void upload(files);
              }}
            />
            <span>
              PNG, JPEG, WebP или GIF. До 4 МБ на файл. Можно выбрать несколько
              файлов.
            </span>
          </label>
          {uploading && <p role="status">Загружаем картинки…</p>}
          {w.images.map((image, i) => (
            <div className="welcome-image-editor" key={image.src + i}>
              <img src={image.src} alt={image.alt} />
              <label className="label">
                Подпись к картинке {i + 1}
                <input
                  maxLength={300}
                  value={image.alt}
                  onChange={(e) =>
                    update({
                      images: w.images.map((item, j) =>
                        j === i ? { ...item, alt: e.target.value } : item,
                      ),
                    })
                  }
                />
                <span>
                  Отображается под картинкой и читается экранным диктором.
                </span>
              </label>
              <div className="actions">
                <button
                  type="button"
                  disabled={i === 0}
                  aria-label={`Картинка ${i + 1}: выше`}
                  onClick={() => {
                    const images = [...w.images];
                    [images[i - 1], images[i]] = [images[i], images[i - 1]];
                    update({ images });
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === w.images.length - 1}
                  aria-label={`Картинка ${i + 1}: ниже`}
                  onClick={() => {
                    const images = [...w.images];
                    [images[i + 1], images[i]] = [images[i], images[i + 1]];
                    update({ images });
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update({ images: w.images.filter((_, j) => j !== i) })
                  }
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
          <div className="form-grid">
            <label className="label">
              Расположение картинок
              <select
                value={w.imagePosition}
                onChange={(e) =>
                  update({
                    imagePosition: e.target.value as Welcome["imagePosition"],
                  })
                }
              >
                <option value="top">Над текстом</option>
                <option value="bottom">Под описанием</option>
              </select>
            </label>
            <label className="label">
              Отображение картинок
              <select
                value={w.imageFit}
                onChange={(e) =>
                  update({ imageFit: e.target.value as Welcome["imageFit"] })
                }
              >
                <option value="contain">Целиком, без обрезки</option>
                <option value="cover">Заполнить область с обрезкой</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => onChange({})}
          >
            Сбросить оформление блока
          </button>
        </fieldset>
      </section>
      <section
        className="welcome-live-preview"
        aria-label="Предпросмотр приветственного блока"
      >
        <WelcomeBlock survey={survey} />
      </section>
    </div>
  );
}
