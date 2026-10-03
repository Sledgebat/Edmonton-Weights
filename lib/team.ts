/**
 * Team scouting pages: one per NHL team, this season only. Reuses the home page's league
 * context (ranks), stat tiles, chance maps, goalie list and recent form, for any team.
 */
import { getDb } from "@/db";
import { SMALL_SAMPLE_GAMES, gamesCount, heatMap, lastN, leagueContext, oddsFor, playerName, sampleNote, seasonGamesOf, statTiles, teamGoalies, type GoalieCard, type HeatMap, type HomeData, type Tile } from "@/lib/home";
import { load, type Loaded } from "@/lib/load";
import { playoffPicture, type PlayoffPicture } from "@/lib/magic";
import { nhl, txt, type StandingsRow } from "@/lib/nhl";
import { teamOf } from "@/lib/oilers";
import { TEAM } from "@/lib/nhl/endpoints";
import { RANKS_PENDING_NOTE } from "@/lib/tone";
import { builtPlayerIds, playerHref } from "@/lib/site";
import { inDepthLeague } from "@/lib/indepth";
import { goalieGames, goalieStarts, isStolen, type GoalieStarts } from "@/lib/stats/goalies";
import { LUCK_CLIP, luckRank, luckVerdict, type TeamLuck } from "@/lib/stats/luck";
import { personality, type Match } from "@/lib/stats/personality";
import { scoringProfile, type ScoringProfile } from "@/lib/stats/scoring";
import { leagueSituations, situationRank, type Record3, type SituationSummary } from "@/lib/stats/situations";
import { SPECIAL, specialRank, type SpecialKey } from "@/lib/stats/special";
import { homeRoadXgf, rollingShare, shooterTable, teamGames, type TeamGame } from "@/lib/stats/team";

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
  /** 5-on-5 shooting % and save %. */
  pdoTiles: Tile[];
  /** False until every team has played (ranks hidden). */
  ranksReady: boolean;
  /** Games played this season (from stored games). */
  gp: number;
  /** Shown from SMALL_SAMPLE_GAMES games; until then a note. */
  personality: { primary: Match; secondary: Match | null } | null;
  luck: { team: TeamLuck; rank: number | null; of: number; verdict: string | null; clip: number } | null;
  situations: { summary: SituationSummary; ranks: Record<SituationKey, { rank: number | null; of: number }> } | null;
  special: { key: SpecialKey; label: string; value: number | null; rank: number | null; of: number; higherIsBetter: boolean | null }[];
  scoring: ScoringProfile | null;
  /** 5-on-5 expected-goals share at home and on the road. */
  venueXgf: { home: number | null; road: number | null };
  goalieStarts: (GoalieStarts & { name: string; href: string })[];
  stolen: { gameId: number; date: string; opponent: string; isHome: boolean; goalie: string; gsax: number; href: string }[];
  heat: { for: HeatMap; against: HeatMap } | null;
  goalies: GoalieCard[];
  recent: TeamGame[];
  trend: { gameId: number; date: string; value: number }[];
  shooters: TeamShooter[];
  updated: { stats: number | null };
};

