export type CoordinateFormat = 'decimal' | 'dms';
export type LongitudeConvention = 'signed' | 'east360';

export interface MarsCoordinate {
  lat: number; // Planetocentric latitude (-90 to 90)
  lon: number; // East longitude (-180 to 180)
  label?: string;
}

export type LayerCategory =
  | 'basemap'
  | 'topography'
  | 'imagery'
  | 'thermal'
  | 'mineralogy'
  | 'geology'
  | 'atmosphere'
  | 'analysis';

export interface MarsLayerConfig {
  id: string;
  name: string;
  shortName: string;
  category: LayerCategory;
  kind: 'trek_wmts' | 'usgs_wms' | 'vector_mineral' | 'terrain_hazard';
  trekLayerId?: string;
  trekFormat?: 'jpg' | 'png';
  usgsLayers?: string;
  maxZoom: number;
  bounds?: [number, number, number, number]; // [west, south, east, north]
  description: string;
  source: string;
  instrument: string;
  observationDate: string;
  coverage: string;
  resolution: string;
  license: string;
  defaultEnabled: boolean;
  defaultOpacity: number;
  legend?: Array<{ color: string; label: string }>;
}

export type LayerLoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export interface LayerRuntimeState {
  enabled: boolean;
  opacity: number;
  status: LayerLoadStatus;
  errorMessage?: string;
}

export interface MarsLocation {
  id: string;
  name: string;
  region: string;
  category: 'landing_site' | 'crater' | 'volcano' | 'canyon' | 'delta' | 'geology' | 'rover_target';
  lat: number;
  lon: number;
  elevationM?: number;
  summary: string;
  source: string;
}

export interface RoverWaypoint {
  index: number;
  rmc: string;
  sol: number;
  site: number;
  drive: number;
  lon: number;
  lat: number;
  elevGeoidM: number | null;
  distTotalM: number;
  tiltDeg: number | null;
  note: string | null;
  images: Array<{ name: string; url: string }>;
}

export interface MissionTelemetry {
  missionId: string;
  source: string;
  datasetName: string;
  fetchedAt: string;
  waypointCount: number;
  totalDistanceKm: number;
  maxSol: number;
  waypoints: RoverWaypoint[];
  pathSegments: number[][][];
}

export type MissionType = 'Rover' | 'Lander' | 'Helicopter' | 'Orbiter';

export type MarsMissionId =
  | 'perseverance'
  | 'ingenuity'
  | 'curiosity'
  | 'zhurong'
  | 'insight'
  | 'phoenix'
  | 'opportunity'
  | 'spirit'
  | 'pathfinder'
  | 'viking1'
  | 'viking2'
  | 'mro'
  | 'mgs'
  | 'odyssey';

export interface MarsMission {
  id: MarsMissionId;
  name: string;
  agency: string;
  missionType: MissionType;
  status: 'Active Historical Archive' | 'Mission Concluded (Historical)' | 'Active Orbital Science';
  landingSite: string;
  lat: number;
  lon: number;
  orbitAltitudeM?: number;
  landingDate: string;
  endDate?: string;
  totalTraverseKm: number;
  color: string;
  description: string;
  hasLiveMmgisFeed: boolean;
  modelKey?: string;
  modelSourceName?: string;
  staticTraverse?: number[][]; // [lon, lat] for concluded historical missions or flight paths
  sampleCaches?: Array<{
    name: string;
    sol: number;
    lat: number;
    lon: number;
    rockType: string;
    note: string;
  }>;
  timeline: Array<{ date: string; sol: string; event: string }>;
  nasaRecordUrl: string;
  sourceAttribution: string;
}

export type GeologicalCategory =
  | 'river_channel'
  | 'delta_deposit'
  | 'sedimentary'
  | 'crater'
  | 'volcanic'
  | 'clay_bearing'
  | 'hydrated_mineral'
  | 'olivine'
  | 'pyroxene';

export interface GeologicalFeature {
  id: string;
  name: string;
  category: GeologicalCategory;
  lat: number;
  lon: number;
  radiusKm: number;
  polygon?: [number, number][]; // [lon, lat]
  description: string;
  scientificSignificance: string;
  supportingObservation: string;
  evidenceStatus: 'Observed (In-Situ / Spectral)' | 'Interpreted (Geomorphological)';
  source: string;
  observationDate: string;
  color: string;
}

export interface EnvironmentalRecord {
  id: string;
  missionId: 'perseverance' | 'curiosity' | 'insight';
  missionName: string;
  instrument: string;
  location: string;
  lat: number;
  lon: number;
  solRange: string;
  earthDateRange: string;
  recordKind: 'Historical Measurement' | 'Modeled / Aggregated Range';
  tempMinC: number | null;
  tempMaxC: number | null;
  pressurePa: number | null;
  windSpeedMs: number | null;
  windDirection: string | null;
  dustOpacityTau: number | null;
  notes: string;
  source: string;
}

