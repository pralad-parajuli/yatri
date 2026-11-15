import { JezeroElevationGrid } from '../types/mars';

export interface ElevationQueryResult {
  elevationM: number | null;
  dataQuality: 'measured' | 'regional_model' | 'insufficient_data';
}

export function isInsideJezeroGrid(
  grid: JezeroElevationGrid,
  lat: number,
  lon: number
): boolean {
  return (
    lon >= grid.bounds.minLon &&
    lon <= grid.bounds.maxLon &&
    lat >= grid.bounds.minLat &&
    lat <= grid.bounds.maxLat
  );
}

export function sampleElevationGrid(
  grid: JezeroElevationGrid | null,
  lat: number,
  lon: number
): ElevationQueryResult {
  if (!grid || !isInsideJezeroGrid(grid, lat, lon)) {
    return { elevationM: null, dataQuality: 'insufficient_data' };
  }

  const cFloat = (lon - grid.bounds.minLon) / grid.dLon;
  const rFloat = (lat - grid.bounds.minLat) / grid.dLat;

  const c0 = Math.max(0, Math.min(grid.cols - 2, Math.floor(cFloat)));
  const r0 = Math.max(0, Math.min(grid.rows - 2, Math.floor(rFloat)));
  const tx = Math.max(0, Math.min(1, cFloat - c0));
  const ty = Math.max(0, Math.min(1, rFloat - r0));

  const idx00 = r0 * grid.cols + c0;
  const idx10 = r0 * grid.cols + (c0 + 1);
  const idx01 = (r0 + 1) * grid.cols + c0;
  const idx11 = (r0 + 1) * grid.cols + (c0 + 1);

  const e00 = grid.elevations[idx00];
  const e10 = grid.elevations[idx10];
  const e01 = grid.elevations[idx01];
  const e11 = grid.elevations[idx11];

  if (e00 === null || e10 === null || e01 === null || e11 === null) {
    return { elevationM: null, dataQuality: 'insufficient_data' };
  }

  const e0 = e00 * (1 - tx) + e10 * tx;
  const e1 = e01 * (1 - tx) + e11 * tx;
  const elevationM = Number((e0 * (1 - ty) + e1 * ty).toFixed(2));

  const qMin = Math.min(
    grid.quality[idx00],
    grid.quality[idx10],
    grid.quality[idx01],
    grid.quality[idx11]
  );

  if (qMin === 0) {
    return { elevationM: null, dataQuality: 'insufficient_data' };
  }
  const qMax = Math.max(
    grid.quality[idx00],
    grid.quality[idx10],
    grid.quality[idx01],
    grid.quality[idx11]
  );

  return {
    elevationM,
    dataQuality: qMax === 2 ? 'measured' : 'regional_model',
  };
}
