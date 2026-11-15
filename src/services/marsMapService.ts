import { MARS_LAYERS } from '../data/layers';
import { MARS_LOCATIONS } from '../data/locations';
import { MARS_MISSIONS } from '../data/missions';
import { MarsLayerConfig, MarsLocation, MarsMission } from '../types/mars';
import { marsDistanceMeters } from '../utils/coordinates';

export interface TrekSearchItem {
  title: string;
  productLabel: string;
  itemType: string;
  instrument?: string;
  mission?: string;
  shape?: string;
  description?: string;
}

const trekSearchCache = new Map<string, { value: { items: TrekSearchItem[]; source: string }; expiresAt: number }>();

export async function searchMarsTrekNomenclature(
  query: string
): Promise<{ items: TrekSearchItem[]; source: string }> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return { items: [], source: 'Mars Trek Index' };
  }
  const cached = trekSearchCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const res = await fetch(`/api/trek/search?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) {
      return { items: [], source: 'Mars Trek search unavailable' };
    }
    const data = (await res.json()) as { items: TrekSearchItem[]; source: string };
    trekSearchCache.set(normalized, {
      value: data,
      expiresAt: Date.now() + 1000 * 60 * 30,
    });
    return data;
  } catch {
    return { items: [], source: 'Mars Trek search unavailable' };
  }
}

export function getTrekWmtsTileUrlTemplate(layer: MarsLayerConfig): string | null {
  if (layer.kind !== 'trek_wmts' || !layer.trekLayerId) return null;
  const ext = layer.trekFormat || 'jpg';
  return `/api/tiles/trek/${layer.trekLayerId}/{z}/{y}/{x}.${ext}`;
}

export function getVerifiedImageryCatalog(): MarsLayerConfig[] {
  return MARS_LAYERS;
}

export function findAssociatedMissionForLocation(location: MarsLocation): MarsMission | null {
  let bestMission: MarsMission | null = null;
  let bestDistM = Infinity;

  for (const m of MARS_MISSIONS) {
    if (m.missionType === 'Orbiter') continue;
    const d = marsDistanceMeters(location.lat, location.lon, m.lat, m.lon);
    if (d < 45000 && d < bestDistM) {
      bestDistM = d;
      bestMission = m;
    }
  }
  return bestMission;
}

export function findNearestVerifiedLocation(
  lat: number,
  lon: number,
  maxRadiusM = 30000
): { location: MarsLocation; distanceM: number } | null {
  let best: { location: MarsLocation; distanceM: number } | null = null;
  for (const loc of MARS_LOCATIONS) {
    const d = marsDistanceMeters(lat, lon, loc.lat, loc.lon);
    if (d <= maxRadiusM && (!best || d < best.distanceM)) {
      best = { location: loc, distanceM: d };
    }
  }
  return best;
}
