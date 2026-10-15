import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { getDatabase } from "./runtime";
type Credential = {
  salt: string;
  hash: string;
  bootstrap: string;
  bootstrapKind?: "scrypt";
  generation: string;
};
let cachedEnvironment: string | undefined,
  cachedSalt = "",
  cachedFingerprint = "";
function fingerprint() {
  const db = getDatabase();
  db.prepare("INSERT OR IGNORE INTO settings VALUES ('bootstrap_salt',?)").run(
    randomBytes(16).toString("hex"),
  );
  const salt = (
    db
      .prepare("SELECT value FROM settings WHERE key='bootstrap_salt'")
      .get() as { value: string }
  ).value;
  const configured = process.env.ADMIN_PASSWORD || "";
  if (cachedEnvironment !== configured || cachedSalt !== salt) {
    cachedFingerprint = scryptSync(configured, salt, 32).toString("hex");
    cachedEnvironment = configured;
    cachedSalt = salt;
  }
  return cachedFingerprint;
}
function make(password: string): Credential {
  const salt = randomBytes(16).toString("hex");
  return {
    salt,
    hash: scryptSync(password, salt, 64).toString("hex"),
    bootstrap: fingerprint(),
    bootstrapKind: "scrypt",
    generation: randomBytes(32).toString("hex"),
  };
}
export function credentials(): Credential {
  const db = getDatabase();
  const read = () => {
    const row = db
      .prepare("SELECT value FROM settings WHERE key='admin_credential'")
      .get() as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as Credential) : null;
  };
  const existing = read();
  if (
    existing &&
    !existing.bootstrapKind &&
    existing.bootstrap ===
      createHash("sha256")
        .update(process.env.ADMIN_PASSWORD || "")
        .digest("hex")
  ) {
    const upgraded = {
      ...existing,
      bootstrap: fingerprint(),
      bootstrapKind: "scrypt" as const,
    };
    const result = db
      .prepare(
        "UPDATE settings SET value=? WHERE key='admin_credential' AND value=?",
      )
      .run(JSON.stringify(upgraded), JSON.stringify(existing));
    return result.changes ? upgraded : credentials();
  }
  if (existing?.bootstrap === fingerprint()) return existing;
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || secret.length < 16)
    throw Error("Configure ADMIN_PASSWORD with at least 16 characters");
  const record = make(secret);
  db.exec("BEGIN IMMEDIATE");
  try {
    const latest = read();
    if (latest?.bootstrap === fingerprint()) {
      db.exec("COMMIT");
      return latest;
    }
    db.prepare(
      "INSERT INTO settings VALUES ('admin_credential',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(JSON.stringify(record));
    db.prepare("DELETE FROM admin_sessions").run();
    db.exec("COMMIT");
    return record;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function checkPassword(value: unknown) {
  if (typeof value !== "string" || value.length > 256) return false;
  const record = credentials();
  return timingSafeEqual(
    Buffer.from(record.hash, "hex"),
    scryptSync(value, record.salt, 64),
  );
}
export function changePassword(current: unknown, next: string) {
  credentials();
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!checkPassword(current)) {
      db.exec("ROLLBACK");
      return false;
    }
    db.prepare("UPDATE settings SET value=? WHERE key='admin_credential'").run(
      JSON.stringify(make(next)),
    );
    db.prepare("DELETE FROM admin_sessions").run();
    db.exec("COMMIT");
    return true;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function visitorSecret() {
  const db = getDatabase();
  let row = db
    .prepare("SELECT value FROM settings WHERE key='visitor_secret'")
    .get() as { value: string } | undefined;
  if (!row) {
    const secret = process.env.ADMIN_PASSWORD;
    if (!secret || secret.length < 16)
      throw Error("Visitor secret unavailable");
    db.prepare(
      "INSERT OR IGNORE INTO settings VALUES ('visitor_secret',?)",
    ).run(randomBytes(48).toString("hex"));
    row = db
      .prepare("SELECT value FROM settings WHERE key='visitor_secret'")
      .get() as { value: string };
  }
  if (row.value.length < 16) throw Error("Visitor secret unavailable");
  return row.value;
}
