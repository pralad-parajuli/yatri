import { CoordinateFormat, LongitudeConvention } from '../types/mars';

export const MARS_EQUATORIAL_RADIUS_M = 3396190.0;
export const MARS_POLAR_RADIUS_M = 3376200.0;

export function marsDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return MARS_EQUATORIAL_RADIUS_M * c;
}

export function marsBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function normalizeLonSigned(lon: number): number {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === -180 && lon > 0) l = 180;
  return l;
}

export function toEast360(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

function toDMS(val: number, posHem: string, negHem: string): string {
  const hem = val >= 0 ? posHem : negHem;
  const abs = Math.abs(val);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = ((mFloat - m) * 60).toFixed(1);
  return `${d}°${String(m).padStart(2, '0')}'${s.padStart(4, '0')}"${hem}`;
}

export function formatMarsCoords(
  lat: number,
  lon: number,
  format: CoordinateFormat = 'decimal',
  convention: LongitudeConvention = 'signed'
): { latStr: string; lonStr: string } {
  const signedLon = normalizeLonSigned(lon);
  if (format === 'dms') {
    if (convention === 'east360') {
      const e360 = toEast360(signedLon);
      return {
        latStr: toDMS(lat, 'N', 'S'),
        lonStr: toDMS(e360, 'E', 'E'),
      };
    }
    return {
      latStr: toDMS(lat, 'N', 'S'),
      lonStr: toDMS(signedLon, 'E', 'W'),
    };
  }

  const latStr = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
  if (convention === 'east360') {
    return {
      latStr,
      lonStr: `${toEast360(signedLon).toFixed(4)}°E`,
    };
  }
  return {
    latStr,
    lonStr: `${Math.abs(signedLon).toFixed(4)}°${signedLon >= 0 ? 'E' : 'W'}`,
  };
}

/**
 * Parse flexible Mars coordinate strings such as:
 * "18.4446, 77.4509", "18.44N 77.45E", "-4.59, 137.44", "18.44°N, 282.5°E"
 */
export function parseCoordinateQuery(input: string): { lat: number; lon: number } | null {
  const cleaned = input.trim().replace(/°/g, ' ').replace(/,/g, ' ');
  const match = cleaned.match(
    /^([+-]?\d+(?:\.\d+)?)\s*([NSns])?\s+([+-]?\d+(?:\.\d+)?)\s*([EWew])?$/
  );
  if (!match) return null;
  let lat = parseFloat(match[1]);
  const latHem = match[2]?.toUpperCase();
  let lon = parseFloat(match[3]);
  const lonHem = match[4]?.toUpperCase();

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (latHem === 'S') lat = -Math.abs(lat);
  if (latHem === 'N') lat = Math.abs(lat);
  if (lonHem === 'W') lon = -Math.abs(lon);
  if (lonHem === 'E') lon = Math.abs(lon);

  if (lat < -90 || lat > 90) return null;
  lon = normalizeLonSigned(lon);
  return { lat, lon };
}

function latLonToUnitVec(latDeg: number, lonDeg: number): [number, number, number] {
  const latR = (latDeg * Math.PI) / 180;
  const lonR = (lonDeg * Math.PI) / 180;
  const cosLat = Math.cos(latR);
  return [cosLat * Math.cos(lonR), cosLat * Math.sin(lonR), Math.sin(latR)];
}

function unitVecToLatLon(x: number, y: number, z: number): { lat: number; lon: number } {
  const hyp = Math.hypot(x, y);
  const lat = (Math.atan2(z, hyp) * 180) / Math.PI;
  const lon = normalizeLonSigned((Math.atan2(y, x) * 180) / Math.PI);
  return { lat, lon };
}

/**
 * Interpolates points along the shortest spherical great-circle arc on Mars,
 * avoiding antimeridian wraparound artifacts and rhumb distortion.
 * Returns [lon, lat] vertices.
 */
export function interpolateGreatCircle(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  numSegments: number
): Array<[number, number]> {
  const steps = Math.max(1, numSegments);
  const a = latLonToUnitVec(lat1, lon1);
  const b = latLonToUnitVec(lat2, lon2);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);

  const out: Array<[number, number]> = [[Number(lon1.toFixed(6)), Number(lat1.toFixed(6))]];
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    let vx: number;
    let vy: number;
    let vz: number;
    if (omega < 1e-6) {
      vx = a[0] + (b[0] - a[0]) * t;
      vy = a[1] + (b[1] - a[1]) * t;
      vz = a[2] + (b[2] - a[2]) * t;
    } else {
      const sinO = Math.sin(omega);
      const w0 = Math.sin((1 - t) * omega) / sinO;
      const w1 = Math.sin(t * omega) / sinO;
      vx = a[0] * w0 + b[0] * w1;
      vy = a[1] * w0 + b[1] * w1;
      vz = a[2] * w0 + b[2] * w1;
    }
    const len = Math.hypot(vx, vy, vz) || 1;
    const pt = unitVecToLatLon(vx / len, vy / len, vz / len);
    out.push([Number(pt.lon.toFixed(6)), Number(pt.lat.toFixed(6))]);
  }
  out.push([Number(lon2.toFixed(6)), Number(lat2.toFixed(6))]);
  return out;
}

export function sphericalMidpoint(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { lat: number; lon: number } {
  const a = latLonToUnitVec(lat1, lon1);
  const b = latLonToUnitVec(lat2, lon2);
  const mx = a[0] + b[0];
  const my = a[1] + b[1];
  const mz = a[2] + b[2];
  const len = Math.hypot(mx, my, mz);
  if (len < 1e-6) {
    return { lat: (lat1 + lat2) / 2, lon: normalizeLonSigned((lon1 + lon2) / 2) };
  }
  return unitVecToLatLon(mx / len, my / len, mz / len);
}

