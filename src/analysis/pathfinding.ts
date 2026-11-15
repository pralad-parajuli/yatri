import {
  ElevationProfilePoint,
  JezeroElevationGrid,
  MarsCoordinate,
  PlannedRoute,
  RiskLevel,
  RouteHazardSummary,
  RouteMode,
  RouteWeights,
  ScientificPoi,
} from '../types/mars';
import { interpolateGreatCircle, marsDistanceMeters } from '../utils/coordinates';
import { sampleElevationGrid } from './elevation';
import { evaluateTerrainRisk, JEZERO_HAZARD_ZONES } from './riskScore';
import { computeCellSlopeAndRoughness, sampleSlopeAndRoughness } from './slope';

let routeSequenceCounter = 0;

export function getPresetWeights(mode: RouteMode): RouteWeights {
  switch (mode) {
    case 'shortest':
      return {
        distanceWeight: 1.0,
        slopeWeight: 0.02,
        roughnessWeight: 0.02,
        hazardWeight: 0.05,
        scienceRewardWeight: 0.0,
      };
    case 'low_difficulty':
      return {
        distanceWeight: 0.65,
        slopeWeight: 1.0,
        roughnessWeight: 0.9,
        hazardWeight: 0.85,
        scienceRewardWeight: 0.0,
      };
    case 'avoid_slopes':
      return {
        distanceWeight: 0.4,
        slopeWeight: 3.6,
        roughnessWeight: 0.4,
        hazardWeight: 0.35,
        scienceRewardWeight: 0.0,
      };
    case 'avoid_hazards':
      return {
        distanceWeight: 0.4,
        slopeWeight: 0.45,
        roughnessWeight: 0.8,
        hazardWeight: 4.0,
        scienceRewardWeight: 0.0,
      };
    case 'visit_science':
      return {
        distanceWeight: 0.5,
        slopeWeight: 1.0,
        roughnessWeight: 0.7,
        hazardWeight: 1.0,
        scienceRewardWeight: 2.2,
      };
  }
}

interface TerrainCostField {
  rows: number;
  cols: number;
  elev: Float64Array;
  slopeDeg: Float32Array;
  roughnessM: Float32Array;
  hazardRisk: Float32Array;
  insufficient: Uint8Array;
  latLookup: Float64Array;
  lonLookup: Float64Array;
}

function latLonToCell(grid: JezeroElevationGrid, lat: number, lon: number): { r: number; c: number } {
  const c = Math.max(0, Math.min(grid.cols - 1, Math.round((lon - grid.bounds.minLon) / grid.dLon)));
  const r = Math.max(0, Math.min(grid.rows - 1, Math.round((lat - grid.bounds.minLat) / grid.dLat)));
  return { r, c };
}

function cellToLatLon(grid: JezeroElevationGrid, r: number, c: number): { lat: number; lon: number } {
  return {
    lat: grid.bounds.minLat + r * grid.dLat,
    lon: grid.bounds.minLon + c * grid.dLon,
  };
}

function computeHazardIntensityAt(lat: number, lon: number): number {
  let hazard = 0;
  for (const hz of JEZERO_HAZARD_ZONES) {
    const d = marsDistanceMeters(lat, lon, hz.lat, hz.lon);
    const kindWeight = hz.kind === 'crater_rim' || hz.kind === 'steep_scarp' ? 1.4 : 1.15;
    if (d <= hz.radiusM) {
      // Strong core intensity inside mapped hazard perimeter
      hazard += kindWeight * (1.1 + 2.1 * (1 - d / hz.radiusM));
    } else if (d <= hz.radiusM * 1.38) {
      // Clearance buffer halo so hazard-avoidance routes maintain safety margin
      const haloFrac = 1 - (d - hz.radiusM) / (hz.radiusM * 0.38);
      hazard += kindWeight * 0.65 * haloFrac * haloFrac;
    }
  }
  return hazard;
}

