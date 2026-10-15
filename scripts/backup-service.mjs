import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
export function backupDirectory() {
  return join(
    dirname(resolve(process.env.DATABASE_PATH || "/data/survey.sqlite")),
    "backups",
  );
}
export function backupSettings(db) {
  const row = db
    .prepare("SELECT value FROM settings WHERE key='backup_schedule'")
    .get();
  let value = {};
  try {
    value = JSON.parse(row?.value || "{}");
  } catch {}
  return {
    enabled: value.enabled !== false,
    everyHours:
      Number.isInteger(value.everyHours) &&
      value.everyHours >= 1 &&
      value.everyHours <= 168
        ? value.everyHours
        : 24,
    retentionDays:
      Number.isInteger(value.retentionDays) &&
      value.retentionDays >= 1 &&
      value.retentionDays <= 90
        ? value.retentionDays
        : 7,
  };
}
export function backupFiles() {
  mkdirSync(backupDirectory(), { recursive: true });
  return readdirSync(backupDirectory())
    .filter((name) => /^auto-[0-9TZ-]+-[0-9a-f-]{36}\.sqlite$/.test(name))
    .map((name) => ({
      name,
      size: statSync(join(backupDirectory(), name)).size,
      created: statSync(join(backupDirectory(), name)).mtime.toISOString(),
    }))
    .sort((a, b) => b.created.localeCompare(a.created));
}
export async function runBackup(force = false) {
  const source = resolve(process.env.DATABASE_PATH || "/data/survey.sqlite");
  const db = new DatabaseSync(source);
  const put = (key, value) =>
    db
      .prepare(
        "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  try {
    const settings = backupSettings(db);
    const last = db
      .prepare("SELECT value FROM settings WHERE key='backup_last_success'")
      .get();
    const lastTime = last ? Date.parse(JSON.parse(last.value).created) : 0;
    if (
      !force &&
      (!settings.enabled ||
        Date.now() - lastTime < settings.everyHours * 3600_000)
    )
      return null;
    const lock = db
      .prepare(
        "INSERT INTO settings VALUES ('backup_lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<? RETURNING value",
      )
      .get(String(Date.now()), Date.now() - 30 * 60_000);
    if (!lock) return null;
    try {
      mkdirSync(backupDirectory(), { recursive: true });
      const name =
        "auto-" +
        new Date().toISOString().replace(/[:.]/g, "-") +
        "-" +
        crypto.randomUUID() +
        ".sqlite";
      await backup(db, join(backupDirectory(), name));
      const result = { name, created: new Date().toISOString() };
      put("backup_last_success", result);
      put("backup_last_error", "");
      const files = backupFiles();
      for (const file of files.slice(1))
        if (
          Date.parse(file.created) <
          Date.now() - settings.retentionDays * 86400_000
        )
          unlinkSync(join(backupDirectory(), file.name));
      return result;
    } finally {
      db.prepare("DELETE FROM settings WHERE key='backup_lock'").run();
    }
  } catch (error) {
    put("backup_last_error", String(error.message));
    throw error;
  } finally {
    db.close();
  }
}
