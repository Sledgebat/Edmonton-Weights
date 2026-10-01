/**
 * Turns a game's play-by-play into shot attempts with the features the advanced stats and the
 * xG model need. Pure functions, unit-tested against the fixtures.
 *
 * Coordinates: the NHL rink is x in [-100, 100], y in [-42.5, 42.5] feet, nets on the goal lines
 * at x = ±89. We normalise every shot so the shooting team attacks toward +x (net at x = 89).
 *
 * Definitions (shown on the site):
 *   Corsi       every shot attempt: goals, shots on goal, missed and blocked shots
 *   Fenwick     unblocked attempts: Corsi minus blocked shots
 *   Rebound     an attempt within 3 s of the same team's shot on goal, with no stoppage between
 *   Rush        an offensive-zone attempt within 4 s of play outside the offensive zone
 *   High danger an unblocked attempt from the inner slot (within 20 ft of the goal line and 9 ft
 *               of centre), or a rebound from the slot (between the faceoff dots, up to the top of
 *               the circles). Rush shots aren't included: in NHL data they score less often than
 *               other shots from the same spot.
 */
import type { Play, PlayByPlay } from "@/lib/nhl/schemas";

export const NET_X = 89;
export const BLUE_LINE_X = 25;

export type AttemptType = "goal" | "shot-on-goal" | "missed-shot" | "blocked-shot";
export const ATTEMPT_TYPES: AttemptType[] = ["goal", "shot-on-goal", "missed-shot", "blocked-shot"];

export type Strength = "5v5" | "PP" | "SH" | "EV" | "EN";
export type LastEvent = "faceoff" | "shot" | "takeaway" | "giveaway" | "hit" | "other";

export type ShotAttempt = {
  gameId: number;
  eventId: number;
  sortOrder: number;
  period: number;
  periodType: "REG" | "OT";
  /** Seconds since the opening faceoff. */
  gameSeconds: number;
  teamId: number;
  oppTeamId: number;
  isHome: boolean;
  shooterId: number | null;
  goalieId: number | null;
  type: AttemptType;
  shotType: string | null;
  /** Normalised so the shooter attacks toward +x. */
  x: number | null;
  y: number | null;
  distance: number | null;
  /** Degrees from the centre line of the net, 0 = straight on. */
  angle: number | null;
  ownSkaters: number;
  oppSkaters: number;
  oppGoalieIn: boolean;
  ownGoalieIn: boolean;
  strength: Strength;
  rebound: boolean;
  rush: boolean;
  highDanger: boolean;
  lastEvent: LastEvent;
  secondsSinceLast: number;
  isGoal: boolean;
  /** Filled in by the xG model; 0 for blocked shots. */
  xg: number;
};

export const toSec = (mmss: string) => {
  const [m, s] = mmss.split(":").map(Number);
  return m * 60 + s;
};

/** Seconds since the opening faceoff (regular-season OT periods are 5 minutes). */
export function gameSecondsOf(play: Pick<Play, "periodDescriptor" | "timeInPeriod">): number {
  const n = play.periodDescriptor.number;
  return (n - 1) * 1200 + toSec(play.timeInPeriod);
}

/**
 * situationCode "1451" = away goalie (1), away skaters (4), home skaters (5), home goalie (1).
 * Returns the state from one team's point of view.
 */
export function situation(code: string | undefined, isHome: boolean) {
  const c = code && /^\d{4}$/.test(code) ? code : "1551";
  const awayGoalie = c[0] === "1";
  const awaySkaters = Number(c[1]);
  const homeSkaters = Number(c[2]);
  const homeGoalie = c[3] === "1";
  const own = isHome ? { skaters: homeSkaters, goalie: homeGoalie } : { skaters: awaySkaters, goalie: awayGoalie };
  const opp = isHome ? { skaters: awaySkaters, goalie: awayGoalie } : { skaters: homeSkaters, goalie: homeGoalie };
  let strength: Strength;
  if (!own.goalie || !opp.goalie) strength = "EN";
  else if (own.skaters > opp.skaters) strength = "PP";
  else if (own.skaters < opp.skaters) strength = "SH";
  else strength = own.skaters === 5 ? "5v5" : "EV";
  return { ownSkaters: own.skaters, oppSkaters: opp.skaters, ownGoalieIn: own.goalie, oppGoalieIn: opp.goalie, strength };
}

const lastEventOf = (t: string): LastEvent =>
  t === "faceoff" ? "faceoff" : ATTEMPT_TYPES.includes(t as AttemptType) ? "shot" : t === "takeaway" ? "takeaway" : t === "giveaway" ? "giveaway" : t === "hit" ? "hit" : "other";

/** Breaks in play: nothing carries over a stoppage, period end or penalty. */
const STOPS = new Set(["stoppage", "period-start", "period-end", "game-end", "penalty", "delayed-penalty", "goal", "shootout-complete"]);

export function inInnerSlot(x: number, y: number) {
  return x >= NET_X - 20 && x <= NET_X && Math.abs(y) <= 9;
}
export function inSlot(x: number, y: number) {
  return x >= NET_X - 35 && x <= NET_X && Math.abs(y) <= 22;
}
export function isHighDanger(x: number, y: number, rebound: boolean) {
  return inInnerSlot(x, y) || (rebound && inSlot(x, y));
}

