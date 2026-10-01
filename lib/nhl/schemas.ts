/**
 * Zod schemas for every NHL web-API response the site reads.
 *
 * Written against real responses captured on 2026-09-30 (see fixtures/). Only the fields
 * the site uses are declared; unknown fields are stripped. A required field that disappears
 * or changes type makes parsing fail loudly, and the client keeps serving the last good copy.
 */
import { z } from "zod";

// ---------------------------------------------------------------- shared pieces

/** Localised text: `{ default: "Oilers", fr?: "..." }`. Use `txt()` to read it. */
export const Localized = z.object({ default: z.string() });
export type Localized = z.infer<typeof Localized>;
export const txt = (l: Localized | undefined | null, fallback = ""): string => l?.default ?? fallback;

export const GameState = z.enum(["FUT", "PRE", "LIVE", "CRIT", "FINAL", "OFF"]);
export type GameState = z.infer<typeof GameState>;

export const PeriodType = z.enum(["REG", "OT", "SO"]);

export const PeriodDescriptor = z.object({
  number: z.number().int(),
  periodType: PeriodType,
  maxRegulationPeriods: z.number().int().optional(),
});
export type PeriodDescriptor = z.infer<typeof PeriodDescriptor>;

export const Clock = z.object({
  timeRemaining: z.string(),
  secondsRemaining: z.number(),
  running: z.boolean(),
  inIntermission: z.boolean(),
});
export type Clock = z.infer<typeof Clock>;

const TvBroadcast = z.object({ network: z.string(), countryCode: z.string().optional(), market: z.string().optional() });

/** A team inside a game (schedule, score, gamecenter). */
export const GameTeam = z.object({
  id: z.number().int(),
  abbrev: z.string(),
  commonName: Localized.optional(),
  name: Localized.optional(), // /score/now uses `name` instead of `commonName`
  placeName: Localized.optional(),
  logo: z.string().optional(),
  darkLogo: z.string().optional(),
  score: z.number().int().optional(),
  sog: z.number().int().optional(),
  record: z.string().optional(),
});
export type GameTeam = z.infer<typeof GameTeam>;

/** Fields shared by schedule, score and gamecenter game objects. */
const GameCore = {
  id: z.number().int(),
  season: z.number().int(),
  gameType: z.number().int(),
  gameDate: z.string(),
  startTimeUTC: z.string(),
  venue: Localized.optional(),
  venueTimezone: z.string().optional(),
  gameState: GameState,
  gameScheduleState: z.string().optional(),
  tvBroadcasts: z.array(TvBroadcast).optional(),
  awayTeam: GameTeam,
  homeTeam: GameTeam,
  periodDescriptor: PeriodDescriptor.optional(),
  gameOutcome: z.object({ lastPeriodType: PeriodType, otPeriods: z.number().int().optional() }).optional(),
};

// ---------------------------------------------------------------- schedule

const NameStub = z.object({ playerId: z.number().int(), firstInitial: Localized.optional(), lastName: Localized });

export const ScheduleGame = z.object({
  ...GameCore,
  neutralSite: z.boolean().optional(),
  winningGoalie: NameStub.optional(),
  winningGoalScorer: NameStub.optional(),
  seriesStatus: z
    .object({
      round: z.number().int().optional(),
      seriesTitle: z.string().optional(),
      topSeedTeamAbbrev: z.string().optional(),
      topSeedWins: z.number().int().optional(),
      bottomSeedTeamAbbrev: z.string().optional(),
      bottomSeedWins: z.number().int().optional(),
      gameNumberOfSeries: z.number().int().optional(),
    })
    .optional(),
});
export type ScheduleGame = z.infer<typeof ScheduleGame>;

export const ClubSchedule = z.object({
  previousSeason: z.number().int().optional(),
  currentSeason: z.number().int(),
  nextSeason: z.number().int().optional(),
  clubTimezone: z.string().optional(),
  games: z.array(ScheduleGame),
});
export type ClubSchedule = z.infer<typeof ClubSchedule>;

// ---------------------------------------------------------------- standings

