import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/stores/authStore";
import { apiErrorMessage } from "@/lib/api";
import VerifyEmailNotice from "@/components/account/VerifyEmailNotice";

const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(32, "Username must be at most 32 characters")
      .regex(/^\S+$/, "Username cannot contain spaces"),
    email: z.string().email("Invalid email address"),
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

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * Set once the account exists. From here the user cannot sign in — the
   * server issues no session until the emailed link is clicked — so the form
   * is replaced by the "check your inbox" notice rather than navigating into
   * an app they have no session for.
   */
  const [pending, setPending] = useState<{ email: string } | null>(null);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    setError("");
    setIsSubmitting(true);
    try {
      const result = await register(data.username, data.email, data.password);
      if (result.verificationRequired) {
        setPending({ email: result.email });
        return;
      }
      navigate("/");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Registration failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (pending) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl glass-panel md:grid-cols-2">
          <div className="p-8 sm:p-10">
            <VerifyEmailNotice
              email={pending.email}
              onBack={() => navigate("/login")}
            />
          </div>
          <BrandPanel
            heading={
              <>
                One click and
                <br />
                you&apos;re in.
              </>
            }
            lines={[
              "The link works once and expires in 30 minutes",
              "Resend it any time if it lands in spam",
              "Your address is never shown to anyone else",
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl glass-panel md:grid-cols-2">
        <div className="p-8 sm:p-10">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-white">Create an account</h1>
            <p className="mt-2 text-gray-400">It takes about twenty seconds.</p>
          </div>

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
              <label htmlFor="username" className="field-label">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                {...registerField("username")}
                className="field"
                placeholder="cooluser"
              />
              {errors.username && (
                <p className="mt-1.5 text-xs text-red-400">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="field-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                {...registerField("email")}
                className="field"
                placeholder="you@example.com"
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                {...registerField("password")}
                className="field"
                placeholder="At least 8 characters"
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="field-label">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...registerField("confirmPassword")}
                className="field"
                placeholder="••••••••"
              />
              {errors.confirmPassword && (
                <p className="mt-1.5 text-xs text-red-400">{errors.confirmPassword.message}</p>
              )}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
              {isSubmitting ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-semibold text-accent-400 transition-colors hover:text-accent-300"
            >
              Sign In
            </Link>
          </p>
        </div>

        <BrandPanel
          heading={
            <>
              Build a server
              <br />
              for anything.
            </>
          }
          lines={[
            "Channels, roles and categories built in",
            "Voice and video calls, peer to peer",
            "Stories and a feed for the rest",
          ]}
        />
      </div>
    </div>
  );
}

/**
 * The decorative half of the auth pages.
 *
 * Extracted because the register page now renders two very different states —
 * the form and the "check your inbox" notice — and duplicating that panel
 * inline meant editing the same gradient in two places.
 */
export function BrandPanel({
  heading,
  lines,
}: {
  heading: React.ReactNode;
  lines: string[];
}) {
  return (
    <div
      className="relative hidden flex-col justify-between overflow-hidden p-10 md:flex"
      style={{
        backgroundImage:
          "linear-gradient(150deg, rgb(var(--accent-600-rgb) / 0.32) 0%, rgb(var(--accent-400-rgb) / 0.12) 55%, transparent 100%)",
      }}
    >
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
        <h2 className="text-2xl font-bold leading-snug tracking-tight text-white">{heading}</h2>
        <ul className="mt-6 space-y-3">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-sm text-gray-300">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-accent-300"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}