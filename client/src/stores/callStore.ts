import { create } from "zustand";
import { getSocket } from "@/lib/socket";
import type { User } from "@/types";

interface IncomingCall {
  callerId: string;
  caller: User | null;
  callType: "video" | "voice";
  roomId: string;
}

interface CallState {
  isInCall: boolean;
  isCaller: boolean;
  callType: "video" | "voice" | null;
  roomId: string | null;
  targetUserId: string | null;
  targetUser: User | null;
  incomingCall: IncomingCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /**
   * The screen being shared, kept separate from the participant streams so the
   * viewer can show the screen large and the person in a corner tile — and
   * swap the two on a tap.
   */
  localScreenStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  /**
   * Why a call could not even be placed, in words the UI can show.
   *
   * A refused or unroutable invite used to be dropped silently by the server,
   * which left the caller's window sitting on "Ringing..." indefinitely —
   * indistinguishable from someone who simply never picked up. The server now
   * answers with a reason, and this surfaces it.
   */
  callUnavailableReason: string | null;

  /**
   * Why the call is not working, in words the UI can show.
   *
   * A call that fails to connect used to present as a black rectangle with the
   * viewer's own face in the corner — indistinguishable from "still ringing".
   * There is no way to debug WebRTC from a screenshot, so the peer connection's
   * own state is surfaced here and rendered.
   */
  connectionStatus: string | null;

  initiateCall: (targetUserId: string, targetUser: User, callType: "video" | "voice") => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  resetCall: () => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setLocalScreenStream: (stream: MediaStream | null) => void;
  setRemoteScreenStream: (stream: MediaStream | null) => void;
  setConnectionStatus: (status: string | null) => void;
  /** Records why an invite was refused; `null` clears it. */
  setCallUnavailable: (reason: string | null) => void;
  setScreenSharing: (sharing: boolean) => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  setIncomingCall: (call: IncomingCall | null) => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  isInCall: false,
  isCaller: false,
  callType: null,
  roomId: null,
  targetUserId: null,
  targetUser: null,
  incomingCall: null,
  localStream: null,
  remoteStream: null,
  localScreenStream: null,
  remoteScreenStream: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  connectionStatus: null,
  callUnavailableReason: null,

  initiateCall: (targetUserId, targetUser, callType) => {
    const roomId = `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const socket = getSocket();
    socket.emit("call_invite", { targetUserId, callType, roomId });
    set({
      isInCall: true,
      isCaller: true,
      callType,
      roomId,
      targetUserId,
      targetUser,
      isMuted: false,
      isVideoOff: false,
      callUnavailableReason: null,
    });
  },

  acceptCall: () => {
    const { incomingCall } = get();
    if (!incomingCall) return;
    const socket = getSocket();
    socket.emit("call_accept", {
      targetUserId: incomingCall.callerId,
      roomId: incomingCall.roomId,
    });
    set({
      isInCall: true,
      isCaller: false,
      callType: incomingCall.callType,
      roomId: incomingCall.roomId,
      targetUserId: incomingCall.callerId,
      targetUser: incomingCall.caller,
      incomingCall: null,
      isMuted: false,
      isVideoOff: false,
      callUnavailableReason: null,
    });
  },

  rejectCall: () => {
    const { incomingCall } = get();
    if (incomingCall) {
      const socket = getSocket();
      socket.emit("call_reject", { targetUserId: incomingCall.callerId });
    }
    set({ incomingCall: null });
  },

  endCall: () => {
    const { targetUserId, resetCall } = get();
    if (targetUserId) {
      const socket = getSocket();
      socket.emit("call_end", { targetUserId });
    }
    resetCall();
  },

  resetCall: () => {
    const { localStream, localScreenStream } = get();
    localStream?.getTracks().forEach((track) => track.stop());
    localScreenStream?.getTracks().forEach((track) => track.stop());
    set({
      isInCall: false,
      isCaller: false,
      callType: null,
      roomId: null,
      targetUserId: null,
      targetUser: null,
      incomingCall: null,
      localStream: null,
      remoteStream: null,
      localScreenStream: null,
      remoteScreenStream: null,
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false,
      connectionStatus: null,
      callUnavailableReason: null,
    });
  },

  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),
  setLocalScreenStream: (stream) => set({ localScreenStream: stream }),
  setRemoteScreenStream: (stream) => set({ remoteScreenStream: stream }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setCallUnavailable: (callUnavailableReason) => set({ callUnavailableReason }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),

  toggleMute: () => {
    const { localStream, isMuted } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
    }
    set({ isMuted: !isMuted });
  },

  toggleVideo: () => {
    const { localStream, isVideoOff } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = isVideoOff;
      });
    }
    set({ isVideoOff: !isVideoOff });
  },

  setIncomingCall: (call) => set({ incomingCall: call }),
}));
