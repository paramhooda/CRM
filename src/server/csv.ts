import "server-only";
import { NextResponse } from "next/server";
import { toCsv, type CsvColumn } from "@/domain/csv";

/** A CSV download response. */
export function csvResponse<T>(fileName: string, columns: CsvColumn<T>[], rows: T[]) {
  const body = toCsv(columns, rows);
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
      "cache-control": "no-store",
    },
  });
}

export const stamp = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
