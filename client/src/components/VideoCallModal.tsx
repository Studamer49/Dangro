import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCallStore } from "@/stores/callStore";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useToast } from "@/stores/toastStore";
import { startRingtone } from "@/lib/ringtone";
import Avatar from "@/components/Avatar";

/**
 * A video element bound to a stream.
 *
 * Binding through a ref-effect rather than `srcObject={stream}` keeps the
 * element from tearing down the decoder on every render, and lets the same
 * slot show different streams as the screen and the person swap places.
 */
function StreamVideo({
  stream,
  muted = true,
  mirror = false,
  fit = "cover",
  className = "",
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  fit?: "cover" | "contain";
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`${fit === "contain" ? "object-contain" : "object-cover"} ${className}`}
      style={mirror ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}

export default function VideoCallModal() {
  const {
    isInCall,
    isCaller,
    callType,
    targetUser,
    localStream,
    remoteStream,
    localScreenStream,
    remoteScreenStream,
    isMuted,
    isVideoOff,
    isScreenSharing,
    toggleMute,
    toggleVideo,
    connectionStatus,
    endCall,
  } = useCallStore();

  const toast = useToast();
  const { callError, toggleScreenShare } = useWebRTC();
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(1);
  const [needsAudioTap, setNeedsAudioTap] = useState(false);
  // Which of the two sharing tiles is shown large. Reset whenever a share
  // starts or stops so the screen is always the default focus.
  const [swapped, setSwapped] = useState(false);

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

  const remoteSharing = !!remoteScreenStream;
  const localSharing = isScreenSharing && !!localScreenStream;
  useEffect(() => {
    setSwapped(false);
  }, [remoteSharing, localSharing]);

  if (!isInCall) return null;

  const isVideoCall = callType === "video";
  const isConnected = !!remoteStream;
  // A video call where the other side denied their camera produces a stream
  // with an audio track and no video track. Rendering that in a <video> is a
  // black rectangle, so show the avatar instead — the separate audio element
  // still carries the sound either way.
  const remoteHasVideo = !!remoteStream?.getVideoTracks().length;

  const anySharing = remoteSharing || localSharing;
  const sharedScreen = remoteSharing ? remoteScreenStream : localSharing ? localScreenStream : null;
  const sharerCamera = remoteSharing ? remoteStream : localSharing ? localStream : null;
  // Whether the camera on screen belongs to this user (so it stays mirrored,
  // like a selfie). The other person's camera is never mirrored.
  const sharerCameraIsLocal = !remoteSharing && localSharing;
  // When sharing, the screen is the focus and the person sits in the corner —
  // unless the viewer tapped to swap them.
  const stageStream = anySharing ? (swapped ? sharerCamera : sharedScreen) : remoteStream;
  const cornerStream = anySharing
    ? swapped
      ? sharedScreen
      : sharerCamera
    : isVideoCall
    ? localStream
    : null;
  const stageIsCamera = anySharing && swapped;
  const cornerIsCamera = !anySharing || !swapped;
  const stageIsLocalCamera = stageIsCamera && sharerCameraIsLocal;
  const cornerIsLocalCamera = cornerIsCamera && (!anySharing || sharerCameraIsLocal);
  // A voice call carries no camera, so a corner tile that would show one stays
  // empty rather than painting a black rectangle.
  const stageHasVideo = !!stageStream?.getVideoTracks().length;
  const cornerHasVideo = !!cornerStream?.getVideoTracks().length;

  return createPortal(
    <div className="fixed inset-0 layer-call flex items-center justify-center bg-gray-950/80 p-4 backdrop-blur-sm animate-overlay-in">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      {/*
        The stage is the one deliberate exception to "never paint a dark
        surface": while a call is up it is the focus of the app, so it stays the
        darkest thing on screen. It is still wrapped as a glass panel, so it
        picks up the border, the inset hairline and a wide shadow rather than
        reading as a hole cut into the page.
      */}
      <div className="glass-panel shadow-elev3 flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl">
        <div className="relative flex-1 overflow-hidden bg-gray-950/70">
          {stageStream && stageHasVideo ? (
            <StreamVideo
              stream={stageStream}
              fit={stageIsCamera ? "cover" : "contain"}
              mirror={stageIsLocalCamera}
              className="h-full w-full"
            />
          ) : (
            <div className="relative flex h-full items-center justify-center overflow-hidden">
              {/* Decorative accent bloom behind the avatar: the one lit thing on
                  an otherwise black stage, so the eye lands on the person. */}
              <span
                aria-hidden
                className="pointer-events-none absolute h-80 w-80 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgb(var(--accent-500-rgb) / 0.3), transparent 70%)",
                }}
              />
              <div className="relative text-center">
                <div className={isConnected ? "" : "animate-pulse"}>
                  <Avatar user={targetUser} className="mx-auto mb-4 h-24 w-24 text-4xl" linkToProfile={false} />
                </div>
                <p className="text-xl font-semibold tracking-tight text-white">{targetUser?.username}</p>
                <p className="tabular mt-2 text-sm text-gray-400">
                  {!isConnected
                    ? isCaller
                      ? "Ringing..."
                      : "Connecting..."
                    : anySharing
                    ? "Screen shared"
                    : !isVideoCall
                    ? "Voice call"
                    : remoteHasVideo
                    ? "Connected"
                    : "Camera off"}
                </p>
              </div>
            </div>
          )}

          {cornerStream && cornerHasVideo && (
            <button
              type="button"
              onClick={() => anySharing && setSwapped((s) => !s)}
              title={anySharing ? "Swap screen and camera" : undefined}
              className={`absolute right-4 top-4 h-40 w-32 overflow-hidden rounded-2xl border border-white/15 bg-gray-950/60 shadow-elev2 ${
                anySharing ? "cursor-pointer hover:border-white/40" : "cursor-default"
              }`}
            >
              <StreamVideo
                stream={cornerStream}
                fit={cornerIsCamera ? "cover" : "contain"}
                mirror={cornerIsLocalCamera}
                className="h-full w-full"
              />
            </button>
          )}

          {/*
            The connection's own state, in words. Without this a call that never
            connects is just a black rectangle next to your own face — there is
            no way to tell "still ringing" from "the network refused this" other
            than by reading the browser console.
          */}
          {connectionStatus && !isConnected && (
            <div className="absolute bottom-4 left-1/2 z-10 max-w-md -translate-x-1/2 rounded-xl border border-amber-400/25 bg-gray-950/85 px-4 py-2.5 text-center text-xs font-medium text-amber-200 backdrop-blur animate-fade-up">
              {connectionStatus}
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
              className="animate-pop-in absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-accent-400/40 bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-elev2 transition-colors duration-200 ease-out hover:bg-accent-500"
            >
              Tap to hear the call
            </button>
          )}
        </div>

        {/* Controls ride a frosted strip under the stage rather than a solid
            bar, so the panel keeps reading as one lit surface. */}
        <div className="glass flex flex-wrap items-center justify-center gap-3 border-t border-gray-700/50 px-6 py-4 sm:gap-4">
          {/* Mic: red fill when muted, neutral glass when live. The state has
              to read at a glance, so the off state is the loud one and the on
              state stays quiet. */}
          <button
            onClick={toggleMute}
            className={`icon-btn !h-12 !w-12 !rounded-full border transition-all duration-200 ease-out ${
              isMuted
                ? "border-red-500/50 bg-red-600 text-white shadow-elev2 hover:bg-red-500"
                : "border-gray-700/70 bg-gray-800/50 text-gray-200 hover:border-gray-600 hover:bg-gray-800 hover:text-white"
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

        <button
          onClick={() => {
            void toggleScreenShare();
          }}
          title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
          className={`icon-btn !h-12 !w-12 !rounded-full border transition-all duration-200 ease-out ${
            isScreenSharing
              ? "border-accent-400/60 bg-accent-600 text-white shadow-elev2 hover:bg-accent-500"
              : "border-gray-700/70 bg-gray-800/50 text-gray-200 hover:border-gray-600 hover:bg-gray-800 hover:text-white"
          }`}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </button>

        {isVideoCall && (
          <button
            onClick={toggleVideo}
            className={`icon-btn !h-12 !w-12 !rounded-full border transition-all duration-200 ease-out ${
              isVideoOff
                ? "border-red-500/50 bg-red-600 text-white shadow-elev2 hover:bg-red-500"
                : "border-gray-700/70 bg-gray-800/50 text-gray-200 hover:border-gray-600 hover:bg-gray-800 hover:text-white"
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

        <div className="glass flex items-center gap-2 rounded-full border px-1.5 py-1.5 shadow-elev1">
          <button
            type="button"
            onClick={() => setVolume((v) => (v > 0 ? 0 : 1))}
            aria-label={volume > 0 ? "Mute speaker" : "Unmute speaker"}
            title={volume > 0 ? "Mute speaker" : "Unmute speaker"}
            className={`icon-btn !h-7 !w-7 !rounded-full ${
              volume > 0 ? "" : "!text-red-400"
            }`}
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
            className="h-1 w-24 cursor-pointer accent-accent-400"
          />
        </div>

        <button
          onClick={() => {
            endCall();
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-[0_8px_24px_-6px_rgb(239_68_68/0.75)] ring-1 ring-red-400/40 transition-colors duration-200 ease-out hover:bg-red-500"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
