import { useRef, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { uploadErrorMessage, uploadMedia } from "@/lib/upload";
import { useToast } from "@/stores/toastStore";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "@/types";
import ProfileAvatar from "@/components/profile/ProfileAvatar";
import Media from "@/components/Media";

interface EditProfileFormProps {
  user: User;
  onSaved?: (user: User) => void;
  onCancel?: () => void;
}

interface ProfileUpdatePayload {
  username?: string;
  bio?: string;
  avatar?: string | null;
  cover?: string | null;
  isPrivate?: boolean;
}

export default function EditProfileForm({ user, onSaved, onCancel }: EditProfileFormProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatar, setAvatar] = useState<string | null>(user.avatar);
  const [cover, setCover] = useState<string | null>(user.cover ?? null);
  const [isPrivate, setIsPrivate] = useState(user.isPrivate ?? false);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
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
      // The URL is a Cloudinary delivery address once this returns; it is
      // persisted when the form is saved, not before.
      const uploaded = await uploadMedia(file);
      setAvatar(uploaded.url);
    } catch (err) {
      toast.error(uploadErrorMessage(err, "Could not upload your photo"));
    } finally {
      setUploading(false);
    }
  };

  const handleCoverChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadingCover(true);
    try {
      const uploaded = await uploadMedia(file);
      setCover(uploaded.url);
    } catch (err) {
      toast.error(uploadErrorMessage(err, "Could not upload your banner"));
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSave = async () => {
    if (saving || uploading || uploadingCover || usernameError) return;

    const payload: ProfileUpdatePayload = {};
    if (trimmedUsername !== user.username) payload.username = trimmedUsername;
    if (trimmedBio !== (user.bio ?? "")) payload.bio = trimmedBio;
    if (avatar !== user.avatar) payload.avatar = avatar;
    if (cover !== (user.cover ?? null)) payload.cover = cover;
    if (isPrivate !== (user.isPrivate ?? false)) payload.isPrivate = isPrivate;

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
      setCover(updated.cover ?? null);
      setIsPrivate(updated.isPrivate ?? false);
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
      {/*
        The avatar sits on the same accent gradient it will carry on the
        profile page, with a plain 1px rim — the lit halo is reserved for the
        larger identity slot there, where there is room for it.
      */}
      <div className="flex flex-wrap items-center gap-4">
        <ProfileAvatar
          username={trimmedUsername || user.username}
          avatar={avatar}
          className="h-16 w-16 text-2xl ring-1 ring-white/15"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-ghost"
          >
            {uploading ? "Uploading..." : "Upload photo"}
          </button>
          {avatar && (
            <button
              type="button"
              onClick={() => setAvatar(null)}
              disabled={uploading}
              className="btn-danger"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/*
        Banner. Same upload path as the avatar; the profile draws it as the
        wide cover sitting behind the avatar, so it is previewed at the same
        wide aspect ratio here.
      */}
      <div>
        <span className="field-label">Banner</span>
        <div className="relative mb-2 h-24 overflow-hidden rounded-xl border border-gray-700 bg-gradient-to-br from-accent-600/45 via-accent-500/20 to-accent-400/5">
          {cover && (
            <Media src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
            className="btn-ghost"
          >
            {uploadingCover ? "Uploading..." : "Upload banner"}
          </button>
          {cover && (
            <button
              type="button"
              onClick={() => setCover(null)}
              disabled={uploadingCover}
              className="btn-danger"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={handleCoverChange}
        />
      </div>

      <div>
        <label htmlFor="edit-profile-avatar-url" className="field-label">
          Avatar URL
        </label>
        <input
          id="edit-profile-avatar-url"
          type="text"
          value={avatar ?? ""}
          onChange={(e) => setAvatar(e.target.value || null)}
          placeholder="https://example.com/avatar.png"
          className="field"
        />
      </div>

      <div>
        <label htmlFor="edit-profile-cover-url" className="field-label">
          Banner URL
        </label>
        <input
          id="edit-profile-cover-url"
          type="text"
          value={cover ?? ""}
          onChange={(e) => setCover(e.target.value || null)}
          placeholder="https://example.com/banner.png"
          className="field"
        />
      </div>

      <div>
        <label htmlFor="edit-profile-username" className="field-label">
          Username
        </label>
        <input
          id="edit-profile-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onBlur={() => setUsername(trimmedUsername)}
          className="field"
        />
        {usernameError && <p className="mt-1.5 text-xs text-red-400">{usernameError}</p>}
      </div>

      <div>
        <label htmlFor="edit-profile-bio" className="field-label">
          Bio
        </label>
        <textarea
          id="edit-profile-bio"
          rows={3}
          maxLength={500}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell people about yourself"
          className="field resize-none"
        />
        {/* Tabular figures keep the counter from shifting the rest of the row
            sideways on every keystroke as the digit count changes width. */}
        <p className="tabular mt-1.5 text-right text-xs text-gray-500">{bio.length}/500</p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-700 bg-gray-800 p-3">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-accent-600"
        />
        <span>
          <span className="block text-sm font-medium text-gray-200">Private account</span>
          <span className="block text-xs text-gray-500">
            Only followers can see your posts.
          </span>
        </span>
      </label>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading || uploadingCover || !!usernameError}
          className="btn-primary"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
