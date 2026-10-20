import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/stores/authStore";
import { apiErrorCode, apiErrorMessage } from "@/lib/api";
import VerifyEmailNotice from "@/components/account/VerifyEmailNotice";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const unverifiedEmail = useAuthStore((s) => s.unverifiedEmail);
  const clearUnverifiedEmail = useAuthStore((s) => s.clearUnverifiedEmail);
  const [error, setError] = useState("");
  /**
   * The address the server said was unverified, or null.
   *
   * Local rather than taken straight from the store, because a store value
   * survives a reload and would keep showing this panel after the user has
   * moved on and clicked a new link.
   */
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setError("");
    setIsSubmitting(true);
    try {
      await login(data.email, data.password);
      navigate("/");
    } catch (err: unknown) {
      if (apiErrorCode(err) === "EMAIL_NOT_VERIFIED") {
        setBlockedEmail(data.email);
        clearUnverifiedEmail();
      } else {
        setError(apiErrorMessage(err, "Login failed"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Someone who already knows their address is unverified — carried over from
  // a signup on this device, or from a session the server revoked — sees the
  // resend panel before typing anything.
  const shownEmail = blockedEmail ?? unverifiedEmail;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl glass-panel md:grid-cols-2">
        {/* Left: the form. Kept on the opaque-ish surface so the inputs stay
            crisp and the ambient field only shows around the card. */}
        <div className="p-8 sm:p-10">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              {shownEmail ? "Verify your email" : "Welcome back"}
            </h1>
            <p className="mt-2 text-gray-400">
              {shownEmail
                ? "We could not sign you in yet — the address is not confirmed."
                : "Sign in to pick up where you left off."}
            </p>
          </div>

          {shownEmail ? (
            <>
              <VerifyEmailNotice
                email={shownEmail}
                onBack={() => {
                  setBlockedEmail(null);
                  clearUnverifiedEmail();
                }}
              />
              <p className="mt-8 text-center text-sm text-gray-400">
                Already verified but still seeing this?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setBlockedEmail(null);
                    clearUnverifiedEmail();
                  }}
                  className="font-semibold text-accent-400 transition-colors hover:text-accent-300"
                >
                  Try signing in
                </button>
              </p>
            </>
          ) : (
            <>
              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 animate-fade-up"
                >
                  <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-4a1 1 0 100 2 1 1 0 000-2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label htmlFor="email" className="field-label">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    {...register("email")}
                    className="field"
                    placeholder="you@example.com"
                  />
                  {errors.email && (
                    <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="password" className="field-label">
                      Password
                    </label>
                    <Link
                      to="/forgot-password"
                      className="mb-1.5 text-xs font-semibold text-accent-400 transition-colors hover:text-accent-300"
                    >
                      Forgot?
                    </Link>
                  </div>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    {...register("password")}
                    className="field"
                    placeholder="••••••••"
                  />
                  {errors.password && (
                    <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>
                  )}
                </div>

                <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
                  {isSubmitting ? "Signing in…" : "Sign In"}
                </button>
              </form>

              <p className="mt-8 text-center text-sm text-gray-400">
                Need an account?{" "}
                <Link
                  to="/register"
                  className="font-semibold text-accent-400 transition-colors hover:text-accent-300"
                >
                  Sign Up
                </Link>
              </p>
            </>
          )}
        </div>

        {/* Right: the brand panel. Hidden on mobile where it would just push
            the form below the fold. Carries its own accent wash so the card
            reads as two materials meeting at a seam. */}
        <div
          className="relative hidden flex-col justify-between overflow-hidden p-10 md:flex"
          style={{
            backgroundImage:
              "linear-gradient(150deg, rgb(var(--accent-600-rgb) / 0.32) 0%, rgb(var(--accent-400-rgb) / 0.12) 55%, transparent 100%)",
          }}
        >
          {/* A single soft light source, offset off-panel. */}
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-60 blur-3xl"
            style={{ background: "rgb(var(--accent-400-rgb) / 0.45)" }}
          />

          <div className="relative flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Dangro"
              className="h-9 w-9 rounded-xl object-cover shadow-glow"
            />
            <span className="text-lg font-bold tracking-tight text-white">Dangro</span>
          </div>

          <div className="relative">
            <h2 className="text-2xl font-bold leading-snug tracking-tight text-white">
              Your servers, your people,
              <br />
              one place.
            </h2>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-gray-300">
              Chat, share and hang out with the people who matter — without the noise.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}