import type { RequirementRule } from "@/lib/solver/types";

/** Graduation requirements for the fixture school. */
export const FIXTURE_REQUIREMENTS: readonly RequirementRule[] = [
  { kind: "credits_in_subject", id: "req-english", label: "English", subject: "english", credits: 4 },
  { kind: "credits_in_subject", id: "req-math", label: "Mathematics", subject: "math", credits: 3 },
  { kind: "credits_in_subject", id: "req-science", label: "Science", subject: "science", credits: 3 },
  { kind: "credits_in_subject", id: "req-social", label: "Social Studies", subject: "social_studies", credits: 3 },
  { kind: "credits_in_subject", id: "req-language", label: "World Language", subject: "world_language", credits: 2 },
  { kind: "credits_in_subject", id: "req-pe-health", label: "PE & Health", subject: "pe_health", credits: 1 },
  { kind: "specific_course", id: "req-health-course", label: "Health", courseId: "health" },
  { kind: "total_credits", id: "req-total", label: "Total credits", credits: 22 },
];
