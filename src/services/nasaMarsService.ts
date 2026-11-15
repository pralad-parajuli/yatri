import { JezeroElevationGrid, MissionTelemetry } from '../types/mars';

export interface MarsSpaceWeatherAlert {
  messageId: string;
  messageType: string;
  issueTime: string;
  summary: string;
  url?: string;
}

export interface MarsDirectedCme {
  activityId: string;
  startTime: string;
  note: string;
}

export interface MarsSpaceWeatherSummary {
  source: string;
  fetchedAt: string;
  windowStart: string;
  windowEnd: string;
  cmeCount30d: number;
  sepCount30d: number;
  marsDirectedCmeCount30d: number;
  marsDirectedCmes: MarsDirectedCme[];
  recentAlerts: MarsSpaceWeatherAlert[];
  scopeNote: string;
}

let spaceWeatherCache: { value: MarsSpaceWeatherSummary; expiresAt: number } | null = null;
const telemetryCache = new Map<string, { value: MissionTelemetry; expiresAt: number }>();
let elevationGridCache: { value: JezeroElevationGrid; expiresAt: number } | null = null;

export async function fetchMissionTelemetry(
  missionId: 'perseverance' | 'curiosity'
): Promise<MissionTelemetry> {
  const cached = telemetryCache.get(missionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const res = await fetch(`/api/missions/${missionId}/telemetry`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${missionId} telemetry (HTTP ${res.status})`);
  }
  const data = (await res.json()) as MissionTelemetry;
  telemetryCache.set(missionId, {
    value: data,
    expiresAt: Date.now() + 1000 * 60 * 15,
  });
  return data;
}

export async function fetchJezeroElevationGrid(): Promise<JezeroElevationGrid> {
  if (elevationGridCache && elevationGridCache.expiresAt > Date.now()) {
    return elevationGridCache.value;
  }
  const res = await fetch('/api/elevation/jezero-grid');
  if (!res.ok) {
    throw new Error(`Failed to fetch Jezero elevation grid (HTTP ${res.status})`);
  }
  const data = (await res.json()) as JezeroElevationGrid;
  elevationGridCache = {
    value: data,
    expiresAt: Date.now() + 1000 * 60 * 30,
  };
  return data;
}

export async function fetchMarsSpaceWeather(): Promise<MarsSpaceWeatherSummary> {
  if (spaceWeatherCache && spaceWeatherCache.expiresAt > Date.now()) {
    return spaceWeatherCache.value;
  }
  const res = await fetch('/api/nasa/space-weather');
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) msg = err.error;
    } catch {
      // ignore parse failure
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as MarsSpaceWeatherSummary;
  spaceWeatherCache = {
    value: data,
    expiresAt: Date.now() + 1000 * 60 * 10,
  };
  return data;
}
