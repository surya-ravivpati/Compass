import { z } from "zod";

/** Grade levels on the planning board. Completed coursework can predate these. */
export const gradeSchema = z.union([
  z.literal(9), z.literal(10), z.literal(11), z.literal(12),
]);

export const termSchema = z.union([z.literal(1), z.literal(2)]);

export const courseIdSchema = z.string().min(1).max(200);

export const placementSchema = z.object({
  courseId: courseIdSchema,
  grade: gradeSchema,
  term: termSchema,
});

export type PlacementInput = z.infer<typeof placementSchema>;

/** null clears the goal -- "undecided" is a real answer, not a missing one. */
export const goalPathwaySchema = z.string().min(1).max(200).nullable();

export const weeklyHourCapSchema = z.coerce
  .number()
  .int()
  .min(1, "The cap has to be at least 1 hour.")
  .max(80, "That is more hours than a week has room for.");
