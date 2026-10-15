"use client";
import { useState } from "react";
import type { Survey, Entry } from "../survey-model";
import { questionStats, numericSummary } from "../statistics";
import { visibleQuestions } from "../branching";
import { apiJson } from "../api-client";
type Filters = {
  from: string;
  to: string;
  department: string;
  region: string;
  source: string;
};
const empty: Filters = {
  from: "",
  to: "",
  department: "",
  region: "",
  source: "",
};
export function cohort(rows: Entry[], filter: Filters) {
  return rows.filter(
    (r) =>
      r.status === "completed" &&
      (!filter.from || r.updated.slice(0, 10) >= filter.from) &&
      (!filter.to || r.updated.slice(0, 10) <= filter.to) &&
      (!filter.department || r.department === filter.department) &&
      (!filter.region || r.region === filter.region) &&
      (!filter.source || (r.source || "direct") === filter.source),
  );
}
export default function Comparison({
  survey,
  rows,
  surveys,
}: {
  survey: Survey;
  rows: Entry[];
  surveys: Survey[];
}) {
  const [left, setLeft] = useState<Filters>({ ...empty }),
    [right, setRight] = useState<Filters>({ ...empty }),
    [target, setTarget] = useState(survey.id),
    [other, setOther] = useState<{ survey: Survey; rows: Entry[] } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const bSurvey = target === survey.id ? survey : other?.survey,
    bRows = target === survey.id ? rows : other?.rows || [],
    a = cohort(rows, left),
    b = cohort(bRows, right);
  async function change(id: string) {
    setTarget(id);
    setOther(null);
    setError("");
    if (id === survey.id) return;
    setLoading(true);
    try {
      setOther(
        await apiJson(
          await fetch("/api/results?survey=" + encodeURIComponent(id)),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function filters(
    name: string,
    value: Filters,
    set: (f: Filters) => void,
    data: Entry[],
  ) {
    return (
      <div>
        <h4>{name}</h4>
        <div className="form-grid">
          <label className="label">
            С даты (UTC)
            <input
              type="date"
              value={value.from}
              onChange={(e) => set({ ...value, from: e.target.value })}
            />
          </label>
          <label className="label">
            По дату (UTC)
            <input
              type="date"
              value={value.to}
              min={value.from || undefined}
              onChange={(e) => set({ ...value, to: e.target.value })}
            />
          </label>
        </div>
        {(["department", "region", "source"] as const).map((key, i) => (
          <label className="label" key={key}>
            {["Отдел", "Регион", "Источник"][i]}
            <select
              value={value[key]}
              onChange={(e) => set({ ...value, [key]: e.target.value })}
            >
              <option value="">Все</option>
              {[
                ...new Set(
                  data
                    .map((r) =>
                      key === "source" ? r.source || "direct" : r[key],
                    )
                    .filter(Boolean),
                ),
              ].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  }
  return (
    <details className="summary-card no-print">
      <summary>Сравнение периодов, отделов, регионов и опросов</summary>
      <label className="label">
        Опрос для группы Б
        <select
          value={target}
          disabled={loading}
          onChange={(e) => void change(e.target.value)}
        >
          {surveys.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        {filters("Группа А", left, setLeft, rows)}
        {filters("Группа Б", right, setRight, bRows)}
      </div>
      <p>
        Отправленных анкет: А — {a.length}, Б — {b.length}.
      </p>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <p role="status">Загружаем опрос…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Вопрос / вариант</th>
                <th>А</th>
                <th>Б</th>
                <th>Разница Б − А</th>
              </tr>
            </thead>
            <tbody>
              {survey.questions
                .filter(
                  (q) =>
                    q.type !== "text" &&
                    q.type !== "matrix" &&
                    q.type !== "ranking",
                )
                .map((q) => {
                  const match = bSurvey?.questions.find(
                    (p) =>
                      (p.id === q.id || p.title === q.title) &&
                      p.type === q.type &&
                      JSON.stringify(p.options) === JSON.stringify(q.options),
                  );
                  if (!match)
                    return (
                      <tr key={q.id}>
                        <td>{q.title}</td>
                        <td colSpan={3}>
                          Нет совместимого вопроса: тип и варианты должны
                          совпадать.
                        </td>
                      </tr>
                    );
                  const eligibleA = a.filter((r) =>
                      visibleQuestions(survey, r.answers).some(
                        (p) => p.id === q.id,
                      ),
                    ),
                    eligibleB = b.filter((r) =>
                      visibleQuestions(bSurvey!, r.answers).some(
                        (p) => p.id === match.id,
                      ),
                    );
                  const sa = questionStats(q, eligibleA),
                    sb = questionStats(match, eligibleB);
                  return (
                    <tr key={q.id}>
                      <td colSpan={4}>
                        <strong>{q.title}</strong>
                        <p className="small">
                          База: А — {sa.base.length}, Б — {sb.base.length}.{" "}
                          {q.type === "nps"
                            ? `NPS: А ${numericSummary(q, eligibleA).nps.toFixed(1)}, Б ${numericSummary(match, eligibleB).nps.toFixed(1)}`
                            : ""}
                        </p>
                        <table>
                          <tbody>
                            {sa.counts.map((v, i) => (
                              <tr key={v.label}>
                                <td>{v.label}</td>
                                <td>{v.percent.toFixed(1)}%</td>
                                <td>{sb.counts[i].percent.toFixed(1)}%</td>
                                <td>
                                  {(sb.counts[i].percent - v.percent).toFixed(
                                    1,
                                  )}{" "}
                                  п.п.
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <p className="small">
        Группы могут пересекаться. Сравниваются отправленные анкеты выбранных
        версий; изменение доли не означает статистическую значимость.
      </p>
    </details>
  );
}