export const StandingsRow = z.object({
  seasonId: z.number().int(),
  date: z.string(),
  teamAbbrev: Localized,
  teamName: Localized,
  teamCommonName: Localized,
  placeName: Localized.optional(),
  teamLogo: z.string(),
  conferenceAbbrev: z.string(),
  conferenceName: z.string(),
  divisionAbbrev: z.string(),
  divisionName: z.string(),
  conferenceSequence: z.number().int(),
  divisionSequence: z.number().int(),
  leagueSequence: z.number().int(),
  wildcardSequence: z.number().int(),
  gamesPlayed: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  otLosses: z.number().int(),
  points: z.number().int(),
  /** Absent until a team has played a game. */
  pointPctg: z.number().optional(),
  regulationWins: z.number().int(),
  regulationPlusOtWins: z.number().int(),
  goalFor: z.number().int(),
  goalAgainst: z.number().int(),
  goalDifferential: z.number().int(),
  l10Wins: z.number().int(),
  l10Losses: z.number().int(),
  l10OtLosses: z.number().int(),
  streakCode: z.string().optional(),
  streakCount: z.number().int().optional(),
  homeWins: z.number().int(),
  homeLosses: z.number().int(),
  homeOtLosses: z.number().int(),
  roadWins: z.number().int(),
  roadLosses: z.number().int(),
  roadOtLosses: z.number().int(),
});
export type StandingsRow = z.infer<typeof StandingsRow>;

export const Standings = z.object({
  wildCardIndicator: z.boolean(),
  standingsDateTimeUtc: z.string().optional(),
  standings: z.array(StandingsRow),
});
export type Standings = z.infer<typeof Standings>;

// ---------------------------------------------------------------- scoreboard

export const ScoreGame = z.object({
  ...GameCore,
  clock: Clock.optional(),
  period: z.number().int().optional(),
});
export type ScoreGame = z.infer<typeof ScoreGame>;

export const Scoreboard = z.object({
  currentDate: z.string(),
  prevDate: z.string().optional(),
  nextDate: z.string().optional(),
  games: z.array(ScoreGame),
});
export type Scoreboard = z.infer<typeof Scoreboard>;

// ---------------------------------------------------------------- gamecenter: landing

const GoalSummary = z.object({
  eventId: z.number().int().optional(),
  playerId: z.number().int(),
  firstName: Localized.optional(),
  lastName: Localized,
  name: Localized.optional(),
  teamAbbrev: Localized,
  headshot: z.string().optional(),
  strength: z.string().optional(),
  timeInPeriod: z.string(),
  shotType: z.string().optional(),
  goalModifier: z.string().optional(),
  goalsToDate: z.number().int().optional(),
  awayScore: z.number().int(),
  homeScore: z.number().int(),
  isHome: z.boolean().optional(),
  assists: z.array(
    z.object({
      playerId: z.number().int(),
      firstName: Localized.optional(),
      lastName: Localized,
      name: Localized.optional(),
      assistsToDate: z.number().int().optional(),
    }),
  ),
});
export type GoalSummary = z.infer<typeof GoalSummary>;

const PenaltySummary = z.object({
  timeInPeriod: z.string(),
  type: z.string(),
  duration: z.number(),
  descKey: z.string(),
  teamAbbrev: Localized,
  committedByPlayer: z
    .object({ firstName: Localized.optional(), lastName: Localized, sweaterNumber: z.number().int().optional() })
    .optional(),
  drawnBy: z
    .object({ firstName: Localized.optional(), lastName: Localized, sweaterNumber: z.number().int().optional() })
    .optional(),
  servedBy: Localized.optional(),
});

export const ThreeStar = z.object({
  star: z.number().int(),
  playerId: z.number().int(),
  teamAbbrev: z.string(),
  headshot: z.string().optional(),
  name: Localized,
  sweaterNo: z.number().int().optional(),
  position: z.string(),
  goals: z.number().int().optional(),
  assists: z.number().int().optional(),
  points: z.number().int().optional(),
  goalsAgainstAverage: z.number().optional(),
  savePctg: z.number().optional(),
});

