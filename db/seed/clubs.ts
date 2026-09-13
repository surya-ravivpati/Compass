/**
 * The activity directory.
 *
 * Meeting times matter as much as the hours here: two clubs that both meet
 * Tuesday afternoon in the winter are a real conflict a student needs to see
 * before they sign up for both, and two that meet at the same hour in
 * different seasons are not.
 */

import type { Club } from "@/lib/solver/types";
import { minutesFromHHMM as at } from "@/lib/solver/types";

const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;

export const SEED_CLUBS: readonly Club[] = [
  /* ------------------------------ Fall ------------------------------- */
  {
    id: "marching-band",
    name: "Marching Band",
    season: "fall",
    weeklyHours: 12,
    description: "Field show rehearsal, home games, and weekend competitions.",
    meetings: [
      { dayOfWeek: MON, startMinute: at("15:30"), endMinute: at("17:30") },
      { dayOfWeek: WED, startMinute: at("15:30"), endMinute: at("17:30") },
      { dayOfWeek: FRI, startMinute: at("17:00"), endMinute: at("21:00") },
    ],
  },
  {
    id: "cross-country",
    name: "Cross Country",
    season: "fall",
    weeklyHours: 10,
    description: "Distance training and Saturday invitationals.",
    meetings: [
      { dayOfWeek: MON, startMinute: at("15:30"), endMinute: at("17:00") },
      { dayOfWeek: TUE, startMinute: at("15:30"), endMinute: at("17:00") },
      { dayOfWeek: THU, startMinute: at("15:30"), endMinute: at("17:00") },
      { dayOfWeek: SAT, startMinute: at("08:00"), endMinute: at("11:00") },
    ],
  },
  {
    id: "model-un",
    name: "Model United Nations",
    season: "fall",
    weeklyHours: 4,
    description: "Position papers and fall conference delegations.",
    meetings: [{ dayOfWeek: TUE, startMinute: at("15:30"), endMinute: at("17:00") }],
  },

  /* ----------------------------- Winter ------------------------------ */
  {
    id: "robotics-team",
    name: "Robotics Team",
    season: "winter",
    weeklyHours: 14,
    description: "Competition build season, from kickoff through regionals.",
    meetings: [
      { dayOfWeek: MON, startMinute: at("15:30"), endMinute: at("18:00") },
      { dayOfWeek: WED, startMinute: at("15:30"), endMinute: at("18:00") },
      { dayOfWeek: SAT, startMinute: at("09:00"), endMinute: at("14:00") },
    ],
  },
  {
    id: "science-olympiad",
    name: "Science Olympiad",
    season: "winter",
    weeklyHours: 6,
    description: "Event preparation for regional and state competition.",
    meetings: [
      { dayOfWeek: TUE, startMinute: at("15:30"), endMinute: at("17:00") },
      { dayOfWeek: THU, startMinute: at("15:30"), endMinute: at("17:00") },
    ],
  },
  {
    id: "basketball",
    name: "Basketball",
    season: "winter",
    weeklyHours: 12,
    description: "Practice, home games, and travel.",
    meetings: [
      { dayOfWeek: MON, startMinute: at("16:00"), endMinute: at("18:00") },
      { dayOfWeek: TUE, startMinute: at("16:00"), endMinute: at("18:00") },
      { dayOfWeek: WED, startMinute: at("16:00"), endMinute: at("18:00") },
      { dayOfWeek: THU, startMinute: at("16:00"), endMinute: at("18:00") },
    ],
  },
  {
    id: "winter-musical",
    name: "Winter Musical",
    season: "winter",
    weeklyHours: 10,
    description: "Rehearsal block through the February run.",
    meetings: [
      { dayOfWeek: TUE, startMinute: at("15:30"), endMinute: at("18:00") },
      { dayOfWeek: THU, startMinute: at("15:30"), endMinute: at("18:00") },
    ],
  },

  /* ----------------------------- Spring ------------------------------ */
  {
    id: "track-and-field",
    name: "Track and Field",
    season: "spring",
    weeklyHours: 12,
    description: "Daily practice and weekend meets.",
    meetings: [
      { dayOfWeek: MON, startMinute: at("15:30"), endMinute: at("17:30") },
      { dayOfWeek: TUE, startMinute: at("15:30"), endMinute: at("17:30") },
      { dayOfWeek: WED, startMinute: at("15:30"), endMinute: at("17:30") },
      { dayOfWeek: THU, startMinute: at("15:30"), endMinute: at("17:30") },
    ],
  },
  {
    id: "environmental-club",
    name: "Environmental Club",
    season: "spring",
    weeklyHours: 3,
    description: "Campus garden, waste audits, and Earth Week.",
    meetings: [{ dayOfWeek: WED, startMinute: at("15:15"), endMinute: at("16:15") }],
  },
  {
    id: "spring-play",
    name: "Spring Play",
    season: "spring",
    weeklyHours: 9,
    description: "Straight-play production, cast and crew.",
    meetings: [
      { dayOfWeek: MON, startMinute: at("15:30"), endMinute: at("17:30") },
      { dayOfWeek: THU, startMinute: at("15:30"), endMinute: at("17:30") },
    ],
  },

  /* ---------------------------- Year-round --------------------------- */
  {
    id: "student-government",
    name: "Student Government",
    season: "year_round",
    weeklyHours: 3,
    description: "Weekly council meeting, plus event planning.",
    meetings: [{ dayOfWeek: WED, startMinute: at("15:00"), endMinute: at("16:00") }],
  },
  {
    id: "math-team",
    name: "Math Team",
    season: "year_round",
    weeklyHours: 3,
    description: "Problem sets and monthly league contests.",
    meetings: [{ dayOfWeek: THU, startMinute: at("15:30"), endMinute: at("16:30") }],
  },
  {
    id: "debate",
    name: "Debate Team",
    season: "year_round",
    weeklyHours: 6,
    description: "Policy and Lincoln-Douglas debate, with weekend tournaments.",
    meetings: [
      { dayOfWeek: MON, startMinute: at("15:30"), endMinute: at("17:00") },
      { dayOfWeek: THU, startMinute: at("15:30"), endMinute: at("17:00") },
    ],
  },
  {
    id: "national-honor-society",
    name: "National Honor Society",
    season: "year_round",
    weeklyHours: 2,
    description: "Service hours and peer tutoring.",
    meetings: [{ dayOfWeek: TUE, startMinute: at("07:30"), endMinute: at("08:00") }],
  },
  {
    id: "key-club",
    name: "Key Club",
    season: "year_round",
    weeklyHours: 2,
    description: "Community service projects and volunteering.",
    meetings: [{ dayOfWeek: FRI, startMinute: at("15:00"), endMinute: at("16:00") }],
  },
  {
    id: "school-newspaper",
    name: "School Newspaper",
    season: "year_round",
    weeklyHours: 4,
    description: "Reporting, editing, and monthly production nights.",
    meetings: [{ dayOfWeek: WED, startMinute: at("16:00"), endMinute: at("17:30") }],
  },
];
