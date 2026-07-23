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
  callType: "video" | "voice" | null;
  roomId: string | null;
  targetUserId: string | null;
  targetUser: User | null;
  incomingCall: IncomingCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;

  initiateCall: (targetUserId: string, targetUser: User, callType: "video" | "voice") => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  setIncomingCall: (call: IncomingCall | null) => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  isInCall: false,
  callType: null,
  roomId: null,
  targetUserId: null,
  targetUser: null,
  incomingCall: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoOff: false,

  initiateCall: (targetUserId, targetUser, callType) => {
    const roomId = `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const socket = getSocket();
    socket.emit("call_invite", { targetUserId, callType, roomId });
    set({
      isInCall: true,
      callType,
      roomId,
      targetUserId,
      targetUser,
      isMuted: false,
      isVideoOff: false,
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
      callType: incomingCall.callType,
      roomId: incomingCall.roomId,
      targetUserId: incomingCall.callerId,
      targetUser: incomingCall.caller,
      incomingCall: null,
      isMuted: false,
      isVideoOff: false,
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
    const { targetUserId, localStream } = get();
    if (targetUserId) {
      const socket = getSocket();
      socket.emit("call_end", { targetUserId });
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    set({
      isInCall: false,
      callType: null,
      roomId: null,
      targetUserId: null,
      targetUser: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isVideoOff: false,
    });
  },

  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),

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
