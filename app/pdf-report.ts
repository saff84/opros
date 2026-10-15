import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Survey, Entry } from "./survey-model";
import {
  questionStats,
  matrixStats,
  numericSummary,
  rankingStats,
} from "./statistics";
import { visibleQuestions } from "./branching";
import { answerText } from "./question-input";
import { download } from "./exports";
export function reportDocument(
  s: Survey,
  rows: Entry[],
  filters = "Все данные выбранной версии",
): TDocumentDefinitions {
  const content: Content[] = [
    {
      text: "SANEXT · ОБРАТНАЯ СВЯЗЬ",
      color: s.accent,
      fontSize: 12,
      bold: true,
    },
    { text: s.title, style: "title" },
    {
      text: `Отчёт · версия ${s.schemaVersion || 1} · ${new Date().toLocaleDateString("ru-RU")}`,
      margin: [0, 0, 0, 8],
    },
    { text: filters, color: "#586874", fontSize: 9 },
    {
      text: `Анкет в отчёте: ${rows.length}. Отправлено: ${rows.filter((r) => r.status === "completed").length}.`,
      margin: [0, 12, 0, 18],
    },
  ];
  for (const q of s.questions) {
    const eligible = rows.filter((r) =>
        visibleQuestions(s, r.answers).some((p) => p.id === q.id),
      ),
      stats = questionStats(q, eligible);
    content.push(
      { text: q.title, style: "heading" },
      {
        text: `Ответили: ${stats.base.length}. Условие применимо: ${eligible.length}.`,
        fontSize: 9,
        color: "#586874",
        margin: [0, 0, 0, 8],
      },
    );
    if (["rating", "stars", "nps"].includes(q.type)) {
      const n = numericSummary(q, eligible);
      content.push({
        text:
          q.type === "nps"
            ? `NPS: ${n.nps.toFixed(1)} (от −100 до 100)`
            : `Средняя оценка: ${n.average.toFixed(2)}`,
        bold: true,
        margin: [0, 0, 0, 8],
      });
    }
    if (q.type === "text") {
      for (const row of stats.base.slice(0, 50))
        content.push({
          text: answerText(q, row.answers),
          margin: [0, 0, 0, 7],
          fontSize: 10,
        });
      if (stats.base.length > 50)
        content.push({
          text: "Показаны первые 50 текстовых ответов. Полный список доступен в Excel/CSV.",
          fontSize: 9,
        });
    } else if (q.type === "matrix")
      content.push({
        table: {
          headerRows: 1,
          widths: ["*", ...q.options.map(() => "*" as const)],
          body: [
            ["Строка", ...q.options],
            ...matrixStats(q, eligible).map((m) => [
              m.label,
              ...m.counts.map(
                (n) =>
                  `${n} (${m.total ? ((n / m.total) * 100).toFixed(1) : 0}%)`,
              ),
            ]),
          ],
        },
        fontSize: 8,
        layout: "lightHorizontalLines",
      });
    else if (q.type === "ranking")
      content.push({
        table: {
          headerRows: 1,
          widths: ["*", "auto", "auto"],
          body: [
            ["Вариант", "Среднее место", "Ответов"],
            ...rankingStats(q, eligible).map((r) => [
              r.label,
              r.average.toFixed(2),
              String(r.total),
            ]),
          ],
        },
        layout: "lightHorizontalLines",
      });
    else
      for (const row of stats.counts) {
        content.push(
          {
            text: `${row.label} — ${row.count} (${row.percent.toFixed(1)}%)`,
            fontSize: 10,
            margin: [0, 4, 0, 3],
          },
          {
            canvas: [
              { type: "rect", x: 0, y: 0, w: 440, h: 7, color: "#edf1f5" },
              {
                type: "rect",
                x: 0,
                y: 0,
                w: Math.max(0, (440 * row.percent) / 100),
                h: 7,
                color: s.accent,
              },
            ],
            margin: [0, 0, 0, 5],
          },
        );
      }
    if (q.otherOption) {
      const extra = stats.base
        .map((r) => r.answers[q.id + "__other"])
        .filter((v) => typeof v === "string" && v.trim())
        .slice(0, 50);
      if (extra.length)
        content.push(
          {
            text: `Уточнения «${q.otherOption}»`,
            bold: true,
            margin: [0, 10, 0, 4],
          },
          ...extra.map(
            (text) =>
              ({
                text: String(text),
                fontSize: 10,
                margin: [0, 0, 0, 5],
              }) as Content,
          ),
        );
    }
  }
  return {
    info: { title: s.title, author: "SANEXT", subject: filters },
    pageSize: "A4",
    pageMargins: [36, 40, 36, 44],
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#23343b" },
    styles: {
      title: { fontSize: 24, bold: true, margin: [0, 14, 0, 10] },
      heading: { fontSize: 15, bold: true, margin: [0, 18, 0, 8] },
    },
    footer: (page, total) => ({
      text: `SANEXT · ${page} / ${total}`,
      alignment: "center",
      fontSize: 8,
      color: "#586874",
    }),
    content,
  };
}
export async function downloadPdf(s: Survey, rows: Entry[], filters: string) {
  const [pdfModule, fontModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  const pdf = pdfModule.default;
  pdf.addVirtualFileSystem(fontModule.default);
  const blob = await pdf.createPdf(reportDocument(s, rows, filters)).getBlob();
  download(
    blob,
    "application/pdf",
    `SANEXT-${s.id.slice(0, 12)}-v${s.schemaVersion || 1}.pdf`,
  );
}
