/**
 * The typed NHL client. Server-side only: browsers call the site's own /api/* routes.
 *
 * Modes (env NHL_MODE):
 *   live      (default) fetch from api-web.nhle.com through the SQLite cache
 *   fixtures  serve saved responses from fixtures/, never touch the network
 *   replay    like fixtures, but one finished game (GAME_ID) is replayed as if live
 *
 * In live mode a response is only stored after it passes Zod validation. When a refresh fails
 * (network error, HTTP error or a changed schema) the last good copy is served, marked stale,
 * and the next attempt backs off exponentially.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb, schema as dbSchema } from "@/db";
import { NHL_API_BASE, USER_AGENT, fixturePathFor } from "./endpoints";
import { resourceForPath } from "./resources";

export type NhlMode = "live" | "fixtures" | "replay";
export type Source = "live" | "cache" | "stale" | "fixture" | "replay";

export type Meta = {
  path: string;
  mode: NhlMode;
  source: Source;
  /** When the data was fetched from the NHL (ms since epoch); for fixtures, when they were captured. */
  fetchedAt: number;
  stale: boolean;
  warning?: string;
};
export type Result<T> = { data: T; meta: Meta };

export class NhlError extends Error {
  constructor(
    message: string,
    readonly path: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "NhlError";
  }
}

export function nhlMode(): NhlMode {
  const m = (process.env.NHL_MODE ?? "live").toLowerCase();
  return m === "fixtures" || m === "replay" ? m : "live";
}

const REQUEST_TIMEOUT_MS = 10_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 15 * 60_000;
export const backoffMs = (failCount: number) =>
  Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, failCount - 1), BACKOFF_MAX_MS);

// --------------------------------------------------------------------------- test seams

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
let fetcher: Fetcher = (url, init) => fetch(url, init);
let clock = () => Date.now();

export function setFetcherForTests(f: Fetcher | undefined) {
  fetcher = f ?? ((url, init) => fetch(url, init));
}
export function setClockForTests(c: (() => number) | undefined) {
  clock = c ?? (() => Date.now());
}
export const now = () => clock();

// --------------------------------------------------------------------------- logging

function warn(message: string) {
  console.warn(`[nhl] ${message}`);
}

function describeIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

// --------------------------------------------------------------------------- fixtures

export function fixturesDir(): string {
  return process.env.FIXTURES_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "fixtures");
}

let fixtureCapturedAt: number | undefined;
async function fixtureTimestamp(): Promise<number> {
  if (fixtureCapturedAt === undefined) {
    try {
      const report = JSON.parse(await readFile(path.join(/*turbopackIgnore: true*/ fixturesDir(), "_report.json"), "utf8"));
      fixtureCapturedAt = Date.parse(report.capturedAt) || 0;
    } catch {
      fixtureCapturedAt = 0;
    }
  }
  return fixtureCapturedAt;
}