export type PoiCategory =
  | 'mineral'
  | 'ancient_water'
  | 'terrain_feature'
  | 'rover_target'
  | 'geological_boundary';

export interface ScientificPoi {
  id: string;
  name: string;
  category: PoiCategory;
  lat: number;
  lon: number;
  elevationM: number;
  description: string;
  scienceValue: number; // 1-10 heuristic priority for science-aware routing
  source: string;
  observationDate: string;
  associatedInstrument: string;
}

export interface JezeroElevationGrid {
  region: string;
  datum: string;
  sourceStatus: 'nasa_m20_plus_mola' | 'mola_regional_only';
  measuredWaypointSamples: number;
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number };
  cols: number;
  rows: number;
  dLon: number;
  dLat: number;
  elevations: (number | null)[];
  quality: number[]; // 2 = measured M20 constrained, 1 = MOLA/DTM regional model, 0 = insufficient data
}

export type RiskLevel = 'low' | 'moderate' | 'high' | 'insufficient';

export interface TerrainSample {
  lat: number;
  lon: number;
  elevationM: number | null;
  slopeDeg: number | null;
  roughnessM: number | null;
  riskLevel: RiskLevel;
  riskScore: number; // 0-100
  dataQuality: 'measured' | 'regional_model' | 'insufficient_data';
  reasons: string[];
}

export type RouteMode =
  | 'shortest'
  | 'low_difficulty'
  | 'avoid_slopes'
  | 'avoid_hazards'
  | 'visit_science';

export interface RouteWeights {
  distanceWeight: number;
  slopeWeight: number;
  roughnessWeight: number;
  hazardWeight: number;
  scienceRewardWeight: number;
}

export interface ElevationProfilePoint {
  distanceKm: number;
  lat: number;
  lon: number;
  elevationM: number | null;
  slopeDeg: number | null;
  roughnessM: number | null;
  riskLevel: RiskLevel;
  dataQuality: 'measured' | 'regional_model' | 'insufficient_data';
}

export interface RouteHazardSummary {
  id: string;
  type: 'Steep Slope (>15°)' | 'High Roughness / Rubble' | 'Crater Rim / Scarp' | 'Depression / Basin' | 'Insufficient Data Gap';
  lat: number;
  lon: number;
  distanceKm: number;
  severity: 'moderate' | 'high' | 'unknown';
  detail: string;
}

export interface PlannedRoute {
  id: string;
  name: string;
  mode: RouteMode;
  start: MarsCoordinate;
  destination: MarsCoordinate;
  waypoints: [number, number][]; // [lon, lat]
  profile: ElevationProfilePoint[];
  totalDistanceKm: number;
  minElevationM: number | null;
  maxElevationM: number | null;
  totalAscentM: number;
  totalDescentM: number;
  maxSlopeDeg: number;
  avgSlopeDeg: number;
  steepSectionsCount: number;
  overallDifficulty: RiskLevel;
  isProvisional: boolean;
  provisionalReason?: string;
  hazards: RouteHazardSummary[];
  nearbyPois: Array<ScientificPoi & { distanceToRouteKm: number }>;
  computedAt: string;
  color: string;
}

export interface AppSettings {
  coordinateFormat: CoordinateFormat;
  longitudeConvention: LongitudeConvention;
  slopeWarningDeg: number;
  slopeDangerDeg: number;
  showGraticule: boolean;
  enable3dTerrain: boolean;
  showNasaModels: boolean;
}

export type FlightCraftId = 'ingenuity_scout' | 'ares_wing';
export type FlightCameraMode = 'chase' | 'cockpit';
export type FlightStatus = 'menu' | 'flying' | 'paused' | 'crashed';

export interface FlightCourse {
  id: string;
  name: string;
  region: string;
  subtitle: string;
  recommendedCraft: FlightCraftId;
  difficulty: 'Standard' | 'Technical' | 'Extreme';
  startLat: number;
  startLon: number;
  startAglM: number;
  startHeadingDeg: number;
  groundRefElevM: number;
  useCurrentView?: boolean;
}

export interface FlightCraftSpec {
  id: FlightCraftId;
  name: string;
  shortName: string;
  role: string;
  description: string;
  minSpeedMs: number;
  cruiseSpeedMs: number;
  maxSpeedMs: number;
  boostSpeedMs: number;
  pitchRateDegS: number;
  yawRateDegS: number;
  maxBankDeg: number;
  chaseDistanceM: number;
  chaseHeightM: number;
  modelUri?: string;
}

export interface FlightHudTelemetry {
  lat: number;
  lon: number;
  aglM: number;
  molaElevM: number | null;
  speedMs: number;
  speedKmh: number;
  verticalSpeedMs: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  throttle: number;
  boosting: boolean;
  elapsedMs: number;
  peakSpeedKmh: number;
  lowTerrainWarning: boolean;
  crashReason?: string;
}

