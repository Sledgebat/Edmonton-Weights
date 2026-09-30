import type { Metadata } from "next";
import { PlayerCard } from "@/components/ui/PlayerCard";
import { Rivets } from "@/components/ui/Rivets";
import { AA_MIN, contrastRatio } from "@/lib/theme/contrast";
import { CONTRAST_PAIRS, ERAS, ERA_INFO, MODES, THEMES, type Era, type Mode, type Tokens } from "@/lib/theme/tokens";

export const metadata: Metadata = { title: "Style guide" };

const SWATCH_ORDER: (keyof Tokens)[] = [
  "brand-primary",
  "brand-accent",
  "brand-trim",
  "surface",
  "surface-raised",
  "surface-sunken",
  "border",
  "border-strong",
  "text",
  "text-muted",
  "accent-ink",
  "header-bg",
  "button-bg",
  "win",
  "loss",
];

/** Layout sample only; the numbers are placeholders, not real stats. */
const SAMPLE_ROWS = [
  { name: "Skater A", gp: 10, g: 6, a: 11 },
  { name: "Skater B", gp: 10, g: 7, a: 5 },
  { name: "Skater C", gp: 9, g: 2, a: 8 },
];

function Section({ id, title, children, intro }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-14">
      <h2 id={id} className="display text-4xl sm:text-5xl">
        {title}
      </h2>
      {intro && <p className="mt-2 max-w-prose text-fg-muted">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ContrastTable({ tokens }: { tokens: Tokens }) {
  return (
    <table className="tabular w-full text-left text-xs">
      <caption className="sr-only">WCAG contrast ratios</caption>
      <thead>
        <tr className="text-fg-muted">
          <th className="py-1 pr-2 font-semibold">Pair</th>
          <th className="py-1 pr-2 text-right font-semibold">Ratio</th>
          <th className="py-1 text-right font-semibold">AA</th>
        </tr>
      </thead>
      <tbody>
        {CONTRAST_PAIRS.map((p) => {
          const ratio = contrastRatio(tokens[p.fg], tokens[p.bg]);
          const min = AA_MIN[p.req];
          const pass = ratio >= min;
          return (
            <tr key={`${p.fg}-${p.bg}`} className="border-t border-line">
              <td className="py-1.5 pr-2">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="grid h-6 w-8 shrink-0 place-items-center rounded border border-line text-[11px] font-bold"
                    style={{ background: tokens[p.bg], color: tokens[p.fg] }}
                  >
                    Aa
                  </span>
                  <span>
                    {p.use}
                    <span className="block font-mono text-[10px] text-fg-muted">
                      {p.fg} / {p.bg}
                    </span>
                  </span>
                </span>
              </td>
              <td className="py-1.5 pr-2 text-right font-semibold">{ratio.toFixed(2)}:1</td>
              <td className={`py-1.5 text-right font-semibold ${pass ? "text-win" : "text-loss"}`}>
                {pass ? "Pass" : "Fail"} <span className="font-normal text-fg-muted">≥{min}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ThemePreview({ era, mode }: { era: Era; mode: Mode }) {
  const t = THEMES[era][mode];
  return (
    <div data-era={era} data-mode={mode} className="overflow-hidden rounded-xl border border-line shadow-sm">
      {/* Mini header */}
      <div className="bg-header text-header-fg">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="display-hero text-2xl">
            Oil Country <span className="text-header-accent">Hub</span>
          </span>
          <span className="numeral text-xs uppercase tracking-widest opacity-85">{mode}</span>
        </div>
        <div className="flex gap-4 px-4 pb-2 text-sm">
          <span className="display relative text-base after:absolute after:inset-x-0 after:-bottom-1 after:h-[3px] after:bg-header-accent">
            Schedule
          </span>
          <span className="display text-base opacity-90">Standings</span>
          <span className="display text-base opacity-90">Roster</span>
        </div>
        <div className="sleeve-stripes-thin" aria-hidden />
      </div>

      <div className="space-y-6 p-4" style={{ backgroundImage: "var(--page-pattern)" }}>
        {/* Swatches */}
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {SWATCH_ORDER.map((k) => (
            <li key={k} className="text-[11px] leading-tight">
              <span className="block h-9 rounded-md border border-line" style={{ background: t[k] }} />
              <span className="mt-1 block font-semibold">{k}</span>
              <span className="font-mono text-fg-muted">{t[k]}</span>
            </li>
          ))}
        </ul>

        {/* Buttons, badges, links */}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary">
            Game Day Hub
          </button>
          <button type="button" className="btn btn-secondary">
            Full schedule
          </button>
          <span className="metal numeral rounded px-2 py-1 text-xs uppercase tracking-widest">Metal badge</span>
          <a href="#themes" className="font-semibold text-accent-ink underline">
            Text link
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded border border-line bg-raised px-2 py-1 font-semibold text-win">W 4–2</span>
          <span className="rounded border border-line bg-raised px-2 py-1 font-semibold text-loss">L 1–3</span>
          <span className="rounded border border-line bg-raised px-2 py-1 font-semibold text-fg-muted">OTL 2–3</span>
          <Rivets className="text-accent-ink" />
        </div>

        <PlayerCard name="Connor McDavid" number={97} position="C" detail="Layout sample" />

        {/* Table */}
        <div className="card overflow-hidden">
          <table className="tabular w-full text-left text-sm">
            <caption className="px-3 pt-2 text-left text-xs text-fg-muted">Stat table (placeholder values)</caption>
            <thead className="bg-header text-header-fg">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2 text-right">GP</th>
                <th className="px-3 py-2 text-right">G</th>
                <th className="px-3 py-2 text-right">A</th>
                <th className="px-3 py-2 text-right">P</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_ROWS.map((r, i) => (
                <tr key={r.name} className={`border-t border-line ${i === 0 ? "bg-sunken font-semibold" : ""}`}>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.gp}</td>
                  <td className="px-3 py-2 text-right">{r.g}</td>
                  <td className="px-3 py-2 text-right">{r.a}</td>
                  <td className="numeral px-3 py-2 text-right">{r.g + r.a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <div className="sleeve-stripes rounded-sm" aria-hidden />
          <div className="sleeve-stripes-thin rounded-sm" aria-hidden />
        </div>

        <details open className="card p-3">
          <summary className="cursor-pointer text-sm font-semibold">Contrast ratios ({CONTRAST_PAIRS.length} pairs)</summary>
          <div className="mt-2">
            <ContrastTable tokens={t} />
          </div>
        </details>
      </div>
    </div>
  );
}

export default function StyleguidePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">Design system</p>
      <h1 className="display-hero mt-2 text-6xl sm:text-7xl">Style guide</h1>
      <p className="mt-3 max-w-prose text-lg text-fg-muted">
        Every colour, font and component, in all three jersey eras, light and dark. The page itself follows the theme you
        pick in the header; the previews below are fixed.
      </p>

      <Section id="type" title="Typography">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-fg-muted">
              Display · Saira Extra Condensed 800, italic for hero
            </p>
            <p className="display-hero mt-2 text-6xl">Game Night</p>
            <p className="display mt-2 text-3xl">Pacific Division Standings</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-fg-muted">Numbers and scores · Oswald 700</p>
            <p className="numeral mt-2 text-7xl leading-none">
              4<span className="text-fg-muted">–</span>2
            </p>
            <p className="numeral mt-2 text-4xl text-accent-ink">#97 · #29</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-fg-muted">UI and body · Barlow 400–600</p>
            <p className="mt-2 text-lg">
              Clean, industrial body copy that sits comfortably next to the condensed display faces. <strong>Semibold</strong>{" "}
              for emphasis, <em>italic</em> for asides.
            </p>
            <p className="mt-2 text-sm text-fg-muted">Secondary text at 14px, used for captions and timestamps.</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-fg-muted">
              Stat tables · Barlow with tabular numerals
            </p>
            <table className="tabular mt-2 text-lg">
              <tbody>
                {[1111.11, 22.2, 333.33].map((n) => (
                  <tr key={n}>
                    <td className="pr-6 text-right">{n.toFixed(2)}</td>
                    <td className="text-right text-fg-muted">{(n / 7).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section
        id="motifs"
        title="Motifs"
        intro="Sleeve stripes divide sections, five rivets mark the five Cups, and the Gear era gets a faint generic cog texture. No team logos, crests or wordmarks are used anywhere."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card p-5">
            <p className="text-sm font-semibold">Sleeve stripes</p>
            <div className="sleeve-stripes mt-3 rounded-sm" aria-hidden />
            <div className="sleeve-stripes-thin mt-3 rounded-sm" aria-hidden />
          </div>
          <div className="card p-5">
            <p className="text-sm font-semibold">Five rivets</p>
            <Rivets className="mt-4 text-accent-ink" size={10} />
          </div>
          <div className="card p-5">
            <p className="text-sm font-semibold">Metallic silver (badges and headers only)</p>
            <div className="metal display mt-3 rounded px-3 py-2 text-2xl">Gear Era</div>
          </div>
        </div>
      </Section>

      <Section
        id="themes"
        title="Jersey-era themes"
        intro="Heritage shades are approximations to verify against high-resolution jersey photos before launch. Orange fails contrast on white at small sizes, so light themes use a darker accent ink for text and keep bright orange for fills with dark text."
      >
        <div className="space-y-12">
          {ERAS.map((era) => (
            <div key={era}>
              <h3 className="display text-3xl">
                {ERA_INFO[era].name} <span className="text-fg-muted">· {ERA_INFO[era].years}</span>
              </h3>
              <p className="mt-1 text-fg-muted">{ERA_INFO[era].blurb}</p>
              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                {MODES.map((mode) => (
                  <ThemePreview key={mode} era={era} mode={mode} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
