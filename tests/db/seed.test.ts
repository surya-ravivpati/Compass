import { describe, expect, it } from "vitest";
import { validateSeedData } from "@/db/seed/validate";
import { SEED_COURSES, SEED_PATHWAYS } from "@/db/seed/catalog";
import { SEED_CLUBS } from "@/db/seed/clubs";
import { buildGraph, buildCatalog } from "@/lib/solver/graph";
import { strictlyRequired } from "@/lib/solver/reachability";

describe("the seed catalog", () => {
  it("passes every validation check", () => {
    // Shape, structure, cycles, cross-references, and pathway completability.
    // A wrong catalog does not fail quietly -- it gives confident, specific,
    // incorrect advice about whether a student will graduate.
    expect(() => validateSeedData()).not.toThrow();
  });

  it("is the size the product calls for", () => {
    const report = validateSeedData();
    expect(report.courseCount).toBeGreaterThanOrEqual(60);
    expect(report.courseCount).toBeLessThanOrEqual(100);
    expect(report.clubCount).toBeGreaterThanOrEqual(10);
  });

  it("covers every subject", () => {
    const subjects = new Set(SEED_COURSES.map((course) => course.subject));
    expect(subjects).toEqual(
      new Set([
        "math", "science", "english", "social_studies", "world_language",
        "computer_science", "arts", "pe_health", "elective",
      ]),
    );
  });

  it("has clubs in every season", () => {
    const seasons = new Set(SEED_CLUBS.map((club) => club.season));
    expect(seasons).toEqual(new Set(["fall", "winter", "spring", "year_round"]));
  });

  it("contains chains long enough to actually run out of room", () => {
    // If every course fit from a standing start, the catalog would have no
    // long chains in it -- and nothing for this product to be useful about.
    const report = validateSeedData();
    expect(report.unreachableFromScratch.length).toBeGreaterThan(0);
  });

  it("leaves every pathway completable by a student who did Algebra 1 early", () => {
    // validateSeedData throws otherwise; this names the guarantee so it is not
    // lost among the other checks.
    expect(() => validateSeedData()).not.toThrow();
    expect(SEED_PATHWAYS.length).toBeGreaterThanOrEqual(5);
  });

  it("gives the undecided pathway no goals, so nothing imposes a deadline", () => {
    const undecided = SEED_PATHWAYS.find((p) => p.id === "undecided");
    expect(undecided?.goalCourseIds).toEqual([]);
  });

  it("never forces a student onto the honors track to reach a goal", () => {
    // Honors and regular sections are alternatives -- Algebra 2 or Honors
    // Algebra 2 both lead onward. If some honors section were strictly
    // required *as a prerequisite*, students on the regular track would find a
    // pathway quietly closed to them with no explanation.
    //
    // A pathway's own goal courses are exempt: choosing Engineering is
    // choosing Robotics Engineering, honors or not.
    const graph = buildGraph(buildCatalog(SEED_COURSES));
    for (const pathway of SEED_PATHWAYS) {
      const goals = new Set(pathway.goalCourseIds);
      const honorsPrerequisites = [...strictlyRequired(graph, pathway.goalCourseIds)]
        .filter((id) => !goals.has(id))
        .filter((id) => graph.catalog.byId.get(id)?.level === "honors");
      expect(honorsPrerequisites, `pathway ${pathway.id}`).toEqual([]);
    }
  });
});
