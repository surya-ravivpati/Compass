/**
 * Command line entry point for loading the catalog.
 *
 *   npm run db:validate   check the catalog without touching the database
 *   npm run db:seed       validate, then load it
 *
 * Validation runs either way and aborts before any write, because a
 * half-loaded catalog gives confident, specific, wrong advice about whether a
 * student will graduate.
 */

import { closeDb, db } from "@/db";
import { seedDatabase } from "./run";
import { validateSeedData } from "./validate";

async function main(): Promise<void> {
  const validateOnly = process.argv.includes("--validate-only");

  const report = validateSeedData();
  console.log(
    `Catalog is valid: ${report.courseCount} courses, ${report.clubCount} clubs.`,
  );
  if (report.unreachableFromScratch.length > 0) {
    console.log(
      `  Note: ${report.unreachableFromScratch.length} course(s) need work ` +
        `completed before grade 9 to fit in four years: ` +
        `${report.unreachableFromScratch.join(", ")}.`,
    );
  }

  if (validateOnly) return;

  const summary = await seedDatabase(db());

  console.log(
    `Loaded ${summary.courses} courses, ${summary.prerequisites} prerequisite ` +
      `expressions, ${summary.pathways} pathways, ${summary.requirements} ` +
      `requirements, ${summary.clubs} clubs, ${summary.meetings} meetings.`,
  );

  // Reported rather than deleted. ON DELETE CASCADE from `courses` reaches
  // into student plans, so withdrawing a course is a decision for a person.
  if (summary.orphanedCourseIds.length > 0) {
    console.warn(
      `\nWarning: ${summary.orphanedCourseIds.length} course(s) are in the ` +
        `database but no longer in the catalog, and were left alone:\n  ` +
        `${summary.orphanedCourseIds.join(", ")}\n` +
        `Deleting them would remove them from every student's plan. Decide ` +
        `deliberately.`,
    );
  }
  if (summary.orphanedClubIds.length > 0) {
    console.warn(
      `\nWarning: ${summary.orphanedClubIds.length} club(s) are in the ` +
        `database but no longer in the catalog, and were left alone:\n  ` +
        `${summary.orphanedClubIds.join(", ")}`,
    );
  }
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    await closeDb().catch(() => {});
    process.exit(1);
  });
