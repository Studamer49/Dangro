interface EmptyStateProps {
  message: string;
}

/**
 * The shared "nothing to show" surface.
 *
 * A lone centred line of grey text is easy to miss and easy to mistake for a
 * loading failure, so the state gets a real container: a muted glyph on a soft
 * frosted square (same material as everything else, so it reads as part of the
 * page rather than an alert), the message as a semibold heading, and whatever
 * follows the first sentence as the muted supporting line. Every list in the
 * app empties through this one component, which is what keeps "no results"
 * looking identical on the Friends tabs and on Add Friend.
 */
export default function EmptyState({ message }: EmptyStateProps) {
  // "No friends yet. Add some!" -> heading + support. Copy with no internal
  // sentence break stays a single heading, which is the common case.
  const [heading, ...rest] = message.split(". ");
  const support = rest.join(". ");

  return (
    <div className="animate-fade-in flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="glass-card flex h-14 w-14 items-center justify-center rounded-2xl text-gray-500">
        <svg
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-4.5l-2 3h-1l-2-3H4"
          />
        </svg>
      </div>

      <p className="max-w-xs text-sm font-semibold text-gray-300">{heading}</p>
      {support && <p className="max-w-xs text-sm text-gray-500">{support}</p>}
    </div>
  );
}