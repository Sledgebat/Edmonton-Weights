import { fail, ok } from "@/lib/api";
import "@/lib/nhl";
import { dataStatus } from "@/lib/nhl/status";

/** Data-layer health: mode, every cached endpoint and its freshness, replay progress. */
export async function GET() {
  try {
    return ok(await dataStatus());
  } catch (err) {
    return fail(err);
  }
}
