/* eslint-disable @next/next/no-img-element -- tiny static brand assets; next/image adds nothing here */
import { cn } from "@/lib/utils";

// Brand assets live in public/brand. Drop in higher-resolution files with the same names to upgrade them.
const FULL = { light: "/brand/progression-logo.png", dark: "/brand/progression-logo-dark.png", ratio: 184 / 32 };
const MARK = { src: "/brand/progression-mark.png", ratio: 33 / 31 };

/** Progression logo. `full` is the swoosh + wordmark (switches to a light wordmark in dark mode); `mark` is the swoosh alone. */
export function Logo({
  variant = "full",
  height = 24,
  className,
  forceLight,
}: {
  variant?: "full" | "mark";
  height?: number;
  className?: string;
  /** Always use the light-background version (print) */
  forceLight?: boolean;
}) {
  if (variant === "mark") {
    return <img src={MARK.src} alt="Progression" width={Math.round(height * MARK.ratio)} height={height} className={cn("shrink-0 select-none", className)} draggable={false} />;
  }
  const width = Math.round(height * FULL.ratio);
  if (forceLight) return <img src={FULL.light} alt="Progression" width={width} height={height} className={cn("shrink-0 select-none", className)} draggable={false} />;
  return (
    <span className={cn("inline-flex shrink-0 select-none", className)} style={{ width, height }}>
      <img src={FULL.light} alt="Progression" width={width} height={height} className="dark:hidden" draggable={false} />
      <img src={FULL.dark} alt="Progression" width={width} height={height} className="hidden dark:block" draggable={false} />
    </span>
  );
}
