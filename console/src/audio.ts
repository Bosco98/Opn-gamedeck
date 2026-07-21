/**
 * Tiny WebAudio synth for console UI sounds — oscillators + gain envelopes,
 * no audio assets. The context is created/resumed by `unlockAudio()` inside
 * the boot-splash click (browser gesture requirement); every other function
 * is a safe no-op until then.
 */

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

interface Note {
  freq: number;
  /** Offset from now, seconds. */
  at: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

function play(notes: Note[]): void {
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = note.type ?? "square";
    osc.frequency.value = note.freq;
    const start = now + note.at;
    const peak = note.gain ?? 0.08;
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(peak, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + note.duration + 0.02);
  }
}

export const sounds = {
  boot(): void {
    play([
      { freq: 262, at: 0, duration: 0.18, type: "triangle", gain: 0.12 },
      { freq: 392, at: 0.14, duration: 0.18, type: "triangle", gain: 0.12 },
      { freq: 523, at: 0.28, duration: 0.34, type: "triangle", gain: 0.14 },
      { freq: 659, at: 0.42, duration: 0.5, type: "sine", gain: 0.1 },
    ]);
  },
  move(): void {
    play([{ freq: 620, at: 0, duration: 0.05 }]);
  },
  confirm(): void {
    play([
      { freq: 523, at: 0, duration: 0.07 },
      { freq: 784, at: 0.06, duration: 0.12 },
    ]);
  },
  back(): void {
    play([
      { freq: 440, at: 0, duration: 0.07 },
      { freq: 330, at: 0.06, duration: 0.1 },
    ]);
  },
  join(): void {
    play([
      { freq: 660, at: 0, duration: 0.08, type: "triangle", gain: 0.1 },
      { freq: 880, at: 0.07, duration: 0.14, type: "triangle", gain: 0.1 },
    ]);
  },
  leave(): void {
    play([
      { freq: 494, at: 0, duration: 0.08, type: "triangle", gain: 0.1 },
      { freq: 330, at: 0.07, duration: 0.14, type: "triangle", gain: 0.1 },
    ]);
  },
  launch(): void {
    play([
      { freq: 392, at: 0, duration: 0.1 },
      { freq: 523, at: 0.09, duration: 0.1 },
      { freq: 659, at: 0.18, duration: 0.1 },
      { freq: 784, at: 0.27, duration: 0.3, type: "triangle", gain: 0.12 },
    ]);
  },
};
