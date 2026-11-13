// Runs once when the server starts: check configuration and stop with a clear message if it is unsafe.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnv } = await import("@/lib/env");
  const { errors, warnings } = checkEnv(process.env);
  for (const w of warnings) console.warn(JSON.stringify({ time: new Date().toISOString(), level: "warn", msg: w }));
  if (errors.length) {
    console.error(["", "Progression CRM cannot start. Fix these settings (in .env or docker-compose):", ...errors.map((e) => `  - ${e}`), ""].join("\n"));
    process.exit(1);
  }
  console.log(JSON.stringify({ time: new Date().toISOString(), level: "info", msg: "Progression CRM started", version: process.env.APP_VERSION ?? "dev", commit: process.env.GIT_SHA ?? "" }));

  // Reminders, escalations and health scores run every 15 minutes even when nobody has the CRM open (overnight,
  // weekends). ensureRulesFresh claims the run atomically, so several app processes never double-send.
  if (process.env.DISABLE_SCHEDULER !== "true") {
    const tick = async () => {
      try {
        const [{ db }, { ensureRulesFresh }] = await Promise.all([import("@/lib/db"), import("@/lib/opportunity-service")]);
        await ensureRulesFresh(db);
      } catch (e) {
        console.error(JSON.stringify({ time: new Date().toISOString(), level: "error", msg: "scheduled rules run failed", error: e instanceof Error ? e.message : String(e) }));
      }
    };
    setTimeout(tick, 60_000).unref();
    setInterval(tick, 15 * 60_000).unref();
  }
}
