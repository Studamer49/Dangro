import { useCallback, useEffect, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";

/**
 * "Check your inbox" panel with a working resend button.
 *
 * Shared by the post-signup screen and the /verify-email page rather than
 * written twice: the three states (idle, sending, sent) plus the error copy
 * are identical, and the two screens used to drift apart.
 *
 * The resend call is deliberately unverified-answering — the server replies
 * the same way for every address — so the button can never be used to find out
 * whether a given address has an account here.
 */

type ResendState = "idle" | "sending" | "sent" | "failed";

interface VerifyEmailNoticeProps {
  /** The address the link went to. Masked by the API where it can be. */
  email: string;
  onBack?: () => void;
  /** Shown under the resend button, e.g. a route back to login. */
  footer?: React.ReactNode;
  compact?: boolean;
}

export default function VerifyEmailNotice({ email, onBack, footer, compact }: VerifyEmailNoticeProps) {
  const [state, setState] = useState<ResendState>("idle");
  const [message, setMessage] = useState("");

  // Lets a "sent" confirmation fade back to the idle button rather than
  // leaving a permanent success banner that hides the retry.
  useEffect(() => {
    if (state !== "sent") return;
    const timer = setTimeout(() => setState("idle"), 6000);
    return () => clearTimeout(timer);
  }, [state]);

  const resend = useCallback(async () => {
    setState("sending");
    setMessage("");
    try {
      const { data } = await api.post("/auth/resend-verification", { email });
      setState("sent");
      setMessage(data.message ?? "If that address needs verification, a new link is on its way.");
    } catch (err) {
      setState("failed");
      setMessage(apiErrorMessage(err, "Could not send a new link. Please try again."));
    }
  }, [email]);

  return (
    <div className={compact ? "" : "animate-fade-up"}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-500/15 shadow-glow">
        <svg className="h-6 w-6 text-accent-300" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
        </svg>
      </div>

      <h1 className="mt-5 text-3xl font-bold tracking-tight text-white">Check your inbox</h1>
      <p className="mt-2 text-gray-400">
        We sent a verification link to <span className="font-semibold text-gray-200">{email}</span>.
        Open it to finish setting up your account.
      </p>

      <ul className="mt-6 space-y-2.5 text-sm text-gray-400">
        {[
          "The link works once, and expires in 30 minutes.",
          "No inbox? Check spam — and make sure you used the same address.",
          "You cannot sign in until the address is verified.",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2.5">
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

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={resend}
          disabled={state === "sending"}
          className="btn-primary"
        >
          {state === "sending" ? "Sending…" : state === "sent" ? "Link sent" : "Resend email"}
        </button>
        {onBack && (
          <button type="button" onClick={onBack} className="btn-ghost">
            Back to sign in
          </button>
        )}
      </div>

      {message && (
        <p
          role="status"
          className={`mt-4 text-sm ${
            state === "failed" ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {message}
        </p>
      )}

      {footer && <div className="mt-6">{footer}</div>}
    </div>
  );
}