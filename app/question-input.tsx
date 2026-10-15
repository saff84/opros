"use client";
import { Answer, AnswerMap, Question, Survey } from "./survey-model";
import { CSSProperties } from "react";
import { singleTypes, otherKey } from "../scripts/survey-features.mjs";
export function theme(s: Survey): CSSProperties {
  return {
    "--cyan": s.accent,
    "--soft": s.background,
    "--survey-background": s.background,
  } as CSSProperties;
}
function AnswerInput({
  question: q,
  value,
  onChange,
  disabled = false,
}: {
  question: Question;
  value: Answer | undefined;
  onChange: (v: Answer) => void;
  disabled?: boolean;
}) {
  const chosen = Array.isArray(value) ? value : [];
  function toggle(option: string) {
    if (chosen.includes(option)) onChange(chosen.filter((x) => x !== option));
    else if (disabled || chosen.length >= q.maxChoices) return;
    else if (q.exclusive.includes(option)) onChange([option]);
    else {
      const next = chosen.filter((x) => !q.exclusive.includes(x));
      if (next.length < q.maxChoices) onChange([...next, option]);
    }
  }
  if (q.type === "text")
    return (
      <textarea
        aria-label={q.title}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        maxLength={3000}
        disabled={disabled}
        placeholder="Ваш ответ…"
      />
    );
  if (q.type === "matrix") {
    const values = (
      value && typeof value === "object" && !Array.isArray(value) ? value : {}
    ) as Record<string, number>;
    return (
      <div className="tool-grid">
        {q.rows.map((row, i) => (
          <label
            className={
              "tool-card " + (values[row] !== undefined ? "answered" : "")
            }
            key={row}
          >
            <span className="tool-heading">
              <b>{String(i + 1).padStart(2, "0")}</b>
              {row}
            </span>
            <select
              disabled={disabled}
              aria-label={row}
              value={values[row] ?? ""}
              onChange={(e) =>
                onChange({ ...values, [row]: Number(e.target.value) })
              }
            >
              <option value="" disabled>
                Выберите ответ
              </option>
              {q.options.map((o, i) => (
                <option key={o} value={i}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  }
  if (q.type === "ranking")
    return (
      <div className="ranking-input">
        <p className="small">
          Нажимайте варианты в порядке приоритета: первый — самый важный.
          Порядок можно изменить стрелками.
        </p>
        <ol>
          {chosen.map((option, i) => (
            <li key={option}>
              <span>{option}</span>
              <button
                type="button"
                disabled={disabled || i === 0}
                aria-label={"Поднять " + option}
                onClick={() => {
                  const values = [...chosen];
                  [values[i - 1], values[i]] = [values[i], values[i - 1]];
                  onChange(values);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={disabled || i === chosen.length - 1}
                aria-label={"Опустить " + option}
                onClick={() => {
                  const values = [...chosen];
                  [values[i + 1], values[i]] = [values[i], values[i + 1]];
                  onChange(values);
                }}
              >
                ↓
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={"Убрать " + option}
                onClick={() => onChange(chosen.filter((v) => v !== option))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
        <div className="options">
          {q.options
            .filter((v) => !chosen.includes(v))
            .map((v) => (
              <button
                type="button"
                className="option"
                disabled={disabled}
                key={v}
                onClick={() => onChange([...chosen, v])}
              >
                ＋ {v}
              </button>
            ))}
        </div>
      </div>
    );
  return (
    <>
      <p className="small">
        {singleTypes.includes(q.type)
          ? "Один вариант ответа"
          : q.minChoices && q.minChoices === q.maxChoices
            ? `Выберите ровно ${q.maxChoices} вариантов`
            : q.minChoices
              ? `Выберите от ${q.minChoices} до ${q.maxChoices} вариантов`
              : `Не более ${q.maxChoices} вариантов`}
      </p>
      {q.type === "multiple" && (
        <p className="small" role="status" aria-live="polite">
          Выбрано: {chosen.length} из {Math.min(q.maxChoices, q.options.length)}
          .
          {chosen.length >= q.maxChoices &&
            " Лимит достигнут. Снимите выбранный вариант, чтобы выбрать другой."}
          {q.exclusive.length > 0 &&
            " Исключающий вариант можно выбрать отдельно."}
        </p>
      )}
      <div
        className={
          "options " +
          (["rating", "stars", "nps"].includes(q.type) ? "scale-options" : "")
        }
      >
        {q.options.map((o) => {
          const selected = singleTypes.includes(q.type)
            ? value === o
            : chosen.includes(o);
          return (
            <button
              type="button"
              disabled={
                disabled ||
                (!selected &&
                  q.type === "multiple" &&
                  chosen.length >= q.maxChoices)
              }
              key={o}
              className={"option " + (selected ? "selected" : "")}
              aria-pressed={selected}
              onClick={() =>
                singleTypes.includes(q.type)
                  ? onChange(value === o ? "" : o)
                  : toggle(o)
              }
            >
              <span className="check">{selected ? "✓" : "+"}</span>
              {q.type === "image" && q.optionImages?.[o] && (
                <img
                  className="choice-image"
                  src={q.optionImages[o].src}
                  alt={q.optionImages[o].alt}
                />
              )}
              {q.type === "stars" ? `${o} ${"★".repeat(Number(o))}` : o}
            </button>
          );
        })}
      </div>
    </>
  );
}
export function answerText(q: Question, a: AnswerMap) {
  const v = a[q.id];
  if (q.type === "matrix")
    return q.rows
      .map(
        (row) =>
          `${row}: ${q.options[(v as Record<string, number>)?.[row]] ?? "—"}`,
      )
      .join("\n");
  const base = Array.isArray(v)
    ? v
        .map((item, i) => (q.type === "ranking" ? `${i + 1}. ${item}` : item))
        .join("; ")
    : typeof v === "string"
      ? v
      : "—";
  return q.otherOption && a[otherKey(q.id)]
    ? base + " — " + String(a[otherKey(q.id)])
    : base;
}

export function QuestionImage({ question }: { question: Question }) {
  return question.image ? (
    <figure className="question-image">
      <img src={question.image.src} alt={question.image.alt} loading="lazy" />
      {question.image.alt && <figcaption>{question.image.alt}</figcaption>}
    </figure>
  ) : null;
}
export function QuestionInput(props: {
  question: Question;
  value: Answer | undefined;
  onChange: (v: Answer) => void;
  disabled?: boolean;
  otherValue?: string;
  onOtherChange?: (value: string) => void;
}) {
  return (
    <>
      <QuestionImage question={props.question} />
      <AnswerInput {...props} />
      {props.question.otherOption &&
        (Array.isArray(props.value)
          ? props.value.includes(props.question.otherOption)
          : props.value === props.question.otherOption) && (
          <label className="label">
            Уточните «{props.question.otherOption}»
            <textarea
              value={props.otherValue || ""}
              disabled={props.disabled}
              maxLength={3000}
              placeholder="Напишите свой вариант…"
              onChange={(e) => props.onOtherChange?.(e.target.value)}
            />
          </label>
        )}
    </>
  );
}
