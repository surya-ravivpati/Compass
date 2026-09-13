import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableName, isTable } from "drizzle-orm";
import * as schema from "@/db/schema";
import { REFERENCE_TABLES, STUDENT_OWNED_TABLES } from "@/db/schema";

/**
 * Static analysis of the row-level-security migration.
 *
 * The live proof in rls.test.ts needs a database and does not run everywhere.
 * This does, and it catches the failure that is actually likely: somebody adds
 * a table months from now and does not write policies for it. A table with no
 * policy is not merely unprotected -- under Supabase's default grants it is
 * world-writable.
 */

const RLS_SQL = readFileSync(
  join(process.cwd(), "db/migrations/0001_rls.sql"),
  "utf8",
);

/** Every table the Drizzle schema actually defines, in the public schema. */
const definedTables = Object.values(schema)
  .filter((value) => isTable(value))
  .map((table) => getTableName(table))
  // auth.users is Supabase's, declared only so foreign keys can reference it.
  .filter((name) => name !== "users");

describe("every table is accounted for", () => {
  it("classifies each table as either student-owned or reference", () => {
    // The check that matters most. Adding a table without deciding which side
    // of the security boundary it falls on fails here, loudly, immediately.
    const classified = new Set<string>([...STUDENT_OWNED_TABLES, ...REFERENCE_TABLES]);
    const unclassified = definedTables.filter((name) => !classified.has(name));

    expect(
      unclassified,
      "these tables have no security classification -- add them to " +
        "STUDENT_OWNED_TABLES or REFERENCE_TABLES in db/schema.ts and write " +
        "their policies in db/migrations/0001_rls.sql",
    ).toEqual([]);
  });

  it("does not classify tables that do not exist", () => {
    for (const name of [...STUDENT_OWNED_TABLES, ...REFERENCE_TABLES]) {
      expect(definedTables, `"${name}" is classified but not defined`).toContain(name);
    }
  });

  it("enables row-level security on every one of them", () => {
    for (const name of definedTables) {
      expect(RLS_SQL, `RLS not enabled on "${name}"`).toContain(
        `ALTER TABLE public."${name}" ENABLE ROW LEVEL SECURITY;`,
      );
    }
  });

  it("revokes default privileges on every one of them", () => {
    // Supabase grants ALL on new public tables to anon and authenticated by
    // default. Without an explicit revoke, a policy is the only thing standing
    // between a student and everyone else's rows.
    for (const name of definedTables) {
      expect(RLS_SQL, `privileges not revoked on "${name}"`).toContain(
        `REVOKE ALL ON public."${name}" FROM anon, authenticated;`,
      );
    }
  });
});

describe("student-owned tables", () => {
  for (const table of STUDENT_OWNED_TABLES) {
    describe(table, () => {
      it("constrains all four operations separately", () => {
        // A policy set that covers reads and forgets writes is not a
        // half-measure; it is a hole.
        for (const op of ["select", "insert", "update", "delete"]) {
          expect(RLS_SQL, `no ${op} policy on "${table}"`).toContain(
            `CREATE POLICY "${table}_${op}_own" ON public."${table}"`,
          );
        }
      });

      it("scopes every policy to the caller's own rows", () => {
        const policies = policyBlocks(table);
        expect(policies.length).toBe(4);
        for (const policy of policies) {
          expect(policy, `policy does not check auth.uid()`).toContain(
            "(SELECT auth.uid()) = user_id",
          );
          expect(policy).toContain("TO authenticated");
        }
      });

      it("stops a student reassigning a row to someone else", () => {
        // USING decides which rows may be updated; WITH CHECK decides what
        // they may become. With only the former, a student could take one of
        // their own rows and hand it to another user_id.
        const update = policyBlocks(table).find((p) => p.includes("_update_own"));
        expect(update).toBeDefined();
        expect(update).toContain("USING");
        expect(update).toContain("WITH CHECK");
      });

      it("grants nothing at all to anonymous visitors", () => {
        expect(RLS_SQL).toContain(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON public."${table}" TO authenticated;`,
        );
        expect(RLS_SQL).not.toContain(`ON public."${table}" TO anon;`);
        for (const policy of policyBlocks(table)) {
          expect(policy).not.toContain("anon");
        }
      });
    });
  }
});

describe("reference tables", () => {
  for (const table of REFERENCE_TABLES) {
    describe(table, () => {
      it("is readable by everyone", () => {
        expect(RLS_SQL).toContain(
          `GRANT SELECT ON public."${table}" TO anon, authenticated;`,
        );
        expect(RLS_SQL).toContain(`CREATE POLICY "${table}_read_all" ON public."${table}"`);
      });

      it("is writable by nobody through the API", () => {
        // The catalog is loaded by the seed script using the service role.
        // No student, signed in or not, may alter it.
        for (const op of ["INSERT", "UPDATE", "DELETE"]) {
          expect(
            RLS_SQL,
            `"${table}" grants ${op} to a client role`,
          ).not.toContain(`GRANT ${op} ON public."${table}"`);
        }
        expect(policyBlocks(table).length).toBe(1);
      });
    });
  }
});

/** Each CREATE POLICY statement for a table, as raw text. */
function policyBlocks(table: string): string[] {
  return RLS_SQL.split("--> statement-breakpoint")
    .map(stripLeadingComments)
    .filter(
      (block) =>
        block.startsWith("CREATE POLICY") && block.includes(`ON public."${table}"`),
    );
}

/** Drop the explanatory comment lines a statement may be preceded by. */
function stripLeadingComments(block: string): string {
  return block
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
}
