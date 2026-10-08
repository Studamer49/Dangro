let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function playRing(): void {
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") return;

  const now = ctx.currentTime;
  const beep = (start: number, frequency: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
    gain.gain.setValueAtTime(0.22, start + duration - 0.04);
    gain.gain.linearRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  };

  // Classic two-tone ring, ~1.1s between beeps.
  beep(now, 440, 0.55);
  beep(now + 1.1, 440, 0.55);
}

let timer: number | null = null;
let refCount = 0;

function unlock(): void {
  getContext();
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function startRingtone(): () => void {
  refCount += 1;
  if (refCount === 1) {
    playRing();
    timer = window.setInterval(playRing, 3400);
  }
  return stopRingtone;
}

export function stopRingtone(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}