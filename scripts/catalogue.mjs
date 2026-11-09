export function validCatalogue(s) {
  if (s.pageDescription !== undefined && (typeof s.pageDescription !== "string" || s.pageDescription.length > 1000)) return false;
  if (s.pageTitle !== undefined && (typeof s.pageTitle !== "string" || s.pageTitle.length > 160)) return false;
  if (s.unlisted !== undefined && typeof s.unlisted !== "boolean") return false;
  const c = s.cover;
  return c === undefined || (!!c && typeof c.src === "string" &&
    /^\/api\/images\/[0-9a-f-]{36}$/.test(c.src) && typeof c.alt === "string" && c.alt.length <= 300 &&
    (c.fit === undefined || ["cover", "contain"].includes(c.fit)) &&
    (c.position === undefined || ["center", "top", "bottom"].includes(c.position)));
}
