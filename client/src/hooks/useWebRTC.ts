import { useEffect, useRef, useCallback, useState } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";
import { ICE_SERVERS } from "@/lib/iceServers";
import { useCallStore } from "@/stores/callStore";

type OfferHandler = (offer: RTCSessionDescriptionInit, userId: string) => void;

/**
 * An offer can arrive before the callee is listening for one.
 *
 * `acceptCall` emits `call_accept` synchronously, and the caller begins
 * creating and sending its offer the moment that lands — which is well before
 * React has flushed the callee's `useEffect` and attached its `webrtc_offer`
 * listener. On a fast or local socket the offer simply arrives into the void:
 * it is never delivered, no answer is ever sent, `remoteStream` stays null,
 * and both sides sit there seeing only their own camera with no sound.
 *
 * So the listener is attached once, at module scope, and holds the offer until
 * a hook instance is ready to act on it. Exactly one listener is bound per
 * socket, and it forwards or stashes — never both — so an offer is handled once.
 */
let activeOfferHandler: OfferHandler | null = null;
/**
 * How long a stashed offer stays usable.
 *
 * It exists to cover the gap between "the caller sent an offer" and "the callee
 * finished mounting", which is milliseconds. Anything older belongs to a call
 * that has already ended, and replaying it into the next one would open a peer
 * connection to a stranger's stale session description.
 */
const OFFER_SHELF_LIFE_MS = 30_000;
let stashedOffer: { offer: RTCSessionDescriptionInit; userId: string; at: number } | null = null;
let stashBoundTo: Socket | null = null;

function bindOfferStash(socket: Socket): void {
  if (stashBoundTo === socket) return;
  stashBoundTo = socket;
  socket.on("webrtc_offer", (data: { offer: RTCSessionDescriptionInit; userId: string }) => {
    if (activeOfferHandler) {
      activeOfferHandler(data.offer, data.userId);
      return;
    }
    stashedOffer = { offer: data.offer, userId: data.userId, at: Date.now() };
  });
}

/** Hands the stashed offer to whoever just became ready, then clears it. */
function drainStashedOffer(handler: OfferHandler): void {
  const stashed = stashedOffer;
  if (!stashed) return;
  stashedOffer = null;
  if (Date.now() - stashed.at > OFFER_SHELF_LIFE_MS) return;
  handler(stashed.offer, stashed.userId);
}

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
  /**
   * Whether the current peer connection has a remote description yet.
   *
   * `addIceCandidate` throws until one is set, and the candidate is then gone:
   * ICE candidates are emitted once and never re-sent. A candidate that arrived
   * during the window between "peer connection created" and "remote description
   * set" was therefore dropped for good, which can leave the connection unable
   * to find a working pair. Candidates are queued until this is true.
   */
  const remoteDescriptionReadyRef = useRef(false);
  /**
   * The remote MediaStream we assemble ourselves.
   *
   * Only used when the engine hands over a track with no associated stream.
   */
  const assembledRemoteRef = useRef<MediaStream | null>(null);
  const {
    isInCall,
    isCaller,
    callType,
    targetUserId,
    setLocalStream,
    setRemoteStream,
    setConnectionStatus,
    endCall,
  } = useCallStore();

  const createPeerConnection = useCallback(() => {
    // Replacing the connection without closing the old one left its ICE agent,
    // its event handlers and (if it had tracks) its senders alive, with nothing
    // holding a reference to close them.
    peerConnectionRef.current?.close();
    remoteDescriptionReadyRef.current = false;
    assembledRemoteRef.current = null;

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
      // `event.streams[0]` is the happy path, but it is not guaranteed. A track
      // delivered with no stream (an engine that does not populate it, or a
      // transceiver added without one) used to be dropped here, so media was
      // flowing and `remoteStream` stayed null forever — which presents as
      // "I can see myself but not them, and nobody can hear anything".
      const [stream] = event.streams ?? [];
      if (stream) {
        assembledRemoteRef.current = null;
        setRemoteStream(stream);
        setConnectionStatus(null);
        return;
      }

      let assembled = assembledRemoteRef.current;
      if (!assembled) {
        assembled = new MediaStream();
        assembledRemoteRef.current = assembled;
      }
      if (!assembled.getTracks().some((track) => track.id === event.track.id)) {
        assembled.addTrack(event.track);
      }
      setRemoteStream(assembled);
      setConnectionStatus(null);
    };

    /**
     * Reports what the connection is actually doing.
     *
     * `iceConnectionState` is the one that matters for "can we see them": it
     * reaches "failed" when no candidate pair works, which is what a blocked
     * STUN/TURN server or a symmetric NAT looks like from inside the browser.
     */
    const describe = () => {
      const { iceConnectionState, connectionState } = pc;
      if (connectionState === "connected") {
        setConnectionStatus(null);
      } else if (iceConnectionState === "failed") {
        setConnectionStatus(
          "Could not reach the other person. This is usually the network blocking the connection — a TURN relay may be needed."
        );
      } else if (iceConnectionState === "checking") {
        setConnectionStatus("Finding a direct connection…");
      }
    };
    pc.oniceconnectionstatechange = describe;
    pc.onconnectionstatechange = () => {
      describe();
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
  }, [targetUserId, setRemoteStream, setConnectionStatus, endCall]);

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
    remoteDescriptionReadyRef.current = true;
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
      remoteDescriptionReadyRef.current = true;
      await drainPendingCandidates(pc);
    }
  }, [drainPendingCandidates]);

  /**
   * Adds a candidate, queueing it until the remote description is set.
   *
   * Queueing on "no peer connection yet" was not enough: the connection exists
   * from the moment the offer is created, but `addIceCandidate` throws until
   * the remote description lands, and the throw discarded the candidate for
   * good. Candidates are now queued whenever the connection is not yet ready to
   * accept them, and drained by `drainPendingCandidates`.
   */
  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionRef.current;
    if (!pc || !remoteDescriptionReadyRef.current) {
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
    remoteDescriptionReadyRef.current = false;
    assembledRemoteRef.current = null;
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
    setConnectionStatus(null);
  }, [setLocalStream, setRemoteStream, setConnectionStatus]);

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

    const handleOfferEvent: OfferHandler = (offer, callerId) => {
      handleOffer(offer, callerId).catch(failCall);
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

    // `webrtc_offer` is bound once at module scope rather than here, so an
    // offer that beats this effect is stashed instead of lost. Everything else
    // still registers per call, because those can only arrive while one is up.
    bindOfferStash(socket);
    activeOfferHandler = handleOfferEvent;
    // An offer that landed while nobody was listening is ready now.
    drainStashedOffer(handleOfferEvent);

    socket.on("call_accept", handleCallAccept);
    socket.on("webrtc_answer", handleAnswerEvent);
    socket.on("ice_candidate", handleIceEvent);
    socket.on("call_end", handleCallEnd);
    socket.on("call_reject", handleCallReject);

    return () => {
      socket.off("call_accept", handleCallAccept);
      socket.off("webrtc_answer", handleAnswerEvent);
      socket.off("ice_candidate", handleIceEvent);
      socket.off("call_end", handleCallEnd);
      socket.off("call_reject", handleCallReject);
      // Detach the handler but keep the stash: it is the whole reason the
      // module-scope listener exists, and the stashed offer may belong to the
      // next call rather than this one.
      if (activeOfferHandler === handleOfferEvent) activeOfferHandler = null;
      cleanup();
    };
  }, [isInCall, isCaller, callType, createOffer, handleOffer, handleAnswer, handleIceCandidate, cleanup, startLocalStream, failCall]);

  return { createOffer, callError };
}
