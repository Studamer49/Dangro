import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { ICE_SERVERS, refreshIceServers } from "@/lib/iceServers";
import type { User } from "@/types";

export interface VoicePeer {
  userId: string;
  user: User | null;
  stream: MediaStream | null;
  camera: boolean;
}

interface PeerConnection {
  userId: string;
  pc: RTCPeerConnection;
  /**
   * Perfect-negotiation role. Established members offer to a newcomer and act
   * as the impolite side; the newcomer answers and yields on glare.
   */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  stream: MediaStream | null;
  camera: boolean;
  pendingIce: RTCIceCandidateInit[];
}

interface SignalPayload {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/**
 * Group voice (and optional video) for a server voice channel.
 *
 * A full mesh: every participant holds one `RTCPeerConnection` per other
 * participant, negotiated with the perfect-negotiation pattern so a camera
 * toggled on either side renegotiates without glare.
 */
export function useVoiceChannel(currentUser: User | null) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const usersRef = useRef<Map<string, User>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelIdRef = useRef<string | null>(null);
  const cameraEnabledRef = useRef(false);
  const currentUserRef = useRef<User | null>(currentUser);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const publishPeers = useCallback(() => {
    setPeers(
      Array.from(peersRef.current.values()).map((peer) => ({
        userId: peer.userId,
        user: usersRef.current.get(peer.userId) ?? null,
        stream: peer.stream,
        camera: peer.camera,
      }))
    );
  }, []);

  const rememberUser = useCallback(
    async (userId: string) => {
      if (usersRef.current.has(userId)) return;
      try {
        const { data } = await api.get(`/users/${userId}`);
        if (data?.user) {
          usersRef.current.set(userId, data.user as User);
          publishPeers();
        }
      } catch {
        // Non-fatal: the tile falls back to a generic label.
      }
    },
    [publishPeers]
  );

  const emitSignal = useCallback((targetUserId: string, signal: SignalPayload) => {
    const channelId = channelIdRef.current;
    // Scope the signal to the voice room we are in, so the server can relay it
    // only to someone actually in that same room rather than merely sharing
    // *some* voice room with us.
    if (!channelId) return;
    getSocket().emit("voice_signal", { targetUserId, channelId, signal });
  }, []);

  const closePeer = useCallback(
    (userId: string) => {
      const peer = peersRef.current.get(userId);
      if (!peer) return;
      try {
        peer.pc.close();
      } catch {
        // Already closed.
      }
      peersRef.current.delete(userId);
      publishPeers();
    },
    [publishPeers]
  );

  const createPeer = useCallback(
    (peerId: string, polite: boolean): PeerConnection => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      const peer: PeerConnection = {
        userId: peerId,
        pc,
        polite,
        makingOffer: false,
        ignoreOffer: false,
        stream: null,
        camera: false,
        pendingIce: [],
      };
      peersRef.current.set(peerId, peer);

      pc.onicecandidate = (event) => {
        if (event.candidate) emitSignal(peerId, { candidate: event.candidate.toJSON() });
      };

      pc.ontrack = (event) => {
        peer.stream = event.streams[0] ?? new MediaStream([event.track]);
        if (event.track.kind === "video") peer.camera = true;
        const syncCamera = () => {
          if (event.track.kind !== "video") return;
          peer.camera = event.track.muted !== true && event.track.readyState === "live";
          publishPeers();
        };
        event.track.addEventListener("mute", syncCamera);
        event.track.addEventListener("unmute", syncCamera);
        event.track.addEventListener("ended", syncCamera);
        publishPeers();
      };

      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          emitSignal(peerId, { description: pc.localDescription ?? undefined });
        } catch {
          // This pair failed to negotiate; the others are unaffected.
        } finally {
          peer.makingOffer = false;
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") closePeer(peerId);
      };

