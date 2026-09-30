/**
 * Pure replay logic: given a finished game's final play-by-play, landing and boxscore,
 * work out what those three responses would have looked like N real seconds into a replay.
 *
 * The replay runs a short pre-game, then each period at `speed`x game-clock speed with a short
 * intermission between periods, then holds the final state. Scores, shots, the clock, the goal
 * summary and box-score counting stats are rebuilt from the plays visible so far. Time on ice
 * is scaled from the final values and plus/minus stays at 0 until the final (they can't be
 * rebuilt from events), which is fine for testing the hub.
 */
import type { BoxGoalie, BoxSkater, Boxscore, GameLanding, GameState, GameTeam, Play, PlayByPlay } from "./schemas";

export type ReplayConfig = {
  speed: number;
  pregameSeconds: number;
  intermissionSeconds: number;
};
export const DEFAULT_REPLAY: ReplayConfig = { speed: 10, pregameSeconds: 30, intermissionSeconds: 15 };

export type ReplaySource = { pbp: PlayByPlay; landing: GameLanding; boxscore: Boxscore };

const REG_LEN = 1200;
const SO_STEP = 10; // game seconds between shootout attempts

export const toSeconds = (mmss: string) => {
  const [m, s] = mmss.split(":").map(Number);
  return m * 60 + s;
};
const toClock = (secs: number) => {
  const s = Math.max(0, Math.round(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

type PeriodInfo = { number: number; type: "REG" | "OT" | "SO"; length: number; fullLength: number };

/** Period structure of the game: REG x3, then OT/SO as played. The last period ends at game-end. */
export function periodsOf(pbp: PlayByPlay): PeriodInfo[] {
  const byNumber = new Map<number, Play["periodDescriptor"]>();
  for (const p of pbp.plays) byNumber.set(p.periodDescriptor.number, p.periodDescriptor);
  const numbers = [...byNumber.keys()].sort((a, b) => a - b);
  const playoff = pbp.gameType === 3;
  const soCount = pbp.plays.filter((p) => p.periodDescriptor.periodType === "SO" && isShotEvent(p)).length;

  const periods = numbers.map((n) => {
    const type = byNumber.get(n)!.periodType;
    const fullLength = type === "REG" ? REG_LEN : type === "OT" ? (playoff ? REG_LEN : 300) : (soCount + 1) * SO_STEP;
    return { number: n, type, length: fullLength, fullLength };
  });

  const end = pbp.plays.find((p) => p.typeDescKey === "game-end");
  const last = periods.at(-1);
  if (end && last && last.type !== "SO") {
    const t = toSeconds(end.timeInPeriod);
    if (t > 0) last.length = t;
  }
  return periods;
}

const isShotEvent = (p: Play) => p.typeDescKey === "goal" || p.typeDescKey === "shot-on-goal" || p.typeDescKey === "missed-shot";

/** Seconds into the period at which a play happened (shootout attempts are spaced out). */
function playSecond(pbp: PlayByPlay): Map<number, number> {
  const out = new Map<number, number>();
  let so = 0;
  for (const p of [...pbp.plays].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (p.periodDescriptor.periodType === "SO") {
      out.set(p.eventId, isShotEvent(p) ? ++so * SO_STEP : p.typeDescKey === "period-start" ? 0 : (so + 1) * SO_STEP);
    } else {
      out.set(p.eventId, toSeconds(p.timeInPeriod));
    }
  }
  return out;
}

export type ReplayMoment = {
  state: GameState;
  period: number;
  periodType: "REG" | "OT" | "SO";
  /** Seconds elapsed in the current period. */
  second: number;
  periodLength: number;
  inIntermission: boolean;
  /** Real seconds until the replay reaches its final state (0 once final). */
  realSecondsToFinal: number;
};

/** Total real seconds from start to the final whistle. */
export function replayDuration(pbp: PlayByPlay, cfg: ReplayConfig = DEFAULT_REPLAY): number {
  const periods = periodsOf(pbp);
  return (
    cfg.pregameSeconds +
    periods.reduce((sum, p) => sum + p.length / cfg.speed, 0) +
    Math.max(0, periods.length - 1) * cfg.intermissionSeconds
  );
}

export function momentAt(pbp: PlayByPlay, elapsedReal: number, cfg: ReplayConfig = DEFAULT_REPLAY): ReplayMoment {
  const periods = periodsOf(pbp);
  const total = replayDuration(pbp, cfg);
  const toFinal = Math.max(0, total - elapsedReal);
  const first = periods[0] ?? { number: 1, type: "REG" as const, length: REG_LEN, fullLength: REG_LEN };

  if (elapsedReal < cfg.pregameSeconds) {
    return { state: "PRE", period: 1, periodType: "REG", second: 0, periodLength: first.fullLength, inIntermission: false, realSecondsToFinal: toFinal };
  }

  let t = elapsedReal - cfg.pregameSeconds;
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const playReal = p.length / cfg.speed;
    if (t < playReal) {
      return { state: "LIVE", period: p.number, periodType: p.type, second: t * cfg.speed, periodLength: p.fullLength, inIntermission: false, realSecondsToFinal: toFinal };
    }
    t -= playReal;
    const isLast = i === periods.length - 1;
    if (!isLast && t < cfg.intermissionSeconds) {
      return { state: "LIVE", period: p.number, periodType: p.type, second: p.length, periodLength: p.fullLength, inIntermission: true, realSecondsToFinal: toFinal };
    }
    if (!isLast) t -= cfg.intermissionSeconds;
  }
  const last = periods.at(-1) ?? first;
  return { state: "FINAL", period: last.number, periodType: last.type, second: last.length, periodLength: last.fullLength, inIntermission: false, realSecondsToFinal: 0 };
}

/** Plays that have happened by `moment`, in order. */
export function visiblePlays(pbp: PlayByPlay, m: ReplayMoment): Play[] {
  if (m.state === "PRE") return [];
  const sorted = [...pbp.plays].sort((a, b) => a.sortOrder - b.sortOrder);
  if (m.state === "FINAL") return sorted;
  const at = playSecond(pbp);
  return sorted.filter((p) => {
    const n = p.periodDescriptor.number;
    return n < m.period || (n === m.period && (at.get(p.eventId) ?? 0) <= m.second);
  });
}

type Tally = { goals: Map<number, number>; assists: Map<number, number>; sog: Map<number, number>; hits: Map<number, number>; pim: Map<number, number>; blocks: Map<number, number>; giveaways: Map<number, number>; takeaways: Map<number, number>; foWon: Map<number, number>; foTaken: Map<number, number>; ga: Map<number, number>; sa: Map<number, number> };

function tally(plays: Play[]): Tally {
  const t: Tally = { goals: new Map(), assists: new Map(), sog: new Map(), hits: new Map(), pim: new Map(), blocks: new Map(), giveaways: new Map(), takeaways: new Map(), foWon: new Map(), foTaken: new Map(), ga: new Map(), sa: new Map() };
  const inc = (m: Map<number, number>, id: number | undefined, by = 1) => {
    if (id !== undefined) m.set(id, (m.get(id) ?? 0) + by);
  };
  for (const p of plays) {
    if (p.periodDescriptor.periodType === "SO") continue; // shootouts don't count toward player stats
    const d = p.details ?? {};
    switch (p.typeDescKey) {
      case "goal":
        inc(t.goals, d.scoringPlayerId);
        inc(t.assists, d.assist1PlayerId);
        inc(t.assists, d.assist2PlayerId);
        inc(t.sog, d.scoringPlayerId);
        inc(t.ga, d.goalieInNetId);
        inc(t.sa, d.goalieInNetId);
        break;
      case "shot-on-goal":
        inc(t.sog, d.shootingPlayerId);
        inc(t.sa, d.goalieInNetId);
        break;
      case "hit":
        inc(t.hits, d.hittingPlayerId);
        break;
      case "blocked-shot":
        inc(t.blocks, d.blockingPlayerId);
        break;
      case "giveaway":
        inc(t.giveaways, d.playerId);
        break;
      case "takeaway":
        inc(t.takeaways, d.playerId);
        break;
      case "penalty":
        inc(t.pim, d.committedByPlayerId, d.duration ?? 0);
        break;
      case "faceoff":
        inc(t.foWon, d.winningPlayerId);
        inc(t.foTaken, d.winningPlayerId);
        inc(t.foTaken, d.losingPlayerId);
        break;
    }
  }
  return t;
}

/** Score and shots for each side from the visible plays. */
export function scoreFrom(src: ReplaySource, plays: Play[], m: ReplayMoment) {
  if (m.state === "FINAL") {
    return {
      home: { score: src.pbp.homeTeam.score ?? 0, sog: src.pbp.homeTeam.sog ?? 0 },
      away: { score: src.pbp.awayTeam.score ?? 0, sog: src.pbp.awayTeam.sog ?? 0 },
    };
  }
  const homeId = src.pbp.homeTeam.id;
  let home = 0;
  let away = 0;
  let homeSog = 0;
  let awaySog = 0;
  for (const p of plays) {
    if (p.periodDescriptor.periodType === "SO") continue;
    if (p.typeDescKey === "goal") {
      home = p.details?.homeScore ?? home;
      away = p.details?.awayScore ?? away;
    }
    if (p.typeDescKey === "goal" || p.typeDescKey === "shot-on-goal") {
      if (p.details?.eventOwnerTeamId === homeId) homeSog++;
      else awaySog++;
    }
  }
  return { home: { score: home, sog: homeSog }, away: { score: away, sog: awaySog } };
}

function clockFor(m: ReplayMoment) {
  const remaining = m.periodLength - m.second;
  return {
    timeRemaining: toClock(m.state === "PRE" ? m.periodLength : remaining),
    secondsRemaining: Math.round(m.state === "PRE" ? m.periodLength : remaining),
    running: m.state === "LIVE" && !m.inIntermission,
    inIntermission: m.inIntermission,
  };
}

function stateFor(m: ReplayMoment, score: { home: { score: number }; away: { score: number } }): GameState {
  if (m.state !== "LIVE") return m.state;
  const late = (m.periodType === "REG" && m.period >= 3 && m.periodLength - m.second <= 300) || m.periodType !== "REG";
  return late && !m.inIntermission && Math.abs(score.home.score - score.away.score) <= 1 ? "CRIT" : "LIVE";
}

export type ReplaySnapshot = {
  moment: ReplayMoment;
  pbp: PlayByPlay;
  landing: GameLanding;
  boxscore: Boxscore;
};

/** The three gamecenter responses as they would look at `elapsedReal` seconds into the replay. */
export function snapshotAt(src: ReplaySource, elapsedReal: number, cfg: ReplayConfig = DEFAULT_REPLAY): ReplaySnapshot {
  return snapshotForMoment(src, momentAt(src.pbp, elapsedReal, cfg));
}

/** Same as snapshotAt, for an explicit game moment. */
export function snapshotForMoment(src: ReplaySource, m: ReplayMoment): ReplaySnapshot {
  const plays = visiblePlays(src.pbp, m);
  const score = scoreFrom(src, plays, m);
  const gameState = stateFor(m, score);
  const final = m.state === "FINAL";
  const pre = m.state === "PRE";
  const periodDescriptor = { number: m.period, periodType: m.periodType, maxRegulationPeriods: 3 };
  const clock = clockFor(m);
  const visibleIds = new Set(plays.map((p) => p.eventId));

  const teams = (o: { homeTeam: GameTeam; awayTeam: GameTeam }) => ({
    homeTeam: { ...o.homeTeam, score: pre ? undefined : score.home.score, sog: pre ? undefined : score.home.sog },
    awayTeam: { ...o.awayTeam, score: pre ? undefined : score.away.score, sog: pre ? undefined : score.away.sog },
  });

  const pbp: PlayByPlay = {
    ...src.pbp,
    ...teams(src.pbp),
    gameState,
    periodDescriptor,
    displayPeriod: m.period,
    clock,
    plays,
    gameOutcome: final ? src.pbp.gameOutcome : undefined,
  };

  // Landing: goals by eventId; penalties (which carry no eventId) by period and clock time.
  const summary = src.landing.summary;
  const landing: GameLanding = {
    ...src.landing,
    ...teams(src.landing),
    gameState,
    periodDescriptor,
    clock,
    gameOutcome: final ? src.landing.gameOutcome : undefined,
    summary: pre
      ? undefined
      : {
          scoring: summary?.scoring
            ?.filter((s) => s.periodDescriptor.number <= m.period)
            .map((s) => ({ ...s, goals: s.goals.filter((g) => final || (g.eventId !== undefined && visibleIds.has(g.eventId))) })),
          penalties: summary?.penalties
            ?.filter((s) => s.periodDescriptor.number <= m.period)
            .map((s) => ({
              ...s,
              penalties: s.penalties.filter(
                (p) => final || s.periodDescriptor.number < m.period || toSeconds(p.timeInPeriod) <= m.second,
              ),
            })),
          threeStars: final ? summary?.threeStars : undefined,
        },
  };

  // Boxscore: counting stats rebuilt from plays; TOI scaled by how much of the game has elapsed.
  const periods = periodsOf(src.pbp);
  const totalGameSeconds = periods.reduce((s, p) => s + p.length, 0) || 1;
  const elapsedGameSeconds = pre
    ? 0
    : final
      ? totalGameSeconds
      : periods.filter((p) => p.number < m.period).reduce((s, p) => s + p.length, 0) + Math.min(m.second, periods.find((p) => p.number === m.period)?.length ?? 0);
  const frac = Math.min(1, elapsedGameSeconds / totalGameSeconds);
  const t = tally(plays);
  const scaleToi = (toi: string) => toClock(toSeconds(toi) * frac);

  const skater = (s: BoxSkater): BoxSkater => {
    if (final) return s;
    const goals = t.goals.get(s.playerId) ?? 0;
    const assists = t.assists.get(s.playerId) ?? 0;
    const taken = t.foTaken.get(s.playerId) ?? 0;
    return {
      ...s,
      goals,
      assists,
      points: goals + assists,
      plusMinus: 0,
      pim: t.pim.get(s.playerId) ?? 0,
      hits: t.hits.get(s.playerId) ?? 0,
      sog: t.sog.get(s.playerId) ?? 0,
      blockedShots: t.blocks.get(s.playerId) ?? 0,
      giveaways: t.giveaways.get(s.playerId) ?? 0,
      takeaways: t.takeaways.get(s.playerId) ?? 0,
      faceoffWinningPctg: taken ? (t.foWon.get(s.playerId) ?? 0) / taken : 0,
      toi: scaleToi(s.toi),
      shifts: undefined,
      powerPlayGoals: undefined,
    };
  };
  const goalie = (g: BoxGoalie): BoxGoalie => {
    if (final) return g;
    const shotsAgainst = t.sa.get(g.playerId) ?? 0;
    const goalsAgainst = t.ga.get(g.playerId) ?? 0;
    return {
      ...g,
      shotsAgainst,
      goalsAgainst,
      saves: shotsAgainst - goalsAgainst,
      savePctg: shotsAgainst ? (shotsAgainst - goalsAgainst) / shotsAgainst : undefined,
      toi: scaleToi(g.toi),
      decision: undefined,
      evenStrengthShotsAgainst: undefined,
      powerPlayShotsAgainst: undefined,
      shorthandedShotsAgainst: undefined,
    };
  };
  const box = src.boxscore.playerByGameStats;
  const boxscore: Boxscore = {
    ...src.boxscore,
    ...teams(src.boxscore),
    gameState,
    periodDescriptor,
    clock,
    gameOutcome: final ? src.boxscore.gameOutcome : undefined,
    playerByGameStats:
      pre || !box
        ? undefined
        : {
            homeTeam: { forwards: box.homeTeam.forwards.map(skater), defense: box.homeTeam.defense.map(skater), goalies: box.homeTeam.goalies.map(goalie) },
            awayTeam: { forwards: box.awayTeam.forwards.map(skater), defense: box.awayTeam.defense.map(skater), goalies: box.awayTeam.goalies.map(goalie) },
          },
  };

  return { moment: m, pbp, landing, boxscore };
}
