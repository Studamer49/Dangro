import { useEffect, useRef, useCallback } from "react";
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
    callType,
    targetUserId,
    localStream,
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
          candidate: event.candidate.toJSON(),
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video,
      });
      setLocalStream(stream);
      return stream;
    } catch {
      const audioOnly = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      setLocalStream(audioOnly);
      return audioOnly;
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
      socket.emit("webrtc_offer", { targetUserId, offer: pc.localDescription });
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
    socket.emit("webrtc_answer", { targetUserId: callerId, answer: pc.localDescription });
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
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
  }, [localStream, setLocalStream, setRemoteStream]);

  useEffect(() => {
    if (!isInCall) return;

    const socket = getSocket();

    socket.on("webrtc_offer", async (data: { offer: RTCSessionDescriptionInit; userId: string }) => {
      await handleOffer(data.offer, data.userId);
    });

    socket.on("webrtc_answer", async (data: { answer: RTCSessionDescriptionInit }) => {
      await handleAnswer(data.answer);
    });

    socket.on("ice_candidate", async (data: { candidate: RTCIceCandidateInit }) => {
      await handleIceCandidate(data.candidate);
    });

    socket.on("call_end", () => {
      cleanup();
      useCallStore.getState().endCall();
    });

    socket.on("call_reject", () => {
      cleanup();
      useCallStore.getState().endCall();
    });

    return () => {
      socket.off("webrtc_offer");
      socket.off("webrtc_answer");
      socket.off("ice_candidate");
      socket.off("call_end");
      socket.off("call_reject");
      cleanup();
    };
  }, [isInCall, handleOffer, handleAnswer, handleIceCandidate, cleanup]);

  return { createOffer };
}
