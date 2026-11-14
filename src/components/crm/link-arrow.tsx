import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Open deals →": a text link with the arrow. */
export function ArrowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-link", className)}>
      {children}
      <ArrowRight className="size-4" />
    </Link>
  );
}
