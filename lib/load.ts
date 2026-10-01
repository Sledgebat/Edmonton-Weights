/** Load a data module without letting one failure take down the whole page. */
import { NhlError, type Result } from "@/lib/nhl";

export type Loaded<T> = { ok: true; data: T; meta: Result<T>["meta"] } | { ok: false; error: string; notFound: boolean };

export async function load<T>(fn: () => Promise<Result<T>>): Promise<Loaded<T>> {
  try {
    const r = await fn();
    return { ok: true, data: r.data, meta: r.meta };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      notFound: err instanceof NhlError && err.status === 404,
    };
  }
}
