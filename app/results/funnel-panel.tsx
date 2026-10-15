"use client";
import type { Survey, Entry } from "../survey-model";
import { funnel, sourceSummary, type SurveyEvent } from "../funnel";
export default function FunnelPanel({
  survey,
  rows,
  events,
}: {
  survey: Survey;
  rows: Entry[];
  events: SurveyEvent[];
}) {
  const f = funnel(survey, rows, events),
    stages = [
      ["Открыли", f.opened],
      ["Начали", f.started],
      ["Завершили", f.completed],
    ] as const;
  return (
    <section className="summary-card funnel-panel">
      <h3>Воронка прохождения</h3>
      <div className="funnel-stages">
        {stages.map(([name, count]) => (
          <div key={name}>
            <span>{name}</span>
            <strong>{count}</strong>
            <div className="bar-track">
              <div
                style={{
                  width: (f.opened ? (count / f.opened) * 100 : 0) + "%",
                  background: survey.accent,
                }}
              />
            </div>
            <small>
              {f.opened ? ((count / f.opened) * 100).toFixed(1) : 0}% от
              открывших
            </small>
          </div>
        ))}
      </div>
      <p className="small">
        Посетитель определяется по подписанной сессии устройства. Страницы
        отслеживаются после обновления; для старых анкет начало оценивается по
        статусу. Незавершённые за 24 часа могут вернуться позже. Условные
        страницы увидят только подходящие участники.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Страница</th>
              <th>Открыли</th>
              <th>Остановились более суток назад</th>
            </tr>
          </thead>
          <tbody>
            {f.pages.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>{p.visited}</td>
                <td>{p.inactive}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Источники переходов</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Источник</th>
              <th>Кампания</th>
              <th>Открыли</th>
              <th>Завершили</th>
              <th>Конверсия</th>
            </tr>
          </thead>
          <tbody>
            {sourceSummary(rows).map((r) => (
              <tr key={JSON.stringify([r.source, r.campaign])}>
                <td>{r.source === "direct" ? "Без метки" : r.source}</td>
                <td>{r.campaign || "—"}</td>
                <td>{r.opened}</td>
                <td>{r.completed}</td>
                <td>
                  {(r.opened ? (r.completed / r.opened) * 100 : 0).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
