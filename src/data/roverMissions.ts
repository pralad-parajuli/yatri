import {
  MarsCoordinate,
  RoverExpeditionPreset,
  RoverVehicleId,
  RoverVehicleSpec,
} from '../types/mars';

export const ROVER_VEHICLES: Record<RoverVehicleId, RoverVehicleSpec> = {
  perseverance_eva: {
    id: 'perseverance_eva',
    name: 'Perseverance Utility Chassis',
    shortName: 'M20 Utility',
    role: 'NASA 3D MMRTG Scout & Escort Rover',
    description:
      'Authentic NASA Mars 2020 rover chassis configured for autonomous pathfinding, hazard scouting, and low-slope geological corridor verification.',
    cruiseSpeedMs: 4.5, // ~16.2 km/h (simulation scale)
    maxSpeedMs: 6.2, // ~22.3 km/h
    boostSpeedMs: 8.8, // ~31.7 km/h
    reverseSpeedMs: 2.2,
    turnRateDegS: 50,
    maxSafeSlopeDeg: 25,
    chaseDistanceM: 15,
    chaseHeightM: 4.6,
    cabinEyeHeightM: 2.4,
    modelUri: '/api/models/perseverance.glb',
  },
};

export const ROVER_EXPEDITIONS: RoverExpeditionPreset[] = [
  {
    id: 'butler_to_bright_angel',
    name: 'Butler Base → Bright Angel Outpost',
    region: 'Jezero Crater · Neretva Corridor',
    subtitle:
      'Surface rover traverse from Octavia E. Butler Landing across the crater floor and delta apron into Bright Angel mudstone valley.',
    start: { lat: 18.4446, lon: 77.4509, label: 'Octavia E. Butler Base' },
    destination: { lat: 18.4581, lon: 77.3195, label: 'Bright Angel Outpost' },
    recommendedVehicle: 'perseverance_eva',
    routeMode: 'low_difficulty',
  },
  {
    id: 'seitah_to_wildcat',
    name: 'South Séítah → Wildcat Ridge',
    region: 'Jezero Crater · Delta Front',
    subtitle:
      'Cross-basin scientific supply run skirting dune troughs and ascending the delta front bench to Wildcat Ridge.',
    start: { lat: 18.4209, lon: 77.4265, label: 'South Séítah Camp' },
    destination: { lat: 18.4638, lon: 77.3822, label: 'Wildcat Ridge Station' },
    recommendedVehicle: 'perseverance_eva',
    routeMode: 'avoid_hazards',
  },
  {
    id: 'kodiak_to_witch_hazel',
    name: 'Kodiak Relay → Witch Hazel Rim',
    region: 'Jezero Western Escarpment',
    subtitle:
      'High-grade climb from Kodiak Mesa up the Neretva breach toward the Noachian rim bedrock outcrops at Witch Hazel Hill.',
    start: { lat: 18.442, lon: 77.372, label: 'Kodiak Relay' },
    destination: { lat: 18.449, lon: 77.269, label: 'Witch Hazel Rim' },
    recommendedVehicle: 'perseverance_eva',
    routeMode: 'avoid_slopes',
  },
  {
    id: 'belva_science_loop',
    name: 'Butler Base → Belva Crater Rim',
    region: 'Jezero Upper Delta',
    subtitle:
      'Science-weighted corridor stopping near ancient water & carbonate outcrops en route to Belva Crater overlook.',
    start: { lat: 18.4446, lon: 77.4509, label: 'Octavia E. Butler Base' },
    destination: { lat: 18.491, lon: 77.386, label: 'Belva Crater Rim' },
    recommendedVehicle: 'perseverance_eva',
    routeMode: 'visit_science',
  },
];

export const ROVER_WAYPOINT_PRESETS: Array<{ group: 'jezero' | 'mars'; coord: MarsCoordinate }> = [
  { group: 'jezero', coord: { lat: 18.4446, lon: 77.4509, label: 'Octavia E. Butler Base' } },
  { group: 'jezero', coord: { lat: 18.442, lon: 77.372, label: 'Kodiak Delta Butte' } },
  { group: 'jezero', coord: { lat: 18.4638, lon: 77.3822, label: 'Wildcat Ridge' } },
  { group: 'jezero', coord: { lat: 18.4209, lon: 77.4265, label: 'South Séítah' } },
  { group: 'jezero', coord: { lat: 18.4581, lon: 77.3195, label: 'Bright Angel Outpost' } },
  { group: 'jezero', coord: { lat: 18.449, lon: 77.269, label: 'Witch Hazel Hill (Rim)' } },
  { group: 'jezero', coord: { lat: 18.491, lon: 77.386, label: 'Belva Crater Rim' } },
  { group: 'mars', coord: { lat: -4.5895, lon: 137.4417, label: 'Gale Crater (Bradbury)' } },
  { group: 'mars', coord: { lat: -4.67, lon: 137.41, label: 'Gale Mt. Sharp Foothills' } },
  { group: 'mars', coord: { lat: -1.9483, lon: -5.5258, label: 'Meridiani Planum' } },
  { group: 'mars', coord: { lat: -10.35, lon: -70.6, label: 'Valles Marineris Floor' } },
  { group: 'mars', coord: { lat: 4.5024, lon: 135.6234, label: 'Elysium Planitia' } },
];

export function formatRoverDuration(ms: number): string {
  const safeSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = safeSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatEtaSeconds(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  const mins = Math.floor(rounded / 60);
  const remSec = rounded % 60;
  if (mins < 60) return `${mins}m ${String(remSec).padStart(2, '0')}s`;
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  return `${hrs}h ${remMin}m`;
}

let roverAudioCtx: AudioContext | null = null;

function getRoverAudioContext(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!roverAudioCtx) roverAudioCtx = new Ctx();
    if (roverAudioCtx.state === 'suspended') {
      roverAudioCtx.resume().catch(() => {});
    }
    return roverAudioCtx;
  } catch {
    return null;
  }
}

export function playRoverCue(
  kind: 'waypoint' | 'arrived' | 'warn',
  muted: boolean
): void {
  if (muted) return;
  const ctx = getRoverAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const tone = (freq: number, endFreq: number, durS: number, delayS: number, type: OscillatorType, vol: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + delayS);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + delayS + durS);
      gain.gain.setValueAtTime(0.001, now + delayS);
      gain.gain.linearRampToValueAtTime(vol, now + delayS + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delayS + durS);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delayS);
      osc.stop(now + delayS + durS + 0.02);
    };

    if (kind === 'waypoint') {
      tone(660, 880, 0.12, 0, 'sine', 0.06);
    } else if (kind === 'arrived') {
      tone(523.25, 523.25, 0.16, 0, 'triangle', 0.08);
      tone(659.25, 659.25, 0.16, 0.11, 'triangle', 0.08);
      tone(783.99, 1046.5, 0.34, 0.22, 'sine', 0.1);
    } else if (kind === 'warn') {
      tone(340, 290, 0.12, 0, 'square', 0.03);
    }
  } catch {
    // ignore Web Audio failure
  }
}
