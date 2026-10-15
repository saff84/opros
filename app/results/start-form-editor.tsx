"use client";
import { useState } from "react";
import type { Survey, StartForm, StartField } from "../survey-model";
import { startFormSettings } from "../../scripts/start-form.mjs";
import StartScreen, { type ParticipantValues } from "../start-screen";
export default function StartFormEditor({
  survey,
  onChange,
}: {
  survey: Survey;
  onChange: (value: StartForm) => void;
}) {
  const settings = startFormSettings(survey);
  const [values, setValues] = useState<ParticipantValues>({
      name: "",
      department: "",
      region: "",
    }),
    [notice, setNotice] = useState("");
  const update = (patch: StartForm) =>
    onChange({ ...survey.startForm, ...patch });
  const field = (key: keyof ParticipantValues, patch: StartField) =>
    update({
      fields: {
        ...survey.startForm?.fields,
        [key]: { ...survey.startForm?.fields?.[key], ...patch },
      },
    });
  return (
    <div className="start-form-settings">
      <section className="summary-card">
        <h3>Стартовая форма перед вопросами</h3>
        <p className="small">
          Это экран с именем, отделом и регионом и кнопкой начала опроса.
          Настройки действуют только для этого опроса. Боковая панель
          настраивается отдельно во вкладке «Приветственный блок».
        </p>
        <div className="form-grid">
          <label className="label">
            Надпись над заголовком
            <input
              maxLength={160}
              value={settings.eyebrow}
              onChange={(e) => update({ eyebrow: e.target.value })}
            />
          </label>
          <label className="label">
            Текст кнопки начала
            <input
              maxLength={100}
              value={settings.buttonText}
              onChange={(e) => update({ buttonText: e.target.value })}
            />
          </label>
        </div>
        <label className="label">
          Заголовок стартовой формы
          <input
            maxLength={300}
            value={settings.heading}
            onChange={(e) => update({ heading: e.target.value })}
          />
          <span>
            По умолчанию берётся из подзаголовка опроса. Можно задать отдельный
            текст.
          </span>
        </label>
        <label className="label">
          Описание перед началом
          <textarea
            maxLength={4000}
            value={settings.description}
            onChange={(e) => update({ description: e.target.value })}
          />
          <span>
            По умолчанию используется «Вступление» из вкладки «Вопросы и
            тексты».
          </span>
        </label>
        <label className="label">
          Информационный блок
          <textarea
            maxLength={1000}
            value={settings.note}
            onChange={(e) => update({ note: e.target.value })}
          />
          <span>
            Пустое поле скрывает этот блок. Без собственной настройки текст
            автоматически учитывает обязательность имени.
          </span>
        </label>
        {(["name", "department", "region"] as const).map((key, index) => {
          const config = settings.fields[key],
            title = ["Имя", "Отдел", "Регион"][index];
          return (
            <fieldset className="start-field-config" key={key}>
              <legend>{title}</legend>
              <div className="form-grid">
                <label className="label">
                  Показывать поле
                  <select
                    aria-label={title + ": режим"}
                    value={config.mode}
                    onChange={(e) =>
                      field(key, { mode: e.target.value as StartField["mode"] })
                    }
                  >
                    <option value="hidden">Скрыто</option>
                    <option value="optional">Необязательное</option>
                    <option value="required">Обязательное</option>
                  </select>
                </label>
                <label className="label">
                  Название поля
                  <input
                    aria-label={title + ": название"}
                    maxLength={160}
                    value={config.label}
                    onChange={(e) => field(key, { label: e.target.value })}
                  />
                </label>
              </div>
              {config.mode !== "hidden" && (
                <>
                  <label className="label">
                    Пример внутри поля
                    <input
                      aria-label={title + ": пример"}
                      maxLength={200}
                      value={config.placeholder}
                      onChange={(e) =>
                        field(key, { placeholder: e.target.value })
                      }
                    />
                  </label>
                  <label className="label">
                    Подсказка к полю
                    <input
                      aria-label={title + ": подсказка"}
                      maxLength={500}
                      value={config.hint}
                      onChange={(e) => field(key, { hint: e.target.value })}
                    />
                  </label>
                </>
              )}
              <p className="small">
                {config.mode === "required"
                  ? "Без заполнения нельзя начать или отправить опрос."
                  : config.mode === "hidden"
                    ? "Поле не показывается; новые значения не собираются. Прежние отправленные анкеты сохраняются."
                    : "Участник может оставить поле пустым."}
              </p>
            </fieldset>
          );
        })}
        <button
          type="button"
          className="text-button"
          onClick={() => onChange({})}
        >
          Сбросить настройки стартовой формы
        </button>
        <p className="small">
          После настройки нажмите «Сохранить изменения» вверху редактора.
          Изменение стартовой формы не создаёт новую версию вопросов.
        </p>
      </section>
      <section className="start-form-preview summary-card">
        <h3>Предпросмотр стартовой формы</h3>
        <StartScreen
          survey={survey}
          values={values}
          onChange={(value) => {
            setValues(value);
            setNotice("");
          }}
          onBegin={() =>
            setNotice(
              "Поля заполнены корректно. В предпросмотре данные не сохраняются.",
            )
          }
        />
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
      </section>
    </div>
  );
}
