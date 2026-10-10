import { useEffect, useRef, useCallback, useState } from "react";
import { getSocket } from "@/lib/socket";
import { useCallStore } from "@/stores/callStore";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export function useWebRTC() {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const {
    isInCall,
    isCaller,
    callType,
    targetUserId,
    setLocalStream,
    setRemoteStream,
    endCall,
  } = useCallStore();

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate && targetUserId) {
        const socket = getSocket();
        socket.emit("ice_candidate", {
          targetUserId,
          signal: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        endCall();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [targetUserId, setRemoteStream, endCall]);

  const startLocalStream = useCallback(async (video: boolean) => {
    const existing = useCallStore.getState().localStream;
    if (existing) return existing;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video,
      });
      setLocalStream(stream);
      return stream;
    } catch {
      // Camera denied or unavailable: fall back to audio only.
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        setLocalStream(audioOnly);
        return audioOnly;
      } catch {
        // The fallback used to reject unhandled, leaving the call UI showing
        // a live call with no microphone and nothing in the console.
        throw new Error("Microphone access was denied");
      }
    }
  }, [setLocalStream]);

  const createOffer = useCallback(async () => {
    const stream = await startLocalStream(callType === "video");
    const pc = createPeerConnection();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (targetUserId) {
      const socket = getSocket();
      socket.emit("webrtc_offer", { targetUserId, signal: offer });
    }
  }, [callType, targetUserId, startLocalStream, createPeerConnection]);

  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit, callerId: string) => {
    const stream = await startLocalStream(callType === "video");
    const pc = createPeerConnection();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    const socket = getSocket();
    socket.emit("webrtc_answer", { targetUserId: callerId, signal: answer });
  }, [callType, startLocalStream, createPeerConnection]);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }, []);

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    const stream = useCallStore.getState().localStream;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
  }, [setLocalStream, setRemoteStream]);

  const [callError, setCallError] = useState<string | null>(null);

  /** Ends the call and surfaces why, instead of rejecting into the void. */
  const failCall = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : "The call could not be set up";
    setCallError(message);
    cleanup();
    useCallStore.getState().resetCall();
  }, [cleanup]);

  useEffect(() => {
    if (!isInCall) return;

    if (isCaller) {
      // Pre-acquire the local stream so permission is requested immediately;
      // a denial has to end the call rather than surface as an unhandled
      // rejection.
      startLocalStream(callType === "video").catch(failCall);
    }

    const socket = getSocket();

    socket.on("call_accept", () => {
      createOffer().catch(failCall);
    });

    socket.on("webrtc_offer", (data: { offer: RTCSessionDescriptionInit; userId: string }) => {
      handleOffer(data.offer, data.userId).catch(failCall);
    });

    socket.on("webrtc_answer", (data: { answer: RTCSessionDescriptionInit }) => {
      handleAnswer(data.answer).catch(failCall);
    });

    socket.on("ice_candidate", (data: { candidate: RTCIceCandidateInit }) => {
      handleIceCandidate(data.candidate).catch(() => {
        // A candidate that arrives after teardown is expected and harmless.
      });
    });

    socket.on("call_end", () => {
      cleanup();
      useCallStore.getState().resetCall();
    });

    socket.on("call_reject", () => {
      cleanup();
      useCallStore.getState().resetCall();
    });

    return () => {
      socket.off("call_accept");
      socket.off("webrtc_offer");
      socket.off("webrtc_answer");
      socket.off("ice_candidate");
      socket.off("call_end");
      socket.off("call_reject");
      cleanup();
    };
  }, [isInCall, isCaller, callType, createOffer, handleOffer, handleAnswer, handleIceCandidate, cleanup, startLocalStream, failCall]);

  return { createOffer, callError };
}