      const stream = localStreamRef.current;
      if (stream) stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      return peer;
    },
    [closePeer, emitSignal, publishPeers]
  );

  const handleSignal = useCallback(
    async (fromUserId: string, signal: SignalPayload) => {
      let peer = peersRef.current.get(fromUserId);
      if (!peer) {
        // An unsolicited description is always an offer, and its sender is the
        // impolite party, so the receiver answers as the polite peer.
        peer = createPeer(fromUserId, true);
      }
      const pc = peer.pc;

      try {
        if (signal.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
          else peer.pendingIce.push(signal.candidate);
          return;
        }

        const description = signal.description;
        if (!description) return;

        const collision =
          description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;

        await pc.setRemoteDescription(description);
        if (description.type === "offer") {
          await pc.setLocalDescription();
          emitSignal(fromUserId, { description: pc.localDescription ?? undefined });
        }

        const queued = peer.pendingIce.splice(0);
        for (const candidate of queued) {
          await pc.addIceCandidate(candidate).catch(() => undefined);
        }
      } catch {
        // A description the peer connection rejects is not fatal for the rest.
      }
    },
    [createPeer, emitSignal]
  );

  useEffect(() => {
    const socket = getSocket();

    const handlePeers = (data: { channelId: string; peers: Array<{ userId: string }> }) => {
      if (data.channelId !== channelIdRef.current) return;
      // The members already in the channel offer to us; we only need to learn
      // who they are so their tiles render before media arrives.
      data.peers.forEach(({ userId }) => void rememberUser(userId));
    };

    const handleUserJoin = (data: { userId: string; channelId: string }) => {
      if (data.channelId !== channelIdRef.current) return;
      if (data.userId === currentUserRef.current?.id) return;
      void rememberUser(data.userId);
      // We are already here, so we take the impolite role and offer.
      createPeer(data.userId, false);
      publishPeers();
    };

    const handleUserLeave = (data: { userId: string; channelId: string }) => {
      if (data.channelId !== channelIdRef.current) return;
      closePeer(data.userId);
    };

    const onVoiceSignal = (data: { userId: string; signal: SignalPayload }) => {
      if (!channelIdRef.current) return;
      if (data.userId === currentUserRef.current?.id) return;
      void handleSignal(data.userId, data.signal);
    };

    /**
     * Socket.IO keeps the same object across reconnects but the server's room
     * membership is per-connection, so a dropped socket silently removed the
     * user from the voice room while the UI still showed them in it. On
     * reconnect, tear down the now-dead peer connections and rejoin; the server
     * hands back the roster and the members offer to us again.
     */
    const onReconnect = () => {
      const id = channelIdRef.current;
      if (!id) return;
      for (const peer of peersRef.current.values()) {
        try {
          peer.pc.close();
        } catch {
          // Already closed.
        }
      }
      peersRef.current.clear();
      publishPeers();
      getSocket().emit("voice_join", { channelId: id });
    };

    socket.on("voice_peers", handlePeers);
    socket.on("voice_user_join", handleUserJoin);
    socket.on("voice_user_leave", handleUserLeave);
    socket.on("voice_signal", onVoiceSignal);
    socket.on("connect", onReconnect);

    return () => {
      socket.off("voice_peers", handlePeers);
      socket.off("voice_user_join", handleUserJoin);
      socket.off("voice_user_leave", handleUserLeave);
      socket.off("voice_signal", onVoiceSignal);
      socket.off("connect", onReconnect);
    };
  }, [createPeer, publishPeers, rememberUser, closePeer, handleSignal]);

  const stopLocalStream = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const closeAllPeers = useCallback(() => {
    for (const peer of peersRef.current.values()) {
      try {
        peer.pc.close();
      } catch {
        // Already closed.
      }
    }
    peersRef.current.clear();
    publishPeers();
  }, [publishPeers]);

  const leave = useCallback(() => {
    if (channelIdRef.current) {
      getSocket().emit("voice_leave", { channelId: channelIdRef.current });
    }
    channelIdRef.current = null;
    setChannelId(null);
    setChannelName(null);
    setConnecting(false);
    setMicEnabled(true);
    setCameraEnabled(false);
    cameraEnabledRef.current = false;
    stopLocalStream();
    closeAllPeers();
  }, [closeAllPeers, stopLocalStream]);

  const join = useCallback(
    async (id: string, name: string) => {
      if (channelIdRef.current === id) return;
      if (channelIdRef.current) leave();

      setError(null);
      setConnecting(true);
      channelIdRef.current = id;
      setChannelId(id);
      setChannelName(name);

      // Refresh the relay (and any short-lived credentials) before the mesh
      // builds its connections.
      void refreshIceServers();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        // The channel may have been left while the permission prompt was open.
        if (channelIdRef.current !== id) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicEnabled(true);
        setCameraEnabled(false);
        cameraEnabledRef.current = false;
        getSocket().emit("voice_join", { channelId: id });
        setConnecting(false);
      } catch {
        if (channelIdRef.current === id) {
          channelIdRef.current = null;
          setChannelId(null);
          setChannelName(null);
          setConnecting(false);
          setError("Microphone access was denied");
        }
      }
    },
    [leave]
  );

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    setMicEnabled((previous) => {
      const next = !previous;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }, []);

  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    if (cameraEnabledRef.current) {
      for (const track of stream.getVideoTracks()) {
        stream.removeTrack(track);
        track.stop();
      }
      for (const peer of peersRef.current.values()) {
        const sender = peer.pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          try {
            peer.pc.removeTrack(sender);
          } catch {
            // Sender already gone.
          }
        }
      }
      cameraEnabledRef.current = false;
      setCameraEnabled(false);
      return;
    }

    try {
      const camera = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = camera.getVideoTracks()[0];
      if (!track) return;
      stream.addTrack(track);
      for (const peer of peersRef.current.values()) peer.pc.addTrack(track, stream);
      cameraEnabledRef.current = true;
      setCameraEnabled(true);
    } catch {
      setError("Camera access was denied");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (channelIdRef.current) {
        getSocket().emit("voice_leave", { channelId: channelIdRef.current });
      }
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      for (const peer of peersRef.current.values()) {
        try {
          peer.pc.close();
        } catch {
          // Already closed.
        }
      }
      peersRef.current.clear();
    };
  }, []);

  return {
    channelId,
    channelName,
    connecting,
    localStream,
    micEnabled,
    cameraEnabled,
    peers,
    error,
    join,
    leave,
    toggleMic,
    toggleCamera,
    dismissError: () => setError(null),
  };
}
