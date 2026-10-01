import { useId } from "react";

export type RinkBin = { x: number; y: number; xg: number };

/**
 * The offensive half of an NHL rink, drawn vertically with the net at the top, in NHL
 * coordinates (feet): x from the blue line (25) to the end boards (100), y from -42.5 to 42.5.
 * Optional heat: 5 ft bins of expected goals, shaded in one hue (darker = more danger), softly
 * blurred so it reads as a density rather than a grid.
 */
export function HalfRink({
  bins = [],
  max = 1,
  color = "var(--chart-us)",
  label,
  className = "",
}: {
  bins?: RinkBin[];
  max?: number;
  color?: string;
  label: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  // SVG space: width 85 (y), height 75 (x). Net at top: svgY = 100 - x.
  const sx = (y: number) => y + 42.5;
  const sy = (x: number) => 100 - x;
  const line = "var(--border-strong)";

  return (
    <svg viewBox="-1 -1 87 77" role="img" aria-label={label} className={`block h-auto w-full ${className}`}>
      <defs>
        <clipPath id={`rink-${id}`}>
          <path d="M0,75 L0,28 Q0,0 28,0 L57,0 Q85,0 85,28 L85,75 Z" />
        </clipPath>
        <filter id={`soft-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
      </defs>

      <path d="M0,75 L0,28 Q0,0 28,0 L57,0 Q85,0 85,28 L85,75 Z" fill="var(--surface-raised)" stroke={line} strokeWidth="0.6" />

      <g clipPath={`url(#rink-${id})`}>
        <g filter={`url(#soft-${id})`}>
          {bins.map((b) => (
            <rect
              key={`${b.x},${b.y}`}
              x={sx(b.y) - 2.5}
              y={sy(b.x) - 2.5}
              width={5}
              height={5}
              fill={color}
              // Square-root scale so the slot doesn't wash out everything else.
              opacity={Math.min(1, Math.sqrt(b.xg / max))}
            />
          ))}
        </g>
      </g>

      {/* Markings, drawn over the heat so they stay visible. */}
      <g fill="none" stroke={line} strokeWidth="0.4" opacity="0.9">
        {/* goal line */}
        <line x1="2" y1={sy(89)} x2="83" y2={sy(89)} stroke="var(--loss)" strokeOpacity="0.6" />
        {/* blue line */}
        <line x1="0" y1={sy(25.5)} x2="85" y2={sy(25.5)} stroke="var(--chart-them)" strokeWidth="1" strokeOpacity="0.55" />
        {/* faceoff circles and dots */}
        {[-22, 22].map((y) => (
          <g key={y}>
            <circle cx={sx(y)} cy={sy(69)} r="15" stroke="var(--loss)" strokeOpacity="0.45" />
            <circle cx={sx(y)} cy={sy(69)} r="1" fill="var(--loss)" fillOpacity="0.6" stroke="none" />
          </g>
        ))}
        {/* crease */}
        <path d={`M${sx(-4)},${sy(89)} A4,4 0 0 0 ${sx(4)},${sy(89)}`} fill="var(--chart-them)" fillOpacity="0.15" stroke="var(--chart-them)" strokeOpacity="0.5" />
        {/* net */}
        <rect x={sx(-3)} y={sy(89) - 3.3} width="6" height="3.3" stroke={line} strokeWidth="0.6" />
      </g>
    </svg>
  );
}
