import { ratingLabel } from "@/lib/stats/ratings";
import { borderOf, ratingTone } from "@/lib/tone";

/** A rating out of 10: green above 5.0 (above average), red below, plain at exactly 5.0. */
export function RatingBadge({ rating, className = "" }: { rating: number; className?: string }) {
  const tone = ratingTone(rating);
  const style = tone ? `${borderOf(tone)} ${tone}` : "border-line bg-sunken text-fg";
  return (
    <abbr
      title={`${rating.toFixed(1)} out of 10: ${ratingLabel(rating)}`}
      className={`numeral inline-block min-w-10 rounded border px-1.5 text-center text-sm leading-6 no-underline ${style} ${className}`}
    >
      {rating.toFixed(1)}
    </abbr>
  );
}
