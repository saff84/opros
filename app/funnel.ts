import type { Survey, Entry } from "./survey-model";
import { groupQuestionPages } from "./survey-pages";
export type SurveyEvent = {
  entry_id: string;
  schema_version: number;
  event: string;
  page_id: string;
  occurred: string;
};
export function funnel(
  s: Survey,
  rows: Entry[],
  events: SurveyEvent[],
  now = Date.now(),
) {
  const ids = new Set(rows.map((r) => r.id));
  const relevant = events.filter((e) => ids.has(e.entry_id));
  const started = new Set(relevant.map((e) => e.entry_id));
  for (const row of rows) if (row.status !== "visited") started.add(row.id);
  const last = new Map<string, SurveyEvent>();
  for (const event of relevant.filter((e) => e.event === "page")) {
    const before = last.get(event.entry_id);
    if (!before || event.occurred >= before.occurred)
      last.set(event.entry_id, event);
  }
  const pages = groupQuestionPages(s.questions).map((page, index) => ({
    id: page.id,
    title: `${index + 1}. ${page.questions.map((q) => q.title).join(" / ")}`,
    visited: new Set(
      relevant
        .filter((e) => e.page_id === page.id && e.event === "page")
        .map((e) => e.entry_id),
    ).size,
    inactive: rows.filter(
      (r) =>
        r.status !== "completed" &&
        last.get(r.id)?.page_id === page.id &&
        now - Date.parse(last.get(r.id)!.occurred) > 86400_000,
    ).length,
  }));
  return {
    opened: rows.length,
    started: started.size,
    completed: rows.filter((r) => r.status === "completed").length,
    pages,
    tracked: new Set(relevant.map((e) => e.entry_id)).size,
  };
}
export function sourceSummary(rows: Entry[]) {
  const groups = new Map<
    string,
    { source: string; campaign: string; opened: number; completed: number }
  >();
  for (const row of rows) {
    const source = row.source || "direct",
      campaign = row.campaign || "",
      key = JSON.stringify([source, campaign]);
    const group = groups.get(key) || {
      source,
      campaign,
      opened: 0,
      completed: 0,
    };
    group.opened++;
    if (row.status === "completed") group.completed++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.opened - a.opened);
}
