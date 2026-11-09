"use client";
export type PublicSurvey = {
  id: string;
  title: string;
  description: string;
  accent: string;
  cover?: { src: string; alt: string; fit?: "cover" | "contain"; position?: "center" | "top" | "bottom" };
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
          {s.cover && <img className="survey-card-cover" src={s.cover.src} alt={s.cover.alt} style={{ objectFit: s.cover.fit || "cover", objectPosition: s.cover.position || "center" }} />}
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
