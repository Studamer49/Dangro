import React, { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "../contexts/AppContext";

export default function CallContainer({ onClose }) {
  const { addToast } = useApp();
  const [active, setActive] = useState(false);
  const [participants, setParticipants] = useState(["You"]);
  const [timer, setTimer] = useState("00:00");
  const [micMuted, setMicMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [volumeMuted, setVolumeMuted] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    startCall();
    return () => stopCall();
  }, []);

  async function startCall() {
    if (active) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setActive(true);
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        if (!startTimeRef.current) return;
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
        const secs = (elapsed % 60).toString().padStart(2, "0");
        setTimer(mins + ":" + secs);
      }, 1000);
      addToast("Call started!", "success");

      setTimeout(() => {
        if (!localStreamRef.current) return;
        setParticipants(["You", "pixel_alex"]);
        const canvas = document.createElement("canvas");
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = "#fff";
        ctx.font = "24px Inter";
        ctx.fillText("pixel_alex", 240, 240);
        const canvasStream = canvas.captureStream(10);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = canvasStream;
        addToast("pixel_alex joined the call", "success");
      }, 2000);

    } catch (err) {
      addToast("Could not access camera/mic: " + err.message, "error");
      onClose();
    }
  }

  function stopCall() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setActive(false);
    setParticipants([]);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    startTimeRef.current = null;
    addToast("Call ended", "info");
    onClose();
  }

  function toggleMic() {
    setMicMuted(prev => {
      const newVal = !prev;
      localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = !newVal);
      return newVal;
    });
  }

  function toggleVideo() {
    setVideoOff(prev => {
      const newVal = !prev;
      localStreamRef.current?.getVideoTracks().forEach(t => t.enabled = !newVal);
      return newVal;
    });
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => t.stop());
      }
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: !micMuted });
        localStreamRef.current = newStream;
        if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
      } catch {}
      setScreenSharing(false);
      addToast("Screen sharing stopped", "info");
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStream.getVideoTracks()[0].addEventListener("ended", () => {
          setScreenSharing(false);
          navigator.mediaDevices.getUserMedia({ video: true }).then(s => {
            localStreamRef.current = s;
            if (localVideoRef.current) localVideoRef.current.srcObject = s;
          });
        });
        localStreamRef.current = screenStream;
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        setScreenSharing(true);
        addToast("Screen sharing started", "success");
      } catch {
        addToast("Screen sharing cancelled", "info");
      }
    }
  }

  function toggleVolume() {
    setVolumeMuted(prev => {
      const newVal = !prev;
      if (remoteVideoRef.current) remoteVideoRef.current.muted = newVal;
      return newVal;
    });
  }

  return (
    <div className="call-container">
      <div className="call-header">
        <span id="call-status-text">In Call</span>
        <div className="call-timer">{timer}</div>
        <button className="call-end-btn" onClick={stopCall}>End Call</button>
      </div>
      <div className="call-grid">
        <div className="call-video-container">
          <video ref={localVideoRef} id="local-video" autoPlay muted playsInline></video>
          <div className="call-video-label">You</div>
        </div>
        <div className="call-video-container">
          <video ref={remoteVideoRef} id="remote-video" autoPlay playsInline></video>
          <div className="call-video-label">{participants.find(p => p !== "You") || "Participant"}</div>
        </div>
      </div>
      <div className="call-controls">
        <button className={"call-control-btn" + (micMuted ? " muted" : " active")} title="Toggle Mic" onClick={toggleMic}>🎤</button>
        <button className={"call-control-btn" + (videoOff ? " muted" : " active")} title="Toggle Camera" onClick={toggleVideo}>📹</button>
        <button className={"call-control-btn" + (screenSharing ? " muted" : "")} title="Share Screen" onClick={toggleScreenShare}>🖥️</button>
        <button className={"call-control-btn" + (volumeMuted ? " muted" : " active")} title="Toggle Volume" onClick={toggleVolume}>🔊</button>
      </div>
      <div className="call-participants">
        <span className="call-participant-count">Participants: <span id="participant-count">{participants.length}</span></span>
      </div>
    </div>
  );
}
