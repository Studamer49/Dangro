import type { User } from "@/types";
import EditProfileForm from "@/components/profile/EditProfileForm";

interface EditProfileModalProps {
  user: User;
  onClose: () => void;
  onSaved?: (user: User) => void;
}

export default function EditProfileModal({ user, onClose, onSaved }: EditProfileModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit profile"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-gray-900 p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Edit profile</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <EditProfileForm user={user} onSaved={onSaved} onCancel={onClose} />
      </div>
    </div>
  );
}
