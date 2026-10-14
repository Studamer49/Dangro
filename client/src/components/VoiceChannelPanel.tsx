import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Avatar from "@/components/Avatar";
import type { VoicePeer } from "@/hooks/useVoiceChannel";
import type { User } from "@/types";

interface Props {
  channelName: string | null;
  connecting: boolean;
  localUser: User | null;
  localStream: MediaStream | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  peers: VoicePeer[];
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
}

function RemoteTile({
  peer,
  volume,
  onVolume,
}: {
  peer: VoicePeer;
  volume: number;
  onVolume: (value: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = peer.camera && (peer.stream?.getVideoTracks().length ?? 0) > 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && peer.stream) {
      audio.srcObject = peer.stream;
      audio.play().catch(() => undefined);
    }
  }, [peer.stream]);

  useEffect(() => {
    if (videoRef.current && peer.stream && showVideo) {
      videoRef.current.srcObject = peer.stream;
    }
  }, [peer.stream, showVideo]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-800/60">
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
      <div className="relative aspect-video w-full bg-gray-950">
        {showVideo ? (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Avatar user={peer.user} className="h-10 w-10 text-sm" linkToProfile={false} />
          </div>
        )}
        {!showVideo && (
          <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-gray-200">
            {peer.user?.username ?? "User"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5 10v4h3l4 4V6l-4 4H5z" />
        </svg>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => onVolume(Number(event.target.value))}
          aria-label={`Volume for ${peer.user?.username ?? "participant"}`}
          className="h-1 w-full cursor-pointer accent-accent-500"
        />
      </div>
    </div>
  );
}

export default function VoiceChannelPanel({
  channelName,
  connecting,
  localUser,
  localStream,
  micEnabled,
  cameraEnabled,
  peers,
  onToggleMic,
  onToggleCamera,
  onLeave,
}: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (localVideoRef.current && localStream && cameraEnabled) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, cameraEnabled]);

  return createPortal(
    <div className="anim-pop-in fixed bottom-4 right-4 z-40 w-72 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <span className={`h-2 w-2 rounded-full ${connecting ? "animate-pulse bg-yellow-500" : "bg-green-500"}`} />
            <span className="truncate">{channelName ?? "Voice"}</span>
          </p>
          <p className="text-[11px] text-gray-500">
            {connecting ? "Connecting…" : `Voice connected · ${peers.length + 1} here`}
          </p>
        </div>
        <button
          type="button"
          onClick={onLeave}
          className="rounded-lg bg-red-600/20 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/30"
        >
          Leave
        </button>
      </div>

      <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto p-2">
        <div className="overflow-hidden rounded-lg border border-accent-600/40 bg-gray-800/60">
          <div className="relative aspect-video w-full bg-gray-950">
            {cameraEnabled ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Avatar user={localUser} className="h-10 w-10 text-sm" linkToProfile={false} />
              </div>
            )}
            <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-gray-200">
              You
            </span>
            {!micEnabled && (
              <span className="absolute right-1 top-1 rounded-full bg-red-600 p-1" title="Muted">
                <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              </span>
            )}
          </div>
        </div>

        {peers.map((peer) => (
          <RemoteTile
            key={peer.userId}
            peer={peer}
            volume={volumes[peer.userId] ?? 1}
            onVolume={(value) => setVolumes((prev) => ({ ...prev, [peer.userId]: value }))}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-gray-800 px-3 py-2">
        <button
          type="button"
          onClick={onToggleMic}
          aria-label={micEnabled ? "Mute microphone" : "Unmute microphone"}
          title={micEnabled ? "Mute" : "Unmute"}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
            micEnabled ? "bg-gray-700 text-gray-200 hover:bg-gray-600" : "bg-red-600 text-white hover:bg-red-500"
          }`}
        >
          {micEnabled ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleCamera}
          aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          title={cameraEnabled ? "Camera off" : "Camera on"}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
            cameraEnabled ? "bg-gray-700 text-gray-200 hover:bg-gray-600" : "bg-gray-700 text-gray-400 hover:bg-gray-600"
          }`}
        >
          {cameraEnabled ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={onLeave}
          aria-label="Disconnect"
          title="Disconnect"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      </div>

      {connecting && (
        <p className="border-t border-gray-800 px-3 py-1.5 text-center text-[11px] text-gray-500">
          Connecting to voice…
        </p>
      )}
    </div>,
    document.body
  );
}
