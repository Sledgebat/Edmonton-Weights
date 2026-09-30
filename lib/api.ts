/** Helpers shared by the /api/* route handlers. */
import { NhlError, type Result } from "@/lib/nhl";

const HEADERS = { "Cache-Control": "no-store" };

export function ok(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...HEADERS, ...init?.headers } });
}

export function fail(err: unknown) {
  if (err instanceof NhlError) {
    const status = err.status === 404 ? 404 : 502;
    return Response.json({ error: err.message, path: err.path }, { status, headers: HEADERS });
  }
  console.error(err);
  return Response.json({ error: "Unexpected server error" }, { status: 500, headers: HEADERS });
}

/** Wraps a data loader: returns `{ data, meta }` as JSON, or a friendly error. */
export async function serve<T>(load: () => Promise<Result<T>>) {
  try {
    return ok(await load());
  } catch (err) {
    return fail(err);
  }
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400, headers: HEADERS });
}

export const isGameId = (s: string) => /^\d{10}$/.test(s);
export const isPlayerId = (s: string) => /^\d{7}$/.test(s);
export const isSeason = (s: string) => /^\d{8}$/.test(s) && Number(s.slice(4)) === Number(s.slice(0, 4)) + 1;
