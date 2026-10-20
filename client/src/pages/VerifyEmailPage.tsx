import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { apiErrorCode } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import VerifyEmailNotice from "@/components/account/VerifyEmailNotice";
import { BrandPanel } from "@/pages/RegisterPage";

/**
 * The page a verification link opens.
 *
 * Five outcomes have to be told apart, and each one says something different
 * about what to do next:
 *
 *   verifying — in flight
 *   success   — go and sign in
 *   expired   — ask for a new link
 *   used      — ask for a new link, or sign in if that was you
 *   invalid   — the link was never valid, ask for a new one
 *
 *   network   — could not reach the server; the link may still be good
 *
 * The token is read from `?token=` and posted immediately. It is never put
 * into a redirect, a `next` parameter or the router state, so there is no way
 * for a crafted link to bounce anyone off this origin.
 */
type View = "verifying" | "success" | "expired" | "used" | "invalid" | "network" | "no-token";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");

  const [view, setView] = useState<View>(token ? "verifying" : "no-token");
  const [detail, setDetail] = useState("");
  // React 18+ mounts effects twice under StrictMode. Without this the token is
  // submitted twice on every dev reload — which, since a link is single-use,
  // makes the second response report the first click as "already used".
  const submitted = useRef(false);

  useEffect(() => {
    if (!token || submitted.current) return;
    submitted.current = true;

    api
      .post("/auth/verify-email", { token })
      .then(() => setView("success"))
      .catch((err: unknown) => {
        switch (apiErrorCode(err)) {
          case "TOKEN_EXPIRED":
            setView("expired");
            break;
          case "TOKEN_ALREADY_USED":
            setView("used");
            break;
          case "INVALID_TOKEN":
            setView("invalid");
            break;
          default:
            // A 429 from the rate limiter or a dropped connection lands here
            // too: the link may well still be valid, so say so rather than
            // telling the user it is broken.
            setView("network");
            setDetail(
              err && typeof err === "object" && "apiMessage" in err
                ? String((err as { apiMessage?: string }).apiMessage ?? "")
                : ""
            );
        }
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl glass-panel md:grid-cols-2">
        <div className="p-8 sm:p-10">
          {view === "verifying" && <Verifying />}
          {view === "success" && <Success onContinue={() => navigate("/login")} />}

          {(view === "expired" || view === "invalid") && (
            <Failure
              title="This link has expired"
              body="Verification links are good for 30 minutes. Request a new one and you can carry on straight away."
              tone="warning"
            >
              <ResendForm />
            </Failure>
          )}

          {view === "used" && (
            <Failure
              title="This link has already been used"
              body="Links work once. If that was you, your address is already verified — just sign in."
              tone="warning"
            >
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => navigate("/login")} className="btn-primary">
                  Go to sign in
                </button>
                <ResendButton />
              </div>
            </Failure>
          )}

          {view === "network" && (
            <Failure
              title="Could not reach the server"
              body={
                detail ||
                "The request did not get through, so we cannot say whether this link worked. Check your connection and try again."
              }
              tone="error"
            >
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    submitted.current = false;
                    setView("verifying");
                    // Re-run the effect against the same token.
                    window.location.reload();
                  }}
                >
                  Try again
                </button>
                <button type="button" onClick={() => navigate("/login")} className="btn-ghost">
                  Back to sign in
                </button>
              </div>
            </Failure>
          )}

          {view === "no-token" && (
            <Failure
              title="That link is incomplete"
              body="Open the link straight from the email, or request a new verification email."
              tone="error"
            >
              <ResendForm />
            </Failure>
          )}

          {!token && (
            <p className="mt-8 text-center text-sm text-gray-400">
              Already verified?{" "}
              <Link to="/login" className="font-semibold text-accent-400 transition-colors hover:text-accent-300">
                Sign In
              </Link>
            </p>
          )}
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
            "Confirming proves the address is yours",
            "Nobody else can claim your username",
            "It is how you recover a forgotten password",
          ]}
        />
      </div>
    </div>
  );
}

