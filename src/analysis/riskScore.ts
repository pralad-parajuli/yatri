import { JezeroElevationGrid, RiskLevel, TerrainSample } from '../types/mars';
import { marsDistanceMeters } from '../utils/coordinates';
import { sampleElevationGrid } from './elevation';
import { sampleSlopeAndRoughness } from './slope';

export interface KnownTerrainFeatureZone {
  name: string;
  lat: number;
  lon: number;
  radiusM: number;
  kind: 'crater_rim' | 'sand_dunes' | 'steep_scarp' | 'depression' | 'rocky_unit';
  note: string;
}

export const JEZERO_HAZARD_ZONES: KnownTerrainFeatureZone[] = [
  {
    name: 'Belva Crater Wall & Ejecta',
    lat: 18.485,
    lon: 77.386,
    radiusM: 650,
    kind: 'crater_rim',
    note: '900 m impact crater with steep >18° interior walls and boulder ejecta.',
  },
  {
    name: 'Séítah Aeolian Sand Ripples',
    lat: 18.419,
    lon: 77.424,
    radiusM: 950,
    kind: 'sand_dunes',
    note: 'Unconsolidated aeolian bedforms and megaripples posing high rover slip risk.',
  },
  {
    name: 'Western Delta Front Escarpment',
    lat: 18.464,
    lon: 77.392,
    radiusM: 750,
    kind: 'steep_scarp',
    note: 'Steep eroded deltaic cliff transition rising ~90 m above crater floor.',
  },
  {
    name: 'Neretva Vallis Steep Channel Wall',
    lat: 18.458,
    lon: 77.295,
    radiusM: 800,
    kind: 'steep_scarp',
    note: 'Incised valley flanks with loose talus and 14°–22° local gradients.',
  },
  {
    name: 'Jezero Western Crater Rim Slope',
    lat: 18.448,
    lon: 77.262,
    radiusM: 1200,
    kind: 'crater_rim',
    note: 'High-relief Noachian crater wall megabreccia; steep ascent slopes.',
  },
];

export function evaluateTerrainRisk(
  grid: JezeroElevationGrid | null,
  lat: number,
  lon: number,
  slopeWarningDeg = 6,
  slopeDangerDeg = 15
): TerrainSample {
  const elevResult = sampleElevationGrid(grid, lat, lon);
  const { slopeDeg, roughnessM } = sampleSlopeAndRoughness(grid, lat, lon);

  if (
    elevResult.dataQuality === 'insufficient_data' ||
    elevResult.elevationM === null ||
    slopeDeg === null
  ) {
    return {
      lat,
      lon,
      elevationM: null,
      slopeDeg: null,
      roughnessM: null,
      riskLevel: 'insufficient',
      riskScore: 100,
      dataQuality: 'insufficient_data',
      reasons: [
        'Outside high-resolution Jezero terrain analysis grid or flagged as sparse/unverified coverage.',
        'Global MOLA (463 m/px) is insufficient for local rover/EVA hazard clearance.',
      ],
    };
  }

  let score = 0;
  const reasons: string[] = [];

  if (slopeDeg >= slopeDangerDeg) {
    score += 55;
    reasons.push(`Steep estimated slope (${slopeDeg.toFixed(1)}° ≥ ${slopeDangerDeg}° threshold).`);
  } else if (slopeDeg >= slopeWarningDeg) {
    score += 28;
    reasons.push(`Moderate estimated slope (${slopeDeg.toFixed(1)}° between ${slopeWarningDeg}° and ${slopeDangerDeg}°).`);
  } else {
    score += 8;
    reasons.push(`Gentle estimated slope (${slopeDeg.toFixed(1)}° < ${slopeWarningDeg}°).`);
  }

  if (roughnessM !== null) {
    if (roughnessM >= 14) {
      score += 30;
      reasons.push(`High local elevation ruggedness (${roughnessM.toFixed(1)} m TRI).`);
    } else if (roughnessM >= 6) {
      score += 15;
      reasons.push(`Moderate local surface roughness (${roughnessM.toFixed(1)} m TRI).`);
    } else {
      reasons.push(`Low grid-scale ruggedness (${roughnessM.toFixed(1)} m TRI; sub-meter rocks require HiRISE inspection).`);
    }
  }

  for (const zone of JEZERO_HAZARD_ZONES) {
    const dist = marsDistanceMeters(lat, lon, zone.lat, zone.lon);
    if (dist <= zone.radiusM) {
      score += zone.kind === 'crater_rim' || zone.kind === 'steep_scarp' ? 32 : 22;
      reasons.push(`Inside mapped ${zone.name}: ${zone.note}`);
    }
  }

  if (elevResult.dataQuality === 'regional_model') {
    reasons.push(
      'Elevation derived from regional MOLA/DTM model (not directly constrained by Perseverance localization at this point).'
    );
  } else {
    reasons.push('Elevation constrained by nearby NASA Perseverance localization telemetry.');
  }

  let riskLevel: RiskLevel = 'low';
  if (score >= 58) riskLevel = 'high';
  else if (score >= 28) riskLevel = 'moderate';

  return {
    lat,
    lon,
    elevationM: elevResult.elevationM,
    slopeDeg,
    roughnessM,
    riskLevel,
    riskScore: Math.min(100, score),
    dataQuality: elevResult.dataQuality,
    reasons,
  };
}
