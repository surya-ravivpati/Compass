import { defineConfig } from "drizzle-kit";

/**
 * `auth` is filtered out because Supabase owns that schema. db/schema.ts
 * declares `auth.users` only so the foreign keys can point at it; migrations
 * must not try to create or alter it.
 */
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/compass",
  },
  strict: true,
  verbose: true,
});
