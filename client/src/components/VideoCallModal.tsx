import { useEffect, useRef } from "react";
import { useCallStore } from "@/stores/callStore";
import { useWebRTC } from "@/hooks/useWebRTC";

export default function VideoCallModal() {
  const {
    isInCall,
    callType,
    targetUser,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    toggleMute,
    toggleVideo,
    endCall,
  } = useCallStore();

  const { createOffer } = useWebRTC();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (isInCall && !hasStarted.current) {
      hasStarted.current = true;
      createOffer();
    }
    if (!isInCall) {
      hasStarted.current = false;
    }
  }, [isInCall, createOffer]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (!isInCall) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      <div className="relative flex-1">
        {remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-accent-600 text-4xl font-bold mx-auto">
                {targetUser?.username?.[0]?.toUpperCase()}
              </div>
              <p className="text-xl font-medium text-white">{targetUser?.username}</p>
              <p className="mt-2 text-sm text-gray-400">Connecting...</p>
            </div>
          </div>
        )}

        {localStream && (
          <div className="absolute right-4 top-4 h-40 w-32 overflow-hidden rounded-xl border-2 border-gray-700 bg-gray-800 shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 bg-gray-900 px-6 py-4">
        <button
          onClick={toggleMute}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
            isMuted ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          {isMuted ? (
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>

        {callType === "video" && (
          <button
            onClick={toggleVideo}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
              isVideoOff ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {isVideoOff ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        )}

        <button
          onClick={() => {
            endCall();
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
