const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
};

/** League rank as "3rd / 32": top quarter stands out, bottom quarter is muted. */
export function RankPill({ rank, of }: { rank: number | null; of: number }) {
  if (rank === null || !of) return null;
  const top = rank <= Math.ceil(of / 4);
  const bottom = rank > of - Math.ceil(of / 4);
  return (
    <span
      className={`numeral inline-flex shrink-0 items-center whitespace-nowrap rounded px-1.5 text-xs leading-5 ${
        top ? "bg-header text-header-fg" : bottom ? "border border-line-strong text-fg-muted" : "bg-sunken text-fg"
      }`}
      title={`${ordinal(rank)} of ${of} teams`}
    >
      {ordinal(rank)}
      <span className="ml-1 font-normal opacity-75">/ {of}</span>
    </span>
  );
}