function buildTerrainCostField(grid: JezeroElevationGrid): TerrainCostField {
  const total = grid.rows * grid.cols;
  const elev = new Float64Array(total);
  const slopeDeg = new Float32Array(total);
  const roughnessM = new Float32Array(total);
  const hazardRisk = new Float32Array(total);
  const insufficient = new Uint8Array(total);
  const latLookup = new Float64Array(grid.rows);
  const lonLookup = new Float64Array(grid.cols);

  for (let r = 0; r < grid.rows; r++) latLookup[r] = grid.bounds.minLat + r * grid.dLat;
  for (let c = 0; c < grid.cols; c++) lonLookup[c] = grid.bounds.minLon + c * grid.dLon;

  for (let r = 0; r < grid.rows; r++) {
    const lat = latLookup[r];
    for (let c = 0; c < grid.cols; c++) {
      const idx = r * grid.cols + c;
      const e = grid.elevations[idx];
      const q = grid.quality[idx];
      if (e === null || q === 0) {
        insufficient[idx] = 1;
        elev[idx] = -2500;
        slopeDeg[idx] = 0;
        roughnessM[idx] = 0;
        hazardRisk[idx] = computeHazardIntensityAt(lat, lonLookup[c]);
        continue;
      }
      elev[idx] = e;
      const sr = computeCellSlopeAndRoughness(grid, r, c);
      slopeDeg[idx] = sr.slopeDeg ?? 0;
      roughnessM[idx] = sr.roughnessM ?? 0;
      hazardRisk[idx] = computeHazardIntensityAt(lat, lonLookup[c]);
    }
  }

  return {
    rows: grid.rows,
    cols: grid.cols,
    elev,
    slopeDeg,
    roughnessM,
    hazardRisk,
    insufficient,
    latLookup,
    lonLookup,
  };
}

/**
 * Computes strictly non-negative edge cost multiplier between two adjacent surface states.
 * Combines directional segment grade, local DEM slope, uphill climb work, TRI roughness,
 * hazard zone core + buffer halo, and unknown-DEM barrier penalty.
 */
function computeSegmentMultiplier(params: {
  elevA: number | null;
  elevB: number | null;
  slopeA: number;
  slopeB: number;
  roughA: number;
  roughB: number;
  hazardA: number;
  hazardB: number;
  insufficient: boolean;
  stepDistM: number;
  weights: RouteWeights;
}): { multiplier: number; effSlope: number; maxHazard: number } {
  const {
    elevA,
    elevB,
    slopeA,
    slopeB,
    roughA,
    roughB,
    hazardA,
    hazardB,
    insufficient,
    stepDistM,
    weights,
  } = params;

  const baseDistWeight = Math.max(0.1, weights.distanceWeight);
  if (insufficient || elevA === null || elevB === null) {
    return {
      multiplier: baseDistWeight + 55.0,
      effSlope: Math.max(slopeA, slopeB),
      maxHazard: Math.max(hazardA, hazardB),
    };
  }

  const dElev = elevB - elevA;
  const distSafe = Math.max(1, stepDistM);
  const edgeSlopeDeg = (Math.atan(Math.abs(dElev) / distSafe) * 180) / Math.PI;
  const uphillRatio = Math.max(0, dElev) / distSafe;
  const cellAvgSlope = (slopeA + slopeB) * 0.5;
  const effSlope = Math.max(edgeSlopeDeg, cellAvgSlope);

  // Nonlinear slope penalty calibrated to Jezero rover / astronaut EVA slope tolerances
  let slopePenalty =
    Math.pow(effSlope / 4.2, 2.2) * weights.slopeWeight * 0.65 +
    uphillRatio * 7.5 * weights.slopeWeight;
  if (effSlope > 7) {
    slopePenalty += Math.pow((effSlope - 7) / 3.0, 2) * weights.slopeWeight * 1.6;
  }
  if (effSlope > 12) {
    slopePenalty += 10.0 * weights.slopeWeight;
  }

  const roughAvg = (roughA + roughB) * 0.5;
  const roughPenalty = Math.pow(roughAvg / 5.5, 1.35) * weights.roughnessWeight * 0.8;

  const hazardAvg = (hazardA + hazardB) * 0.5;
  const maxHazard = Math.max(hazardA, hazardB);
  let hazardPenalty = hazardAvg * weights.hazardWeight * 2.6;
  // Strong interior deterrence so hazard-avoidance routes detour around hazard cores
  if (maxHazard >= 1.1) {
    hazardPenalty += 14.0 * weights.hazardWeight;
  }

  return {
    multiplier: baseDistWeight + slopePenalty + roughPenalty + hazardPenalty,
    effSlope,
    maxHazard,
  };
}

class MinHeap {
  private items: Array<{ idx: number; f: number }> = [];
  push(node: { idx: number; f: number }) {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }
  pop(): { idx: number; f: number } | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
  private bubbleUp(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].f <= this.items[i].f) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }
  private sinkDown(i: number) {
    const n = this.items.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.items[l].f < this.items[smallest].f) smallest = l;
      if (r < n && this.items[r].f < this.items[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
      i = smallest;
    }
  }
}

