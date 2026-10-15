"use client";
import { visibleQuestions, branchingError } from "../branching";
import { useState } from "react";
import {
  Survey,
  Question,
  emptyAnswers,
  validateSurvey,
} from "../survey-model";
import { QuestionInput, theme } from "../question-input";
export function newQuestion(): Question {
  return {
    id:
      "q_" +
      Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
        n.toString(16).padStart(8, "0"),
      ).join(""),
    title: "Новый вопрос",
    description: "",
    type: "single",
    required: true,
    options: ["Вариант 1", "Вариант 2"],
    rows: [],
    maxChoices: 3,
    exclusive: [],
  };
}
export default function Editor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Survey;
  onSave: (s: Survey) => Promise<void>;
  onCancel: () => void;
}) {
  const [s, setS] = useState<Survey>(() => structuredClone(initial)),
    [tab, setTab] = useState("content"),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState<string | null>(null),
    [error, setError] = useState(""),
    [previewAnswers, setPreviewAnswers] = useState(() => emptyAnswers(initial));
  const update = (patch: Partial<Survey>) => setS((v) => ({ ...v, ...patch }));
  const question = (i: number, patch: Partial<Question>) =>
    update({
      questions: s.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)),
    });
  async function save() {
    setError("");
    const clean = (values: string[]) =>
      values.map((value) => value.trim()).filter(Boolean);
    const prepared = {
      ...s,
      questions: s.questions.map((q) => ({
        ...q,
        options: clean(q.options),
        rows: clean(q.rows),
        exclusive: clean(q.exclusive),
      })),
    };
    const branchError = branchingError(prepared);
    if (branchError) {
      setError(branchError);
      return;
    }
    if (!validateSurvey(prepared)) {
      setError(
        "Проверьте поля: название и вопросы обязательны, для выбора нужны минимум два уникальных варианта, для матрицы — строки.",
      );
      return;
    }
    setBusy(true);
    try {
      await onSave(prepared);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="editor" inert={busy}>
      <div className="dash-title">
        <div>
          <span className="eyebrow">КОНСТРУКТОР ОПРОСА</span>
          <h2>{s.title || "Новый опрос"}</h2>
        </div>
        <div className="actions">
          <button disabled={busy} onClick={onCancel}>
            Отмена
          </button>
          <button
            className="primary"
            disabled={busy || !!uploading}
            onClick={save}
          >
            {busy ? "Сохраняем…" : "Сохранить изменения"}
          </button>
        </div>
      </div>
      <div className="view-tabs">
        <button
          className={tab === "content" ? "active" : ""}
          onClick={() => setTab("content")}
        >
          Вопросы и тексты
        </button>
        <button
          className={tab === "design" ? "active" : ""}
          onClick={() => setTab("design")}
        >
          Оформление
        </button>
        <button
          className={tab === "preview" ? "active" : ""}
          onClick={() => setTab("preview")}
        >
          Предпросмотр
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {tab === "content" ? (
        <>
          <div className="summary-card">
            <div className="form-grid">
              <label className="label">
                Название
                <input
                  maxLength={160}
                  value={s.title}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              <label className="label">
                Статус
                <select
                  value={s.status}
                  onChange={(e) =>
                    update({ status: e.target.value as Survey["status"] })
                  }
                >
                  <option value="draft">Неактивен · черновик</option>
                  <option value="active">Активен · принимает ответы</option>
                  <option value="archived">Неактивен · архив</option>
                </select>
              </label>
            </div>
            <label className="label">
              Подзаголовок
              <input
                maxLength={4000}
                value={s.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </label>
            <label className="label">
              Вступление
              <textarea
                maxLength={4000}
                value={s.intro}
                onChange={(e) => update({ intro: e.target.value })}
              />
            </label>
            <label className="label">
              Сообщение после отправки
              <textarea
                maxLength={4000}
                value={s.thanks}
                onChange={(e) => update({ thanks: e.target.value })}
              />
            </label>
          </div>
          {(initial.schemaVersion || 1) >= 1 && (
            <div className="note">
              Можно изменять формулировки и варианты, добавлять, удалять и
              перемещать вопросы. При сохранении изменений вопросов создаётся
              новая версия по той же ссылке. Прежние ответы остаются в истории
              версий.
            </div>
          )}
          {s.questions.map((q, i) => (
            <section key={q.id} className="summary-card question-editor">
              <div className="question-head">
                <span className="eyebrow">
                  ВОПРОС {String(i + 1).padStart(2, "0")}
                </span>
                <div className="actions">
                  <button
                    aria-label="Переместить выше"
                    disabled={busy || i === 0}
                    onClick={() => {
                      const qs = [...s.questions];
                      [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
                      update({ questions: qs });
                    }}
                  >
                    ↑
                  </button>
                  <button
                    aria-label="Переместить ниже"
                    disabled={busy || i === s.questions.length - 1}
                    onClick={() => {
                      const qs = [...s.questions];
                      [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]];
                      update({ questions: qs });
                    }}
                  >
                    ↓
                  </button>
                  <button
                    disabled={busy || s.questions.length === 1}
                    onClick={() =>
                      update({
                        questions: s.questions.filter((_, j) => i !== j),
                      })
                    }
                  >
                    Удалить
                  </button>
                </div>
              </div>
              <fieldset disabled={busy}>
                <div className="question-config">
                  <h3>Картинка к вопросу</h3>
                  <p className="small">
                    PNG, JPEG, WebP или GIF · до 4 МБ. Файл хранится вместе с
                    опросом.
                  </p>
                  <label className="label">
                    Загрузить изображение
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      disabled={!!uploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        if (file.size > 4 * 1024 * 1024) {
                          setError("Картинка должна быть не больше 4 МБ");
                          return;
                        }
                        setUploading(q.id);
                        setError("");
                        try {
                          const response = await fetch("/api/images", {
                            method: "POST",
                            headers: { "Content-Type": file.type },
                            body: file,
                          });
                          const data = await response.json();
                          if (!response.ok)
                            throw Error(
                              data.error || "Не удалось загрузить файл",
                            );
                          setS((previous) => ({
                            ...previous,
                            questions: previous.questions.map((item) =>
                              item.id === q.id
                                ? { ...item, image: data.image }
                                : item,
                            ),
                          }));
                        } catch (error) {
                          setError((error as Error).message);
                        } finally {
                          setUploading(null);
                        }
                      }}
                    />
                  </label>
                  {uploading === q.id && (
                    <p role="status">Загружаем картинку…</p>
                  )}
                  {q.image && (
                    <>
                      <img
                        className="editor-image"
                        src={q.image.src}
                        alt={q.image.alt}
                      />
                      <label className="label">
                        Описание картинки
                        <input
                          maxLength={300}
                          value={q.image.alt}
                          onChange={(e) =>
                            question(i, {
                              image: { ...q.image!, alt: e.target.value },
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => question(i, { image: undefined })}
                      >
                        Убрать картинку
                      </button>
                    </>
                  )}
                </div>
                <div className="question-config">
                  <h3>Условие показа</h3>
                  <label className="label">
                    Показывать вопрос
                    <select
                      value={q.showWhen?.questionId || ""}
                      onChange={(e) =>
                        question(i, {
                          showWhen: e.target.value
                            ? {
                                questionId: e.target.value,
                                operator: "equals",
                                value: "",
                                ...(s.questions.find(
                                  (p) => p.id === e.target.value,
                                )?.type === "matrix"
                                  ? {
                                      row: s.questions.find(
                                        (p) => p.id === e.target.value,
                                      )?.rows[0],
                                    }
                                  : {}),
                              }
                            : undefined,
                        })
                      }
                    >
                      <option value="">Всегда</option>
                      {q.showWhen &&
                        !s.questions
                          .slice(0, i)
                          .some((p) => p.id === q.showWhen!.questionId) && (
                          <option value={q.showWhen.questionId} disabled>
                            Источник недоступен — выберите вопрос выше
                          </option>
                        )}
                      {s.questions.slice(0, i).map((p) => (
                        <option key={p.id} value={p.id}>
                          Если ответ на «{p.title}»
                        </option>
                      ))}
                    </select>
                  </label>
                  {q.showWhen && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => question(i, { showWhen: undefined })}
                    >
                      Убрать условие
                    </button>
                  )}
                  {q.showWhen &&
                    (() => {
                      const parent = s.questions.find(
                        (p) => p.id === q.showWhen!.questionId,
                      );
                      return (
                        <>
                          <label className="label">
                            Условие
                            <select
                              value={q.showWhen!.operator}
                              onChange={(e) =>
                                question(i, {
                                  showWhen: {
                                    ...q.showWhen!,
                                    operator: e.target.value as NonNullable<
                                      Question["showWhen"]
                                    >["operator"],
                                  },
                                })
                              }
                            >
                              <option value="equals">
                                Равен / выбран вариант
                              </option>
                              <option value="notEquals">
                                Не равен / вариант не выбран
                              </option>
                              <option value="contains">Содержит</option>
                              <option value="answered">Ответ заполнен</option>
                            </select>
                          </label>
                          {parent?.type === "matrix" && (
                            <label className="label">
                              Строка матрицы
                              <select
                                value={
                                  parent.rows.includes(q.showWhen!.row || "")
                                    ? q.showWhen!.row
                                    : ""
                                }
                                onChange={(e) =>
                                  question(i, {
                                    showWhen: {
                                      ...q.showWhen!,
                                      row: e.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="" disabled>
                                  Выберите строку
                                </option>
                                {parent.rows.map((row) => (
                                  <option key={row}>{row}</option>
                                ))}
                              </select>
                            </label>
                          )}
                          {q.showWhen!.operator !== "answered" && (
                            <label className="label">
                              Ответ
                              {parent?.type === "text" ? (
                                <input
                                  maxLength={3000}
                                  value={q.showWhen!.value}
                                  onChange={(e) =>
                                    question(i, {
                                      showWhen: {
                                        ...q.showWhen!,
                                        value: e.target.value,
                                      },
                                    })
                                  }
                                />
                              ) : (
                                <select
                                  value={q.showWhen!.value}
                                  onChange={(e) =>
                                    question(i, {
                                      showWhen: {
                                        ...q.showWhen!,
                                        value: e.target.value,
                                      },
                                    })
                                  }
                                >
                                  <option value="">Выберите ответ</option>
                                  {parent?.options.map((value) => (
                                    <option key={value}>{value}</option>
                                  ))}
                                </select>
                              )}
                            </label>
                          )}
                          <p className="small">
                            Вопрос появится только при выполнении условия. Можно
                            ссылаться на любой вопрос выше; цепочки условий
                            поддерживаются.
                          </p>
                        </>
                      );
                    })()}
                </div>
                <label className="label">
                  Формулировка
                  <input
                    maxLength={300}
                    value={q.title}
                    onChange={(e) => question(i, { title: e.target.value })}
                  />
                </label>
                <div className="form-grid">
                  <label className="label">
                    Тип ответа
                    <select
                      value={q.type}
                      onChange={(e) =>
                        question(i, {
                          type: e.target.value as Question["type"],
                          rows:
                            e.target.value === "matrix" && !q.rows.length
                              ? ["Строка 1", "Строка 2"]
                              : q.rows,
                        })
                      }
                    >
                      <option value="single">Один вариант</option>
                      <option value="multiple">Несколько вариантов</option>
                      <option value="text">Свободный текст</option>
                      <option value="matrix">Матрица оценок</option>
                    </select>
                  </label>
                  <label className="label">
                    Подсказка
                    <input
                      maxLength={2000}
                      value={q.description}
                      onChange={(e) =>
                        question(i, { description: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) =>
                      question(i, { required: e.target.checked })
                    }
                  />
                  Обязательный ответ
                </label>
                {q.type !== "text" && (
                  <label className="label">
                    Варианты ответа · каждый с новой строки
                    <textarea
                      value={q.options.join("\n")}
                      onChange={(e) =>
                        question(i, { options: e.target.value.split("\n") })
                      }
                    />
                  </label>
                )}
                {q.type === "matrix" && (
                  <label className="label">
                    Строки матрицы · каждая с новой строки
                    <textarea
                      value={q.rows.join("\n")}
                      onChange={(e) =>
                        question(i, { rows: e.target.value.split("\n") })
                      }
                    />
                  </label>
                )}
                {q.type === "multiple" && (
                  <>
                    <label className="label">
                      Максимум вариантов
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={q.maxChoices}
                        onChange={(e) =>
                          question(i, { maxChoices: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="label">
                      Исключающие варианты · каждый с новой строки
                      <span>
                        {" "}
                        При выборе такого варианта остальные снимаются. Текст
                        должен совпадать с вариантом выше.
                      </span>
                      <textarea
                        value={q.exclusive.join("\n")}
                        onChange={(e) =>
                          question(i, {
                            exclusive: e.target.value
                              ? e.target.value.split("\n")
                              : [],
                          })
                        }
                      />
                    </label>
                  </>
                )}
              </fieldset>
            </section>
          ))}
          <button
            className="secondary"
            disabled={busy || s.questions.length >= 60}
            onClick={() =>
              update({ questions: [...s.questions, newQuestion()] })
            }
          >
            ＋ Добавить вопрос
          </button>
        </>
      ) : tab === "design" ? (
        <div className="summary-card">
          <h3>Цвета опроса</h3>
          <p>
            Логотип и шрифт SANEXT сохраняются. Цвет кнопок и фон вступления
            можно настроить для каждой кампании.
          </p>
          <div className="form-grid">
            <label className="label">
              Основной цвет
              <input
                type="color"
                value={s.accent}
                onChange={(e) => update({ accent: e.target.value })}
              />
            </label>
            <label className="label">
              Фон
              <input
                type="color"
                value={s.background}
                onChange={(e) => update({ background: e.target.value })}
              />
            </label>
          </div>
          <div className="palette-presets">
            {[
              ["SANEXT", "#004ecc", "#daeaf2"],
              ["Тёплый", "#b94418", "#fff0e5"],
              ["Лес", "#156b50", "#e4f2eb"],
              ["Индиго", "#6345b5", "#eee9fa"],
            ].map(([label, accent, background]) => (
              <button
                className="secondary"
                key={label}
                onClick={() => update({ accent, background })}
              >
                <span style={{ background: accent }} />
                {label}
              </button>
            ))}
          </div>
          <div className="theme-sample" style={theme(s)}>
            <h2>{s.title}</h2>
            <p>{s.description}</p>
            <button className="primary">Начать опрос →</button>
          </div>
        </div>
      ) : (
        <div className="preview-frame" style={theme(s)}>
          <div className="note">
            Предпросмотр. Ответы здесь не сохраняются и не попадают в
            статистику.
          </div>
          <div className="preview-intro">
            <span className="eyebrow">ОПРОС SANEXT</span>
            <h1>{s.title}</h1>
            <p className="pre">{s.intro}</p>
          </div>
          {visibleQuestions(s, previewAnswers).map((q, i) => (
            <section className="summary-card" key={q.id}>
              <span className="eyebrow">
                ВОПРОС {i + 1} ·{" "}
                {q.required ? "ОБЯЗАТЕЛЬНЫЙ" : "НЕОБЯЗАТЕЛЬНЫЙ"}
              </span>
              <h2>{q.title}</h2>
              <p>{q.description}</p>
              <QuestionInput
                question={q}
                value={previewAnswers[q.id]}
                onChange={(v) =>
                  setPreviewAnswers((a) => ({ ...a, [q.id]: v }))
                }
              />
            </section>
          ))}
          <div className="note">{s.thanks}</div>
        </div>
      )}
    </div>
  );
}
