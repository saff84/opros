"use client";
import { visibleQuestions, sanitizeAnswers } from "./branching";
import { useEffect, useRef, useState } from "react";
import Brand from "./brand";
import { apiJson, ApiError } from "./api-client";
import {
  Survey,
  AnswerMap,
  emptyAnswers,
  validateAnswers,
  convertLegacy,
} from "./survey-model";
import { QuestionInput, theme } from "./question-input";
import { SurveyChooser } from "./survey-list";
import { tools } from "./data";
export default function Home() {
  const [surveys, setSurveys] = useState<Survey[]>([]),
    [survey, setSurvey] = useState<Survey | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("survey");
    fetch("/api/surveys?public=1" + (id ? "&id=" + encodeURIComponent(id) : ""))
      .then(apiJson)
      .then(async (d) => {
        if (d.survey) setSurvey(d.survey);
        else if (d.surveys.length === 1)
          await fetch(
            "/api/surveys?public=1&id=" + encodeURIComponent(d.surveys[0].id),
          )
            .then(apiJson)
            .then((x) => setSurvey(x.survey))
            .catch((e) => setError(e.message));
        else setSurveys(d.surveys);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  if (survey) return <SurveyForm key={survey.id} survey={survey} />;
  return (
    <>
      <header>
        <Brand subtitle="ОПРОСЫ КОМАНДЫ" />
        <a href="/results">Кабинет организатора ↗</a>
      </header>
      <div className="dashboard">
        <div className="eyebrow">ОБРАТНАЯ СВЯЗЬ SANEXT</div>
        <h1>Ваш опыт меняет решения.</h1>
        {surveys.length > 0 && (
          <p>Выберите опрос и поделитесь своим мнением.</p>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <p role="status">Загружаем опросы…</p>
        ) : !error ? (
          <SurveyChooser surveys={surveys} />
        ) : (
          <a className="secondary" href="/">
            К доступным опросам
          </a>
        )}
      </div>
    </>
  );
}
function SurveyForm({ survey: s }: { survey: Survey }) {
  const [answers, setAnswers] = useState<AnswerMap>(() => emptyAnswers(s)),
    [name, setName] = useState(""),
    [step, setStep] = useState(-1),
    [ready, setReady] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(""),
    [expired, setExpired] = useState(false),
    [updated, setUpdated] = useState(false);
  const token = useRef(""),
    id = useRef(""),
    queue = useRef<Promise<unknown>>(Promise.resolve()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    finished = useRef(false),
    initializing = useRef(false),
    alive = useRef(true);
  const activeQuestions = visibleQuestions(s, answers);
  const storage = "sanext-v2-" + s.id;
  const tokenStorage = storage + "-token",
    backupStorage =
      storage +
      ((s.schemaVersion || 1) > 1 ? "-v" + s.schemaVersion : "") +
      "-backup";
  async function request(action: string, a: AnswerMap, n: string) {
    const r = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        answers: a,
        name: n,
        surveyId: s.id,
        revision: s.revision,
        sessionToken: token.current,
      }),
    });
    const data = await r
      .json()
      .catch(() => ({ error: "Сервер вернул неполный ответ" }));
    if (!r.ok) {
      if (data.code === "SESSION_EXPIRED") setExpired(true);
      if (data.code === "SURVEY_UPDATED") setUpdated(true);
      if (data.code === "COMPLETED") {
        finished.current = true;
        setDone(true);
        try {
          localStorage.removeItem(backupStorage);
        } catch {}
        return { ok: true };
      }
      throw new ApiError(data.error || "Не удалось сохранить ответы", r.status);
    }
    return data;
  }
  async function initialize(reset = false) {
    if (initializing.current) return;
    initializing.current = true;
    setError("");
    setReady(false);
    try {
      if (timer.current) clearTimeout(timer.current);
      await queue.current.catch(() => {});
      try {
        token.current = reset
          ? ""
          : localStorage.getItem(tokenStorage) ||
            (s.id === "legacy"
              ? localStorage.getItem("sanext-survey-session")
              : "") ||
            "";
        if (reset) {
          localStorage.removeItem(tokenStorage);
          if (s.id === "legacy")
            localStorage.removeItem("sanext-survey-session");
        }
      } catch {}
      const d = await request("start", emptyAnswers(s), "");
      if (!alive.current) return;
      token.current = d.sessionToken;
      id.current = d.id;
      let backup: any;
      try {
        localStorage.setItem(tokenStorage, d.sessionToken);
        backup = JSON.parse(localStorage.getItem(backupStorage) || "null");
        if (!backup && s.id === "legacy" && (s.schemaVersion || 1) === 1) {
          const old = JSON.parse(
            localStorage.getItem("sanext-survey-backup") || "null",
          );
          if (old?.answers)
            backup = {
              ...old,
              answers: convertLegacy(old.answers),
              revision: s.revision,
              schema: JSON.stringify(s.questions),
              dirty: true,
            };
        }
      } catch {}
      const recover =
        d.status !== "completed" &&
        (backup?.schema === JSON.stringify(s.questions) ||
          backup?.revision === s.revision) &&
        (backup?.dirty || reset || d.status === "visited") &&
        !validateAnswers(s, backup.answers, false);
      setAnswers(recover ? backup.answers : d.answers);
      setName(recover ? backup.name : d.name);
      finished.current = d.status === "completed";
      setDone(finished.current);
      setReady(true);
      setExpired(false);
      if (recover) setSaved("Восстановлен локальный черновик");
      if (finished.current) {
        try {
          localStorage.removeItem(backupStorage);
        } catch {}
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      initializing.current = false;
    }
  }
  useEffect(() => {
    alive.current = true;
    void initialize();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  function backup(a: AnswerMap, n: string, dirty = true) {
    try {
      localStorage.setItem(
        backupStorage,
        JSON.stringify({
          id: id.current,
          revision: s.revision,
          schema: JSON.stringify(s.questions),
          answers: a,
          name: n,
          dirty,
          updated: new Date().toISOString(),
        }),
      );
    } catch {
      setSaved(
        "Хранилище браузера недоступно. Не закрывайте страницу до сохранения.",
      );
    }
  }
  function persist(action: string, a: AnswerMap, n: string) {
    const task = queue.current
      .catch(() => {})
      .then(() => {
        if (finished.current) return;
        return request(action, a, n);
      });
    queue.current = task;
    return task;
  }
  function edit(a: AnswerMap, n: string) {
    if (
      s.id === "legacy" &&
      (s.schemaVersion || 1) === 1 &&
      Array.isArray(a.benefit)
    ) {
      const usage = a.usage as Record<string, number>;
      a = {
        ...a,
        benefit: a.benefit.filter(
          (option) =>
            !tools.includes(option) ||
            usage[option] === 0 ||
            usage[option] === 1,
        ),
      };
    }
    a = sanitizeAnswers(s, a);
    setAnswers(a);
    setName(n);
    setError("");
    setSaved("Сохраняем черновик…");
    backup(a, n);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      persist("save", a, n)
        .then(() => {
          if (!finished.current) {
            setSaved("Черновик сохранён");
            let latest: any;
            try {
              latest = JSON.parse(
                localStorage.getItem(backupStorage) || "null",
              );
            } catch {}
            if (
              JSON.stringify(latest?.answers) === JSON.stringify(a) &&
              latest?.name === n
            )
              backup(a, n, false);
          }
        })
        .catch((e) => setError(e.message));
    }, 1100);
  }
  async function next() {
    const q = activeQuestions[step];
    if (q) {
      const single = { ...s, questions: [{ ...q, showWhen: undefined }] };
      const e = validateAnswers(single, { [q.id]: answers[q.id] }, true);
      if (e) {
        setError(e);
        return;
      }
    }
    const last = step === activeQuestions.length - 1;
    if (last) {
      const e = validateAnswers(s, answers, true);
      if (e) {
        setError(e);
        return;
      }
    }
    if (timer.current) clearTimeout(timer.current);
    setSaving(true);
    setError("");
    try {
      await persist(last ? "submit" : "save", answers, name);
      if (last) {
        finished.current = true;
        setDone(true);
        try {
          localStorage.removeItem(backupStorage);
          if (s.id === "legacy")
            localStorage.removeItem("sanext-survey-backup");
        } catch {}
      } else setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const q = activeQuestions[step];
  return (
    <div className="survey-shell" style={theme(s)}>
      <header>
        <Brand subtitle="ОБРАТНАЯ СВЯЗЬ" />
        <div className="header-links">
          <a href="/">Все опросы ↗</a>
          <span className="pill">{activeQuestions.length} вопросов</span>
        </div>
      </header>
      <main>
        <aside>
          <div className="eyebrow">ВАШ ОПЫТ ИМЕЕТ ЗНАЧЕНИЕ</div>
          <h1>{s.title}</h1>
          <p>{s.description}</p>
          <div className="aside-bottom">
            <span className="big">↗</span>Вместе определяем приоритеты
          </div>
        </aside>
        <section className="panel">
          {done ? (
            <div className="welcome">
              <div className="success">✓</div>
              <div className="eyebrow">ОТВЕТЫ ОТПРАВЛЕНЫ</div>
              <h2>Спасибо за ваше мнение.</h2>
              <p className="pre">{s.thanks}</p>
              <a className="secondary" href="/">
                Все опросы →
              </a>
            </div>
          ) : step < 0 ? (
            <div className="welcome">
              <span className="eyebrow">ОПРОС КОМАНДЫ SANEXT</span>
              <h2>{s.description || s.title}</h2>
              <p className="pre">{s.intro}</p>
              <label className="label">
                Как к вам обращаться? <span>необязательно</span>
                <input
                  maxLength={120}
                  value={name}
                  disabled={!ready}
                  onChange={(e) => edit(answers, e.target.value)}
                  placeholder="Имя / отдел / регион"
                />
              </label>
              <div className="note">
                Можно ответить без имени. Черновик сохраняется на сервере и на
                этом устройстве.
              </div>
              <button
                className="primary"
                disabled={!ready || saving}
                onClick={() => setStep(0)}
              >
                {ready ? "Начать опрос →" : "Подключаем сохранение…"}
              </button>
            </div>
          ) : (
            <>
              <div className="progress-label">
                <span>
                  ВОПРОС {step + 1} / {activeQuestions.length}
                </span>
                <span>
                  {Math.round((step / activeQuestions.length) * 100)}%
                </span>
              </div>
              <div className="progress">
                <div
                  style={{ width: (step / activeQuestions.length) * 100 + "%" }}
                />
              </div>
              <div className="steps">
                {activeQuestions.map((x, i) => (
                  <button
                    key={x.id}
                    disabled={i > step || saving}
                    className={i === step ? "active" : ""}
                    aria-label={"Вопрос " + (i + 1)}
                    onClick={() => {
                      setStep(i);
                      setError("");
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <h2>{q.title}</h2>
              <p>{q.description}</p>
              <span className="small">
                {q.required ? "Обязательный вопрос" : "Можно пропустить"}
              </span>
              <QuestionInput
                question={
                  s.id === "legacy" &&
                  (s.schemaVersion || 1) === 1 &&
                  q.id === "benefit"
                    ? {
                        ...q,
                        options: q.options.filter(
                          (option) =>
                            !tools.includes(option) ||
                            (answers.usage as Record<string, number>)[
                              option
                            ] === 0 ||
                            (answers.usage as Record<string, number>)[
                              option
                            ] === 1,
                        ),
                      }
                    : q
                }
                value={answers[q.id]}
                disabled={saving || !ready}
                onChange={(v) => edit({ ...answers, [q.id]: v }, name)}
              />
              <div className="navigation">
                <button
                  className="secondary"
                  disabled={saving}
                  onClick={() => {
                    setStep(step - 1);
                    setError("");
                  }}
                >
                  ← Назад
                </button>
                <button className="primary" disabled={saving} onClick={next}>
                  {saving
                    ? "Сохраняем…"
                    : step === activeQuestions.length - 1
                      ? "Отправить ответы ✓"
                      : "Далее →"}
                </button>
              </div>
              <div className="small" role="status">
                {saved}
              </div>
            </>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              {updated ? (
                <button className="secondary" onClick={() => location.reload()}>
                  Обновить вопросы
                </button>
              ) : expired ? (
                <button
                  className="secondary"
                  onClick={() => void initialize(true)}
                >
                  Создать новую сессию и восстановить черновик
                </button>
              ) : !ready ? (
                <button className="secondary" onClick={() => void initialize()}>
                  Повторить подключение
                </button>
              ) : null}
            </div>
          )}
        </section>
      </main>
      <footer>
        <span>SANEXT · Обратная связь команды</span>
        <a href="/results">Кабинет организатора ↗</a>
      </footer>
    </div>
  );
}
