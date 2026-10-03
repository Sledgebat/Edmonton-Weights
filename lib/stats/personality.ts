/**
 * Team personality: a one-line label for how a team plays, from league ranks the site already
 * has. Each type is a few conditions ("top 10 in expected goals for per 60"); a team matches a
 * type when it meets all of them, and the closer it is to the top (or bottom) of each, the
 * stronger the match. The best match is the label; a second strong match is shown too.
 * Thresholds are written for 32 teams and tuned so last season's teams spread across the labels.
 */

export type Trait = "xgf60" | "xga60" | "xgfPct" | "cfPct" | "hdcfPct" | "gsax" | "pdo" | "pp" | "pk" | "luck" | "penalties";

/** League ranks, 1 = best (for luck, 1 = luckiest). */
export type TraitRanks = Partial<Record<Trait, number>>;

export const TRAIT_LABEL: Record<Trait, string> = {
  xgf60: "Expected goals for per 60 (5 on 5)",
  xga60: "Expected goals against per 60 (5 on 5)",
  xgfPct: "Expected goals share (5 on 5)",
  cfPct: "Shot attempt share (5 on 5)",
  hdcfPct: "High-danger chance share",
  gsax: "Goaltending (goals saved above expected)",
  pdo: "PDO (5-on-5 shooting % + save %)",
  pp: "Power play",
  pk: "Penalty kill",
  luck: "Luck (points vs deserved)",
  penalties: "Penalties drawn minus taken",
};

/** "top" = among the best `within` teams; "bottom" = among the worst `within`. */
type Condition = { trait: Trait; end: "top" | "bottom"; within: number };

/** `weight` below 1 makes a type give way to others it ties with (e.g. discipline is less of an identity). */
export type PersonalityType = { key: string; label: string; blurb: string; when: Condition[]; weight?: number };

const top = (trait: Trait, within: number): Condition => ({ trait, end: "top", within });
const bottom = (trait: Trait, within: number): Condition => ({ trait, end: "bottom", within });

export const TYPES: PersonalityType[] = [
  {
    key: "playoff",
    label: "Built for the playoffs",
    blurb: "Good at both ends at 5 on 5: they create plenty and give up little, the kind of team that travels well in April.",
    when: [top("xgf60", 10), top("xga60", 10)],
  },
  {
    key: "run-and-gun",
    label: "Run-and-gun",
    blurb: "Chances galore at both ends. Their games are fun to watch and rarely tidy.",
    when: [top("xgf60", 10), bottom("xga60", 12)],
  },
  {
    key: "shutdown",
    label: "Shutdown",
    blurb: "They win by giving up almost nothing, not by creating a lot.",
    when: [top("xga60", 8), bottom("xgf60", 18)],
  },
  {
    key: "puck-hogs",
    label: "Puck hogs",
    blurb: "They have the puck far more than their opponents do, and outshoot almost everyone.",
    when: [top("cfPct", 6)],
    weight: 0.85,
  },
  {
    key: "goalie",
    label: "Goalie carrying them",
    blurb: "Their goaltending is stopping far more than an average goalie would behind a defence that gives up a lot.",
    when: [top("gsax", 8), bottom("xga60", 16)],
  },
  {
    key: "unlucky",
    label: "Unlucky: better than the record",
    blurb: "They're controlling play, but the points haven't followed. The results usually catch up.",
    when: [bottom("luck", 8), top("xgfPct", 16)],
  },
  {
    key: "dangerous",
    label: "Living dangerously",
    blurb: "Their record is better than their play: they're getting outchanced and winning anyway. That rarely lasts.",
    when: [top("luck", 8), bottom("xgfPct", 16)],
  },
  {
    key: "special-teams",
    label: "Special-teams merchants",
    blurb: "The power play and penalty kill are doing the heavy lifting.",
    when: [top("pp", 10), top("pk", 10)],
  },
  {
    key: "undisciplined",
    label: "Can't stay out of the box",
    blurb: "They take far more penalties than they draw, which hands opponents power plays.",
    when: [bottom("penalties", 4)],
    weight: 0.7,
  },
  {
    key: "hemmed-in",
    label: "Hemmed in",
    blurb: "Outshot and outchanced most nights: too much time in their own end.",
    when: [bottom("xgfPct", 6), bottom("cfPct", 10)],
  },
];

export const FALLBACK: Omit<PersonalityType, "when"> = {
  key: "middle",
  label: "Middle of the pack",
  blurb: "Nothing about their game stands far out from the rest of the league, good or bad.",
};

export type Reason = { trait: Trait; label: string; rank: number; of: number };
export type Match = { type: Omit<PersonalityType, "when">; score: number; reasons: Reason[] };

/** Each extra condition a type asks for makes it more specific, so it wins close calls. */
const SPECIFIC_BONUS = 0.15;

/** How well a team meets one type (0 = not a match; about 1 = first in everything it asks for). */
export function matchScore(t: PersonalityType, ranks: TraitRanks, of: number): number {
  let total = 0;
  for (const c of t.when) {
    const rank = ranks[c.trait];
    if (rank === undefined) return 0;
    const within = Math.max(1, Math.round((c.within * of) / 32));
    const pos = c.end === "top" ? rank : of + 1 - rank;
    if (pos > within) return 0;
    total += (within - pos + 1) / within;
  }
  return (total / t.when.length + SPECIFIC_BONUS * (t.when.length - 1)) * (t.weight ?? 1);
}

/** Up to three reasons: the conditions of the type, then the team's other most extreme ranks. */
function reasonsFor(t: PersonalityType | null, ranks: TraitRanks, of: number): Reason[] {
  const traits: Trait[] = t ? t.when.map((c) => c.trait) : [];
  const extremes = (Object.keys(ranks) as Trait[])
    .filter((k) => !traits.includes(k))
    .sort((a, b) => Math.abs(ranks[b]! - (of + 1) / 2) - Math.abs(ranks[a]! - (of + 1) / 2));
  // A middle-of-the-pack team is best explained by its most middling ranks.
  const middling = [...extremes].reverse();
  return [...traits, ...(t ? extremes : middling)].slice(0, 3).map((k) => ({ trait: k, label: TRAIT_LABEL[k], rank: ranks[k]!, of }));
}

/** The best-matching type (and a second, when it's also a strong match). */
export function personality(ranks: TraitRanks, of: number): { primary: Match; secondary: Match | null } {
  const scored = TYPES.map((t) => ({ t, score: matchScore(t, ranks, of) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const strip = ({ key, label, blurb }: PersonalityType): Match["type"] => ({ key, label, blurb });
  const primary: Match = scored.length
    ? { type: strip(scored[0].t), score: scored[0].score, reasons: reasonsFor(scored[0].t, ranks, of) }
    : { type: FALLBACK, score: 0, reasons: reasonsFor(null, ranks, of) };
  const second = scored[1];
  const secondary = second && second.score >= 0.35 ? { type: strip(second.t), score: second.score, reasons: reasonsFor(second.t, ranks, of) } : null;
  return { primary, secondary };
}
