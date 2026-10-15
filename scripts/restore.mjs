import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
const source = resolve(process.argv[2] || "");
const target = resolve(process.env.DATABASE_PATH || "/data/survey.sqlite");
if (!process.argv[2] || source === target || !existsSync(source))
  throw Error("Supply a separate existing backup file");
const check = new DatabaseSync(source, { readOnly: true });
const result = check.prepare("PRAGMA integrity_check").get();
check.prepare("SELECT id FROM responses LIMIT 1").all();
check.close();
if (result.integrity_check !== "ok") throw Error("Invalid SQLite backup");
copyFileSync(source, target);
for (const suffix of ["-wal", "-shm"])
  if (existsSync(target + suffix)) unlinkSync(target + suffix);
const restored = new DatabaseSync(target);
if (
  restored.prepare("SELECT name FROM sqlite_master WHERE name='settings'").get()
)
  restored.prepare("DELETE FROM settings WHERE key='backup_lock'").run();
restored.close();
console.log("Database restored. Start the app.");
