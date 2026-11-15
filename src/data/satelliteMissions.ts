import {
  MarsCoordinate,
  SatelliteCraftId,
  SatelliteCraftSpec,
  SatellitePassPreset,
} from '../types/mars';

export const SATELLITE_CRAFTS: Record<SatelliteCraftId, SatelliteCraftSpec> = {
  mro: {
    id: 'mro',
    name: 'Mars Reconnaissance Orbiter (MRO)',
    shortName: 'MRO Orbiter',
    agency: 'NASA / JPL-Caltech',
    role: 'High-Resolution Orbital Imaging & Electra UHF Relay',
    description:
      'Sun-synchronous mapping satellite carrying the HiRISE telescope, CRISM spectrometer, and Electra UHF relay transceiver for surface rovers.',
    altitudeKm: 280,
    orbitalSpeedKmS: 3.41,
    inclinationDeg: 92.7,
    swathWidthKm: 32,
    instrumentName: 'HiRISE + CTX + Electra UHF',
    downlinkPeakMbps: 5.2,
    solarPeakW: 2000,
    accentColor: '#22d3ee',
    modelUri: '/api/models/mro.glb',
  },
  odyssey: {
    id: 'odyssey',
    name: '2001 Mars Odyssey',
    shortName: 'Mars Odyssey',
    agency: 'NASA / JPL / ASU',
    role: 'Thermal Infrared Surface Mapper & Relay Node',
    description:
      'Longest-operating Mars spacecraft mapping global mineral heat signatures via THEMIS infrared imaging while relaying rover packets to Earth.',
    altitudeKm: 400,
    orbitalSpeedKmS: 3.35,
    inclinationDeg: 93.1,
    swathWidthKm: 48,
    instrumentName: 'THEMIS IR + Gamma-Ray Suite',
    downlinkPeakMbps: 2.4,
    solarPeakW: 750,
    accentColor: '#818cf8',
    modelUri: '/api/models/odyssey.glb',
  },
  mgs: {
    id: 'mgs',
    name: 'Mars Global Surveyor (MGS)',
    shortName: 'Mars Global Surveyor',
    agency: 'NASA / JPL / GSFC',
    role: 'MOLA Laser Altimetry & Crustal Magnetometer',
    description:
      'Precision topographic altimeter orbiter firing continuous MOLA laser pulses to chart elevation profiles, crater rims, and canyons.',
    altitudeKm: 380,
    orbitalSpeedKmS: 3.36,
    inclinationDeg: 92.9,
    swathWidthKm: 24,
    instrumentName: 'MOLA Laser Altimeter + MOC',
    downlinkPeakMbps: 1.8,
    solarPeakW: 980,
    accentColor: '#38bdf8',
    modelUri: '/api/models/mgs.glb',
  },
};

