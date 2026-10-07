import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import { apiErrorMessage } from "@/lib/api";

export default function JoinServerPage() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [serverName, setServerName] = useState("");
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!inviteCode || started.current) return;
    started.current = true;
    (async () => {
      try {
        const { data } = await api.get(`/servers/join/${inviteCode}`);
        setServerName(data.server.name);
        const firstChannel = data.server.channels?.[0]?.id;
        if (firstChannel) {
          navigate(`/channels/${firstChannel}`, { replace: true });
        } else {
          navigate("/explore", { replace: true });
        }
        toast.success(`Joined ${data.server.name}`);
      } catch (err: unknown) {
        setError(apiErrorMessage(err, "Invalid invite"));
      }
    })();
  }, [inviteCode, navigate, toast]);

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl bg-gray-900 p-8 text-center shadow-2xl">
        {error ? (
          <>
            <h1 className="mb-2 text-xl font-bold text-white">Invite not found</h1>
            <p className="mb-6 text-sm text-gray-400">{error}</p>
            <button
              onClick={() => navigate("/explore")}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
            >
              Browse servers
            </button>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-xl font-bold text-white">
              {serverName ? `Joined ${serverName}` : "Joining server..."}
            </h1>
            <p className="text-sm text-gray-400">
              {serverName ? "Redirecting to the server." : "Hang tight, this should only take a second."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}