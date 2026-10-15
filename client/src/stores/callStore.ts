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
  /**
   * A call-scoped message for the UI to show as a toast.
   *
   * Invite refusals and unanswered rings used to be silent: the server dropped
   * the event and the user sat at "Ringing..." with nothing to read. The
   * message survives `resetCall` so the modal can toast it after the call
   * state is gone, and is cleared when displayed or when a new call starts.
   */
  callNotice: string | null;
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
  setScreenSharing: (sharing: boolean) => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  setIncomingCall: (call: IncomingCall | null) => void;
  setCallNotice: (notice: string | null) => void;
}

/** Why the server refused an invite, in words the caller can read. */
const INVITE_REFUSALS: Record<string, string> = {
  unavailable: "You can't call this person right now.",
  busy: "They're in another call.",
  "in-call": "You're already in a call.",
  rate: "Too many call attempts — wait a minute and try again.",
  invalid: "Couldn't place the call.",
  error: "Couldn't place the call.",
};

export const useCallStore = create<CallState>((set, get) => ({
  isInCall: false,
  isCaller: false,
  callType: null,
  roomId: null,
  targetUserId: null,
  targetUser: null,
  incomingCall: null,
  callNotice: null,
  localStream: null,
  remoteStream: null,
  localScreenStream: null,
  remoteScreenStream: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  connectionStatus: null,

  initiateCall: (targetUserId, targetUser, callType) => {
    const roomId = `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    set({
      isInCall: true,
      isCaller: true,
      callType,
      roomId,
      targetUserId,
      targetUser,
      isMuted: false,
      isVideoOff: false,
      callNotice: null,
    });
    const socket = getSocket();
    // The server acknowledges: a refused invite (not allowed to contact them,
    // already in a call, rate limited) used to be dropped in silence, leaving
    // the caller ringing at "Ringing..." until they gave up on their own.
    socket.emit(
      "call_invite",
      { targetUserId, callType, roomId },
      (response: { ok?: boolean; reason?: string } | undefined) => {
        if (!response || response.ok !== false) return;
        const state = get();
        // Only tear down if this refusal belongs to the call still on screen.
        if (!state.isCaller || state.roomId !== roomId) return;
        state.resetCall();
        get().setCallNotice(INVITE_REFUSALS[response.reason ?? ""] ?? "Couldn't place the call.");
      }
    );
  },

  acceptCall: () => {
    const { incomingCall } = get();
    if (!incomingCall) return;
    const { callerId, callType, roomId, caller } = incomingCall;
    set({
      isInCall: true,
      isCaller: false,
      callType,
      roomId,
      targetUserId: callerId,
      targetUser: caller,
      incomingCall: null,
      isMuted: false,
      isVideoOff: false,
      callNotice: null,
    });
    const socket = getSocket();
    // The room may already be gone — the caller hung up, the ring timed out,
    // or a second device of ours answered first. Without this ack the callee
    // sat in a call whose offer would never come, showing "Connecting…"
    // forever with no way to know why.
    socket.emit("call_accept", { targetUserId: callerId, roomId }, (response: { ok?: boolean } | undefined) => {
      if (!response || response.ok !== false) return;
      const state = get();
      if (!state.isInCall || state.isCaller || state.roomId !== roomId) return;
      state.resetCall();
      state.setCallNotice("That call has ended.");
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
    });
  },

  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),
  setLocalScreenStream: (stream) => set({ localScreenStream: stream }),
  setRemoteScreenStream: (stream) => set({ remoteScreenStream: stream }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
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
  setCallNotice: (callNotice) => set({ callNotice }),
}));
