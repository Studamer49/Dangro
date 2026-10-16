import { useEffect, useRef, useCallback, useState } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";
import { ICE_SERVERS, refreshIceServers } from "@/lib/iceServers";
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

/**
 * ICE candidates get the same "arrived before anyone was listening" problem
 * as the offer, for the same reason and window: the callee accepts the call,
 * and their in-call effect — the only thing that listens for `ice_candidate`
 * — has not flushed yet, while the caller is already trickling candidates out.
 * Candidates are emitted exactly once, so anything landing in that gap was
 * gone for good; on a strict network where only the early host candidates
 * would have worked, the call then never connects at all.
 *
 * So this listener is bound at app start (see `bindCallSignalling`) rather
 * than inside the call effect, and holds candidates until a hook is ready.
 */
type IceHandler = (data: { candidate: RTCIceCandidateInit }) => void;
let activeIceHandler: IceHandler | null = null;
let stashedIce: { data: { candidate: RTCIceCandidateInit }; at: number }[] = [];
let iceBoundTo: Socket | null = null;
const ICE_SHELF_LIFE_MS = 30_000;

function bindIceStash(socket: Socket): void {
  if (iceBoundTo === socket) return;
  iceBoundTo = socket;
  socket.on("ice_candidate", (data: { candidate: RTCIceCandidateInit }) => {
    if (activeIceHandler) {
      activeIceHandler(data);
      return;
    }
    stashedIce.push({ data, at: Date.now() });
    // Candidates arrive in bursts of dozens; a ring nobody answered for a
    // while must not grow this without bound.
    if (stashedIce.length > 64) stashedIce.shift();
  });
}

/** Hands stashed candidates to whoever just became ready, then clears them. */
function drainStashedIce(handler: IceHandler): void {
  const queued = stashedIce;
  stashedIce = [];
  const now = Date.now();
  for (const entry of queued) {
    if (now - entry.at <= ICE_SHELF_LIFE_MS) handler(entry.data);
  }
}

/**
 * Binds the signalling listeners that must exist before a call starts.
 *
 * Called from `CallInvitation`, which is mounted for the whole session, so an
 * offer or candidate is stashed from the very first call in a fresh tab —
 * binding them only inside the in-call effect would leave the first few
 * milliseconds of every first call unguarded.
 */
export function bindCallSignalling(socket: Socket): void {
  bindOfferStash(socket);
  bindIceStash(socket);
}

/** One m-line of a remote offer: its kind, and whether media rides on it. */
interface OfferSection {
  kind: "audio" | "video";
  hasMsid: boolean;
}

/**
 * The caller's m-line layout, in order, read straight from the offer SDP.
 *
 * `addTrack(track, stream)` stamps `a=msid:` on the m-line it creates; the
 * reserved screen line from `addTransceiver` has none. That difference is how
 * the answerer tells the caller's camera from the screen line — and, more
 * importantly, how it reproduces the layout exactly.
 *
 * The old code always built *audio + camera + screen* regardless of what the
 * offer actually contained. When one device denied its camera the two layouts
 * disagreed, so m-lines shifted against each other: a screen share could land
 * on the camera's line, the camera on the screen's, and an answer could fail
 * to fit the offer at all — which killed the entire call instead of
 * degrading to "no camera". Two devices with different permission states is
 * exactly the cross-device case.
 */
function parseOfferShape(sdp: string | undefined): OfferSection[] {
  if (!sdp) return [];
  const sections = sdp.split(/^m=/m).slice(1);
  const shape: OfferSection[] = [];
  for (const section of sections) {
    const ws = section.search(/[\s\r\n]/);
    const kind = (ws === -1 ? section : section.slice(0, ws)).trim();
    if (kind === "audio" || kind === "video") {
      shape.push({ kind, hasMsid: section.includes("a=msid:") });
    }
  }
  return shape;
}

/**
 * Capture constraints.
 *
 * Without these, capture is whatever the browser's driver defaults to — often
 * 640×480 on desktop webcams, which reads as a blurry call on a modern screen.
 * `ideal` asks for 720p and `max` caps at 1080p so a 4K webcam cannot saturate
 * the uplink; the audio processing flags are what keep a call intelligible
 * (echo cancellation in particular is the difference between "call" and
 * "everything I say comes back to me twice").
 */
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
};