// 16-neighbor offsets (cardinal + diagonal + knight moves) with midpoint check metadata
const NEIGHBORS_16: Array<{ dr: number; dc: number; isKnight: boolean; midDr: number; midDc: number }> = [
  { dr: -1, dc: 0, isKnight: false, midDr: 0, midDc: 0 },
  { dr: 1, dc: 0, isKnight: false, midDr: 0, midDc: 0 },
  { dr: 0, dc: -1, isKnight: false, midDr: 0, midDc: 0 },
  { dr: 0, dc: 1, isKnight: false, midDr: 0, midDc: 0 },
  { dr: -1, dc: -1, isKnight: false, midDr: 0, midDc: 0 },
  { dr: -1, dc: 1, isKnight: false, midDr: 0, midDc: 0 },
  { dr: 1, dc: -1, isKnight: false, midDr: 0, midDc: 0 },
  { dr: 1, dc: 1, isKnight: false, midDr: 0, midDc: 0 },
  // Knight moves reduce angular octile distortion while checking midpoint terrain
  { dr: -2, dc: -1, isKnight: true, midDr: -1, midDc: 0 },
  { dr: -2, dc: 1, isKnight: true, midDr: -1, midDc: 0 },
  { dr: 2, dc: -1, isKnight: true, midDr: 1, midDc: 0 },
  { dr: 2, dc: 1, isKnight: true, midDr: 1, midDc: 0 },
  { dr: -1, dc: -2, isKnight: true, midDr: 0, midDc: -1 },
  { dr: 1, dc: -2, isKnight: true, midDr: 0, midDc: -1 },
  { dr: -1, dc: 2, isKnight: true, midDr: 0, midDc: 1 },
  { dr: 1, dc: 2, isKnight: true, midDr: 0, midDc: 1 },
];

/**
 * Evaluates terrain cost, peak slope, and hazard along an arbitrary geodesic chord P0 -> P1
 * by micro-sampling every ~65 m along the segment. Used for cost-verified path smoothing.
 */
function evaluateChordCost(
  grid: JezeroElevationGrid,
  p0: [number, number],
  p1: [number, number],
  weights: RouteWeights
): {
  cost: number;
  maxSlope: number;
  maxHazard: number;
  hasGap: boolean;
} {
  const totalDistM = marsDistanceMeters(p0[1], p0[0], p1[1], p1[0]);
  if (totalDistM < 1) {
    return { cost: 0, maxSlope: 0, maxHazard: 0, hasGap: false };
  }
  const steps = Math.max(2, Math.ceil(totalDistM / 65));
  let cost = 0;
  let maxSlope = 0;
  let maxHazard = 0;
  let hasGap = false;

  let prevLat = p0[1];
  let prevLon = p0[0];
  let prevE = sampleElevationGrid(grid, prevLat, prevLon);
  let prevSR = sampleSlopeAndRoughness(grid, prevLat, prevLon);
  let prevHz = computeHazardIntensityAt(prevLat, prevLon);

  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const lon = p0[0] + (p1[0] - p0[0]) * t;
    const lat = p0[1] + (p1[1] - p0[1]) * t;
    const segDist = marsDistanceMeters(prevLat, prevLon, lat, lon);

    const curE = sampleElevationGrid(grid, lat, lon);
    const curSR = sampleSlopeAndRoughness(grid, lat, lon);
    const curHz = computeHazardIntensityAt(lat, lon);
    const segInsufficient =
      prevE.dataQuality === 'insufficient_data' ||
      curE.dataQuality === 'insufficient_data' ||
      prevE.elevationM === null ||
      curE.elevationM === null;

    if (segInsufficient) hasGap = true;

    const seg = computeSegmentMultiplier({
      elevA: prevE.elevationM,
      elevB: curE.elevationM,
      slopeA: prevSR.slopeDeg ?? 0,
      slopeB: curSR.slopeDeg ?? 0,
      roughA: prevSR.roughnessM ?? 0,
      roughB: curSR.roughnessM ?? 0,
      hazardA: prevHz,
      hazardB: curHz,
      insufficient: segInsufficient,
      stepDistM: segDist,
      weights,
    });

    cost += segDist * seg.multiplier;
    if (seg.effSlope > maxSlope) maxSlope = seg.effSlope;
    if (seg.maxHazard > maxHazard) maxHazard = seg.maxHazard;

    prevLat = lat;
    prevLon = lon;
    prevE = curE;
    prevSR = curSR;
    prevHz = curHz;
  }

  return { cost, maxSlope, maxHazard, hasGap };
}

/**
 * Cost-verified greedy string-pulling smoothing.
 * Straightens artificial grid zig-zags while strictly preserving terrain/hazard/slope avoidance.
 */
