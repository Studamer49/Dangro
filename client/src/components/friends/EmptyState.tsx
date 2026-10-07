interface EmptyStateProps {
  message: string;
}

export default function EmptyState({ message }: EmptyStateProps) {
  return <p className="py-6 text-center text-gray-400">{message}</p>;
}
