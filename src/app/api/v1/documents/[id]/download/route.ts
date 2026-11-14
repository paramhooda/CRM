import { handle } from "@/server/http";
import { downloadDocument } from "@/server/services/documents";

export const GET = handle({
  fn: async ({ actor, params }) => {
    const d = await downloadDocument(actor, params.id!);
    return new Response(new Uint8Array(d.content), {
      headers: {
        "content-type": d.contentType,
        "content-length": String(d.sizeBytes),
        "content-disposition": `attachment; filename="${d.fileName.replace(/[^a-zA-Z0-9_. -]/g, "_")}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  },
});
