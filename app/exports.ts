import { surveyImageSources } from "../scripts/welcome.mjs";
import { visibleQuestions } from "./branching";
import { Survey, Entry } from "./survey-model";
import { answerText } from "./question-input";
import { summaryTable } from "./statistics";
export function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const safe = (s: string) => (/^[\s]*[=+@\-\t\r]/.test(s) ? "'" + s : s);
export function csv(table: string[][]) {
  return (
    "\uFEFF" +
    table
      .map((row) =>
        row.map((v) => '"' + safe(v).replaceAll('"', '""') + '"').join(";"),
      )
      .join("\r\n")
  );
}
export function responseTable(s: Survey, rows: Entry[]): string[][] {
  return [
    [
      "ID",
      "Опрос",
      "Версия вопросов",
      "Имя",
      "Статус",
      "Создано (UTC)",
      "Обновлено (UTC)",
      ...s.questions.map((q) => q.title),
    ],
    ...rows.map((r) => {
      const visible = new Set(visibleQuestions(s, r.answers).map((q) => q.id));
      return [
        r.id,
        s.title,
        String(s.schemaVersion || 1),
        r.name,
        { visited: "Зашёл", draft: "Заполняет", completed: "Отправил" }[
          r.status
        ],
        r.created,
        r.updated,
        ...s.questions.map((q) =>
          visible.has(q.id)
            ? answerText(q, r.answers)
            : "Не показывался по условию",
        ),
      ];
    }),
  ];
}
const xml = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files: Record<string, string>) {
  const encoder = new TextEncoder(),
    parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const n = encoder.encode(name),
      data = encoder.encode(content),
      crc = crc32(data);
    const local = new Uint8Array(30 + n.length),
      v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(12, 33, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, n.length, true);
    local.set(n, 30);
    parts.push(local, data);
    const c = new Uint8Array(46 + n.length),
      cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    v.setUint16(12, 33, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    c.set(n, 46);
    central.push(c);
    offset += local.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0),
    end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end],
    out = new Uint8Array(offset + size + 22);
  let pos = 0;
  for (const part of all) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}
function column(i: number): string {
  return i < 26
    ? String.fromCharCode(65 + i)
    : column(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
}
export function workbook(s: Survey, rows: Entry[]) {
  const sheets = [responseTable(s, rows), summaryTable(s, rows)];
  const files: Record<string, string> = {
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      "</Types>",
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ответы" sheetId="1" r:id="rId1"/><sheet name="Статистика" sheetId="2" r:id="rId2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      "</Relationships>",
  };
  sheets.forEach((table, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] =
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="' +
      table[0].length +
      '" width="32" customWidth="1"/></cols><sheetData>' +
      table
        .map(
          (row, r) =>
            `<row r="${r + 1}">` +
            row
              .map((v, c) =>
                i === 1 &&
                r > 0 &&
                c >= 2 &&
                v !== "" &&
                Number.isFinite(Number(v))
                  ? `<c r="${column(c)}${r + 1}"><v>${Number(v)}</v></c>`
                  : `<c r="${column(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v.slice(0, 32767))}</t></is></c>`,
              )
              .join("") +
            "</row>",
        )
        .join("") +
      '</sheetData><autoFilter ref="A1:' +
      column(table[0].length - 1) +
      table.length +
      '"/></worksheet>';
  });
  return zip(files).buffer as ArrayBuffer;
}
export async function exportResults(format: string, s: Survey, rows: Entry[]) {
  const name =
    "SANEXT-" +
    s.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 80) +
    "-" +
    s.id.slice(0, 8) +
    "-v" +
    (s.schemaVersion || 1);
  if (format === "json") {
    const sources = surveyImageSources(s);
    const images = await Promise.all(
      sources.map(async (src) => {
        const response = await fetch(src + "?format=json", {
          cache: "no-store",
        });
        if (!response.ok)
          throw Error(
            "Не удалось выгрузить картинки. Проверьте вход в кабинет.",
          );
        return response.json();
      }),
    );
    download(
      JSON.stringify(
        {
          version: 2,
          exportedAt: new Date().toISOString(),
          survey: s,
          rows,
          images,
        },
        null,
        2,
      ),
      "application/json;charset=utf-8",
      name + ".json",
    );
  }
  if (format === "csv")
    download(
      csv(responseTable(s, rows)),
      "text/csv;charset=utf-8",
      name + "-responses.csv",
    );
  if (format === "summary")
    download(
      csv(summaryTable(s, rows)),
      "text/csv;charset=utf-8",
      name + "-summary.csv",
    );
  if (format === "xlsx")
    download(
      workbook(s, rows),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name + ".xlsx",
    );
  if (format === "pdf") window.print();
}
