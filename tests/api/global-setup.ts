export default async function setup() {
  const base = process.env.API_BASE_URL ?? "http://localhost:3000";
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${base}/api/v1/health`);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No server answering at ${base}. Start it (npm run dev / npm start) against a seeded database.`);
}
