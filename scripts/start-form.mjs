export const participantKeys = ["name", "department", "region"];
export const participantDefaults = {
  name: {
    mode: "optional",
    label: "Как к вам обращаться?",
    placeholder: "Имя / отдел / регион",
    hint: "",
  },
  department: { mode: "optional", label: "Отдел", placeholder: "", hint: "" },
  region: { mode: "optional", label: "Регион", placeholder: "", hint: "" },
};
export function startFormSettings(survey) {
  const config = survey.startForm || {};
  const fields = Object.fromEntries(
    participantKeys.map((key) => [
      key,
      { ...participantDefaults[key], ...config.fields?.[key] },
    ]),
  );
  return {
    eyebrow: config.eyebrow ?? "ОПРОС КОМАНДЫ SANEXT",
    heading: config.heading ?? (survey.description || survey.title),
    description: config.description ?? survey.intro,
    buttonText: config.buttonText ?? "Начать опрос →",
    note:
      config.note ??
      (fields.name.mode === "required"
        ? "Заполните обязательные поля. Черновик сохраняется на сервере и на этом устройстве."
        : fields.name.mode === "hidden"
          ? "Черновик сохраняется на сервере и на этом устройстве."
          : "Можно ответить без имени. Черновик сохраняется на сервере и на этом устройстве."),
    fields,
  };
}
export function validStartForm(config) {
  if (config === undefined) return true;
  if (!config || typeof config !== "object" || Array.isArray(config))
    return false;
  for (const [key, max] of Object.entries({
    eyebrow: 160,
    heading: 300,
    description: 4000,
    buttonText: 100,
    note: 1000,
  }))
    if (
      config[key] !== undefined &&
      (typeof config[key] !== "string" ||
        config[key].length > max ||
        (key === "buttonText" && !config[key].trim()))
    )
      return false;
  if (config.fields === undefined) return true;
  if (
    !config.fields ||
    typeof config.fields !== "object" ||
    Array.isArray(config.fields) ||
    Object.keys(config.fields).some((key) => !participantKeys.includes(key))
  )
    return false;
  for (const field of Object.values(config.fields)) {
    if (!field || typeof field !== "object" || Array.isArray(field))
      return false;
    if (
      field.mode !== undefined &&
      !["hidden", "optional", "required"].includes(field.mode)
    )
      return false;
    for (const [key, max] of Object.entries({
      label: 160,
      placeholder: 200,
      hint: 500,
    }))
      if (
        field[key] !== undefined &&
        (typeof field[key] !== "string" ||
          field[key].length > max ||
          (key === "label" && !field[key].trim()))
      )
        return false;
  }
  return true;
}
export function participantError(survey, values, complete = false) {
  const settings = startFormSettings(survey);
  for (const key of participantKeys) {
    const field = settings.fields[key],
      value = values[key] ?? "";
    if (
      typeof value !== "string" ||
      value.length > (key === "name" ? 120 : 160)
    )
      return (
        "Проверьте поле «" +
        field.label +
        "»: не более " +
        (key === "name" ? 120 : 160) +
        " символов."
      );
    if (complete && field.mode === "required" && !value.trim())
      return "Заполните поле «" + field.label + "».";
  }
  return null;
}
export function cleanParticipant(survey, values) {
  const settings = startFormSettings(survey);
  return Object.fromEntries(
    participantKeys.map((key) => [
      key,
      settings.fields[key].mode === "hidden"
        ? ""
        : String(values[key] ?? "").trim(),
    ]),
  );
}
