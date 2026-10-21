"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-[13px] text-ink-2">The error has been logged{error.digest ? ` (ref ${error.digest})` : ""}. Try again, and contact your CRM administrator if it persists.</p>
      <Button variant="primary" onClick={reset}>Try again</Button>
    </div>
  );
}
