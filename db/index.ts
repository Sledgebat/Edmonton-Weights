/**
 * Shared SQLite connection (better-sqlite3 + Drizzle). Migrations run automatically on first
 * use, so `npm run dev` works on a fresh checkout; `npm run db:migrate` does the same explicitly.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const MIGRATIONS = path.join(/*turbopackIgnore: true*/ process.cwd(), "db", "migrations");

export function databasePath(): string {
  return process.env.DATABASE_URL ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "db", "edmontonweights.sqlite");
}

export function openDb(file = databasePath()): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL"); // the web server and the worker share this file
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

// One connection per process, surviving Next.js dev hot reloads.
const g = globalThis as unknown as { __ochDb?: Db };

export function getDb(): Db {
  g.__ochDb ??= openDb();
  return g.__ochDb;
}

/** Tests swap in an in-memory database. */
export function setDbForTests(db: Db | undefined) {
  g.__ochDb = db;
}

export { schema };
