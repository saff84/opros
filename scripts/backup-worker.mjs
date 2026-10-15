import { runBackup } from "./backup-service.mjs";
async function tick() {
  try {
    const result = await runBackup();
    if (result) console.log("Backup created: " + result.name);
  } catch (error) {
    console.error("Backup failed: " + error.message);
  }
}
await tick();
if (!process.argv.includes("--once")) setInterval(tick, 60_000);
