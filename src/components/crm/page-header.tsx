import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHero } from "./hero";

/** Every screen's header: the hero card, with breadcrumbs as the eyebrow line. */
export function PageHeader({ title, description, actions, crumbs, meta, controls }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: { href: string; label: string }[]; meta?: ReactNode; controls?: ReactNode }) {
  const eyebrow = crumbs && crumbs.length > 0 ? (
    <nav className="flex items-center gap-1" aria-label="Breadcrumb">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5" />}
          <Link href={c.href} className="hover:text-foreground">{c.label}</Link>
        </span>
      ))}
    </nav>
  ) : undefined;
  return <PageHero eyebrow={eyebrow} title={title} description={description} meta={meta} actions={actions} controls={controls} />;
}
