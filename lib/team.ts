/**
 * Team scouting pages: one per NHL team, this season only. Reuses the home page's league
 * context (ranks), stat tiles, chance maps, goalie list and recent form, for any team.
 */
import { getDb } from "@/db";
import { gamesCount, heatMap, lastN, leagueContext, oddsFor, playerName, sampleNote, seasonGamesOf, statTiles, teamGoalies, type GoalieCard, type HeatMap, type HomeData, type Tile } from "@/lib/home";
import { load, type Loaded } from "@/lib/load";
import { playoffPicture, type PlayoffPicture } from "@/lib/magic";
import { nhl, txt, type StandingsRow } from "@/lib/nhl";
import { teamOf } from "@/lib/oilers";
import { RANKS_PENDING_NOTE } from "@/lib/tone";
import { builtPlayerIds, playerHref } from "@/lib/site";
import { rollingShare, shooterTable, teamGames, type TeamGame } from "@/lib/stats/team";

/** Every team in the current standings, for building one page each. */
export async function teamAbbrevs(): Promise<string[]> {
  const standings = await load(nhl.standings);
  return standings.ok ? standings.data.standings.map(teamOf).sort() : [];
}

/** The NHL's team id for an abbreviation, from the games we've stored (most recent first). */
export function teamIdOf(abbrev: string): number | null {
  const row = getDb()
    .$client.prepare(
      `SELECT id FROM (
         SELECT home_id id, home_abbrev abbrev, game_date d FROM stats_games
         UNION ALL SELECT away_id, away_abbrev, game_date FROM stats_games
       ) WHERE abbrev = ? ORDER BY d DESC LIMIT 1`,
    )
    .get(abbrev) as { id: number } | undefined;
  return row?.id ?? null;
}

export type TeamShooter = { id: number; name: string; href: string; pos: string | null; gp: number | null; goals: number; points: number | null; shots: number; ixg: number; hd: number };

export type TeamPageData = {
  abbrev: string;
  teamId: number | null;
  name: string;
  shortName: string;
  season: number;
  seasonNote: string | null;
  /** Set until every team has played, while league ranks are hidden. */
  ranksNote: string | null;
  standings: Loaded<{ standings: StandingsRow[] }>;
  row: StandingsRow | null;
  picture: PlayoffPicture | null;
  odds: HomeData["odds"];
  basicTiles: Tile[];
  advancedTiles: Tile[];
  heat: { for: HeatMap; against: HeatMap } | null;
  goalies: GoalieCard[];
  recent: TeamGame[];
  trend: { gameId: number; date: string; value: number }[];
  shooters: TeamShooter[];
  updated: { stats: number | null };
};

/** How many players the expected-goals leaders list shows. */
const TOP_SHOOTERS = 10;

export async function teamPageData(abbrev: string): Promise<TeamPageData> {
  const [schedule, standings, clubStats] = await Promise.all([load(nhl.schedule), load(nhl.standings), load(() => nhl.clubStats(abbrev))]);
  // Same season as the rest of the site: the current one, this season only.
  const season = schedule.ok ? schedule.data.currentSeason : 20262027;
  const rows = standings.ok ? standings.data.standings : [];
  const row = rows.find((r) => teamOf(r) === abbrev) ?? null;
  const teamId = teamIdOf(abbrev);
  const name = row ? txt(row.teamName) : abbrev;
  const shortName = row ? txt(row.teamCommonName, abbrev) : abbrev;

  const empty = { basicTiles: [], advancedTiles: [] };
  const lg = await leagueContext(season);
  const { basicTiles, advancedTiles } = teamId === null ? empty : statTiles(teamId, season, lg);

  const cs = clubStats.ok ? clubStats.data : undefined;
  const built = await builtPlayerIds();
  const shooters: TeamShooter[] =
    teamId === null
      ? []
      : await Promise.all(
          shooterTable(teamId, season)
            .slice(0, TOP_SHOOTERS)
            .map(async (s) => {
              const c = cs?.skaters.find((p) => p.playerId === s.playerId);
              return {
                id: s.playerId,
                name: await playerName(s.playerId, cs),
                href: playerHref(s.playerId, built),
                pos: c?.positionCode ?? null,
                gp: c?.gamesPlayed ?? null,
                goals: s.goals,
                points: c?.points ?? null,
                shots: s.shots,
                ixg: s.ixg,
                hd: s.hdChances,
              };
            }),
        );

  const statsUpdated = (getDb().$client.prepare(`SELECT MAX(ingested_at) t FROM stats_games`).get() as { t: number | null }).t;

  return {
    abbrev,
    teamId,
    name,
    shortName,
    season,
    seasonNote: sampleNote(teamId === null ? 0 : gamesCount(teamId, season)),
    ranksNote: lg.ranksReady ? null : RANKS_PENDING_NOTE,
    standings,
    row,
    picture: rows.length ? playoffPicture(rows, abbrev, seasonGamesOf(schedule.ok ? schedule.data.games : [])) : null,
    odds: oddsFor(season, abbrev),
    basicTiles,
    advancedTiles,
    heat: teamId === null ? null : { for: heatMap(teamId, season, "for"), against: heatMap(teamId, season, "against") },
    goalies: teamId === null ? [] : await teamGoalies(abbrev, teamId, season),
    recent: teamId === null ? [] : lastN(teamId, season, 10),
    trend: teamId === null ? [] : rollingShare(teamGames(teamId, season), "xgf5", "xga5", 5),
    shooters,
    updated: { stats: statsUpdated },
  };
}
