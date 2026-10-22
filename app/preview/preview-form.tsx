"use client";
import { useState } from "react";
import { Survey, AnswerMap, emptyAnswers, validateAnswers } from "../survey-model";
import { sanitizeAnswers } from "../branching";
import { visiblePages, pageAnswerError } from "../survey-pages";
import { QuestionInput, theme } from "../question-input";
import { WelcomeBlock } from "../welcome-block";
import StartScreen from "../start-screen";
import { otherKey } from "../../scripts/survey-features.mjs";

export default function PreviewForm({ survey: s }: { survey: Survey }) {
  const [answers, setAnswers] = useState<AnswerMap>(() => emptyAnswers(s));
  const [participant, setParticipant] = useState({ name: "", department: "", region: "" });
  const [step, setStep] = useState(-1), [done, setDone] = useState(false), [error, setError] = useState("");
  const pages = visiblePages(s, answers);
  const index = Math.min(step, Math.max(0, pages.length - 1));
  const page = pages[index];
  function next() {
    const issue = page ? pageAnswerError(s, page, answers) : null;
    const last = index >= pages.length - 1;
    const problem = issue || (last ? validateAnswers(s, answers, true) : null);
    if (problem) { setError(problem); return; }
    setError("");
    if (last) setDone(true); else setStep(index + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return <div className="survey-shell" style={theme(s)}>
    <header><strong>Предпросмотр опроса</strong><span className="pill">Ответы не сохраняются</span></header>
    <main>
      <WelcomeBlock survey={s} />
      <section className="panel">
        <p className="note">Проверка сохранённой версии опроса. Прохождение не попадает в статистику.</p>
        {done ? <><h1>Спасибо!</h1><p>{s.thanks}</p><button onClick={() => { setAnswers(emptyAnswers(s)); setParticipant({ name: "", department: "", region: "" }); setStep(-1); setDone(false); setError(""); }}>Пройти ещё раз</button></>
          : step < 0 ? <StartScreen survey={s} values={participant} onChange={setParticipant} onBegin={() => setStep(0)} />
          : <>
            <p className="small">Страница {index + 1} из {pages.length}</p>
            {page?.questions.map(q => <section className="preview-page" key={q.id}>
              <h2>{q.title}{q.required ? " *" : ""}</h2><p className="pre">{q.description}</p>
              <QuestionInput question={q} value={answers[q.id]}
                otherValue={String(answers[otherKey(q.id)] || "")}
                onOtherChange={value => setAnswers(a => ({ ...a, [otherKey(q.id)]: value }))}
                onChange={value => setAnswers(a => sanitizeAnswers(s, { ...a, [q.id]: value }))} />
            </section>)}
            {error && <p className="error" role="alert">{error}</p>}
            <div className="navigation"><button onClick={() => { setStep(index - 1); setError(""); }}>← Назад</button>
              <button className="primary" onClick={next}>{index >= pages.length - 1 ? "Завершить предпросмотр" : "Далее →"}</button></div>
          </>}
      </section>
    </main>
  </div>;
}
