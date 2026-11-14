"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/crm/states";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong on this page"
      description={error.digest ? `Reference ${error.digest}. Try again, and tell an administrator if it keeps happening.` : "Try again, and tell an administrator if it keeps happening."}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
