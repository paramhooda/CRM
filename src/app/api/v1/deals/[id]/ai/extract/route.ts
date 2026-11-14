import { handle } from "@/server/http";
import { ValidationError } from "@/server/errors";
import { extractFromFiles } from "@/server/services/ai-extract";

/** Reads line items or vendor prices out of uploaded documents (multipart: kind=boq|prices, files). Nothing is saved. */
export const POST = handle({
  fn: async ({ req, actor, params, requestId }) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ValidationError("Send the files as a form upload.");
    }
    const kind = form.get("kind");
    if (kind !== "boq" && kind !== "prices") throw new ValidationError("Say what to read: boq or prices.", { kind: "boq or prices" });
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    return extractFromFiles(actor, params.id!, kind, files, requestId);
  },
});
