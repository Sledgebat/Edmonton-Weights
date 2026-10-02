const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
};

/** Green in the top half of the league, red in the bottom half, plain exactly in the middle. */
export function rankTone(rank: number | null, of: number): "text-win" | "text-loss" | "" {
  if (rank === null || !of) return "";
  const middle = (of + 1) / 2;
  return rank < middle ? "text-win" : rank > middle ? "text-loss" : "";
}

/** League rank as "3rd / 32", outlined green (top half) or red (bottom half). */
export function RankPill({ rank, of }: { rank: number | null; of: number }) {
  if (rank === null || !of) return null;
  const tone = rankTone(rank, of);
  const border = tone === "text-win" ? "border-win" : tone === "text-loss" ? "border-loss" : "border-line-strong";
  return (
    <span
      className={`numeral inline-flex shrink-0 items-center whitespace-nowrap rounded border px-1.5 text-xs leading-5 ${border} ${tone || "text-fg"}`}
      title={`${ordinal(rank)} of ${of} teams`}
    >
      {ordinal(rank)}
      <span className="ml-1 font-normal opacity-75">/ {of}</span>
    </span>
  );
}
