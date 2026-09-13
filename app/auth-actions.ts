"use server";

/**
 * Authentication actions.
 *
 * Server actions rather than client-side calls, so credentials are posted
 * directly to the server and the forms work without JavaScript.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { credentialsSchema, gradYearSchema, safeNextPath } from "@/validation/auth";

function backTo(path: string, message: string, next?: string): never {
  const params = new URLSearchParams({ error: message });
  if (next !== undefined && next !== "/plan") params.set("next", next);
  redirect(`${path}?${params.toString()}`);
}

export async function signIn(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next")?.toString());
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    backTo("/login", parsed.error.issues[0]?.message ?? "Check your details.", next);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  // Supabase returns a single generic message here, which is what we want:
  // distinguishing "no such account" from "wrong password" would let anyone
  // test whether a given email has signed up.
  if (error !== null) backTo("/login", error.message, next);

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(formData: FormData): Promise<void> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    backTo("/signup", parsed.error.issues[0]?.message ?? "Check your details.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);

  if (error !== null) backTo("/signup", error.message);

  // With email confirmation switched on, sign-up succeeds without a session.
  // Say so plainly instead of dropping the student on a page that will just
  // bounce them back to login.
  if (data.session === null) {
    redirect("/signup?pending=1");
  }

  revalidatePath("/", "layout");
  redirect("/welcome");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Create or update the student's profile.
 *
 * Written through the Supabase client, not Drizzle, so this insert is subject
 * to row-level security: the `user_id` is taken from the verified session, and
 * the WITH CHECK policy would reject it even if it were not.
 */
export async function saveProfile(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError !== null || auth.user === null) redirect("/login");

  const parsed = gradYearSchema.safeParse(formData.get("gradYear"));
  if (!parsed.success) {
    backTo("/welcome", parsed.error.issues[0]?.message ?? "Check your graduation year.");
  }

  const { error } = await supabase
    .from("student_profiles")
    .upsert({ user_id: auth.user.id, grad_year: parsed.data }, { onConflict: "user_id" });

  if (error !== null) backTo("/welcome", error.message);

  revalidatePath("/", "layout");
  redirect("/plan");
}
