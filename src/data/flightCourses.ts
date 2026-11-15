import {
  FlightCourse,
  FlightCraftId,
  FlightCraftSpec,
} from '../types/mars';

export const FLIGHT_CRAFTS: Record<FlightCraftId, FlightCraftSpec> = {
  ingenuity_scout: {
    id: 'ingenuity_scout',
    name: 'Ingenuity Mars Scout',
    shortName: 'Ingenuity Scout',
    role: 'Coaxial Low-Altitude Rotorcraft',
    description:
      'NASA coaxial helicopter tuned for agile delta canyons, slow geological hover-passes, and tight turn radii.',
    minSpeedMs: 14,
    cruiseSpeedMs: 48,
    maxSpeedMs: 85,
    boostSpeedMs: 125,
    pitchRateDegS: 50,
    yawRateDegS: 62,
    maxBankDeg: 45,
    chaseDistanceM: 36,
    chaseHeightM: 9,
    modelUri: '/api/models/ingenuity.glb',
  },
  ares_wing: {
    id: 'ares_wing',
    name: 'Ares Supersonic Wing',
    shortName: 'Ares Wing',
    role: 'High-Mach Lifting-Body Flyer',
    description:
      'Thin-atmosphere supersonic Mars glider with swept delta wings and dual afterburners built for canyon skimming.',
    minSpeedMs: 80,
    cruiseSpeedMs: 260,
    maxSpeedMs: 440,
    boostSpeedMs: 620,
    pitchRateDegS: 44,
    yawRateDegS: 46,
    maxBankDeg: 64,
    chaseDistanceM: 70,
    chaseHeightM: 15,
  },
};

export const FLIGHT_COURSES: FlightCourse[] = [
  {
    id: 'jezero_delta_run',
    name: 'Jezero Crater Delta',
    region: 'Jezero Crater · Perseverance Sector',
    subtitle:
      'Take off over Octavia E. Butler Landing to explore Séítah Dunes, Kodiak Mesa, Wildcat Ridge, and Bright Angel.',
    recommendedCraft: 'ingenuity_scout',
    difficulty: 'Standard',
    startLat: 18.4446,
    startLon: 77.4509,
    startAglM: 65,
    startHeadingDeg: 270,
    groundRefElevM: -2570,
  },
];

export function formatFlightTime(ms: number): string {
  const safe = Math.max(0, ms);
  const mins = Math.floor(safe / 60000);
  const secs = Math.floor((safe % 60000) / 1000);
  const tenths = Math.floor((safe % 1000) / 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

// Lightweight Web Audio cue synthesizer (zero external audio dependencies)
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function playFlightCue(
  kind: 'crash' | 'warn',
  muted: boolean
): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const playTone = (
      freq: number,
      endFreq: number,
      durationS: number,
      delayS: number,
      type: OscillatorType,
      gainVal: number
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + delayS);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + delayS + durationS);

      gain.gain.setValueAtTime(0.001, now + delayS);
      gain.gain.linearRampToValueAtTime(gainVal, now + delayS + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delayS + durationS);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delayS);
      osc.stop(now + delayS + durationS + 0.02);
    };

    if (kind === 'crash') {
      playTone(180, 48, 0.45, 0, 'sawtooth', 0.12);
    } else if (kind === 'warn') {
      playTone(440, 392, 0.11, 0, 'square', 0.035);
    }
  } catch {
    // ignore Web Audio failure
  }
}
