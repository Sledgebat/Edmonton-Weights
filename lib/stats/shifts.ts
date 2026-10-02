/**
 * Who was on the ice: combines a game's shift charts with its play-by-play. Pure functions,
 * unit-tested against the fixtures.
 *
 *   On-ice stats  every 5-on-5 shot attempt and goal is credited to the skaters on the ice for
 *                 each side: CF/CA (attempts), GF/GA (goals), xGF/xGA (our expected goals).
 *                 A player is on the ice for an event at time t when his shift runs from
 *                 before t to t or later (so at a line change the player leaving gets it).
 *   Lines, pairs  the same three forwards, or two defencemen, on the ice together at 5-on-5.
 *   Game Score    Dom Luszczyszyn's single-game measure (2016) for skaters; for goalies, goals
 *                 saved above expected (our model) times 0.75, the weight of a goal scored.
 */
import type { PlayByPlay, Shift } from "@/lib/nhl/schemas";
import { gameSecondsOf, situation, toSec, type ShotAttempt } from "./extract";

export type Pos = "F" | "D" | "G";

export type PlayerGame = {
  playerId: number;
  teamId: number;
  pos: Pos;
  /** Seconds on the ice, all situations and at 5-on-5. */
  toi: number;
  toi5: number;
  /** 5-on-5 on-ice attempts, goals and expected goals, for and against. */
  cf: number;
  ca: number;
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
  /** Individual events, all situations. */
  goals: number;
  a1: number;
  a2: number;
  sog: number;
  blk: number;
  pd: number;
  pt: number;
  fow: number;
  fol: number;
  /** Goalies only: goals saved above expected in this game. */
  gsax: number | null;
  gameScore: number;
};

export type UnitGame = {
  teamId: number;
  kind: "F" | "D";
  /** Player ids, ascending. */
  players: number[];
  toi5: number;
  cf: number;
  ca: number;
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
};

/** Game Score weights (Luszczyszyn 2016, standard skater version). */
export const GAME_SCORE = {
  goal: 0.75,
  a1: 0.7,
  a2: 0.55,
  sog: 0.075,
  blk: 0.05,
  penalty: 0.15,
  faceoff: 0.01,
  corsi: 0.05,
  onIceGoal: 0.15,
  /** Goalies: per goal saved above expected. */
  goalieGsax: 0.75,
} as const;

/** Misconducts don't put a team shorthanded, so they don't count as penalties taken or drawn. */
const NO_POWER_PLAY = new Set(["MIS", "GMIS", "GAM"]);

export const posOf = (code: string | undefined): Pos => (code === "G" ? "G" : code === "D" ? "D" : "F");

export function skaterGameScore(p: Pick<PlayerGame, "goals" | "a1" | "a2" | "sog" | "blk" | "pd" | "pt" | "fow" | "fol" | "cf" | "ca" | "gf" | "ga">): number {
  const w = GAME_SCORE;
  return (
    w.goal * p.goals +
    w.a1 * p.a1 +
    w.a2 * p.a2 +
    w.sog * p.sog +
    w.blk * p.blk +
    w.penalty * (p.pd - p.pt) +
    w.faceoff * (p.fow - p.fol) +
    w.corsi * (p.cf - p.ca) +
    w.onIceGoal * (p.gf - p.ga)
  );
}

/** Usable shifts (typeCode 517) as [start, end) in seconds since the opening faceoff. */
export function shiftIntervals(shifts: Shift[]): { playerId: number; teamId: number; start: number; end: number }[] {
  const out: { playerId: number; teamId: number; start: number; end: number }[] = [];
  for (const s of shifts) {
    if (s.typeCode !== 517 || !s.playerId || !s.teamId || !s.startTime || !s.endTime) continue;
    if (!/^\d+:\d\d$/.test(s.startTime) || !/^\d+:\d\d$/.test(s.endTime)) continue;
    const base = (s.period - 1) * 1200;
    const start = base + toSec(s.startTime);
    const end = base + toSec(s.endTime);
    if (end > start) out.push({ playerId: s.playerId, teamId: s.teamId, start, end });
  }
  return out;
}