export const SATELLITE_PASS_PRESETS: SatellitePassPreset[] = [
  {
    id: 'jezero_to_gale',
    name: 'Jezero Crater → Gale Crater Survey',
    region: 'Isidis Basin → Elysium Corridor',
    subtitle:
      'Low-altitude orbital reconnaissance pass from Perseverance at Jezero across Syrtis & Elysium down to Curiosity in Gale Crater.',
    start: { lat: 18.4446, lon: 77.4509, label: 'Jezero Crater (Perseverance)' },
    destination: { lat: -4.5895, lon: 137.4417, label: 'Gale Crater (Curiosity)' },
    recommendedCraft: 'mro',
  },
  {
    id: 'valles_to_olympus',
    name: 'Valles Marineris → Olympus Mons',
    region: 'Coprates Chasma → Tharsis Bulge',
    subtitle:
      'Sweep over the 4,000 km Valles Marineris canyon system and Tharsis volcanic shield straight to the summit caldera of Olympus Mons.',
    start: { lat: -13.9, lon: -59.2, label: 'Valles Marineris (Coprates)' },
    destination: { lat: 18.65, lon: -133.8, label: 'Olympus Mons Caldera' },
    recommendedCraft: 'mgs',
  },
  {
    id: 'north_pole_to_elysium',
    name: 'North Polar Cap → Elysium Planitia',
    region: 'Planum Boreum → InSight Plains',
    subtitle:
      'Sun-synchronous polar descent scanning layered polar water-ice troughs southward toward Arcadia and Elysium Planitia.',
    start: { lat: 79.5, lon: 112.0, label: 'Planum Boreum Ice Cap' },
    destination: { lat: 4.5024, lon: 135.6234, label: 'Elysium Planitia (InSight)' },
    recommendedCraft: 'odyssey',
  },
  {
    id: 'hellas_to_meridiani',
    name: 'Hellas Basin → Meridiani Planum',
    region: 'Southern Highlands → Equator',
    subtitle:
      'Thermal and topographic orbital transit climbing out of the deepest impact basin on Mars toward Opportunity’s Meridiani Planum.',
    start: { lat: -42.4, lon: 70.5, label: 'Hellas Planitia Basin' },
    destination: { lat: -1.9483, lon: -5.5258, label: 'Meridiani Planum (Oppy)' },
    recommendedCraft: 'odyssey',
  },
];

export const SATELLITE_TARGET_PRESETS: MarsCoordinate[] = [
  { lat: 18.4446, lon: 77.4509, label: 'Jezero Crater (Perseverance)' },
  { lat: -4.5895, lon: 137.4417, label: 'Gale Crater (Curiosity)' },
  { lat: 4.5024, lon: 135.6234, label: 'Elysium Planitia (InSight)' },
  { lat: 25.102, lon: 109.914, label: 'Utopia Planitia (Zhurong)' },
  { lat: -1.9483, lon: -5.5258, label: 'Meridiani Planum (Oppy)' },
  { lat: 18.65, lon: -133.8, label: 'Olympus Mons Caldera' },
  { lat: -13.9, lon: -59.2, label: 'Valles Marineris (Coprates)' },
  { lat: -42.4, lon: 70.5, label: 'Hellas Planitia Basin' },
  { lat: 79.5, lon: 112.0, label: 'Planum Boreum Ice Cap' },
  { lat: 22.483, lon: -47.968, label: 'Chryse Planitia (Viking 1)' },
];

export function formatSatDuration(ms: number): string {
  const safeSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = safeSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatSatEta(seconds: number | null): string {
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

let satAudioCtx: AudioContext | null = null;

function getSatAudioContext(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!satAudioCtx) satAudioCtx = new Ctx();
    if (satAudioCtx.state === 'suspended') {
      satAudioCtx.resume().catch(() => {});
    }
    return satAudioCtx;
  } catch {
    return null;
  }
}

export function playSatCue(kind: 'scan' | 'relay' | 'arrived', muted: boolean): void {
  if (muted) return;
  const ctx = getSatAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const tone = (
      freq: number,
      endFreq: number,
      durS: number,
      delayS: number,
      type: OscillatorType,
      vol: number
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + delayS);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + delayS + durS);
      gain.gain.setValueAtTime(0.001, now + delayS);
      gain.gain.linearRampToValueAtTime(vol, now + delayS + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delayS + durS);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delayS);
      osc.stop(now + delayS + durS + 0.02);
    };

    if (kind === 'scan') {
      tone(980, 1320, 0.09, 0, 'sine', 0.045);
    } else if (kind === 'relay') {
      tone(660, 880, 0.12, 0, 'triangle', 0.06);
      tone(880, 1175, 0.14, 0.09, 'sine', 0.055);
    } else if (kind === 'arrived') {
      tone(587.33, 587.33, 0.16, 0, 'triangle', 0.07);
      tone(783.99, 783.99, 0.18, 0.12, 'triangle', 0.07);
      tone(1046.5, 1046.5, 0.32, 0.24, 'sine', 0.09);
    }
  } catch {
    // ignore Web Audio failure
  }
}