/** Situations ranked by points % across the league. */
export const SITUATIONS = {
  scoringFirst: "Scoring first",
  allowingFirst: "Allowing the first goal",
  leadingAfter1: "Leading after the 1st",
  tiedAfter1: "Tied after the 1st",
  trailingAfter1: "Trailing after the 1st",
  leadingAfter2: "Leading after the 2nd",
  tiedAfter2: "Tied after the 2nd",
  trailingAfter2: "Trailing after the 2nd",
  oneGoal: "One-goal games",
  home: "At home",
  road: "On the road",
  overtime: "Games decided in overtime",
  shootout: "Games decided in a shootout",
} as const satisfies Partial<Record<keyof SituationSummary, string>>;
export type SituationKey = keyof typeof SITUATIONS;

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

  const empty = { basicTiles: [], advancedTiles: [], pdoTiles: [] };
  const lg = await leagueContext(season);
  const { basicTiles, advancedTiles, pdoTiles } = teamId === null ? empty : statTiles(teamId, season, lg);
  const deep = await inDepthLeague(season);
  const gp = teamId === null ? 0 : gamesCount(teamId, season);
  const enough = gp >= SMALL_SAMPLE_GAMES;
  const ready = lg.ranksReady;

  // Luck: points vs deserved, with a verdict once the sample means something.
  const ownLuck = teamId === null ? undefined : deep.luck.get(teamId);
  const m = teamId === null ? undefined : lg.tableById.get(teamId)?.metrics;
  const lr = teamId === null ? { rank: null, of: 0 } : luckRank(deep.luck, teamId);
  const luck = ownLuck
    ? { team: ownLuck, rank: ready ? lr.rank : null, of: lr.of, verdict: enough && m ? luckVerdict(ownLuck.diff, m.sh5Pct, m.sv5Pct / 100, m.pdo) : null, clip: LUCK_CLIP }
    : null;

  // Game scripts.
  const sit = leagueSituations(season);
  const ownSit = teamId === null ? undefined : sit.get(teamId);
  const situations = ownSit
    ? {
        summary: ownSit.summary,
        ranks: Object.fromEntries(
          (Object.keys(SITUATIONS) as SituationKey[]).map((k) => {
            const r = situationRank(sit, teamId!, (s) => s[k] as Record3);
            return [k, ready ? r : { rank: null, of: r.of }];
          }),
        ) as Record<SituationKey, { rank: number | null; of: number }>,
      }
    : null;

  const special =
    teamId === null
      ? []
      : (Object.keys(SPECIAL) as SpecialKey[]).map((key) => {
          const r = specialRank(deep.special, teamId, key);
          return { key, label: SPECIAL[key].label, value: r.value, rank: ready ? r.rank : null, of: r.of, higherIsBetter: SPECIAL[key].higherIsBetter };
        });

  const traits = teamId === null ? undefined : deep.traits.get(teamId);
  const persona = enough && ready && traits ? personality(traits, deep.of) : null;

  // Goalies: starts, quality starts and stolen games for this team.
  const starts = teamId === null ? [] : goalieStarts(season, teamId);
  const built0 = await builtPlayerIds();
  const goalieStartRows = await Promise.all(
    starts.sort((a, b) => b.starts - a.starts).map(async (g) => ({ ...g, name: await playerName(g.goalieId), href: playerHref(g.goalieId, built0) })),
  );
  const games = new Map(teamId === null ? [] : teamGames(teamId, season).map((g) => [g.gameId, g]));
  const stolen = await Promise.all(
    (teamId === null ? [] : goalieGames(season, { teamId }))
      .filter(isStolen)
      .sort((a, b) => b.gameId - a.gameId)
      .map(async (g) => {
        const game = games.get(g.gameId);
        const opponent = game?.opponent ?? "";
        return {
          gameId: g.gameId,
          date: game?.date ?? "",
          opponent,
          isHome: game?.isHome ?? false,
          goalie: await playerName(g.goalieId),
          gsax: g.gsax,
          // Game reports exist for Oilers games; anything else goes to NHL.com.
          href: abbrev === TEAM || opponent === TEAM ? `/game/${g.gameId}` : `https://www.nhl.com/gamecenter/${g.gameId}`,
        };
      }),
  );

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
    pdoTiles,
    ranksReady: ready,
    gp,
    personality: persona,
    luck,
    situations,
    special,
    scoring: teamId === null ? null : scoringProfile(teamId, season),
    venueXgf: teamId === null ? { home: null, road: null } : homeRoadXgf(teamId, season),
    goalieStarts: goalieStartRows,
    stolen,
    heat: teamId === null ? null : { for: heatMap(teamId, season, "for"), against: heatMap(teamId, season, "against") },
    goalies: teamId === null ? [] : await teamGoalies(abbrev, teamId, season),
    recent: teamId === null ? [] : lastN(teamId, season, 10),
    trend: teamId === null ? [] : rollingShare(teamGames(teamId, season), "xgf5", "xga5", 5),
    shooters,
    updated: { stats: statsUpdated },
  };
}
