// Download a deal document. Only people who can open the deal and see that kind of document get it.
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { opportunityScope } from "@/lib/authz";
import { canSeeDocument, contentDisposition } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const doc = await db.opportunityDocument.findFirst({
    where: { id, opportunity: opportunityScope(user) },
    select: { kind: true, uploadedById: true, fileName: true, mimeType: true, content: true },
  });
  if (!doc || !canSeeDocument(user, doc)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(doc.content, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.content.byteLength),
      "Content-Disposition": contentDisposition(doc.fileName, doc.mimeType, req.nextUrl.searchParams.get("inline") === "1"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
