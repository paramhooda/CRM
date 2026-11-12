"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/validation";

/** Run a server action with toast feedback and a router refresh. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run<T>(fn: () => Promise<ActionResult<T>>, opts: { success?: string; onOk?: (r: ActionResult<T> & { ok: true }) => void; onError?: (r: ActionResult<T> & { ok: false }) => void } = {}) {
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          if (opts.success) toast.success(opts.success);
          if (r.warning) toast.warning(r.warning);
          opts.onOk?.(r);
          router.refresh();
        } else {
          toast.error(r.error);
          opts.onError?.(r);
        }
      } catch {
        // The server action itself never throws (see src/server/action-error.ts); this is a lost connection or a
        // new version deployed while the page was open.
        toast.error("Could not reach the server. Check your connection, reload the page and try again.");
      }
    });
  }
  return { pending, run };
}
