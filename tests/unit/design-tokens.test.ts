import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The design system lives in src/app/globals.css as tokens. These tests keep it that way:
 * no raw colour anywhere else, and every tinted text/background pair readable (WCAG AA, 4.5:1).
 */
const ROOT = path.resolve(import.meta.dirname, "../../src");
const CSS = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
// The root error page renders without the stylesheet, so it mirrors the tokens inline.
const EXEMPT = new Set(["app/globals.css", "app/global-error.tsx"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const PALETTE = "(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|black|white)";
const PALETTE_CLASS = new RegExp(`(?<![\\w-])(?:[a-z]+:)*(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|accent|decoration|shadow)-${PALETTE}(-\\d{2,3})?(?:/\\d+)?(?![\\w-])`, "g");
const RAW_COLOUR = /(?<![\w-])#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/g;
// Recharts paints its default strokes as '#ccc' and '#fff'; the shadcn chart wrapper only targets them to reset them.
const ALLOWED_RAW = new Set(["[stroke='#ccc']", "[stroke='#fff']"]);

describe("design tokens", () => {
  it("no raw colours or Tailwind palette classes outside globals.css", () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = path.relative(ROOT, file).replaceAll(path.sep, "/");
      if (EXEMPT.has(rel)) continue;
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(RAW_COLOUR)) {
        const around = src.slice(Math.max(0, m.index! - 9), m.index! + m[0].length + 2);
        if ([...ALLOWED_RAW].some((a) => around.includes(a))) continue;
        offenders.push(`${rel}: ${m[0]}`);
      }
      for (const m of src.matchAll(PALETTE_CLASS)) offenders.push(`${rel}: ${m[0]}`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  const block = (selector: string) => {
    const start = CSS.indexOf(`${selector} {`);
    const end = CSS.indexOf("\n}", start);
    const vars = new Map<string, string>();
    for (const m of CSS.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) vars.set(m[1]!, m[2]!.trim());
    return vars;
  };
  const resolve = (vars: Map<string, string>, root: Map<string, string>, name: string): string => {
    let v = vars.get(name) ?? root.get(name);
    for (let i = 0; i < 5 && v && v.startsWith("var("); i++) v = vars.get(v.slice(6, -1)) ?? root.get(v.slice(6, -1));
    if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} does not resolve to a hex colour (${v})`);
    return v;
  };
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (l1! + 0.05) / (l2! + 0.05);
  };

  const PAIRS: [string, string][] = [
    ...["qualified", "boq", "proposal", "negotiation", "hold", "won", "lost", "dropped"].map((s): [string, string] => [`stage-${s}`, `stage-${s}-fg`]),
    ...["commit", "upside", "pipeline"].map((f): [string, string] => [`forecast-${f}`, `forecast-${f}-fg`]),
    ...["iti", "cloud", "services", "cyber"].map((b): [string, string] => [`bu-${b}-soft`, `bu-${b}-fg`]),
    ["selected", "selected-foreground"],
    ["primary", "primary-foreground"],
    ["destructive", "destructive-foreground"],
    ["background", "foreground"],
    ["card", "foreground-secondary"],
    ["card", "muted-foreground"],
    ["background", "muted-foreground"],
    ["card", "link"],
    ["card", "success"],
    ["card", "warning"],
    ["card", "destructive"],
    ["sidebar-accent", "sidebar-accent-foreground"],
    ["ink-900", "background"],
    // Tint foregrounds double as big status numbers on white cards
    ...["blue", "red", "amber", "green"].map((t): [string, string] => ["card", `tint-${t}-fg`]),
  ];

  for (const mode of [":root", ".dark"]) {
    it(`every tinted pair meets AA in ${mode}`, () => {
      const root = block(":root");
      const vars = block(mode);
      const failures = PAIRS.map(([bg, fg]) => ({ bg, fg, ratio: contrast(resolve(vars, root, bg), resolve(vars, root, fg)) })).filter((p) => p.ratio < 4.5);
      expect(failures, failures.map((f) => `${f.bg} / ${f.fg}: ${f.ratio.toFixed(2)}`).join("\n")).toEqual([]);
    });
  }
});
