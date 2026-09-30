import Link from "next/link";

type Props = {
  name: string;
  number: number | string;
  position: string;
  href?: string;
  /** Optional line under the name, e.g. "82 GP · 100 PTS". */
  detail?: React.ReactNode;
};

/** Back-of-the-sweater card: the jersey number set huge behind the player's name. */
export function PlayerCard({ name, number, position, href, detail }: Props) {
  const [first, ...rest] = name.split(" ");
  const body = (
    <div className="card group relative isolate flex h-40 flex-col justify-end overflow-hidden p-4 transition hover:border-line-strong">
      <span
        aria-hidden
        className="numeral pointer-events-none absolute -right-2 -top-6 -z-10 text-[9.5rem] leading-none text-primary opacity-[0.12] [[data-mode=dark]_&]:text-fg [[data-mode=dark]_&]:opacity-[0.1]"
      >
        {number}
      </span>
      <span className="numeral text-sm tracking-wider text-accent-ink">
        #{number} · {position}
      </span>
      <span className="display mt-1 text-lg leading-none text-fg-muted">{first}</span>
      <span className="display text-3xl leading-none">{rest.join(" ")}</span>
      {detail && <span className="mt-2 text-sm text-fg-muted">{detail}</span>}
      <span aria-hidden className="sleeve-stripes-thin absolute inset-x-0 bottom-0 opacity-90" />
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-[10px]">
      {body}
    </Link>
  ) : (
    body
  );
}
