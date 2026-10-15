/**
 * Day-divider helpers for the chat lists.
 *
 * Everything is computed from the browser's own clock and locale, so the
 * divider reads in the viewer's timezone — a message sent at 11pm shows under
 * the sender's today and the reader's tomorrow, which is the point.
 */

/** A stable key for the calendar day an ISO timestamp falls on, locally. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today" / "Yesterday" for recent days, otherwise a localised date. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    // The year only matters once the message is not from this year.
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
