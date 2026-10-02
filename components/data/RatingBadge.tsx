import { ratingLabel } from "@/lib/stats/ratings";

/** A rating out of 10. The number carries the meaning; colour only reinforces it. */
/** `simple`: green above 5 (above average), red below, plain at exactly 5. */
export function RatingBadge({ rating, className = "", simple = false }: { rating: number; className?: string; simple?: boolean }) {
  const style = simple
    ? rating > 5
      ? "border-win text-win"
      : rating < 5
        ? "border-loss text-loss"
        : "border-line bg-sunken text-fg"
    : rating >= 8
      ? "bg-header text-header-fg border-header"
      : rating >= 7
        ? "border-win text-win"
        : rating >= 5
          ? "border-line bg-sunken text-fg"
          : "border-loss text-loss";
  return (
    <abbr
      title={`${rating.toFixed(1)} out of 10: ${ratingLabel(rating)}`}
      className={`numeral inline-block min-w-10 rounded border px-1.5 text-center text-sm leading-6 no-underline ${style} ${className}`}
    >
      {rating.toFixed(1)}
    </abbr>
  );
}
