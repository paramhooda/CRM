/** Deterministic pseudo-random numbers (mulberry32) so the demo data is the same on every machine. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
    shuffle: <T>(xs: readonly T[]): T[] => {
      const ys = [...xs];
      for (let i = ys.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [ys[i], ys[j]] = [ys[j]!, ys[i]!];
      }
      return ys;
    },
  };
}
export type Rng = ReturnType<typeof rng>;
