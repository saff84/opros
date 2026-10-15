import {
  visibleQuestions,
  sanitizeAnswers,
  branchingError,
} from "./branching.mjs";
import { detectImage, MAX_IMAGE_BYTES } from "./image-format.mjs";
import { validWelcome, surveyImageSources } from "./welcome.mjs";
import { validStartForm } from "./start-form.mjs";
import {
  singleTypes,
  questionTypes,
  validSchedule,
  validFeatureQuestion,
  knownAnswerKey,
  featureAnswerError,
} from "./survey-features.mjs";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
if (!process.argv[2])
  throw Error("Usage: node scripts/import-responses.mjs /data/import.json");
const input = JSON.parse(readFileSync(process.argv[2], "utf8")),
  modern = !Array.isArray(input);
const rows = modern ? input.rows : input;
if (!Array.isArray(rows) || (modern && (input.version !== 2 || !input.survey)))
  throw Error("Expected a legacy array or version 2 survey export");
const db = new DatabaseSync(process.env.DATABASE_PATH || "/data/survey.sqlite");
db.exec("PRAGMA busy_timeout=5000");
if (!db.prepare("SELECT name FROM sqlite_master WHERE name='entries'").get()) {
  db.close();
  throw Error("Start the upgraded application once before importing");
}
const survey = modern
  ? input.survey
  : JSON.parse(
      db.prepare("SELECT definition FROM surveys WHERE id='legacy'").get()
        .definition,
    );
