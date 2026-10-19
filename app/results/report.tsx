"use client";
import { visibleQuestions } from "../branching";
import { useState } from "react";
import { Entry, Survey } from "../survey-model";
import {
  questionStats,
  matrixStats,
  dailyCounts,
  answered,
  numericSummary,
  rankingStats,
} from "../statistics";
import { answerText, QuestionImage } from "../question-input";
import { otherResponses } from "../other-responses";
export const colors = [
  "#004ecc",
  "#ff773f",
  "#15a184",
  "#8b66cf",
  "#f1bd3e",
  "#6e8599",
  "#b65878",
];
export const percent = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + "%";
export default function Report({
  survey: s,
  rows,
  onParticipant,
}: {
  survey: Survey;
  rows: Entry[];
  onParticipant?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const visibility = new Map(
    rows.map((r) => [
      r.id,
      new Set(visibleQuestions(s, r.answers).map((q) => q.id)),
    ]),
  );
  const days = dailyCounts(rows);
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="report">
      <div className="print-heading">
        <h1>{s.title}</h1>
        <p>
          Отчёт · Версия {s.schemaVersion || 1} ·{" "}
          {new Date().toLocaleDateString("ru-RU")} · Анкет: {rows.length}
        </p>
      </div>
      <div className="summary-card trend-card">
        <div>
          <span className="eyebrow">ДИНАМИКА</span>
          <h3>Когда приходит обратная связь</h3>
          <p className="small">
            Отправленные анкеты по дате обновления (UTC). Последние 30 дат с
            активностью.
          </p>
        </div>
        {days.some((d) => d.count) ? (
          <div
            className="trend-chart"
            role="img"
            aria-label="Отправленные анкеты по дням"
          >
            {days.map((d) => (
              <div key={d.date} className="trend-column">
                <strong>{d.count}</strong>
                <div className="trend-rail">
                  <div
                    style={{ height: (d.count / max) * 100 + "%" }}
                    title={d.date + ": " + d.count}
                  />
                </div>
                <span>{d.date.slice(8) + "." + d.date.slice(5, 7)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            Динамика появится после первой отправленной анкеты.
          </div>
        )}
      </div>
      <div className="report-questions">
        {s.questions.map((q, i) => {
          const eligible = rows.filter((r) => visibility.get(r.id)?.has(q.id));
          const { base, counts } = questionStats(q, eligible),
            sorted = [...counts].sort((a, b) => b.count - a.count),
            top = sorted[0];
          return (
            <section
              className={
                "summary-card report-question " +
                (q.type === "matrix" ? "wide" : "")
              }
              key={q.id}
            >
              <div className="question-report-head">
                <div>
                  <span className="eyebrow">
                    ВОПРОС {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>{q.title}</h3>
                </div>
                <span className="answer-count">
                  {base.length}
                  <small>ответов</small>
                </span>
              </div>
              {!base.length ? (
                <div className="empty-state">
                  Пока нет ответов на этот вопрос.
                </div>
              ) : q.type === "ranking" ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Вариант</th>
                        <th>Среднее место</th>
                        <th>Ответов</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingStats(q, base).map((r) => (
                        <tr key={r.label}>
                          <td>{r.label}</td>
                          <td>{r.average.toFixed(2)}</td>
                          <td>{r.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="small">
                    Меньшее среднее место означает более высокий приоритет.
                  </p>
                </div>
              ) : q.type === "text" ? (
                <div className="text-responses">
                  {base.map((r, index) => (
                    <div
                      className={
                        "feedback " +
                        (!expanded[q.id] && index >= 8 ? "print-only" : "")
                      }
                      key={r.id}
                    >
                      <strong>
                        {r.name || "Участник " + r.id.slice(0, 8)}
                      </strong>
                      {r.status === "draft" && (
                        <span className="badge draft">Черновик</span>
                      )}
                      <p className="pre">{answerText(q, r.answers)}</p>
                    </div>
                  ))}
                  {base.length > 8 && (
                    <button
                      className="text-button no-print"
                      onClick={() =>
                        setExpanded((e) => ({ ...e, [q.id]: !e[q.id] }))
                      }
                    >
                      {expanded[q.id]
                        ? "Свернуть"
                        : "Все ответы (" + base.length + ")"}
                    </button>
                  )}
                </div>
              ) : q.type === "matrix" ? (
                <>
                  <div className="matrix-legend">
                    {q.options.map((o, j) => (
                      <span key={o}>
                        <i style={{ background: colors[j % colors.length] }} />
                        {o}
                      </span>
                    ))}
                  </div>
                  <div className="matrix-chart">
                    {matrixStats(q, eligible).map((m) => (
                      <div className="matrix-line" key={m.label}>
                        <span>{m.label}</span>
                        <div className="stacked-bar" aria-label={m.label}>
                          {m.counts.map((n, j) => (
                            <div
                              key={j}
                              title={`${q.options[j]}: ${n} (${percent(m.total ? (n / m.total) * 100 : 0)})`}
                              style={{
                                width:
                                  (m.total ? (n / m.total) * 100 : 0) + "%",
                                background: colors[j % colors.length],
                              }}
                            >
                              {n || ""}
                            </div>
                          ))}
                        </div>
                        <strong>{m.total}</strong>
                      </div>
                    ))}
                  </div>
                  <details className="matrix-details">
                    <summary>Точные значения</summary>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Строка</th>
                            {q.options.map((o) => (
                              <th key={o}>{o}</th>
                            ))}
                            <th>База</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matrixStats(q, eligible).map((m) => (
                            <tr key={m.label}>
                              <td>{m.label}</td>
                              {m.counts.map((n, j) => (
                                <td key={j}>
                                  {n} ·{" "}
                                  {percent(m.total ? (n / m.total) * 100 : 0)}
                                </td>
                              ))}
                              <td>{m.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              ) : (
                <>
                  <div className="leader-callout">
                    {["rating", "stars", "nps"].includes(q.type) && (
                      <strong>
                        {q.type === "nps"
                          ? `NPS: ${numericSummary(q, base).nps.toFixed(1)}`
                          : `Средняя оценка: ${numericSummary(q, base).average.toFixed(2)}`}
                      </strong>
                    )}
                    <span>Самый частый ответ</span>
                    <strong>{top?.label}</strong>
                    <b>{percent(top?.percent || 0)}</b>
                  </div>
                  <div className="bars">
                    {sorted.map((x, j) => (
                      <div
                        className={
                          "bar-item " +
                          (!expanded[q.id] && j >= 8 ? "print-only" : "")
                        }
                        key={x.label}
                      >
                        <div className="bar-caption">
                          <span>{x.label}</span>
                          <strong>
                            {x.count} <small>· {percent(x.percent)}</small>
                          </strong>
                        </div>
                        <div className="bar-track">
                          <div
                            style={{
                              width: x.percent + "%",
                              background: j === 0 ? "#ff773f" : s.accent,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {sorted.length > 8 && (
                    <button
                      className="text-button no-print"
                      onClick={() =>
                        setExpanded((e) => ({ ...e, [q.id]: !e[q.id] }))
                      }
                    >
                      {expanded[q.id]
                        ? "Свернуть"
                        : "Все варианты (" + sorted.length + ")"}
                    </button>
                  )}
                </>
              )}
              <p className="small basis">
                База: {base.length} ответивших на вопрос.{" "}
                {q.showWhen && `Ветка применима к ${eligible.length} анкетам.`}
                {q.type === "multiple"
                  ? " Сумма долей может превышать 100%."
                  : q.type === "matrix"
                    ? " Доли рассчитаны отдельно для каждой строки."
                    : ""}
              </p>
              {q.otherOption && (
                <div className="other-responses">
                  <h4>Уточнения «{q.otherOption}»</h4>
                  <p className="small">
                    Выбор варианта учитывается в диаграмме выше. Введённые
                    участниками пояснения приведены отдельно.
                  </p>
                  {otherResponses(s, q, eligible).length ? (
                    otherResponses(s, q, eligible).map(({ entry: r, text }) => (
                      <div className="feedback" key={r.id}>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onParticipant?.(r.id)}
                        >
                          {r.name || "Участник " + r.id.slice(0, 8)}
                        </button>
                        <p className="small">
                          {[r.department, r.region].filter(Boolean).join(" · ")}
                        </p>
                        <p className="pre">{text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="small">Заполненных уточнений нет.</p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="summary-card">
        <h3>Заполнение по вопросам</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Вопрос</th>
                <th>Ответили</th>
                <th>Доля от выбранных анкет</th>
              </tr>
            </thead>
            <tbody>
              {s.questions.map((q) => {
                const n = rows.filter((r) => answered(q, r)).length;
                return (
                  <tr key={q.id}>
                    <td>{q.title}</td>
                    <td>{n}</td>
                    <td>
                      {percent(rows.length ? (n / rows.length) * 100 : 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
