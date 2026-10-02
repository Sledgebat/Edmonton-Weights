/**
 * The /players tables: NHL season stats joined with our own shot-based numbers (individual
 * expected goals, high-danger chances, goals saved above expected).
 */
import { gamesCount, sampleNote } from "@/lib/home";
import { load, type Loaded } from "@/lib/load";
import { nhl, txt, type ClubStats } from "@/lib/nhl";
import { previousSeason, TEAM_ID } from "@/lib/nhl/endpoints";
import { onIceTable } from "@/lib/stats/onice";
import { goalieTable, shooterTable } from "@/lib/stats/team";

export type SkaterRow = {
  id: number;
  name: string;
  pos: string;
  gp: number;
  g: number;
  a: number;
  p: number;
  pm: number;
  sog: number;
  shPct: number;
  toi: number;
  ixg: number | null;
  hd: number | null;
  gax: number | null;
  /** 5-on-5 expected-goals share with him on the ice, and on minus off (percentage points). */
  oixgf: number | null;
  relxgf: number | null;
};

export type GoalieRow = {
  id: number;
  name: string;
  gp: number;
  w: number;
  l: number;
  otl: number;
  sv: number;
  gaa: number;
  so: number;
  gsax: number | null;
  xsv: number | null;
};

export type PlayersData = {
  season: number;
  currentSeason: number;
  choice: "this" | "last";
  defaultChoice: "this" | "last";
  note: string | null;
  stats: Loaded<ClubStats>;
  skaters: SkaterRow[];
  goalies: GoalieRow[];
  /** True when our shot database has games for this season. */
  hasAdvanced: boolean;
};

export async function playersData(requested?: string): Promise<PlayersData> {
  const schedule = await load(nhl.schedule);
  const currentSeason = schedule.ok ? schedule.data.currentSeason : 20262027;
  // This season by default; last season stays one click away for comparison.
  const defaultChoice = "this" as const;
  const choice: "this" | "last" = requested === "last" ? "last" : "this";
  const season = choice === "this" ? currentSeason : previousSeason(currentSeason);
  const stats = await load(() => (choice === "this" ? nhl.clubStats() : nhl.clubStatsSeason(season)));

  const shooters = new Map(
    shooterTable(TEAM_ID, season).map((s) => [s.playerId, s]),
  );
  // A goalie traded mid-season has a row per team; we want his Oilers row.
  const goalieAdv = new Map(
    goalieTable(season)
      .filter((g) => g.teamId === TEAM_ID)
      .map((g) => [g.goalieId, g]),
  );
  const hasAdvanced = gamesCount(TEAM_ID, season) > 0;
  const onIce = new Map(onIceTable(season, { teamId: TEAM_ID }).map((o) => [o.playerId, o]));

  const skaters: SkaterRow[] = stats.ok
    ? stats.data.skaters.map((s) => {
        const adv = shooters.get(s.playerId);
        const ixg = hasAdvanced ? (adv?.ixg ?? 0) : null;
        return {
          id: s.playerId,
          name: `${txt(s.firstName)} ${txt(s.lastName)}`,
          pos: s.positionCode,
          gp: s.gamesPlayed,
          g: s.goals,
          a: s.assists,
          p: s.points,
          pm: s.plusMinus,
          sog: s.shots,
          shPct: s.shootingPctg * 100,
          toi: s.avgTimeOnIcePerGame,
          ixg,
          hd: hasAdvanced ? (adv?.hdChances ?? 0) : null,
          gax: ixg === null ? null : s.goals - ixg,
          oixgf: onIce.get(s.playerId)?.xgfPct ?? null,
          relxgf: onIce.get(s.playerId)?.relXgfPct ?? null,
        };
      })
    : [];

  const goalies: GoalieRow[] = stats.ok
    ? stats.data.goalies.map((g) => {
        const adv = goalieAdv.get(g.playerId);
        return {
          id: g.playerId,
          name: `${txt(g.firstName)} ${txt(g.lastName)}`,
          gp: g.gamesPlayed,
          w: g.wins,
          l: g.losses,
          otl: g.overtimeLosses,
          sv: g.savePercentage,
          gaa: g.goalsAgainstAverage,
          so: g.shutouts,
          gsax: adv ? adv.gsax : null,
          xsv: adv ? adv.xSvPct : null,
        };
      })
    : [];

  const note = choice === "this" ? sampleNote(gamesCount(TEAM_ID, season)) : null;

  return {
    season,
    currentSeason,
    choice,
    defaultChoice,
    note,
    stats,
    skaters,
    goalies,
    hasAdvanced,
  };
}
