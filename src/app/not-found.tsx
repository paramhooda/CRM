import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-ink-3">404</p>
      <h1 className="text-xl font-semibold">Not found or no access</h1>
      <p className="max-w-sm text-[13px] text-ink-2">The record does not exist, was deleted, or is outside the records your role can see.</p>
      <Button asChild variant="primary"><Link href="/dashboard">Back to dashboard</Link></Button>
    </main>
  );
}
