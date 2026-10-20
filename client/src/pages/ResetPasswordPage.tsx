import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api, { apiErrorCode, apiErrorMessage } from "@/lib/api";

/**
 * Where a password-reset link lands.
 *
 * The token is submitted together with the new password in one request, so a
 * half-entered reset cannot leave the account in a state where the link is
 * spent but the password was never set.
 */
const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

type View = "form" | "expired" | "used" | "invalid" | "missing" | "success";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [view, setView] = useState<View>(token ? "form" : "missing");
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitted = useRef(false);

  useEffect(() => {
    // Reacts to the token changing without a full reload, which is what the
    // "try again" path needs.
    setView(token ? "form" : "missing");
    submitted.current = false;
    setServerError("");
  }, [token]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    if (submitted.current) return;
    submitted.current = true;

    setIsSubmitting(true);
    setServerError("");
    try {
      await api.post("/auth/reset-password", { token, password: data.password });
      setView("success");
    } catch (err) {
      submitted.current = false;
      const code = apiErrorCode(err);
      if (code === "TOKEN_EXPIRED") setView("expired");
      else if (code === "TOKEN_ALREADY_USED") setView("used");
      else if (code === "INVALID_TOKEN") setView("invalid");
      else setServerError(apiErrorMessage(err, "Could not reset your password. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl glass-panel p-8 sm:p-10">
        {view === "success" && (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-white">Password updated</h1>
            <p className="mt-2 text-gray-400">
              Your new password is active. Every other device has been signed out.
            </p>
            <button type="button" onClick={() => navigate("/login")} className="btn-primary mt-7 w-full py-3">
              Sign in
            </button>
          </>
        )}

        {view === "form" && (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-white">Choose a new password</h1>
            <p className="mt-2 text-gray-400">
              Pick something you have not used here before. You will be signed in on this device
              afterwards.
            </p>

            {serverError && (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-5">
              <div>
                <label htmlFor="reset-password" className="field-label">
                  New password
                </label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  {...register("password")}
                  className="field"
                  placeholder="At least 8 characters"
                />
                {errors.password && (
                  <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="reset-confirm" className="field-label">
                  Confirm new password
                </label>
                <input
                  id="reset-confirm"
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

              <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
                {isSubmitting ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}

        {(view === "expired" || view === "invalid" || view === "missing") && (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              {view === "expired" ? "This link has expired" : "That link is not valid"}
            </h1>
            <p className="mt-2 text-gray-400">
              Reset links work once and are good for 30 minutes. Ask for a new one and it will
              arrive in a moment.
            </p>
            <Link to="/forgot-password" className="btn-primary mt-7 block w-full py-3 text-center">
              Send a new link
            </Link>
          </>
        )}

        {view === "used" && (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              This link has already been used
            </h1>
            <p className="mt-2 text-gray-400">
              A password was already set with this link. If that was you, sign in with it — or ask
              for a fresh link if you have been locked out.
            </p>
            <div className="mt-7 flex flex-col gap-3">
              <button type="button" onClick={() => navigate("/login")} className="btn-primary w-full py-3">
                Go to sign in
              </button>
              <Link to="/forgot-password" className="btn-ghost w-full py-3 text-center">
                Send a new link
              </Link>
            </div>
          </>
        )}

        {view === "form" && (
          <p className="mt-8 text-center text-sm text-gray-400">
            <button
              type="button"
              onClick={() => {
                reset();
                submitted.current = false;
              }}
              className="font-semibold text-accent-400 transition-colors hover:text-accent-300"
            >
              Start over
            </button>
          </p>
        )}
      </div>
    </div>
  );
}