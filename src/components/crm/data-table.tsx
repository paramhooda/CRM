import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./states";
import { queryString, type Query } from "@/lib/url-state";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** The sort field this column controls (`?sort=field:asc`) */
  sort?: string;
  align?: "left" | "right";
  className?: string;
  hideBelow?: "sm" | "md" | "lg";
};

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

/** The one table: server-rendered, sortable through the URL, with pagination and an empty state. */
export function DataTable<T extends { id: string }>({ columns, rows, query, pathname, total, page, pages, empty, rowHref, footer, dense }: {
  columns: Column<T>[]; rows: T[]; query?: Query; pathname?: string; total?: number; page?: number; pages?: number; empty: { title: string; description?: string; action?: ReactNode }; rowHref?: (row: T) => string; footer?: ReactNode; dense?: boolean;
}) {
  const sort = typeof query?.sort === "string" ? query.sort : "";
  const [sortField, sortDir] = sort.split(":");
  if (!rows.length) return <EmptyState {...empty} />;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-background hover:bg-background">
              {columns.map((c) => {
                const active = c.sort && sortField === c.sort;
                const next = active && sortDir === "asc" ? "desc" : "asc";
                const head = c.sort && pathname && query ? (
                  <Link href={`${pathname}${queryString(query, { sort: `${c.sort}:${next}` })}`} className="inline-flex items-center gap-1 hover:text-foreground">
                    {c.header}
                    {active && (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </Link>
                ) : c.header;
                return (
                  <TableHead key={c.key} className={cn("whitespace-nowrap", c.align === "right" && "text-right", c.hideBelow && HIDE[c.hideBelow], c.className)}>{head}</TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={cn(rowHref && "cursor-pointer", dense && "[&>td]:py-1.5")}>
                {columns.map((c, i) => (
                  <TableCell key={c.key} className={cn("align-middle", c.align === "right" && "text-right tabular", c.hideBelow && HIDE[c.hideBelow], c.className)}>
                    {rowHref && i === 0 ? <Link href={rowHref(r)} className="-mx-3 -my-2 block px-3 py-2 font-medium text-foreground hover:text-link">{c.cell(r)}</Link> : c.cell(r)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {(footer || (pages && pages > 1) || total !== undefined) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-4 py-2 text-xs text-muted-foreground">
          <div>{footer ?? (total !== undefined ? `${total.toLocaleString("en-IN")} ${total === 1 ? "record" : "records"}` : null)}</div>
          {pages && pages > 1 && pathname && query && page && (
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="icon-xs" disabled={page <= 1} aria-label="Previous page">
                <Link href={`${pathname}${queryString(query, { page: String(Math.max(1, page - 1)) })}`} aria-disabled={page <= 1} className={cn(page <= 1 && "pointer-events-none opacity-40")}><ChevronLeft /></Link>
              </Button>
              <span className="tabular">Page {page} of {pages}</span>
              <Button asChild variant="ghost" size="icon-xs" aria-label="Next page">
                <Link href={`${pathname}${queryString(query, { page: String(Math.min(pages, page + 1)) })}`} aria-disabled={page >= pages} className={cn(page >= pages && "pointer-events-none opacity-40")}><ChevronRight /></Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
