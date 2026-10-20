import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api, { apiErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

/**
 * Settings → Account: change your sign-in address.
 *
 * Changing it puts the account back into the unverified state on purpose: the
 * new address is unproven until someone clicks a link inside that inbox, and
 * carrying the old "verified" flag over would let anyone who can receive mail
 * at an address they just claimed hold a confirmed account.
 *
 * The server therefore returns `verificationRequired`, and this card refuses to
 * present the change as done until it has been confirmed.
 */
const schema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

type FormData = z.infer<typeof schema>;

export default function ChangeEmailCard({ currentEmail }: { currentEmail: string }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const { data: response } = await api.patch("/users/me", { email: data.email });
      if (response.user) setUser(response.user);
      reset();

      if (response.verificationRequired) {
        setNotice({
          tone: "ok",
          text: `Address changed to ${response.email ?? data.email}. Check that inbox for the verification link — you will be signed out once you confirm it.`,
        });
      } else {
        setNotice({ tone: "ok", text: "Address updated." });
      }
    } catch (err) {
      setNotice({ tone: "error", text: apiErrorMessage(err, "Could not change your email address.") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-sm font-semibold tracking-tight text-white">Change email address</p>
      <p className="mt-1 break-all text-sm text-gray-300">{currentEmail}</p>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        The old address gets a notice so the real owner knows the account moved. The new one has to be
        verified before it works.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
        <div>
          <label htmlFor="change-email" className="field-label">
            New address
          </label>
          <input
            id="change-email"
            type="email"
            autoComplete="email"
            {...register("email")}
            className="field"
            placeholder="you@example.com"
          />
          {errors.email && <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={isSaving} className="btn-primary">
            {isSaving ? "Updating…" : "Change address"}
          </button>
        </div>
      </form>

      {notice && (
        <p
          role="status"
          className={`mt-3 text-xs ${notice.tone === "ok" ? "text-emerald-400" : "text-red-400"}`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}