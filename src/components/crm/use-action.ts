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
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }
  return { pending, run };
}
