import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api, { apiErrorMessage } from "@/lib/api";

/**
 * "I forgot my password".
 *
 * The confirmation is deliberately identical whether or not the address has an
 * account — that is enforced by the server, and matching it here is what stops
 * this page from becoming a way to enumerate who is registered.
 */
const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setNotice("");
    try {
      const { data: response } = await api.post("/auth/forgot-password", { email: data.email });
      setNotice(response.message ?? "If that address has a Dangro account, a reset link is on its way.");
      setSent(true);
    } catch (err) {
      setNotice(apiErrorMessage(err, "Could not send a reset link. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl glass-panel p-8 sm:p-10">
        <h1 className="text-3xl font-bold tracking-tight text-white">Reset your password</h1>
        <p className="mt-2 text-gray-400">
          Tell us the address on your account and we&apos;ll send a link to choose a new password.
        </p>

        {notice && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-accent-500/30 bg-accent-500/10 px-4 py-3 text-sm text-gray-200 animate-fade-up"
          >
            {notice}
          </div>
        )}

        {!sent ? (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-5">
            <div>
              <label htmlFor="forgot-email" className="field-label">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                {...register("email")}
                className="field"
                placeholder="you@example.com"
              />
              {errors.email && <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>}
            </div>
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
              {isSubmitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setNotice("");
            }}
            className="btn-ghost mt-7 w-full py-3"
          >
            Use a different address
          </button>
        )}

        <p className="mt-8 text-center text-sm text-gray-400">
          Remembered it?{" "}
          <Link to="/login" className="font-semibold text-accent-400 transition-colors hover:text-accent-300">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}