function Verifying() {
  return (
    <div className="flex flex-col items-center py-6 text-center animate-fade-up">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div
          className="animate-ring-spin absolute inset-0 rounded-full opacity-80"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0%, rgb(var(--accent-400-rgb) / 0.9) 60%, transparent 100%)",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
          }}
        />
        <div className="h-2.5 w-2.5 rounded-full bg-accent-400 shadow-glow" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">Verifying your email…</h1>
      <p className="mt-2 text-sm text-gray-400">One moment.</p>
    </div>
  );
}

function Success({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="animate-fade-up">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
        <svg className="h-6 w-6 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <h1 className="mt-5 text-3xl font-bold tracking-tight text-white">Email verified</h1>
      <p className="mt-2 text-gray-400">
        Your address is confirmed. Sign in with the email and password you just chose.
      </p>
      <button type="button" onClick={onContinue} className="btn-primary mt-7 w-full py-3">
        Continue to sign in
      </button>
    </div>
  );
}

function Failure({
  title,
  body,
  tone,
  children,
}: {
  title: string;
  body: string;
  tone: "warning" | "error";
  children: React.ReactNode;
}) {
  const accent = tone === "warning" ? "text-amber-400" : "text-red-400";
  const ring = tone === "warning" ? "bg-amber-500/15" : "bg-red-500/15";

  return (
    <div className="animate-fade-up">
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${ring}`}>
        <svg className={`h-6 w-6 ${accent}`} fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-4a1 1 0 100 2 1 1 0 000-2z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <h1 className="mt-5 text-3xl font-bold tracking-tight text-white">{title}</h1>
      <p className="mt-2 text-gray-400">{body}</p>
      <div className="mt-7 flex flex-col gap-3">{children}</div>
      <p className="mt-8 text-center text-sm text-gray-400">
        <Link to="/login" className="font-semibold text-accent-400 transition-colors hover:text-accent-300">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

/**
 * Resend for someone who has no session — they arrive here straight from the
 * email, so the address has to be typed back in.
 *
 * This is the only screen where a resend can be sent unauthenticated, and the
 * server's answer is identical for every address, so it confirms nothing about
 * whether the account exists.
 */
function ResendForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState("sending");
    setMessage("");
    try {
      const { data } = await api.post("/auth/resend-verification", { email });
      setState("sent");
      setMessage(data.message ?? "If that address needs verification, a new link is on its way.");
    } catch (err: unknown) {
      setState("failed");
      const apiMessage =
        err && typeof err === "object" && "apiMessage" in err
          ? String((err as { apiMessage?: string }).apiMessage ?? "")
          : "";
      setMessage(apiMessage || "Could not send a new link. Please try again.");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="resend-email" className="field-label">
          Email address
        </label>
        <input
          id="resend-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
          placeholder="you@example.com"
        />
      </div>
      <button type="submit" disabled={state === "sending"} className="btn-primary w-full">
        {state === "sending" ? "Sending…" : "Send a new link"}
      </button>
      {message && (
        <p role="status" className={`text-sm ${state === "failed" ? "text-red-400" : "text-emerald-400"}`}>
          {message}
        </p>
      )}
    </form>
  );
}

/**
 * Resend for someone who signed up in this browser.
 *
 * Falls back to the "type your address" form when there is nothing on record
 * (a different device, an expired session), which is the common case for a
 * link forwarded from a mail client.
 */
function ResendButton() {
  const unverifiedEmail = useAuthStore((s) => s.unverifiedEmail);
  const navigate = useNavigate();

  if (!unverifiedEmail) return <ResendForm />;

  return (
    <VerifyEmailNotice
      email={unverifiedEmail}
      compact
      footer={
        <button type="button" onClick={() => navigate("/login")} className="btn-ghost w-full">
          Back to sign in
        </button>
      }
    />
  );
}