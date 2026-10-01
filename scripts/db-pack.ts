/**
 * Writes a compact single-file copy of the database (no write-ahead log, old cache rows
 * dropped) for saving between scheduled runs.  npm run db:pack -- <output file>
 */
import { existsSync, rmSync } from "node:fs";
import { getDb } from "../db";

const out = process.argv[2] ?? "db/packed.sqlite";
const db = getDb().$client;
// Cached NHL responses older than 3 days are refetched anyway; finished-game pages keep theirs.
const cutoff = Date.now() - 3 * 86_400_000;
const dropped = db.prepare(`DELETE FROM api_cache WHERE fetched_at < ? AND path NOT LIKE '/gamecenter/%'`).run(cutoff).changes;
db.pragma("wal_checkpoint(TRUNCATE)");
if (existsSync(out)) rmSync(out);
db.prepare("VACUUM INTO ?").run(out);
console.log(`Packed database to ${out} (${dropped} old cache rows dropped).`);