export const GameLanding = z.object({
  ...GameCore,
  venueLocation: Localized.optional(),
  clock: Clock.optional(),
  regPeriods: z.number().int().optional(),
  summary: z
    .object({
      scoring: z.array(z.object({ periodDescriptor: PeriodDescriptor, goals: z.array(GoalSummary) })).optional(),
      threeStars: z.array(ThreeStar).optional(),
      penalties: z
        .array(z.object({ periodDescriptor: PeriodDescriptor, penalties: z.array(PenaltySummary) }))
        .optional(),
    })
    .optional(),
  /** Pre-game only. Kept loose: the hub reads a handful of fields and validates them itself in Phase 5. */
  matchup: z.record(z.string(), z.unknown()).optional(),
});
export type GameLanding = z.infer<typeof GameLanding>;

// ---------------------------------------------------------------- gamecenter: play-by-play

export const PlayDetails = z.object({
  eventOwnerTeamId: z.number().int().optional(),
  xCoord: z.number().optional(),
  yCoord: z.number().optional(),
  zoneCode: z.string().optional(),
  shotType: z.string().optional(),
  reason: z.string().optional(),
  shootingPlayerId: z.number().int().optional(),
  scoringPlayerId: z.number().int().optional(),
  scoringPlayerTotal: z.number().int().optional(),
  assist1PlayerId: z.number().int().optional(),
  assist1PlayerTotal: z.number().int().optional(),
  assist2PlayerId: z.number().int().optional(),
  assist2PlayerTotal: z.number().int().optional(),
  goalieInNetId: z.number().int().optional(),
  blockingPlayerId: z.number().int().optional(),
  hittingPlayerId: z.number().int().optional(),
  hitteePlayerId: z.number().int().optional(),
  winningPlayerId: z.number().int().optional(),
  losingPlayerId: z.number().int().optional(),
  playerId: z.number().int().optional(),
  committedByPlayerId: z.number().int().optional(),
  drawnByPlayerId: z.number().int().optional(),
  servedByPlayerId: z.number().int().optional(),
  typeCode: z.string().optional(), // penalty class: MIN, MAJ, ...
  descKey: z.string().optional(),
  duration: z.number().optional(),
  awayScore: z.number().int().optional(),
  homeScore: z.number().int().optional(),
  awaySOG: z.number().int().optional(),
  homeSOG: z.number().int().optional(),
});
export type PlayDetails = z.infer<typeof PlayDetails>;

export const Play = z.object({
  eventId: z.number().int(),
  periodDescriptor: PeriodDescriptor,
  timeInPeriod: z.string(),
  timeRemaining: z.string(),
  situationCode: z.string().optional(),
  homeTeamDefendingSide: z.string().optional(),
  typeCode: z.number().int(),
  typeDescKey: z.string(),
  sortOrder: z.number().int(),
  details: PlayDetails.optional(),
});
export type Play = z.infer<typeof Play>;

export const RosterSpot = z.object({
  teamId: z.number().int(),
  playerId: z.number().int(),
  firstName: Localized,
  lastName: Localized,
  sweaterNumber: z.number().int().optional(),
  positionCode: z.string(),
  headshot: z.string().optional(),
});
export type RosterSpot = z.infer<typeof RosterSpot>;

export const PlayByPlay = z.object({
  ...GameCore,
  clock: Clock.optional(),
  displayPeriod: z.number().int().optional(),
  plays: z.array(Play),
  rosterSpots: z.array(RosterSpot),
});
export type PlayByPlay = z.infer<typeof PlayByPlay>;

// ---------------------------------------------------------------- gamecenter: boxscore

export const BoxSkater = z.object({
  playerId: z.number().int(),
  sweaterNumber: z.number().int().optional(),
  name: Localized,
  position: z.string(),
  goals: z.number().int(),
  assists: z.number().int(),
  points: z.number().int(),
  plusMinus: z.number().int(),
  pim: z.number().int(),
  hits: z.number().int().optional(),
  powerPlayGoals: z.number().int().optional(),
  sog: z.number().int(),
  faceoffWinningPctg: z.number().optional(),
  toi: z.string(),
  blockedShots: z.number().int().optional(),
  shifts: z.number().int().optional(),
  giveaways: z.number().int().optional(),
  takeaways: z.number().int().optional(),
});
export type BoxSkater = z.infer<typeof BoxSkater>;

