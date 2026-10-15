import { tools, ratings, barriers, needs, titles, Answers } from "./data";
export type ResponseRow = {
  id: string;
  name: string;
  created: string;
  updated: string;
  status: string;
  answers: Answers;
};
export type Frequency = { label: string; count: number; percent: number };
export function frequencies(
  rows: ResponseRow[],
  key: "benefit" | "barriers" | "needs",
  options: string[],
) {
  const answered = rows.filter((r) => r.answers[key].length);
  const items = options
    .map((label) => {
      const count = answered.filter((r) =>
        r.answers[key].includes(label),
      ).length;
      return {
        label,
        count,
        percent: answered.length ? (count / answered.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.count - a.count);
  return { answered: answered.length, items };
}
export function aggregate(rows: ResponseRow[]) {
  const usage = tools.map((tool) => {
    const answered = rows.filter((r) =>
      Number.isInteger(r.answers.usage[tool]),
    );
    const counts = ratings.map(
      (_, i) => answered.filter((r) => r.answers.usage[tool] === i).length,
    );
    const used = counts[0] + counts[1];
    return {
      tool,
      answered: answered.length,
      counts,
      used,
      percent: answered.length ? (used / answered.length) * 100 : 0,
    };
  });
  const benefit = frequencies(rows, "benefit", [
    ...tools,
    "Использовал, но заметной пользы не получил",
    "Пока сложно оценить пользу",
    "Не использовал инструменты",
  ]);
  const obstacle = frequencies(rows, "barriers", barriers);
  const support = frequencies(rows, "needs", needs);
  const texts = rows.filter((r) => r.answers.improve.trim());
  const ideas = rows.filter((r) => r.answers.ideas.some((x) => x.trim()));
  const summary = titles.map((question, i) => {
    if (i === 0) {
      const answered = rows.filter(
        (r) => Object.keys(r.answers.usage).length,
      ).length;
      const top = [...usage].sort((a, b) => b.used - a.used)[0];
      return {
        question,
        answered,
        leader: top?.used ? top.tool : "—",
        count: top?.used || 0,
        percent: top?.percent || 0,
      };
    }
    if (i === 3 || i === 5)
      return {
        question,
        answered: i === 3 ? texts.length : ideas.length,
        leader: "Открытые ответы",
        count: null,
        percent: null,
      };
    const f = i === 1 ? benefit : i === 2 ? obstacle : support;
    const top = f.items[0];
    return {
      question,
      answered: f.answered,
      leader: top?.count ? top.label : "—",
      count: top?.count || 0,
      percent: top?.percent || 0,
    };
  });
  return { usage, benefit, obstacle, support, texts, ideas, summary };
}
