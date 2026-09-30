import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, setDbForTests } from "@/db";
import {
  backoffMs,
  getResource,
  resetClientStateForTests,
  setClockForTests,
  setFetcherForTests,
} from "@/lib/nhl/client";
import { Standings } from "@/lib/nhl/schemas";

const FIXTURE = readFileSync(path.resolve(__dirname, "../../fixtures/v1/standings/now.json"), "utf8");
const PATH = "/standings/now";

let t = 1_000_000;
let calls = 0;
let respond: () => Response | Promise<Response>;

beforeEach(() => {
  process.env.NHL_MODE = "live";
  setDbForTests(openDb(":memory:"));
  resetClientStateForTests();
  t = 1_000_000;
  calls = 0;
  setClockForTests(() => t);
  respond = () => new Response(FIXTURE, { status: 200 });
  setFetcherForTests(async () => {
    calls++;
    return respond();
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setFetcherForTests(undefined);
  setClockForTests(undefined);
  setDbForTests(undefined);
  vi.restoreAllMocks();
  delete process.env.NHL_MODE;
});

describe("live mode with SQLite cache", () => {
  it("fetches once, then serves from cache until the TTL (10 min for standings)", async () => {
    const first = await getResource(PATH, Standings);
    expect(first.meta.source).toBe("live");
    expect(first.data.standings).toHaveLength(32);

    t += 9 * 60_000;
    const second = await getResource(PATH, Standings);
    expect(second.meta.source).toBe("cache");
    expect(second.meta.fetchedAt).toBe(first.meta.fetchedAt);
    expect(calls).toBe(1);

    t += 2 * 60_000;
    const third = await getResource(PATH, Standings);
    expect(third.meta.source).toBe("live");
    expect(calls).toBe(2);
  });

  it("shares one upstream request between concurrent callers", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => getResource(PATH, Standings)));
    expect(calls).toBe(1);
    expect(new Set(results.map((r) => r.meta.fetchedAt)).size).toBe(1);
  });

  it("keeps serving the last good copy when a refresh fails validation, and backs off", async () => {
    await getResource(PATH, Standings);
    const goodFetchedAt = t;

    // The NHL renames a field: validation fails.
    respond = () => new Response(JSON.stringify({ standings: [{ nope: true }] }), { status: 200 });
    t += 11 * 60_000;
    const r = await getResource(PATH, Standings);
    expect(r.meta.stale).toBe(true);
    expect(r.meta.source).toBe("stale");
    expect(r.meta.fetchedAt).toBe(goodFetchedAt);
    expect(r.meta.warning).toMatch(/validation/);
    expect(r.data.standings).toHaveLength(32);
    expect(console.warn).toHaveBeenCalled();

    // Within the backoff window: no new request, still stale.
    t += 10_000;
    const again = await getResource(PATH, Standings);
    expect(again.meta.stale).toBe(true);
    expect(calls).toBe(2);

    // After backoff the NHL is fine again: fresh data, stale flag cleared.
    respond = () => new Response(FIXTURE, { status: 200 });
    t += backoffMs(1);
    const recovered = await getResource(PATH, Standings);
    expect(recovered.meta.stale).toBe(false);
    expect(recovered.meta.source).toBe("live");
  });

  it("serves the cached copy through network errors and HTTP 500s", async () => {
    await getResource(PATH, Standings);
    respond = () => {
      throw new TypeError("fetch failed");
    };
    t += 11 * 60_000;
    expect((await getResource(PATH, Standings)).meta.stale).toBe(true);

    respond = () => new Response("oops", { status: 500 });
    t += backoffMs(2) + 1;
    const r = await getResource(PATH, Standings);
    expect(r.meta.stale).toBe(true);
    expect(r.meta.warning).toMatch(/HTTP 500/);
  });

  it("throws when there is no cached copy to fall back on", async () => {
    respond = () => new Response("down", { status: 503 });
    await expect(getResource(PATH, Standings)).rejects.toThrow(/HTTP 503/);
  });

  it("backoff grows exponentially and caps at 15 minutes", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(15 * 60_000);
  });
});

describe("fixtures mode", () => {
  it("serves saved responses without touching the network", async () => {
    process.env.NHL_MODE = "fixtures";
    const r = await getResource(PATH, Standings);
    expect(r.meta.source).toBe("fixture");
    expect(r.data.standings.length).toBe(32);
    expect(calls).toBe(0);
  });

  it("explains how to fix a missing fixture", async () => {
    process.env.NHL_MODE = "fixtures";
    await expect(getResource("/gamecenter/1/landing", Standings)).rejects.toThrow(/fixtures:capture/);
  });
});
