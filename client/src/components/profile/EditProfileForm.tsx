import { useRef, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "@/types";
import ProfileAvatar from "@/components/profile/ProfileAvatar";

interface EditProfileFormProps {
  user: User;
  onSaved?: (user: User) => void;
  onCancel?: () => void;
}

interface ProfileUpdatePayload {
  username?: string;
  bio?: string;
  avatar?: string | null;
}

export default function EditProfileForm({ user, onSaved, onCancel }: EditProfileFormProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatar, setAvatar] = useState<string | null>(user.avatar);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const trimmedUsername = username.trim();
  const trimmedBio = bio.trim();
  const usernameError =
    trimmedUsername.length < 3
      ? "Username must be at least 3 characters."
      : trimmedUsername.length > 32
        ? "Username must be 32 characters or fewer."
        : /\s/.test(trimmedUsername)
          ? "Username cannot contain spaces."
          : null;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAvatar(data.url);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (saving || uploading || usernameError) return;

    const payload: ProfileUpdatePayload = {};
    if (trimmedUsername !== user.username) payload.username = trimmedUsername;
    if (trimmedBio !== (user.bio ?? "")) payload.bio = trimmedBio;
    if (avatar !== user.avatar) payload.avatar = avatar;

    if (Object.keys(payload).length === 0) {
      toast.info("No changes to save.");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.patch("/users/me", payload);
      const updated = data.user as User;
      useAuthStore.getState().setUser(updated);
      setUsername(updated.username);
      setBio(updated.bio ?? "");
      setAvatar(updated.avatar);
      toast.success("Profile updated.");
      onSaved?.(updated);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <ProfileAvatar username={trimmedUsername || user.username} avatar={avatar} className="h-16 w-16 text-2xl" />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload photo"}
          </button>
          {avatar && (
            <button
              type="button"
              onClick={() => setAvatar(null)}
              disabled={uploading}
              className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div>
        <label htmlFor="edit-profile-avatar-url" className="mb-2 block text-sm font-medium text-gray-300">
          Avatar URL
        </label>
        <input
          id="edit-profile-avatar-url"
          type="text"
          value={avatar ?? ""}
          onChange={(e) => setAvatar(e.target.value || null)}
          placeholder="https://example.com/avatar.png"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="edit-profile-username" className="mb-2 block text-sm font-medium text-gray-300">
          Username
        </label>
        <input
          id="edit-profile-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onBlur={() => setUsername(trimmedUsername)}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
        />
        {usernameError && <p className="mt-1 text-xs text-red-400">{usernameError}</p>}
      </div>

      <div>
        <label htmlFor="edit-profile-bio" className="mb-2 block text-sm font-medium text-gray-300">
          Bio
        </label>
        <textarea
          id="edit-profile-bio"
          rows={3}
          maxLength={500}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell people about yourself"
          className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
        />
        <p className="mt-1 text-right text-xs text-gray-500">{bio.length}/500</p>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading || !!usernameError}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
