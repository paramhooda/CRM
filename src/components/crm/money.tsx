import { inr, pct } from "@/domain/money";
import { cn } from "@/lib/utils";

export function Money({ value, className, precise }: { value: string | number | null | undefined; className?: string; precise?: boolean }) {
  return <span className={cn("tabular", className)}>{inr(value, { precise })}</span>;
}

export function Pct({ value, className, digits = 1 }: { value: string | number | null | undefined; className?: string; digits?: number }) {
  const n = value === null || value === undefined ? null : Number(value);
  return <span className={cn("tabular", n !== null && n < 0 && "text-destructive", className)}>{pct(value, digits)}</span>;
}
