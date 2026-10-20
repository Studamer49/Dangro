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

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11 -> "11th", 21 -> "21st". */
function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * "Today" / "Yesterday" for the two most recent days, otherwise a dated label
 * like "October 14th 2026". The year is always shown so a divider is
 * unambiguous even when the chat spans a New Year.
 */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";

  const month = date.toLocaleDateString(undefined, { month: "long" });
  return `${month} ${ordinal(date.getDate())} ${date.getFullYear()}`;
}
