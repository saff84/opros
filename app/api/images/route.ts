import { getDatabase } from "../../runtime";
import { isAdmin, originOK, json, rateLimit } from "../../security";
import {
  detectImage,
  MAX_IMAGE_BYTES,
} from "../../../scripts/image-format.mjs";
export async function POST(req: Request) {
  if (!originOK(req)) return json({ error: "Запрос отклонён" }, 403);
  if (!(await isAdmin(req))) return json({ error: "Требуется вход" }, 401);
  if (!rateLimit("image-upload", 100, 3600_000))
    return json({ error: "Лимит загрузок. Попробуйте позже." }, 429);
  if (Number(req.headers.get("content-length")) > MAX_IMAGE_BYTES)
    return json({ error: "Картинка должна быть не больше 4 МБ" }, 413);
  const reader = req.body?.getReader();
  if (!reader) return json({ error: "Нет файла" }, 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return json({ error: "Картинка должна быть не больше 4 МБ" }, 413);
    }
    chunks.push(value);
  }
  const data = Buffer.concat(chunks),
    mime = detectImage(data);
  if (!mime)
    return json({ error: "Поддерживаются PNG, JPEG, WebP и GIF" }, 400);
  const id = crypto.randomUUID();
  getDatabase()
    .prepare("INSERT INTO images VALUES (?,?,?,?)")
    .run(id, mime, data, new Date().toISOString());
  return json({ image: { src: "/api/images/" + id, alt: "" } }, 201);
}
