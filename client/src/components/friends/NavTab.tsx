interface NavTabProps {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}

export default function NavTab({ label, active, count = 0, onClick }: NavTabProps) {
  const text = count > 0 ? `${label} (${count})` : label;

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
        active
          ? "bg-accent-600 text-white"
          : "text-gray-400 hover:bg-gray-800 hover:text-white"
      }`}
    >
      {text}
    </button>
  );
}
