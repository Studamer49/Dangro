import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCallStore } from "@/stores/callStore";
import { getSocket } from "@/lib/socket";
import { startRingtone } from "@/lib/ringtone";
import api from "@/lib/api";
import Avatar from "@/components/Avatar";
import type { User } from "@/types";

export default function CallInvitation() {
  const { incomingCall, setIncomingCall, acceptCall, rejectCall } = useCallStore();
  const [ringing, setRinging] = useState(false);
  const stopToneRef = useRef<(() => void) | null>(null);

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

    const handleCallEnd = () => {
      setIncomingCall(null);
      setRinging(false);
    };

    socket.on("call_invite", handleCallInvite);
    socket.on("call_end", handleCallEnd);
    return () => {
      socket.off("call_invite", handleCallInvite);
      socket.off("call_end", handleCallEnd);
    };
  }, [setIncomingCall]);

  useEffect(() => {
    if (ringing) {
      stopToneRef.current = startRingtone();
    } else {
      stopToneRef.current?.();
      stopToneRef.current = null;
    }
    return () => {
      stopToneRef.current?.();
      stopToneRef.current = null;
    };
  }, [ringing]);

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

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/70 p-4 backdrop-blur-sm animate-overlay-in">
      <div className="w-full max-w-sm animate-pop-in">
        {/* The glow lives on a wrapper rather than on the card itself, so the
            panel keeps its own wide elevation shadow underneath the accent
            bloom instead of one replacing the other. */}
        <div className="rounded-2xl shadow-[0_0_64px_-16px_rgb(34_197_94/0.6),0_0_120px_-34px_rgb(var(--accent-400-rgb)/0.55)]">
          <div className="glass-panel overflow-hidden rounded-2xl p-7 text-center">
            <div
              className={`mx-auto mb-4 w-fit rounded-full ${
                ringing ? "animate-glow-pulse" : ""
              }`}
            >
              <Avatar user={incomingCall.caller} className="h-20 w-20 text-3xl" linkToProfile={false} />
            </div>

            <p className="eyebrow">Incoming {incomingCall.callType} call</p>
            <h3 className="mt-1.5 text-2xl font-bold tracking-tight text-white">
              {incomingCall.caller?.username || "Unknown"}
            </h3>

            <div className="mt-7 flex items-center justify-center gap-6">
              <button
                onClick={() => {
                  rejectCall();
                  setRinging(false);
                }}
                title="Decline call"
                aria-label="Decline call"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white transition-all duration-200 shadow-[0_8px_24px_-8px_rgb(239_68_68/0.85)] hover:bg-red-500 hover:shadow-[0_10px_30px_-8px_rgb(239_68_68/1)]"
              >
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a2 2 0 00-.684-.948l-4.493-1.498a2 2 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a2 2 0 00.502-1.21L9.228 3.683A2 2 0 008.279 3H5z" />
                </svg>
              </button>
              <button
                onClick={() => {
                  acceptCall();
                  setRinging(false);
                }}
                title="Accept call"
                aria-label="Accept call"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white transition-all duration-200 shadow-[0_8px_24px_-6px_rgb(34_197_94/0.8)] hover:bg-green-500 hover:shadow-[0_12px_32px_-6px_rgb(34_197_94/0.95)]"
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

            <p className="mt-5 text-xs text-gray-500">
              Tap to {incomingCall.callType === "video" ? "answer video" : "answer voice"} call
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
