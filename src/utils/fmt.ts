/** Drops a trailing ".0" from a fixed-precision number string. */
function trimTrailingZeroDecimal(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/**
 * Universal number formatter: values below 10,000 are shown rounded (no
 * decimals, no abbreviation); values at or above 10,000 are abbreviated
 * using k/m/b, with 1 decimal point of precision.
 */
export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return trimTrailingZeroDecimal((n / 1e9).toFixed(1)) + "b";
  if (abs >= 1e6) return trimTrailingZeroDecimal((n / 1e6).toFixed(1)) + "m";
  if (abs >= 1e4) return trimTrailingZeroDecimal((n / 1e3).toFixed(1)) + "k";
  return Math.round(n).toLocaleString("en-US");
}

/** Formats a number with 1 decimal of precision, dropping it entirely if it's all zeroes. */
export function fmtDecimal(n: number): string {
  return trimTrailingZeroDecimal(n.toFixed(1));
}
