export const welcomeDefaults = {
  eyebrow: "ВАШ ОПЫТ ИМЕЕТ ЗНАЧЕНИЕ",
  footer: "Вместе определяем приоритеты",
  symbol: "↗",
  showFooter: true,
  showStripe: true,
  align: "left",
  textColor: "#333333",
  titleSize: 46,
  imagePosition: "bottom",
  imageFit: "contain",
  images: [],
};
export function validWelcome(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const limits = {
    eyebrow: 160,
    heading: 300,
    description: 4000,
    footer: 500,
    symbol: 12,
  };
  for (const [key, limit] of Object.entries(limits))
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" || value[key].length > limit)
    )
      return false;
  for (const key of ["showFooter", "showStripe"])
    if (value[key] !== undefined && typeof value[key] !== "boolean")
      return false;
  if (value.align !== undefined && !["left", "center"].includes(value.align))
    return false;
  if (
    value.textColor !== undefined &&
    (typeof value.textColor !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(value.textColor))
  )
    return false;
  if (
    value.titleSize !== undefined &&
    (!Number.isInteger(value.titleSize) ||
      value.titleSize < 24 ||
      value.titleSize > 72)
  )
    return false;
  if (
    value.imagePosition !== undefined &&
    !["top", "bottom"].includes(value.imagePosition)
  )
    return false;
  if (
    value.imageFit !== undefined &&
    !["contain", "cover"].includes(value.imageFit)
  )
    return false;
  return (
    value.images === undefined ||
    (Array.isArray(value.images) &&
      value.images.length <= 4 &&
      value.images.every(
        (image) =>
          image &&
          typeof image.src === "string" &&
          /^\/api\/images\/[0-9a-f-]{36}$/.test(image.src) &&
          typeof image.alt === "string" &&
          image.alt.length <= 300,
      ))
  );
}
export function surveyImageSources(survey) {
  return [
    ...new Set([
      ...survey.questions.flatMap((q) => (q.image ? [q.image.src] : [])),
      ...(survey.welcome?.images || []).map((image) => image.src),
    ]),
  ];
}
