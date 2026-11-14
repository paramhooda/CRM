import { beforeAll, describe, expect, it } from "vitest";
import { Client, as, expectError, expectOk, isoDate, uniq } from "./helpers";

type Home = { kpis: { openPipeline: { value: number; count: number }; wonFytd: { target: number }; winRate: { pct: number | null } }; charts: { byStage: { key: string; value: number; count: number }[]; byBusinessUnit: { label: string; value: number }[]; byOwner: unknown[] }; todo: { pastClose: unknown[]; approvals: number } };
type Review = { people: { user: { id: string }; summary: { doneWell: string[]; lagging: string[] }; deals: number }[]; deals: { id: string; flags: string[]; changes: { changes: Record<string, { from: string | null; to: string | null }> } }[] };

let rep: Client, head: Client;
let laptopId: string;

beforeAll(async () => {
  [rep, head] = await Promise.all([as("rep"), as("salesHead")]);
  laptopId = expectOk(await rep.get<{ rows: { id: string }[] }>("/products?q=Lenovo%20Business%20laptop,%20Core%20i5")).rows[0]!.id;
});

describe("home metrics", () => {
  it("a rep's numbers add up to their open deals; charts split by stage and BU; support roles are refused", async () => {
    const list = expectOk(await rep.get<{ rows: { stage: string; dealValue: string }[]; total: number }>("/deals?open=true&pageSize=200"));
    const home = expectOk(await rep.get<Home>("/metrics/home"));
    const pipelineRows = list.rows.filter((r) => r.stage !== "HOLD");
    expect(home.kpis.openPipeline.count).toBe(pipelineRows.length);
    expect(home.kpis.openPipeline.value).toBe(Math.round(pipelineRows.reduce((a, r) => a + Number(r.dealValue), 0)));
    expect(home.charts.byStage.map((s) => s.key)).toEqual(["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION", "HOLD"]);
    expect(home.charts.byStage.reduce((a, s) => a + s.count, 0)).toBe(list.total);
    expect(home.charts.byOwner).toEqual([]); // a rep sees no split by person
    expect(home.kpis.wonFytd.target).toBeGreaterThan(0);
    expectError(await (await as("presales")).get("/metrics/home"), 403);
    const heads = expectOk(await head.get<Home>("/metrics/home"));
    expect(heads.charts.byOwner.length).toBeGreaterThan(1);
    expect(heads.kpis.openPipeline.count).toBeGreaterThanOrEqual(home.kpis.openPipeline.count);
    // filters narrow the same way as the list
    const byBu = expectOk(await rep.get<Home>(`/metrics/home?bu=${expectOk(await rep.get<{ businessUnits: { id: string; name: string }[] }>("/lookups")).businessUnits.find((b) => b.name === "Cloud")!.id}`));
    expect(byBu.kpis.openPipeline.count).toBeLessThanOrEqual(home.kpis.openPipeline.count);
  });

  it("my work lists a buyer's requests, overdue first", async () => {
    const purchase = await as("purchase");
    const w = expectOk(await purchase.get<{ kind: string; open: { overdue: boolean; deal: { code: string } }[]; counts: { open: number } }>("/metrics/my-work"));
    expect(w.kind).toBe("pricing");
    expect(w.counts.open).toBe(w.open.length);
    const firstNotOverdue = w.open.findIndex((r) => !r.overdue);
    const lastOverdue = w.open.map((r) => r.overdue).lastIndexOf(true);
    if (firstNotOverdue >= 0 && lastOverdue >= 0) expect(lastOverdue).toBeLessThan(firstNotOverdue);
    expectError(await rep.get("/metrics/my-work"), 403);
  });
});

