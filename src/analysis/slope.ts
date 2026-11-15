import { JezeroElevationGrid } from '../types/mars';
import { MARS_EQUATORIAL_RADIUS_M } from '../utils/coordinates';

export interface SlopeRoughnessResult {
  slopeDeg: number | null;
  roughnessM: number | null;
}

export function computeCellSlopeAndRoughness(
  grid: JezeroElevationGrid,
  row: number,
  col: number
): SlopeRoughnessResult {
  if (row <= 0 || row >= grid.rows - 1 || col <= 0 || col >= grid.cols - 1) {
    const center = grid.elevations[row * grid.cols + col];
    if (center === null) return { slopeDeg: null, roughnessM: null };
    return { slopeDeg: 0, roughnessM: 0 };
  }

  const getE = (r: number, c: number) => grid.elevations[r * grid.cols + c];
  const center = getE(row, col);
  if (center === null) return { slopeDeg: null, roughnessM: null };

  const left = getE(row, col - 1);
  const right = getE(row, col + 1);
  const down = getE(row - 1, col);
  const up = getE(row + 1, col);

  if (left === null || right === null || down === null || up === null) {
    return { slopeDeg: null, roughnessM: null };
  }

  const latDeg = grid.bounds.minLat + row * grid.dLat;
  const latRad = (latDeg * Math.PI) / 180;
  const dxMeters =
    ((grid.dLon * Math.PI) / 180) * MARS_EQUATORIAL_RADIUS_M * Math.cos(latRad);
  const dyMeters = ((grid.dLat * Math.PI) / 180) * MARS_EQUATORIAL_RADIUS_M;

  const dzdx = (right - left) / (2 * dxMeters);
  const dzdy = (up - down) / (2 * dyMeters);
  const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
  const slopeDeg = Number(((slopeRad * 180) / Math.PI).toFixed(2));

  // Terrain Ruggedness Index (RMS difference vs 8 neighbors)
  let sumSq = 0;
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nb = getE(row + dr, col + dc);
      if (nb !== null) {
        sumSq += (nb - center) ** 2;
        count++;
      }
    }
  }
  const roughnessM = count > 0 ? Number(Math.sqrt(sumSq / count).toFixed(2)) : null;

  return { slopeDeg, roughnessM };
}

export function sampleSlopeAndRoughness(
  grid: JezeroElevationGrid | null,
  lat: number,
  lon: number
): SlopeRoughnessResult {
  if (!grid) return { slopeDeg: null, roughnessM: null };
  const col = Math.round((lon - grid.bounds.minLon) / grid.dLon);
  const row = Math.round((lat - grid.bounds.minLat) / grid.dLat);
  if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) {
    return { slopeDeg: null, roughnessM: null };
  }
  return computeCellSlopeAndRoughness(grid, row, col);
}
