import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { runHttpChecks } from "./http-check.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12),
  project = "sanext-docker-check-" + suffix,
  image = "sanext-survey:check-" + suffix;
assert.match(project, /^sanext-docker-check-[0-9a-f]{12}$/);
const directory = mkdtempSync(join(tmpdir(), "sanext-docker-check-"));
const listener = createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = "http://127.0.0.1:" + port,
  password = "docker-test-only-" + crypto.randomUUID();
const environment = {
  ...process.env,
  ADMIN_PASSWORD: password,
  PUBLIC_ORIGIN: origin,
  BIND_ADDRESS: "127.0.0.1",
  APP_PORT: String(port),
  DOMAIN: "survey.example.test",
};
const override = join(directory, "compose.override.json");
writeFileSync(
  override,
  JSON.stringify({ services: { app: { image }, backup: { image } } }),
);
const base = [
  "compose",
  "--env-file",
  join(root, ".env.example"),
  "-p",
  project,
  "-f",
  join(root, "docker-compose.yml"),
];
const compose = [...base, "-f", override];
function docker(args, { capture = false, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: root,
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    child.stdout.on("data", (data) => {
      out += data;
      if (!capture) process.stdout.write(data);
    });
    child.stderr.on("data", (data) => {
      err += data;
      if (!capture) process.stderr.write(data);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 || allowFailure
        ? resolve({ out, err, code })
        : reject(
            Error(
              "Docker command failed: " +
                args.slice(0, 3).join(" ") +
                "\n" +
                err.slice(-4000),
            ),
          ),
    );
  });
}
async function request(path, body, cookie = "") {
  return fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
}
async function up() {
  await docker([
    ...compose,
    "up",
    "--detach",
    "--no-build",
    "--wait",
    "--wait-timeout",
    "120",
    "app",
    "backup",
  ]);
}
async function verifyPersistence(fixture) {
  const login = await request("/api/login", { password: fixture.password });
  assert.equal(
    login.status,
    200,
    "Changed password must survive restart/restore",
  );
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await request("/api/login", { password })).status, 401);
  const result = await request(
    "/api/results?survey=" + fixture.surveyId,
    undefined,
    cookie,
  );
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.rows.length, 1);
  assert.deepEqual(data.rows[0].answers, { gate: "No" });
  assert.equal(data.survey.welcome.heading, "Docker welcome");
  assert.equal(data.survey.questions[1].startNewPage, false);
  assert.equal(data.survey.welcome.images[0].src, fixture.imagePath);
  assert.equal(
    (await request(fixture.imagePath, undefined, cookie)).status,
    200,
  );
  return { cookie, data };
}
let imageBuilt = false;
try {
  await docker(["version", "--format", "{{.Server.Version}}"]);
  await docker([...compose, "config", "--quiet"]);
  await docker([
    ...base,
    "-f",
    join(root, "docker-compose.https.yml"),
    "-f",
    override,
    "config",
    "--quiet",
  ]);
  await docker(["build", "--progress=plain", "--tag", image, root]);
  imageBuilt = true;
  await up();
  await docker([
    ...compose,
    "exec",
    "-T",
    "app",
    "node",
    "-e",
    `const assert=require('node:assert/strict'),fs=require('node:fs');assert.equal(process.versions.node.split('.')[0],'24');assert.notEqual(process.getuid(),0);for(const p of ['server.js','.next/static','public/sanext_logo.svg','scripts/backup.mjs','scripts/restore.mjs','scripts/import-responses.mjs','scripts/branching.mjs','scripts/image-format.mjs','scripts/welcome.mjs'])assert.ok(fs.existsSync('/app/'+p),p);for(const p of ['.env','tests','scripts/docker-smoke.mjs','scripts/smoke.mjs'])assert.equal(fs.existsSync('/app/'+p),false,p);const {DatabaseSync}=require('node:sqlite');new DatabaseSync(':memory:').close();console.log('Runtime OK: Node '+process.version+', uid='+process.getuid()+', static assets and production helpers present')`,
  ]);
  const fixture = await runHttpChecks({ origin, password });
  await docker([...compose, "restart", "app"]);
  await up();
  const { cookie, data } = await verifyPersistence(fixture);
  const importedId = crypto.randomUUID();
  const bundledImage = await (
    await request(fixture.imagePath + "?format=json", undefined, cookie)
  ).json();
  const file = join(directory, "import.json");
  writeFileSync(
    file,
    JSON.stringify({
      version: 2,
      survey: {
        ...data.survey,
        id: importedId,
        title: "Imported Docker fixture",
      },
      rows: data.rows.map((row) => ({
        ...row,
        id: crypto.randomUUID(),
        survey_id: importedId,
      })),
      images: [bundledImage],
    }),
  );
  await docker([...compose, "cp", file, "app:/data/import.json"]);
  await docker([
    ...compose,
    "exec",
    "-T",
    "app",
    "node",
    "scripts/import-responses.mjs",
    "/data/import.json",
  ]);
  assert.equal(
    (
      await (
        await request("/api/results?survey=" + importedId, undefined, cookie)
      ).json()
    ).rows.length,
    1,
  );
  await docker([
    ...compose,
    "exec",
    "-T",
    "app",
    "node",
    "scripts/backup.mjs",
    "/data/check-backup.sqlite",
  ]);
  await docker([...compose, "stop", "app", "backup"]);
  await docker([
    ...compose,
    "run",
    "--rm",
    "--no-deps",
    "app",
    "node",
    "scripts/restore.mjs",
    "/data/check-backup.sqlite",
  ]);
  await up();
  const restored = await verifyPersistence(fixture);
  assert.equal(
    (
      await (
        await request(
          "/api/results?survey=" + importedId,
          undefined,
          restored.cookie,
        )
      ).json()
    ).rows.length,
    1,
  );
  const latest = (
    await (
      await request(
        "/api/surveys?id=" + fixture.surveyId,
        undefined,
        restored.cookie,
      )
    ).json()
  ).survey;
  const activated = await request(
    "/api/surveys",
    { survey: { ...latest, status: "active" } },
    restored.cookie,
  );
  assert.equal(activated.status, 200);
  const visitor = await request("/api/session", {
    surveyId: fixture.surveyId,
    action: "start",
    sessionToken: fixture.visitorToken,
  });
  assert.equal(visitor.status, 200);
  const continued = await visitor.json();
  assert.equal(continued.id, fixture.visitorId);
  assert.equal(continued.status, "completed");
  console.log(
    "Docker validation PASSED: Compose configs, Linux image, non-root runtime, HTTP scenarios, restart persistence, image/branch JSON import, SQLite backup/restore and visitor signatures.",
  );
} finally {
  const cleaned = await docker(
    [...compose, "down", "--volumes", "--remove-orphans"],
    { capture: true, allowFailure: true },
  );
  if (cleaned.code !== 0)
    console.error(
      "Cleanup failed for isolated project " + project + ": " + cleaned.err,
    );
  if (imageBuilt)
    await docker(["image", "rm", image], { capture: true, allowFailure: true });
  const resolved = resolve(directory);
  assert.ok(
    resolved.startsWith(resolve(tmpdir()) + sep + "sanext-docker-check-"),
  );
  rmSync(resolved, { recursive: true, force: true });
}
