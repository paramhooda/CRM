import { handle, fieldErrors } from "@/server/http";
import { ValidationError } from "@/server/errors";
import { documentUploadFields } from "@/contracts/approvals";
import { listDocuments, uploadDocument } from "@/server/services/documents";

export const GET = handle({ fn: ({ actor, params }) => listDocuments(actor, params.id!) });

export const POST = handle({
  fn: async ({ req, actor, params, requestId }) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ValidationError("Send the file as a form upload.");
    }
    const parsed = documentUploadFields.safeParse({ documentKindId: form.get("documentKindId"), description: form.get("description") ?? null });
    if (!parsed.success) throw new ValidationError(undefined, fieldErrors(parsed.error));
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose a file.", { file: "Choose a file." });
    return uploadDocument(actor, params.id!, { ...parsed.data, file }, requestId);
  },
});