function smoothPathCostVerified(
  grid: JezeroElevationGrid,
  rawCoords: [number, number][],
  weights: RouteWeights
): [number, number][] {
  if (rawCoords.length <= 2) return rawCoords;

  // Precompute prefix cost, max slope, and max hazard along the discrete A* chain
  const n = rawCoords.length;
  const edgeCost = new Float64Array(n - 1);
  const edgeMaxSlope = new Float64Array(n - 1);
  const edgeMaxHazard = new Float64Array(n - 1);
  const edgeHasGap = new Uint8Array(n - 1);

  for (let i = 0; i < n - 1; i++) {
    const res = evaluateChordCost(grid, rawCoords[i], rawCoords[i + 1], weights);
    edgeCost[i] = res.cost;
    edgeMaxSlope[i] = res.maxSlope;
    edgeMaxHazard[i] = res.maxHazard;
    edgeHasGap[i] = res.hasGap ? 1 : 0;
  }

  const smoothed: [number, number][] = [rawCoords[0]];
  let i = 0;

  while (i < n - 1) {
    let bestJ = i + 1;
    const maxLookahead = Math.min(n - 1, i + 26);

    for (let j = maxLookahead; j >= i + 2; j--) {
      let subCost = 0;
      let subMaxSlope = 0;
      let subMaxHazard = 0;
      let subHasGap = false;
      for (let k = i; k < j; k++) {
        subCost += edgeCost[k];
        if (edgeMaxSlope[k] > subMaxSlope) subMaxSlope = edgeMaxSlope[k];
        if (edgeMaxHazard[k] > subMaxHazard) subMaxHazard = edgeMaxHazard[k];
        if (edgeHasGap[k]) subHasGap = true;
      }

      const chord = evaluateChordCost(grid, rawCoords[i], rawCoords[j], weights);
      const allowsGap = subHasGap || !chord.hasGap;
      const slopeTol = weights.slopeWeight >= 1.5 ? 0.4 : 0.8;
      const hazardTol = weights.hazardWeight >= 1.5 ? 0.03 : 0.06;
      const slopePreserved = chord.maxSlope <= subMaxSlope + slopeTol;
      const hazardPreserved = chord.maxHazard <= subMaxHazard + hazardTol;
      const costImproved = chord.cost <= subCost * 1.003;

      if (allowsGap && slopePreserved && hazardPreserved && costImproved) {
        bestJ = j;
        break;
      }
    }

    smoothed.push(rawCoords[bestJ]);
    i = bestJ;
  }

  return smoothed;
}

/**
 * Solves a single terrain-aware A* leg between two coordinates using a strictly admissible heuristic.
 */