/**
 * Encoder ceilings, in bits per second.
 *
 * WebRTC's default video bitrate is low enough to look soft on a 720p frame;
 * these are the quality/latency trade-offs a normal call wants, and the screen
 * share is given more because legible text needs it. They are capped (not
 * fixed) values — congestion control still lowers them on a weak link.
 */
const AUDIO_MAX_BITRATE = 128_000;
const VIDEO_MAX_BITRATE = 2_500_000;
const SCREEN_MAX_BITRATE = 4_000_000;

/** Applies a `maxBitrate` to a sender, best-effort. */
async function tuneSender(sender: RTCRtpSender, maxBitrate: number): Promise<void> {
  try {
    const params = sender.getParameters();
    // Some engines report no encodings until the first description is set;
    // adding one lets the change stick instead of silently doing nothing.
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    for (const encoding of params.encodings) {
      encoding.maxBitrate = maxBitrate;
    }
    await sender.setParameters(params);
  } catch {
    // Not fatal: the connection falls back to the browser's own congestion
    // control, which still produces a working (if less sharp) call.
  }
}

/**
 * Applies the bitrate ceilings to every live sender.
 *
 * Called after each offer/answer is applied, because `setParameters` is a
 * no-op until the connection has negotiated its encodings. The content hint on
 * the track decides whether a video sender is the camera or a screen share.
 */
