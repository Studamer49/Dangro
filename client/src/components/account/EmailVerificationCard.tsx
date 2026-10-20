import { useCallback, useEffect, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";

/**
 * Settings → Account: email verification status.
 *
 * Reads the authoritative state from `/auth/verification-status` rather than
 * trusting whatever the cached profile says — a client-side `emailVerified`
 * would be exactly the "do not trust a client-supplied value" problem, just
 * moved to a different screen.
 */
interface StatusResponse {
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
}

export default function EmailVerificationCard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/verification-status");
      setStatus(data);
      setLoadError("");
    } catch (err) {
      setLoadError(apiErrorMessage(err, "Could not load your verification status."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resend = async () => {
    if (!status) return;
    setSending(true);
    setNotice(null);
    try {
      const { data } = await api.post("/auth/resend-verification", { email: status.email });
      setNotice({ tone: "ok", text: data.message ?? "If that address needs verification, a new link is on its way." });
    } catch (err) {
      setNotice({ tone: "error", text: apiErrorMessage(err, "Could not send a new link.") });
    } finally {
      setSending(false);
    }
  };

  const verified = status?.emailVerified === true;

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-white">Email verification</p>
          <p className="mt-1 break-all text-sm text-gray-300">{status?.email ?? "—"}</p>
        </div>

        {loading ? (
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-400">
            Checking…
          </span>
        ) : loadError ? (
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300"
          >
            {loadError}
          </button>
        ) : verified ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                clipRule="evenodd"
              />
            </svg>
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM10 6a1 1 0 011 1v4a1 1 0 11-2 0V7a1 1 0 011-1zm0 8a1.2 1.2 0 100 2.4A1.2 1.2 0 0010 14z"
                clipRule="evenodd"
              />
            </svg>
            Not verified
          </span>
        )}
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-gray-500">
        {verified
          ? "Your address is confirmed, so password resets and account recovery reach you."
          : "Verify your address to secure the account and recover it if you forget your password. Links work once and last 30 minutes."}
      </p>

      {!verified && !loading && (
        <div className="mt-4">
          <button type="button" onClick={resend} disabled={sending} className="btn-primary">
            {sending ? "Sending…" : "Send verification email"}
          </button>
          <p className="mt-2.5 text-xs text-gray-500">
            Already have a link? Open it straight from the email — it has to carry the one-time code.
          </p>
        </div>
      )}

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