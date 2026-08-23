/**
 * Minimal className joiner. Deliberately not clsx + tailwind-merge: the
 * component library controls its own class order, so conflict resolution has
 * not been needed. Add tailwind-merge if that stops being true.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