describe("pipeline review", () => {
  it("shows a rep's deals with changes since the window and flags; the head reviews the team; marking a review moves the baseline", async () => {
    const accountId = expectOk(await rep.post<{ id: string }>("/accounts", { name: uniq("Review Co") })).id;
    const d = expectOk(await rep.post<{ id: string; version: number }>("/deals", { name: uniq("Reviewed deal"), accountId, expectedCloseDate: isoDate(-3), forecastCategory: "COMMIT", lines: [{ productId: laptopId, quantity: 3, unitSalesPrice: "70000" }] }));
    expectOk(await rep.patch(`/deals/${d.id}`, { version: d.version, expectedCloseDate: isoDate(20) }));
    const me = expectOk(await rep.get<{ id: string }>("/auth/me")).id;
    const r = expectOk(await rep.get<Review>("/reviews/pipeline?scope=rep&since=7d"));
    expect(r.people.map((p) => p.user.id)).toEqual([me]);
    const row = r.deals.find((x) => x.id === d.id)!;
    expect(row.changes.changes.expectedCloseDate).toEqual({ from: isoDate(-3), to: isoDate(20) });
    expect(row.flags).toContain("SLIPPED");
    expect(row.flags).toContain("COMMIT_WITHOUT_PROPOSAL");
    expect(r.people[0]!.summary.lagging.join(" ")).toMatch(/Pushed the close date/);
    // a rep can't look at someone else; the head can review the whole team and one person
    const other = expectOk(await rep.get<{ rows: { id: string; email: string }[] }>("/users")).rows.find((u) => u.email === "naresh.kumar@progression.com")!.id;
    expectError(await rep.get(`/reviews/pipeline?scope=rep&scope_user_id=${other}`), 404);
    const team = expectOk(await head.get<Review>("/reviews/pipeline?scope=team&since=30d"));
    expect(team.people.length).toBeGreaterThan(5);
    const one = expectOk(await head.get<Review>(`/reviews/pipeline?scope=rep&scope_user_id=${me}&since=7d`));
    expect(one.deals.some((x) => x.id === d.id)).toBe(true);
    expectError(await (await as("regionalHead")).get(`/reviews/pipeline?scope=rep&scope_user_id=${me}`), 404);
    // mark reviewed: "since last" now starts from this moment, so the change disappears
    expectOk(await head.post("/reviews", { scope: "rep", scopeUserId: me, sinceDate: "7d", notes: "Push the proposal out this week" }));
    const after = expectOk(await head.get<Review>(`/reviews/pipeline?scope=rep&scope_user_id=${me}&since=last`));
    expect(Object.keys(after.deals.find((x) => x.id === d.id)!.changes.changes)).toEqual([]);
    const history = expectOk(await head.get<{ rows: { notes: string | null; subjects: string[] }[] }>("/reviews"));
    expect(history.rows[0]).toMatchObject({ notes: "Push the proposal out this week", subjects: ["Rakesh Pawar"] });
    expectError(await (await as("purchase")).get("/reviews/pipeline"), 403);
  });
});

describe("exports", () => {
  it("deals, lines, leads and audit export with the viewer's columns and the same rows as the list", async () => {
    const list = expectOk(await rep.get<{ total: number }>("/deals?open=true&pageSize=1"));
    const r = await rep.get("/exports/deals?open=true");
    expect(r.status).toBe(200);
    expect(r.raw.split("\r\n")[0]).toMatch(/^Code,Deal,Account,Owner,Stage,Days in stage,Forecast,Deal value/);
    expect(r.raw.trim().split("\r\n").length - 1).toBe(list.total);
    const p = await (await as("presales")).get("/exports/deals");
    expect(p.raw.split("\r\n")[0]).not.toMatch(/Deal value/);
    const lines = await rep.get("/exports/deal-lines?open=true");
    expect(lines.raw.split("\r\n")[0]).toMatch(/Unit sales price/);
    expect((await rep.get("/exports/leads")).raw.split("\r\n")[0]).toMatch(/^Code,Company,Contact/);
    expectError(await rep.get("/exports/audit"), 403);
    expect((await (await as("admin")).get("/exports/audit?entity_type=deal")).raw.split("\r\n")[0]).toMatch(/^When,Who,Record/);
  });
});
