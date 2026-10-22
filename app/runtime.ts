import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { legacySurvey, convertLegacy, Survey, Entry } from "./survey-model";
let database: DatabaseSync | undefined;
export function getDatabase() {
  if (database) return database;
  const filename = resolve(process.env.DATABASE_PATH || "data/survey.sqlite");
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS responses (id TEXT PRIMARY KEY NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, status TEXT NOT NULL, name TEXT NOT NULL, answers TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS surveys (id TEXT PRIMARY KEY, definition TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id), created TEXT NOT NULL, updated TEXT NOT NULL, status TEXT NOT NULL, name TEXT NOT NULL, answers TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS entries_survey ON entries(survey_id,updated);
 CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY,mime TEXT NOT NULL,data BLOB NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY);`);
  db.exec(`CREATE TABLE IF NOT EXISTS entry_context (entry_id TEXT PRIMARY KEY REFERENCES entries(id),source TEXT NOT NULL DEFAULT 'direct',campaign TEXT NOT NULL DEFAULT '',department TEXT NOT NULL DEFAULT '',region TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS entry_events (entry_id TEXT NOT NULL REFERENCES entries(id),schema_version INTEGER NOT NULL,event TEXT NOT NULL,page_id TEXT NOT NULL DEFAULT '',occurred TEXT NOT NULL,PRIMARY KEY(entry_id,schema_version,event,page_id));
  CREATE TABLE IF NOT EXISTS team_users (id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS team_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES team_users(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS survey_templates (id TEXT PRIMARY KEY,title TEXT NOT NULL,definition TEXT NOT NULL);`);
  db.exec(
    "CREATE TABLE IF NOT EXISTS entry_successors (previous_id TEXT NOT NULL,schema_version INTEGER NOT NULL,next_id TEXT NOT NULL REFERENCES entries(id),PRIMARY KEY(previous_id,schema_version))",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS survey_versions (survey_id TEXT NOT NULL REFERENCES surveys(id), version INTEGER NOT NULL, definition TEXT NOT NULL, PRIMARY KEY(survey_id,version))",
  );
  db.exec("CREATE TABLE IF NOT EXISTS survey_preview_links (survey_id TEXT PRIMARY KEY REFERENCES surveys(id),token_hash TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL)");
  db.exec("BEGIN IMMEDIATE");
  try {
    if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 16)
      db.prepare(
        "INSERT OR IGNORE INTO settings VALUES ('visitor_secret',?)",
      ).run(randomBytes(48).toString("hex"));
    if (
      !db
        .prepare("SELECT name FROM migrations WHERE name='multi-survey-v1'")
        .get()
    ) {
      db.prepare("INSERT OR IGNORE INTO surveys VALUES (?,?)").run(
        "legacy",
        JSON.stringify(legacySurvey),
      );
      for (const r of db.prepare("SELECT * FROM responses").all() as any[])
        db.prepare(
          "INSERT OR IGNORE INTO entries (id,survey_id,created,updated,status,name,answers) VALUES (?,?,?,?,?,?,?)",
        ).run(
          r.id,
          "legacy",
          r.created,
          r.updated,
          r.status,
          r.name,
          JSON.stringify(convertLegacy(JSON.parse(r.answers))),
        );
      db.prepare("INSERT INTO migrations VALUES (?)").run("multi-survey-v1");
    }
    if (
      !(db.prepare("PRAGMA table_info(entries)").all() as any[]).some(
        (c) => c.name === "schema_version",
      )
    )
      db.exec(
        "ALTER TABLE entries ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1",
      );
    db.exec(
      "CREATE INDEX IF NOT EXISTS entries_version ON entries(survey_id,schema_version)",
    );
    for (const row of db
      .prepare("SELECT id,definition FROM surveys")
      .all() as any[]) {
      const s = JSON.parse(row.definition);
      db.prepare("INSERT OR IGNORE INTO survey_versions VALUES (?,?,?)").run(
        row.id,
        s.schemaVersion || 1,
        JSON.stringify({ ...s, schemaVersion: s.schemaVersion || 1 }),
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    db.close();
    throw e;
  }
  database = db;
  return db;
}
export function getSurvey(id: string): Survey | null {
  const row = getDatabase()
    .prepare("SELECT definition FROM surveys WHERE id=?")
    .get(id) as { definition: string } | undefined;
  return row ? { schemaVersion: 1, ...JSON.parse(row.definition) } : null;
}
export function getSurveyVersion(id: string, version: number): Survey | null {
  const row = getDatabase()
    .prepare(
      "SELECT definition FROM survey_versions WHERE survey_id=? AND version=?",
    )
    .get(id, version) as { definition: string } | undefined;
  return row ? { schemaVersion: version, ...JSON.parse(row.definition) } : null;
}
export function getSurveyVersions(id: string) {
  return (
    getDatabase()
      .prepare(
        "SELECT version, definition, (SELECT COUNT(*) FROM entries WHERE survey_id=v.survey_id AND schema_version=v.version) AS total, (SELECT COUNT(*) FROM entries WHERE survey_id=v.survey_id AND schema_version=v.version AND status='completed') AS completed FROM survey_versions v WHERE survey_id=? ORDER BY version DESC",
      )
      .all(id) as any[]
  ).map((r) => ({
    schemaVersion: r.version,
    updated: JSON.parse(r.definition).updated,
    total: r.total,
    completed: r.completed,
  }));
}
export function getEntries(id: string, version?: number): Entry[] {
  return (
    getDatabase()
      .prepare(
        "SELECT e.*,c.source,c.campaign,c.department,c.region FROM entries e LEFT JOIN entry_context c ON c.entry_id=e.id WHERE e.survey_id=?" +
          (version === undefined ? "" : " AND schema_version=?") +
          " ORDER BY updated DESC",
      )
      .all(...(version === undefined ? [id] : [id, version])) as any[]
  ).map((r) => ({ ...r, answers: JSON.parse(r.answers) }));
}
export const env = {
  get ADMIN_PASSWORD() {
    return process.env.ADMIN_PASSWORD;
  },
  DB: {
    prepare(sql: string) {
      let values: any[] = [];
      return {
        bind(...parameters: any[]) {
          values = parameters;
          return this;
        },
        async first() {
          return (
            getDatabase()
              .prepare(sql)
              .get(...values) || null
          );
        },
        async all() {
          return {
            results: getDatabase()
              .prepare(sql)
              .all(...values),
          };
        },
        async run() {
          return getDatabase()
            .prepare(sql)
            .run(...values);
        },
      };
    },
  },
};
