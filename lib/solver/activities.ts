/**
 * Extracurricular budgeting and meeting conflicts.
 *
 * The governing idea is that a school year is not one undifferentiated block
 * of time. A student who runs track in the spring and debates in the fall is
 * never simultaneously doing both, and a planner that adds those hours
 * together would tell them they are overcommitted when they are not. Hours are
 * therefore tallied per season, and the year's headline figure is its worst
 * season rather than its sum.
 */

import type {
  ActiveSeason,
  ActivityConflict,
  ActivitySelection,
  Club,
  ClubMeeting,
  Grade,
  HourBudget,
  Season,
} from "./types";
import { ACTIVE_SEASONS, DEFAULT_WEEKLY_HOUR_CAP, GRADES } from "./types";

/** The seasons a club actually occupies. */
export function seasonsOf(season: Season): readonly ActiveSeason[] {
  return season === "year_round" ? ACTIVE_SEASONS : [season];
}

/** Do two clubs ever run at the same time of year? */
export function seasonsOverlap(a: Season, b: Season): boolean {
  return seasonsOf(a).some((season) => seasonsOf(b).includes(season));
}

/** Grades covered by a selection, clamped to grades 9-12. */
function gradesOf(selection: ActivitySelection): Grade[] {
  const from = Math.max(selection.startGrade, 9);
  const to = Math.min(selection.endGrade, 12);
  const grades: Grade[] = [];
  for (let grade = from; grade <= to; grade += 1) grades.push(grade as Grade);
  return grades;
}

/**
 * Weekly hours for each school year, broken out by season.
 *
 * A year-round club contributes its hours to every season, because that is
 * what year-round means.
 */
export function weeklyHourBudgets(
  selections: readonly ActivitySelection[],
  clubs: readonly Club[],
  cap: number = DEFAULT_WEEKLY_HOUR_CAP,
): HourBudget[] {
  const byId = new Map(clubs.map((club) => [club.id, club]));

  return GRADES.map((grade) => {
    const bySeason: Record<ActiveSeason, number> = { fall: 0, winter: 0, spring: 0 };

    for (const selection of selections) {
      const club = byId.get(selection.clubId);
      if (club === undefined) continue;
      if (!gradesOf(selection).includes(grade)) continue;

      for (const season of seasonsOf(club.season)) {
        bySeason[season] += club.weeklyHours;
      }
    }

    const peak = Math.max(...ACTIVE_SEASONS.map((season) => bySeason[season]));

    return { grade, bySeason, peak, cap, overCap: peak > cap };
  });
}

/** Is this many weekly hours over the cap? */
export function exceedsCap(
  weeklyHours: number,
  cap: number = DEFAULT_WEEKLY_HOUR_CAP,
): boolean {
  return weeklyHours > cap;
}

/**
 * Do two meetings collide?
 *
 * Intervals are half-open, so a club that ends at 16:00 and one that starts at
 * 16:00 do not conflict -- back-to-back is not a clash, and flagging it would
 * train students to ignore the warnings that matter.
 */
export function meetingsOverlap(a: ClubMeeting, b: ClubMeeting): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/**
 * Every pair of selected activities that the student cannot actually attend
 * both of: same year, overlapping season, same day, overlapping times.
 *
 * All four conditions matter. Drop the season check and the planner starts
 * inventing clashes between activities months apart.
 */
export function meetingConflicts(
  selections: readonly ActivitySelection[],
  clubs: readonly Club[],
): ActivityConflict[] {
  const byId = new Map(clubs.map((club) => [club.id, club]));
  const conflicts: ActivityConflict[] = [];

  for (const grade of GRADES) {
    const active = selections
      .filter((selection) => gradesOf(selection).includes(grade))
      .map((selection) => byId.get(selection.clubId))
      .filter((club): club is Club => club !== undefined);

    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const first = active[i]!;
        const second = active[j]!;
        if (!seasonsOverlap(first.season, second.season)) continue;

        const shared = seasonsOf(first.season).filter((season) =>
          seasonsOf(second.season).includes(season),
        );

        for (const meetingA of first.meetings) {
          for (const meetingB of second.meetings) {
            if (!meetingsOverlap(meetingA, meetingB)) continue;

            for (const season of shared) {
              conflicts.push({
                grade,
                season,
                clubIds: [first.id, second.id],
                dayOfWeek: meetingA.dayOfWeek,
                reason:
                  `${first.name} and ${second.name} both meet on ` +
                  `${DAY_NAMES[meetingA.dayOfWeek]} in the ${SEASON_NAMES[season]}.`,
              });
            }
          }
        }
      }
    }
  }

  return conflicts;
}

const DAY_NAMES: Readonly<Record<number, string>> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

const SEASON_NAMES: Readonly<Record<ActiveSeason, string>> = {
  fall: "fall",
  winter: "winter",
  spring: "spring",
};
