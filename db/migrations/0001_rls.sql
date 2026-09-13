-- Row-level security.
--
-- Two rules, applied without exception:
--
--   Reference tables (the school catalog) are readable by everyone and
--   writable by no one through the API. They are loaded by the seed script,
--   which connects with the service role and bypasses all of this.
--
--   Student-owned tables are reachable only by the student who owns the row.
--   Every one of SELECT / INSERT / UPDATE / DELETE is constrained separately,
--   because a policy set that covers reads and forgets writes is not a
--   half-measure -- it is a hole.
--
-- Privileges are revoked before being granted rather than assumed. Supabase
-- sets default privileges that grant ALL on new public tables to `anon` and
-- `authenticated`, so a table that merely has no policy would still carry the
-- grant. Doing both means neither layer is load-bearing on its own.
--
-- `(SELECT auth.uid())` rather than a bare call is deliberate: wrapping it
-- lets Postgres evaluate it once per query instead of once per row.

-- ============================================================
-- Reference tables: readable by all, writable by none
-- ============================================================

ALTER TABLE public."courses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public."courses" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON public."courses" TO anon, authenticated;
--> statement-breakpoint
CREATE POLICY "courses_read_all" ON public."courses"
  FOR SELECT TO anon, authenticated
  USING (true);
--> statement-breakpoint
ALTER TABLE public."course_prerequisites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public."course_prerequisites" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON public."course_prerequisites" TO anon, authenticated;
--> statement-breakpoint
CREATE POLICY "course_prerequisites_read_all" ON public."course_prerequisites"
  FOR SELECT TO anon, authenticated
  USING (true);
--> statement-breakpoint
ALTER TABLE public."pathways" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public."pathways" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON public."pathways" TO anon, authenticated;
--> statement-breakpoint
CREATE POLICY "pathways_read_all" ON public."pathways"
  FOR SELECT TO anon, authenticated
  USING (true);
--> statement-breakpoint
ALTER TABLE public."pathway_goal_courses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public."pathway_goal_courses" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON public."pathway_goal_courses" TO anon, authenticated;
--> statement-breakpoint
CREATE POLICY "pathway_goal_courses_read_all" ON public."pathway_goal_courses"
  FOR SELECT TO anon, authenticated
  USING (true);
--> statement-breakpoint
ALTER TABLE public."graduation_requirements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public."graduation_requirements" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON public."graduation_requirements" TO anon, authenticated;
--> statement-breakpoint
CREATE POLICY "graduation_requirements_read_all" ON public."graduation_requirements"
  FOR SELECT TO anon, authenticated
  USING (true);
--> statement-breakpoint
ALTER TABLE public."clubs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public."clubs" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON public."clubs" TO anon, authenticated;
--> statement-breakpoint
CREATE POLICY "clubs_read_all" ON public."clubs"
  FOR SELECT TO anon, authenticated
  USING (true);
--> statement-breakpoint
ALTER TABLE public."club_meetings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public."club_meetings" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON public."club_meetings" TO anon, authenticated;
--> statement-breakpoint
CREATE POLICY "club_meetings_read_all" ON public."club_meetings"
  FOR SELECT TO anon, authenticated
  USING (true);
--> statement-breakpoint

-- ============================================================
-- Student-owned tables: each student reaches their own rows only
-- ============================================================

ALTER TABLE public."student_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public."student_profiles" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public."student_profiles" TO authenticated;
--> statement-breakpoint
CREATE POLICY "student_profiles_select_own" ON public."student_profiles"
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "student_profiles_insert_own" ON public."student_profiles"
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
-- USING decides which rows may be updated; WITH CHECK decides what they may
-- become. Both are required: without WITH CHECK a student could take one of
-- their own rows and reassign its user_id to someone else.
CREATE POLICY "student_profiles_update_own" ON public."student_profiles"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "student_profiles_delete_own" ON public."student_profiles"
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
ALTER TABLE public."completed_courses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public."completed_courses" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public."completed_courses" TO authenticated;
--> statement-breakpoint
CREATE POLICY "completed_courses_select_own" ON public."completed_courses"
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "completed_courses_insert_own" ON public."completed_courses"
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
-- USING decides which rows may be updated; WITH CHECK decides what they may
-- become. Both are required: without WITH CHECK a student could take one of
-- their own rows and reassign its user_id to someone else.
CREATE POLICY "completed_courses_update_own" ON public."completed_courses"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "completed_courses_delete_own" ON public."completed_courses"
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
ALTER TABLE public."plan_courses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public."plan_courses" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public."plan_courses" TO authenticated;
--> statement-breakpoint
CREATE POLICY "plan_courses_select_own" ON public."plan_courses"
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "plan_courses_insert_own" ON public."plan_courses"
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
-- USING decides which rows may be updated; WITH CHECK decides what they may
-- become. Both are required: without WITH CHECK a student could take one of
-- their own rows and reassign its user_id to someone else.
CREATE POLICY "plan_courses_update_own" ON public."plan_courses"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "plan_courses_delete_own" ON public."plan_courses"
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
ALTER TABLE public."plan_activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public."plan_activities" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public."plan_activities" TO authenticated;
--> statement-breakpoint
CREATE POLICY "plan_activities_select_own" ON public."plan_activities"
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "plan_activities_insert_own" ON public."plan_activities"
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
-- USING decides which rows may be updated; WITH CHECK decides what they may
-- become. Both are required: without WITH CHECK a student could take one of
-- their own rows and reassign its user_id to someone else.
CREATE POLICY "plan_activities_update_own" ON public."plan_activities"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "plan_activities_delete_own" ON public."plan_activities"
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
