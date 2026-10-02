import { ratingLabel } from "@/lib/stats/ratings";

/** A rating out of 10. The number carries the meaning; colour only reinforces it. */
export function RatingBadge({ rating, className = "" }: { rating: number; className?: string }) {
  const style =
    rating >= 8 ? "bg-header text-header-fg border-header" : rating >= 7 ? "border-win text-win" : rating >= 5 ? "border-line bg-sunken text-fg" : "border-loss text-loss";
  return (
    <abbr
      title={`${rating.toFixed(1)} out of 10: ${ratingLabel(rating)}`}
      className={`numeral inline-block min-w-10 rounded border px-1.5 text-center text-sm leading-6 no-underline ${style} ${className}`}
    >
      {rating.toFixed(1)}
    </abbr>
  );
}
