import { cn } from "@/lib/utils";

/** A record code, id or GSTIN: Geist Mono, small, muted, so codes line up and read as codes. */
export function RecordCode({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs text-muted-foreground", className)}>{children}</span>;
}