async function tuneConnection(pc: RTCPeerConnection): Promise<void> {
  await Promise.all(
    pc.getSenders().map((sender) => {
      const track = sender.track;
      if (!track) return Promise.resolve();
      if (track.kind === "audio") return tuneSender(sender, AUDIO_MAX_BITRATE);
      if (track.kind === "video") {
        return tuneSender(sender, track.contentHint === "detail" ? SCREEN_MAX_BITRATE : VIDEO_MAX_BITRATE);
      }
      return Promise.resolve();
    })
  );
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
  /** The display-capture stream while sharing, so it can be stopped cleanly. */
  const screenStreamRef = useRef<MediaStream | null>(null);
  /**
   * The remote screen, assembled separately from the camera.
   *
   * A screen share travels on its own video transceiver, so it arrives as a
   * second `ontrack` rather than replacing the camera. Keeping it in its own
   * stream is what lets the viewer paint the screen large and the person in a
   * corner tile — and swap the two on a tap.
   */
  const assembledRemoteScreenRef = useRef<MediaStream | null>(null);
  const {
    isInCall,
    isCaller,
    callType,
    targetUserId,
    setLocalStream,
    setRemoteStream,
    setLocalScreenStream,
    setRemoteScreenStream,
    setConnectionStatus,
    setScreenSharing,
    endCall,
  } = useCallStore();

  /**
   * Whether a peer connection currently exists.
   *
   * Screen sharing is a `replaceTrack` on the connection, so it silently does
   * nothing before one is built (the caller only builds one after the callee
   * accepts). Reactive so the call controls can disable the share button while
   * it would be a no-op, instead of swallowing the tap.
   */
  const [pcReady, setPcReady] = useState(false);

  const createPeerConnection = useCallback(() => {
    // Replacing the connection without closing the old one left its ICE agent,
    // its event handlers and (if it had tracks) its senders alive, with nothing
    // holding a reference to close them.
    peerConnectionRef.current?.close();
    remoteDescriptionReadyRef.current = false;
    assembledRemoteRef.current = null;
    assembledRemoteScreenRef.current = null;

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
      const track = event.track;
      const [stream] = event.streams ?? [];

      // A screen share is video on the reserved transceiver, which is created
      // with no stream attached, so it arrives with no msid at all. Relying on
      // "no audio in the stream" instead misread a video-only camera — the case
      // where someone denied the microphone but allowed the camera, which the
      // local stream fallback now produces — as a screen share. Routing it to a
      // separate stream is what lets the viewer paint the screen and the person
      // as two tiles that can swap.
      const isScreenVideo = track.kind === "video" && !stream;

      if (isScreenVideo) {
        let assembled = assembledRemoteScreenRef.current;
        if (!assembled) {
          assembled = new MediaStream();
          assembledRemoteScreenRef.current = assembled;
        }
        if (!assembled.getTracks().some((t) => t.id === track.id)) {
          assembled.addTrack(track);
        }
        // The transceiver exists from the moment the call connects, but the
        // screen only becomes real once the sender unmutes. Publish `null`
        // while muted so the UI does not show an empty share.
        const publish = () => {
          setRemoteScreenStream(track.muted ? null : assembled);
          if (!track.muted) setConnectionStatus(null);
        };
        track.onmute = publish;
        track.onunmute = publish;
        publish();
        return;
      }

      // `event.streams[0]` is the happy path, but it is not guaranteed. A track
      // delivered with no stream (an engine that does not populate it, or a
      // transceiver added without one) used to be dropped here, so media was
      // flowing and `remoteStream` stayed null forever — which presents as
      // "I can see myself but not them, and nobody can hear anything".
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
      if (!assembled.getTracks().some((t) => t.id === track.id)) {
        assembled.addTrack(track);
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
    setPcReady(true);
    return pc;
  }, [targetUserId, setRemoteStream, setRemoteScreenStream, setConnectionStatus, endCall]);

  /**
   * The sender reserved for the screen share.
   *
   * A call always negotiates one extra video transceiver beyond the camera (and
   * one even for a voice call, which has no camera at all). Screen sharing is
   * then a `replaceTrack` on that sender — no renegotiation, and the camera
   * keeps flowing at the same time.
   */
  const getScreenSender = useCallback((pc: RTCPeerConnection) => {
    const videoTransceivers = pc
      .getTransceivers()
      .filter((t) => (t.sender.track?.kind ?? t.receiver.track?.kind) === "video");
    return videoTransceivers.length ? videoTransceivers[videoTransceivers.length - 1].sender : null;
  }, []);

  const startLocalStream = useCallback(async (video: boolean) => {
    const existing = useCallStore.getState().localStream;
    if (existing) return existing;

    // Degrade instead of failing: one device may allow the camera but deny
    // the microphone (or vice versa), and refusing the whole call over that
    // left the other side ringing into nothing. Audio is attempted first — a
    // voice conversation beats a silent video — then video alone.
    const attempts: MediaStreamConstraints[] = video
      ? [
          { audio: AUDIO_CONSTRAINTS, video: VIDEO_CONSTRAINTS },
          { audio: AUDIO_CONSTRAINTS, video: false },
          { audio: false, video: VIDEO_CONSTRAINTS },
        ]
      : [{ audio: AUDIO_CONSTRAINTS, video: false }];

    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        // The permission prompt is open across an await the caller cannot
        // cancel. If the call ended while it was pending, nobody is left to stop
        // these tracks — the effect cleanup already ran against a null stream —
        // so the OS recording indicator would stay on indefinitely.
        if (!useCallStore.getState().isInCall) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error("Call ended before the microphone was ready");
        }
        // Tell the encoder this is live motion, not a static image, so it
        // favours smoothness over per-frame detail. The screen share sets the
        // opposite ("detail") when it goes on the wire.
        stream.getVideoTracks().forEach((track) => {
          track.contentHint = "motion";
        });
        setLocalStream(stream);
        return stream;
      } catch (err) {
        // A call that ended mid-prompt is not a permission problem; surface it
        // as-is and stop trying the remaining shapes.
        if (err instanceof Error && err.message.startsWith("Call ended")) throw err;
      }
    }

    // Every shape was refused: report why rather than rejecting with the raw
    // NotAllowedError, which reads as an internal failure to the user.
    throw new Error(video ? "Camera and microphone access were denied" : "Microphone access was denied");
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
    // Pick up the deployment's relay (and fresh short-lived credentials) before
    // building the connection. Cheap when the cache is still valid.
    await refreshIceServers();
    if (!stillInCall()) return;
    const pc = createPeerConnection();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    // Reserve a video m-line for the screen share. It exists on every call — a
    // voice call has no camera, but the share still needs somewhere to send its
    // video. `getScreenSender` picks it out as the last video transceiver.
    pc.addTransceiver("video", { direction: "sendrecv" });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // The encodings exist once a description is set; this is the earliest the
    // bitrate ceilings can be applied.
    await tuneConnection(pc);
    if (targetUserId) {
      const socket = getSocket();
      socket.emit("webrtc_offer", { targetUserId, signal: offer });
    }
  }, [callType, targetUserId, startLocalStream, createPeerConnection]);

  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit, callerId: string) => {
    const stream = await startLocalStream(callType === "video");
    if (!stillInCall()) return;
    await refreshIceServers();
    if (!stillInCall()) return;
    const pc = createPeerConnection();

    // Mirror the caller's m-line layout exactly, in order. The offer is the
    // authority: if their camera was denied it carries no camera m-line, and
    // pre-creating one anyway shifted every video line against theirs — screen
    // shares landed on the camera's line and vice versa, and the answer could
    // fail to fit the offer, taking the whole call down with it. A video
    // m-line only has `a=msid:` when a camera stream was attached to it, which
    // is what separates the camera from the reserved screen line. The last
    // video line stays free for the screen share on both sides.
    const shape = parseOfferShape(offer.sdp);
    const audioTrack = stream.getAudioTracks()[0] ?? null;
    const videoTrack = stream.getVideoTracks()[0] ?? null;
    let cameraPlaced = false;

    if (shape.length === 0) {
      // No usable SDP: fall back to the classic fixed layout so the call can
      // still be attempted rather than failing on a parse.
      if (audioTrack) pc.addTrack(audioTrack, stream);
      else pc.addTransceiver("audio", { direction: "sendrecv" });
      if (videoTrack) pc.addTrack(videoTrack, stream);
      pc.addTransceiver("video", { direction: "sendrecv" });
    } else {
      for (const section of shape) {
        if (section.kind === "audio") {
          if (audioTrack) pc.addTrack(audioTrack, stream);
          else pc.addTransceiver("audio", { direction: "sendrecv" });
        } else if (section.hasMsid && videoTrack && !cameraPlaced) {
          pc.addTrack(videoTrack, stream);
          cameraPlaced = true;
        } else {
          // Their screen line (or a camera line we have no camera for): keep
          // the m-line and its sendrecv direction so a share can travel both
          // ways later via replaceTrack, with nothing attached yet.
          pc.addTransceiver("video", { direction: "sendrecv" });
        }
      }
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    remoteDescriptionReadyRef.current = true;
    // Only now can the queued candidates be applied.
    await drainPendingCandidates(pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await tuneConnection(pc);
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
    assembledRemoteScreenRef.current = null;
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
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
    setLocalScreenStream(null);
    setRemoteScreenStream(null);
    setConnectionStatus(null);
    setScreenSharing(false);
    setPcReady(false);
  }, [setLocalStream, setRemoteStream, setLocalScreenStream, setRemoteScreenStream, setConnectionStatus, setScreenSharing]);

  const [callError, setCallError] = useState<string | null>(null);

  /**
   * Puts the user's screen on the reserved video sender (or clears it).
   *
   * The camera is sent on its own sender and is left alone, so the other side
   * receives the person and the screen as two separate tracks at once — the
   * two tiles the viewer can swap. Starting or stopping a share is a
   * `replaceTrack`, so the connection is never renegotiated.
   */
  const toggleScreenShare = useCallback(async () => {
    const pc = peerConnectionRef.current;
    const { isScreenSharing, setScreenSharing } = useCallStore.getState();
    if (!pc) return;
    const screenSender = getScreenSender(pc);

    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      useCallStore.getState().setLocalScreenStream(null);
      if (screenSender) await screenSender.replaceTrack(null);
      setScreenSharing(false);
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          // Cap at 1080p30: a 4K share is unreadable text at the other end
          // anyway once the encoder scales it down, and the uplink cannot
          // sustain it. The detail hint below keeps what is sent crisp.
          frameRate: { ideal: 30, max: 30 },
          width: { max: 1920 },
          height: { max: 1080 },
        },
        audio: false,
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return;
      // "detail" tells the encoder to preserve sharpness for text over frame
      // rate, and is also how `tuneConnection` recognises a screen sender.
      screenTrack.contentHint = "detail";

      if (screenSender) {
        await screenSender.replaceTrack(screenTrack);
        await tuneSender(screenSender, SCREEN_MAX_BITRATE);
      } else if (useCallStore.getState().localStream) {
        const sender = pc.addTrack(screenTrack, screenStream);
        await tuneSender(sender, SCREEN_MAX_BITRATE);
      }
      screenStreamRef.current = screenStream;
      setLocalScreenStream(screenStream);
      setScreenSharing(true);

      // The user can also stop sharing from the browser's own "Stop sharing"
      // bar; listen for that so the state does not go stale.
      screenTrack.onended = () => {
        screenSender?.replaceTrack(null).catch(() => undefined);
        screenStreamRef.current = null;
        useCallStore.getState().setLocalScreenStream(null);
        useCallStore.getState().setScreenSharing(false);
      };
    } catch (err) {
      // The user dismissed the picker; not an error worth surfacing.
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      console.warn("[webrtc] screen share failed", err);
    }
  }, [getScreenSender]);

  /** Ends the call and surfaces why, instead of rejecting into the void. */
  const failCall = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : "The call could not be set up";
    setCallError(message);
    // Tell the other side this call is dead. Without it a side that failed
    // setup (permission denied on one device, media hardware missing) tore
    // down locally while the peer sat at "Ringing…" or "Connecting…" forever.
    const { targetUserId: peer } = useCallStore.getState();
    if (peer) {
      getSocket().emit("call_end", { targetUserId: peer });
    }
    cleanup();
    useCallStore.getState().resetCall();
  }, [cleanup]);

  useEffect(() => {
    if (!isInCall) return;

    // A failed setup leaves its message behind; clear it so a fresh call does
    // not open with the previous call's error already on screen.
    setCallError(null);

    /** Backstop for the caller when the signalling server itself is gone. */
    let ringTimer: number | undefined;

    if (isCaller) {
      // Pre-acquire the local stream so permission is requested immediately;
      // a denial has to end the call rather than surface as an unhandled
      // rejection.
      startLocalStream(callType === "video").catch(failCall);
      // The server times an unanswered ring out after 40s, but a dead or
      // unreachable server times nothing out: without this the caller rang
      // at "Ringing…" for as long as they were willing to watch.
      ringTimer = window.setTimeout(() => {
        const state = useCallStore.getState();
        if (!state.isInCall || !state.isCaller || state.remoteStream) return;
        // Tell the other side too: the server's own 40s timer only fires while
        // the server is reachable, so a callee whose room outlived the caller's
        // patience would otherwise keep ringing.
        if (state.targetUserId) {
          getSocket().emit("call_end", { targetUserId: state.targetUserId });
        }
        cleanup();
        state.resetCall();
        state.setCallNotice("No answer.");
      }, 45_000);
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

    const handleIceEvent: IceHandler = (data) => {
      handleIceCandidate(data.candidate).catch(() => {
        // A candidate that arrives after teardown is expected and harmless.
      });
    };

    const handleCallEnd = () => {
      cleanup();
      useCallStore.getState().resetCall();
    };

    const handleCallReject = () => {
      const wasCaller = useCallStore.getState().isCaller;
      cleanup();
      useCallStore.getState().resetCall();
      // The caller used to see the ring simply vanish with no explanation.
      if (wasCaller) useCallStore.getState().setCallNotice("Call declined.");
    };

    /**
     * The server gave up on an unanswered ring — or discovered mid-accept that
     * the room was already gone. Either way this side must stop: the caller
     * stops ringing, and a callee whose accept lost a race stops waiting for
     * an offer that will never come.
     */
    const handleCallTimeout = (data: { roomId: string }) => {
      const state = useCallStore.getState();
      if (state.roomId !== data.roomId) return;
      const wasCaller = state.isCaller;
      cleanup();
      state.resetCall();
      if (wasCaller) useCallStore.getState().setCallNotice("No answer.");
    };

    // Offers and candidates are bound once at module scope rather than here,
    // so signals that beat this effect are stashed instead of lost. Everything
    // else still registers per call, because those can only arrive while one
    // is up.
    bindCallSignalling(socket);
    activeOfferHandler = handleOfferEvent;
    activeIceHandler = handleIceEvent;
    // Signals that landed while nobody was listening are ready now.
    drainStashedOffer(handleOfferEvent);
    drainStashedIce(handleIceEvent);

    socket.on("call_accept", handleCallAccept);
    socket.on("webrtc_answer", handleAnswerEvent);
    socket.on("call_end", handleCallEnd);
    socket.on("call_reject", handleCallReject);
    socket.on("call_timeout", handleCallTimeout);

    return () => {
      socket.off("call_accept", handleCallAccept);
      socket.off("webrtc_answer", handleAnswerEvent);
      socket.off("call_end", handleCallEnd);
      socket.off("call_reject", handleCallReject);
      socket.off("call_timeout", handleCallTimeout);
      if (ringTimer !== undefined) window.clearTimeout(ringTimer);
      // Detach the handlers but keep the stashes: they are the whole reason
      // the module-scope listeners exist, and anything stashed may belong to
      // the next call rather than this one.
      if (activeOfferHandler === handleOfferEvent) activeOfferHandler = null;
      if (activeIceHandler === handleIceEvent) activeIceHandler = null;
      cleanup();
    };
  }, [isInCall, isCaller, callType, createOffer, handleOffer, handleAnswer, handleIceCandidate, cleanup, startLocalStream, failCall]);

  return { createOffer, callError, toggleScreenShare, pcReady };
}
