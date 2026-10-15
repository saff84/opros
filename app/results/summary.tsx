"use client";
import { useState } from "react";
import { aggregate, Frequency, ResponseRow } from "../analytics";
import { ratings } from "../data";
const pct = (v: number) =>
  v.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + "%";
function Bars({
  items,
  denominator,
}: {
  items: Frequency[];
  denominator: number;
}) {
  const [all, setAll] = useState(false);
  const positive = items.filter((x) => x.count);
  const visible = all ? positive : positive.slice(0, 6);
  return (
    <>
      {!positive.length ? (
        <div className="note">
          Ответов пока нет. График появится после заполнения этого вопроса.
        </div>
      ) : (
        <>
          <div
            className="bars"
            role="img"
            aria-label="Рейтинг вариантов ответа: количество участников и доля ответивших"
          >
            {visible.map((x, i) => (
              <div className="bar-item" key={x.label}>
                <div className="bar-caption">
                  <span>
                    <b>{i + 1}.</b> {x.label}
                  </span>
                  <strong>
                    {x.count} <small>· {pct(x.percent)}</small>
                  </strong>
                </div>
                <div className="bar-track">
                  <div style={{ width: x.percent + "%" }} />
                </div>
              </div>
            ))}
          </div>
          {positive.length > 6 ? (
            <button className="text-button" onClick={() => setAll(!all)}>
              {all ? "Показать первые 6" : "Показать все " + positive.length}
            </button>
          ) : null}
        </>
      )}
      <p className="small">
        База: {denominator} ответивших на вопрос. Один участник учитывается один
        раз для каждого варианта.
      </p>
    </>
  );
}
function FrequencyTable({ items }: { items: Frequency[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Вариант ответа</th>
            <th>Участников</th>
            <th>Доля</th>
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.label}>
              <td>{x.label}</td>
              <td>{x.count}</td>
              <td>{pct(x.percent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default function Summary({ rows }: { rows: ResponseRow[] }) {
  const [drafts, setDrafts] = useState(false);
  const chosen = rows.filter(
    (r) => r.status === "completed" || (drafts && r.status === "draft"),
  );
  const a = aggregate(chosen);
  function csv() {
    const lines = [
      [
        "Вопрос",
        "Вариант / инструмент",
        "Количество участников",
        "Ответили на вопрос / строку",
        "Доля, %",
      ],
    ];
    a.usage.forEach((x) =>
      x.counts.forEach((n, i) =>
        lines.push([
          "1. Использование инструментов",
          x.tool + " — " + ratings[i],
          String(n),
          String(x.answered),
          String(x.answered ? (n / x.answered) * 100 : 0),
        ]),
      ),
    );
    [a.benefit, a.obstacle, a.support].forEach((f, i) =>
      f.items.forEach((x) =>
        lines.push([
          ["2. Польза", "3. Препятствия", "5. Задачи"][i],
          x.label,
          String(x.count),
          String(f.answered),
          String(x.percent),
        ]),
      ),
    );
    const content =
      "\uFEFF" +
      lines
        .map((line) =>
          line.map((s) => '"' + s.replaceAll('"', '""') + '"').join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "SANEXT-survey-summary.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="summary-intro">
        <div>
          <h2>Что говорит команда</h2>
          <p>Сводка по вопросам и самые популярные варианты.</p>
        </div>
        <button className="secondary" onClick={csv}>
          Скачать сводку CSV ↓
        </button>
      </div>
      <div className="analytics-basis">
        <label>
          <input
            type="checkbox"
            checked={drafts}
            onChange={(e) => setDrafts(e.target.checked)}
          />{" "}
          Включить черновики
        </label>
        <strong>В сводке: {chosen.length} участников</strong>
        <p className="small">
          По умолчанию учитываются только отправленные анкеты. В вопросах с
          несколькими вариантами сумма долей может превышать 100%. Текстовые
          ответы показываются без автоматического объединения по смыслу.
        </p>
      </div>
      <div className="summary-card">
        <h3>Сводная таблица по вопросам</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Вопрос</th>
                <th>Ответили</th>
                <th>Самый популярный вариант</th>
                <th>Выбрали</th>
                <th>Доля</th>
              </tr>
            </thead>
            <tbody>
              {a.summary.map((x, i) => (
                <tr key={x.question}>
                  <td>
                    {i + 1}. {x.question}
                  </td>
                  <td>{x.answered}</td>
                  <td>{x.leader}</td>
                  <td>{x.count ?? "—"}</td>
                  <td>{x.percent === null ? "—" : pct(x.percent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">
          В вопросе 1 лидер определяется по использованию хотя бы один раз; доля
          — среди ответивших на соответствующую строку. При равенстве значений
          полный рейтинг виден ниже.
        </p>
      </div>
      <div className="chart-grid">
        <div className="summary-card">
          <span className="eyebrow">ВОПРОС 1</span>
          <h3>Какие инструменты используют чаще</h3>
          <Bars
            denominator={
              chosen.filter((r) => Object.keys(r.answers.usage).length).length
            }
            items={[...a.usage]
              .sort((x, y) => y.used - x.used)
              .map((x) => ({
                label: x.tool,
                count: x.used,
                percent: x.percent,
              }))}
          />
          <p className="small">
            Объединены ответы «Использовал многократно» и «Использовал один
            раз». Процент рассчитан отдельно для каждого инструмента.
          </p>
        </div>
        <div className="summary-card">
          <span className="eyebrow">ВОПРОС 2</span>
          <h3>Что приносит наибольшую пользу</h3>
          <Bars denominator={a.benefit.answered} items={a.benefit.items} />
        </div>
        <div className="summary-card">
          <span className="eyebrow">ВОПРОС 3</span>
          <h3>Что мешает использовать инструменты</h3>
          <Bars denominator={a.obstacle.answered} items={a.obstacle.items} />
        </div>
        <div className="summary-card">
          <span className="eyebrow">ВОПРОС 5</span>
          <h3>Где нужна маркетинговая поддержка</h3>
          <Bars denominator={a.support.answered} items={a.support.items} />
        </div>
      </div>
      <div className="summary-card">
        <h3>1. Использование инструментов: все ответы</h3>
        <div className="table-scroll">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Инструмент</th>
                {ratings.map((r) => (
                  <th key={r}>{r}</th>
                ))}
                <th>Ответили</th>
              </tr>
            </thead>
            <tbody>
              {a.usage.map((x) => (
                <tr key={x.tool}>
                  <td>{x.tool}</td>
                  {x.counts.map((n, i) => (
                    <td key={i}>
                      {n}
                      <small>
                        {pct(x.answered ? (n / x.answered) * 100 : 0)}
                      </small>
                    </td>
                  ))}
                  <td>{x.answered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {[
        { n: 2, title: "Польза инструментов", data: a.benefit },
        { n: 3, title: "Препятствия", data: a.obstacle },
        { n: 5, title: "Задачи для поддержки", data: a.support },
      ].map((x) => (
        <details className="summary-card" key={x.n}>
          <summary>
            {x.n}. {x.title}: таблица всех вариантов
          </summary>
          <FrequencyTable items={x.data.items} />
        </details>
      ))}
      {[
        {
          title: "4. Что улучшить в первую очередь",
          items: a.texts,
          key: "improve",
        },
        { title: "6. Предложения на 2027 год", items: a.ideas, key: "ideas" },
      ].map((section) => (
        <div className="summary-card" key={section.key}>
          <h3>{section.title}</h3>
          {!section.items.length ? (
            <p className="small">Пока нет текстовых ответов.</p>
          ) : (
            section.items.map((r) => (
              <div className="feedback" key={r.id}>
                <strong>{r.name || "Посетитель " + r.id.slice(0, 8)}</strong>
                {r.status === "draft" ? (
                  <span className="badge draft">Черновик</span>
                ) : null}
                {section.key === "improve" ? (
                  <p className="pre">{r.answers.improve}</p>
                ) : (
                  r.answers.ideas.map((v, i) =>
                    v.trim() ? (
                      <p className="pre" key={i}>
                        {i + 1}. {v}
                      </p>
                    ) : null,
                  )
                )}
              </div>
            ))
          )}
        </div>
      ))}
      {[
        { title: "Другие причины", key: "barrierOther", option: "barriers" },
        { title: "Другие задачи", key: "needOther", option: "needs" },
      ].map((x) => (
        <details className="summary-card" key={x.key}>
          <summary>{x.title}</summary>
          {chosen
            .filter(
              (r) =>
                (r.answers as any)[x.option].includes("Другое") &&
                (r.answers as any)[x.key].trim(),
            )
            .map((r) => (
              <div className="feedback" key={r.id}>
                <strong>{r.name || "Посетитель " + r.id.slice(0, 8)}</strong>
                <p className="pre">{(r.answers as any)[x.key]}</p>
              </div>
            ))}
        </details>
      ))}
    </>
  );
}
