import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import {
  asAnon,
  asUser,
  connectAdmin,
  createUser,
  deleteUser,
  isRejected,
  prepareDatabase,
  testDatabaseUrl,
} from "./helpers/database";

/**
 * The live row-level-security proof.
 *
 * Checkpoint 2 asks for evidence, not assurances: User A must be unable to
 * read or modify User B's records. So this runs against a real Postgres, as
 * the real `authenticated` role, with the same `request.jwt.claims` PostgREST
 * sets from a Supabase JWT, against the policies that actually ship.
 *
 * Note the control assertions. A test that only checks "A cannot see B's rows"
 * passes just as happily when the connection is broken, the table is empty, or
 * every query silently fails. Each negative here is paired with a positive
 * showing the same query works for its rightful owner.
 *
 * Set TEST_DATABASE_URL to run it. Deliberately not DATABASE_URL: this file
 * creates and deletes users, and pointing it at production should be an
 * explicit act.
 */

const url = testDatabaseUrl();

const describeLive = url === undefined ? describe.skip : describe;

/**
 * A skipped proof must never read as a passed one.
 *
 * Vitest's summary does say "40 skipped", but that is easy to slide past. This
 * test always runs, so the reason appears in the output under its own name --
 * and in CI, where REQUIRE_DB_TESTS is set, a missing database fails the build
 * rather than quietly proving nothing.
 */
describe("the live RLS proof", () => {
  it(
    url === undefined
      ? "DID NOT RUN -- set TEST_DATABASE_URL to prove RLS against a real database"
      : "ran against the database in TEST_DATABASE_URL",
    () => {
      if (process.env.REQUIRE_DB_TESTS === "1") {
        expect(
          url,
          "REQUIRE_DB_TESTS=1 but TEST_DATABASE_URL is unset, so row-level " +
            "security was never actually exercised.",
        ).toBeDefined();
      }
    },
  );
});

