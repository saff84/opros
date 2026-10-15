"use client";
export type PublicSurvey = {
  id: string;
  title: string;
  description: string;
  accent: string;
};
export function SurveyChooser({ surveys }: { surveys: PublicSurvey[] }) {
  return surveys.length ? (
    <div className="survey-cards">
      {surveys.map((s) => (
        <a
          key={s.id}
          className="survey-card"
          href={"/?survey=" + encodeURIComponent(s.id)}
          style={{ borderTopColor: s.accent }}
        >
          <span className="badge completed">Активен · принимает ответы</span>
          <h2>{s.title}</h2>
          <p>{s.description}</p>
          <strong>Пройти опрос →</strong>
        </a>
      ))}
    </div>
  ) : (
    <div className="no-surveys">
      <span className="empty-symbol" aria-hidden="true">
        ◷
      </span>
      <h2>Сейчас нет активных опросов</h2>
      <p>
        Новые опросы появятся здесь, когда организатор откроет сбор ответов.
      </p>
      <button className="secondary" onClick={() => location.reload()}>
        Проверить обновления
      </button>
    </div>
  );
}
