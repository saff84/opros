"use client";
import { WelcomeBlock } from "./welcome-block";
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
import { visiblePages, pageAnswerError } from "./survey-pages";
import { otherKey } from "../scripts/survey-features.mjs";
import { SurveyChooser } from "./survey-list";
import { tools } from "./data";
import { recoverCompatibleAnswers } from "./live-survey";
export default function Home() {
  const [surveys, setSurveys] = useState<Survey[]>([]),
    [survey, setSurvey] = useState<Survey | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [updateNotice, setUpdateNotice] = useState("");
  useEffect(() => {
    let selectedId = new URLSearchParams(location.search).get("survey"),
      previous: Survey | null = null,
      pending = false,
      alive = true;
    const controller = new AbortController();
    async function refresh() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const response = await fetch(
          "/api/surveys?public=1" +
            (selectedId ? "&id=" + encodeURIComponent(selectedId) : ""),
          { cache: "no-store", signal: controller.signal },
        );
        const d = await apiJson(response);
        if (!alive) return;
        let next: Survey | null = d.survey || null;
        if (!next && d.surveys?.length === 1) {
          next = (
            await apiJson(
              await fetch(
                "/api/surveys?public=1&id=" +
                  encodeURIComponent(d.surveys[0].id),
                { cache: "no-store", signal: controller.signal },
              ),
            )
          ).survey;
        }
        if (!alive) return;
        if (next) {
          selectedId = next.id;
          if (previous && previous.revision !== next.revision)
            setUpdateNotice(
              (previous.schemaVersion || 1) !== (next.schemaVersion || 1)
                ? "Вопросы опроса обновлены. Подходящие ответы черновика восстановлены; проверьте новые и изменённые вопросы."
                : "Оформление и тексты опроса обновлены.",
            );
          if (!previous || previous.revision !== next.revision) setSurvey(next);
          previous = next;
        } else {
          setSurveys(d.surveys || []);
          setSurvey(null);
        }
        setError("");
      } catch (e) {
        if (!alive || controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 404) {
          previous = null;
          setSurvey(null);
          setError(e.message);
        } else if (!previous) setError((e as Error).message);
      } finally {
        pending = false;
        if (alive) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "sanext-survey-updated") void refresh();
    };
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("sanext-survey-refresh", onFocus);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sanext-survey-refresh", onFocus);
    };
  }, []);
  if (survey)
    return (
      <SurveyForm
        key={survey.id + "-" + (survey.schemaVersion || 1)}
        survey={survey}
        updateNotice={updateNotice}
      />
    );
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
function SurveyForm({
  survey: s,
  updateNotice,
}: {
  survey: Survey;
  updateNotice: string;
}) {
  const [answers, setAnswers] = useState<AnswerMap>(() => emptyAnswers(s)),
    [name, setName] = useState(""),
    [department, setDepartment] = useState(""),
    [region, setRegion] = useState(""),
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
  const pages = visiblePages(s, answers);
  const currentStep = step < 0 ? -1 : Math.min(step, pages.length - 1);
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
        department,
        region,
        source:
          typeof location !== "undefined"
            ? new URLSearchParams(location.search).get("source") ||
              new URLSearchParams(location.search).get("utm_source") ||
              "direct"
            : "direct",
        campaign:
          typeof location !== "undefined"
            ? new URLSearchParams(location.search).get("campaign") ||
              new URLSearchParams(location.search).get("utm_campaign") ||
              ""
            : "",
      }),
    });
    const data = await r
      .json()
      .catch(() => ({ error: "Сервер вернул неполный ответ" }));
    if (!r.ok) {
      if (data.code === "SESSION_EXPIRED") setExpired(true);
      if (data.code === "SURVEY_UPDATED") setUpdated(true);
      if (data.code === "SURVEY_UPDATED")
        window.dispatchEvent(new Event("sanext-survey-refresh"));
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
      if (!backup && (s.schemaVersion || 1) > 1) {
        try {
          const candidates = Object.keys(localStorage)
            .filter(
              (key) =>
                (key.startsWith(storage + "-v") &&
                  key.endsWith("-backup") &&
                  key !== backupStorage) ||
                key === storage + "-backup",
            )
            .map((key) => ({
              version: Number(key.match(/-v(\d+)-backup$/)?.[1] || 1),
              value: JSON.parse(localStorage.getItem(key) || "null"),
            }))
            .filter(
              (item) =>
                item.version < (s.schemaVersion || 1) &&
                item.value?.answers &&
                item.value?.dirty &&
                item.value?.schema,
            )
            .sort((a, b) => b.version - a.version);
          for (const { value: candidate } of candidates) {
            const previousQuestions = JSON.parse(candidate.schema);
            if (!Array.isArray(previousQuestions)) continue;
            const compatible = recoverCompatibleAnswers(
              s,
              previousQuestions,
              candidate.answers,
              d.answers,
            );
            if (!validateAnswers(s, compatible, false)) {
              backup = {
                ...candidate,
                answers: compatible,
                schema: JSON.stringify(s.questions),
                revision: s.revision,
                dirty: true,
              };
              break;
            }
          }
        } catch {}
      }
      const recover =
        d.status !== "completed" &&
        (backup?.schema === JSON.stringify(s.questions) ||
          backup?.revision === s.revision) &&
        (backup?.dirty || reset || d.status === "visited") &&
        !validateAnswers(s, backup.answers, false);
      setAnswers(recover ? backup.answers : d.answers);
      setName(recover ? backup.name : d.name);
      setDepartment(d.context?.department || "");
      setRegion(d.context?.region || "");
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
  useEffect(() => {
    if (
      !ready ||
      done ||
      currentStep < 0 ||
      !pages[currentStep] ||
      !token.current
    )
      return;
    const send = (action: string, pageId = "") =>
      fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          pageId,
          surveyId: s.id,
          sessionToken: token.current,
        }),
        keepalive: true,
      }).catch(() => {});
    void send("begin");
    void send("page", pages[currentStep].id);
  }, [ready, done, currentStep, pages[currentStep]?.id]);
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
    const page = pages[currentStep];
    if (page) {
      const e = pageAnswerError(s, page, answers);
      if (e) {
        setError(e);
        return;
      }
    }
    const last = currentStep === pages.length - 1;
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
      } else setStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const currentPage = pages[currentStep];
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
        <WelcomeBlock survey={s} />
        <section className="panel">
          {updateNotice && (
            <div className="notice" role="status">
              {updateNotice}
            </div>
          )}
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
              <details className="participant-context">
                <summary>Отдел и регион · необязательно</summary>
                <p className="small">
                  Используются для сравнения результатов между командами. Можно
                  оставить пустыми.
                </p>
                <div className="form-grid">
                  <label className="label">
                    Отдел
                    <input
                      maxLength={160}
                      value={department}
                      disabled={!ready}
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  </label>
                  <label className="label">
                    Регион
                    <input
                      maxLength={160}
                      value={region}
                      disabled={!ready}
                      onChange={(e) => setRegion(e.target.value)}
                    />
                  </label>
                </div>
              </details>
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
                  СТРАНИЦА {currentStep + 1} / {pages.length}
                </span>
                <span>{Math.round((currentStep / pages.length) * 100)}%</span>
              </div>
              <div className="progress">
                <div
                  style={{ width: (currentStep / pages.length) * 100 + "%" }}
                />
              </div>
              <div className="steps">
                {pages.map((x, i) => (
                  <button
                    key={x.id}
                    disabled={i > currentStep || saving}
                    className={i === currentStep ? "active" : ""}
                    aria-label={"Страница " + (i + 1)}
                    onClick={() => {
                      setStep(i);
                      setError("");
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              {currentPage?.questions.map((q) => (
                <section
                  className="page-question"
                  key={q.id}
                  aria-label={q.title}
                >
                  <h2>{q.title}</h2>
                  <p>{q.description}</p>
                  <span className="small">
                    {q.required ? "Обязательный вопрос" : "Можно пропустить"}
                  </span>
                  <QuestionInput
                    otherValue={String(answers[otherKey(q.id)] || "")}
                    onOtherChange={(value) =>
                      edit({ ...answers, [otherKey(q.id)]: value }, name)
                    }
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
                </section>
              ))}
              <div className="navigation">
                <button
                  className="secondary"
                  disabled={saving}
                  onClick={() => {
                    setStep(currentStep - 1);
                    setError("");
                  }}
                >
                  ← Назад
                </button>
                <button className="primary" disabled={saving} onClick={next}>
                  {saving
                    ? "Сохраняем…"
                    : currentStep === pages.length - 1
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
