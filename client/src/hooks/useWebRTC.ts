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
      // The permission prompt is open across an await the caller cannot
      // cancel. If the call ended while it was pending, nobody is left to stop
      // these tracks — the effect cleanup already ran against a null stream —
      // so the OS recording indicator would stay on indefinitely.
      if (!useCallStore.getState().isInCall) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Call ended before the microphone was ready");
      }
      setLocalStream(stream);
      return stream;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Call ended")) throw err;
      // Camera denied or unavailable: fall back to audio only.
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (!useCallStore.getState().isInCall) {
          audioOnly.getTracks().forEach((track) => track.stop());
          throw new Error("Call ended before the microphone was ready");
        }
        setLocalStream(audioOnly);
        return audioOnly;
      } catch (fallbackErr) {
        if (fallbackErr instanceof Error && fallbackErr.message.startsWith("Call ended")) {
          throw fallbackErr;
        }
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

    // Handlers are kept in named consts so cleanup can remove exactly these
    // ones. `socket.off("call_end")` with no argument removes *every* listener
    // for that event on the shared socket — including CallInvitation's, which
    // is mounted independently. That left the incoming-call overlay ringing
    // after the caller had already hung up.
    const handleCallAccept = () => {
      createOffer().catch(failCall);
    };

    const handleOfferEvent = (data: { offer: RTCSessionDescriptionInit; userId: string }) => {
      handleOffer(data.offer, data.userId).catch(failCall);
    };

    const handleAnswerEvent = (data: { answer: RTCSessionDescriptionInit }) => {
      handleAnswer(data.answer).catch(failCall);
    };

    const handleIceEvent = (data: { candidate: RTCIceCandidateInit }) => {
      handleIceCandidate(data.candidate).catch(() => {
        // A candidate that arrives after teardown is expected and harmless.
      });
    };

    const handleCallEnd = () => {
      cleanup();
      useCallStore.getState().resetCall();
    };

    const handleCallReject = () => {
      cleanup();
      useCallStore.getState().resetCall();
    };

    socket.on("call_accept", handleCallAccept);
    socket.on("webrtc_offer", handleOfferEvent);
    socket.on("webrtc_answer", handleAnswerEvent);
    socket.on("ice_candidate", handleIceEvent);
    socket.on("call_end", handleCallEnd);
    socket.on("call_reject", handleCallReject);

    return () => {
      socket.off("call_accept", handleCallAccept);
      socket.off("webrtc_offer", handleOfferEvent);
      socket.off("webrtc_answer", handleAnswerEvent);
      socket.off("ice_candidate", handleIceEvent);
      socket.off("call_end", handleCallEnd);
      socket.off("call_reject", handleCallReject);
      cleanup();
    };
  }, [isInCall, isCaller, callType, createOffer, handleOffer, handleAnswer, handleIceCandidate, cleanup, startLocalStream, failCall]);

  return { createOffer, callError };
}
