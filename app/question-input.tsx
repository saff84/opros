"use client";
import { Answer, AnswerMap, Question, Survey } from "./survey-model";
import { CSSProperties } from "react";
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
  return (
    <>
      <p className="small">
        {q.type === "single"
          ? "Один вариант ответа"
          : `Не более ${q.maxChoices} вариантов`}
      </p>
      <div className="options">
        {q.options.map((o) => {
          const selected =
            q.type === "single" ? value === o : chosen.includes(o);
          return (
            <button
              type="button"
              disabled={
                disabled ||
                (!selected &&
                  q.type === "multiple" &&
                  !q.exclusive.includes(o) &&
                  chosen.filter((x) => !q.exclusive.includes(x)).length >=
                    q.maxChoices)
              }
              key={o}
              className={"option " + (selected ? "selected" : "")}
              aria-pressed={selected}
              onClick={() =>
                q.type === "single" ? onChange(value === o ? "" : o) : toggle(o)
              }
            >
              <span className="check">{selected ? "✓" : "+"}</span>
              {o}
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
  return Array.isArray(v) ? v.join("; ") : typeof v === "string" ? v : "—";
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
}) {
  return (
    <>
      <QuestionImage question={props.question} />
      <AnswerInput {...props} />
    </>
  );
}
