/**
 * Shooting vs career: each Oilers skater's shooting % this season against his NHL career before
 * it, to see who's running hot and who's due.
 *
 *   Career        NHL regular seasons before this one (all teams). Fewer than 50 career shots
 *                 and there's no fair baseline, so the player isn't ranked.
 *   Goals vs      this season's goals minus what his career rate would give on the same shots
 *   career rate   (shots × career shooting %). Unlike a raw percentage gap, this weights by how
 *                 much a player shoots, so one goal on three shots doesn't top the list.
 */
import { gamesCount, sampleNote } from "@/lib/home";
import { load } from "@/lib/load";
import { nhl, txt, type SeasonTotal } from "@/lib/nhl";
import { TEAM_ID } from "@/lib/nhl/endpoints";

/** Career shots below this and there's no fair baseline to compare with. */
export const MIN_CAREER_SHOTS = 50;

export type ShootingSeason = { season: number; goals: number; shots: number; pct: number | null; current: boolean };

export type Shooter = {
  id: number;
  name: string;
  pos: string;
  gp: number;
  goals: number;
  shots: number;
  /** This season, 0–100 (null before a shot). */
  pct: number | null;
  careerGoals: number;
  careerShots: number;
  /** Career before this season, 0–100 (null under MIN_CAREER_SHOTS). */
  careerPct: number | null;
  /** This season's goals minus shots × career rate (null without a baseline). */
  vsCareer: number | null;
  /** Every NHL regular season, oldest first, this one last. */
  seasons: ShootingSeason[];
};

export type ShootingData = { season: number; note: string | null; shooters: Shooter[] };

const pctOf = (goals: number, shots: number) => (shots > 0 ? (100 * goals) / shots : null);

/** NHL regular seasons from a player's career totals, combining split seasons (traded mid-year). */
export function nhlSeasons(totals: SeasonTotal[]): Map<number, { goals: number; shots: number }> {
  const out = new Map<number, { goals: number; shots: number }>();
  for (const s of totals) {
    if (s.leagueAbbrev !== "NHL" || s.gameTypeId !== 2) continue;
    const t = out.get(s.season) ?? { goals: 0, shots: 0 };
    t.goals += s.goals ?? 0;
    t.shots += s.shots ?? 0;
    out.set(s.season, t);
  }
  return out;
}

/** One player's line, from this season's numbers and his career season totals. */
export function shooterLine(
  p: { id: number; name: string; pos: string; gp: number; goals: number; shots: number },
  totals: SeasonTotal[],
  season: number,
): Shooter {
  const past = [...nhlSeasons(totals)].filter(([s]) => s < season).sort((a, b) => a[0] - b[0]);
  const careerGoals = past.reduce((n, [, t]) => n + t.goals, 0);
  const careerShots = past.reduce((n, [, t]) => n + t.shots, 0);
  const careerPct = careerShots >= MIN_CAREER_SHOTS ? pctOf(careerGoals, careerShots) : null;
  const seasons: ShootingSeason[] = past.map(([s, t]) => ({ season: s, goals: t.goals, shots: t.shots, pct: pctOf(t.goals, t.shots), current: false }));
  if (p.shots > 0) seasons.push({ season, goals: p.goals, shots: p.shots, pct: pctOf(p.goals, p.shots), current: true });
  return {
    ...p,
    pct: pctOf(p.goals, p.shots),
    careerGoals,
    careerShots,
    careerPct,
    vsCareer: careerPct === null ? null : p.goals - (p.shots * careerPct) / 100,
    seasons,
  };
}

/** Every Oilers skater who's played this season, most above his career rate first. */
export async function shootingData(): Promise<ShootingData> {
  const [schedule, stats] = await Promise.all([load(nhl.schedule), load(nhl.clubStats)]);
  const season = schedule.ok ? schedule.data.currentSeason : 20262027;
  const skaters = stats.ok ? stats.data.skaters.filter((s) => s.gamesPlayed > 0) : [];
  const shooters = await Promise.all(
    skaters.map(async (s) => {
      const landing = await load(() => nhl.player(s.playerId));
      return shooterLine(
        { id: s.playerId, name: `${txt(s.firstName)} ${txt(s.lastName)}`, pos: s.positionCode, gp: s.gamesPlayed, goals: s.goals, shots: s.shots },
        landing.ok ? (landing.data.seasonTotals ?? []) : [],
        season,
      );
    }),
  );
  shooters.sort((a, b) => (b.vsCareer ?? -Infinity) - (a.vsCareer ?? -Infinity) || b.shots - a.shots);
  return { season, note: sampleNote(gamesCount(TEAM_ID, season)), shooters };
}

/** The three furthest above and below their career rate (players with a baseline and a shot this season). */
export function hotAndCold(shooters: Shooter[], n = 3): { hot: Shooter[]; cold: Shooter[] } {
  const ranked = shooters.filter((s) => s.vsCareer !== null && s.shots > 0);
  return {
    hot: ranked.filter((s) => s.vsCareer! > 0).sort((a, b) => b.vsCareer! - a.vsCareer!).slice(0, n),
    cold: ranked.filter((s) => s.vsCareer! < 0).sort((a, b) => a.vsCareer! - b.vsCareer!).slice(0, n),
  };
}
