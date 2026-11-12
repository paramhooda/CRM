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
}
