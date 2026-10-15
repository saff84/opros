"use client";
import PasswordSettings from "./password-settings";
import { visibleQuestions } from "../branching";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import Brand from "../brand";
import { apiJson, ApiError } from "../api-client";
import { Survey, Entry } from "../survey-model";
import Editor, { newQuestion } from "./editor";
import Report, { percent } from "./report";
import { answerText } from "../question-input";
import { exportResults } from "../exports";
type Listed = Survey & { total: number; completed: number };
const statuses = {
  draft: "Неактивен · черновик",
  active: "Активен",
  archived: "Неактивен · архив",
};
const entryStatuses = {
  visited: "Зашёл",
  draft: "Заполняет",
  completed: "Отправил",
};
export default function Results() {
  const [auth, setAuth] = useState(false),
    [checked, setChecked] = useState(false),
    [password, setPassword] = useState(""),
    [surveys, setSurveys] = useState<Listed[]>([]),
    [selected, setSelected] = useState<Survey | null>(null),
    [currentSurvey, setCurrentSurvey] = useState<Survey | null>(null),
    [versions, setVersions] = useState<
      {
        schemaVersion: number;
        updated: string;
        total: number;
        completed: number;
      }[]
    >([]),
    [rows, setRows] = useState<Entry[]>([]),
    [edit, setEdit] = useState<{
      survey: Survey;
      create: boolean;
    } | null>(null),
    [view, setView] = useState("surveys"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [scope, setScope] = useState("all"),
    [search, setSearch] = useState(""),
    [drafts, setDrafts] = useState(false),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [participant, setParticipant] = useState<string | null>(null),
    [format, setFormat] = useState("xlsx"),
    [archive, setArchive] = useState(false);
  async function request(url: string, options?: RequestInit) {
    try {
      return await apiJson(await fetch(url, { ...options, cache: "no-store" }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAuth(false);
        setSelected(null);
        setCurrentSurvey(null);
        setVersions([]);
        setRows([]);
        setSurveys([]);
        setEdit(null);
        setView("surveys");
        if (checked && auth) setError("Сессия истекла. Войдите снова.");
      }
      throw e;
    }
  }
  async function load() {
    const d = await request("/api/surveys");
    setSurveys(d.surveys);
  }
  async function check() {
    setBusy(true);
    try {
      await request("/api/results");
      setAuth(true);
      await load();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setError((e as Error).message);
    } finally {
      setChecked(true);
      setBusy(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setAuth(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(s: Survey, tab = "report", version?: number) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const d = await request(
        "/api/results?survey=" +
          encodeURIComponent(s.id) +
          (version ? "&version=" + version : ""),
      );
      setSelected(d.survey);
      setCurrentSurvey(d.currentSurvey);
      setVersions(d.versions);
      setRows(d.rows);
      setView(tab);
      setParticipant(null);
      setFrom("");
      setTo("");
      setScope("all");
      setSearch("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function create(source?: Survey) {
    const now = new Date().toISOString();
    setEdit({
      survey: source
        ? {
            ...structuredClone(source),
            id: "",
            title: source.title + " · копия",
            status: "draft",
            revision: 0,
          }
        : {
            id: "",
            title: "Новый опрос",
            description: "Поделитесь своим мнением",
            intro: "Ваши ответы помогут нам стать лучше.",
            thanks: "Спасибо! Ваше мнение принято.",
            accent: "#004ecc",
            background: "#daeaf2",
            status: "draft",
            questions: [newQuestion()],
            created: now,
            updated: now,
            revision: 0,
          },
      create: true,
    });
    setError("");
  }
  async function save(s: Survey) {
    const d = await request("/api/surveys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey: s, create: edit?.create }),
    });
    setEdit(null);
    setNotice("Опрос сохранён");
    await load();
    await open(d.survey);
  }
  async function changeStatus(s: Survey, status: Survey["status"]) {
    setBusy(true);
    setError("");
    try {
      const d = await request("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey: { ...s, status } }),
      });
      await load();
      if (selected?.id === s.id) {
        setCurrentSurvey(d.survey);
        if ((selected.schemaVersion || 1) === (d.survey.schemaVersion || 1))
          setSelected(d.survey);
      }
      setNotice(
        status === "archived"
          ? "Опрос в архиве. Ответы и статистика сохранены."
          : status === "active"
            ? "Сбор ответов открыт."
            : "Сбор ответов приостановлен.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const dateMatch = (r: Entry) =>
    (!from || r.updated.slice(0, 10) >= from) &&
    (!to || r.updated.slice(0, 10) <= to);
  const reportRows = rows.filter(
    (r) =>
      (r.status === "completed" || (drafts && r.status === "draft")) &&
      dateMatch(r),
  );
  const list = rows.filter(
    (r) =>
      dateMatch(r) &&
      (scope === "all" || r.status === scope) &&
      (r.name + " " + r.id).toLowerCase().includes(search.toLowerCase()),
  );
  const current = rows.find((r) => r.id === participant);
  const completed = rows.filter((r) => r.status === "completed").length;
  const visible = surveys.filter((s) =>
    archive ? s.status === "archived" : s.status !== "archived",
  );
  const reset = () => {
    setView("surveys");
    setSelected(null);
    setCurrentSurvey(null);
    setVersions([]);
    setEdit(null);
    setError("");
    setNotice("");
  };
  return (
    <>
      <header className="admin-header no-print">
        <Brand subtitle="КАБИНЕТ ОРГАНИЗАТОРА" />
        <div className="header-links">
          {auth && (
            <button
              className="text-button"
              onClick={() => {
                setEdit(null);
                setView("security");
              }}
            >
              Сменить пароль
            </button>
          )}
          <a href="/" target="_blank" rel="noreferrer">
            Открыть опросы ↗
          </a>
          {auth && (
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await request("/api/login", { method: "DELETE" });
                  setAuth(false);
                  setRows([]);
                  setSurveys([]);
                  setSelected(null);
                  setCurrentSurvey(null);
                  setVersions([]);
                  setEdit(null);
                  setView("surveys");
                  setError("");
                  setNotice("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Выйти
            </button>
          )}
        </div>
      </header>
      <div className="dashboard admin-dashboard">
        {!checked ? (
          <p role="status">Проверяем доступ…</p>
        ) : !auth ? (
          <form className="login" onSubmit={login}>
            <span className="eyebrow">ДЛЯ ОРГАНИЗАТОРА</span>
            <h1>Голос команды</h1>
            <p>Управляйте опросами и превращайте обратную связь в решения.</p>
            <label className="label">
              Пароль
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Проверяем…" : "Войти →"}
            </button>
          </form>
        ) : view === "security" ? (
          <PasswordSettings onBack={reset} />
        ) : edit ? (
          <Editor
            key={edit.survey.id || "new"}
            initial={edit.survey}

            onSave={save}
            onCancel={() => setEdit(null)}
          />
        ) : view === "surveys" ? (
          <>
            <div className="dash-title">
              <div>
                <span className="eyebrow">ОБРАТНАЯ СВЯЗЬ → РЕШЕНИЯ</span>
                <h1>Опросы команды</h1>
                <p>
                  Создавайте, собирайте, сравнивайте. История остаётся с вами.
                </p>
              </div>
              <button
                className="primary"
                disabled={busy}
                onClick={() => create()}
              >
                ＋ Создать опрос
              </button>
            </div>
            <div className="stats overview-stats">
              <div>
                <span>Открытых опросов</span>
                <strong>
                  {surveys.filter((s) => s.status === "active").length}
                </strong>
              </div>
              <div>
                <span>Получено анкет</span>
                <strong>
                  {surveys.reduce((n, s) => n + (s.completed || 0), 0)}
                </strong>
              </div>
              <div>
                <span>Всего посетителей</span>
                <strong>{surveys.reduce((n, s) => n + s.total, 0)}</strong>
              </div>
              <div>
                <span>В архиве</span>
                <strong>
                  {surveys.filter((s) => s.status === "archived").length}
                </strong>
              </div>
            </div>
            <div className="view-tabs">
              <button
                className={!archive ? "active" : ""}
                onClick={() => setArchive(false)}
              >
                Текущие опросы
              </button>
              <button
                className={archive ? "active" : ""}
                onClick={() => setArchive(true)}
              >
                Архив
              </button>
            </div>
            <div className="survey-cards">
              {visible.map((s) => (
                <article
                  className="survey-card"
                  key={s.id}
                  style={{ borderTopColor: s.accent }}
                >
                  <div className="card-meta">
                    <span className={"badge " + s.status}>
                      {statuses[s.status]}
                    </span>
                    <span>
                      {new Date(s.created).toLocaleDateString("ru-RU")}
                    </span>
                  </div>
                  <h2>{s.title}</h2>
                  <p>{s.description}</p>
                  <div className="card-numbers">
                    <div>
                      <strong>{s.completed || 0}</strong>
                      <span>отправили</span>
                    </div>
                    <div>
                      <strong>{s.total}</strong>
                      <span>посетителей</span>
                    </div>
                    <div>
                      <strong>
                        {percent(
                          s.total ? ((s.completed || 0) / s.total) * 100 : 0,
                        )}
                      </strong>
                      <span>завершение</span>
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void open(s)}
                    >
                      Статистика ↗
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        setEdit({
                          survey: s,
                          create: false,
                        })
                      }
                    >
                      Редактировать
                    </button>
                    <button disabled={busy} onClick={() => create(s)}>
                      Копия
                    </button>
                  </div>
                  <div className="card-footer">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void changeStatus(
                          s,
                          s.status === "active" ? "draft" : "active",
                        )
                      }
                    >
                      {s.status === "active"
                        ? "Выключить опрос"
                        : "Активировать"}
                    </button>
                    {s.status === "active" ? (
                      <a
                        href={"/?survey=" + s.id}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ссылка для участников ↗
                      </a>
                    ) : (
                      <span>Сбор ответов закрыт</span>
                    )}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void changeStatus(
                          s,
                          s.status === "archived" ? "draft" : "archived",
                        )
                      }
                    >
                      {s.status === "archived"
                        ? "Вернуть в черновики"
                        : "В архив"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!visible.length && (
              <div className="empty-state">
                {archive
                  ? "Здесь будут завершённые опросы со всей историей ответов."
                  : "Создайте первый опрос или восстановите опрос из архива."}
              </div>
            )}
          </>
        ) : (
          selected && (
            <>
              <button className="text-button no-print" onClick={reset}>
                ← Все опросы
              </button>
              <div className="dash-title no-print">
                <div>
                  <span
                    className={"badge " + (currentSurvey || selected).status}
                  >
                    {statuses[(currentSurvey || selected).status]}
                  </span>
                  <h1>{selected.title}</h1>
                  <p>{selected.description}</p>
                </div>
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void open(
                        currentSurvey || selected,
                        view,
                        selected.schemaVersion || 1,
                      )
                    }
                  >
                    Обновить
                  </button>
                  <button
                    onClick={() =>
                      setEdit({
                        survey: currentSurvey || selected,
                        create: false,
                      })
                    }
                  >
                    Редактировать
                  </button>
                  <button onClick={() => create(selected)}>
                    Создать копию
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void changeStatus(
                        currentSurvey || selected,
                        (currentSurvey || selected).status === "active"
                          ? "archived"
                          : "active",
                      )
                    }
                  >
                    {(currentSurvey || selected).status === "active"
                      ? "Завершить сбор"
                      : "Открыть сбор"}
                  </button>
                </div>
              </div>
              <div className="version-controls no-print">
                <label className="label">
                  Версия вопросов
                  <select
                    aria-label="Версия вопросов"
                    disabled={busy}
                    value={selected.schemaVersion || 1}
                    onChange={(e) =>
                      void open(
                        currentSurvey || selected,
                        view,
                        Number(e.target.value),
                      )
                    }
                  >
                    {versions.map((v) => (
                      <option key={v.schemaVersion} value={v.schemaVersion}>
                        Версия {v.schemaVersion}
                        {v.schemaVersion === (currentSurvey?.schemaVersion || 1)
                          ? " · текущая"
                          : ""}{" "}
                        · {v.completed} отправлено / {v.total} анкет
                      </option>
                    ))}
                  </select>
                </label>
                <p className="small">
                  Ответы, статистика и выгрузки относятся к выбранной версии
                  вопросов. Редактор открывает текущую версию опроса.
                </p>
              </div>
              <div className="stats no-print">
                <div>
                  <span>Посетителей</span>
                  <strong>{rows.length}</strong>
                </div>
                <div>
                  <span>Отправили</span>
                  <strong>{completed}</strong>
                </div>
                <div>
                  <span>Заполняют</span>
                  <strong>
                    {rows.filter((r) => r.status === "draft").length}
                  </strong>
                </div>
                <div className="completion-stat">
                  <span>Доля завершения</span>
                  <strong>
                    {percent(rows.length ? (completed / rows.length) * 100 : 0)}
                  </strong>
                  <div className="mini-progress">
                    <div
                      style={{
                        width:
                          (rows.length ? (completed / rows.length) * 100 : 0) +
                          "%",
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="view-tabs no-print">
                <button
                  className={view === "report" ? "active" : ""}
                  onClick={() => setView("report")}
                >
                  Обзор и графики
                </button>
                <button
                  className={view === "participants" ? "active" : ""}
                  onClick={() => setView("participants")}
                >
                  Ответы участников
                </button>
              </div>
              <div className="report-controls no-print">
                <div className="date-filters">
                  <label>
                    С даты (UTC)
                    <input
                      aria-label="С даты"
                      type="date"
                      value={from}
                      max={to || undefined}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    По дату (UTC)
                    <input
                      aria-label="По дату"
                      type="date"
                      value={to}
                      min={from || undefined}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                  {view === "report" && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={drafts}
                        onChange={(e) => setDrafts(e.target.checked)}
                      />
                      Включить черновики
                    </label>
                  )}
                </div>
                <div className="export-controls">
                  <select
                    aria-label="Формат экспорта"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    <option value="xlsx">Excel · ответы и сводка</option>
                    <option value="csv">CSV · ответы</option>
                    <option value="summary">CSV · сводка</option>
                    <option value="json">JSON · опрос и ответы</option>
                    <option value="pdf">PDF · печатный отчёт</option>
                  </select>
                  <button
                    className="primary"
                    onClick={() => {
                      if (format === "pdf") {
                        flushSync(() => setView("report"));
                        requestAnimationFrame(() => {
                          const images = Array.from(
                            document.querySelectorAll<HTMLImageElement>(
                              ".report img",
                            ),
                          );
                          for (const img of images) img.loading = "eager";
                          void Promise.race([
                            Promise.allSettled(
                              images.map((img) => img.decode()),
                            ),
                            new Promise((resolve) => setTimeout(resolve, 5000)),
                          ]).then(() => window.print());
                        });
                      } else
                        void exportResults(
                          format,
                          selected,
                          view === "report" ? reportRows : list,
                        ).catch((e) => setError(e.message));
                    }}
                  >
                    Скачать ↓
                  </button>
                </div>
              </div>
              <div className="analytics-basis">
                <strong>
                  В {view === "report" ? "отчёте" : "списке"}:{" "}
                  {view === "report" ? reportRows.length : list.length} анкет
                </strong>
                <p className="small">
                  {view === "report"
                    ? drafts
                      ? "Отправленные анкеты и черновики."
                      : "Только отправленные анкеты."
                    : "Все статусы согласно фильтрам ниже."}{" "}
                  Выгрузки учитывают выбранные фильтры.
                  {format === "pdf"
                    ? " PDF использует даты и настройку черновиков отчёта. В окне печати выберите «Сохранить как PDF»."
                    : ""}
                </p>
              </div>
              {view === "report" ? (
                <Report survey={selected} rows={reportRows} />
              ) : (
                <>
                  <div className="toolbar no-print">
                    <input
                      aria-label="Поиск по имени или ID"
                      placeholder="Имя или ID участника"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                      aria-label="Фильтр статуса"
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                    >
                      <option value="all">Все статусы</option>
                      {Object.entries(entryStatuses).map(([key, title]) => (
                        <option value={key} key={key}>
                          {title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="results-grid">
                    <div className="respondents">
                      {list.map((r) => (
                        <button
                          className={
                            "respondent " +
                            (participant === r.id ? "selected" : "")
                          }
                          key={r.id}
                          onClick={() => setParticipant(r.id)}
                        >
                          <div>
                            <strong>
                              {r.name || "Участник " + r.id.slice(0, 8)}
                            </strong>
                            <span className={"badge " + r.status}>
                              {entryStatuses[r.status]}
                            </span>
                          </div>
                          <span className="small">
                            {new Date(r.updated).toLocaleString("ru-RU", {
                              timeZone: "Europe/Moscow",
                            })}{" "}
                            МСК
                          </span>
                        </button>
                      ))}
                      {!list.length && (
                        <div className="note">
                          Нет анкет по выбранным фильтрам.
                        </div>
                      )}
                    </div>
                    <div className="detail">
                      {!current ? (
                        <div className="empty-state">
                          Выберите участника, чтобы прочитать ответы.
                        </div>
                      ) : (
                        <>
                          <span className={"badge " + current.status}>
                            {entryStatuses[current.status]}
                          </span>
                          <h2>
                            {current.name ||
                              "Участник " + current.id.slice(0, 8)}
                          </h2>
                          <p className="small">ID: {current.id}</p>
                          {selected.questions.map((q, i) => (
                            <section className="answer" key={q.id}>
                              <h3>
                                {i + 1}. {q.title}
                              </h3>
                              <p className="pre">
                                {visibleQuestions(
                                  selected,
                                  current.answers,
                                ).some((item) => item.id === q.id)
                                  ? answerText(q, current.answers) ||
                                    "Нет ответа"
                                  : "Не показывался по условию"}
                              </p>
                            </section>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice no-print" role="status">
            {notice}
          </div>
        )}
      </div>
    </>
  );
}
