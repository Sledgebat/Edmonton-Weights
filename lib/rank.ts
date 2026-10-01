/** Rank `value` among `values` (1 = best). */
export function rankOf(value: number, values: number[], higherIsBetter: boolean): number {
  return values.filter((v) => (higherIsBetter ? v > value + 1e-9 : v < value - 1e-9)).length + 1;
}
