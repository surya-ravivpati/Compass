/**
 * Join class names, dropping anything falsy.
 *
 * Deliberately not `clsx` or `tailwind-merge`: the app has a fixed token set
 * and components own their own classes, so there is nothing to de-duplicate.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
