import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function PageHeader({ title, description, actions, crumbs, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: { href: string; label: string }[]; meta?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav className="mb-1 flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" />}
                <Link href={c.href} className="hover:text-foreground">{c.label}</Link>
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
