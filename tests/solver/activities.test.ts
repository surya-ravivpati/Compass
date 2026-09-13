import { describe, expect, it } from "vitest";
import {
  exceedsCap,
  meetingConflicts,
  meetingsOverlap,
  seasonsOverlap,
  weeklyHourBudgets,
} from "@/lib/solver/activities";
import type { ActivitySelection, Grade, HourBudget } from "@/lib/solver/types";
import { minutesFromHHMM } from "@/lib/solver/types";
import { FIXTURE_CLUBS } from "./fixtures";

const pick = (clubId: string, startGrade: Grade = 9, endGrade: Grade = 12): ActivitySelection => ({
  clubId,
  startGrade,
  endGrade,
});

const budgets = (selections: ActivitySelection[], cap?: number) =>
  weeklyHourBudgets(selections, FIXTURE_CLUBS, cap);

const forGrade = (all: HourBudget[], grade: Grade): HourBudget => {
  const found = all.find((budget) => budget.grade === grade);
  expect(found).toBeDefined();
  return found!;
};

const conflicts = (selections: ActivitySelection[]) =>
  meetingConflicts(selections, FIXTURE_CLUBS);

describe("weeklyHourBudgets", () => {
  it("reports a budget for each of the four years", () => {
    expect(budgets([]).map((b) => b.grade)).toEqual([9, 10, 11, 12]);
  });

  it("keeps each season's hours separate", () => {
    const grade9 = forGrade(
      budgets([pick("debate"), pick("robotics-team"), pick("track-and-field")]),
      9,
    );
    expect(grade9.bySeason).toEqual({ fall: 6, winter: 8, spring: 12 });
  });

  it("reports the worst season, not the sum of all three", () => {
    // A fall commitment and a spring commitment never cost the same week.
    // Summing them would tell a perfectly reasonable student they are
    // drowning.
    const grade9 = forGrade(
      budgets([pick("debate"), pick("robotics-team"), pick("track-and-field")]),
      9,
    );
    expect(grade9.peak).toBe(12);
    expect(grade9.peak).not.toBe(6 + 8 + 12);
  });

  it("charges a year-round club to every season", () => {
    const grade9 = forGrade(budgets([pick("student-government")]), 9);
    expect(grade9.bySeason).toEqual({ fall: 3, winter: 3, spring: 3 });
    expect(grade9.peak).toBe(3);
  });

  it("adds year-round hours on top of seasonal ones", () => {
    const grade9 = forGrade(budgets([pick("debate"), pick("student-government")]), 9);
    expect(grade9.bySeason.fall).toBe(9);
    expect(grade9.bySeason.winter).toBe(3);
  });

  it("counts a club only in the years it is selected for", () => {
    const all = budgets([pick("track-and-field", 10, 11)]);
    expect(forGrade(all, 9).peak).toBe(0);
    expect(forGrade(all, 10).peak).toBe(12);
    expect(forGrade(all, 11).peak).toBe(12);
    expect(forGrade(all, 12).peak).toBe(0);
  });

  it("ignores a selection naming a club that does not exist", () => {
    expect(forGrade(budgets([pick("no-such-club")]), 9).peak).toBe(0);
  });

  describe("against the cap", () => {
    it("stays under by default when the load is reasonable", () => {
      const grade9 = forGrade(budgets([pick("debate"), pick("student-government")]), 9);
      expect(grade9.cap).toBe(15);
      expect(grade9.overCap).toBe(false);
    });

    it("goes over once a single season exceeds it", () => {
      const grade9 = forGrade(budgets([pick("debate"), pick("marching-band")]), 9);
      expect(grade9.bySeason.fall).toBe(16);
      expect(grade9.overCap).toBe(true);
    });

    it("respects a cap the student has changed", () => {
      const selections = [pick("track-and-field")];
      expect(forGrade(budgets(selections, 15), 9).overCap).toBe(false);
      expect(forGrade(budgets(selections, 10), 9).overCap).toBe(true);
    });

    it("treats exactly the cap as within budget", () => {
      expect(exceedsCap(15, 15)).toBe(false);
      expect(exceedsCap(15.5, 15)).toBe(true);
    });
  });
});

