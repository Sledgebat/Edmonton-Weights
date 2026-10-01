export type RinkShot = {
  /** Normalised so the shooter attacks toward +x (NHL feet). */
  x: number;
  y: number;
  xg: number;
  goal: boolean;
  side: "us" | "them";
  title: string;
};

/**
 * A full NHL rink (200 × 85 ft) with every unblocked shot. "Us" attacks the right-hand net,
 * "them" the left. Dot area grows with expected goals; goals are filled, other shots hollow.
 */
export function FullRink({
  shots,
  label,
  id = "rink",
}: {
  shots: RinkShot[];
  label: string;
  id?: string;
}) {
  const sx = (x: number) => x + 100;
  const sy = (y: number) => 42.5 - y;
  const line = "var(--border-strong)";
  const rinkPath =
    "M28,0 L172,0 Q200,0 200,28 L200,57 Q200,85 172,85 L28,85 Q0,85 0,57 L0,28 Q0,0 28,0 Z";

  // Draw big chances last so they sit on top.
  const ordered = [...shots].sort((a, b) => a.xg - b.xg);

  return (
    <svg
      viewBox="-1 -1 202 87"
      role="img"
      aria-label={label}
      className="block h-auto w-full"
    >
      <defs>
        <clipPath id={`clip-${id}`}>
          <path d={rinkPath} />
        </clipPath>
      </defs>
      <path
        d={rinkPath}
        fill="var(--surface-raised)"
        stroke={line}
        strokeWidth="0.6"
      />
      <g fill="none" stroke={line} strokeWidth="0.4">
        <line
          x1={sx(0)}
          y1="0"
          x2={sx(0)}
          y2="85"
          stroke="var(--loss)"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
        {[-25, 25].map((x) => (
          <line
            key={x}
            x1={sx(x)}
            y1="0"
            x2={sx(x)}
            y2="85"
            stroke="var(--chart-them)"
            strokeOpacity="0.5"
            strokeWidth="1"
          />
        ))}
        {[-89, 89].map((x) => (
          <g key={x}>
            <line
              x1={sx(x)}
              y1="3"
              x2={sx(x)}
              y2="82"
              stroke="var(--loss)"
              strokeOpacity="0.5"
            />
            <path
              d={
                x > 0
                  ? `M${sx(89)},${sy(4)} A4,4 0 0 0 ${sx(89)},${sy(-4)}`
                  : `M${sx(-89)},${sy(-4)} A4,4 0 0 0 ${sx(-89)},${sy(4)}`
              }
              fill="var(--chart-them)"
              fillOpacity="0.12"
              stroke="var(--chart-them)"
              strokeOpacity="0.45"
            />
            <rect
              x={x > 0 ? sx(89) : sx(-89) - 3.3}
              y={sy(3)}
              width="3.3"
              height="6"
            />
          </g>
        ))}
        <circle
          cx={sx(0)}
          cy={sy(0)}
          r="15"
          stroke="var(--chart-them)"
          strokeOpacity="0.35"
        />
        {[-69, 69].flatMap((x) =>
          [-22, 22].map((y) => (
            <circle
              key={`${x},${y}`}
              cx={sx(x)}
              cy={sy(y)}
              r="15"
              stroke="var(--loss)"
              strokeOpacity="0.3"
            />
          )),
        )}
      </g>

      <g clipPath={`url(#clip-${id})`}>
        {ordered.map((s, i) => {
          // "Them" shots are rotated 180° so they attack the left net.
          const x = s.side === "us" ? s.x : -s.x;
          const y = s.side === "us" ? s.y : -s.y;
          const r = 0.9 + Math.sqrt(Math.max(0, s.xg)) * 4.2;
          const color = `var(--chart-${s.side})`;
          return (
            <circle
              key={i}
              cx={sx(x)}
              cy={sy(y)}
              r={r}
              fill={s.goal ? color : "var(--surface-raised)"}
              fillOpacity={s.goal ? 1 : 0.35}
              stroke={s.goal ? "var(--text)" : color}
              strokeWidth={s.goal ? 0.6 : 0.5}
            >
              <title>{s.title}</title>
            </circle>
          );
        })}
      </g>
    </svg>
  );
}
