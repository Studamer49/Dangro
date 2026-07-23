import { useEffect, useState } from "react";
import { useCallStore } from "@/stores/callStore";
import { getSocket } from "@/lib/socket";
import api from "@/lib/api";
import type { User } from "@/types";

export default function CallInvitation() {
  const { incomingCall, setIncomingCall, acceptCall, rejectCall } = useCallStore();
  const [ringing, setRinging] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    const handleCallInvite = async (data: { callerId: string; callType: string; roomId: string }) => {
      let caller: User | null = null;
      try {
        const { data: userData } = await api.get(`/users/${data.callerId}`);
        caller = userData.user;
      } catch {
        // silent
      }

      setIncomingCall({
        callerId: data.callerId,
        caller,
        callType: data.callType as "video" | "voice",
        roomId: data.roomId,
      });
      setRinging(true);
    };

    socket.on("call_invite", handleCallInvite);
    return () => {
      socket.off("call_invite", handleCallInvite);
    };
  }, [setIncomingCall]);

  useEffect(() => {
    if (incomingCall) {
      const timeout = setTimeout(() => {
        rejectCall();
        setRinging(false);
      }, 30000);
      return () => clearTimeout(timeout);
    }
  }, [incomingCall, rejectCall]);

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 p-6 text-center shadow-2xl">
        <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent-600 text-3xl font-bold ${ringing ? "animate-pulse" : ""}`}>
          {incomingCall.caller?.username?.[0]?.toUpperCase() || "?"}
        </div>
        <h3 className="text-lg font-bold text-white">{incomingCall.caller?.username || "Unknown"}</h3>
        <p className="mt-1 text-sm text-gray-400">
          Incoming {incomingCall.callType} call...
        </p>

        <div className="mt-6 flex justify-center gap-6">
          <button
            onClick={() => {
              rejectCall();
              setRinging(false);
            }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500"
          >
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            </svg>
          </button>
          <button
            onClick={() => {
              acceptCall();
              setRinging(false);
            }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-500"
          >
            {incomingCall.callType === "video" ? (
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            )}
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-500">Tap to {incomingCall.callType === "video" ? "answer video" : "answer voice"} call</p>
      </div>
    </div>
  );
}