export const BoxGoalie = z.object({
  playerId: z.number().int(),
  sweaterNumber: z.number().int().optional(),
  name: Localized,
  position: z.string(),
  toi: z.string(),
  starter: z.boolean().optional(),
  decision: z.string().optional(),
  shotsAgainst: z.number().int(),
  saves: z.number().int(),
  goalsAgainst: z.number().int(),
  savePctg: z.number().optional(),
  evenStrengthShotsAgainst: z.string().optional(),
  powerPlayShotsAgainst: z.string().optional(),
  shorthandedShotsAgainst: z.string().optional(),
  pim: z.number().int().optional(),
});
export type BoxGoalie = z.infer<typeof BoxGoalie>;

const TeamBox = z.object({ forwards: z.array(BoxSkater), defense: z.array(BoxSkater), goalies: z.array(BoxGoalie) });

export const Boxscore = z.object({
  ...GameCore,
  clock: Clock.optional(),
  regPeriods: z.number().int().optional(),
  /** Absent before puck drop. */
  playerByGameStats: z.object({ awayTeam: TeamBox, homeTeam: TeamBox }).optional(),
});
export type Boxscore = z.infer<typeof Boxscore>;

// ---------------------------------------------------------------- roster and club stats

export const RosterPlayer = z.object({
  id: z.number().int(),
  headshot: z.string().optional(),
  firstName: Localized,
  lastName: Localized,
  sweaterNumber: z.number().int().optional(),
  positionCode: z.string(),
  shootsCatches: z.string().optional(),
  heightInInches: z.number().optional(),
  heightInCentimeters: z.number().optional(),
  weightInPounds: z.number().optional(),
  weightInKilograms: z.number().optional(),
  birthDate: z.string().optional(),
  birthCity: Localized.optional(),
  birthStateProvince: Localized.optional(),
  birthCountry: z.string().optional(),
});
export type RosterPlayer = z.infer<typeof RosterPlayer>;

export const Roster = z.object({
  forwards: z.array(RosterPlayer),
  defensemen: z.array(RosterPlayer),
  goalies: z.array(RosterPlayer),
});
export type Roster = z.infer<typeof Roster>;

/** Prospects use the same player shape as the roster. */
export const Prospects = Roster;
export type Prospects = Roster;

export const ClubSkaterStats = z.object({
  playerId: z.number().int(),
  headshot: z.string().optional(),
  firstName: Localized,
  lastName: Localized,
  positionCode: z.string(),
  gamesPlayed: z.number().int(),
  goals: z.number().int(),
  assists: z.number().int(),
  points: z.number().int(),
  plusMinus: z.number().int(),
  penaltyMinutes: z.number().int(),
  powerPlayGoals: z.number().int(),
  shorthandedGoals: z.number().int().optional(),
  gameWinningGoals: z.number().int().optional(),
  shots: z.number().int(),
  shootingPctg: z.number(),
  avgTimeOnIcePerGame: z.number(),
});
export type ClubSkaterStats = z.infer<typeof ClubSkaterStats>;

export const ClubGoalieStats = z.object({
  playerId: z.number().int(),
  headshot: z.string().optional(),
  firstName: Localized,
  lastName: Localized,
  gamesPlayed: z.number().int(),
  gamesStarted: z.number().int().optional(),
  wins: z.number().int(),
  losses: z.number().int(),
  overtimeLosses: z.number().int(),
  goalsAgainstAverage: z.number(),
  savePercentage: z.number(),
  shotsAgainst: z.number().int(),
  saves: z.number().int(),
  goalsAgainst: z.number().int(),
  shutouts: z.number().int(),
});
export type ClubGoalieStats = z.infer<typeof ClubGoalieStats>;

export const ClubStats = z.object({
  season: z.string(), // "20262027"
  gameType: z.number().int(),
  skaters: z.array(ClubSkaterStats),
  goalies: z.array(ClubGoalieStats),
});
export type ClubStats = z.infer<typeof ClubStats>;

// ---------------------------------------------------------------- players