/** Raw JSON for `apiPath` from fixtures/, or null if it was never captured. */
export async function readFixture(apiPath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path.join(/*turbopackIgnore: true*/ fixturesDir(), fixturePathFor(apiPath)), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function fromFixture<T>(apiPath: string, schema: z.ZodType<T>, mode: NhlMode): Promise<Result<T>> {
  const raw = await readFixture(apiPath);
  if (raw === null) {
    throw new NhlError(`No fixture saved for ${apiPath}. Run \`npm run fixtures:capture\`.`, apiPath, 404);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new NhlError(`Fixture ${apiPath} failed validation: ${describeIssues(parsed.error)}`, apiPath);
  }
  return {
    data: parsed.data,
    meta: { path: apiPath, mode, source: "fixture", fetchedAt: await fixtureTimestamp(), stale: false },
  };
}

// --------------------------------------------------------------------------- live (cached)

const inFlight = new Map<string, Promise<Result<unknown>>>();
/** Paths that failed with no cached copy, and when they may be retried. */
const coldFailures = new Map<string, { until: number; count: number; error: string }>();

async function fromLive<T>(apiPath: string, schema: z.ZodType<T>): Promise<Result<T>> {
  const db = getDb();
  const row = db.select().from(dbSchema.apiCache).where(eq(dbSchema.apiCache.path, apiPath)).get();
  const t = now();

  if (row && t < row.expiresAt) {
    const parsed = schema.safeParse(JSON.parse(row.body));
    if (parsed.success) {
      return {
        data: parsed.data,
        meta: {
          path: apiPath,
          mode: "live",
          source: row.failCount > 0 ? "stale" : "cache",
          fetchedAt: row.fetchedAt,
          stale: row.failCount > 0,
          warning: row.failCount > 0 ? (row.lastError ?? undefined) : undefined,
        },
      };
    }
    // The cached body no longer matches the schema (the schema changed): refetch.
  }

  const cold = coldFailures.get(apiPath);
  if (!row && cold && t < cold.until) {
    throw new NhlError(`${cold.error} (retrying after backoff)`, apiPath);
  }

  // Single flight: concurrent requests for the same path share one upstream fetch.
  let pending = inFlight.get(apiPath) as Promise<Result<T>> | undefined;
  if (!pending) {
    pending = refresh(apiPath, schema, row ?? null).finally(() => inFlight.delete(apiPath));
    inFlight.set(apiPath, pending as Promise<Result<unknown>>);
  }
  return pending;
}

type CacheRow = typeof dbSchema.apiCache.$inferSelect;

async function refresh<T>(apiPath: string, zschema: z.ZodType<T>, row: CacheRow | null): Promise<Result<T>> {
  const db = getDb();
  const t = now();
  const resource = resourceForPath(apiPath);

  try {
    const res = await fetcher(NHL_API_BASE + apiPath, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 404) throw new NhlError(`Not found: ${apiPath}`, apiPath, 404);
    if (!res.ok) throw new NhlError(`HTTP ${res.status} from NHL`, apiPath, res.status);

    const body = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new NhlError("NHL returned invalid JSON", apiPath);
    }
    const parsed = zschema.safeParse(json);
    if (!parsed.success) {
      throw new NhlError(`Response failed validation: ${describeIssues(parsed.error)}`, apiPath);
    }

    const ttl = resource ? resource.ttl(parsed.data, new Date(t)) : 5 * 60_000;
    const values = { body, fetchedAt: t, expiresAt: t + ttl, failCount: 0, lastError: null, lastErrorAt: null };
    db.insert(dbSchema.apiCache)
      .values({ path: apiPath, ...values })
      .onConflictDoUpdate({ target: dbSchema.apiCache.path, set: values })
      .run();
    coldFailures.delete(apiPath);

    return { data: parsed.data, meta: { path: apiPath, mode: "live", source: "live", fetchedAt: t, stale: false } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof NhlError ? err.status : undefined;

    if (!row) {
      const count = (coldFailures.get(apiPath)?.count ?? 0) + 1;
      // A 404 is an answer, not an outage: remember it briefly without escalating.
      coldFailures.set(apiPath, { until: t + (status === 404 ? 60_000 : backoffMs(count)), count, error: message });
      warn(`${apiPath}: ${message} (no cached copy)`);
      throw err instanceof NhlError ? err : new NhlError(message, apiPath, status);
    }

    const failCount = row.failCount + 1;
    const retryIn = backoffMs(failCount);
    db.update(dbSchema.apiCache)
      .set({ failCount, lastError: message, lastErrorAt: t, expiresAt: t + retryIn })
      .where(eq(dbSchema.apiCache.path, apiPath))
      .run();
    warn(`${apiPath}: ${message}. Serving the copy from ${new Date(row.fetchedAt).toISOString()}; retry in ${Math.round(retryIn / 1000)} s`);

    const cached = zschema.safeParse(JSON.parse(row.body));
    if (!cached.success) throw new NhlError(`${message}; cached copy is also invalid`, apiPath, status);
    return {
      data: cached.data,
      meta: { path: apiPath, mode: "live", source: "stale", fetchedAt: row.fetchedAt, stale: true, warning: message },
    };
  }
}

// --------------------------------------------------------------------------- entry point

type ReplayHook = <T>(apiPath: string, schema: z.ZodType<T>) => Promise<Result<T> | null>;
let replayHook: ReplayHook | undefined;
/** Registered by lib/nhl/replay.ts so this module doesn't import it (avoids a cycle). */
export function registerReplay(hook: ReplayHook) {
  replayHook = hook;
}

/**
 * Fetch and validate one endpoint in the current mode.
 * `modeOverride` lets replay mode read its underlying data without recursing into itself.
 */
export async function getResource<T>(apiPath: string, zschema: z.ZodType<T>, modeOverride?: NhlMode): Promise<Result<T>> {
  const mode = modeOverride ?? nhlMode();
  if (mode === "replay") {
    const replayed = replayHook ? await replayHook(apiPath, zschema) : null;
    if (replayed) return replayed;
    // Everything the replay doesn't cover comes from fixtures, then live as a fallback.
    try {
      return await fromFixture(apiPath, zschema, "replay");
    } catch (err) {
      if (err instanceof NhlError && err.status === 404) return fromLive(apiPath, zschema);
      throw err;
    }
  }
  if (mode === "fixtures") return fromFixture(apiPath, zschema, "fixtures");
  return fromLive(apiPath, zschema);
}

/** For the status page: every cached path and its health. */
export function cacheStatus() {
  return getDb()
    .select({
      path: dbSchema.apiCache.path,
      fetchedAt: dbSchema.apiCache.fetchedAt,
      expiresAt: dbSchema.apiCache.expiresAt,
      failCount: dbSchema.apiCache.failCount,
      lastError: dbSchema.apiCache.lastError,
      lastErrorAt: dbSchema.apiCache.lastErrorAt,
    })
    .from(dbSchema.apiCache)
    .all();
}

/** Tests: forget in-memory backoff state. */
export function resetClientStateForTests() {
  inFlight.clear();
  coldFailures.clear();
  fixtureCapturedAt = undefined;
}
