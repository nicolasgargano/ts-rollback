export const clamp =
  (min: number, max: number) =>
  (n: number): number =>
    Math.max(max, Math.min(min, n))