describeLive("row-level security, against a live database", () => {
  let sql: Sql;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    sql = connectAdmin(url!);
    await prepareDatabase(sql);

    // Minimal reference rows so the foreign keys resolve. Inserted as the
    // administrator, which is how the seed script loads the catalog.
    await sql`
      INSERT INTO courses (id, code, title, credits, subject, level, terms_offered, duration_terms)
      VALUES ('rls-test-course', 'TST999', 'RLS Test Course', 1.0, 'elective', 'regular', ARRAY[1]::smallint[], 2)
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO clubs (id, name, season, weekly_hours, description)
      VALUES ('rls-test-club', 'RLS Test Club', 'fall', 2.0, 'For tests.')
      ON CONFLICT (id) DO NOTHING
    `;

    alice = await createUser(sql);
    bob = await createUser(sql);

    // Each student creates their own rows, through the same policies the
    // application goes through.
    for (const userId of [alice, bob]) {
      await asUser(sql, userId, async (tx) => {
        await tx`INSERT INTO student_profiles (user_id, grad_year) VALUES (${userId}, 2030)`;
        await tx`INSERT INTO completed_courses (user_id, course_id, grade) VALUES (${userId}, 'rls-test-course', 8)`;
        await tx`INSERT INTO plan_courses (user_id, course_id, grade, term) VALUES (${userId}, 'rls-test-course', 10, 1)`;
        await tx`INSERT INTO plan_activities (user_id, club_id, start_grade, end_grade) VALUES (${userId}, 'rls-test-club', 9, 12)`;
      });
    }
  }, 60_000);

  afterAll(async () => {
    if (sql === undefined) return;
    if (alice !== undefined) await deleteUser(sql, alice);
    if (bob !== undefined) await deleteUser(sql, bob);
    await sql`DELETE FROM courses WHERE id = 'rls-test-course'`;
    await sql`DELETE FROM clubs WHERE id = 'rls-test-club'`;
    await sql.end();
  });

  describe("control: the policies do not simply block everything", () => {
    it("lets each student read their own rows", async () => {
      for (const [name, userId] of [["alice", () => alice], ["bob", () => bob]] as const) {
        const rows = await asUser(sql, userId(), (tx) =>
          tx`SELECT user_id FROM student_profiles`,
        );
        expect(rows.length, `${name} cannot see their own profile`).toBe(1);
        expect(rows[0]?.user_id).toBe(userId());
      }
    });

    it("lets a student update their own row", async () => {
      const result = await asUser(sql, alice, (tx) =>
        tx`UPDATE student_profiles SET weekly_hour_cap = 12 WHERE user_id = ${alice}`,
      );
      expect(result.count).toBe(1);
    });
  });

  const OWNED_TABLES = [
    "student_profiles",
    "completed_courses",
    "plan_courses",
    "plan_activities",
  ] as const;

  describe.each(OWNED_TABLES)("%s", (table) => {
    it("shows a student only their own rows", async () => {
      const rows = await asUser(sql, alice, (tx) =>
        tx`SELECT user_id FROM ${tx(table)}`,
      );
      // Other students' rows exist; they are simply invisible.
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.user_id).toBe(alice);
      }
    });

    it("hides another student's rows even when asked for by id", async () => {
      const rows = await asUser(sql, alice, (tx) =>
        tx`SELECT * FROM ${tx(table)} WHERE user_id = ${bob}`,
      );
      expect(rows.length).toBe(0);
    });

    it("refuses to update another student's rows", async () => {
      const result = await asUser(sql, alice, (tx) =>
        tx`UPDATE ${tx(table)} SET user_id = user_id WHERE user_id = ${bob}`,
      );
      expect(result.count).toBe(0);

      // And the row is genuinely still there, seen from its owner.
      const survivors = await asUser(sql, bob, (tx) =>
        tx`SELECT * FROM ${tx(table)} WHERE user_id = ${bob}`,
      );
      expect(survivors.length).toBeGreaterThan(0);
    });

    it("refuses to delete another student's rows", async () => {
      const result = await asUser(sql, alice, (tx) =>
        tx`DELETE FROM ${tx(table)} WHERE user_id = ${bob}`,
      );
      expect(result.count).toBe(0);

      const survivors = await asUser(sql, bob, (tx) =>
        tx`SELECT * FROM ${tx(table)} WHERE user_id = ${bob}`,
      );
      expect(survivors.length).toBeGreaterThan(0);
    });

    it("refuses to hand a row to another student", async () => {
      // USING would allow this update -- the row is Alice's. WITH CHECK is
      // what stops the row becoming Bob's.
      const rejected = await isRejected(() =>
        asUser(sql, alice, (tx) =>
          tx`UPDATE ${tx(table)} SET user_id = ${bob} WHERE user_id = ${alice}`,
        ),
      );
      expect(rejected).toBe(true);
    });

    it("is invisible to a signed-out visitor", async () => {
      const rejected = await isRejected(() =>
        asAnon(sql, (tx) => tx`SELECT * FROM ${tx(table)}`),
      );
      expect(rejected).toBe(true);
    });
  });

  describe("inserting rows owned by someone else", () => {
    it("is refused for a profile", async () => {
      const rejected = await isRejected(() =>
        asUser(sql, alice, (tx) =>
          tx`INSERT INTO student_profiles (user_id, grad_year) VALUES (${bob}, 2031)`,
        ),
      );
      expect(rejected).toBe(true);
    });

    it("is refused for a planned course", async () => {
      const rejected = await isRejected(() =>
        asUser(sql, alice, (tx) =>
          tx`INSERT INTO plan_courses (user_id, course_id, grade, term) VALUES (${bob}, 'rls-test-course', 11, 1)`,
        ),
      );
      expect(rejected).toBe(true);
    });

    it("is refused for a completed course", async () => {
      const rejected = await isRejected(() =>
        asUser(sql, alice, (tx) =>
          tx`INSERT INTO completed_courses (user_id, course_id, grade) VALUES (${bob}, 'rls-test-course', 9)`,
        ),
      );
      expect(rejected).toBe(true);
    });

    it("is refused for an activity", async () => {
      const rejected = await isRejected(() =>
        asUser(sql, alice, (tx) =>
          tx`INSERT INTO plan_activities (user_id, club_id, start_grade, end_grade) VALUES (${bob}, 'rls-test-club', 9, 10)`,
        ),
      );
      expect(rejected).toBe(true);
    });
  });

  describe("the catalog", () => {
    const REFERENCE_TABLES = [
      "courses",
      "course_prerequisites",
      "pathways",
      "pathway_goal_courses",
      "graduation_requirements",
      "clubs",
      "club_meetings",
    ] as const;

    it.each(REFERENCE_TABLES)("lets a signed-in student read %s", async (table) => {
      const rejected = await isRejected(() =>
        asUser(sql, alice, (tx) => tx`SELECT * FROM ${tx(table)} LIMIT 1`),
      );
      expect(rejected).toBe(false);
    });

    it("cannot be added to by a student", async () => {
      const rejected = await isRejected(() =>
        asUser(sql, alice, (tx) =>
          tx`INSERT INTO courses (id, code, title, credits, subject, level, terms_offered, duration_terms)
             VALUES ('forged', 'XXX', 'Forged', 1.0, 'elective', 'regular', ARRAY[1]::smallint[], 2)`,
        ),
      );
      expect(rejected).toBe(true);
    });

    it("cannot be altered by a student", async () => {
      const rejected = await isRejected(() =>
        asUser(sql, alice, (tx) =>
          tx`UPDATE courses SET credits = 99 WHERE id = 'rls-test-course'`,
        ),
      );
      expect(rejected).toBe(true);
    });

    it("cannot be deleted from by a student", async () => {
      // Otherwise a student could drop a course out of the catalog and take
      // every other student's plan with it, by way of ON DELETE CASCADE.
      const rejected = await isRejected(() =>
        asUser(sql, alice, (tx) => tx`DELETE FROM courses WHERE id = 'rls-test-course'`),
      );
      expect(rejected).toBe(true);
    });
  });
});
