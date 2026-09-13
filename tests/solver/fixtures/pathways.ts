import type { Pathway } from "@/lib/solver/types";

/**
 * Goal pathways. A goal is a *set* of culminating courses, so deadlines come
 * out as the tightest across all of them.
 */
export const FIXTURE_PATHWAYS: readonly Pathway[] = [
  {
    id: "engineering",
    name: "Engineering",
    description: "Calculus and calculus-based physics.",
    goalCourseIds: ["ap-physics-c", "ap-calculus-ab"],
  },
  {
    id: "biomedical-engineering",
    name: "Biomedical Engineering",
    description: "Life sciences plus the full chemistry and calculus sequence.",
    goalCourseIds: ["ap-biology", "ap-chemistry", "ap-calculus-ab"],
  },
  {
    id: "computer-science",
    name: "Computer Science",
    description: "The CS sequence through AP Computer Science A.",
    goalCourseIds: ["ap-cs-a", "ap-calculus-ab"],
  },
  {
    id: "nursing",
    name: "Nursing",
    description: "Biology and chemistry at the AP level.",
    goalCourseIds: ["ap-biology", "ap-chemistry"],
  },
  {
    // Deliberately empty: with no goal, nothing imposes a deadline, and the
    // solver must not invent one.
    id: "undecided",
    name: "Undecided - keep options open",
    description: "No committed pathway yet.",
    goalCourseIds: [],
  },
];