function solveSingleLegAStar(
  grid: JezeroElevationGrid,
  field: TerrainCostField,
  start: MarsCoordinate,
  goal: MarsCoordinate,
  weights: RouteWeights
): [number, number][] {
  const totalCells = grid.rows * grid.cols;
  const startCell = latLonToCell(grid, start.lat, start.lon);
  const goalCell = latLonToCell(grid, goal.lat, goal.lon);
  const startIdx = startCell.r * grid.cols + startCell.c;
  const goalIdx = goalCell.r * grid.cols + goalCell.c;

  const minBaseMultiplier = Math.max(0.1, weights.distanceWeight);
  const goalPos = cellToLatLon(grid, goalCell.r, goalCell.c);

  const gScore = new Float64Array(totalCells).fill(Infinity);
  const cameFrom = new Int32Array(totalCells).fill(-1);
  const closed = new Uint8Array(totalCells);
  const heap = new MinHeap();

  gScore[startIdx] = 0;
  const h0 =
    marsDistanceMeters(field.latLookup[startCell.r], field.lonLookup[startCell.c], goalPos.lat, goalPos.lon) *
    minBaseMultiplier;
  heap.push({ idx: startIdx, f: h0 });

  while (heap.size > 0) {
    const curr = heap.pop()!;
    if (curr.idx === goalIdx) break;
    if (closed[curr.idx]) continue;
    closed[curr.idx] = 1;

    const r = Math.floor(curr.idx / grid.cols);
    const c = curr.idx % grid.cols;
    const latA = field.latLookup[r];
    const lonA = field.lonLookup[c];

    for (const nb of NEIGHBORS_16) {
      const nr = r + nb.dr;
      const nc = c + nb.dc;
      if (nr < 0 || nr >= grid.rows || nc < 0 || nc >= grid.cols) continue;
      const nIdx = nr * grid.cols + nc;
      if (closed[nIdx]) continue;

      const latB = field.latLookup[nr];
      const lonB = field.lonLookup[nc];
      const stepDistM = marsDistanceMeters(latA, lonA, latB, lonB);

      let edgeInsufficient = Boolean(field.insufficient[curr.idx] || field.insufficient[nIdx]);
      let effSlopeA = field.slopeDeg[curr.idx];
      let effHazardA = field.hazardRisk[curr.idx];

      if (nb.isKnight) {
        const mr = r + nb.midDr;
        const mc = c + nb.midDc;
        const mIdx = mr * grid.cols + mc;
        if (field.insufficient[mIdx]) edgeInsufficient = true;
        effSlopeA = Math.max(effSlopeA, field.slopeDeg[mIdx]);
        effHazardA = Math.max(effHazardA, field.hazardRisk[mIdx]);
      }

      const seg = computeSegmentMultiplier({
        elevA: field.elev[curr.idx],
        elevB: field.elev[nIdx],
        slopeA: effSlopeA,
        slopeB: field.slopeDeg[nIdx],
        roughA: field.roughnessM[curr.idx],
        roughB: field.roughnessM[nIdx],
        hazardA: effHazardA,
        hazardB: field.hazardRisk[nIdx],
        insufficient: edgeInsufficient,
        stepDistM,
        weights,
      });

      const tentativeG = gScore[curr.idx] + stepDistM * seg.multiplier;
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = curr.idx;
        gScore[nIdx] = tentativeG;
        const h = marsDistanceMeters(latB, lonB, goalPos.lat, goalPos.lon) * minBaseMultiplier;
        heap.push({ idx: nIdx, f: tentativeG + h });
      }
    }
  }

  const rawCoords: [number, number][] = [];
  if (cameFrom[goalIdx] !== -1 || startIdx === goalIdx) {
    const rev: [number, number][] = [];
    let trace = goalIdx;
    while (trace !== -1) {
      const rr = Math.floor(trace / grid.cols);
      const cc = trace % grid.cols;
      rev.push([Number(field.lonLookup[cc].toFixed(6)), Number(field.latLookup[rr].toFixed(6))]);
      if (trace === startIdx) break;
      trace = cameFrom[trace];
    }
    rev.reverse();
    rawCoords.push(...rev);
  }

  const anchored: [number, number][] =
    rawCoords.length >= 2
      ? [[start.lon, start.lat], ...rawCoords.slice(1, -1), [goal.lon, goal.lat]]
      : [
          [start.lon, start.lat],
          [goal.lon, goal.lat],
        ];

  return smoothPathCostVerified(grid, anchored, weights);
}

function bestTspChainLength(
  start: MarsCoordinate,
  stops: ScientificPoi[],
  destination: MarsCoordinate
): { order: ScientificPoi[]; lengthM: number } {
  if (stops.length === 0) {
    return { order: [], lengthM: marsDistanceMeters(start.lat, start.lon, destination.lat, destination.lon) };
  }
  if (stops.length === 1) {
    return {
      order: stops,
      lengthM:
        marsDistanceMeters(start.lat, start.lon, stops[0].lat, stops[0].lon) +
        marsDistanceMeters(stops[0].lat, stops[0].lon, destination.lat, destination.lon),
    };
  }
  const perms: ScientificPoi[][] = [];
  if (stops.length === 2) {
    perms.push([stops[0], stops[1]], [stops[1], stops[0]]);
  } else {
    const [a, b, c] = stops;
    perms.push([a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]);
  }
  let bestOrder = perms[0];
  let bestLen = Infinity;
  for (const order of perms) {
    let total = marsDistanceMeters(start.lat, start.lon, order[0].lat, order[0].lon);
    for (let i = 0; i < order.length - 1; i++) {
      total += marsDistanceMeters(order[i].lat, order[i].lon, order[i + 1].lat, order[i + 1].lon);
    }
    total += marsDistanceMeters(
      order[order.length - 1].lat,
      order[order.length - 1].lon,
      destination.lat,
      destination.lon
    );
    if (total < bestLen) {
      bestLen = total;
      bestOrder = order;
    }
  }
  return { order: bestOrder, lengthM: bestLen };
}

/**
 * Selects high-value Scientific POIs inside the corridor between start & destination,
 * determines optimal visiting permutation within detour budget, and chains terrain-aware A* legs.
 */