describe("seasonsOverlap", () => {
  it("is false for different seasons", () => {
    expect(seasonsOverlap("fall", "spring")).toBe(false);
  });

  it("is true for the same season", () => {
    expect(seasonsOverlap("fall", "fall")).toBe(true);
  });

  it("is true for anything against year-round", () => {
    expect(seasonsOverlap("year_round", "winter")).toBe(true);
    expect(seasonsOverlap("spring", "year_round")).toBe(true);
  });
});

describe("meetingsOverlap", () => {
  const meeting = (dayOfWeek: 1 | 2, from: string, to: string) => ({
    dayOfWeek,
    startMinute: minutesFromHHMM(from),
    endMinute: minutesFromHHMM(to),
  } as const);

  it("is false on different days, whatever the times", () => {
    expect(meetingsOverlap(meeting(1, "15:00", "17:00"), meeting(2, "15:00", "17:00"))).toBe(false);
  });

  it("is true when the times cross", () => {
    expect(meetingsOverlap(meeting(1, "15:30", "17:00"), meeting(1, "16:00", "18:00"))).toBe(true);
  });

  it("is false for back-to-back meetings", () => {
    // One ends at 16:00 and the next starts at 16:00. Flagging that would
    // train students to ignore the warnings that matter.
    expect(meetingsOverlap(meeting(1, "15:00", "16:00"), meeting(1, "16:00", "18:00"))).toBe(false);
  });

  it("is true when one meeting contains the other", () => {
    expect(meetingsOverlap(meeting(1, "15:00", "18:00"), meeting(1, "16:00", "17:00"))).toBe(true);
  });
});

describe("meetingConflicts", () => {
  it("finds nothing for a single activity", () => {
    expect(conflicts([pick("debate")])).toEqual([]);
  });

  it("flags two clubs that share a season, a day, and a time", () => {
    const found = conflicts([pick("debate", 9, 9), pick("marching-band", 9, 9)]);
    expect(found).toHaveLength(1);
    expect(found[0]?.clubIds).toEqual(["debate", "marching-band"]);
    expect(found[0]?.season).toBe("fall");
    expect(found[0]?.grade).toBe(9);
    expect(found[0]?.reason).toBe(
      "Debate Team and Marching Band both meet on Monday in the fall.",
    );
  });

  it("does NOT flag overlapping times in different seasons", () => {
    // Debate and Robotics both meet Monday 15:30, but one is a fall activity
    // and the other a winter one. They never collide in practice, and saying
    // they do would be the planner inventing a problem.
    expect(conflicts([pick("debate"), pick("robotics-team")])).toEqual([]);
  });

  it("flags a year-round club against a seasonal one", () => {
    const found = conflicts([pick("debate", 9, 9), pick("math-team", 9, 9)]);
    expect(found).toHaveLength(1);
    expect(found[0]?.season).toBe("fall");
    expect(found[0]?.dayOfWeek).toBe(4);
  });

  it("does not flag back-to-back meetings on the same day", () => {
    // Student Government finishes at 16:00; Marching Band starts at 16:00.
    expect(conflicts([pick("student-government", 9, 9), pick("marching-band", 9, 9)])).toEqual([]);
  });

  it("reports a conflict in each year both clubs are selected", () => {
    const found = conflicts([pick("debate", 9, 10), pick("marching-band", 9, 10)]);
    expect(found.map((c) => c.grade)).toEqual([9, 10]);
  });

  it("does not flag clubs whose selected years do not overlap", () => {
    expect(conflicts([pick("debate", 9, 9), pick("marching-band", 11, 12)])).toEqual([]);
  });

  it("ignores selections naming clubs that do not exist", () => {
    expect(conflicts([pick("no-such-club"), pick("debate")])).toEqual([]);
  });
});
