// Upload a document to a deal (multipart: file, kind, note). Server actions cap bodies at 1 MB, so files come here.
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can, opportunityScope } from "@/lib/authz";
import { recordEvent } from "@/lib/audit";
import { CLOSED_STAGES, type StageKey } from "@/lib/constants";
import { DOCUMENT_KIND_META, checkUpload, uploadKinds, type DocumentKindKey } from "@/lib/documents";
import { OPEN_PRESALES, OPEN_PRICING } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const opp = await db.opportunity.findFirst({
    where: { AND: [{ id }, opportunityScope(user)] },
    select: { id: true, name: true, stage: true, salesOwnerId: true, presalesOwnerId: true, purchaseOwnerId: true },
  });
  if (!opp) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  if (!can.addDocument(user, { ...opp, closed: CLOSED_STAGES.includes(opp.stage as StageKey) }))
    return NextResponse.json({ error: "You cannot add documents to this deal." }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload. Try again." }, { status: 400 });
  }
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "") as DocumentKindKey;
  const note = String(form.get("note") ?? "").trim().slice(0, 300) || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (!uploadKinds(user.role).includes(kind)) return NextResponse.json({ error: "Choose what kind of document this is." }, { status: 400 });
  const check = checkUpload({ name: file.name, size: file.size });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // Link it to the request this person is working on, so the request history shows what came with it
  const [presales, pricing] = await Promise.all([
    user.role === "PRESALES" ? db.presalesRequest.findFirst({ where: { opportunityId: id, assignedToId: user.id, status: { in: [...OPEN_PRESALES] } }, select: { id: true } }) : null,
    user.role === "PURCHASE" ? db.pricingRequest.findFirst({ where: { opportunityId: id, assignedToId: user.id, status: { in: [...OPEN_PRICING] } }, select: { id: true } }) : null,
  ]);
  const content = new Uint8Array(await file.arrayBuffer());
  const doc = await db.$transaction(async (tx) => {
    const d = await tx.opportunityDocument.create({
      data: {
        opportunityId: id, kind, fileName: check.fileName, mimeType: check.mimeType, sizeBytes: content.byteLength, content, note,
        presalesRequestId: presales?.id ?? null, pricingRequestId: pricing?.id ?? null, uploadedById: user.id,
      },
      select: { id: true },
    });
    await recordEvent(tx, { entityType: "Opportunity", entityId: id, action: "DOCUMENT_ADDED", userId: user.id, newValue: `${DOCUMENT_KIND_META[kind].label} · ${check.fileName}` });
    return d;
  });
  revalidatePath(`/opportunities/${id}`);
  return NextResponse.json({ ok: true, id: doc.id });
}
