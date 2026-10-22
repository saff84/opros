"use client";
import { branchingError } from "../branching";
import { useState } from "react";
import {
  Survey,
  Question,
  emptyAnswers,
  validateSurvey,
} from "../survey-model";
import { QuestionInput, theme } from "../question-input";
import WelcomeEditor from "./welcome-editor";
import StartFormEditor from "./start-form-editor";
import { validStartForm } from "../../scripts/start-form.mjs";
import { WelcomeBlock } from "../welcome-block";
import { groupQuestionPages, visiblePages } from "../survey-pages";
import { publicationCheck } from "../publication";
import { pageAnswerError } from "../survey-pages";
import { otherKey } from "../../scripts/survey-features.mjs";
import ExtendedQuestion from "./extended-question";
import PreviewLink from "./preview-link";
function localDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
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
    [device, setDevice] = useState("desktop"),
    [previewStep, setPreviewStep] = useState(0),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState<string | null>(null),
    [error, setError] = useState(""),
    [deletedQuestion, setDeletedQuestion] = useState<{
      question: Question;
      index: number;
    } | null>(null),
    [previewAnswers, setPreviewAnswers] = useState(() => emptyAnswers(initial));
  const update = (patch: Partial<Survey>) => setS((v) => ({ ...v, ...patch }));
  const question = (i: number, patch: Partial<Question>) =>
    update({
      questions: s.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)),
    });
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const pageGroups = groupQuestionPages(s.questions);
  const preflight = publicationCheck(s);
  const previewPages = visiblePages(s, previewAnswers);
  const previewIndex = Math.min(
    previewStep,
    Math.max(0, previewPages.length - 1),
  );
  const pageNumbers = new Map(
    pageGroups.flatMap((page, i) =>
      page.questions.map((q) => [q.id, i + 1] as const),
    ),
  );
  function removeQuestion(id: string) {
    const index = s.questions.findIndex((q) => q.id === id);
    if (busy || s.questions.length <= 1 || index < 0) return;
    setDeletedQuestion({
      question: structuredClone(s.questions[index]),
      index,
    });
    setS((current) => ({
      ...current,
      questions: current.questions.filter((q) => q.id !== id),
    }));
    setError("");
  }
  function undoDeletion() {
    if (!deletedQuestion) return;
    setS((current) => {
      if (current.questions.some((q) => q.id === deletedQuestion.question.id))
        return current;
      const questions = [...current.questions];
      questions.splice(
        Math.min(deletedQuestion.index, questions.length),
        0,
        deletedQuestion.question,
      );
      return { ...current, questions };
    });
    setDeletedQuestion(null);
    setError("");
  }
  async function save() {
    setError("");
    if (!validStartForm(s.startForm)) {
      setTab("start");
      setError(
        "Проверьте стартовую форму: названия полей и текст кнопки не должны быть пустыми; соблюдайте ограничения длины.",
      );
      return;
    }
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
    const invalidLimit = prepared.questions.find(
      (q) =>
        q.type === "multiple" &&
        (!Number.isInteger(q.maxChoices) ||
          q.maxChoices < 1 ||
          q.maxChoices > 100 ||
          !Number.isInteger(q.minChoices ?? 0) ||
          (q.minChoices ?? 0) < 0 ||
          (q.minChoices ?? 0) > q.maxChoices ||
          (q.minChoices ?? 0) >
            q.options.filter((x) => !q.exclusive.includes(x)).length),
    );
    if (invalidLimit) {
      setError(
        `Проверьте количество ответов в вопросе «${invalidLimit.title}»: минимум от 0 до максимума и не больше числа обычных вариантов; максимум от 1 до 100.`,
      );
      return;
    }
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
          <p className="editor-save-state">
            Вопросов: {s.questions.length} · Страниц: {pageGroups.length} ·{" "}
            {dirty ? "Есть несохранённые изменения" : "Изменений нет"}
          </p>
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
        {deletedQuestion && (
          <div
            className="editor-deletion-notice"
            role="status"
            aria-live="polite"
          >
            <span>
              Вопрос «{deletedQuestion.question.title}» удалён из редактора.
              Осталось: {s.questions.length}. Нажмите «Сохранить изменения»,
              чтобы применить удаление к опросу.
            </span>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={undoDeletion}
            >
              Вернуть вопрос
            </button>
            {s.questions.some(
              (q) => q.showWhen?.questionId === deletedQuestion.question.id,
            ) && (
              <span className="editor-deletion-warning">
                Другие вопросы зависят от удалённого. Перед сохранением измените
                их условия показа или верните вопрос.
              </span>
            )}
          </div>
        )}
      </div>
      <div className="view-tabs">
        <button
          className={tab === "start" ? "active" : ""}
          onClick={() => setTab("start")}
        >
          Стартовая форма
        </button>
        <button
          className={tab === "check" ? "active" : ""}
          onClick={() => setTab("check")}
        >
          Проверка перед публикацией{" "}
          {preflight.errors.length ? `· ${preflight.errors.length}` : "✓"}
        </button>
        <button
          className={tab === "welcome" ? "active" : ""}
          onClick={() => setTab("welcome")}
        >
          Приветственный блок
        </button>
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
            <details className="question-config">
              <summary>Расписание публикации</summary>
              <p className="small">
                Опрос должен иметь статус «Активен». Вне указанных дат он скрыт
                и не принимает ответы. Время вводится в часовом поясе вашего
                браузера.
              </p>
              <div className="form-grid">
                <label className="label">
                  Открыть с
                  <input
                    type="datetime-local"
                    value={localDate(s.startsAt)}
                    onChange={(e) =>
                      update({
                        startsAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : undefined,
                      })
                    }
                  />
                </label>
                <label className="label">
                  Закрыть после
                  <input
                    type="datetime-local"
                    value={localDate(s.endsAt)}
                    onChange={(e) =>
                      update({
                        endsAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : undefined,
                      })
                    }
                  />
                </label>
              </div>
            </details>
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
                  {" · СТРАНИЦА "}
                  {pageNumbers.get(q.id)}
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
                    type="button"
                    aria-label={`Удалить вопрос ${i + 1}: ${q.title}`}
                    title={
                      s.questions.length === 1
                        ? "В опросе должен остаться хотя бы один вопрос"
                        : "Удалить вопрос из редактора"
                    }
                    disabled={busy || s.questions.length === 1}
                    onClick={() => removeQuestion(q.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
              <fieldset disabled={busy || uploading === q.id}>
                <label className="label">
                  Страница опроса
                  <span>
                    {i === 0
                      ? "Первый вопрос начинает первую страницу."
                      : "Объедините вопрос с предыдущим, чтобы участник отвечал на них вместе. У каждого вопроса сохраняются свои тип ответа, обязательность и условия показа."}
                  </span>
                  <select
                    disabled={i === 0}
                    value={i === 0 || q.startNewPage !== false ? "new" : "same"}
                    onChange={(e) =>
                      question(i, { startNewPage: e.target.value === "new" })
                    }
                  >
                    <option value="new">Начать новую страницу</option>
                    <option value="same">
                      На одной странице с предыдущим вопросом
                    </option>
                  </select>
                </label>
                <label className="label">
                  Формулировка
                  <span>Текст вопроса, который увидит участник.</span>
                  <input
                    maxLength={300}
                    value={q.title}
                    onChange={(e) => question(i, { title: e.target.value })}
                  />
                </label>
                <div className="form-grid">
                  <label className="label">
                    Тип ответа
                    <span>
                      Один вариант, несколько, свободный текст или оценка каждой
                      строки в матрице.
                    </span>
                    <select
                      value={q.type}
                      onChange={(e) =>
                        question(i, {
                          type: e.target.value as Question["type"],
                          otherOption: undefined,
                          optionImages: undefined,
                          ...(["rating", "stars", "nps"].includes(
                            e.target.value,
                          )
                            ? {
                                options: Array.from(
                                  {
                                    length:
                                      e.target.value === "nps"
                                        ? 11
                                        : e.target.value === "stars"
                                          ? 5
                                          : 10,
                                  },
                                  (_, i) =>
                                    String(
                                      e.target.value === "nps" ? i : i + 1,
                                    ),
                                ),
                                exclusive: [],
                              }
                            : {}),
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
                      <option value="rating">Шкала от 1 до 10</option>
                      <option value="stars">Звёзды от 1 до 5</option>
                      <option value="nps">NPS от 0 до 10</option>
                      <option value="ranking">Ранжирование по важности</option>
                      <option value="image">Выбор изображения</option>
                    </select>
                  </label>
                  <label className="label">
                    Подсказка участнику
                    <span>
                      Краткое пояснение под вопросом: что учитывать при ответе.
                    </span>
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
                <p className="field-help">
                  Без ответа нельзя перейти дальше. Если вопрос скрыт по
                  условию, отвечать на него не нужно.
                </p>
                {q.type !== "text" && (
                  <label className="label">
                    Варианты ответа · каждый с новой строки
                    <span>
                      {q.type === "matrix"
                        ? "Шкала оценки для всех строк, например: использовал, не использовал."
                        : "Каждая строка станет отдельной кнопкой выбора. Не повторяйте одинаковые варианты."}
                    </span>
                    <textarea
                      readOnly={["rating", "stars", "nps"].includes(q.type)}
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
                    <span>
                      Объекты, которые нужно оценить отдельно: например,
                      каталог, вебинар, поездка.
                    </span>
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
                    <div className="form-grid">
                      <label className="label">
                        Минимум вариантов при заполнении
                        <span>
                          Сколько ответов нужно выбрать перед переходом дальше.
                          0 — без нижнего лимита.
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={Math.min(q.maxChoices, q.options.length)}
                          value={q.minChoices ?? 0}
                          onChange={(e) =>
                            question(i, { minChoices: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="label">
                        Максимум вариантов
                        <span>
                          После достижения лимита все остальные варианты
                          блокируются. Чтобы заменить ответ, сначала снимите
                          один из выбранных.
                        </span>
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
                    </div>
                    <p className="small">
                      Одинаковые минимум и максимум задают точное количество.
                      Минимум 0 оставляет только верхний лимит. Необязательный
                      вопрос можно пропустить. Исключающий вариант выбирается
                      один и не требует достижения минимума.
                    </p>
                    <label className="label">
                      Исключающие варианты · каждый с новой строки
                      <span>
                        {" "}
                        При выборе такого варианта остальные снимаются. Текст
                        должен совпадать с вариантом выше. Например: «Ничего из
                        перечисленного». При достигнутом максимуме сначала
                        снимите один из ответов.
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
                <div className="question-extras">
                  <ExtendedQuestion
                    question={q}
                    disabled={!!uploading}
                    onChange={(patch) => question(i, patch)}
                    onBusy={(value) => setUploading(value ? q.id : null)}
                    onError={setError}
                  />
                  <details
                    className="question-config"
                    open={q.image ? true : undefined}
                  >
                    <summary>
                      Картинка к вопросу{" "}
                      <span>{q.image ? "Добавлена" : "Необязательно"}</span>
                    </summary>
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
                          <span>
                            Подпись под изображением и описание для людей,
                            использующих экранный диктор.
                          </span>
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
                  </details>
                  <details
                    className="question-config"
                    open={q.showWhen ? true : undefined}
                  >
                    <summary>
                      Условие показа{" "}
                      <span>{q.showWhen ? "По ответу" : "Для всех"}</span>
                    </summary>
                    <p className="small">
                      Определяет, кому будет задан этот вопрос. Например:
                      показать «Уточните причину», только если выше выбрано
                      «Другое».
                    </p>
                    {i === 0 && (
                      <p className="small">
                        У первого вопроса нет предыдущих ответов, поэтому он
                        показывается всем. Чтобы настроить условие, переместите
                        вопрос ниже.
                      </p>
                    )}
                    <label className="label">
                      Показывать вопрос
                      <span>
                        Выберите предыдущий вопрос, от ответа на который зависит
                        этот.
                      </span>
                      <select
                        disabled={i === 0}
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
                              <span>
                                «Выбран вариант» проверяет конкретный ответ;
                                «Содержит» — фрагмент текста; «Ответ заполнен» —
                                любой непустой ответ. «Не выбран» применяется
                                после ответа на предыдущий вопрос.
                              </span>
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
                                <span>
                                  Укажите, оценку какой строки нужно проверить.
                                </span>
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
                                <span>
                                  Значение, при котором появится этот вопрос.
                                </span>
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
                              Вопрос появится только при выполнении условия.
                              Можно ссылаться на любой вопрос выше; цепочки
                              условий поддерживаются.
                            </p>
                          </>
                        );
                      })()}
                  </details>
                </div>
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
      ) : tab === "check" ? (
        <section className="summary-card">
          <h3>Проверка перед публикацией</h3>
          <p>
            Ошибки нужно исправить. Предупреждения помогают проверить содержание
            и доступность.
          </p>
          {!preflight.errors.length && (
            <div className="notice">
              Блокирующих ошибок нет. Проверьте опрос в предпросмотре на обоих
              устройствах.
            </div>
          )}
          {preflight.errors.map((message, i) => (
            <div className="error" key={i}>
              {message}
            </div>
          ))}
          {preflight.warnings.map((message, i) => (
            <div className="note" key={i}>
              {message}
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() => setTab("preview")}
          >
            Открыть предпросмотр
          </button>
        </section>
      ) : tab === "start" ? (
        <StartFormEditor
          survey={s}
          onChange={(startForm) => update({ startForm })}
        />
      ) : tab === "welcome" ? (
        <WelcomeEditor
          survey={s}
          onChange={(welcome) => update({ welcome })}
          onBusy={(value) => setUploading(value ? "welcome" : null)}
          onError={setError}
        />
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
        <div>
          <div className="view-tabs">
            <button
              className={device === "desktop" ? "active" : ""}
              onClick={() => setDevice("desktop")}
            >
              Компьютер
            </button>
            <button
              className={device === "mobile" ? "active" : ""}
              onClick={() => setDevice("mobile")}
            >
              Телефон · 390 px
            </button>
          </div>
          {s.id && <PreviewLink surveyId={s.id} />}
          <div className={"preview-frame preview-" + device} style={theme(s)}>
            <div className="note">
              Предпросмотр. Ответы здесь не сохраняются и не попадают в
              статистику.
            </div>
            <div className="preview-intro">
              <WelcomeBlock survey={s} />
              <span className="eyebrow">ОПРОС SANEXT</span>
              <h1>{s.title}</h1>
              <p className="pre">{s.intro}</p>
            </div>
            {previewPages
              .filter((_, i) => i === previewIndex)
              .map((page) => (
                <div className="preview-page" key={page.id}>
                  <h3>
                    Страница {previewIndex + 1} / {previewPages.length}
                  </h3>
                  {page.questions.map((q) => (
                    <section className="summary-card" key={q.id}>
                      <span className="eyebrow">
                        ВОПРОС{" "}
                        {s.questions.findIndex((item) => item.id === q.id) + 1}{" "}
                        · {q.required ? "ОБЯЗАТЕЛЬНЫЙ" : "НЕОБЯЗАТЕЛЬНЫЙ"}
                      </span>
                      <h2>{q.title}</h2>
                      <p>{q.description}</p>
                      <QuestionInput
                        otherValue={String(
                          previewAnswers[otherKey(q.id)] || "",
                        )}
                        onOtherChange={(value) =>
                          setPreviewAnswers((a) => ({
                            ...a,
                            [otherKey(q.id)]: value,
                          }))
                        }
                        question={q}
                        value={previewAnswers[q.id]}
                        onChange={(v) =>
                          setPreviewAnswers((a) => ({ ...a, [q.id]: v }))
                        }
                      />
                    </section>
                  ))}
                </div>
              ))}
            <div className="navigation">
              <button
                className="secondary"
                disabled={previewIndex === 0}
                onClick={() => {
                  setPreviewStep(previewIndex - 1);
                  setError("");
                }}
              >
                ← Назад
              </button>
              <button
                className="primary"
                disabled={previewIndex >= previewPages.length - 1}
                onClick={() => {
                  const error = pageAnswerError(
                    s,
                    previewPages[previewIndex],
                    previewAnswers,
                  );
                  if (error) setError(error);
                  else {
                    setError("");
                    setPreviewStep(previewIndex + 1);
                  }
                }}
              >
                Далее →
              </button>
            </div>
            <div className="note">{s.thanks}</div>
          </div>
        </div>
      )}
    </div>
  );
}
