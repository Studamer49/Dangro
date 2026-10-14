import { useEffect, useRef, useState } from "react";
import { useCallStore } from "@/stores/callStore";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useToast } from "@/stores/toastStore";
import { startRingtone } from "@/lib/ringtone";
import Avatar from "@/components/Avatar";

export default function VideoCallModal() {
  const {
    isInCall,
    isCaller,
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

  const toast = useToast();
  const { callError } = useWebRTC();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // Remote audio is played through its own element, not the remote <video>,
  // so a voice-only call (which renders no video) still produces sound.
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(1);
  const [needsAudioTap, setNeedsAudioTap] = useState(false);

  // useToast() returns a new wrapper object every render. Depending on it
  // here would re-run this effect on every render and, with a persistent
  // error, raise a toast on each one.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  // A call that cannot be set up (no microphone, blocked peer) used to fail
  // silently, leaving the user staring at a call that never connects.
  useEffect(() => {
    if (!callError) return;
    toastRef.current.error(callError);
  }, [callError]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    const audio = remoteAudioRef.current;
    if (audio && remoteStream) {
      audio.srcObject = remoteStream;
      // Autoplay can be refused (the "connected" click is not always counted
      // as the gesture that unlocks audio); surface a tap-to-hear button when
      // that happens rather than staying silent for the whole call.
      audio.play().catch(() => setNeedsAudioTap(true));
    }
  }, [remoteStream]);

  useEffect(() => {
    if (remoteAudioRef.current) remoteAudioRef.current.volume = volume;
  }, [volume, remoteStream]);

  // Caller hears a ringtone while waiting for the other side to answer.
  useEffect(() => {
    if (!isInCall || !isCaller || remoteStream) return;
    const stop = startRingtone();
    return () => stop();
  }, [isInCall, isCaller, remoteStream]);

  if (!isInCall) return null;

  const isVideoCall = callType === "video";
  const isConnected = !!remoteStream;

  return (
    <div className="anim-fade-in fixed inset-0 z-50 flex flex-col bg-gray-950">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      <div className="relative flex-1">
        {isConnected && isVideoCall ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className={isConnected ? "" : "animate-pulse"}>
                <Avatar user={targetUser} className="mx-auto mb-4 h-24 w-24 text-4xl" />
              </div>
              <p className="text-xl font-medium text-white">{targetUser?.username}</p>
              <p className="mt-2 text-sm text-gray-400">
                {!isConnected
                  ? isCaller
                    ? "Ringing..."
                    : "Connecting..."
                  : isVideoCall
                  ? "Connected"
                  : "Voice call"}
              </p>
            </div>
          </div>
        )}

        {localStream && isVideoCall && (
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

        {needsAudioTap && (
          <button
            type="button"
            onClick={() => {
              remoteAudioRef.current
                ?.play()
                .then(() => setNeedsAudioTap(false))
                .catch(() => undefined);
            }}
            className="anim-pop-in absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-accent-500"
          >
            Tap to hear the call
          </button>
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

        {isVideoCall && (
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

        <div className="flex items-center gap-2 rounded-full bg-gray-800 px-3 py-1.5 text-gray-300">
          <button
            type="button"
            onClick={() => setVolume((v) => (v > 0 ? 0 : 1))}
            aria-label={volume > 0 ? "Mute speaker" : "Unmute speaker"}
            title={volume > 0 ? "Mute speaker" : "Unmute speaker"}
            className="text-gray-300 hover:text-white"
          >
            {volume > 0 ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H3v6h3l5 4V5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.5 8.5a5 5 0 010 7M18 6a8 8 0 010 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M22 9l-6 6M16 9l6 6" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Call volume"
            className="h-1 w-24 cursor-pointer accent-accent-500"
          />
        </div>

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
