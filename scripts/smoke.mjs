import { runHttpChecks } from "./http-check.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw Error("Run smoke checks on Node.js 24");
const listener = createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const directory = mkdtempSync(join(tmpdir(), "sanext-http-")),
  origin = `http://127.0.0.1:${port}`,
  password = "smoke-only-" + crypto.randomUUID();
cpSync("public", ".next/standalone/public", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
const child = spawn(process.execPath, [resolve(".next/standalone/server.js")], {
  env: {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    PUBLIC_ORIGIN: origin,
    ADMIN_PASSWORD: password,
    DATABASE_PATH: join(directory, "smoke.sqlite"),
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
child.stdout.on("data", (data) => (output += data));
child.stderr.on("data", (data) => (output += data));
try {
  let started = false;
  for (let i = 0; i < 600; i++) {
    try {
      const r = await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        started = true;
        break;
      }
    } catch {}
    if (child.exitCode !== null) throw Error(output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(started, "Server did not become healthy: " + output);
  await runHttpChecks({ origin, password });
} finally {
  child.kill();
  if (child.exitCode === null)
    await new Promise((resolve) => child.once("exit", resolve));
  assert.ok(directory.startsWith(join(tmpdir(), "sanext-http-")));
  rmSync(directory, { recursive: true, force: true });
}
