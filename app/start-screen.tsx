"use client";
import { useState } from "react";
import type { Survey } from "./survey-model";
import { startFormSettings, participantError } from "../scripts/start-form.mjs";
export type ParticipantValues = {
  name: string;
  department: string;
  region: string;
};
export default function StartScreen({
  survey,
  values,
  onChange,
  onBegin,
  disabled = false,
  submitting = false,
}: {
  survey: Survey;
  values: ParticipantValues;
  onChange: (values: ParticipantValues) => void;
  onBegin: () => void;
  disabled?: boolean;
  submitting?: boolean;
}) {
  const settings = startFormSettings(survey);
  const [error, setError] = useState("");
  function field(key: keyof ParticipantValues) {
    const config = settings.fields[key];
    if (config.mode === "hidden") return null;
    return (
      <label className="label" key={key}>
        {config.label}{" "}
        <span>
          {config.mode === "required" ? "обязательно" : "необязательно"}
        </span>
        {config.hint && <span className="field-help">{config.hint}</span>}
        <input
          name={key}
          data-start-field={key}
          required={config.mode === "required"}
          aria-required={config.mode === "required"}
          maxLength={key === "name" ? 120 : 160}
          placeholder={config.placeholder}
          value={values[key]}
          disabled={disabled || submitting}
          onChange={(e) => {
            setError("");
            onChange({ ...values, [key]: e.target.value });
          }}
        />
      </label>
    );
  }
  const contextKeys = (["department", "region"] as const).filter(
    (key) => settings.fields[key].mode !== "hidden",
  );
  const contextRequired = contextKeys.some(
    (key) => settings.fields[key].mode === "required",
  );
  const contextTitle = contextKeys
    .map((key) => settings.fields[key].label)
    .join(" и ");
  const context = <div className="form-grid">{contextKeys.map(field)}</div>;
  return (
    <form
      className="welcome start-screen"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const issue = participantError(survey, values, true);
        setError(issue || "");
        if (issue) {
          const key = (["name", "department", "region"] as const).find(
            (key) =>
              settings.fields[key].mode === "required" && !values[key].trim(),
          );
          if (key)
            (
              e.currentTarget.elements.namedItem(key) as HTMLInputElement | null
            )?.focus();
          return;
        }
        onBegin();
      }}
    >
      {settings.eyebrow && <span className="eyebrow">{settings.eyebrow}</span>}
      {settings.heading && <h2 className="pre">{settings.heading}</h2>}
      {settings.description && <p className="pre">{settings.description}</p>}
      {field("name")}
      {settings.note && <div className="note pre">{settings.note}</div>}
      {contextKeys.length > 0 &&
        (contextRequired ? (
          <section className="participant-context">
            <h3>{contextTitle}</h3>
            {context}
          </section>
        ) : (
          <details className="participant-context">
            <summary>{contextTitle} · необязательно</summary>
            <p className="small">
              Используются для сравнения результатов между командами. Можно
              оставить пустыми.
            </p>
            {context}
          </details>
        ))}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button
        className="primary"
        type="submit"
        disabled={disabled || submitting}
      >
        {disabled
          ? "Подключаем сохранение…"
          : submitting
            ? "Сохраняем…"
            : settings.buttonText}
      </button>
    </form>
  );
}
