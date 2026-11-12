"use client";
import { Button } from "@/components/ui/button";

export default function LoginError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page px-4 text-center">
      <h1 className="text-lg font-semibold">Sign-in is not available right now</h1>
      <p className="max-w-sm text-[13px] text-ink-2">
        The server could not complete the request. Try again in a minute; if it keeps happening, tell your administrator{error.digest ? ` (ref ${error.digest})` : ""}.
      </p>
      <Button variant="primary" onClick={reset}>Try again</Button>
    </main>
  );
}
