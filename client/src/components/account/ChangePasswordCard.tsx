import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api, { apiErrorMessage } from "@/lib/api";
import { connectSocket } from "@/lib/socket";

/**
 * Settings → Account: change your password.
 *
 * Requires the current password even though the caller is signed in. A stolen
 * access token should not be enough to take the account over permanently, and
 * one extra field is a cheap price for that.
 *
 * The server bumps the session version and returns a fresh token pair, so this
 * device stays signed in while every other one is signed out — the new token is
 * written back here rather than leaving the user to be logged out by their own
 * password change.
 */
const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "Choose a password different from your current one",
    path: ["newPassword"],
  });

type FormData = z.infer<typeof schema>;

export default function ChangePasswordCard() {
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setIsSaving(true);
    setMessage(null);
    try {
      const { data: response } = await api.post("/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });

      // Keep this device signed in with the token the server just issued.
      if (response.accessToken) {
        localStorage.setItem("accessToken", response.accessToken);
        connectSocket(response.accessToken);
      }

      reset();
      setMessage({ tone: "ok", text: response.message ?? "Password updated." });
    } catch (err) {
      setMessage({ tone: "error", text: apiErrorMessage(err, "Could not change your password.") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-sm font-semibold tracking-tight text-white">Password</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        Changing your password signs out every other device. This one stays signed in.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
        <div>
          <label htmlFor="current-password" className="field-label">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            {...register("currentPassword")}
            className="field"
            placeholder="••••••••"
          />
          {errors.currentPassword && (
            <p className="mt-1.5 text-xs text-red-400">{errors.currentPassword.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="new-password" className="field-label">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            {...register("newPassword")}
            className="field"
            placeholder="At least 8 characters"
          />
          {errors.newPassword && (
            <p className="mt-1.5 text-xs text-red-400">{errors.newPassword.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="confirm-new-password" className="field-label">
            Confirm new password
          </label>
          <input
            id="confirm-new-password"
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword")}
            className="field"
            placeholder="••••••••"
          />
          {errors.confirmPassword && (
            <p className="mt-1.5 text-xs text-red-400">{errors.confirmPassword.message}</p>
          )}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={isSaving} className="btn-primary">
            {isSaving ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>

      {message && (
        <p
          role="status"
          className={`mt-3 text-xs ${message.tone === "ok" ? "text-emerald-400" : "text-red-400"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}