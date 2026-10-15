import { visibleQuestions } from "./branching";
import { Entry, Survey, Question } from "./survey-model";
export type Count = { label: string; count: number; percent: number };
export function answered(q: Question, r: Entry) {
  const v = r.answers[q.id];
  return q.type === "matrix"
    ? !!v && Object.keys(v).length > 0
    : Array.isArray(v)
      ? v.length > 0
      : typeof v === "string" && !!v.trim();
}
export function questionStats(q: Question, rows: Entry[]) {
  const base = rows.filter((r) => answered(q, r));
  const counts = q.options.map((label, i) => {
    const count = base.filter((r) =>
      q.type === "matrix"
        ? Object.values(r.answers[q.id] as Record<string, number>).includes(i)
        : Array.isArray(r.answers[q.id])
          ? (r.answers[q.id] as string[]).includes(label)
          : r.answers[q.id] === label,
    ).length;
    return {
      label,
      count,
      percent: base.length ? (count / base.length) * 100 : 0,
    };
  });
  return { base, counts };
}
export function matrixStats(q: Question, rows: Entry[]) {
  return q.rows.map((label) => {
    const values = rows
      .map((r) => (r.answers[q.id] as Record<string, number>)?.[label])
      .filter(Number.isInteger);
    return {
      label,
      total: values.length,
      counts: q.options.map((_, i) => values.filter((v) => v === i).length),
    };
  });
}
export function dailyCounts(rows: Entry[]) {
  const dates = Array.from(
    new Set(rows.map((r) => r.updated.slice(0, 10))),
  ).sort();
  return dates
    .map((date) => ({
      date,
      count: rows.filter(
        (r) => r.updated.startsWith(date) && r.status === "completed",
      ).length,
    }))
    .slice(-30);
}
export function summaryTable(s: Survey, rows: Entry[]): string[][] {
  const table = [
    ["Вопрос", "Строка / вариант", "Количество", "База ответивших", "Доля, %"],
  ];
  const visibility = new Map(
    rows.map((r) => [
      r.id,
      new Set(visibleQuestions(s, r.answers).map((q) => q.id)),
    ]),
  );
  for (const q of s.questions) {
    const eligible = rows.filter((r) => visibility.get(r.id)?.has(q.id));
    if (q.type === "text") {
      table.push([
        q.title,
        "Текстовых ответов",
        String(eligible.filter((r) => answered(q, r)).length),
        String(eligible.length),
        "",
      ]);
      continue;
    }
    if (q.type === "matrix") {
      for (const m of matrixStats(q, eligible))
        m.counts.forEach((n, i) =>
          table.push([
            q.title,
            m.label + " — " + q.options[i],
            String(n),
            String(m.total),
            String(m.total ? Math.round((n / m.total) * 1000) / 10 : 0),
          ]),
        );
    } else {
      const { base, counts } = questionStats(q, eligible);
      counts.forEach((c) =>
        table.push([
          q.title,
          c.label,
          String(c.count),
          String(base.length),
          String(Math.round(c.percent * 10) / 10),
        ]),
      );
    }
  }
  return table;
}
