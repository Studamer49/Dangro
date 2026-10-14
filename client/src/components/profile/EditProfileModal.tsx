import { createPortal } from "react-dom";
import type { User } from "@/types";
import EditProfileForm from "@/components/profile/EditProfileForm";

interface EditProfileModalProps {
  user: User;
  onClose: () => void;
  onSaved?: (user: User) => void;
}

/**
 * Edit-profile dialog.
 *
 * The overlay is dimmed *and* blurred rather than a flat black wash: the page
 * behind stays legible as a page, which keeps the dialog feeling like a pane
 * laid over the app instead of a new window. The panel itself carries an
 * opaque glass tint so nothing shows through the form text, plus the widest
 * elevation in the app because this is the one surface that must read as
 * "above" everything else.
 */
export default function EditProfileModal({ user, onClose, onSaved }: EditProfileModalProps) {
  return createPortal(
    <div
      className="animate-overlay-in fixed inset-0 layer-overlay flex items-center justify-center bg-gray-950/70 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit profile"
        className="glass-panel animate-pop-in max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-gray-900/90 p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold tracking-tight text-white">Edit profile</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="icon-btn -mr-1.5 -mt-1.5">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <EditProfileForm user={user} onSaved={onSaved} onCancel={onClose} />
      </div>
    </div>,
    document.body
  );
}