/**
 * Which way does `teamId` attack in this play? Uses homeTeamDefendingSide, corrected by the
 * event's zone when the two disagree (the NHL's side flag is occasionally wrong).
 */
function attackSign(play: Play, isHome: boolean): 1 | -1 {
  const side = play.homeTeamDefendingSide;
  let sign: 1 | -1 = side === "left" ? (isHome ? 1 : -1) : side === "right" ? (isHome ? -1 : 1) : 1;
  const d = play.details;
  if (d?.zoneCode === "O" && d.xCoord !== undefined && Math.abs(d.xCoord) > BLUE_LINE_X && Math.sign(d.xCoord) !== sign) {
    sign = sign === 1 ? -1 : 1;
  }
  return sign;
}

export function extractShots(pbp: PlayByPlay): ShotAttempt[] {
  const homeId = pbp.homeTeam.id;
  const awayId = pbp.awayTeam.id;
  const plays = [...pbp.plays]
    .filter((p) => p.periodDescriptor.periodType !== "SO")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const out: ShotAttempt[] = [];
  let prev: Play | undefined;
  let lastSogByTeam = new Map<number, number>(); // teamId -> gameSeconds of last shot on goal since the last stoppage

  for (const p of plays) {
    const t = gameSecondsOf(p);
    const type = p.typeDescKey as AttemptType;

    if (ATTEMPT_TYPES.includes(type) && p.details?.eventOwnerTeamId !== undefined) {
      const d = p.details;
      const teamId = d.eventOwnerTeamId!;
      const isHome = teamId === homeId;
      const sit = situation(p.situationCode, isHome);
      // Penalty shots and odd states (fewer than 3 skaters) are left out of the analysis.
      if (sit.ownSkaters >= 3 && sit.oppSkaters >= 3) {
        const sign = attackSign(p, isHome);
        const hasXY = d.xCoord !== undefined && d.yCoord !== undefined;
        const x = hasXY ? d.xCoord! * sign : null;
        const y = hasXY ? d.yCoord! * sign : null;
        const dx = x !== null ? NET_X - x : null;
        const distance = x !== null && y !== null ? Math.hypot(dx!, y) : null;
        const angle = x !== null && y !== null ? (Math.atan2(Math.abs(y), Math.abs(dx!)) * 180) / Math.PI : null;

        const sinceLast = prev ? Math.max(0, t - gameSecondsOf(prev)) : 999;
        const prevIsStop = !prev || STOPS.has(prev.typeDescKey);
        const lastSog = lastSogByTeam.get(teamId);
        const rebound = lastSog !== undefined && t - lastSog <= 3;
        // A rush: taken in the offensive zone within 4 s of play outside it.
        let rush = false;
        if (x !== null && x >= BLUE_LINE_X && prev && !prevIsStop && sinceLast <= 4 && prev.details?.xCoord !== undefined) {
          rush = prev.details.xCoord * sign < BLUE_LINE_X;
        }
        const unblocked = type !== "blocked-shot";
        const highDanger = unblocked && x !== null && y !== null && isHighDanger(x, y, rebound);

        out.push({
          gameId: pbp.id,
          eventId: p.eventId,
          sortOrder: p.sortOrder,
          period: p.periodDescriptor.number,
          periodType: p.periodDescriptor.periodType === "OT" ? "OT" : "REG",
          gameSeconds: t,
          teamId,
          oppTeamId: isHome ? awayId : homeId,
          isHome,
          shooterId: d.shootingPlayerId ?? d.scoringPlayerId ?? null,
          goalieId: d.goalieInNetId ?? null,
          type,
          shotType: d.shotType ?? null,
          x,
          y,
          distance,
          angle,
          ...sit,
          rebound,
          rush,
          highDanger,
          lastEvent: prev ? lastEventOf(prev.typeDescKey) : "other",
          secondsSinceLast: Math.min(sinceLast, 120),
          isGoal: type === "goal",
          xg: 0,
        });
      }
    }

    if (STOPS.has(p.typeDescKey)) lastSogByTeam = new Map();
    if (type === "shot-on-goal" && p.details?.eventOwnerTeamId !== undefined) lastSogByTeam.set(p.details.eventOwnerTeamId, t);
    prev = p;
  }
  return out;
}

/** Seconds each team spent in each strength state (from its own point of view). */
export function strengthTime(pbp: PlayByPlay): Map<number, Record<Strength, number>> {
  const blank = (): Record<Strength, number> => ({ "5v5": 0, PP: 0, SH: 0, EV: 0, EN: 0 });
  const homeId = pbp.homeTeam.id;
  const awayId = pbp.awayTeam.id;
  const out = new Map([
    [homeId, blank()],
    [awayId, blank()],
  ]);
  const plays = [...pbp.plays].filter((p) => p.periodDescriptor.periodType !== "SO").sort((a, b) => a.sortOrder - b.sortOrder);
  for (let i = 0; i < plays.length - 1; i++) {
    const a = plays[i];
    const b = plays[i + 1];
    if (b.periodDescriptor.number !== a.periodDescriptor.number) continue;
    const dt = gameSecondsOf(b) - gameSecondsOf(a);
    if (dt <= 0) continue;
    out.get(homeId)![situation(a.situationCode, true).strength] += dt;
    out.get(awayId)![situation(a.situationCode, false).strength] += dt;
  }
  return out;
}