/**
 * Per-player and per-unit numbers for one finished game. `shots` are the game's scored attempts
 * (from extractShots + scoreShots), so on-ice numbers match the team stats exactly.
 */
export function onIceGame(pbp: PlayByPlay, shifts: Shift[], shots: ShotAttempt[]): { players: PlayerGame[]; units: UnitGame[] } {
  const roster = new Map(pbp.rosterSpots.map((r) => [r.playerId, r]));
  const posById = (id: number) => posOf(roster.get(id)?.positionCode);
  const homeId = pbp.homeTeam.id;
  const awayId = pbp.awayTeam.id;
  const intervals = shiftIntervals(shifts);
  const plays = pbp.plays.filter((p) => p.periodDescriptor.periodType !== "SO").sort((a, b) => a.sortOrder - b.sortOrder);
  const length = Math.max(1, ...intervals.map((i) => i.end), ...plays.map((p) => gameSecondsOf(p) + 1));

  // Skaters on the ice for each team, second by second ([t, t + 1)).
  const ice = new Map<number, number[][]>([
    [homeId, Array.from({ length }, () => [])],
    [awayId, Array.from({ length }, () => [])],
  ]);
  const toi = new Map<number, number>();
  const teamOfPlayer = new Map<number, number>();
  for (const iv of intervals) {
    const timeline = ice.get(iv.teamId);
    if (!timeline) continue;
    teamOfPlayer.set(iv.playerId, iv.teamId);
    for (let t = iv.start; t < iv.end; t++) {
      // Overlapping duplicate shifts in the NHL's data would otherwise double-count.
      if (timeline[t].includes(iv.playerId)) continue;
      timeline[t].push(iv.playerId);
      toi.set(iv.playerId, (toi.get(iv.playerId) ?? 0) + 1);
    }
  }

  // 5-on-5 seconds, from the play-by-play's situation codes (the same source as the team stats).
  const is5 = Array<boolean>(length).fill(false);
  for (let i = 0; i < plays.length - 1; i++) {
    const a = plays[i];
    const b = plays[i + 1];
    if (b.periodDescriptor.number !== a.periodDescriptor.number) continue;
    if (situation(a.situationCode, true).strength !== "5v5") continue;
    for (let t = gameSecondsOf(a); t < gameSecondsOf(b) && t < length; t++) is5[t] = true;
  }

  const lines = new Map<number, PlayerGame>();
  const line = (playerId: number, teamId?: number): PlayerGame | null => {
    const team = teamId ?? teamOfPlayer.get(playerId) ?? roster.get(playerId)?.teamId;
    if (!team) return null;
    let p = lines.get(playerId);
    if (!p) {
      p = {
        playerId,
        teamId: team,
        pos: posById(playerId),
        toi: toi.get(playerId) ?? 0,
        toi5: 0,
        cf: 0,
        ca: 0,
        gf: 0,
        ga: 0,
        xgf: 0,
        xga: 0,
        goals: 0,
        a1: 0,
        a2: 0,
        sog: 0,
        blk: 0,
        pd: 0,
        pt: 0,
        fow: 0,
        fol: 0,
        gsax: null,
        gameScore: 0,
      };
      lines.set(playerId, p);
    }
    return p;
  };
  for (const id of toi.keys()) line(id);

  const units = new Map<string, UnitGame>();
  const unitsAt = (teamId: number, t: number): UnitGame[] => {
    const skaters = (ice.get(teamId)?.[t] ?? []).filter((id) => posById(id) !== "G");
    const out: UnitGame[] = [];
    for (const kind of ["F", "D"] as const) {
      const group = skaters.filter((id) => posById(id) === kind).sort((a, b) => a - b);
      if (group.length !== (kind === "F" ? 3 : 2)) continue;
      const key = `${teamId}:${group.join("-")}`;
      let u = units.get(key);
      if (!u) {
        u = { teamId, kind, players: group, toi5: 0, cf: 0, ca: 0, gf: 0, ga: 0, xgf: 0, xga: 0 };
        units.set(key, u);
      }
      out.push(u);
    }
    return out;
  };

  // 5-on-5 ice time for players and units.
  for (let t = 0; t < length; t++) {
    if (!is5[t]) continue;
    for (const teamId of [homeId, awayId]) {
      for (const id of ice.get(teamId)![t]) {
        const p = line(id, teamId);
        if (p) p.toi5++;
      }
      for (const u of unitsAt(teamId, t)) u.toi5++;
    }
  }

  // 5-on-5 attempts, credited to everyone on the ice for both sides.
  for (const s of shots) {
    if (s.strength !== "5v5") continue;
    const t = Math.min(length - 1, Math.max(0, s.gameSeconds - 1));
    const credit = (teamId: number, side: "for" | "against") => {
      const targets: { cf: number; ca: number; gf: number; ga: number; xgf: number; xga: number }[] = [];
      for (const id of ice.get(teamId)?.[t] ?? []) {
        if (posById(id) === "G") continue;
        const p = line(id, teamId);
        if (p) targets.push(p);
      }
      targets.push(...unitsAt(teamId, t));
      for (const x of targets) {
        if (side === "for") {
          x.cf++;
          x.gf += s.isGoal ? 1 : 0;
          x.xgf += s.xg;
        } else {
          x.ca++;
          x.ga += s.isGoal ? 1 : 0;
          x.xga += s.xg;
        }
      }
    };
    credit(s.teamId, "for");
    credit(s.oppTeamId, "against");
  }

  // Individual events, all situations.
  for (const p of plays) {
    const d = p.details;
    if (!d) continue;
    const add = (id: number | undefined, key: "goals" | "a1" | "a2" | "sog" | "blk" | "pd" | "pt" | "fow" | "fol") => {
      if (!id) return;
      const l = line(id);
      if (l) l[key]++;
    };
    switch (p.typeDescKey) {
      case "goal":
        add(d.scoringPlayerId, "goals");
        add(d.scoringPlayerId, "sog");
        add(d.assist1PlayerId, "a1");
        add(d.assist2PlayerId, "a2");
        break;
      case "shot-on-goal":
        add(d.shootingPlayerId, "sog");
        break;
      case "blocked-shot":
        // Newer data also logs shots blocked by the shooter's own teammate; those aren't blocks.
        if (d.reason !== "teammate-blocked") add(d.blockingPlayerId, "blk");
        break;
      case "penalty":
        if (!NO_POWER_PLAY.has(d.typeCode ?? "")) {
          add(d.committedByPlayerId, "pt");
          add(d.drawnByPlayerId, "pd");
        }
        break;
      case "faceoff":
        add(d.winningPlayerId, "fow");
        add(d.losingPlayerId, "fol");
        break;
    }
  }

  // Goalies: goals saved above expected on the attempts they faced.
  for (const s of shots) {
    if (!s.goalieId || s.type === "blocked-shot") continue;
    const g = line(s.goalieId, s.oppTeamId);
    if (!g) continue;
    g.gsax = (g.gsax ?? 0) + s.xg - (s.isGoal ? 1 : 0);
  }

  const players = [...lines.values()].filter((p) => p.toi > 0 || p.gsax !== null);
  for (const p of players) {
    if (p.pos === "G") {
      p.gsax ??= 0;
      p.gameScore = GAME_SCORE.goalieGsax * p.gsax;
    } else {
      p.gameScore = skaterGameScore(p);
    }
  }
  return { players, units: [...units.values()].filter((u) => u.toi5 > 0) };
}
