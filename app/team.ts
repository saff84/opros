import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDatabase } from "./runtime";
import { tokenHash } from "./security";
export function passwordRecord(password: string) {
  const salt = randomBytes(24).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}
export function checkTeamPassword(
  user: { salt: string; password_hash: string },
  password: unknown,
) {
  if (typeof password !== "string" || password.length > 256) return false;
  return timingSafeEqual(
    Buffer.from(user.password_hash, "hex"),
    scryptSync(password, user.salt, 64),
  );
}
export function loginTeam(username: string, password: unknown) {
  const user = getDatabase()
    .prepare("SELECT * FROM team_users WHERE username=? AND active=1")
    .get(username.toLowerCase()) as any;
  if (!user || !checkTeamPassword(user, password)) return null;
  const token = randomBytes(32).toString("hex");
  getDatabase()
    .prepare("DELETE FROM team_sessions WHERE expires<?")
    .run(Date.now());
  getDatabase()
    .prepare("INSERT INTO team_sessions VALUES (?,?,?)")
    .run(tokenHash(token), user.id, Date.now() + 8 * 3600_000);
  return token;
}
