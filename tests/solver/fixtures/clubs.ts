import type { Club } from "@/lib/solver/types";
import { minutesFromHHMM as at } from "@/lib/solver/types";

/**
 * Fixture clubs.
 *
 * Arranged so the interesting cases are all reachable:
 *   - debate + marching band  -> same season, overlapping Monday (conflict)
 *   - debate + robotics       -> overlapping Monday, different seasons (fine)
 *   - student gov + band      -> Wednesday, 16:00 touching 16:00 (fine)
 *   - math team + debate      -> year-round meets fall, Thursday (conflict)
 */
const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5;

export const FIXTURE_CLUBS: readonly Club[] = [
  {
    id: "debate",
    name: "Debate Team",
    season: "fall",
    weeklyHours: 6,
    description: "Policy and Lincoln-Douglas debate.",
    meetings: [
      { dayOfWeek: MON, startMinute: at("15:30"), endMinute: at("17:00") },
      { dayOfWeek: THU, startMinute: at("15:30"), endMinute: at("17:00") },
    ],
  },
  {
    id: "marching-band",
    name: "Marching Band",
    season: "fall",
    weeklyHours: 10,
    description: "Field show rehearsal and Friday performances.",
    meetings: [
      { dayOfWeek: MON, startMinute: at("16:00"), endMinute: at("18:00") },
      { dayOfWeek: WED, startMinute: at("16:00"), endMinute: at("18:00") },
    ],
  },
  {
    id: "robotics-team",
    name: "Robotics Team",
    season: "winter",
    weeklyHours: 8,
    description: "Competition build season.",
    meetings: [
      { dayOfWeek: MON, startMinute: at("15:30"), endMinute: at("17:30") },
      { dayOfWeek: WED, startMinute: at("15:30"), endMinute: at("17:30") },
    ],
  },
  {
    id: "science-olympiad",
    name: "Science Olympiad",
    season: "winter",
    weeklyHours: 5,
    description: "Event preparation for regional competition.",
    meetings: [
      { dayOfWeek: TUE, startMinute: at("15:30"), endMinute: at("17:00") },
    ],
  },
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
      { dayOfWeek: FRI, startMinute: at("15:30"), endMinute: at("17:30") },
    ],
  },
  {
    id: "student-government",
    name: "Student Government",
    season: "year_round",
    weeklyHours: 3,
    description: "Weekly council meeting.",
    meetings: [
      { dayOfWeek: WED, startMinute: at("15:00"), endMinute: at("16:00") },
    ],
  },
  {
    id: "math-team",
    name: "Math Team",
    season: "year_round",
    weeklyHours: 2,
    description: "Problem sets and monthly contests.",
    meetings: [
      { dayOfWeek: THU, startMinute: at("15:30"), endMinute: at("16:30") },
    ],
  },
  {
    id: "key-club",
    name: "Key Club",
    season: "year_round",
    weeklyHours: 2,
    description: "Community service projects.",
    meetings: [
      { dayOfWeek: FRI, startMinute: at("15:00"), endMinute: at("16:00") },
    ],
  },
];