function selectScienceCorridorStops(
  grid: JezeroElevationGrid,
  start: MarsCoordinate,
  destination: MarsCoordinate,
  pois: ScientificPoi[],
  scienceRewardWeight: number
): MarsCoordinate[] {
  const directDistM = marsDistanceMeters(start.lat, start.lon, destination.lat, destination.lon);
  if (directDistM < 300 || scienceRewardWeight <= 0) return [];

  const maxStops = directDistM >= 9500 ? 3 : 2;
  const maxSingleDetourM = Math.max(2200, directDistM * 0.55);
  const maxTotalDetourBudgetM = Math.max(2600, directDistM * 0.58);

  const scored = pois
    .filter((poi) => {
      if (
        poi.lon < grid.bounds.minLon ||
        poi.lon > grid.bounds.maxLon ||
        poi.lat < grid.bounds.minLat ||
        poi.lat > grid.bounds.maxLat
      ) {
        return false;
      }
      const dStart = marsDistanceMeters(start.lat, start.lon, poi.lat, poi.lon);
      const dDest = marsDistanceMeters(poi.lat, poi.lon, destination.lat, destination.lon);
      return dStart > 250 && dDest > 250;
    })
    .map((poi) => {
      const dStart = marsDistanceMeters(start.lat, start.lon, poi.lat, poi.lon);
      const dDest = marsDistanceMeters(poi.lat, poi.lon, destination.lat, destination.lon);
      const detourM = Math.max(0, dStart + dDest - directDistM);
      const risk = evaluateTerrainRisk(grid, poi.lat, poi.lon);
      const riskFactor = risk.riskLevel === 'high' ? 0.65 : risk.riskLevel === 'insufficient' ? 0.25 : 1.0;
      const utility =
        (Math.pow(poi.scienceValue, 1.4) * scienceRewardWeight * riskFactor) /
        (1 + detourM / 900);
      return { poi, detourM, utility };
    })
    .filter((c) => c.detourM <= maxSingleDetourM)
    .sort((a, b) => b.utility - a.utility);

  // Incrementally build stop set while respecting cumulative TSP detour budget
  let chosen: ScientificPoi[] = [];
  for (const cand of scored) {
    if (chosen.length >= maxStops) break;
    const tooClose = chosen.some(
      (existing) => marsDistanceMeters(existing.lat, existing.lon, cand.poi.lat, cand.poi.lon) < 700
    );
    if (tooClose) continue;
    const trial = [...chosen, cand.poi];
    const { order, lengthM } = bestTspChainLength(start, trial, destination);
    if (chosen.length === 0 || lengthM - directDistM <= maxTotalDetourBudgetM) {
      chosen = order;
    }
  }

  return chosen.map((p) => ({ lat: p.lat, lon: p.lon, label: p.name }));
}

/**
 * Resamples waypoint polyline along spherical great-circle segments with bounded sample count
 * so both local Jezero traverses (~80 m step) and planetary traverses stay fast and accurate.
 */
function resamplePolylineUniformly(waypoints: [number, number][], baseStepM = 80): [number, number][] {
  if (waypoints.length <= 1) return waypoints;
  let totalApproxM = 0;
  for (let i = 1; i < waypoints.length; i++) {
    totalApproxM += marsDistanceMeters(
      waypoints[i - 1][1],
      waypoints[i - 1][0],
      waypoints[i][1],
      waypoints[i][0]
    );
  }
  const effectiveStepM = Math.max(baseStepM, totalApproxM / 180);

  const dense: [number, number][] = [waypoints[0]];
  for (let i = 1; i < waypoints.length; i++) {
    const [lon0, lat0] = waypoints[i - 1];
    const [lon1, lat1] = waypoints[i];
    const segLen = marsDistanceMeters(lat0, lon0, lat1, lon1);
    const subdivisions = Math.max(1, Math.min(140, Math.ceil(segLen / effectiveStepM)));
    const arc = interpolateGreatCircle(lat0, lon0, lat1, lon1, subdivisions);
    dense.push(...arc.slice(1));
  }
  return dense;
}

