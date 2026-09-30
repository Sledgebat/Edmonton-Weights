import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One row per NHL endpoint path. `body` is the last response that passed Zod validation,
 * so a bad or failed refresh never overwrites good data.
 */
export const apiCache = sqliteTable("api_cache", {
  path: text("path").primaryKey(),
  body: text("body").notNull(),
  /** When `body` was fetched (ms since epoch). */
  fetchedAt: integer("fetched_at").notNull(),
  /** When to try refreshing (ms since epoch). Pushed back with backoff after failures. */
  expiresAt: integer("expires_at").notNull(),
  /** Consecutive failed refreshes; drives exponential backoff. */
  failCount: integer("fail_count").notNull().default(0),
  lastError: text("last_error"),
  lastErrorAt: integer("last_error_at"),
});

/** Small key/value store for process-independent state (e.g. when a replay started). */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
