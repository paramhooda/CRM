// CSV that opens cleanly in Excel: UTF-8 with a byte-order mark, CRLF rows, everything quoted that needs it, and
// cells that would be read as formulas neutralised.

export type CsvColumn<T> = { header: string; value: (row: T) => unknown };

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "object" && v !== null && "toString" in v) s = String(v);
  else s = String(v);
  // A cell beginning with = + - @ or a tab/CR would be executed by spreadsheets as a formula
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
