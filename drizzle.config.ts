import { defineConfig } from "drizzle-kit";

// Schema and migrations arrive in Phase 3 (data layer).
export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "./db/edmontonweights.sqlite" },
});