export function planTerrainAwareRoute(params: {
  grid: JezeroElevationGrid;
  start: MarsCoordinate;
  destination: MarsCoordinate;
  mode: RouteMode;
  weights: RouteWeights;
  pois: ScientificPoi[];
  routeName?: string;
  color?: string;
}): PlannedRoute {
  const { grid, start, destination, mode, weights, pois } = params;

  const outOfGrid =
    start.lon < grid.bounds.minLon ||
    start.lon > grid.bounds.maxLon ||
    start.lat < grid.bounds.minLat ||
    start.lat > grid.bounds.maxLat ||
    destination.lon < grid.bounds.minLon ||
    destination.lon > grid.bounds.maxLon ||
    destination.lat < grid.bounds.minLat ||
    destination.lat > grid.bounds.maxLat;

  let waypoints: [number, number][];

  if (outOfGrid) {
    // True spherical great-circle geodesic traverse across Mars without clamping into Jezero DEM
    const directDistM = marsDistanceMeters(start.lat, start.lon, destination.lat, destination.lon);
    const segCount = Math.max(16, Math.min(120, Math.ceil(directDistM / 30000)));
    waypoints = interpolateGreatCircle(start.lat, start.lon, destination.lat, destination.lon, segCount);
  } else {
    const field = buildTerrainCostField(grid);

    // Determine intermediate scientific targets if operating in science-weighted traverse mode
    const useScienceWaypoints = mode === 'visit_science' || weights.scienceRewardWeight >= 1.2;
    const scienceStops = useScienceWaypoints
      ? selectScienceCorridorStops(grid, start, destination, pois, weights.scienceRewardWeight)
      : [];

    const legEndpoints: MarsCoordinate[] = [start, ...scienceStops, destination];
    const legWeights: RouteWeights = { ...weights, scienceRewardWeight: 0 };

    const combinedWaypoints: [number, number][] = [];
    for (let i = 0; i < legEndpoints.length - 1; i++) {
      const legCoords = solveSingleLegAStar(grid, field, legEndpoints[i], legEndpoints[i + 1], legWeights);
      if (i === 0) {
        combinedWaypoints.push(...legCoords);
      } else {
        combinedWaypoints.push(...legCoords.slice(1));
      }
    }

    waypoints =
      combinedWaypoints.length >= 2
        ? combinedWaypoints
        : [
            [start.lon, start.lat],
            [destination.lon, destination.lat],
          ];
  }

  // Dense uniform resampling (~80 m inside Jezero, capped <=180 samples globally)
  const denseSamples = resamplePolylineUniformly(waypoints, 80);

  const profile: ElevationProfilePoint[] = [];
  let cumDistM = 0;
  let minElev: number | null = null;
  let maxElev: number | null = null;
  let totalAscentM = 0;
  let totalDescentM = 0;
  let maxSlopeDeg = 0;
  let slopeSum = 0;
  let slopeSamples = 0;
  let steepSectionsCount = 0;
  let hasDataGap = outOfGrid;
  const hazards: RouteHazardSummary[] = [];
  const seenHazardKeys = new Set<string>();

  for (let i = 0; i < denseSamples.length; i++) {
    const [lon, lat] = denseSamples[i];
    let stepDist = 0;
    if (i > 0) {
      const [pLon, pLat] = denseSamples[i - 1];
      stepDist = marsDistanceMeters(pLat, pLon, lat, lon);
      cumDistM += stepDist;
    }

    const elevQuery = sampleElevationGrid(grid, lat, lon);
    const terrain = evaluateTerrainRisk(grid, lat, lon);
    const distKm = Number((cumDistM / 1000).toFixed(3));

    let segDirSlopeDeg: number | null = null;

    if (elevQuery.dataQuality === 'insufficient_data' || elevQuery.elevationM === null) {
      hasDataGap = true;
      const key = `gap-${Math.round(distKm * 2)}`;
      if (!seenHazardKeys.has(key)) {
        seenHazardKeys.add(key);
        hazards.push({
          id: `hz-${hazards.length}`,
          type: 'Insufficient Data Gap',
          lat,
          lon,
          distanceKm: distKm,
          severity: 'unknown',
          detail: 'High-resolution DEM coverage unavailable; terrain safety cannot be verified.',
        });
      }
    } else {
      const e = elevQuery.elevationM;
      if (minElev === null || e < minElev) minElev = e;
      if (maxElev === null || e > maxElev) maxElev = e;
      if (profile.length > 0) {
        const prevE = profile[profile.length - 1].elevationM;
        if (prevE !== null) {
          const diff = e - prevE;
          if (diff > 0) totalAscentM += diff;
          else totalDescentM += Math.abs(diff);
          if (stepDist >= 15) {
            segDirSlopeDeg = Number(
              ((Math.atan(Math.abs(diff) / stepDist) * 180) / Math.PI).toFixed(2)
            );
          }
        }
      }
    }

    const pointSlope =
      terrain.slopeDeg !== null && segDirSlopeDeg !== null
        ? Number(Math.max(terrain.slopeDeg, segDirSlopeDeg).toFixed(2))
        : terrain.slopeDeg ?? segDirSlopeDeg;

    if (pointSlope !== null) {
      maxSlopeDeg = Math.max(maxSlopeDeg, pointSlope);
      slopeSum += pointSlope;
      slopeSamples++;
      if (pointSlope >= 12) {
        steepSectionsCount++;
        const key = `slope-${Math.round(distKm * 3)}`;
        if (!seenHazardKeys.has(key)) {
          seenHazardKeys.add(key);
          hazards.push({
            id: `hz-${hazards.length}`,
            type: 'Steep Slope (>15°)',
            lat,
            lon,
            distanceKm: distKm,
            severity: pointSlope >= 15 ? 'high' : 'moderate',
            detail: `Estimated ${pointSlope.toFixed(1)}° gradient along traverse segment.`,
          });
        }
      }
    }

    for (const zone of JEZERO_HAZARD_ZONES) {
      const dZone = marsDistanceMeters(lat, lon, zone.lat, zone.lon);
      if (dZone <= zone.radiusM) {
        const key = `zone-${zone.name}`;
        if (!seenHazardKeys.has(key)) {
          seenHazardKeys.add(key);
          hazards.push({
            id: `hz-${hazards.length}`,
            type:
              zone.kind === 'crater_rim' || zone.kind === 'steep_scarp'
                ? 'Crater Rim / Scarp'
                : 'High Roughness / Rubble',
            lat,
            lon,
            distanceKm: distKm,
            severity: zone.kind === 'crater_rim' || zone.kind === 'steep_scarp' ? 'high' : 'moderate',
            detail: `${zone.name}: ${zone.note}`,
          });
        }
      }
    }

    profile.push({
      distanceKm: distKm,
      lat,
      lon,
      elevationM: elevQuery.elevationM,
      slopeDeg: pointSlope,
      roughnessM: terrain.roughnessM,
      riskLevel: terrain.riskLevel,
      dataQuality: elevQuery.dataQuality,
    });
  }

  // Scientific POIs within 1.5 km of densely sampled route
  const nearbyPois = pois
    .map((poi) => {
      let minD = Infinity;
      for (const [lon, lat] of denseSamples) {
        const d = marsDistanceMeters(lat, lon, poi.lat, poi.lon) / 1000;
        if (d < minD) minD = d;
      }
      return { ...poi, distanceToRouteKm: Number(minD.toFixed(2)) };
    })
    .filter((p) => p.distanceToRouteKm <= 1.5)
    .sort((a, b) => a.distanceToRouteKm - b.distanceToRouteKm);

  let overallDifficulty: RiskLevel = 'low';
  if (hasDataGap) {
    overallDifficulty = maxSlopeDeg >= 15 ? 'high' : 'insufficient';
  } else if (maxSlopeDeg >= 15 || hazards.some((h) => h.severity === 'high')) {
    overallDifficulty = 'high';
  } else if (maxSlopeDeg >= 7 || hazards.length > 0) {
    overallDifficulty = 'moderate';
  }

  const modeLabels: Record<RouteMode, string> = {
    shortest: 'Shortest Distance',
    low_difficulty: 'Lower Terrain Difficulty',
    avoid_slopes: 'Avoid Steep Slopes',
    avoid_hazards: 'Avoid Known Hazards',
    visit_science: 'Science-Weighted Traverse',
  };

  routeSequenceCounter += 1;

  return {
    id: `route-${mode}-${Date.now()}-${routeSequenceCounter}`,
    name:
      params.routeName ||
      (outOfGrid ? `${modeLabels[mode]} (Mars Geodesic)` : `${modeLabels[mode]} Route`),
    mode,
    start,
    destination,
    waypoints,
    profile,
    totalDistanceKm: Number((cumDistM / 1000).toFixed(2)),
    minElevationM: minElev !== null ? Number(minElev.toFixed(1)) : null,
    maxElevationM: maxElev !== null ? Number(maxElev.toFixed(1)) : null,
    totalAscentM: Number(totalAscentM.toFixed(1)),
    totalDescentM: Number(totalDescentM.toFixed(1)),
    maxSlopeDeg: Number(maxSlopeDeg.toFixed(1)),
    avgSlopeDeg: slopeSamples > 0 ? Number((slopeSum / slopeSamples).toFixed(1)) : 0,
    steepSectionsCount,
    overallDifficulty,
    isProvisional: hasDataGap,
    provisionalReason: hasDataGap
      ? outOfGrid
        ? 'Endpoints extend beyond the ~115 m Jezero Crater DEM. Plotted along shortest Mars 2000 spherical great-circle geodesic; local slopes/hazards outside Jezero require regional HiRISE validation.'
        : 'Route crosses an unverified margin inside Jezero DEM coverage; missing terrain data is never assumed safe.'
      : undefined,
    hazards,
    nearbyPois,
    computedAt: new Date().toISOString(),
    color: params.color || '#f97316',
  };
}
