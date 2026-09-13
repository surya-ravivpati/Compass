/**
 * Validation for the sign-in and sign-up forms.
 *
 * Checked on the server, in the action, before anything else happens. Client
 * validation is a convenience for the person typing; it is not a control.
 */

import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("That does not look like an email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(72, "Passwords are limited to 72 characters."),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/** Graduation year, sanity-bounded rather than pinned to the current date. */
export const gradYearSchema = z.coerce
  .number()
  .int()
  .min(2000, "That graduation year seems too early.")
  .max(2100, "That graduation year seems too far away.");

/**
 * Only same-origin paths are accepted as a post-login destination. Taking an
 * arbitrary `next` from the query string and redirecting to it is an open
 * redirect -- a link to our own login page that lands the user somewhere else
 * entirely.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (typeof next !== "string") return "/plan";
  if (!next.startsWith("/")) return "/plan";
  if (next.startsWith("//")) return "/plan";
  return next;
}