export interface FlightTouchInput {
  pitch: number;
  yaw: number;
  throttleDelta: number;
  boost: boolean;
}

export type RoverVehicleId = 'perseverance_eva';
export type RoverCameraMode = 'chase' | 'cabin' | 'overhead';
export type RoverSimStatus = 'setup' | 'driving' | 'paused' | 'arrived';
export type RoverDriveMode = 'autopilot' | 'manual';

export interface RoverVehicleSpec {
  id: RoverVehicleId;
  name: string;
  shortName: string;
  role: string;
  description: string;
  cruiseSpeedMs: number;
  maxSpeedMs: number;
  boostSpeedMs: number;
  reverseSpeedMs: number;
  turnRateDegS: number;
  maxSafeSlopeDeg: number;
  chaseDistanceM: number;
  chaseHeightM: number;
  cabinEyeHeightM: number;
  modelUri?: string;
}

export interface RoverExpeditionPreset {
  id: string;
  name: string;
  region: string;
  subtitle: string;
  start: MarsCoordinate;
  destination: MarsCoordinate;
  recommendedVehicle: RoverVehicleId;
  routeMode: RouteMode;
}

export interface RoverTransitEvent {
  timeLabel: string;
  message: string;
  kind: 'info' | 'warn' | 'science' | 'relay';
}

export interface RoverHudTelemetry {
  lat: number;
  lon: number;
  elevM: number | null;
  startElevM: number | null;
  destElevM: number | null;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  slopeDeg: number;
  speedMs: number;
  speedKmh: number;
  avgSpeedKmh: number;
  throttle: number;
  boosting: boolean;
  braking: boolean;
  driveMode: RoverDriveMode;
  timeScale: 1 | 5 | 20;
  batteryPct: number;
  oxygenPct: number;
  energyUsedKwh: number;
  wheelRpm: number;
  powerDrawKw: number;
  suspensionCompressionPct: number;
  slipPct: number;
  ambientTempC: number;
  relaySatelliteName: string | null;
  relaySignalPct: number;
  relayElevationDeg: number;
  distanceTraveledM: number;
  distanceRemainingM: number;
  totalRouteDistanceM: number;
  progressPct: number;
  etaSeconds: number | null;
  waypointIdx: number;
  totalWaypoints: number;
  nextWaypointBearingDeg: number | null;
  destBearingDeg: number;
  destDistM: number;
  peakSlopeDeg: number;
  steepGradeWarning: boolean;
  nearbyPoiName: string | null;
  nearbyPoiDistM: number | null;
  elapsedMs: number;
  transitEvents: RoverTransitEvent[];
}

export interface RoverTouchInput {
  throttle: number; // -1..1
  steer: number; // -1..1
  brake: boolean;
  boost: boolean;
}

export type SatelliteCraftId = 'mro' | 'odyssey' | 'mgs';
export type SatelliteCameraMode = 'chase' | 'nadir' | 'horizon';
export type SatelliteSimStatus = 'setup' | 'orbiting' | 'paused' | 'arrived';

export interface SatelliteCraftSpec {
  id: SatelliteCraftId;
  name: string;
  shortName: string;
  agency: string;
  role: string;
  description: string;
  altitudeKm: number;
  orbitalSpeedKmS: number;
  inclinationDeg: number;
  swathWidthKm: number;
  instrumentName: string;
  downlinkPeakMbps: number;
  solarPeakW: number;
  accentColor: string;
  modelUri: string;
}

export interface SatellitePassPreset {
  id: string;
  name: string;
  region: string;
  subtitle: string;
  start: MarsCoordinate;
  destination: MarsCoordinate;
  recommendedCraft: SatelliteCraftId;
}

export interface SatelliteTransitEvent {
  timeLabel: string;
  message: string;
  kind: 'info' | 'scan' | 'relay';
}

export interface SatelliteHudTelemetry {
  subLat: number;
  subLon: number;
  altitudeKm: number;
  orbitalSpeedKmS: number;
  groundSpeedKmS: number;
  headingDeg: number;
  solarPowerW: number;
  sunlit: boolean;
  downlinkMbps: number;
  swathWidthKm: number;
  scansCaptured: number;
  overflownRegion: string;
  activeRelayTarget: string | null;
  activeRelayDistKm: number | null;
  distanceTraveledKm: number;
  distanceRemainingKm: number;
  totalDistanceKm: number;
  progressPct: number;
  etaSeconds: number | null;
  destBearingDeg: number;
  timeScale: 1 | 10 | 50 | 200;
  elapsedMs: number;
  surfaceElevM: number | null;
  transitEvents: SatelliteTransitEvent[];
}