/** Skater and goalie stat lines share one loose shape; goalie-only fields are optional. */
const StatLine = z.object({
  gamesPlayed: z.number().int().optional(),
  goals: z.number().int().optional(),
  assists: z.number().int().optional(),
  points: z.number().int().optional(),
  plusMinus: z.number().int().optional(),
  pim: z.number().int().optional(),
  shots: z.number().int().optional(),
  shootingPctg: z.number().optional(),
  powerPlayGoals: z.number().int().optional(),
  powerPlayPoints: z.number().int().optional(),
  shorthandedGoals: z.number().int().optional(),
  gameWinningGoals: z.number().int().optional(),
  otGoals: z.number().int().optional(),
  avgToi: z.string().optional(),
  faceoffWinningPctg: z.number().optional(),
  // goalies
  gamesStarted: z.number().int().optional(),
  wins: z.number().int().optional(),
  losses: z.number().int().optional(),
  otLosses: z.number().int().optional(),
  shutouts: z.number().int().optional(),
  goalsAgainst: z.number().int().optional(),
  goalsAgainstAvg: z.number().optional(),
  savePctg: z.number().optional(),
  shotsAgainst: z.number().int().optional(),
  timeOnIce: z.string().optional(),
});
export type StatLine = z.infer<typeof StatLine>;

export const SeasonTotal = StatLine.extend({
  season: z.number().int(),
  gameTypeId: z.number().int(),
  leagueAbbrev: z.string(),
  sequence: z.number().int().optional(),
  teamName: Localized.optional(),
  teamCommonName: Localized.optional(),
});
export type SeasonTotal = z.infer<typeof SeasonTotal>;