const text = (x, max) => typeof x === "string" && x.length <= max;
if (
  !survey ||
  !text(survey.id, 80) ||
  !/^[a-zA-Z0-9_-]+$/.test(survey.id) ||
  !text(survey.title, 160) ||
  !survey.title.trim() ||
  ![survey.description, survey.intro, survey.thanks].every((x) =>
    text(x, 4000),
  ) ||
  !["draft", "active", "archived"].includes(survey.status) ||
  ![survey.accent, survey.background].every((x) => /^#[0-9a-f]{6}$/i.test(x)) ||
  !Array.isArray(survey.questions) ||
  !survey.questions.length ||
  survey.questions.length > 60 ||
  !Number.isInteger(survey.revision) ||
  survey.revision < 1
)
  throw Error("Invalid survey definition");
if (branchingError(survey)) throw Error(branchingError(survey));
if (!validWelcome(survey.welcome)) throw Error("Invalid welcome block");
if (!validStartForm(survey.startForm)) throw Error("Invalid start form");
if (!validSchedule(survey)) throw Error("Invalid survey schedule");
const version = survey.schemaVersion || 1;
if (!Number.isInteger(version) || version < 1)
  throw Error("Invalid schema version");
const ids = new Set();
for (const q of survey.questions) {
  if (
    !q ||
    !text(q.id, 80) ||
    !/^[a-zA-Z0-9_-]+$/.test(q.id) ||
    ids.has(q.id) ||
    !text(q.title, 300) ||
    !q.title.trim() ||
    !text(q.description, 2000) ||
    !questionTypes.includes(q.type) ||
    typeof q.required !== "boolean" ||
    !Number.isInteger(q.maxChoices) ||
    q.maxChoices < 1 ||
    q.maxChoices > 100
  )
    throw Error("Invalid question");
  if (
    q.image &&
    (typeof q.image.src !== "string" ||
      !/^\/api\/images\/[0-9a-f-]{36}$/.test(q.image.src) ||
      typeof q.image.alt !== "string" ||
      q.image.alt.length > 300)
  )
    throw Error("Invalid image reference");
  ids.add(q.id);
  if (q.startNewPage !== undefined && typeof q.startNewPage !== "boolean")
    throw Error("Invalid question page setting");
  if (
    q.type === "multiple" &&
    q.minChoices !== undefined &&
    (!Number.isInteger(q.minChoices) ||
      q.minChoices < 0 ||
      q.minChoices > q.maxChoices)
  )
    throw Error("Invalid minimum choices");
  for (const list of [q.options, q.rows, q.exclusive])
    if (
      !Array.isArray(list) ||
      list.length > 100 ||
      new Set(list).size !== list.length ||
      list.some((x) => !text(x, 300) || !x.trim())
    )
      throw Error("Invalid question options");
  if (
    (q.type !== "text" && q.options.length < 2) ||
    (q.type === "matrix" && !q.rows.length) ||
    q.exclusive.some((x) => !q.options.includes(x))
  )
    throw Error("Invalid question configuration");
  if (!validFeatureQuestion(q))
    throw Error("Invalid extended question configuration");
  if (
    q.type === "multiple" &&
    (q.minChoices || 0) >
      q.options.filter((x) => !q.exclusive.includes(x)).length
  )
    throw Error("Minimum choices exceeds available options");
}
const convert = (a) => ({
  usage: a.usage,
  benefit: a.benefit,
  barriers: a.barriers,
  barrierOther: a.barrierOther,
  improve: a.improve,
  needs: a.needs,
  needOther: a.needOther,
  idea0: a.ideas?.[0] || "",
  idea1: a.ideas?.[1] || "",
  idea2: a.ideas?.[2] || "",
});
const entries = rows.map((r) => {
  if (
    !r ||
    !text(r.id, 36) ||
    !/^[0-9a-f-]{36}$/.test(r.id) ||
    !["visited", "draft", "completed"].includes(r.status) ||
    !text(r.name, 120) ||
    !Number.isFinite(Date.parse(r.created)) ||
    !Number.isFinite(Date.parse(r.updated)) ||
    !r.answers ||
    typeof r.answers !== "object" ||
    Array.isArray(r.answers) ||
    (modern &&
      (r.survey_id !== survey.id ||
        (r.schema_version !== undefined && r.schema_version !== version)))
  )
    throw Error("Invalid response record");
  const answers = modern ? r.answers : convert(r.answers);
  for (const key of ["source", "campaign", "department", "region"])
    if (
      r[key] !== undefined &&
      r[key] !== null &&
      (typeof r[key] !== "string" || r[key].length > 160)
    )
      throw Error("Invalid response context");
  if (Object.keys(answers).some((k) => !knownAnswerKey(survey, k)))
    throw Error("Unknown question in response");
  for (const q of visibleQuestions(survey, answers)) {
    const featureError = featureAnswerError(
      q,
      answers,
      r.status === "completed",
    );
    if (featureError) throw Error(featureError);
    const v = answers[q.id];
    if (
      r.status === "completed" &&
      q.required &&
      (v === undefined ||
        (typeof v === "string" && !v.trim()) ||
        (Array.isArray(v) && !v.length) ||
        (q.type === "matrix" &&
          (!v || Object.keys(v).length !== q.rows.length)))
    )
      throw Error("Completed response is missing required answers");
    if (v === undefined) continue;
    if (
      q.type === "multiple" &&
      r.status === "completed" &&
      Array.isArray(v) &&
      v.length &&
      !v.some((x) => q.exclusive.includes(x)) &&
      v.length < (q.minChoices || 0)
    )
      throw Error("Too few selected answers");
    if (
      (q.type === "text" && !text(v, 3000)) ||
      (singleTypes.includes(q.type) &&
        (typeof v !== "string" || (v !== "" && !q.options.includes(v)))) ||
      (q.type === "multiple" &&
        (!Array.isArray(v) ||
          v.length > q.maxChoices ||
          new Set(v).size !== v.length ||
          v.some((x) => !q.options.includes(x)) ||
          (v.some((x) => q.exclusive.includes(x)) && v.length > 1))) ||
      (q.type === "matrix" &&
        (!v ||
          typeof v !== "object" ||
          Array.isArray(v) ||
          Object.entries(v).some(
            ([key, n]) =>
              !q.rows.includes(key) ||
              !Number.isInteger(n) ||
              n < 0 ||
              n >= q.options.length,
          )))
    )
      throw Error("Invalid answers");
  }
  return {
    ...r,
    created: new Date(r.created).toISOString(),
    updated: new Date(r.updated).toISOString(),
    answers: sanitizeAnswers(survey, answers),
  };
});
const imageInput = modern ? input.images || [] : [];
if (!Array.isArray(imageInput) || imageInput.length > 6064)
  throw Error("Invalid image bundle");
const images = imageInput.map((image) => {
  if (
    !image ||
    typeof image.id !== "string" ||
    !/^[0-9a-f-]{36}$/.test(image.id) ||
    typeof image.data !== "string" ||
    image.data.length > MAX_IMAGE_BYTES * 1.4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)
  )
    throw Error("Invalid bundled image");
  const bytes = Buffer.from(image.data, "base64");
  if (bytes.length > MAX_IMAGE_BYTES || detectImage(bytes) !== image.mime)
    throw Error("Invalid bundled image content");
  return { ...image, bytes };
});
let inserted = 0;
db.exec("BEGIN IMMEDIATE");
try {
  for (const image of images) {
    const existing = db
      .prepare("SELECT mime,data FROM images WHERE id=?")
      .get(image.id);
    if (
      existing &&
      (existing.mime !== image.mime ||
        !Buffer.from(existing.data).equals(image.bytes))
    )
      throw Error("Image ID collision");
    db.prepare("INSERT OR IGNORE INTO images VALUES (?,?,?,?)").run(
      image.id,
      image.mime,
      image.bytes,
      new Date().toISOString(),
    );
  }
  for (const src of surveyImageSources(survey))
    if (
      !db.prepare("SELECT id FROM images WHERE id=?").get(src.split("/").pop())
    )
      throw Error("Missing image file; export JSON with bundled images");
  const existing = db
    .prepare(
      "SELECT definition FROM survey_versions WHERE survey_id=? AND version=?",
    )
    .get(survey.id, version);
  if (
    existing &&
    JSON.stringify(JSON.parse(existing.definition).questions) !==
      JSON.stringify(survey.questions)
  )
    throw Error(
      "Existing survey has a different question structure; import cancelled",
    );
  db.prepare("INSERT OR IGNORE INTO surveys VALUES (?,?)").run(
    survey.id,
    JSON.stringify(survey),
  );
  db.prepare("INSERT OR IGNORE INTO survey_versions VALUES (?,?,?)").run(
    survey.id,
    version,
    JSON.stringify({ ...survey, schemaVersion: version }),
  );
  const insert = db.prepare(
    "INSERT OR IGNORE INTO entries (id,survey_id,created,updated,status,name,answers,schema_version) VALUES (?,?,?,?,?,?,?,?)",
  );
  for (const r of entries) {
    const changes = Number(
      insert.run(
        r.id,
        survey.id,
        r.created,
        r.updated,
        r.status,
        r.name,
        JSON.stringify(r.answers),
        version,
      ).changes,
    );
    inserted += changes;
    if (changes)
      db.prepare(
        "INSERT OR IGNORE INTO entry_context(entry_id,source,campaign,department,region) VALUES (?,?,?,?,?)",
      ).run(
        r.id,
        r.source || "direct",
        r.campaign || "",
        r.department || "",
        r.region || "",
      );
  }
  const events = modern ? input.events || [] : [];
  if (!Array.isArray(events) || events.length > entries.length * 61)
    throw Error("Invalid event bundle");
  const importedIds = new Set(entries.map((r) => r.id));
  for (const event of events) {
    if (
      !event ||
      !importedIds.has(event.entry_id) ||
      event.schema_version !== version ||
      !["begin", "page"].includes(event.event) ||
      typeof event.page_id !== "string" ||
      !Number.isFinite(Date.parse(event.occurred)) ||
      (event.event === "begin" && event.page_id !== "") ||
      (event.event === "page" &&
        !survey.questions.some((q) => q.id === event.page_id))
    )
      throw Error("Invalid event");
    const parent = db
      .prepare("SELECT survey_id,schema_version FROM entries WHERE id=?")
      .get(event.entry_id);
    if (parent?.survey_id !== survey.id || parent?.schema_version !== version)
      throw Error("Event belongs to another survey");
    db.prepare("INSERT OR IGNORE INTO entry_events VALUES (?,?,?,?,?)").run(
      event.entry_id,
      version,
      event.event,
      event.page_id,
      event.occurred,
    );
  }
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
} finally {
  db.close();
}
console.log(
  `Imported ${inserted}; skipped existing IDs ${rows.length - inserted}`,
);
