import { fail, ok } from "@/lib/api";
import { nhlMode } from "@/lib/nhl";
import { restartReplay } from "@/lib/nhl/replay";
import { dataStatus } from "@/lib/nhl/status";

/** GET: replay progress. POST: restart the replay from pre-game (replay mode only). */
export async function GET() {
  try {
    const s = await dataStatus();
    return ok({ mode: s.mode, replay: s.replay ?? null, error: s.replayError ?? null });
  } catch (err) {
    return fail(err);
  }
}

export async function POST() {
  if (nhlMode() !== "replay") {
    return Response.json({ error: "Not in replay mode. Start with NHL_MODE=replay." }, { status: 409 });
  }
  try {
    await restartReplay();
    return ok({ restarted: true });
  } catch (err) {
    return fail(err);
  }
}