export const PlayerLanding = z.object({
  playerId: z.number().int(),
  isActive: z.boolean(),
  currentTeamId: z.number().int().optional(),
  currentTeamAbbrev: z.string().optional(),
  firstName: Localized,
  lastName: Localized,
  sweaterNumber: z.number().int().optional(),
  position: z.string(),
  headshot: z.string().optional(),
  heroImage: z.string().optional(),
  heightInInches: z.number().optional(),
  heightInCentimeters: z.number().optional(),
  weightInPounds: z.number().optional(),
  weightInKilograms: z.number().optional(),
  birthDate: z.string().optional(),
  birthCity: Localized.optional(),
  birthStateProvince: Localized.optional(),
  birthCountry: z.string().optional(),
  shootsCatches: z.string().optional(),
  draftDetails: z
    .object({
      year: z.number().int(),
      teamAbbrev: z.string(),
      round: z.number().int(),
      pickInRound: z.number().int(),
      overallPick: z.number().int(),
    })
    .optional(),
  featuredStats: z
    .object({
      season: z.number().int(),
      regularSeason: z.object({ subSeason: StatLine.optional(), career: StatLine.optional() }).optional(),
      playoffs: z.object({ subSeason: StatLine.optional(), career: StatLine.optional() }).optional(),
    })
    .optional(),
  careerTotals: z.object({ regularSeason: StatLine.optional(), playoffs: StatLine.optional() }).optional(),
  seasonTotals: z.array(SeasonTotal).optional(),
  last5Games: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type PlayerLanding = z.infer<typeof PlayerLanding>;

export const GameLogEntry = z.object({
  gameId: z.number().int(),
  teamAbbrev: z.string(),
  homeRoadFlag: z.enum(["H", "R"]),
  gameDate: z.string(),
  opponentAbbrev: z.string(),
  opponentCommonName: Localized.optional(),
  toi: z.string().optional(),
  goals: z.number().int().optional(),
  assists: z.number().int().optional(),
  points: z.number().int().optional(),
  plusMinus: z.number().int().optional(),
  pim: z.number().int().optional(),
  shots: z.number().int().optional(),
  shifts: z.number().int().optional(),
  powerPlayGoals: z.number().int().optional(),
  powerPlayPoints: z.number().int().optional(),
  // goalies
  gamesStarted: z.number().int().optional(),
  decision: z.string().optional(),
  shotsAgainst: z.number().int().optional(),
  goalsAgainst: z.number().int().optional(),
  savePctg: z.number().optional(),
  shutouts: z.number().int().optional(),
});
export type GameLogEntry = z.infer<typeof GameLogEntry>;

export const PlayerGameLog = z.object({
  seasonId: z.number().int(),
  gameTypeId: z.number().int(),
  playerStatsSeasons: z.array(z.object({ season: z.number().int(), gameTypes: z.array(z.number().int()) })).optional(),
  gameLog: z.array(GameLogEntry),
});
export type PlayerGameLog = z.infer<typeof PlayerGameLog>;

// ---------------------------------------------------------------- stats REST: team summary

export const TeamSummaryRow = z.object({
  teamId: z.number().int(),
  teamFullName: z.string(),
  seasonId: z.number().int(),
  gamesPlayed: z.number().int(),
  wins: z.number().int().nullable().optional(),
  losses: z.number().int().nullable().optional(),
  otLosses: z.number().int().nullable().optional(),
  points: z.number().int().nullable().optional(),
  pointPct: z.number().nullable().optional(),
  goalsFor: z.number().int().nullable().optional(),
  goalsAgainst: z.number().int().nullable().optional(),
  goalsForPerGame: z.number().nullable().optional(),
  goalsAgainstPerGame: z.number().nullable().optional(),
  shotsForPerGame: z.number().nullable().optional(),
  shotsAgainstPerGame: z.number().nullable().optional(),
  powerPlayPct: z.number().nullable().optional(),
  penaltyKillPct: z.number().nullable().optional(),
  powerPlayNetPct: z.number().nullable().optional(),
  penaltyKillNetPct: z.number().nullable().optional(),
  faceoffWinPct: z.number().nullable().optional(),
});
export type TeamSummaryRow = z.infer<typeof TeamSummaryRow>;

export const TeamSummary = z.object({ data: z.array(TeamSummaryRow), total: z.number().int().optional() });
export type TeamSummary = z.infer<typeof TeamSummary>;

// ---------------------------------------------------------------- NHL EDGE (tracking)

/**
 * EDGE values come as `{ imperial, metric, rank, leagueAvg }` or `{ value, rank }`. Declared
 * loosely so a new field doesn't break the site; the fields the pages read are typed.
 */
const EdgeAvg = z.union([z.number(), z.object({ imperial: z.number().optional(), metric: z.number().optional(), value: z.number().optional() }).loose()]);
export const EdgeValue = z
  .object({
    value: z.number().nullable().optional(),
    imperial: z.number().nullable().optional(),
    metric: z.number().nullable().optional(),
    rank: z.number().int().nullable().optional(),
    leagueAvg: EdgeAvg.nullable().optional(),
  })
  .loose();
export type EdgeValue = z.infer<typeof EdgeValue>;

export const EdgeTeam = z
  .object({
    team: z.object({ id: z.number().int(), abbrev: z.string(), commonName: Localized.optional() }).loose(),
    shotSpeed: z.object({ shotAttemptsOver90: EdgeValue.optional(), topShotSpeed: EdgeValue.optional() }).loose().optional(),
    skatingSpeed: z
      .object({ burstsOver22: EdgeValue.optional(), burstsOver20: EdgeValue.optional(), speedMax: EdgeValue.optional() })
      .loose()
      .optional(),
    distanceSkated: z.object({ total: EdgeValue.optional() }).loose().optional(),
    sogSummary: z
      .array(
        z
          .object({
            locationCode: z.string(),
            shots: z.number().optional(),
            shotsRank: z.number().optional(),
            shootingPctg: z.number().optional(),
            shootingPctgRank: z.number().optional(),
            goals: z.number().optional(),
            goalsRank: z.number().optional(),
          })
          .loose(),
      )
      .optional(),
    sogDetails: z.array(z.object({ area: z.string(), shots: z.number().optional(), shotsRank: z.number().optional() }).loose()).optional(),
    zoneTimeDetails: z
      .object({
        offensiveZonePctg: z.number().optional(),
        offensiveZoneRank: z.number().optional(),
        offensiveZoneLeagueAvg: z.number().optional(),
        neutralZonePctg: z.number().optional(),
        defensiveZonePctg: z.number().optional(),
        defensiveZoneRank: z.number().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();
export type EdgeTeam = z.infer<typeof EdgeTeam>;

/** Skater and goalie EDGE pages: shapes confirmed from captured fixtures in step 3. */
export const EdgePlayer = z.record(z.string(), z.unknown());
export type EdgePlayer = z.infer<typeof EdgePlayer>;
