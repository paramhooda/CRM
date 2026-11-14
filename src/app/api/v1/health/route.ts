import { NextResponse } from "next/server";
import { db } from "@/server/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ data: { status: "ok", db: "up", time: new Date().toISOString() } });
  } catch {
    return NextResponse.json({ data: { status: "degraded", db: "down", time: new Date().toISOString() } }, { status: 503 });
  }
}
