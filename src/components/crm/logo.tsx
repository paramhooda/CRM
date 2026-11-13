import Image from "next/image";
import { cn } from "@/lib/utils";

/** The Progression wordmark (light and dark versions) or the red swoosh mark alone. */
export function Logo({ variant = "full", height = 24, className }: { variant?: "full" | "mark"; height?: number; className?: string }) {
  if (variant === "mark") return <Image src="/brand/progression-mark.svg" alt="Progression" width={height} height={height} className={className} priority />;
  const width = Math.round(height * (184 / 32));
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image src="/brand/progression-logo.png" alt="Progression" width={width} height={height} className="block dark:hidden" priority />
      <Image src="/brand/progression-logo-dark.png" alt="Progression" width={width} height={height} className="hidden dark:block" priority />
    </span>
  );
}
