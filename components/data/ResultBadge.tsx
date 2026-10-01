import type { Outcome } from "@/lib/oilers";

const STYLE: Record<Outcome, string> = {
  W: "text-win border-win",
  L: "text-loss border-loss",
  OTL: "text-fg-muted border-line-strong",
  SOL: "text-fg-muted border-line-strong",
};

const WORD: Record<Outcome, string> = { W: "Win", L: "Loss", OTL: "Overtime loss", SOL: "Shootout loss" };

/** W / L / OTL tag. Text, not colour alone, carries the result. */
export function ResultBadge({ outcome, className = "" }: { outcome: Outcome; className?: string }) {
  return (
    <abbr
      title={WORD[outcome]}
      className={`numeral inline-block min-w-9 rounded border-2 px-1.5 text-center text-xs leading-5 no-underline ${STYLE[outcome]} ${className}`}
    >
      {outcome}
    </abbr>
  );
}
