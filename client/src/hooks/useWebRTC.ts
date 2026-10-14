import { useEffect, useRef, useCallback, useState } from "react";
import { getSocket } from "@/lib/socket";
import { ICE_SERVERS } from "@/lib/iceServers";
import { useCallStore } from "@/stores/callStore";

export function useWebRTC() {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  /**
   * Candidates that arrived before there was a connection to add them to.
   *
   * The callee sits inside the getUserMedia prompt before creating its peer
   * connection, and the caller starts gathering the moment it sends its offer.
   * Every candidate that lands in that window used to hit a null
   * `peerConnectionRef` and be dropped — and candidates are emitted once and
   * never re-sent, so they were lost for good.
   */
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
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
    // Replacing the connection without closing the old one left its ICE agent,
    // its event handlers and (if it had tracks) its senders alive, with nothing
    // holding a reference to close them.
    peerConnectionRef.current?.close();

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
      if (pc.connectionState === "failed") {
        endCall();
      } else if (pc.connectionState === "disconnected") {
        // "disconnected" is frequently transient — a brief network blip that
        // recovers to "connected" on its own. Ending the call at once tore down
        // sessions that would have survived, so give it a grace period first.
        window.setTimeout(() => {
          if (peerConnectionRef.current === pc && pc.connectionState === "disconnected") {
            endCall();
          }
        }, 5000);
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

  /**
   * True while the user is still in a call. Re-checked after every await: the
   * effect cleanup can run (and close whatever peer connection existed at the
   * time) while a permission prompt or a signalling round trip is pending, and
   * the handlers below would otherwise build a connection nothing will ever
   * close and emit signals for a call that is already over.
   */
  const stillInCall = () => useCallStore.getState().isInCall;

  /** Applies everything queued while there was no peer connection. */
  const drainPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingCandidatesRef.current.splice(0);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Stale or unusable candidate; the next ones may still connect.
      }
    }
  }, []);

  const createOffer = useCallback(async () => {
    const stream = await startLocalStream(callType === "video");
    if (!stillInCall()) return;
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
    if (!stillInCall()) return;
    const pc = createPeerConnection();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    // Only now can the queued candidates be applied.
    await drainPendingCandidates(pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    const socket = getSocket();
    socket.emit("webrtc_answer", { targetUserId: callerId, signal: answer });
  }, [callType, startLocalStream, createPeerConnection, drainPendingCandidates]);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    const pc = peerConnectionRef.current;
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await drainPendingCandidates(pc);
    }
  }, [drainPendingCandidates]);

  /**
   * Adds a candidate, queueing it when the connection does not exist yet.
   * Queueing is only correct once a remote description is set, so the queue is
   * drained by `drainPendingCandidates` after that happens.
   */
  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionRef.current;
    if (!pc) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // A candidate that cannot be applied is not fatal: the rest of the
      // gathering set may still connect, and an unhandled rejection here would
      // surface as an unhandled promise rejection instead.
      console.warn("[webrtc] could not add ICE candidate", err);
    }
  }, []);

  const cleanup = useCallback(() => {
    pendingCandidatesRef.current = [];
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
