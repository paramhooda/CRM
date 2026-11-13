// Generates docs/DATA_DICTIONARY.md from prisma/schema.prisma: every table and column with its meaning (the ///
// comments in the schema), type, whether it is required, and the allowed values of enums.
import fs from "node:fs";
import path from "node:path";

const schemaPath = path.resolve("prisma/schema.prisma");
const outPath = path.resolve("docs/DATA_DICTIONARY.md");
const src = fs.readFileSync(schemaPath, "utf8");

type Field = { name: string; column: string; type: string; required: boolean; list: boolean; comment: string; attrs: string; relation: boolean };
type Model = { name: string; table: string; comment: string; fields: Field[]; uniques: string[]; indexes: string[] };
type Enum = { name: string; comment: string; values: { name: string; comment: string }[] };

const models: Model[] = [];
const enums: Enum[] = [];
const lines = src.split("\n");
let pendingComment: string[] = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i]!;
  const t = line.trim();
  if (t.startsWith("///")) {
    pendingComment.push(t.replace(/^\/\/\/\s?/, ""));
    i++;
    continue;
  }
  const m = /^(model|enum)\s+(\w+)\s*\{/.exec(t);
  if (!m) {
    if (t !== "") pendingComment = [];
    i++;
    continue;
  }
  const kind = m[1]!, name = m[2]!;
  const comment = pendingComment.join(" ");
  pendingComment = [];
  i++;
  const body: string[] = [];
  while (i < lines.length && lines[i]!.trim() !== "}") {
    body.push(lines[i]!);
    i++;
  }
  i++;
  if (kind === "enum") {
    const e: Enum = { name, comment, values: [] };
    let c: string[] = [];
    for (const b of body) {
      const bt = b.trim();
      if (bt.startsWith("///")) c.push(bt.replace(/^\/\/\/\s?/, ""));
      else if (/^\w+/.test(bt) && !bt.startsWith("@@")) {
        const vm = /^(\w+)(?:\s+@map\("([^"]+)"\))?/.exec(bt)!;
        e.values.push({ name: vm[2] ?? vm[1]!, comment: c.join(" ") });
        c = [];
      } else if (bt === "") c = [];
    }
    enums.push(e);
  } else {
    const model: Model = { name, table: name, comment, fields: [], uniques: [], indexes: [] };
    let c: string[] = [];
    for (const b of body) {
      const bt = b.trim();
      if (bt.startsWith("///")) { c.push(bt.replace(/^\/\/\/\s?/, "")); continue; }
      if (bt.startsWith("@@map(")) { model.table = /@@map\("([^"]+)"\)/.exec(bt)![1]!; continue; }
      if (bt.startsWith("@@unique(")) { model.uniques.push(/\[([^\]]+)\]/.exec(bt)?.[1] ?? bt); continue; }
      if (bt.startsWith("@@index(")) { model.indexes.push(/\[([^\]]+)\]/.exec(bt)?.[1] ?? bt); continue; }
      if (bt.startsWith("@@") || bt === "" || bt.startsWith("//")) { if (bt === "") c = []; continue; }
      const fm = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(bt);
      if (!fm) continue;
      const [, fname, ftype, list, optional, attrs] = fm;
      const relation = /@relation/.test(attrs ?? "") || models.some((x) => x.name === ftype) || /^[A-Z]/.test(ftype!) && !enums.some((e) => e.name === ftype) && !["String", "Int", "BigInt", "Boolean", "DateTime", "Decimal", "Bytes", "Json", "Float"].includes(ftype!);
      const column = /@map\("([^"]+)"\)/.exec(attrs ?? "")?.[1] ?? fname!;
      model.fields.push({ name: fname!, column, type: ftype!, required: !optional && !list, list: !!list, comment: c.join(" "), attrs: attrs ?? "", relation });
      c = [];
    }
    models.push(model);
  }
}

const enumByName = new Map(enums.map((e) => [e.name, e]));
const typeText = (f: Field) => {
  const db = /@db\.(\w+(?:\([^)]*\))?)/.exec(f.attrs)?.[1];
  const base: Record<string, string> = { String: "text", Int: "integer", BigInt: "bigint", Boolean: "boolean", DateTime: "timestamp (UTC)", Decimal: "decimal", Bytes: "binary", Json: "json", Float: "number" };
  const e = enumByName.get(f.type);
  if (e) return `enum ${f.type}`;
  if (f.relation) return `→ ${f.type}${f.list ? " (many)" : ""}`;
  return (db ? `${base[f.type] ?? f.type} (${db})` : base[f.type] ?? f.type) + (f.list ? "[]" : "");
};
const flags = (f: Field) => {
  const out: string[] = [];
  if (/@id\b/.test(f.attrs)) out.push("primary key");
  if (/@unique\b/.test(f.attrs)) out.push("unique");
  const d = /@default\(([^)]*\)?[^)]*)\)/.exec(f.attrs)?.[1];
  if (d) out.push(`default ${d}`);
  if (/@updatedAt/.test(f.attrs)) out.push("set on every change");
  return out.join(", ");
};
const esc = (s: string) => s.replace(/\|/g, "\\|");

let md = `# Data dictionary\n\nGenerated from \`prisma/schema.prisma\` by \`npm run docs:dictionary\`. Do not edit by hand; change the schema comments instead.\n\nAll tables have UUID primary keys, timestamps in UTC, money as decimal(16,2) in INR and soft deletes where noted (\`deleted_at\`). Dropdown values live in the lookup tables and are edited by administrators.\n\n`;
md += `## Tables\n\n| Table | What it holds |\n|---|---|\n`;
for (const m of models) md += `| [\`${m.table}\`](#${m.table.replace(/_/g, "")}) | ${esc(m.comment)} |\n`;
md += "\n";
for (const m of models) {
  md += `## ${m.table}\n\n${m.comment}\n\n`;
  md += `| Column | Type | Required | Meaning | Notes |\n|---|---|---|---|---|\n`;
  for (const f of m.fields) {
    if (f.relation && f.list) continue; // back-relations are not columns
    const e = enumByName.get(f.type);
    const meaning = f.comment + (e ? ` Allowed values: ${e.values.map((v) => `\`${v.name}\``).join(", ")}.` : "");
    md += `| \`${f.relation ? f.name + " (relation)" : f.column}\` | ${typeText(f)} | ${f.required ? "yes" : "no"} | ${esc(meaning)} | ${esc(flags(f))} |\n`;
  }
  if (m.uniques.length) md += `\nUnique together: ${m.uniques.map((u) => `(${u})`).join(", ")}\n`;
  if (m.indexes.length) md += `\nIndexes: ${m.indexes.map((u) => `(${u})`).join(", ")}\n`;
  md += "\n";
}
md += `## Enumerations\n\n`;
for (const e of enums) {
  md += `### ${e.name}\n\n${e.comment}\n\n| Value | Meaning |\n|---|---|\n`;
  for (const v of e.values) md += `| \`${v.name}\` | ${esc(v.comment)} |\n`;
  md += "\n";
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md);
console.log(`Wrote ${path.relative(process.cwd(), outPath)}: ${models.length} tables, ${enums.length} enums.`);
