import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  AppSettings,
  FlightCameraMode,
  FlightCraftId,
  FlightHudTelemetry,
  FlightStatus,
  FlightTouchInput,
  GeologicalFeature,
  JezeroElevationGrid,
  LayerLoadStatus,
  LayerRuntimeState,
  MarsCoordinate,
  MarsLayerConfig,
  MarsLocation,
  MarsMission,
  MissionTelemetry,
  PlannedRoute,
  RoverCameraMode,
  RoverDriveMode,
  RoverHudTelemetry,
  RoverSimStatus,
  RoverTouchInput,
  RoverTransitEvent,
  RoverVehicleId,
  SatelliteCameraMode,
  SatelliteCraftId,
  SatelliteHudTelemetry,
  SatelliteSimStatus,
  SatelliteTransitEvent,
  ScientificPoi,
} from '../types/mars';
import { Compass, Layers, Minus, Navigation, Plus } from 'lucide-react';
import {
  formatMarsCoords,
  marsBearingDeg,
  marsDistanceMeters,
  MARS_EQUATORIAL_RADIUS_M,
} from '../utils/coordinates';
import { evaluateTerrainRisk } from '../analysis/riskScore';
import { sampleElevationGrid } from '../analysis/elevation';
import { FLIGHT_COURSES, FLIGHT_CRAFTS, playFlightCue } from '../data/flightCourses';
import { formatRoverDuration, playRoverCue, ROVER_VEHICLES } from '../data/roverMissions';
import { formatSatDuration, playSatCue, SATELLITE_CRAFTS } from '../data/satelliteMissions';
import { MARS_LOCATIONS } from '../data/locations';
import { SCIENTIFIC_POIS } from '../data/geologyAndEnvironment';
import {
  createMarsSurfaceDetailImageryProvider,
  sampleProceduralMarsReliefM,
  wrapWithMarsRegolithColorizer,
} from '../utils/marsSurfaceSynthesis';

// Match NASA Mars Trek EQ & NASA MMGIS datum: Mars_2000_Sphere_IAU (R = 3,396,190 m)
// so planetocentric coordinates, WMTS tiles, and MMGIS rover traverses align with zero latitude offset.
export const MARS_ELLIPSOID = new Cesium.Ellipsoid(
  MARS_EQUATORIAL_RADIUS_M,
  MARS_EQUATORIAL_RADIUS_M,
  MARS_EQUATORIAL_RADIUS_M
);

// Ensure all internal CesiumJS subsystems (entities, HeightReference, GroundPolyline, Terrain) use Mars instead of WGS84.
Cesium.Ellipsoid.default = MARS_ELLIPSOID;

interface MarsGlobeProps {
  layers: MarsLayerConfig[];
  layerStates: Record<string, LayerRuntimeState>;
  onLayerStatusChange: (layerId: string, status: LayerLoadStatus, errorMessage?: string) => void;
  missions: MarsMission[];
  visibleMissionIds: string[];
  missionTelemetry: Record<string, MissionTelemetry>;
  geologicalFeatures: GeologicalFeature[];
  pois: ScientificPoi[];
  showPois: boolean;
  locations: MarsLocation[];
  elevationGrid: JezeroElevationGrid | null;
  routes: PlannedRoute[];
  activeRouteId: string | null;
  hoveredProfileCoord: { lat: number; lon: number; distanceKm: number; elevationM: number | null } | null;
  selectedCoord: MarsCoordinate | null;
  routeStart?: MarsCoordinate | null;
  routeDest?: MarsCoordinate | null;
  pickMode: 'inspect' | 'start' | 'destination';
  onSelectCoordinate: (lat: number, lon: number) => void;
  onSelectMission: (missionId: string) => void;
  onSelectPoi: (poi: ScientificPoi) => void;
  onSelectLocation?: (location: MarsLocation) => void;
  flyToRequest: { lat: number; lon: number; altitudeM: number; pitchDeg?: number; nonce: number } | null;
  settings: AppSettings;
  splitCompareLayerId: string | null;
  onSelectBasemap?: (layerId: string) => void;
  onToggle3dTerrain?: () => void;
  onOpenSettings?: () => void;
  flightSim?: {
    active: boolean;
    courseId: string;
    craftId: FlightCraftId;
    cameraMode: FlightCameraMode;
    status: FlightStatus;
    invertPitch: boolean;
    muted: boolean;
    runNonce: number;
  };
  flightTouchRef?: React.MutableRefObject<FlightTouchInput>;
  onFlightHudUpdate?: (hud: FlightHudTelemetry) => void;
  onFlightStatusChange?: (status: FlightStatus, reason?: string) => void;
  onFlightToggleCamera?: () => void;
  onFlightTogglePause?: () => void;
  onFlightExit?: () => void;
  roverSim?: {
    active: boolean;
    vehicleId: RoverVehicleId;
    cameraMode: RoverCameraMode;
    status: RoverSimStatus;
    driveMode: RoverDriveMode;
    timeScale: 1 | 5 | 20;
    muted: boolean;
    runNonce: number;
    route: PlannedRoute | null;
    start: MarsCoordinate;
    destination: MarsCoordinate;
  };
  roverTouchRef?: React.MutableRefObject<RoverTouchInput>;
  onRoverHudUpdate?: (hud: RoverHudTelemetry) => void;
  onRoverStatusChange?: (status: RoverSimStatus) => void;
  onRoverToggleCamera?: () => void;
  onRoverTogglePause?: () => void;
  onRoverToggleAutopilot?: () => void;
  onRoverExit?: () => void;
  satelliteSim?: {
    active: boolean;
    craftId: SatelliteCraftId;
    cameraMode: SatelliteCameraMode;
    status: SatelliteSimStatus;
    timeScale: 1 | 10 | 50 | 200;
    muted: boolean;
    runNonce: number;
    start: MarsCoordinate;
    destination: MarsCoordinate;
  };
  onSatelliteHudUpdate?: (hud: SatelliteHudTelemetry) => void;
  onSatelliteStatusChange?: (status: SatelliteSimStatus) => void;
  onSatelliteToggleCamera?: () => void;
  onSatelliteTogglePause?: () => void;
  onSatelliteExit?: () => void;
}

function createFallbackMarsTexture(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 512, 256);
    grad.addColorStop(0, '#5a342a');
    grad.addColorStop(0.5, '#7c4b3c');
    grad.addColorStop(1, '#4a2a22');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = 'rgba(255,220,200,0.03)';
    for (let x = 0; x < 512; x += 32) {
      ctx.fillRect(x, 0, 1, 256);
    }
    for (let y = 0; y < 256; y += 32) {
      ctx.fillRect(0, y, 512, 1);
    }
  }
  return canvas.toDataURL('image/png');
}

function createJezeroTerrainProvider(grid: JezeroElevationGrid): Cesium.CustomHeightmapTerrainProvider {
  const tilingScheme = new Cesium.GeographicTilingScheme({
    ellipsoid: MARS_ELLIPSOID,
    numberOfLevelZeroTilesX: 2,
    numberOfLevelZeroTilesY: 1,
  });

  const width = 33;
  const height = 33;

  return new Cesium.CustomHeightmapTerrainProvider({
    tilingScheme,
    ellipsoid: MARS_ELLIPSOID,
    width,
    height,
    credit: 'NASA M20 Localization + MOLA/HiRISE Jezero Topography',
    callback: (x: number, y: number, level: number) => {
      const rect = tilingScheme.tileXYToRectangle(x, y, level);
      const westDeg = Cesium.Math.toDegrees(rect.west);
      const eastDeg = Cesium.Math.toDegrees(rect.east);
      const southDeg = Cesium.Math.toDegrees(rect.south);
      const northDeg = Cesium.Math.toDegrees(rect.north);

      const heights = new Float32Array(width * height);
      const inJezero = !(
        eastDeg < grid.bounds.minLon ||
        westDeg > grid.bounds.maxLon ||
        northDeg < grid.bounds.minLat ||
        southDeg > grid.bounds.maxLat
      );

      // Add high-frequency 3D crater, ridge, and dune relief at low-altitude zoom levels
      const addProceduralRelief = level >= 10;
      const includeMacroCraters = level >= 11;
      if (!inJezero && !addProceduralRelief) {
        return heights;
      }

      const floorRef = -2570;
      const lonSpan = grid.bounds.maxLon - grid.bounds.minLon;
      const latSpan = grid.bounds.maxLat - grid.bounds.minLat;

      for (let row = 0; row < height; row++) {
        const v = row / (height - 1);
        const lat = northDeg - v * (northDeg - southDeg);
        for (let col = 0; col < width; col++) {
          const u = col / (width - 1);
          const lon = westDeg + u * (eastDeg - westDeg);
          let h = 0;
          if (inJezero) {
            const sampled = sampleElevationGrid(grid, lat, lon);
            if (sampled.elevationM !== null) {
              const tx = Math.min(
                (lon - grid.bounds.minLon) / (lonSpan * 0.12),
                (grid.bounds.maxLon - lon) / (lonSpan * 0.12),
                1
              );
              const ty = Math.min(
                (lat - grid.bounds.minLat) / (latSpan * 0.12),
                (grid.bounds.maxLat - lat) / (latSpan * 0.12),
                1
              );
              const taper = Math.max(0, Math.min(1, Math.min(tx, ty)));
              h = (sampled.elevationM - floorRef) * taper;
            }
          }
          if (addProceduralRelief) {
            h += sampleProceduralMarsReliefM(lat, lon, 0, includeMacroCraters);
          }
          heights[row * width + col] = h;
        }
      }
      return heights;
    },
  });
}

export default function MarsGlobe({
  layers,
  layerStates,
  onLayerStatusChange,
  missions,
  visibleMissionIds,
  missionTelemetry,
  geologicalFeatures,
  pois,
  showPois,
  locations,
  elevationGrid,
  routes,
  activeRouteId,
  hoveredProfileCoord,
  selectedCoord,
  routeStart,
  routeDest,
  pickMode,
  onSelectCoordinate,
  onSelectMission,
  onSelectPoi,
  onSelectLocation,
  flyToRequest,
  settings,
  splitCompareLayerId,
  onSelectBasemap,
  onToggle3dTerrain,
  onOpenSettings,
  flightSim,
  flightTouchRef,
  onFlightHudUpdate,
  onFlightStatusChange,
  onFlightToggleCamera,
  onFlightTogglePause,
  onFlightExit,
  roverSim,
  roverTouchRef,
  onRoverHudUpdate,
  onRoverStatusChange,
  onRoverToggleCamera,
  onRoverTogglePause,
  onRoverToggleAutopilot,
  onRoverExit,
  satelliteSim,
  onSatelliteHudUpdate,
  onSatelliteStatusChange,
  onSatelliteToggleCamera,
  onSatelliteTogglePause,
  onSatelliteExit,
}: MarsGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const imageryMapRef = useRef<Map<string, Cesium.ImageryLayer>>(new Map());
  const detailLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const dataSourceRefs = useRef<{
    missions: Cesium.CustomDataSource;
    geology: Cesium.CustomDataSource;
    hazards: Cesium.CustomDataSource;
    routes: Cesium.CustomDataSource;
    selection: Cesium.CustomDataSource;
    graticule: Cesium.CustomDataSource;
    flightSim: Cesium.CustomDataSource;
    roverSim: Cesium.CustomDataSource;
    satSim: Cesium.CustomDataSource;
  } | null>(null);

  const [cursorCoord, setCursorCoord] = useState<{ lat: number; lon: number; elevM: number | null } | null>(
    null
  );
  const [cameraAltKm, setCameraAltKm] = useState<number>(9600);
  const [cameraHeadingDeg, setCameraHeadingDeg] = useState<number>(0);
  const [cameraPitchDeg, setCameraPitchDeg] = useState<number>(-90);
  const [scaleBar, setScaleBar] = useState<{ label: string; widthPx: number }>({
    label: '2,000 km',
    widthPx: 88,
  });
  const [basemapMenuOpen, setBasemapMenuOpen] = useState(false);
  const [splitPos, setSplitPos] = useState<number>(0.5);

  const callbackRefs = useRef({
    onSelectCoordinate,
    onSelectMission,
    onSelectPoi,
    onSelectLocation,
    onLayerStatusChange,
    elevationGrid,
    pickMode,
    settings,
    flightSim,
    flightTouchRef,
    onFlightHudUpdate,
    onFlightStatusChange,
    onFlightToggleCamera,
    onFlightTogglePause,
    onFlightExit,
    roverSim,
    roverTouchRef,
    onRoverHudUpdate,
    onRoverStatusChange,
    onRoverToggleCamera,
    onRoverTogglePause,
    onRoverToggleAutopilot,
    onRoverExit,
    satelliteSim,
    onSatelliteHudUpdate,
    onSatelliteStatusChange,
    onSatelliteToggleCamera,
    onSatelliteTogglePause,
    onSatelliteExit,
  });
  callbackRefs.current = {
    onSelectCoordinate,
    onSelectMission,
    onSelectPoi,
    onSelectLocation,
    onLayerStatusChange,
    elevationGrid,
    pickMode,
    settings,
    flightSim,
    flightTouchRef,
    onFlightHudUpdate,
    onFlightStatusChange,
    onFlightToggleCamera,
    onFlightTogglePause,
    onFlightExit,
    roverSim,
    roverTouchRef,
    onRoverHudUpdate,
    onRoverStatusChange,
    onRoverToggleCamera,
    onRoverTogglePause,
    onRoverToggleAutopilot,
    onRoverExit,
    satelliteSim,
    onSatelliteHudUpdate,
    onSatelliteStatusChange,
    onSatelliteToggleCamera,
    onSatelliteTogglePause,
    onSatelliteExit,
  };

  // Mutable 60fps flight physics state (never triggers React renders per-frame)
  const flightPhysRef = useRef({
    lat: 18.4446,
    lon: 77.4509,
    altEllipsoidM: 65,
    aglM: 65,
    headingDeg: 270,
    pitchDeg: 0,
    rollDeg: 0,
    speedMs: 48,
    throttle: 0.55,
    verticalSpeedMs: 0,
    rotorAngleRad: 0,
    turbTimeS: 0,
    elapsedMs: 0,
    peakSpeedKmh: 0,
    boosting: false,
    lastHudEmitMs: 0,
    lastWarnSoundMs: 0,
    worldPos: Cesium.Cartesian3.fromDegrees(77.4509, 18.4446, 65, MARS_ELLIPSOID),
    trailPts: [] as Cesium.Cartesian3[],
    craftQuat: Cesium.Quaternion.IDENTITY.clone(),
    basisRight: new Cesium.Cartesian3(1, 0, 0),
    basisFwd: new Cesium.Cartesian3(0, 1, 0),
    basisUp: new Cesium.Cartesian3(0, 0, 1),
  });
  const flightKeysRef = useRef<Set<string>>(new Set());

  // Mutable 60fps Rover physics state (never triggers React renders per-frame)
  const roverPhysRef = useRef({
    lat: 18.4446,
    lon: 77.4509,
    groundElevOffsetM: 0,
    suspHeaveM: 0,
    suspVelMs: 0,
    suspPitchDeltaRad: 0,
    startElevM: -2570 as number | null,
    destElevM: -2540 as number | null,
    headingDeg: 270,
    pitchDeg: 0,
    rollDeg: 0,
    slopeDeg: 0,
    speedMs: 0,
    throttle: 0,
    boosting: false,
    braking: false,
    batteryPct: 100,
    oxygenPct: 100,
    energyUsedKwh: 0,
    wheelSpinRad: 0,
    steerAngleDeg: 0,
    slipPct: 0,
    wheelHeightsM: [0, 0, 0, 0, 0, 0] as number[],
    distanceTraveledM: 0,
    totalRouteDistanceM: 7500,
    peakSlopeDeg: 0,
    waypointIdx: 1,
    waypoints: [] as Array<[number, number]>,
    elapsedMs: 0,
    lastHudEmitMs: 0,
    lastWarnSoundMs: 0,
    lastTrackDistM: 0,
    lastDustDistM: 0,
    lastSteepLoggedMs: -10000,
    lastSciPoiLogged: null as string | null,
    lastRelayLogged: false,
    satOrbitalPos: Cesium.Cartesian3.fromDegrees(77.45, 18.45, 280000, MARS_ELLIPSOID),
    satElevationDeg: 45,
    satPhaseRad: 0.35,
    worldPos: Cesium.Cartesian3.fromDegrees(77.4509, 18.4446, 0.2, MARS_ELLIPSOID),
    trackLeftPts: [] as Cesium.Cartesian3[],
    trackRightPts: [] as Cesium.Cartesian3[],
    traversedPts: [] as Cesium.Cartesian3[],
    dustPts: [] as Cesium.Cartesian3[],
    transitEvents: [] as RoverTransitEvent[],
    craftQuat: Cesium.Quaternion.IDENTITY.clone(),
    basisRight: new Cesium.Cartesian3(1, 0, 0),
    basisFwd: new Cesium.Cartesian3(0, 1, 0),
    basisUp: new Cesium.Cartesian3(0, 0, 1),
  });
  const roverKeysRef = useRef<Set<string>>(new Set());

  // Mutable 60fps Satellite Transit physics state
  const satPhysRef = useRef({
    startUnit: new Cesium.Cartesian3(1, 0, 0),
    destUnit: new Cesium.Cartesian3(0, 1, 0),
    totalArcRad: 0.5,
    totalDistanceKm: 1800,
    progress: 0,
    subLat: 18.4446,
    subLon: 77.4509,
    headingDeg: 110,
    altitudeKm: 280,
    orbitalSpeedKmS: 3.41,
    groundSpeedKmS: 3.15,
    scansCaptured: 0,
    lastScanProgress: 0,
    elapsedMs: 0,
    lastHudEmitMs: 0,
    lastRelayLogged: null as string | null,
    worldPos: Cesium.Cartesian3.fromDegrees(77.4509, 18.4446, 280000, MARS_ELLIPSOID),
    nadirPos: Cesium.Cartesian3.fromDegrees(77.4509, 18.4446, 200, MARS_ELLIPSOID),
    orbitCompletedPts: [] as Cesium.Cartesian3[],
    orbitRemainingPts: [] as Cesium.Cartesian3[],
    groundTrackPts: [] as Cesium.Cartesian3[],
    footprintPts: [] as Cesium.Cartesian3[],
    beamCorner0: Cesium.Cartesian3.fromDegrees(77.45, 18.44, 0, MARS_ELLIPSOID),
    beamCorner1: Cesium.Cartesian3.fromDegrees(77.45, 18.44, 0, MARS_ELLIPSOID),
    beamCorner2: Cesium.Cartesian3.fromDegrees(77.45, 18.44, 0, MARS_ELLIPSOID),
    beamCorner3: Cesium.Cartesian3.fromDegrees(77.45, 18.44, 0, MARS_ELLIPSOID),
    relayTargetName: null as string | null,
    relayTargetDistKm: null as number | null,
    relayTargetPos: Cesium.Cartesian3.fromDegrees(77.45, 18.44, 0, MARS_ELLIPSOID),
    craftQuat: Cesium.Quaternion.IDENTITY.clone(),
    basisRight: new Cesium.Cartesian3(1, 0, 0),
    basisFwd: new Cesium.Cartesian3(0, 1, 0),
    basisUp: new Cesium.Cartesian3(0, 0, 1),
    transitEvents: [] as SatelliteTransitEvent[],
  });

  // Initialize CesiumJS Viewer once with Mars 2000 IAU Sphere
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    Cesium.Ellipsoid.default = MARS_ELLIPSOID;

    const globe = new Cesium.Globe(MARS_ELLIPSOID);
    globe.baseColor = Cesium.Color.fromCssColorString('#61392e');
    globe.enableLighting = false;
    globe.depthTestAgainstTerrain = false;

    const viewer = new Cesium.Viewer(containerRef.current, {
      ellipsoid: MARS_ELLIPSOID,
      globe,
      mapProjection: new Cesium.GeographicProjection(MARS_ELLIPSOID),
      terrainProvider: new Cesium.EllipsoidTerrainProvider({ ellipsoid: MARS_ELLIPSOID }),
      baseLayer: false,
      skyAtmosphere: new Cesium.SkyAtmosphere(MARS_ELLIPSOID),
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: document.createElement('div'),
      requestRenderMode: false,
    });

    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.perFragmentAtmosphere = true;
      viewer.scene.skyAtmosphere.atmosphereRayleighCoefficient = new Cesium.Cartesian3(
        18.0e-6,
        10.2e-6,
        5.4e-6
      );
      viewer.scene.skyAtmosphere.atmosphereMieCoefficient = new Cesium.Cartesian3(
        22.0e-6,
        13.5e-6,
        7.5e-6
      );
      viewer.scene.skyAtmosphere.atmosphereRayleighScaleHeight = 11000;
      viewer.scene.skyAtmosphere.atmosphereMieScaleHeight = 4500;
      viewer.scene.skyAtmosphere.atmosphereMieAnisotropy = 0.75;
      viewer.scene.skyAtmosphere.atmosphereLightIntensity = 18.0;
      viewer.scene.skyAtmosphere.hueShift = 0.0;
      viewer.scene.skyAtmosphere.saturationShift = -0.14;
      viewer.scene.skyAtmosphere.brightnessShift = -0.22;
    }

    // Keep ground atmosphere subtle so high-res Jezero imagery keeps natural globe contrast without red glaze
    globe.showGroundAtmosphere = true;
    globe.atmosphereLightIntensity = 1.8;
    globe.atmosphereRayleighCoefficient = new Cesium.Cartesian3(14.0e-6, 9.6e-6, 6.2e-6);
    globe.atmosphereMieCoefficient = new Cesium.Cartesian3(16.0e-6, 11.2e-6, 7.6e-6);
    globe.atmosphereRayleighScaleHeight = 11000;
    globe.atmosphereMieScaleHeight = 4500;
    globe.atmosphereMieAnisotropy = 0.75;
    globe.atmosphereHueShift = 0.0;
    globe.atmosphereSaturationShift = -0.26;
    globe.atmosphereBrightnessShift = -0.34;

    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#030406');

    const fallbackUrl = createFallbackMarsTexture();
    const fallbackProvider = new Cesium.SingleTileImageryProvider({
      url: fallbackUrl,
      ellipsoid: MARS_ELLIPSOID,
      rectangle: Cesium.Rectangle.MAX_VALUE,
      tileWidth: 512,
      tileHeight: 256,
    });
    viewer.imageryLayers.addImageryProvider(fallbackProvider);

    const tilingScheme = new Cesium.GeographicTilingScheme({
      ellipsoid: MARS_ELLIPSOID,
      numberOfLevelZeroTilesX: 2,
      numberOfLevelZeroTilesY: 1,
    });

    layers.forEach((layer) => {
      if (layer.kind !== 'trek_wmts' && layer.kind !== 'usgs_wms') return;
      let provider: Cesium.ImageryProvider | null = null;
      const rectangle = layer.bounds
        ? Cesium.Rectangle.fromDegrees(
            layer.bounds[0],
            layer.bounds[1],
            layer.bounds[2],
            layer.bounds[3]
          )
        : Cesium.Rectangle.MAX_VALUE;

      if (layer.kind === 'trek_wmts' && layer.trekLayerId) {
        const ext = layer.trekFormat || 'jpg';
        const urlProvider = new Cesium.UrlTemplateImageryProvider({
          url: `/api/tiles/trek/${layer.trekLayerId}/{z}/{y}/{x}.${ext}`,
          tilingScheme,
          ellipsoid: MARS_ELLIPSOID,
          rectangle,
          maximumLevel: layer.maxZoom,
          tileWidth: 256,
          tileHeight: 256,
        });
        provider =
          layer.id === 'jezero_hirise' || layer.id === 'jezero_ctx'
            ? wrapWithMarsRegolithColorizer(urlProvider)
            : urlProvider;
      } else if (layer.kind === 'usgs_wms' && layer.usgsLayers) {
        provider = new Cesium.WebMapServiceImageryProvider({
          url: '/api/tiles/usgs',
          layers: layer.usgsLayers,
          parameters: {
            transparent: true,
            format: 'image/png',
            styles: '',
          },
          tilingScheme,
          rectangle,
          maximumLevel: layer.maxZoom,
        });
      }

      if (provider) {
        provider.errorEvent.addEventListener(() => {
          callbackRefs.current.onLayerStatusChange(
            layer.id,
            'error',
            'NASA/USGS tile request failed or out of regional coverage.'
          );
        });
        const imgLayer = viewer.imageryLayers.addImageryProvider(provider);
        imgLayer.show = layer.defaultEnabled;
        imgLayer.alpha = layer.defaultOpacity;
        if (layer.id === 'jezero_hirise') {
          imgLayer.brightness = 1.04;
          imgLayer.contrast = 1.08;
          imgLayer.saturation = 1.04;
        } else if (layer.id === 'jezero_ctx') {
          imgLayer.brightness = 1.02;
          imgLayer.contrast = 1.08;
          imgLayer.saturation = 1.04;
        } else if (layer.id === 'viking_mdim21') {
          imgLayer.contrast = 1.06;
          imgLayer.saturation = 1.04;
        }
        imageryMapRef.current.set(layer.id, imgLayer);
        if (layer.defaultEnabled) {
          callbackRefs.current.onLayerStatusChange(layer.id, 'ready');
        }
      }
    });

    // Keep high-resolution Jezero CTX (6m) & HiRISE (25cm) mosaics above global THEMIS IR
    const ctxLayer = imageryMapRef.current.get('jezero_ctx');
    const hiriseLayer = imageryMapRef.current.get('jezero_hirise');
    if (ctxLayer) viewer.imageryLayers.raiseToTop(ctxLayer);
    if (hiriseLayer) viewer.imageryLayers.raiseToTop(hiriseLayer);

    // High-resolution procedural Martian regolith, craters, rocks & ripples detail layer (terrain levels 11..21)
    const detailProvider = createMarsSurfaceDetailImageryProvider(tilingScheme);
    const detailLayer = new Cesium.ImageryLayer(detailProvider, {
      minimumTerrainLevel: 11,
      alpha: 0.55,
      brightness: 1.04,
      contrast: 1.1,
      saturation: 1.04,
    });
    viewer.imageryLayers.add(detailLayer);
    viewer.imageryLayers.raiseToTop(detailLayer);
    detailLayerRef.current = detailLayer;

    globe.tileCacheSize = 700;
    globe.preloadSiblings = true;
    globe.preloadAncestors = true;

    const dsMissions = new Cesium.CustomDataSource('missions');
    const dsGeology = new Cesium.CustomDataSource('geology');
    const dsHazards = new Cesium.CustomDataSource('hazards');
    const dsRoutes = new Cesium.CustomDataSource('routes');
    const dsSelection = new Cesium.CustomDataSource('selection');
    const dsGraticule = new Cesium.CustomDataSource('graticule');
    const dsFlightSim = new Cesium.CustomDataSource('flight_sim');
    const dsRoverSim = new Cesium.CustomDataSource('rover_sim');
    const dsSatSim = new Cesium.CustomDataSource('sat_sim');

    viewer.dataSources.add(dsGraticule);
    viewer.dataSources.add(dsHazards);
    viewer.dataSources.add(dsGeology);
    viewer.dataSources.add(dsMissions);
    viewer.dataSources.add(dsRoutes);
    viewer.dataSources.add(dsSelection);
    viewer.dataSources.add(dsFlightSim);
    viewer.dataSources.add(dsRoverSim);
    viewer.dataSources.add(dsSatSim);

    dataSourceRefs.current = {
      missions: dsMissions,
      geology: dsGeology,
      hazards: dsHazards,
      routes: dsRoutes,
      selection: dsSelection,
      graticule: dsGraticule,
      flightSim: dsFlightSim,
      roverSim: dsRoverSim,
      satSim: dsSatSim,
    };

    viewer.camera.percentageChanged = 0.01;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(77.42, 18.45, 9600000, MARS_ELLIPSOID),
    });

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (callbackRefs.current.flightSim?.active) return;
      const isPickingRoutePoint = callbackRefs.current.pickMode !== 'inspect';
      if (callbackRefs.current.roverSim?.active && !isPickingRoutePoint) return;
      if (callbackRefs.current.satelliteSim?.active && !isPickingRoutePoint) return;
      const picked = viewer.scene.pick(movement.position);

      if (!isPickingRoutePoint && Cesium.defined(picked) && picked.id && picked.id.properties) {
        const kind = picked.id.properties.kind?.getValue();
        if (kind === 'mission') {
          const mid = picked.id.properties.missionId?.getValue();
          if (mid) {
            callbackRefs.current.onSelectMission(mid);
            return;
          }
        } else if (kind === 'poi') {
          const poiData = picked.id.properties.poiData?.getValue() as ScientificPoi | undefined;
          if (poiData) {
            callbackRefs.current.onSelectPoi(poiData);
            return;
          }
        } else if (kind === 'location') {
          const locData = picked.id.properties.locationData?.getValue() as MarsLocation | undefined;
          if (locData) {
            callbackRefs.current.onSelectLocation?.(locData);
            return;
          }
        }
      }

      if (isPickingRoutePoint && Cesium.defined(picked) && picked.id?.position) {
        const entityPos = picked.id.position.getValue(Cesium.JulianDate.now());
        if (entityPos) {
          const carto = MARS_ELLIPSOID.cartesianToCartographic(entityPos);
          callbackRefs.current.onSelectCoordinate(
            Cesium.Math.toDegrees(carto.latitude),
            Cesium.Math.toDegrees(carto.longitude)
          );
          return;
        }
      }

      const ray = viewer.camera.getPickRay(movement.position);
      const cartesian =
        (ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined) ||
        viewer.camera.pickEllipsoid(movement.position, MARS_ELLIPSOID);

      if (cartesian) {
        const carto = MARS_ELLIPSOID.cartesianToCartographic(cartesian);
        const lat = Cesium.Math.toDegrees(carto.latitude);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        callbackRefs.current.onSelectCoordinate(lat, lon);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, MARS_ELLIPSOID);
      if (!cartesian) {
        setCursorCoord(null);
        return;
      }
      const carto = MARS_ELLIPSOID.cartesianToCartographic(cartesian);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const elev = sampleElevationGrid(callbackRefs.current.elevationGrid, lat, lon);
      setCursorCoord({ lat, lon, elevM: elev.elevationM });
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    const updateCamTelemetry = () => {
      const carto = MARS_ELLIPSOID.cartesianToCartographic(viewer.camera.positionWC);
      if (!carto) return;
      const altM = Math.max(100, carto.height);
      setCameraAltKm(Math.max(0.1, Number((altM / 1000).toFixed(1))));
      setCameraHeadingDeg(Cesium.Math.toDegrees(viewer.camera.heading));
      setCameraPitchDeg(Cesium.Math.toDegrees(viewer.camera.pitch));

      const canvasH = Math.max(400, viewer.scene.canvas.clientHeight || 800);
      const metersPerPixel = Math.max(0.1, (2 * altM * Math.tan(Cesium.Math.toRadians(55) / 2)) / canvasH);
      const targetMeters = metersPerPixel * 90;
      const niceSteps = [
        50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2000000,
      ];
      let best = niceSteps[niceSteps.length - 1];
      for (const s of niceSteps) {
        if (s >= targetMeters * 0.65) {
          best = s;
          break;
        }
      }
      const widthPx = Math.max(46, Math.min(126, Math.round(best / metersPerPixel)));
      const label = best >= 1000 ? `${(best / 1000).toLocaleString()} km` : `${best} m`;
      setScaleBar({ label, widthPx });
    };

    updateCamTelemetry();
    const removeCamListener = viewer.camera.changed.addEventListener(updateCamTelemetry);

    viewerRef.current = viewer;

    return () => {
      removeCamListener();
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      imageryMapRef.current.clear();
      detailLayerRef.current = null;
      dataSourceRefs.current = null;
    };
  }, []);

  // Update 3D Jezero Terrain Relief Provider
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (settings.enable3dTerrain && elevationGrid) {
      viewer.terrainProvider = createJezeroTerrainProvider(elevationGrid);
    } else {
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider({ ellipsoid: MARS_ELLIPSOID });
    }
  }, [elevationGrid, settings.enable3dTerrain]);

  // Sync imagery layer visibility, opacity, and split comparison
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.scene.splitPosition = splitCompareLayerId ? splitPos : 0;

    layers.forEach((layer) => {
      const imgLayer = imageryMapRef.current.get(layer.id);
      const st = layerStates[layer.id];
      if (!imgLayer || !st) return;
      imgLayer.show = st.enabled;
      imgLayer.alpha = st.opacity;
      if (splitCompareLayerId && layer.id === splitCompareLayerId) {
        imgLayer.splitDirection = Cesium.SplitDirection.RIGHT;
        imgLayer.show = true;
      } else {
        imgLayer.splitDirection = Cesium.SplitDirection.NONE;
      }
    });
  }, [layers, layerStates, splitCompareLayerId, splitPos]);

  // Match real Mars globe map sharpness, clean terrain, & crisp Martian surface during Rover & Flight simulators
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const inSurfaceOrFlightSim = Boolean(
      flightSim?.active ||
        (roverSim?.active && (pickMode === 'inspect' || roverSim.status !== 'setup'))
    );

    viewer.scene.globe.maximumScreenSpaceError = inSurfaceOrFlightSim ? 0.8 : 2.0;
    // Disable gray ground-atmosphere scattering veil & dense surface fog during Rover/Flight sims
    // so ground matches the rich rusty-brown cratered Mars globe without washed-out haze.
    viewer.scene.globe.showGroundAtmosphere = !inSurfaceOrFlightSim;
    viewer.scene.fog.enabled = !inSurfaceOrFlightSim;
    viewer.scene.fog.renderable = !inSurfaceOrFlightSim;
    viewer.scene.fog.density = inSurfaceOrFlightSim ? 0.000001 : 0.0001;
    viewer.scene.fog.minimumBrightness = 0.04;

    if (detailLayerRef.current) {
      detailLayerRef.current.alpha = inSurfaceOrFlightSim ? 0.94 : 0.55;
    }

    const dsRefs = dataSourceRefs.current;
    if (dsRefs) {
      dsRefs.geology.show = !inSurfaceOrFlightSim;
      dsRefs.hazards.show = !inSurfaceOrFlightSim;
      dsRefs.routes.show = !inSurfaceOrFlightSim;
      dsRefs.selection.show = !inSurfaceOrFlightSim;
      dsRefs.missions.show = !inSurfaceOrFlightSim;
      dsRefs.graticule.show = !inSurfaceOrFlightSim;
    }
  }, [flightSim?.active, roverSim?.active, roverSim?.status, pickMode]);

  // Camera flyTo requests
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flyToRequest) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        flyToRequest.lon,
        flyToRequest.lat,
        flyToRequest.altitudeM,
        MARS_ELLIPSOID
      ),
      orientation:
        flyToRequest.pitchDeg !== undefined
          ? {
              heading: 0,
              pitch: Cesium.Math.toRadians(flyToRequest.pitchDeg),
              roll: 0,
            }
          : undefined,
      duration: 1.4,
    });
  }, [flyToRequest]);

  // Render graticule lines
  useEffect(() => {
    const ds = dataSourceRefs.current?.graticule;
    if (!ds) return;
    ds.entities.removeAll();
    if (!settings.showGraticule) return;

    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: Cesium.Cartesian3[] = [];
      for (let lon = -180; lon <= 180; lon += 10) {
        pts.push(Cesium.Cartesian3.fromDegrees(lon, lat, 400, MARS_ELLIPSOID));
      }
      ds.entities.add({
        polyline: {
          positions: pts,
          width: 1,
          material: Cesium.Color.fromCssColorString('rgba(148,163,184,0.22)'),
        },
      });
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts: Cesium.Cartesian3[] = [];
      for (let lat = -80; lat <= 80; lat += 10) {
        pts.push(Cesium.Cartesian3.fromDegrees(lon, lat, 400, MARS_ELLIPSOID));
      }
      ds.entities.add({
        polyline: {
          positions: pts,
          width: 1,
          material: Cesium.Color.fromCssColorString('rgba(148,163,184,0.22)'),
        },
      });
    }
  }, [settings.showGraticule]);

  // Render Terrain Slope & Hazard Grid Overlay
  useEffect(() => {
    const ds = dataSourceRefs.current?.hazards;
    if (!ds) return;
    ds.entities.removeAll();
    const hazardEnabled = layerStates['terrain_slope_hazard']?.enabled;
    const opacity = layerStates['terrain_slope_hazard']?.opacity ?? 0.55;
    if (!hazardEnabled || !elevationGrid) return;

    const { bounds, cols, rows, dLon, dLat } = elevationGrid;
    const stride = 2;
    for (let r = 0; r < rows - stride; r += stride) {
      for (let c = 0; c < cols - stride; c += stride) {
        const lat = bounds.minLat + (r + stride / 2) * dLat;
        const lon = bounds.minLon + (c + stride / 2) * dLon;
        const sample = evaluateTerrainRisk(
          elevationGrid,
          lat,
          lon,
          settings.slopeWarningDeg,
          settings.slopeDangerDeg
        );

        let cssColor = '#64748b';
        if (sample.riskLevel === 'low') cssColor = '#22c55e';
        else if (sample.riskLevel === 'moderate') cssColor = '#eab308';
        else if (sample.riskLevel === 'high') cssColor = '#ef4444';

        const color = Cesium.Color.fromCssColorString(cssColor).withAlpha(opacity * 0.62);
        ds.entities.add({
          rectangle: {
            coordinates: Cesium.Rectangle.fromDegrees(
              bounds.minLon + c * dLon,
              bounds.minLat + r * dLat,
              bounds.minLon + (c + stride) * dLon,
              bounds.minLat + (r + stride) * dLat
            ),
            material: color,
            outline: false,
          },
        });
      }
    }
  }, [elevationGrid, layerStates, settings.slopeWarningDeg, settings.slopeDangerDeg]);

  // Render CRISM Mineralogy & Geological Polygons
  useEffect(() => {
    const ds = dataSourceRefs.current?.geology;
    if (!ds) return;
    ds.entities.removeAll();
    const crismState = layerStates['crism_mineral_footprints'];
    if (!crismState?.enabled) return;

    const alpha = crismState.opacity * 0.42;
    geologicalFeatures.forEach((feat) => {
      const col = Cesium.Color.fromCssColorString(feat.color);
      if (feat.polygon && feat.polygon.length >= 3) {
        const flat: number[] = [];
        feat.polygon.forEach(([lon, lat]) => flat.push(lon, lat));
        ds.entities.add({
          name: feat.name,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(flat, MARS_ELLIPSOID),
            material: col.withAlpha(alpha),
            outline: true,
            outlineColor: col.withAlpha(Math.min(1, alpha + 0.35)),
            outlineWidth: 1.5,
          },
        });
      } else {
        ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(feat.lon, feat.lat, 50, MARS_ELLIPSOID),
          ellipse: {
            semiMajorAxis: feat.radiusKm * 1000,
            semiMinorAxis: feat.radiusKm * 1000,
            material: col.withAlpha(alpha),
            outline: true,
            outlineColor: col.withAlpha(0.85),
          },
        });
      }
    });
  }, [geologicalFeatures, layerStates]);

  // Render Missions, NASA 3D GLB Models, Traverses, Sample Caches, Landmarks, and POIs
  useEffect(() => {
    const ds = dataSourceRefs.current?.missions;
    if (!ds) return;
    ds.entities.removeAll();

    const surfaceHeightAt = (lat: number, lon: number): number => {
      if (!settings.enable3dTerrain || !elevationGrid) return 0;
      const sampled = sampleElevationGrid(elevationGrid, lat, lon);
      if (sampled.elevationM === null) return 0;
      return sampled.elevationM - -2570;
    };

    // Verified Mars exploration locations (interactive clickable markers)
    locations.forEach((loc) => {
      const h = surfaceHeightAt(loc.lat, loc.lon);
      const isLanding = loc.category === 'landing_site';
      const pinColorCss =
        loc.category === 'volcano' || loc.category === 'canyon'
          ? '#f59e0b'
          : loc.category === 'delta'
          ? '#38bdf8'
          : loc.category === 'geology' || loc.category === 'rover_target'
          ? '#a855f7'
          : '#e2e8f0';
      const minDist = isLanding ? 65000 : 12000;
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(loc.lon, loc.lat, h + 15, MARS_ELLIPSOID),
        point: {
          pixelSize: isLanding ? 7 : 8,
          color: Cesium.Color.fromCssColorString(pinColorCss),
          outlineColor: Cesium.Color.fromCssColorString('#0f172a'),
          outlineWidth: 1.5,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(minDist, 15000000),
        },
        label: {
          text: loc.name,
          font: '11px "IBM Plex Sans", sans-serif',
          fillColor: Cesium.Color.fromCssColorString(pinColorCss),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(minDist, 9000000),
        },
        properties: {
          kind: 'location',
          locationData: loc,
        },
      });
    });

    // Missions, Traverses & Official NASA 3D Models
    missions.forEach((mission) => {
      if (!visibleMissionIds.includes(mission.id)) return;
      const mColor = Cesium.Color.fromCssColorString(mission.color);
      const isOrbiter = mission.missionType === 'Orbiter';
      const telemetry = missionTelemetry[mission.id];

      // Determine final/current spacecraft placement coordinate
      let craftLon = mission.lon;
      let craftLat = mission.lat;
      if (telemetry && telemetry.waypoints.length > 0) {
        const lastWp = telemetry.waypoints[telemetry.waypoints.length - 1];
        craftLon = lastWp.lon;
        craftLat = lastWp.lat;
      } else if (mission.staticTraverse && mission.staticTraverse.length > 0) {
        const lastPt = mission.staticTraverse[mission.staticTraverse.length - 1];
        craftLon = lastPt[0];
        craftLat = lastPt[1];
      }

      if (isOrbiter) {
        const alt = mission.orbitAltitudeM || 300000;
        const orbIdx = mission.id === 'mro' ? 0 : mission.id === 'odyssey' ? 1 : 2;
        const periodMs = 95000 + orbIdx * 24000;
        const phaseOffset = orbIdx * 2.1;

        const computeOrbState = (tMs: number) => {
          const theta = ((tMs % periodMs) / periodMs) * Math.PI * 2 + phaseOffset;
          const incDrift = Math.sin(theta) * 4.5;
          const latRad = Math.asin(Math.sin(theta) * 0.996); // ~93° sun-synchronous inclination
          const latDeg = Cesium.Math.toDegrees(latRad);
          const cosTheta = Math.cos(theta);
          let lonDeg =
            cosTheta >= 0 ? craftLon + incDrift : craftLon + 180 - incDrift;
          if (lonDeg > 180) lonDeg -= 360;
          if (lonDeg < -180) lonDeg += 360;

          const nextTheta = theta + 0.03;
          const nLatDeg = Cesium.Math.toDegrees(Math.asin(Math.sin(nextTheta) * 0.996));
          let nLonDeg =
            Math.cos(nextTheta) >= 0
              ? craftLon + Math.sin(nextTheta) * 4.5
              : craftLon + 180 - Math.sin(nextTheta) * 4.5;
          if (nLonDeg > 180) nLonDeg -= 360;
          if (nLonDeg < -180) nLonDeg += 360;

          const hdg = marsBearingDeg(latDeg, lonDeg, nLatDeg, nLonDeg);
          return { latDeg, lonDeg, hdg };
        };

        // Full orbital path ring (tilted sun-synchronous meridian)
        const orbitPts: Cesium.Cartesian3[] = [];
        for (let s = 0; s <= 90; s++) {
          const a = (s / 90) * Math.PI * 2;
          const latD = Cesium.Math.toDegrees(Math.asin(Math.sin(a) * 0.996));
          let lonD = Math.cos(a) >= 0 ? craftLon + Math.sin(a) * 4.5 : craftLon + 180 - Math.sin(a) * 4.5;
          if (lonD > 180) lonD -= 360;
          if (lonD < -180) lonD += 360;
          orbitPts.push(Cesium.Cartesian3.fromDegrees(lonD, latD, alt, MARS_ELLIPSOID));
        }

        ds.entities.add({
          polyline: {
            positions: orbitPts,
            width: 1.5,
            material: new Cesium.PolylineDashMaterialProperty({
              color: mColor.withAlpha(0.5),
              dashLength: 16,
            }),
          },
        });

        // Glowing trailing wake behind satellite
        ds.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const tMs = performance.now();
              const baseTheta = ((tMs % periodMs) / periodMs) * Math.PI * 2 + phaseOffset;
              const pts: Cesium.Cartesian3[] = [];
              for (let k = 12; k >= 0; k--) {
                const th = baseTheta - k * 0.065;
                const latD = Cesium.Math.toDegrees(Math.asin(Math.sin(th) * 0.996));
                let lonD =
                  Math.cos(th) >= 0 ? craftLon + Math.sin(th) * 4.5 : craftLon + 180 - Math.sin(th) * 4.5;
                if (lonD > 180) lonD -= 360;
                if (lonD < -180) lonD += 360;
                pts.push(Cesium.Cartesian3.fromDegrees(lonD, latD, alt, MARS_ELLIPSOID));
              }
              return pts;
            }, false) as unknown as Cesium.Property,
            width: 3,
            material: mColor.withAlpha(0.95),
          },
        });

        // Nadir vertical laser line & surface scan swath box
        ds.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const st = computeOrbState(performance.now());
              return [
                Cesium.Cartesian3.fromDegrees(st.lonDeg, st.latDeg, alt, MARS_ELLIPSOID),
                Cesium.Cartesian3.fromDegrees(st.lonDeg, st.latDeg, 200, MARS_ELLIPSOID),
              ];
            }, false) as unknown as Cesium.Property,
            width: 1.5,
            material: mColor.withAlpha(0.5),
          },
        });

        ds.entities.add({
          polygon: {
            hierarchy: new Cesium.CallbackProperty(() => {
              const st = computeOrbState(performance.now());
              const dLat = 1.6;
              const dLon = 1.6 / Math.max(0.25, Math.cos(Cesium.Math.toRadians(st.latDeg)));
              return new Cesium.PolygonHierarchy(
                Cesium.Cartesian3.fromDegreesArrayHeights(
                  [
                    st.lonDeg - dLon,
                    st.latDeg - dLat,
                    400,
                    st.lonDeg + dLon,
                    st.latDeg - dLat,
                    400,
                    st.lonDeg + dLon,
                    st.latDeg + dLat,
                    400,
                    st.lonDeg - dLon,
                    st.latDeg + dLat,
                    400,
                  ],
                  MARS_ELLIPSOID
                )
              );
            }, false) as unknown as Cesium.Property,
            material: mColor.withAlpha(0.14),
            outline: true,
            outlineColor: mColor.withAlpha(0.65),
            outlineWidth: 1.5,
            perPositionHeight: true,
          },
        });

        const orbPosProp = new Cesium.CallbackProperty(() => {
          const st = computeOrbState(performance.now());
          return Cesium.Cartesian3.fromDegrees(st.lonDeg, st.latDeg, alt, MARS_ELLIPSOID);
        }, false) as unknown as Cesium.PositionProperty;

        const orbOrientProp = new Cesium.CallbackProperty(() => {
          const st = computeOrbState(performance.now());
          const pos = Cesium.Cartesian3.fromDegrees(st.lonDeg, st.latDeg, alt, MARS_ELLIPSOID);
          return Cesium.Transforms.headingPitchRollQuaternion(
            pos,
            new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(st.hdg) - Math.PI / 2, 0, 0),
            MARS_ELLIPSOID
          );
        }, false) as unknown as Cesium.Property;

        ds.entities.add({
          position: orbPosProp,
          orientation: orbOrientProp,
          model:
            settings.showNasaModels && mission.modelKey
              ? {
                  uri: `/api/models/${mission.modelKey}.glb`,
                  minimumPixelSize: 64,
                  maximumScale: 45000,
                }
              : undefined,
          point:
            !settings.showNasaModels || !mission.modelKey
              ? {
                  pixelSize: 10,
                  color: mColor,
                  outlineColor: Cesium.Color.WHITE,
                  outlineWidth: 2,
                }
              : undefined,
          label: {
            text: `${mission.name} (${Math.round(alt / 1000)} km · LIVE ORBIT)`,
            font: '600 11px "IBM Plex Sans", sans-serif',
            fillColor: mColor,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -26),
          },
          properties: {
            kind: 'mission',
            missionId: mission.id,
          },
        });
        return;
      }

      // Surface / Aerial Mission Landing Marker at exact landing coordinates (mission.lat, mission.lon)
      const landingH = surfaceHeightAt(mission.lat, mission.lon);
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(mission.lon, mission.lat, landingH + 10, MARS_ELLIPSOID),
        point: {
          pixelSize: 9,
          color: mColor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1.5,
        },
        label: {
          text:
            mission.id === 'ingenuity'
              ? 'Wright Brothers Field (Ingenuity Start)'
              : `${mission.name.split(' (')[0]} Landing`,
          font: '600 11px "IBM Plex Sans", sans-serif',
          fillColor: mColor,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -18),
        },
        properties: {
          kind: 'mission',
          missionId: mission.id,
        },
      });

      // Rover or Helicopter Traverse Polylines clamped on Mars surface
      if (telemetry && telemetry.pathSegments.length > 0) {
        telemetry.pathSegments.forEach((seg) => {
          if (seg.length < 2) return;
          const positions = seg.map((coord) =>
            Cesium.Cartesian3.fromDegrees(
              coord[0],
              coord[1],
              surfaceHeightAt(coord[1], coord[0]) + 4,
              MARS_ELLIPSOID
            )
          );
          ds.entities.add({
            polyline: {
              positions,
              width: 2.8,
              material: mColor.withAlpha(0.92),
            },
          });
        });
      } else if (mission.staticTraverse && mission.staticTraverse.length >= 2) {
        const positions = mission.staticTraverse.map(([lon, lat]) =>
          Cesium.Cartesian3.fromDegrees(
            lon,
            lat,
            surfaceHeightAt(lat, lon) + (mission.id === 'ingenuity' ? 18 : 4),
            MARS_ELLIPSOID
          )
        );
        ds.entities.add({
          polyline: {
            positions,
            width: 2.5,
            material: new Cesium.PolylineDashMaterialProperty({
              color: mColor.withAlpha(0.9),
              dashLength: 10,
            }),
          },
        });
      }

      // Official NASA 3D GLB Spacecraft / Rover Model upright in local Mars ENU frame
      const craftH = surfaceHeightAt(craftLat, craftLon) + (mission.id === 'ingenuity' ? 22 : 4);
      const craftPos = Cesium.Cartesian3.fromDegrees(craftLon, craftLat, craftH, MARS_ELLIPSOID);
      const craftOrientation = Cesium.Transforms.headingPitchRollQuaternion(
        craftPos,
        new Cesium.HeadingPitchRoll(0, 0, 0),
        MARS_ELLIPSOID
      );

      if (settings.showNasaModels && mission.modelKey) {
        ds.entities.add({
          position: craftPos,
          orientation: craftOrientation,
          model: {
            uri: `/api/models/${mission.modelKey}.glb`,
            minimumPixelSize: 54,
            maximumScale: 1600,
          },
          properties: {
            kind: 'mission',
            missionId: mission.id,
          },
        });
      }

      // Final / Latest Archive Site Marker (when rover/helicopter moved away from landing site)
      const movedFromLanding =
        Math.abs(craftLat - mission.lat) > 0.001 || Math.abs(craftLon - mission.lon) > 0.001;
      if (movedFromLanding) {
        const lastWp =
          telemetry && telemetry.waypoints.length > 0
            ? telemetry.waypoints[telemetry.waypoints.length - 1]
            : null;
        ds.entities.add({
          position: craftPos,
          point: {
            pixelSize: 9,
            color: Cesium.Color.WHITE,
            outlineColor: mColor,
            outlineWidth: 2.5,
          },
          label: {
            text: lastWp
              ? `${mission.name.split(' ')[0]} Archive Sol ${lastWp.sol}`
              : mission.id === 'ingenuity'
              ? 'Ingenuity Final Site (Flight 72)'
              : `${mission.name.split(' ')[0]} Final Site`,
            font: '600 11px "JetBrains Mono", monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -28),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 180000),
          },
          properties: {
            kind: 'mission',
            missionId: mission.id,
          },
        });
      }

      // Sample cache pins
      mission.sampleCaches?.forEach((sc) => {
        const scH = surfaceHeightAt(sc.lat, sc.lon) + 6;
        ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(sc.lon, sc.lat, scH, MARS_ELLIPSOID),
          point: {
            pixelSize: 7,
            color: Cesium.Color.fromCssColorString('#fbbf24'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1.5,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 45000),
          },
          label: {
            text: `Core: ${sc.name.split(' ')[0]}`,
            font: '10px "JetBrains Mono", monospace',
            fillColor: Cesium.Color.fromCssColorString('#fde68a'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, 14),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 22000),
          },
        });
      });
    });

    // Scientific POIs
    if (showPois) {
      pois.forEach((poi) => {
        const poiH = surfaceHeightAt(poi.lat, poi.lon) + 12;
        ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(poi.lon, poi.lat, poiH, MARS_ELLIPSOID),
          point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString('#06b6d4'),
            outlineColor: Cesium.Color.fromCssColorString('#083344'),
            outlineWidth: 2,
          },
          label: {
            text: poi.name,
            font: '500 11px "IBM Plex Sans", sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#67e8f9'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2.5,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(10, -4),
            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 38000),
          },
          properties: {
            kind: 'poi',
            poiData: poi,
          },
        });
      });
    }
  }, [
    missions,
    visibleMissionIds,
    missionTelemetry,
    pois,
    showPois,
    locations,
    settings.showNasaModels,
    settings.enable3dTerrain,
    elevationGrid,
  ]);

  // Render Planned Routes + Hazards + Profile Hover Marker
  useEffect(() => {
    const ds = dataSourceRefs.current?.routes;
    if (!ds) return;
    ds.entities.removeAll();

    const surfaceHeightAt = (lat: number, lon: number): number => {
      if (!settings.enable3dTerrain || !elevationGrid) return 0;
      const sampled = sampleElevationGrid(elevationGrid, lat, lon);
      if (sampled.elevationM === null) return 0;
      return sampled.elevationM - -2570;
    };

    routes.forEach((route) => {
      const isActive = route.id === activeRouteId;
      const rColor = Cesium.Color.fromCssColorString(route.color);
      const lineLiftM = route.totalDistanceKm > 60 ? 2200 : 10;
      const positions = route.waypoints.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat, surfaceHeightAt(lat, lon) + lineLiftM, MARS_ELLIPSOID)
      );

      if (positions.length >= 2) {
        ds.entities.add({
          polyline: {
            positions,
            arcType: Cesium.ArcType.GEODESIC,
            width: isActive ? 4.5 : 2.5,
            material: route.isProvisional
              ? new Cesium.PolylineDashMaterialProperty({
                  color: rColor.withAlpha(isActive ? 1 : 0.65),
                  dashLength: 14,
                })
              : rColor.withAlpha(isActive ? 1 : 0.55),
          },
        });
      }

      if (isActive) {
        route.hazards.forEach((hz) => {
          ds.entities.add({
            position: Cesium.Cartesian3.fromDegrees(
              hz.lon,
              hz.lat,
              surfaceHeightAt(hz.lat, hz.lon) + 14,
              MARS_ELLIPSOID
            ),
            point: {
              pixelSize: 9,
              color:
                hz.severity === 'high'
                  ? Cesium.Color.fromCssColorString('#ef4444')
                  : hz.severity === 'moderate'
                  ? Cesium.Color.fromCssColorString('#eab308')
                  : Cesium.Color.fromCssColorString('#94a3b8'),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1.5,
            },
          });
        });
      }
    });

    const activeRouteObj = routes.find((r) => r.id === activeRouteId) || routes[0] || null;
    const pinStart = activeRouteObj?.start ?? routeStart;
    const pinDest = activeRouteObj?.destination ?? routeDest;
    const pinLiftM = activeRouteObj && activeRouteObj.totalDistanceKm > 60 ? 2600 : 18;

    if (pinStart) {
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          pinStart.lon,
          pinStart.lat,
          surfaceHeightAt(pinStart.lat, pinStart.lon) + pinLiftM,
          MARS_ELLIPSOID
        ),
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString('#22c55e'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: pinStart.label ? `START · ${pinStart.label}` : 'START',
          font: '600 11px "JetBrains Mono", monospace',
          fillColor: Cesium.Color.fromCssColorString('#86efac'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2.5,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -18),
        },
      });
    }

    if (pinDest) {
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          pinDest.lon,
          pinDest.lat,
          surfaceHeightAt(pinDest.lat, pinDest.lon) + pinLiftM,
          MARS_ELLIPSOID
        ),
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString('#ef4444'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: pinDest.label ? `DEST · ${pinDest.label}` : 'DEST',
          font: '600 11px "JetBrains Mono", monospace',
          fillColor: Cesium.Color.fromCssColorString('#fca5a5'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2.5,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -18),
        },
      });
    }

    if (hoveredProfileCoord) {
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          hoveredProfileCoord.lon,
          hoveredProfileCoord.lat,
          surfaceHeightAt(hoveredProfileCoord.lat, hoveredProfileCoord.lon) + 25,
          MARS_ELLIPSOID
        ),
        point: {
          pixelSize: 13,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2.5,
        },
        label: {
          text: `${hoveredProfileCoord.distanceKm.toFixed(2)} km · ${
            hoveredProfileCoord.elevationM !== null ? `${hoveredProfileCoord.elevationM.toFixed(0)} m` : 'No DEM'
          }`,
          font: '600 11px "JetBrains Mono", monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -20),
        },
      });
    }
  }, [
    routes,
    activeRouteId,
    routeStart,
    routeDest,
    hoveredProfileCoord,
    settings.enable3dTerrain,
    elevationGrid,
  ]);

  // Render Selected Location Crosshair
  useEffect(() => {
    const ds = dataSourceRefs.current?.selection;
    if (!ds) return;
    ds.entities.removeAll();
    if (!selectedCoord) return;

    const h =
      settings.enable3dTerrain && elevationGrid
        ? (sampleElevationGrid(elevationGrid, selectedCoord.lat, selectedCoord.lon).elevationM ?? -2570) -
          -2570
        : 0;

    ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        selectedCoord.lon,
        selectedCoord.lat,
        h + 15,
        MARS_ELLIPSOID
      ),
      point: {
        pixelSize: 11,
        color: Cesium.Color.fromCssColorString('#f97316'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
    });
  }, [selectedCoord, settings.enable3dTerrain, elevationGrid]);

  // Flight Simulator: Helper to compute terrain surface offset at (lat, lon) matching Jezero DEM relief
  const getTerrainSurfaceOffsetAt = (lat: number, lon: number): number => {
    const grid = callbackRefs.current.elevationGrid;
    const enabled = callbackRefs.current.settings.enable3dTerrain;
    if (!enabled || !grid) return 0;
    const sampled = sampleElevationGrid(grid, lat, lon);
    if (sampled.elevationM === null) return 0;
    const lonSpan = grid.bounds.maxLon - grid.bounds.minLon;
    const latSpan = grid.bounds.maxLat - grid.bounds.minLat;
    const tx = Math.min(
      (lon - grid.bounds.minLon) / (lonSpan * 0.12),
      (grid.bounds.maxLon - lon) / (lonSpan * 0.12),
      1
    );
    const ty = Math.min(
      (lat - grid.bounds.minLat) / (latSpan * 0.12),
      (grid.bounds.maxLat - lat) / (latSpan * 0.12),
      1
    );
    const taper = Math.max(0, Math.min(1, Math.min(tx, ty)));
    return Math.max(0, (sampled.elevationM - -2570) * taper);
  };

  // Flight Simulator: Keyboard listener (active while flightSim.active is true)
  useEffect(() => {
    if (!flightSim?.active) {
      flightKeysRef.current.clear();
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();
      if (
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }
      flightKeysRef.current.add(code);

      if (e.repeat) return;
      if (key === 'c') {
        callbackRefs.current.onFlightToggleCamera?.();
      } else if (key === 'p' || code === 'Space') {
        const st = callbackRefs.current.flightSim?.status;
        if (st === 'flying' || st === 'paused') {
          callbackRefs.current.onFlightTogglePause?.();
        }
      } else if (code === 'Escape') {
        callbackRefs.current.onFlightExit?.();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      flightKeysRef.current.delete(e.code);
    };

    const onBlur = () => {
      flightKeysRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      flightKeysRef.current.clear();
    };
  }, [flightSim?.active]);

  // Flight Simulator: Initialize start state + aerial gate rings + craft entity
  useEffect(() => {
    const viewer = viewerRef.current;
    const ds = dataSourceRefs.current?.flightSim;
    if (!viewer || !ds) return;

    const rebuildFlightEntities = () => {
      ds.entities.removeAll();
      const sim = callbackRefs.current.flightSim;
      if (!sim?.active) return;

      const phys = flightPhysRef.current;
      const course = FLIGHT_COURSES.find((c) => c.id === sim.courseId) || FLIGHT_COURSES[0];
      void course;

      // Player craft entity in chase cam
      if (sim.cameraMode === 'chase') {
        const craftPosProp = new Cesium.CallbackProperty(
          () => flightPhysRef.current.worldPos,
          false
        ) as unknown as Cesium.PositionProperty;

        if (sim.craftId === 'ingenuity_scout') {
          ds.entities.add({
            id: 'flight-player-craft',
            position: craftPosProp,
            orientation: new Cesium.CallbackProperty(
              () => flightPhysRef.current.craftQuat,
              false
            ) as unknown as Cesium.Property,
            model: {
              uri: '/api/models/ingenuity.glb',
              minimumPixelSize: 72,
              maximumScale: 42,
              nodeTransformations: new Cesium.PropertyBag({
                rotors_01: new Cesium.NodeTransformationProperty({
                  rotation: new Cesium.CallbackProperty(
                    () =>
                      Cesium.Quaternion.fromAxisAngle(
                        Cesium.Cartesian3.UNIT_X,
                        flightPhysRef.current.rotorAngleRad
                      ),
                    false
                  ) as unknown as Cesium.Property,
                }),
                rotors_02: new Cesium.NodeTransformationProperty({
                  rotation: new Cesium.CallbackProperty(
                    () =>
                      Cesium.Quaternion.fromAxisAngle(
                        Cesium.Cartesian3.UNIT_X,
                        -flightPhysRef.current.rotorAngleRad * 1.07
                      ),
                    false
                  ) as unknown as Cesium.Property,
                }),
              }),
            },
          });
        } else {
          // High-contrast 3D swept lifting-body Mars Wing airframe built from exact (right, fwd, up) basis
          const wingPolyProp = new Cesium.CallbackProperty(() => {
            const p = flightPhysRef.current;
            const c = p.worldPos;
            const r = p.basisRight;
            const f = p.basisFwd;
            const u = p.basisUp;
            const pt = (rx: number, fy: number, uz: number) => {
              const out = Cesium.Cartesian3.clone(c);
              Cesium.Cartesian3.add(out, Cesium.Cartesian3.multiplyByScalar(r, rx, new Cesium.Cartesian3()), out);
              Cesium.Cartesian3.add(out, Cesium.Cartesian3.multiplyByScalar(f, fy, new Cesium.Cartesian3()), out);
              Cesium.Cartesian3.add(out, Cesium.Cartesian3.multiplyByScalar(u, uz, new Cesium.Cartesian3()), out);
              return out;
            };
            // Nose -> Right wingtip -> Tail -> Left wingtip -> Nose -> Tail -> Fin tip
            return [
              pt(0, 14, 0),
              pt(13, -7, -0.8),
              pt(2.6, -9, 0.2),
              pt(-2.6, -9, 0.2),
              pt(-13, -7, -0.8),
              pt(0, 14, 0),
              pt(0, -9, 0.4),
              pt(0, -10.5, 4.5),
            ];
          }, false) as unknown as Cesium.Property;

          ds.entities.add({
            id: 'flight-player-wings',
            polyline: {
              positions: wingPolyProp,
              width: 3.5,
              material: Cesium.Color.fromCssColorString('#f8fafc'),
            },
          });

          // Core craft body beacon
          ds.entities.add({
            id: 'flight-player-core',
            position: craftPosProp,
            point: {
              pixelSize: 10,
              color: Cesium.Color.fromCssColorString('#f97316'),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
            },
          });
        }

        // Subtle wingtip/exhaust contrail
        const trailProp = new Cesium.CallbackProperty(
          () => flightPhysRef.current.trailPts,
          false
        ) as unknown as Cesium.Property;
        ds.entities.add({
          id: 'flight-player-trail',
          polyline: {
            positions: trailProp,
            width: 2.0,
            material: Cesium.Color.fromCssColorString('#d6c6bf').withAlpha(0.38),
          },
        });
      }
    };

    if (!flightSim?.active) {
      ds.entities.removeAll();
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      if (viewer.camera.frustum instanceof Cesium.PerspectiveFrustum) {
        viewer.camera.frustum.fov = Cesium.Math.toRadians(60);
      }
      return;
    }

    const course = FLIGHT_COURSES.find((c) => c.id === flightSim.courseId) || FLIGHT_COURSES[0];
    const craft = FLIGHT_CRAFTS[flightSim.craftId];

    // If entering menu or restarting a flight run, reset physics position to spawn
    let startLat = course.startLat;
    let startLon = course.startLon;
    let startHeading = course.startHeadingDeg;

    if (course.useCurrentView) {
      const camCarto = MARS_ELLIPSOID.cartesianToCartographic(viewer.camera.positionWC);
      if (camCarto && camCarto.height < 1200000) {
        startLat = Math.max(-80, Math.min(80, Cesium.Math.toDegrees(camCarto.latitude)));
        startLon = Cesium.Math.toDegrees(camCarto.longitude);
        startHeading = ((Cesium.Math.toDegrees(viewer.camera.heading) % 360) + 360) % 360;
      }
    }

    const groundStart = getTerrainSurfaceOffsetAt(startLat, startLon);
    const startAlt = groundStart + course.startAglM;
    const worldPos = Cesium.Cartesian3.fromDegrees(startLon, startLat, startAlt, MARS_ELLIPSOID);

    flightPhysRef.current = {
      lat: startLat,
      lon: startLon,
      altEllipsoidM: startAlt,
      aglM: course.startAglM,
      headingDeg: startHeading,
      pitchDeg: 0,
      rollDeg: 0,
      speedMs: craft.cruiseSpeedMs,
      throttle:
        (craft.cruiseSpeedMs - craft.minSpeedMs) /
        Math.max(1, craft.maxSpeedMs - craft.minSpeedMs),
      verticalSpeedMs: 0,
      rotorAngleRad: 0,
      turbTimeS: 0,
      elapsedMs: 0,
      peakSpeedKmh: craft.cruiseSpeedMs * 3.6,
      boosting: false,
      lastHudEmitMs: 0,
      lastWarnSoundMs: 0,
      worldPos,
      trailPts: [worldPos],
      craftQuat: Cesium.Quaternion.IDENTITY.clone(),
      basisRight: new Cesium.Cartesian3(1, 0, 0),
      basisFwd: new Cesium.Cartesian3(0, 1, 0),
      basisUp: new Cesium.Cartesian3(0, 0, 1),
    };

    rebuildFlightEntities();

    // Snap camera immediately behind craft so user sees the Martian launch corridor live
    const updateCameraAndBasis = () => {
      const p = flightPhysRef.current;
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(p.worldPos, MARS_ELLIPSOID);
      const hRad = Cesium.Math.toRadians(p.headingDeg);
      const pRad = Cesium.Math.toRadians(p.pitchDeg);
      const rRad = Cesium.Math.toRadians(p.rollDeg);

      const fwdH = new Cesium.Cartesian3(Math.sin(hRad), Math.cos(hRad), 0);
      const right0 = new Cesium.Cartesian3(Math.cos(hRad), -Math.sin(hRad), 0);

      const localFwd = new Cesium.Cartesian3(
        fwdH.x * Math.cos(pRad),
        fwdH.y * Math.cos(pRad),
        Math.sin(pRad)
      );
      const localUp0 = new Cesium.Cartesian3(
        -fwdH.x * Math.sin(pRad),
        -fwdH.y * Math.sin(pRad),
        Math.cos(pRad)
      );

      const localRight = new Cesium.Cartesian3(
        right0.x * Math.cos(rRad) - localUp0.x * Math.sin(rRad),
        right0.y * Math.cos(rRad) - localUp0.y * Math.sin(rRad),
        -localUp0.z * Math.sin(rRad)
      );
      const localUp = new Cesium.Cartesian3(
        localUp0.x * Math.cos(rRad) + right0.x * Math.sin(rRad),
        localUp0.y * Math.cos(rRad) + right0.y * Math.sin(rRad),
        localUp0.z * Math.cos(rRad)
      );

      const rotMat = Cesium.Matrix4.getMatrix3(enu, new Cesium.Matrix3());
      const worldFwd = Cesium.Matrix3.multiplyByVector(rotMat, localFwd, new Cesium.Cartesian3());
      const worldRight = Cesium.Matrix3.multiplyByVector(rotMat, localRight, new Cesium.Cartesian3());
      const worldUp = Cesium.Matrix3.multiplyByVector(rotMat, localUp, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(worldFwd, worldFwd);
      Cesium.Cartesian3.normalize(worldRight, worldRight);
      Cesium.Cartesian3.normalize(worldUp, worldUp);

      p.basisFwd = worldFwd;
      p.basisRight = worldRight;
      p.basisUp = worldUp;

      // Align Cesium GLTF heading (heading=0 points +X East -> hRad - PI/2)
      p.craftQuat = Cesium.Transforms.headingPitchRollQuaternion(
        p.worldPos,
        new Cesium.HeadingPitchRoll(hRad - Math.PI / 2, pRad, rRad),
        MARS_ELLIPSOID
      );

      if (flightSim.cameraMode === 'cockpit') {
        const eye = Cesium.Cartesian3.add(
          p.worldPos,
          Cesium.Cartesian3.multiplyByScalar(worldUp, 2.5, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
        viewer.camera.setView({
          destination: eye,
          orientation: {
            direction: worldFwd,
            up: worldUp,
          },
        });
      } else {
        const backOffset = Cesium.Cartesian3.multiplyByScalar(
          worldFwd,
          -craft.chaseDistanceM,
          new Cesium.Cartesian3()
        );
        const upOffset = Cesium.Cartesian3.multiplyByScalar(
          worldUp,
          craft.chaseHeightM,
          new Cesium.Cartesian3()
        );
        const camPos = Cesium.Cartesian3.add(
          Cesium.Cartesian3.add(p.worldPos, backOffset, new Cesium.Cartesian3()),
          upOffset,
          new Cesium.Cartesian3()
        );

        // Clamp chase camera safely above local terrain surface
        const camCarto = MARS_ELLIPSOID.cartesianToCartographic(camPos);
        if (camCarto) {
          const camGround = getTerrainSurfaceOffsetAt(
            Cesium.Math.toDegrees(camCarto.latitude),
            Cesium.Math.toDegrees(camCarto.longitude)
          );
          if (camCarto.height < camGround + 6) {
            camCarto.height = camGround + 6;
            MARS_ELLIPSOID.cartographicToCartesian(camCarto, camPos);
          }
        }

        const lookTarget = Cesium.Cartesian3.add(
          p.worldPos,
          Cesium.Cartesian3.multiplyByScalar(worldFwd, 55, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
        const camDir = Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.subtract(lookTarget, camPos, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );

        // Gentle damped horizon tilt in chase cam
        const levelWorldUp = Cesium.Matrix3.multiplyByVector(
          rotMat,
          localUp0,
          new Cesium.Cartesian3()
        );
        const blendedUp = Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.lerp(levelWorldUp, worldUp, 0.45, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );

        viewer.camera.setView({
          destination: camPos,
          orientation: {
            direction: camDir,
            up: blendedUp,
          },
        });
      }
    };

    updateCameraAndBasis();

    // Emit initial telemetry snapshot
    callbackRefs.current.onFlightHudUpdate?.({
      lat: startLat,
      lon: startLon,
      aglM: course.startAglM,
      molaElevM:
        sampleElevationGrid(callbackRefs.current.elevationGrid, startLat, startLon).elevationM ??
        course.groundRefElevM,
      speedMs: craft.cruiseSpeedMs,
      speedKmh: craft.cruiseSpeedMs * 3.6,
      verticalSpeedMs: 0,
      headingDeg: startHeading,
      pitchDeg: 0,
      rollDeg: 0,
      throttle: flightPhysRef.current.throttle,
      boosting: false,
      elapsedMs: 0,
      peakSpeedKmh: craft.cruiseSpeedMs * 3.6,
      lowTerrainWarning: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightSim?.active, flightSim?.courseId, flightSim?.craftId, flightSim?.runNonce]);

  // Flight Simulator: Camera mode switch rebuilds chase entity visibility immediately
  useEffect(() => {
    const ds = dataSourceRefs.current?.flightSim;
    if (!ds || !flightSim?.active) return;
    const entitiesToToggle = ['flight-player-craft', 'flight-player-wings', 'flight-player-core'];
    entitiesToToggle.forEach((eid) => {
      const ent = ds.entities.getById(eid);
      if (ent) ent.show = flightSim.cameraMode === 'chase';
    });
  }, [flightSim?.active, flightSim?.cameraMode]);

  // Flight Simulator: 60fps RAF Physics & Camera Loop
  useEffect(() => {
    const viewer = viewerRef.current;
    const ds = dataSourceRefs.current?.flightSim;
    if (!viewer || !ds || !flightSim?.active) return;

    viewer.scene.screenSpaceCameraController.enableInputs = false;

    if (flightSim.status !== 'flying') {
      return;
    }

    let rafId = 0;
    let prevTs = performance.now();
    let trailTimer = 0;

    const tick = (now: number) => {
      const sim = callbackRefs.current.flightSim;
      if (!sim?.active || sim.status !== 'flying') return;

      const dt = Math.min(0.05, Math.max(0.001, (now - prevTs) / 1000));
      prevTs = now;

      const course = FLIGHT_COURSES.find((c) => c.id === sim.courseId) || FLIGHT_COURSES[0];
      const craft = FLIGHT_CRAFTS[sim.craftId];
      const p = flightPhysRef.current;
      const keys = flightKeysRef.current;
      const touch = callbackRefs.current.flightTouchRef?.current;

      // Read pitch/roll/throttle/boost inputs
      let pitchInput = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) pitchInput += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) pitchInput -= 1;
      if (touch) pitchInput += touch.pitch;
      if (sim.invertPitch) pitchInput = -pitchInput;

      let yawInput = 0;
      if (keys.has('KeyD') || keys.has('ArrowRight')) yawInput += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) yawInput -= 1;
      if (touch) yawInput += touch.yaw;

      let throttleDelta = 0;
      if (keys.has('KeyE') || keys.has('Equal')) throttleDelta += 1;
      if (keys.has('KeyQ') || keys.has('Minus')) throttleDelta -= 1;
      if (touch) throttleDelta += touch.throttleDelta;

      const boosting = keys.has('ShiftLeft') || keys.has('ShiftRight') || Boolean(touch?.boost);
      p.boosting = boosting;

      if (throttleDelta !== 0) {
        p.throttle = Math.max(0, Math.min(1, p.throttle + throttleDelta * 0.48 * dt));
      }

      // Coaxial rotor blade spin & Mars thin-air aerodynamics (0.38g + ground effect + ridge turbulence)
      const G_MARS = 3.721;
      const rotorOmega = 30 + p.throttle * 28 + (boosting ? 18 : 0);
      p.rotorAngleRad = (p.rotorAngleRad + rotorOmega * dt) % (Math.PI * 2);
      p.turbTimeS += dt;

      // Smooth attitude integration + thin-air Mars wind shear over crater/delta crests
      const crestProximity = Math.max(0, 1 - Math.min(1, p.aglM / 45));
      const gustRollDeg =
        Math.sin(p.turbTimeS * 2.7 + p.lat * 190) * (1.2 + crestProximity * 2.4) +
        Math.cos(p.turbTimeS * 4.3 + p.lon * 210) * 0.7;
      const gustPitchDeg =
        Math.sin(p.turbTimeS * 3.1 + p.lon * 170) * (0.65 + crestProximity * 1.4);

      if (pitchInput !== 0) {
        p.pitchDeg = Math.max(-55, Math.min(55, p.pitchDeg + pitchInput * craft.pitchRateDegS * dt));
      } else {
        // Gentle aerodynamic nose self-leveling with slight forward cyclic trim
        p.pitchDeg = (p.pitchDeg + gustPitchDeg * dt * 2.5) * Math.exp(-0.9 * dt);
      }

      const targetRoll = yawInput * craft.maxBankDeg + (yawInput === 0 ? gustRollDeg * 0.45 : 0);
      const rollLerp = 1 - Math.exp(-6.5 * dt);
      p.rollDeg = p.rollDeg + (targetRoll - p.rollDeg) * rollLerp;

      // Coordinated bank-angle yaw rate + thin-atmosphere turn slip
      const bankRad = Cesium.Math.toRadians(p.rollDeg);
      const bankTurnFactor = Math.sin(bankRad) * craft.yawRateDegS * (1 + crestProximity * 0.12);
      p.headingDeg = (p.headingDeg + (bankTurnFactor + yawInput * 14) * dt + 360) % 360;

      // Speed envelope under Mars 0.38g gravity & induced turn drag
      const targetSpeed = boosting
        ? craft.boostSpeedMs
        : craft.minSpeedMs + p.throttle * (craft.maxSpeedMs - craft.minSpeedMs);
      const gravPitchEffect = -Math.sin(Cesium.Math.toRadians(p.pitchDeg)) * G_MARS * 5.2;
      const bankInducedDrag = -(1 - Math.cos(bankRad)) * 8.5;
      p.speedMs +=
        (targetSpeed + gravPitchEffect + bankInducedDrag - p.speedMs) * (1 - Math.exp(-2.8 * dt));
      p.speedMs = Math.max(craft.minSpeedMs * 0.8, Math.min(craft.boostSpeedMs * 1.05, p.speedMs));

      const speedKmh = p.speedMs * 3.6;
      if (speedKmh > p.peakSpeedKmh) p.peakSpeedKmh = speedKmh;

      // Integrate 3D position over Mars Sphere with Ground-Effect Cushion & Thin-Air Gravity Sink
      const hRad = Cesium.Math.toRadians(p.headingDeg);
      const pRad = Cesium.Math.toRadians(p.pitchDeg);
      const demGroundNow = getTerrainSurfaceOffsetAt(p.lat, p.lon);
      const globeHeightNow = viewer.scene.globe.getHeight(
        Cesium.Cartographic.fromDegrees(p.lon, p.lat, 0)
      );
      const curGroundH = Math.max(
        demGroundNow,
        Number.isFinite(globeHeightNow) ? (globeHeightNow as number) : 0
      );
      const curAgl = p.altEllipsoidM - curGroundH;

      // Aerodynamic ground-effect upward cushion near crests (agl < 22 m) vs bank-induced thin-air sink
      const groundEffectLiftMs = curAgl < 22 ? Math.pow((22 - Math.max(0, curAgl)) / 22, 1.5) * 4.2 : 0;
      const bankSinkMs = (1 - Math.cos(bankRad)) * G_MARS * 0.65;
      const thrustMarginMs = (p.throttle - 0.38) * 2.6 + (boosting ? 3.5 : 0);

      const vHoriz = p.speedMs * Math.cos(pRad);
      const vVert = p.speedMs * Math.sin(pRad) + groundEffectLiftMs - bankSinkMs + thrustMarginMs;
      p.verticalSpeedMs = vVert;

      const vNorth = vHoriz * Math.cos(hRad);
      const vEast = vHoriz * Math.sin(hRad);

      p.lat = Math.max(
        -84,
        Math.min(84, p.lat + ((vNorth * dt) / MARS_EQUATORIAL_RADIUS_M) * (180 / Math.PI))
      );
      const cosLat = Math.max(0.18, Math.cos(Cesium.Math.toRadians(p.lat)));
      let nextLon = p.lon + ((vEast * dt) / (MARS_EQUATORIAL_RADIUS_M * cosLat)) * (180 / Math.PI);
      if (nextLon > 180) nextLon -= 360;
      if (nextLon < -180) nextLon += 360;
      p.lon = nextLon;

      p.altEllipsoidM += vVert * dt;
      p.elapsedMs += dt * 1000;

      const demGround = getTerrainSurfaceOffsetAt(p.lat, p.lon);
      const globeHeight = viewer.scene.globe.getHeight(
        Cesium.Cartographic.fromDegrees(p.lon, p.lat, 0)
      );
      const groundH = Math.max(demGround, Number.isFinite(globeHeight) ? (globeHeight as number) : 0);
      p.aglM = p.altEllipsoidM - groundH;

      // Clamp hard ceiling at 45 km above datum
      if (p.altEllipsoidM > 45000) {
        p.altEllipsoidM = 45000;
        p.pitchDeg = Math.min(0, p.pitchDeg);
      }

      p.worldPos = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altEllipsoidM, MARS_ELLIPSOID);

      // Trail sampling
      trailTimer += dt;
      if (trailTimer >= 0.08) {
        trailTimer = 0;
        p.trailPts.push(Cesium.Cartesian3.clone(p.worldPos));
        if (p.trailPts.length > 42) p.trailPts.shift();
      }

      // Update local ENU basis + orientation + camera
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(p.worldPos, MARS_ELLIPSOID);
      const rRad = Cesium.Math.toRadians(p.rollDeg);
      const fwdH = new Cesium.Cartesian3(Math.sin(hRad), Math.cos(hRad), 0);
      const right0 = new Cesium.Cartesian3(Math.cos(hRad), -Math.sin(hRad), 0);

      const localFwd = new Cesium.Cartesian3(
        fwdH.x * Math.cos(pRad),
        fwdH.y * Math.cos(pRad),
        Math.sin(pRad)
      );
      const localUp0 = new Cesium.Cartesian3(
        -fwdH.x * Math.sin(pRad),
        -fwdH.y * Math.sin(pRad),
        Math.cos(pRad)
      );
      const localRight = new Cesium.Cartesian3(
        right0.x * Math.cos(rRad) - localUp0.x * Math.sin(rRad),
        right0.y * Math.cos(rRad) - localUp0.y * Math.sin(rRad),
        -localUp0.z * Math.sin(rRad)
      );
      const localUp = new Cesium.Cartesian3(
        localUp0.x * Math.cos(rRad) + right0.x * Math.sin(rRad),
        localUp0.y * Math.cos(rRad) + right0.y * Math.sin(rRad),
        localUp0.z * Math.cos(rRad)
      );

      const rotMat = Cesium.Matrix4.getMatrix3(enu, new Cesium.Matrix3());
      const worldFwd = Cesium.Cartesian3.normalize(
        Cesium.Matrix3.multiplyByVector(rotMat, localFwd, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const worldRight = Cesium.Cartesian3.normalize(
        Cesium.Matrix3.multiplyByVector(rotMat, localRight, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const worldUp = Cesium.Cartesian3.normalize(
        Cesium.Matrix3.multiplyByVector(rotMat, localUp, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      p.basisFwd = worldFwd;
      p.basisRight = worldRight;
      p.basisUp = worldUp;
      p.craftQuat = Cesium.Transforms.headingPitchRollQuaternion(
        p.worldPos,
        new Cesium.HeadingPitchRoll(hRad - Math.PI / 2, pRad, rRad),
        MARS_ELLIPSOID
      );

      // Dynamic FOV widening on boost for crisp speed sensation
      if (viewer.camera.frustum instanceof Cesium.PerspectiveFrustum) {
        const targetFov = Cesium.Math.toRadians(boosting ? 73 : 60);
        const curFov = viewer.camera.frustum.fov ?? Cesium.Math.toRadians(60);
        viewer.camera.frustum.fov = curFov + (targetFov - curFov) * (1 - Math.exp(-5 * dt));
      }

      if (sim.cameraMode === 'cockpit') {
        const eye = Cesium.Cartesian3.add(
          p.worldPos,
          Cesium.Cartesian3.multiplyByScalar(worldUp, 2.5, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
        viewer.camera.setView({
          destination: eye,
          orientation: {
            direction: worldFwd,
            up: worldUp,
          },
        });
      } else {
        const backOffset = Cesium.Cartesian3.multiplyByScalar(
          worldFwd,
          -craft.chaseDistanceM,
          new Cesium.Cartesian3()
        );
        const upOffset = Cesium.Cartesian3.multiplyByScalar(
          worldUp,
          craft.chaseHeightM,
          new Cesium.Cartesian3()
        );
        const camPos = Cesium.Cartesian3.add(
          Cesium.Cartesian3.add(p.worldPos, backOffset, new Cesium.Cartesian3()),
          upOffset,
          new Cesium.Cartesian3()
        );
        const camCarto = MARS_ELLIPSOID.cartesianToCartographic(camPos);
        if (camCarto) {
          const camGround = getTerrainSurfaceOffsetAt(
            Cesium.Math.toDegrees(camCarto.latitude),
            Cesium.Math.toDegrees(camCarto.longitude)
          );
          if (camCarto.height < camGround + 6) {
            camCarto.height = camGround + 6;
            MARS_ELLIPSOID.cartographicToCartesian(camCarto, camPos);
          }
        }
        const lookTarget = Cesium.Cartesian3.add(
          p.worldPos,
          Cesium.Cartesian3.multiplyByScalar(worldFwd, 55, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
        const camDir = Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.subtract(lookTarget, camPos, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
        const levelWorldUp = Cesium.Matrix3.multiplyByVector(
          rotMat,
          localUp0,
          new Cesium.Cartesian3()
        );
        const blendedUp = Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.lerp(levelWorldUp, worldUp, 0.45, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
        viewer.camera.setView({
          destination: camPos,
          orientation: {
            direction: camDir,
            up: blendedUp,
          },
        });
      }

      // Check Terrain Impact Crash
      const lowTerrainWarning = p.aglM < 30;
      if (lowTerrainWarning && now - p.lastWarnSoundMs > 900) {
        p.lastWarnSoundMs = now;
        playFlightCue('warn', sim.muted);
      }

      if (p.aglM <= 2) {
        p.aglM = 0;
        p.altEllipsoidM = groundH + 2;
        p.worldPos = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altEllipsoidM, MARS_ELLIPSOID);
        playFlightCue('crash', sim.muted);
        callbackRefs.current.onFlightHudUpdate?.({
          lat: p.lat,
          lon: p.lon,
          aglM: 0,
          molaElevM:
            sampleElevationGrid(callbackRefs.current.elevationGrid, p.lat, p.lon).elevationM ??
            course.groundRefElevM,
          speedMs: 0,
          speedKmh: 0,
          verticalSpeedMs: 0,
          headingDeg: p.headingDeg,
          pitchDeg: p.pitchDeg,
          rollDeg: p.rollDeg,
          throttle: p.throttle,
          boosting: false,
          elapsedMs: p.elapsedMs,
          peakSpeedKmh: p.peakSpeedKmh,
          lowTerrainWarning: true,
          crashReason: `Surface collision at ${p.lat.toFixed(4)}°N, ${p.lon.toFixed(4)}°E`,
        });
        callbackRefs.current.onFlightStatusChange?.(
          'crashed',
          `Surface collision at ${p.lat.toFixed(4)}°N, ${p.lon.toFixed(4)}°E`
        );
        return;
      }

      // Throttled ~18 Hz HUD Snapshot Update to React
      if (now - p.lastHudEmitMs >= 55) {
        p.lastHudEmitMs = now;
        const molaElevM =
          sampleElevationGrid(callbackRefs.current.elevationGrid, p.lat, p.lon).elevationM ??
          course.groundRefElevM;

        callbackRefs.current.onFlightHudUpdate?.({
          lat: p.lat,
          lon: p.lon,
          aglM: p.aglM,
          molaElevM,
          speedMs: p.speedMs,
          speedKmh,
          verticalSpeedMs: p.verticalSpeedMs,
          headingDeg: p.headingDeg,
          pitchDeg: p.pitchDeg,
          rollDeg: p.rollDeg,
          throttle: p.throttle,
          boosting: p.boosting,
          elapsedMs: p.elapsedMs,
          peakSpeedKmh: p.peakSpeedKmh,
          lowTerrainWarning,
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [flightSim?.active, flightSim?.status]);

  // Rover Simulator: Keyboard listener
  useEffect(() => {
    if (!roverSim?.active) {
      roverKeysRef.current.clear();
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();
      if (
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }
      roverKeysRef.current.add(code);

      if (e.repeat) return;
      if (key === 'c') {
        callbackRefs.current.onRoverToggleCamera?.();
      } else if (key === 't') {
        callbackRefs.current.onRoverToggleAutopilot?.();
      } else if (key === 'p') {
        const st = callbackRefs.current.roverSim?.status;
        if (st === 'driving' || st === 'paused') {
          callbackRefs.current.onRoverTogglePause?.();
        }
      } else if (code === 'Escape') {
        callbackRefs.current.onRoverExit?.();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      roverKeysRef.current.delete(e.code);
    };

    const onBlur = () => {
      roverKeysRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      roverKeysRef.current.clear();
    };
  }, [roverSim?.active]);

  const sampleCombinedRoverGroundAt = (
    viewer: Cesium.Viewer | null,
    lat: number,
    lon: number,
    macroSlopeDeg = 0
  ): number => {
    const globeH = viewer
      ? viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat, 0))
      : undefined;
    if (globeH !== undefined && Number.isFinite(globeH)) {
      return globeH + 0.06;
    }
    const demH = getTerrainSurfaceOffsetAt(lat, lon);
    return demH + sampleProceduralMarsReliefM(lat, lon, macroSlopeDeg, true) + 0.06;
  };

  // Helper: 6-wheel contact probing over terrain crests and rough regolith
  const sampleRoverTerrainPose = (lat: number, lon: number, headingDeg: number) => {
    const viewer = viewerRef.current;
    const gridSlope = callbackRefs.current.elevationGrid
      ? evaluateTerrainRisk(callbackRefs.current.elevationGrid, lat, lon).slopeDeg ?? 0
      : 0;

    const hRad = Cesium.Math.toRadians(headingDeg);
    const dLatPerM = (180 / Math.PI) / MARS_EQUATORIAL_RADIUS_M;
    const cosLat = Math.max(0.18, Math.cos(Cesium.Math.toRadians(lat)));
    const dLonPerM = (180 / Math.PI) / (MARS_EQUATORIAL_RADIUS_M * cosLat);

    // Probe at Perseverance scaled wheelbase (±2.05 m track width, +1.95 m front, -2.05 m rear)
    const fwdN = Math.cos(hRad) * dLatPerM;
    const fwdE = Math.sin(hRad) * dLonPerM;
    const rightN = -Math.sin(hRad) * dLatPerM;
    const rightE = Math.cos(hRad) * dLonPerM;

    const probeWheel = (rightM: number, fwdM: number) =>
      sampleCombinedRoverGroundAt(
        viewer,
        lat + fwdM * fwdN + rightM * rightN,
        lon + fwdM * fwdE + rightM * rightE,
        gridSlope
      );

    const hFL = probeWheel(-2.05, 1.95);
    const hFR = probeWheel(2.05, 1.95);
    const hML = probeWheel(-2.05, -0.05);
    const hMR = probeWheel(2.05, -0.05);
    const hRL = probeWheel(-2.05, -2.05);
    const hRR = probeWheel(2.05, -2.05);

    const hFront = (hFL + hFR) * 0.5;
    const hMid = (hML + hMR) * 0.5;
    const hRear = (hRL + hRR) * 0.5;
    const hLeft = (hFL + hML + hRL) / 3;
    const hRight = (hFR + hMR + hRR) / 3;

    // Average plane height + crest hump compensation so mid-axle clears sharp crests
    const crestLift = Math.max(0, hMid - (hFront + hRear) * 0.5) * 0.55;
    const hCenter = (hFront + hMid + hRear) / 3 + crestLift;

    const pitchDeg = Math.max(
      -34,
      Math.min(34, Cesium.Math.toDegrees(Math.atan2(hFront - hRear, 4.0)))
    );
    const rollDeg = Math.max(
      -34,
      Math.min(34, Cesium.Math.toDegrees(Math.atan2(hLeft - hRight, 4.1)))
    );

    const slopeDeg = Math.max(gridSlope, Math.hypot(pitchDeg, rollDeg));
    const wheelHeightsM = [hFL, hFR, hML, hMR, hRL, hRR];

    return { hCenter, pitchDeg, rollDeg, slopeDeg, wheelHeightsM };
  };

  // Helper: compute rover ENU basis, orientation quaternion, and camera placement
  const updateRoverBasisAndCamera = (
    viewer: Cesium.Viewer,
    camMode: RoverCameraMode,
    vehicleId: RoverVehicleId
  ) => {
    const p = roverPhysRef.current;
    const spec = ROVER_VEHICLES[vehicleId];
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(p.worldPos, MARS_ELLIPSOID);
    const hRad = Cesium.Math.toRadians(p.headingDeg);
    const pRad = Cesium.Math.toRadians(p.pitchDeg);
    const rRad = Cesium.Math.toRadians(p.rollDeg);

    const fwdH = new Cesium.Cartesian3(Math.sin(hRad), Math.cos(hRad), 0);
    const right0 = new Cesium.Cartesian3(Math.cos(hRad), -Math.sin(hRad), 0);

    const localFwd = new Cesium.Cartesian3(
      fwdH.x * Math.cos(pRad),
      fwdH.y * Math.cos(pRad),
      Math.sin(pRad)
    );
    const localUp0 = new Cesium.Cartesian3(
      -fwdH.x * Math.sin(pRad),
      -fwdH.y * Math.sin(pRad),
      Math.cos(pRad)
    );
    const localRight = new Cesium.Cartesian3(
      right0.x * Math.cos(rRad) - localUp0.x * Math.sin(rRad),
      right0.y * Math.cos(rRad) - localUp0.y * Math.sin(rRad),
      -localUp0.z * Math.sin(rRad)
    );
    const localUp = new Cesium.Cartesian3(
      localUp0.x * Math.cos(rRad) + right0.x * Math.sin(rRad),
      localUp0.y * Math.cos(rRad) + right0.y * Math.sin(rRad),
      localUp0.z * Math.cos(rRad)
    );

    const rotMat = Cesium.Matrix4.getMatrix3(enu, new Cesium.Matrix3());
    const worldFwd = Cesium.Cartesian3.normalize(
      Cesium.Matrix3.multiplyByVector(rotMat, localFwd, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    const worldRight = Cesium.Cartesian3.normalize(
      Cesium.Matrix3.multiplyByVector(rotMat, localRight, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    const worldUp = Cesium.Cartesian3.normalize(
      Cesium.Matrix3.multiplyByVector(rotMat, localUp, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

    p.basisFwd = worldFwd;
    p.basisRight = worldRight;
    p.basisUp = worldUp;
    p.craftQuat = Cesium.Transforms.headingPitchRollQuaternion(
      p.worldPos,
      new Cesium.HeadingPitchRoll(hRad - Math.PI / 2, pRad, rRad),
      MARS_ELLIPSOID
    );

    if (camMode === 'cabin') {
      const eye = Cesium.Cartesian3.add(
        Cesium.Cartesian3.add(
          p.worldPos,
          Cesium.Cartesian3.multiplyByScalar(worldUp, spec.cabinEyeHeightM, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        Cesium.Cartesian3.multiplyByScalar(worldFwd, 1.8, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const lookFwd = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.add(
          worldFwd,
          Cesium.Cartesian3.multiplyByScalar(worldUp, -0.09, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      );
      viewer.camera.setView({
        destination: eye,
        orientation: { direction: lookFwd, up: worldUp },
      });
    } else if (camMode === 'overhead') {
      const camPos = Cesium.Cartesian3.add(
        Cesium.Cartesian3.add(
          p.worldPos,
          Cesium.Cartesian3.multiplyByScalar(worldUp, 130, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        Cesium.Cartesian3.multiplyByScalar(worldFwd, -45, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const lookTarget = Cesium.Cartesian3.add(
        p.worldPos,
        Cesium.Cartesian3.multiplyByScalar(worldFwd, 25, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const camDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(lookTarget, camPos, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      viewer.camera.setView({
        destination: camPos,
        orientation: { direction: camDir, up: worldFwd },
      });
    } else {
      const backOffset = Cesium.Cartesian3.multiplyByScalar(
        worldFwd,
        -spec.chaseDistanceM,
        new Cesium.Cartesian3()
      );
      const upOffset = Cesium.Cartesian3.multiplyByScalar(
        worldUp,
        spec.chaseHeightM,
        new Cesium.Cartesian3()
      );
      const camPos = Cesium.Cartesian3.add(
        Cesium.Cartesian3.add(p.worldPos, backOffset, new Cesium.Cartesian3()),
        upOffset,
        new Cesium.Cartesian3()
      );

      const camCarto = MARS_ELLIPSOID.cartesianToCartographic(camPos);
      if (camCarto) {
        const camGround = getTerrainSurfaceOffsetAt(
          Cesium.Math.toDegrees(camCarto.latitude),
          Cesium.Math.toDegrees(camCarto.longitude)
        );
        if (camCarto.height < camGround + 4) {
          camCarto.height = camGround + 4;
          MARS_ELLIPSOID.cartographicToCartesian(camCarto, camPos);
        }
      }

      const lookTarget = Cesium.Cartesian3.add(
        p.worldPos,
        Cesium.Cartesian3.multiplyByScalar(worldFwd, 16, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const camDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(lookTarget, camPos, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const levelUp = Cesium.Matrix3.multiplyByVector(rotMat, localUp0, new Cesium.Cartesian3());
      const blendedUp = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.lerp(levelUp, worldUp, 0.35, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      viewer.camera.setView({
        destination: camPos,
        orientation: { direction: camDir, up: blendedUp },
      });
    }
  };

  // Rover Simulator: Initialize route corridor, detailed 3D rover, wheels, dust wake, Lidar, overhead relay, and spawn pose
  useEffect(() => {
    const viewer = viewerRef.current;
    const ds = dataSourceRefs.current?.roverSim;
    if (!viewer || !ds) return;

    if (!roverSim?.active) {
      ds.entities.removeAll();
      if (!flightSim?.active && !satelliteSim?.active) {
        viewer.scene.screenSpaceCameraController.enableInputs = true;
      }
      return;
    }

    // When picking a point on the globe during rover setup, keep free globe mouse control active
    if (roverSim.status === 'setup' && pickMode !== 'inspect') {
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      return;
    }

    ds.entities.removeAll();

    const rawWaypoints: Array<[number, number]> =
      roverSim.route && roverSim.route.waypoints.length >= 2
        ? roverSim.route.waypoints
        : [
            [roverSim.start.lon, roverSim.start.lat],
            [roverSim.destination.lon, roverSim.destination.lat],
          ];

    let totalRouteDistM = 0;
    for (let i = 1; i < rawWaypoints.length; i++) {
      totalRouteDistM += marsDistanceMeters(
        rawWaypoints[i - 1][1],
        rawWaypoints[i - 1][0],
        rawWaypoints[i][1],
        rawWaypoints[i][0]
      );
    }

    const startLat = roverSim.start.lat;
    const startLon = roverSim.start.lon;
    const firstTarget = rawWaypoints[1] || [roverSim.destination.lon, roverSim.destination.lat];
    const startHeading = marsBearingDeg(startLat, startLon, firstTarget[1], firstTarget[0]);
    const pose = sampleRoverTerrainPose(startLat, startLon, startHeading);
    const worldPos = Cesium.Cartesian3.fromDegrees(
      startLon,
      startLat,
      pose.hCenter + 0.04,
      MARS_ELLIPSOID
    );

    const startElevM =
      sampleElevationGrid(callbackRefs.current.elevationGrid, startLat, startLon).elevationM ?? null;
    const destElevM =
      sampleElevationGrid(
        callbackRefs.current.elevationGrid,
        roverSim.destination.lat,
        roverSim.destination.lon
      ).elevationM ?? null;

    const initialOrbPos = Cesium.Cartesian3.fromDegrees(
      startLon - 1.4,
      startLat - 2.2,
      280000,
      MARS_ELLIPSOID
    );

    roverPhysRef.current = {
      lat: startLat,
      lon: startLon,
      groundElevOffsetM: pose.hCenter,
      suspHeaveM: 0,
      suspVelMs: 0,
      suspPitchDeltaRad: 0,
      startElevM,
      destElevM,
      headingDeg: startHeading,
      pitchDeg: pose.pitchDeg,
      rollDeg: pose.rollDeg,
      slopeDeg: pose.slopeDeg,
      speedMs: roverSim.status === 'driving' ? 2.2 : 0,
      throttle: roverSim.status === 'driving' ? 0.65 : 0,
      boosting: false,
      braking: false,
      batteryPct: 100,
      oxygenPct: 100,
      energyUsedKwh: 0,
      wheelSpinRad: 0,
      steerAngleDeg: 0,
      slipPct: 0,
      wheelHeightsM: pose.wheelHeightsM,
      distanceTraveledM: 0,
      totalRouteDistanceM: Math.max(10, totalRouteDistM),
      peakSlopeDeg: pose.slopeDeg,
      waypointIdx: rawWaypoints.length > 1 ? 1 : 0,
      waypoints: rawWaypoints,
      elapsedMs: 0,
      lastHudEmitMs: 0,
      lastWarnSoundMs: 0,
      lastTrackDistM: 0,
      lastDustDistM: 0,
      lastSteepLoggedMs: -10000,
      lastSciPoiLogged: null,
      lastRelayLogged: false,
      satOrbitalPos: initialOrbPos,
      satElevationDeg: 58,
      satPhaseRad: 0.35,
      worldPos,
      trackLeftPts: [worldPos],
      trackRightPts: [worldPos],
      traversedPts: [worldPos],
      dustPts: [],
      transitEvents: [
        {
          timeLabel: '00:00',
          message: `Ready at ${roverSim.start.label || 'Origin'}`,
          kind: 'info',
        },
      ],
      craftQuat: Cesium.Quaternion.IDENTITY.clone(),
      basisRight: new Cesium.Cartesian3(1, 0, 0),
      basisFwd: new Cesium.Cartesian3(0, 1, 0),
      basisUp: new Cesium.Cartesian3(0, 0, 1),
    };

    // Remaining Planned A->B corridor polyline (cyan dashed)
    const corridorPositions = rawWaypoints.map(([lon, lat]) =>
      Cesium.Cartesian3.fromDegrees(
        lon,
        lat,
        getTerrainSurfaceOffsetAt(lat, lon) + 2.1,
        MARS_ELLIPSOID
      )
    );
    ds.entities.add({
      id: 'rover-corridor-line',
      polyline: {
        positions: corridorPositions,
        width: 3.5,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.72),
          dashLength: 14,
        }),
      },
    });

    // Traversed emerald surface corridor wake
    ds.entities.add({
      id: 'rover-corridor-traversed',
      polyline: {
        positions: new Cesium.CallbackProperty(
          () => roverPhysRef.current.traversedPts,
          false
        ) as unknown as Cesium.Property,
        width: 5,
        material: Cesium.Color.fromCssColorString('#22c55e').withAlpha(0.9),
      },
    });

    // Illuminated Waypoint Beacons along route
    const stepStride = Math.max(1, Math.floor(rawWaypoints.length / 10));
    for (let i = stepStride; i < rawWaypoints.length - 1; i += stepStride) {
      const [wLon, wLat] = rawWaypoints[i];
      const wGround = getTerrainSurfaceOffsetAt(wLat, wLon);
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(wLon, wLat, wGround + 3, MARS_ELLIPSOID),
        point: {
          pixelSize: 7,
          color: Cesium.Color.fromCssColorString('#22d3ee'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1.5,
        },
        ellipse: {
          semiMajorAxis: 12,
          semiMinorAxis: 12,
          height: wGround + 1.5,
          material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.14),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.65),
          outlineWidth: 1.5,
        },
      });
    }

    // Start Marker
    const startH = getTerrainSurfaceOffsetAt(roverSim.start.lat, roverSim.start.lon);
    ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        roverSim.start.lon,
        roverSim.start.lat,
        startH + 4,
        MARS_ELLIPSOID
      ),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#22c55e'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `ORIGIN · ${roverSim.start.label || 'Start'}`,
        font: '600 11px "JetBrains Mono", monospace',
        fillColor: Cesium.Color.fromCssColorString('#86efac'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000),
      },
    });

    // Destination Beacon Pole + Ring
    const destH = getTerrainSurfaceOffsetAt(roverSim.destination.lat, roverSim.destination.lon);
    const destGroundPos = Cesium.Cartesian3.fromDegrees(
      roverSim.destination.lon,
      roverSim.destination.lat,
      destH + 2,
      MARS_ELLIPSOID
    );
    const destBeaconTop = Cesium.Cartesian3.fromDegrees(
      roverSim.destination.lon,
      roverSim.destination.lat,
      destH + 95,
      MARS_ELLIPSOID
    );
    ds.entities.add({
      polyline: {
        positions: [destGroundPos, destBeaconTop],
        width: 3,
        material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.85),
      },
      position: destBeaconTop,
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#f59e0b'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `DEST · ${roverSim.destination.label || 'Target'}`,
        font: '600 11px "JetBrains Mono", monospace',
        fillColor: Cesium.Color.fromCssColorString('#fde68a'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
      },
    });
    ds.entities.add({
      position: destGroundPos,
      ellipse: {
        semiMajorAxis: 28,
        semiMinorAxis: 28,
        height: destH + 1.5,
        material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.22),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.9),
        outlineWidth: 2,
      },
    });

    // Dual Regolith Wheel Track Trails
    ds.entities.add({
      id: 'rover-track-left',
      polyline: {
        positions: new Cesium.CallbackProperty(
          () => roverPhysRef.current.trackLeftPts,
          false
        ) as unknown as Cesium.Property,
        width: 3,
        material: Cesium.Color.fromCssColorString('#26130f').withAlpha(0.86),
      },
    });
    ds.entities.add({
      id: 'rover-track-right',
      polyline: {
        positions: new Cesium.CallbackProperty(
          () => roverPhysRef.current.trackRightPts,
          false
        ) as unknown as Cesium.Property,
        width: 3,
        material: Cesium.Color.fromCssColorString('#26130f').withAlpha(0.86),
      },
    });

    // Regolith Wheel Dust Plume Wake behind rear wheels
    ds.entities.add({
      id: 'rover-dust-wake',
      polyline: {
        positions: new Cesium.CallbackProperty(
          () => roverPhysRef.current.dustPts,
          false
        ) as unknown as Cesium.Property,
        width: 5.5,
        material: Cesium.Color.fromCssColorString('#b6755c').withAlpha(0.38),
      },
    });

    // Helper for transforming local rover chassis coordinates (right, forward, up) -> world Cartesian3
    const roverLocalPt = (rx: number, fy: number, uz: number) => {
      const p = roverPhysRef.current;
      const out = Cesium.Cartesian3.clone(p.worldPos);
      Cesium.Cartesian3.add(
        out,
        Cesium.Cartesian3.multiplyByScalar(p.basisRight, rx, new Cesium.Cartesian3()),
        out
      );
      Cesium.Cartesian3.add(
        out,
        Cesium.Cartesian3.multiplyByScalar(p.basisFwd, fy, new Cesium.Cartesian3()),
        out
      );
      Cesium.Cartesian3.add(
        out,
        Cesium.Cartesian3.multiplyByScalar(p.basisUp, uz, new Cesium.Cartesian3()),
        out
      );
      return out;
    };

    // Overhead MRO Relay Satellite + UHF RF Link Beam during Rover Travel
    ds.entities.add({
      id: 'rover-relay-orbiter',
      position: new Cesium.CallbackProperty(
        () => roverPhysRef.current.satOrbitalPos,
        false
      ) as unknown as Cesium.PositionProperty,
      model: settings.showNasaModels
        ? {
            uri: '/api/models/mro.glb',
            minimumPixelSize: 44,
            maximumScale: 16000,
          }
        : undefined,
      point: !settings.showNasaModels
        ? {
            pixelSize: 9,
            color: Cesium.Color.fromCssColorString('#22d3ee'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          }
        : undefined,
      label: {
        text: 'MRO RELAY',
        font: '600 10px "JetBrains Mono", monospace',
        fillColor: Cesium.Color.fromCssColorString('#67e8f9'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2.5,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
      },
    });

    ds.entities.add({
      id: 'rover-relay-beam',
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const p = roverPhysRef.current;
          if (p.satElevationDeg < 8) return [];
          return [roverLocalPt(0, -0.8, 2.9), p.satOrbitalPos];
        }, false) as unknown as Cesium.Property,
        width: 1.8,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#34d399').withAlpha(0.55),
          dashLength: 18,
        }),
      },
    });

    // Player Rover 3D Entity (grounded at wheel plane with rocker-bogie suspension node articulation)
    const roverPosProp = new Cesium.CallbackProperty(
      () => roverPhysRef.current.worldPos,
      false
    ) as unknown as Cesium.PositionProperty;

    const suspTransProp = new Cesium.CallbackProperty(
      () => new Cesium.Cartesian3(0, roverPhysRef.current.suspHeaveM * 0.45, 0),
      false
    ) as unknown as Cesium.Property;

    const bodyPitchProp = new Cesium.CallbackProperty(
      () =>
        Cesium.Quaternion.fromAxisAngle(
          Cesium.Cartesian3.UNIT_X,
          roverPhysRef.current.suspPitchDeltaRad
        ),
      false
    ) as unknown as Cesium.Property;

    ds.entities.add({
      id: 'rover-player-model',
      position: roverPosProp,
      orientation: new Cesium.CallbackProperty(
        () => roverPhysRef.current.craftQuat,
        false
      ) as unknown as Cesium.Property,
      model: {
        uri: '/api/models/perseverance.glb',
        scale: 1.75,
        minimumPixelSize: 82,
        maximumScale: 14,
        nodeTransformations: new Cesium.PropertyBag({
          Body: new Cesium.NodeTransformationProperty({
            translation: suspTransProp,
            rotation: bodyPitchProp,
          }),
          Body_Parts: new Cesium.NodeTransformationProperty({
            translation: suspTransProp,
            rotation: bodyPitchProp,
          }),
          suspension: new Cesium.NodeTransformationProperty({
            translation: new Cesium.CallbackProperty(
              () => new Cesium.Cartesian3(0, roverPhysRef.current.suspHeaveM * 0.25, 0),
              false
            ) as unknown as Cesium.Property,
          }),
        }),
      },
    });

    // 6 Articulated Titanium/Dusty Wheel Tread Assemblies synced to terrain crests, steering, and slip spin
    const wheelSpecs: Array<{
      rightM: number;
      fwdM: number;
      steerMul: number;
      wheelIdx: number;
    }> = [
      { rightM: -2.02, fwdM: 1.92, steerMul: 1, wheelIdx: 0 }, // Front-Left
      { rightM: 2.02, fwdM: 1.92, steerMul: 1, wheelIdx: 1 }, // Front-Right
      { rightM: -2.02, fwdM: -0.05, steerMul: 0, wheelIdx: 2 }, // Mid-Left
      { rightM: 2.02, fwdM: -0.05, steerMul: 0, wheelIdx: 3 }, // Mid-Right
      { rightM: -2.02, fwdM: -2.05, steerMul: -0.65, wheelIdx: 4 }, // Rear-Left
      { rightM: 2.02, fwdM: -2.05, steerMul: -0.65, wheelIdx: 5 }, // Rear-Right
    ];

    wheelSpecs.forEach((ws) => {
      const wheelPolyProp = new Cesium.CallbackProperty(() => {
        const p = roverPhysRef.current;
        const steerRad = Cesium.Math.toRadians(p.steerAngleDeg * ws.steerMul);
        const cosS = Math.cos(steerRad);
        const sinS = Math.sin(steerRad);

        // Steered forward & lateral axes in rover tangent frame
        const steerFwd = Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.add(
            Cesium.Cartesian3.multiplyByScalar(p.basisFwd, cosS, new Cesium.Cartesian3()),
            Cesium.Cartesian3.multiplyByScalar(p.basisRight, sinS, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          ),
          new Cesium.Cartesian3()
        );
        const steerSide = Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.add(
            Cesium.Cartesian3.multiplyByScalar(p.basisRight, cosS, new Cesium.Cartesian3()),
            Cesium.Cartesian3.multiplyByScalar(p.basisFwd, -sinS, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          ),
          new Cesium.Cartesian3()
        );

        // Anchor wheel hub at this individual wheel's terrain contact elevation (+0.48 m wheel radius)
        const wheelGroundH = p.wheelHeightsM[ws.wheelIdx] ?? p.groundElevOffsetM;
        const groundDelta = wheelGroundH - p.groundElevOffsetM;
        const hub = roverLocalPt(ws.rightM, ws.fwdM, groundDelta + 0.48);
        const radiusM = 0.46;
        const halfWidth = 0.21;
        const sideSign = ws.rightM < 0 ? -1 : 1;

        const pts: Cesium.Cartesian3[] = [];
        // 8-segment tire circumference + rotating tread cleat spokes
        const rimSegments = 10;
        for (let k = 0; k <= rimSegments; k++) {
          const ang = p.wheelSpinRad + (k / rimSegments) * Math.PI * 2;
          const cf = Math.cos(ang) * radiusM;
          const cu = Math.sin(ang) * radiusM;
          const pt = Cesium.Cartesian3.clone(hub);
          Cesium.Cartesian3.add(pt, Cesium.Cartesian3.multiplyByScalar(steerFwd, cf, new Cesium.Cartesian3()), pt);
          Cesium.Cartesian3.add(pt, Cesium.Cartesian3.multiplyByScalar(p.basisUp, cu, new Cesium.Cartesian3()), pt);
          Cesium.Cartesian3.add(
            pt,
            Cesium.Cartesian3.multiplyByScalar(steerSide, sideSign * halfWidth, new Cesium.Cartesian3()),
            pt
          );
          pts.push(pt);
        }
        // Rotating cross-cleat spoke passing through hub to show real tire RPM & slip clearly
        for (let s = 0; s < 3; s++) {
          const ang = p.wheelSpinRad + (s * Math.PI) / 3;
          const cf = Math.cos(ang) * radiusM;
          const cu = Math.sin(ang) * radiusM;
          const pA = Cesium.Cartesian3.clone(hub);
          Cesium.Cartesian3.add(pA, Cesium.Cartesian3.multiplyByScalar(steerFwd, cf, new Cesium.Cartesian3()), pA);
          Cesium.Cartesian3.add(pA, Cesium.Cartesian3.multiplyByScalar(p.basisUp, cu, new Cesium.Cartesian3()), pA);
          Cesium.Cartesian3.add(
            pA,
            Cesium.Cartesian3.multiplyByScalar(steerSide, sideSign * halfWidth, new Cesium.Cartesian3()),
            pA
          );
          const pB = Cesium.Cartesian3.clone(hub);
          Cesium.Cartesian3.add(pB, Cesium.Cartesian3.multiplyByScalar(steerFwd, -cf, new Cesium.Cartesian3()), pB);
          Cesium.Cartesian3.add(pB, Cesium.Cartesian3.multiplyByScalar(p.basisUp, -cu, new Cesium.Cartesian3()), pB);
          Cesium.Cartesian3.add(
            pB,
            Cesium.Cartesian3.multiplyByScalar(steerSide, sideSign * halfWidth, new Cesium.Cartesian3()),
            pB
          );
          pts.push(pA, pB, hub);
        }
        return pts;
      }, false) as unknown as Cesium.Property;

      ds.entities.add({
        id: `rover-wheel-${ws.wheelIdx}`,
        polyline: {
          positions: wheelPolyProp,
          width: 2.6,
          material: Cesium.Color.fromCssColorString('#44403c').withAlpha(0.92),
        },
      });
    });

    updateRoverBasisAndCamera(viewer, roverSim.cameraMode, roverSim.vehicleId);

    const destBearing = marsBearingDeg(
      startLat,
      startLon,
      roverSim.destination.lat,
      roverSim.destination.lon
    );
    const destDistM = marsDistanceMeters(
      startLat,
      startLon,
      roverSim.destination.lat,
      roverSim.destination.lon
    );

    callbackRefs.current.onRoverHudUpdate?.({
      lat: startLat,
      lon: startLon,
      elevM: startElevM,
      startElevM,
      destElevM,
      headingDeg: startHeading,
      pitchDeg: pose.pitchDeg,
      rollDeg: pose.rollDeg,
      slopeDeg: pose.slopeDeg,
      speedMs: 0,
      speedKmh: 0,
      avgSpeedKmh: 0,
      throttle: 0,
      boosting: false,
      braking: false,
      driveMode: roverSim.driveMode,
      timeScale: roverSim.timeScale,
      batteryPct: 100,
      oxygenPct: 100,
      energyUsedKwh: 0,
      wheelRpm: 0,
      powerDrawKw: 0.4,
      suspensionCompressionPct: 50,
      slipPct: 0,
      ambientTempC: -62,
      relaySatelliteName: 'MRO Electra UHF',
      relaySignalPct: 86,
      relayElevationDeg: 58,
      distanceTraveledM: 0,
      distanceRemainingM: totalRouteDistM,
      totalRouteDistanceM: totalRouteDistM,
      progressPct: 0,
      etaSeconds: null,
      waypointIdx: rawWaypoints.length > 1 ? 1 : 0,
      totalWaypoints: rawWaypoints.length,
      nextWaypointBearingDeg: startHeading,
      destBearingDeg: destBearing,
      destDistM,
      peakSlopeDeg: pose.slopeDeg,
      steepGradeWarning: pose.slopeDeg >= 12,
      nearbyPoiName: null,
      nearbyPoiDistM: null,
      elapsedMs: 0,
      transitEvents: roverPhysRef.current.transitEvents,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    roverSim?.active,
    roverSim?.vehicleId,
    roverSim?.runNonce,
    roverSim?.start.lat,
    roverSim?.start.lon,
    roverSim?.destination.lat,
    roverSim?.destination.lon,
    roverSim?.route?.id,
    pickMode,
  ]);

  // Rover Simulator: Toggle model visibility on camera mode switch (hide in cabin view)
  useEffect(() => {
    const ds = dataSourceRefs.current?.roverSim;
    const viewer = viewerRef.current;
    if (!ds || !viewer || !roverSim?.active) return;
    const hideInCabin = roverSim.cameraMode === 'cabin';
    const roverEnt = ds.entities.getById('rover-player-model');
    if (roverEnt) roverEnt.show = !hideInCabin;
    for (let wi = 0; wi < 6; wi++) {
      const wEnt = ds.entities.getById(`rover-wheel-${wi}`);
      if (wEnt) wEnt.show = !hideInCabin;
    }
    if (roverSim.status !== 'setup') {
      updateRoverBasisAndCamera(viewer, roverSim.cameraMode, roverSim.vehicleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roverSim?.active, roverSim?.cameraMode, roverSim?.status]);

  // Rover Simulator: 60fps RAF Physics, Autopilot & Camera Loop
  useEffect(() => {
    const viewer = viewerRef.current;
    const ds = dataSourceRefs.current?.roverSim;
    if (!viewer || !ds || !roverSim?.active) return;

    if (roverSim.status === 'setup' && pickMode !== 'inspect') {
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      return;
    }

    viewer.scene.screenSpaceCameraController.enableInputs = false;

    if (roverSim.status !== 'driving') {
      return;
    }

    let rafId = 0;
    let prevTs = performance.now();

    const tick = (now: number) => {
      const sim = callbackRefs.current.roverSim;
      if (!sim?.active || sim.status !== 'driving') return;

      const rawDt = Math.min(0.05, Math.max(0.001, (now - prevTs) / 1000));
      prevTs = now;
      const dt = rawDt * sim.timeScale;

      const spec = ROVER_VEHICLES[sim.vehicleId];
      const p = roverPhysRef.current;
      const keys = roverKeysRef.current;
      const touch = callbackRefs.current.roverTouchRef?.current;

      // Read manual inputs
      let throttleInput = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) throttleInput += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) throttleInput -= 1;
      if (touch) throttleInput += touch.throttle;

      let steerInput = 0;
      if (keys.has('KeyD') || keys.has('ArrowRight')) steerInput += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) steerInput -= 1;
      if (touch) steerInput += touch.steer;

      const braking = keys.has('Space') || Boolean(touch?.brake);
      const boosting = keys.has('ShiftLeft') || keys.has('ShiftRight') || Boolean(touch?.boost);
      p.braking = braking;
      p.boosting = boosting && !braking;

      // Advance waypoints if close
      while (p.waypointIdx < p.waypoints.length - 1) {
        const [wLon, wLat] = p.waypoints[p.waypointIdx];
        const dWp = marsDistanceMeters(p.lat, p.lon, wLat, wLon);
        if (dWp < 32) {
          p.waypointIdx += 1;
          playRoverCue('waypoint', sim.muted);
        } else {
          break;
        }
      }

      const activeWp = p.waypoints[p.waypointIdx] || [sim.destination.lon, sim.destination.lat];
      const nextWpBearing = marsBearingDeg(p.lat, p.lon, activeWp[1], activeWp[0]);
      const destDistM = marsDistanceMeters(
        p.lat,
        p.lon,
        sim.destination.lat,
        sim.destination.lon
      );
      const destBearing = marsBearingDeg(
        p.lat,
        p.lon,
        sim.destination.lat,
        sim.destination.lon
      );

      // Autopilot vs Manual steering & speed control
      let targetSpeedMs = 0;
      if (braking) {
        targetSpeedMs = 0;
      } else if (sim.driveMode === 'autopilot') {
        const headingErr = ((((nextWpBearing - p.headingDeg + 180) % 360) + 360) % 360) - 180;
        const maxSteerStep = spec.turnRateDegS * dt;
        const steerDelta = Math.max(-maxSteerStep, Math.min(maxSteerStep, headingErr * 2.2 * dt * 10));
        p.headingDeg = (p.headingDeg + steerDelta + 360) % 360;

        // Govern speed smoothly around sharp turns & steep terrain
        const turnFactor = Math.max(0.45, 1 - Math.abs(headingErr) / 110);
        const slopeFactor = p.slopeDeg > 14 ? 0.58 : p.slopeDeg > 9 ? 0.78 : 1.0;
        const approachFactor = destDistM < 85 ? Math.max(0.35, destDistM / 85) : 1.0;
        const baseCruise = boosting ? spec.boostSpeedMs : spec.cruiseSpeedMs;
        targetSpeedMs = baseCruise * turnFactor * slopeFactor * approachFactor;
        p.throttle = targetSpeedMs / spec.maxSpeedMs;
      } else {
        // Manual steering
        if (steerInput !== 0) {
          const speedFactor = Math.abs(p.speedMs) > 0.3 ? (p.speedMs >= 0 ? 1 : -1) : 0.7;
          p.headingDeg = (p.headingDeg + steerInput * spec.turnRateDegS * speedFactor * rawDt + 360) % 360;
        }
        if (throttleInput > 0) {
          targetSpeedMs = (boosting ? spec.boostSpeedMs : spec.maxSpeedMs) * Math.min(1, throttleInput);
        } else if (throttleInput < 0) {
          targetSpeedMs = -spec.reverseSpeedMs * Math.min(1, Math.abs(throttleInput));
        } else {
          targetSpeedMs = 0;
        }
        p.throttle = throttleInput;
      }

      // Mars 0.38g longitudinal slope & crest traction physics
      const G_MARS = 3.721;
      const prevSpeedMs = p.speedMs;
      const pitchRad = Cesium.Math.toRadians(p.pitchDeg);
      // Uphill resists (-g*sin(pitch)), downhill accelerates over crest lips
      const gradeGravityAccel = -G_MARS * Math.sin(pitchRad);
      const slopeDragFactor = Math.max(0.45, 1 - Math.max(0, p.pitchDeg) / 36);
      const governedTargetMs = braking ? 0 : targetSpeedMs * slopeDragFactor;

      const accelRate = braking ? 10.5 : 4.0;
      p.speedMs +=
        (governedTargetMs - p.speedMs) * (1 - Math.exp(-accelRate * Math.min(0.25, dt))) +
        gradeGravityAccel * 0.28 * Math.min(0.25, dt);

      if (braking && Math.abs(p.speedMs) < 0.08) p.speedMs = 0;

      // Loose Martian regolith traction & crest wheel-slip model
      const slipRatio =
        Math.abs(p.speedMs) > 0.25
          ? Math.min(
              0.42,
              Math.max(0.02, (Math.max(0, p.slopeDeg) / 28) * 0.26 + (p.boosting ? 0.09 : 0))
            )
          : 0;
      p.slipPct = slipRatio * 100;

      // Integrate surface coordinates & realistic wheel rotation (churns faster during crest slip)
      const stepDistM = p.speedMs * dt;
      const wheelRadiusM = 0.46;
      p.wheelSpinRad =
        (p.wheelSpinRad + (stepDistM * (1 + slipRatio * 1.45)) / wheelRadiusM) % (Math.PI * 2);

      const targetSteerDeg =
        sim.driveMode === 'autopilot'
          ? Math.max(
              -28,
              Math.min(
                28,
                ((((nextWpBearing - p.headingDeg + 180) % 360) + 360) % 360 - 180) * 0.7
              )
            )
          : steerInput * 26;
      p.steerAngleDeg += (targetSteerDeg - p.steerAngleDeg) * (1 - Math.exp(-8 * rawDt));

      const hRad = Cesium.Math.toRadians(p.headingDeg);
      const dNorthM = stepDistM * Math.cos(hRad);
      const dEastM = stepDistM * Math.sin(hRad);

      p.lat = Math.max(
        -84,
        Math.min(84, p.lat + (dNorthM / MARS_EQUATORIAL_RADIUS_M) * (180 / Math.PI))
      );
      const cosLat = Math.max(0.18, Math.cos(Cesium.Math.toRadians(p.lat)));
      let nextLon = p.lon + (dEastM / (MARS_EQUATORIAL_RADIUS_M * cosLat)) * (180 / Math.PI);
      if (nextLon > 180) nextLon -= 360;
      if (nextLon < -180) nextLon += 360;
      p.lon = nextLon;

      p.distanceTraveledM += Math.abs(stepDistM);
      p.elapsedMs += rawDt * 1000;

      // 6-wheel terrain probing + Spring-Damper Rocker-Bogie Suspension dynamics
      const prevGroundH = p.groundElevOffsetM;
      const pose = sampleRoverTerrainPose(p.lat, p.lon, p.headingDeg);
      const terrainVertDelta = pose.hCenter - prevGroundH;
      p.groundElevOffsetM = pose.hCenter;
      p.wheelHeightsM = pose.wheelHeightsM;

      // Excite suspension velocity when wheels hit terrain crests or rapid dips
      const physDt = Math.min(0.04, rawDt);
      p.suspVelMs -= terrainVertDelta * 22;
      const springAccel = -56 * p.suspHeaveM - 11.5 * p.suspVelMs;
      p.suspVelMs += springAccel * physDt;
      p.suspHeaveM = Math.max(-0.22, Math.min(0.24, p.suspHeaveM + p.suspVelMs * physDt));

      // Subtle longitudinal chassis squat/dive during acceleration/braking
      const longAccel = (p.speedMs - prevSpeedMs) / Math.max(0.008, rawDt);
      const targetSuspPitchRad = Math.max(-0.07, Math.min(0.07, -longAccel * 0.012));
      p.suspPitchDeltaRad += (targetSuspPitchRad - p.suspPitchDeltaRad) * (1 - Math.exp(-8 * rawDt));

      p.pitchDeg = p.pitchDeg + (pose.pitchDeg - p.pitchDeg) * (1 - Math.exp(-10 * rawDt));
      p.rollDeg = p.rollDeg + (pose.rollDeg - p.rollDeg) * (1 - Math.exp(-10 * rawDt));
      p.slopeDeg = pose.slopeDeg;
      if (pose.slopeDeg > p.peakSlopeDeg) p.peakSlopeDeg = pose.slopeDeg;

      p.worldPos = Cesium.Cartesian3.fromDegrees(
        p.lon,
        p.lat,
        p.groundElevOffsetM + p.suspHeaveM + 0.04,
        MARS_ELLIPSOID
      );

      // Overhead MRO Relay Satellite traveling across horizon
      p.satPhaseRad += dt * 0.012;
      const satLat = p.lat + Math.sin(p.satPhaseRad) * 6.5;
      const satLon = p.lon + Math.cos(p.satPhaseRad) * 4.2;
      p.satOrbitalPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, 280000, MARS_ELLIPSOID);
      const satGroundDist = Math.max(1000, marsDistanceMeters(p.lat, p.lon, satLat, satLon));
      p.satElevationDeg = Math.max(
        4,
        Math.min(89, Cesium.Math.toDegrees(Math.atan2(280000, satGroundDist)))
      );

      // Update local basis & camera
      updateRoverBasisAndCamera(viewer, sim.cameraMode, sim.vehicleId);

      // Helper for grounded track/dust contact points at wheel base
      const groundedSidePt = (rightOffsetM: number, fwdOffsetM: number, groundH: number, liftM: number) => {
        const pt = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, groundH + liftM, MARS_ELLIPSOID);
        Cesium.Cartesian3.add(
          pt,
          Cesium.Cartesian3.multiplyByScalar(p.basisRight, rightOffsetM, new Cesium.Cartesian3()),
          pt
        );
        Cesium.Cartesian3.add(
          pt,
          Cesium.Cartesian3.multiplyByScalar(p.basisFwd, fwdOffsetM, new Cesium.Cartesian3()),
          pt
        );
        return pt;
      };

      // Lay ground-clamped dual wheel tracks & traversed wake every ~2 m
      if (p.distanceTraveledM - p.lastTrackDistM >= 2.0) {
        p.lastTrackDistM = p.distanceTraveledM;
        const hTrackL = p.wheelHeightsM[2] ?? p.groundElevOffsetM;
        const hTrackR = p.wheelHeightsM[3] ?? p.groundElevOffsetM;
        const leftPt = groundedSidePt(-2.02, -0.4, hTrackL, 0.09);
        const rightPt = groundedSidePt(2.02, -0.4, hTrackR, 0.09);
        p.trackLeftPts.push(leftPt);
        p.trackRightPts.push(rightPt);
        p.traversedPts.push(
          Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.groundElevOffsetM + 0.14, MARS_ELLIPSOID)
        );
        if (p.trackLeftPts.length > 520) p.trackLeftPts.shift();
        if (p.trackRightPts.length > 520) p.trackRightPts.shift();
        if (p.traversedPts.length > 520) p.traversedPts.shift();
      }

      // Regolith dust plume kicked up behind rear wheels proportional to speed & slip
      if (Math.abs(p.speedMs) > 0.9 && p.distanceTraveledM - p.lastDustDistM >= 1.6) {
        p.lastDustDistM = p.distanceTraveledM;
        const hRearAvg = ((p.wheelHeightsM[4] ?? p.groundElevOffsetM) + (p.wheelHeightsM[5] ?? p.groundElevOffsetM)) * 0.5;
        const rearWake = groundedSidePt(
          (Math.sin(p.wheelSpinRad) * 0.8),
          -2.75,
          hRearAvg,
          0.25 + (p.slipPct / 100) * 0.6
        );
        p.dustPts.push(rearWake);
        if (p.dustPts.length > 16) p.dustPts.shift();
      } else if (Math.abs(p.speedMs) < 0.7 && p.dustPts.length > 0) {
        p.dustPts.shift();
      }

      // Chassis power (kW), actual rotating wheel RPM, suspension compression %, slip & ambient temp
      const wheelRpm = (Math.abs(p.speedMs) * (1 + slipRatio) * 60) / (2 * Math.PI * wheelRadiusM);
      const gradeFactor = 1 + Math.max(0, p.pitchDeg) / 14;
      const powerDrawKw =
        0.45 +
        (Math.abs(p.speedMs) / Math.max(1, spec.maxSpeedMs)) *
          6.8 *
          gradeFactor *
          (p.boosting ? 1.55 : 1.0);
      p.energyUsedKwh += (powerDrawKw * dt) / 3600;
      const powerDrawPerSec =
        (Math.abs(p.speedMs) / Math.max(1, spec.maxSpeedMs)) *
        0.045 *
        gradeFactor *
        (p.boosting ? 1.7 : 1.0);
      p.batteryPct = Math.max(5, Math.min(100, p.batteryPct - (powerDrawPerSec - 0.008) * dt));
      p.oxygenPct = Math.max(15, p.oxygenPct - 0.0045 * dt);

      const slipPct = p.slipPct;
      const suspensionCompressionPct = Math.max(
        15,
        Math.min(
          96,
          50 - p.suspHeaveM * 120 + p.pitchDeg * 0.9 + Math.abs(p.rollDeg) * 0.7
        )
      );
      const ambientTempC = -62 + Math.sin(p.elapsedMs * 0.0002) * 4;
      const avgSpeedKmh =
        p.elapsedMs > 500
          ? (p.distanceTraveledM / ((p.elapsedMs / 1000) * sim.timeScale)) * 3.6
          : 0;
      const relaySignalPct =
        p.satElevationDeg >= 8 ? Math.min(99, Math.max(24, 30 + p.satElevationDeg * 0.9)) : 0;

      const steepGradeWarning = p.slopeDeg >= 14;
      if (steepGradeWarning && now - p.lastWarnSoundMs > 2200) {
        p.lastWarnSoundMs = now;
        playRoverCue('warn', sim.muted);
      }
      if (steepGradeWarning && p.elapsedMs - p.lastSteepLoggedMs > 12000) {
        p.lastSteepLoggedMs = p.elapsedMs;
        p.transitEvents = [
          {
            timeLabel: formatRoverDuration(p.elapsedMs),
            message: `Steep grade ${p.slopeDeg.toFixed(1)}° · Traction control active`,
            kind: 'warn' as const,
          },
          ...p.transitEvents,
        ].slice(0, 8);
      }

      if (relaySignalPct > 65 && !p.lastRelayLogged) {
        p.lastRelayLogged = true;
        p.transitEvents = [
          {
            timeLabel: formatRoverDuration(p.elapsedMs),
            message: 'MRO UHF orbital relay locked',
            kind: 'relay' as const,
          },
          ...p.transitEvents,
        ].slice(0, 8);
      }

      // Check Arrival at Destination (< 24 m)
      const newDestDistM = marsDistanceMeters(
        p.lat,
        p.lon,
        sim.destination.lat,
        sim.destination.lon
      );
      if (newDestDistM <= 24) {
        p.speedMs = 0;
        playRoverCue('arrived', sim.muted);
        const arrivedEvents: RoverTransitEvent[] = [
          {
            timeLabel: formatRoverDuration(p.elapsedMs),
            message: `Arrived at ${sim.destination.label || 'Destination'}`,
            kind: 'info' as const,
          },
          ...p.transitEvents,
        ].slice(0, 8);
        callbackRefs.current.onRoverHudUpdate?.({
          lat: p.lat,
          lon: p.lon,
          elevM:
            sampleElevationGrid(callbackRefs.current.elevationGrid, p.lat, p.lon).elevationM ??
            null,
          startElevM: p.startElevM,
          destElevM: p.destElevM,
          headingDeg: p.headingDeg,
          pitchDeg: p.pitchDeg,
          rollDeg: p.rollDeg,
          slopeDeg: p.slopeDeg,
          speedMs: 0,
          speedKmh: 0,
          avgSpeedKmh,
          throttle: 0,
          boosting: false,
          braking: true,
          driveMode: sim.driveMode,
          timeScale: sim.timeScale,
          batteryPct: p.batteryPct,
          oxygenPct: p.oxygenPct,
          energyUsedKwh: p.energyUsedKwh,
          wheelRpm: 0,
          powerDrawKw: 0.4,
          suspensionCompressionPct,
          slipPct: 0,
          ambientTempC,
          relaySatelliteName: relaySignalPct > 0 ? 'MRO Electra UHF' : null,
          relaySignalPct,
          relayElevationDeg: p.satElevationDeg,
          distanceTraveledM: p.distanceTraveledM,
          distanceRemainingM: 0,
          totalRouteDistanceM: p.totalRouteDistanceM,
          progressPct: 100,
          etaSeconds: 0,
          waypointIdx: p.waypoints.length - 1,
          totalWaypoints: p.waypoints.length,
          nextWaypointBearingDeg: null,
          destBearingDeg: destBearing,
          destDistM: 0,
          peakSlopeDeg: p.peakSlopeDeg,
          steepGradeWarning: false,
          nearbyPoiName: null,
          nearbyPoiDistM: null,
          elapsedMs: p.elapsedMs,
          transitEvents: arrivedEvents,
        });
        callbackRefs.current.onRoverStatusChange?.('arrived');
        return;
      }

      // Throttled HUD snapshot update (~18 Hz)
      if (now - p.lastHudEmitMs >= 55) {
        p.lastHudEmitMs = now;
        const elevM =
          sampleElevationGrid(callbackRefs.current.elevationGrid, p.lat, p.lon).elevationM ?? null;

        // Find nearest scientific POI within 600 m
        let nearbyPoiName: string | null = null;
        let nearbyPoiDistM: number | null = null;
        for (const poi of SCIENTIFIC_POIS) {
          const d = marsDistanceMeters(p.lat, p.lon, poi.lat, poi.lon);
          if (d <= 600 && (nearbyPoiDistM === null || d < nearbyPoiDistM)) {
            nearbyPoiName = poi.name;
            nearbyPoiDistM = d;
          }
        }
        if (nearbyPoiName && p.lastSciPoiLogged !== nearbyPoiName) {
          p.lastSciPoiLogged = nearbyPoiName;
          p.transitEvents = [
            {
              timeLabel: formatRoverDuration(p.elapsedMs),
              message: `Passing ${nearbyPoiName}`,
              kind: 'science' as const,
            },
            ...p.transitEvents,
          ].slice(0, 8);
        }

        // Compute remaining route distance from rover through remaining waypoints
        let remDistM = marsDistanceMeters(p.lat, p.lon, activeWp[1], activeWp[0]);
        for (let i = p.waypointIdx; i < p.waypoints.length - 1; i++) {
          remDistM += marsDistanceMeters(
            p.waypoints[i][1],
            p.waypoints[i][0],
            p.waypoints[i + 1][1],
            p.waypoints[i + 1][0]
          );
        }

        const progressPct = Math.max(
          0,
          Math.min(99, (1 - remDistM / Math.max(1, p.totalRouteDistanceM)) * 100)
        );
        const etaSeconds =
          Math.abs(p.speedMs) > 0.3
            ? remDistM / (Math.abs(p.speedMs) * sim.timeScale)
            : null;

        callbackRefs.current.onRoverHudUpdate?.({
          lat: p.lat,
          lon: p.lon,
          elevM,
          startElevM: p.startElevM,
          destElevM: p.destElevM,
          headingDeg: p.headingDeg,
          pitchDeg: p.pitchDeg,
          rollDeg: p.rollDeg,
          slopeDeg: p.slopeDeg,
          speedMs: p.speedMs,
          speedKmh: Math.abs(p.speedMs) * 3.6,
          avgSpeedKmh,
          throttle: p.throttle,
          boosting: p.boosting,
          braking: p.braking,
          driveMode: sim.driveMode,
          timeScale: sim.timeScale,
          batteryPct: p.batteryPct,
          oxygenPct: p.oxygenPct,
          energyUsedKwh: p.energyUsedKwh,
          wheelRpm,
          powerDrawKw,
          suspensionCompressionPct,
          slipPct,
          ambientTempC,
          relaySatelliteName: relaySignalPct > 0 ? 'MRO Electra UHF' : null,
          relaySignalPct,
          relayElevationDeg: p.satElevationDeg,
          distanceTraveledM: p.distanceTraveledM,
          distanceRemainingM: remDistM,
          totalRouteDistanceM: p.totalRouteDistanceM,
          progressPct,
          etaSeconds,
          waypointIdx: p.waypointIdx,
          totalWaypoints: p.waypoints.length,
          nextWaypointBearingDeg: nextWpBearing,
          destBearingDeg: destBearing,
          destDistM: newDestDistM,
          peakSlopeDeg: p.peakSlopeDeg,
          steepGradeWarning,
          nearbyPoiName,
          nearbyPoiDistM,
          elapsedMs: p.elapsedMs,
          transitEvents: p.transitEvents,
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [roverSim?.active, roverSim?.status, pickMode]);

  // Satellite Transit Simulator: Keyboard shortcuts
  useEffect(() => {
    if (!satelliteSim?.active) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 'c') {
        callbackRefs.current.onSatelliteToggleCamera?.();
      } else if (key === 'p' || e.code === 'Space') {
        const st = callbackRefs.current.satelliteSim?.status;
        if (st === 'orbiting' || st === 'paused') {
          e.preventDefault();
          callbackRefs.current.onSatelliteTogglePause?.();
        }
      } else if (e.code === 'Escape') {
        callbackRefs.current.onSatelliteExit?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [satelliteSim?.active]);

  // Helper: evaluate satellite slerp position, ground nadir point, swath corners, and camera
  const evaluateSatFrame = (
    viewer: Cesium.Viewer,
    craftId: SatelliteCraftId,
    camMode: SatelliteCameraMode,
    progress: number
  ) => {
    const spec = SATELLITE_CRAFTS[craftId];
    const p = satPhysRef.current;
    const altM = spec.altitudeKm * 1000;
    const orbitRadius = MARS_EQUATORIAL_RADIUS_M + altM;

    const slerpUnit = (u0: Cesium.Cartesian3, u1: Cesium.Cartesian3, t: number) => {
      const clampedT = Math.max(0, Math.min(1, t));
      const lerped = Cesium.Cartesian3.lerp(u0, u1, clampedT, new Cesium.Cartesian3());
      return Cesium.Cartesian3.normalize(lerped, new Cesium.Cartesian3());
    };

    const uCur = slerpUnit(p.startUnit, p.destUnit, progress);
    const uNext = slerpUnit(p.startUnit, p.destUnit, Math.min(1, progress + 0.004));
    const uPrev = slerpUnit(p.startUnit, p.destUnit, Math.max(0, progress - 0.004));

    const worldPos = Cesium.Cartesian3.multiplyByScalar(uCur, orbitRadius, new Cesium.Cartesian3());
    const nadirPos = Cesium.Cartesian3.multiplyByScalar(
      uCur,
      MARS_EQUATORIAL_RADIUS_M + 800,
      new Cesium.Cartesian3()
    );

    const curCarto = MARS_ELLIPSOID.cartesianToCartographic(nadirPos);
    const nextCarto = MARS_ELLIPSOID.cartesianToCartographic(
      Cesium.Cartesian3.multiplyByScalar(uNext, MARS_EQUATORIAL_RADIUS_M + 800, new Cesium.Cartesian3())
    );
    const prevCarto = MARS_ELLIPSOID.cartesianToCartographic(
      Cesium.Cartesian3.multiplyByScalar(uPrev, MARS_EQUATORIAL_RADIUS_M + 800, new Cesium.Cartesian3())
    );

    const subLat = curCarto ? Cesium.Math.toDegrees(curCarto.latitude) : 0;
    const subLon = curCarto ? Cesium.Math.toDegrees(curCarto.longitude) : 0;
    const fwdHdg =
      progress < 0.996 && curCarto && nextCarto
        ? marsBearingDeg(
            Cesium.Math.toDegrees(curCarto.latitude),
            Cesium.Math.toDegrees(curCarto.longitude),
            Cesium.Math.toDegrees(nextCarto.latitude),
            Cesium.Math.toDegrees(nextCarto.longitude)
          )
        : prevCarto && curCarto
        ? marsBearingDeg(
            Cesium.Math.toDegrees(prevCarto.latitude),
            Cesium.Math.toDegrees(prevCarto.longitude),
            Cesium.Math.toDegrees(curCarto.latitude),
            Cesium.Math.toDegrees(curCarto.longitude)
          )
        : p.headingDeg;

    p.subLat = subLat;
    p.subLon = subLon;
    p.headingDeg = fwdHdg;
    p.worldPos = worldPos;
    p.nadirPos = nadirPos;

    // Local satellite orbital frame
    const worldUp = Cesium.Cartesian3.clone(uCur);
    const rawVel = Cesium.Cartesian3.subtract(uNext, uPrev, new Cesium.Cartesian3());
    const worldFwd =
      Cesium.Cartesian3.magnitudeSquared(rawVel) > 1e-12
        ? Cesium.Cartesian3.normalize(rawVel, new Cesium.Cartesian3())
        : Cesium.Cartesian3.clone(p.basisFwd);
    const worldRight = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(worldFwd, worldUp, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    p.basisUp = worldUp;
    p.basisFwd = worldFwd;
    p.basisRight = worldRight;

    p.craftQuat = Cesium.Transforms.headingPitchRollQuaternion(
      worldPos,
      new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(fwdHdg) - Math.PI / 2, 0, 0),
      MARS_ELLIPSOID
    );

    // 4-corner swath scanning footprint on Mars surface below
    const halfSwathM = Math.max(45000, spec.swathWidthKm * 1800);
    const cornerAt = (rx: number, fy: number) => {
      const pt = Cesium.Cartesian3.clone(nadirPos);
      Cesium.Cartesian3.add(
        pt,
        Cesium.Cartesian3.multiplyByScalar(worldRight, rx, new Cesium.Cartesian3()),
        pt
      );
      Cesium.Cartesian3.add(
        pt,
        Cesium.Cartesian3.multiplyByScalar(worldFwd, fy, new Cesium.Cartesian3()),
        pt
      );
      const unit = Cesium.Cartesian3.normalize(pt, new Cesium.Cartesian3());
      return Cesium.Cartesian3.multiplyByScalar(unit, MARS_EQUATORIAL_RADIUS_M + 1200, new Cesium.Cartesian3());
    };
    const c0 = cornerAt(-halfSwathM, halfSwathM);
    const c1 = cornerAt(halfSwathM, halfSwathM);
    const c2 = cornerAt(halfSwathM, -halfSwathM);
    const c3 = cornerAt(-halfSwathM, -halfSwathM);
    p.beamCorner0 = c0;
    p.beamCorner1 = c1;
    p.beamCorner2 = c2;
    p.beamCorner3 = c3;
    p.footprintPts = [c0, c1, c2, c3];

    // Completed & remaining arc polylines
    const compPts: Cesium.Cartesian3[] = [];
    const compSteps = 32;
    for (let i = 0; i <= compSteps; i++) {
      const u = slerpUnit(p.startUnit, p.destUnit, (progress * i) / compSteps);
      compPts.push(Cesium.Cartesian3.multiplyByScalar(u, orbitRadius, new Cesium.Cartesian3()));
    }
    p.orbitCompletedPts = compPts;

    const remPts: Cesium.Cartesian3[] = [];
    const remSteps = 32;
    for (let i = 0; i <= remSteps; i++) {
      const t = progress + ((1 - progress) * i) / remSteps;
      const u = slerpUnit(p.startUnit, p.destUnit, t);
      remPts.push(Cesium.Cartesian3.multiplyByScalar(u, orbitRadius, new Cesium.Cartesian3()));
    }
    p.orbitRemainingPts = remPts;

    // Camera tracking modes
    if (camMode === 'nadir') {
      const camPos = Cesium.Cartesian3.add(
        worldPos,
        Cesium.Cartesian3.multiplyByScalar(worldUp, -4500, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const downDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.negate(worldUp, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      viewer.camera.setView({
        destination: camPos,
        orientation: { direction: downDir, up: worldFwd },
      });
    } else if (camMode === 'horizon') {
      const camPos = Cesium.Cartesian3.add(
        Cesium.Cartesian3.add(
          worldPos,
          Cesium.Cartesian3.multiplyByScalar(worldRight, 260000, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        Cesium.Cartesian3.multiplyByScalar(worldUp, 75000, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const lookDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(nadirPos, camPos, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      viewer.camera.setView({
        destination: camPos,
        orientation: { direction: lookDir, up: worldUp },
      });
    } else {
      const camPos = Cesium.Cartesian3.add(
        Cesium.Cartesian3.add(
          worldPos,
          Cesium.Cartesian3.multiplyByScalar(worldFwd, -125000, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        Cesium.Cartesian3.multiplyByScalar(worldUp, 52000, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const lookTarget = Cesium.Cartesian3.add(
        nadirPos,
        Cesium.Cartesian3.multiplyByScalar(worldFwd, 180000, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const lookDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(lookTarget, camPos, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      viewer.camera.setView({
        destination: camPos,
        orientation: { direction: lookDir, up: worldUp },
      });
    }
  };

  // Satellite Transit Simulator: Initialize A->B orbital arc, swath pyramid, surface beacons & 3D orbiter
  useEffect(() => {
    const viewer = viewerRef.current;
    const ds = dataSourceRefs.current?.satSim;
    if (!viewer || !ds) return;

    if (!satelliteSim?.active) {
      ds.entities.removeAll();
      if (!flightSim?.active && !roverSim?.active) {
        viewer.scene.screenSpaceCameraController.enableInputs = true;
      }
      return;
    }

    if (satelliteSim.status === 'setup' && pickMode !== 'inspect') {
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      return;
    }

    ds.entities.removeAll();

    const spec = SATELLITE_CRAFTS[satelliteSim.craftId];
    const pStart = Cesium.Cartesian3.fromDegrees(
      satelliteSim.start.lon,
      satelliteSim.start.lat,
      MARS_EQUATORIAL_RADIUS_M,
      MARS_ELLIPSOID
    );
    const pDest = Cesium.Cartesian3.fromDegrees(
      satelliteSim.destination.lon,
      satelliteSim.destination.lat,
      MARS_EQUATORIAL_RADIUS_M,
      MARS_ELLIPSOID
    );
    const u0 = Cesium.Cartesian3.normalize(pStart, new Cesium.Cartesian3());
    const u1 = Cesium.Cartesian3.normalize(pDest, new Cesium.Cartesian3());
    const distM = marsDistanceMeters(
      satelliteSim.start.lat,
      satelliteSim.start.lon,
      satelliteSim.destination.lat,
      satelliteSim.destination.lon
    );
    const totalKm = Math.max(50, distM / 1000);
    const groundSpeedKmS =
      spec.orbitalSpeedKmS *
      (MARS_EQUATORIAL_RADIUS_M / (MARS_EQUATORIAL_RADIUS_M + spec.altitudeKm * 1000));

    // Precompute full surface ground track
    const gTrack: Cesium.Cartesian3[] = [];
    for (let i = 0; i <= 48; i++) {
      const u = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.lerp(u0, u1, i / 48, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      gTrack.push(
        Cesium.Cartesian3.multiplyByScalar(u, MARS_EQUATORIAL_RADIUS_M + 1600, new Cesium.Cartesian3())
      );
    }

    satPhysRef.current = {
      ...satPhysRef.current,
      startUnit: u0,
      destUnit: u1,
      totalArcRad: distM / MARS_EQUATORIAL_RADIUS_M,
      totalDistanceKm: totalKm,
      progress: 0,
      altitudeKm: spec.altitudeKm,
      orbitalSpeedKmS: spec.orbitalSpeedKmS,
      groundSpeedKmS,
      scansCaptured: 0,
      lastScanProgress: 0,
      elapsedMs: 0,
      lastHudEmitMs: 0,
      lastRelayLogged: null,
      groundTrackPts: gTrack,
      relayTargetName: null,
      relayTargetDistKm: null,
      transitEvents: [
        {
          timeLabel: '00:00',
          message: `Tasked ${spec.shortName}: ${satelliteSim.start.label || 'Origin'} → ${
            satelliteSim.destination.label || 'Target'
          }`,
          kind: 'info',
        },
      ],
    };

    evaluateSatFrame(viewer, satelliteSim.craftId, satelliteSim.cameraMode, 0);

    // Completed & remaining orbital trajectories
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(
          () => satPhysRef.current.orbitCompletedPts,
          false
        ) as unknown as Cesium.Property,
        width: 4.5,
        material: Cesium.Color.fromCssColorString('#34d399').withAlpha(0.95),
      },
    });
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(
          () => satPhysRef.current.orbitRemainingPts,
          false
        ) as unknown as Cesium.Property,
        width: 2.5,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.85),
          dashLength: 18,
        }),
      },
    });

    // Sub-satellite surface ground track
    ds.entities.add({
      polyline: {
        positions: gTrack,
        width: 2.2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.65),
          dashLength: 14,
        }),
      },
    });

    // Nadir laser beam + 4-beam swath scanning pyramid + surface scan polygon
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const p = satPhysRef.current;
          return [p.worldPos, p.nadirPos];
        }, false) as unknown as Cesium.Property,
        width: 1.8,
        material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.6),
      },
    });
    [0, 1, 2, 3].forEach((ci) => {
      ds.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const p = satPhysRef.current;
            const corner =
              ci === 0
                ? p.beamCorner0
                : ci === 1
                ? p.beamCorner1
                : ci === 2
                ? p.beamCorner2
                : p.beamCorner3;
            return [p.worldPos, corner];
          }, false) as unknown as Cesium.Property,
          width: 1.3,
          material: Cesium.Color.fromCssColorString(spec.accentColor).withAlpha(0.45),
        },
      });
    });
    ds.entities.add({
      polygon: {
        hierarchy: new Cesium.CallbackProperty(
          () => new Cesium.PolygonHierarchy(satPhysRef.current.footprintPts),
          false
        ) as unknown as Cesium.Property,
        material: Cesium.Color.fromCssColorString(spec.accentColor).withAlpha(0.18),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(spec.accentColor).withAlpha(0.85),
        outlineWidth: 2,
        perPositionHeight: true,
      },
    });

    // Dynamic RF link beam to surface rovers/stations when within horizon
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const p = satPhysRef.current;
          if (!p.relayTargetName) return [];
          return [p.worldPos, p.relayTargetPos];
        }, false) as unknown as Cesium.Property,
        width: 2.2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#10b981').withAlpha(0.9),
          dashLength: 16,
        }),
      },
    });

    // Entry (A) & Target (B) orbital pass pillars
    ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        satelliteSim.start.lon,
        satelliteSim.start.lat,
        1500,
        MARS_ELLIPSOID
      ),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#22c55e'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `ENTRY · ${satelliteSim.start.label || 'Origin'}`,
        font: '600 11px "JetBrains Mono", monospace',
        fillColor: Cesium.Color.fromCssColorString('#86efac'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
      },
    });
    const satDestBase = Cesium.Cartesian3.fromDegrees(
      satelliteSim.destination.lon,
      satelliteSim.destination.lat,
      1500,
      MARS_ELLIPSOID
    );
    const satDestOrb = Cesium.Cartesian3.fromDegrees(
      satelliteSim.destination.lon,
      satelliteSim.destination.lat,
      spec.altitudeKm * 1000,
      MARS_ELLIPSOID
    );
    ds.entities.add({
      polyline: {
        positions: [satDestBase, satDestOrb],
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.75),
          dashLength: 14,
        }),
      },
      position: satDestBase,
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#f59e0b'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `TARGET · ${satelliteSim.destination.label || 'Destination'}`,
        font: '600 11px "JetBrains Mono", monospace',
        fillColor: Cesium.Color.fromCssColorString('#fde68a'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
      },
    });

    // 3D NASA Satellite Model
    ds.entities.add({
      id: 'sat-player-model',
      position: new Cesium.CallbackProperty(
        () => satPhysRef.current.worldPos,
        false
      ) as unknown as Cesium.PositionProperty,
      orientation: new Cesium.CallbackProperty(
        () => satPhysRef.current.craftQuat,
        false
      ) as unknown as Cesium.Property,
      model: {
        uri: spec.modelUri,
        minimumPixelSize: 80,
        maximumScale: 42000,
      },
    });

    const destBrg0 = marsBearingDeg(
      satelliteSim.start.lat,
      satelliteSim.start.lon,
      satelliteSim.destination.lat,
      satelliteSim.destination.lon
    );
    callbackRefs.current.onSatelliteHudUpdate?.({
      subLat: satelliteSim.start.lat,
      subLon: satelliteSim.start.lon,
      altitudeKm: spec.altitudeKm,
      orbitalSpeedKmS: spec.orbitalSpeedKmS,
      groundSpeedKmS,
      headingDeg: satPhysRef.current.headingDeg,
      solarPowerW: spec.solarPeakW,
      sunlit: true,
      downlinkMbps: spec.downlinkPeakMbps,
      swathWidthKm: spec.swathWidthKm,
      scansCaptured: 0,
      overflownRegion: satelliteSim.start.label || 'Mars Entry Zone',
      activeRelayTarget: null,
      activeRelayDistKm: null,
      distanceTraveledKm: 0,
      distanceRemainingKm: totalKm,
      totalDistanceKm: totalKm,
      progressPct: 0,
      etaSeconds: null,
      destBearingDeg: destBrg0,
      timeScale: satelliteSim.timeScale,
      elapsedMs: 0,
      surfaceElevM:
        sampleElevationGrid(
          callbackRefs.current.elevationGrid,
          satelliteSim.start.lat,
          satelliteSim.start.lon
        ).elevationM ?? null,
      transitEvents: satPhysRef.current.transitEvents,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    satelliteSim?.active,
    satelliteSim?.craftId,
    satelliteSim?.runNonce,
    satelliteSim?.start.lat,
    satelliteSim?.start.lon,
    satelliteSim?.destination.lat,
    satelliteSim?.destination.lon,
    pickMode,
  ]);

  // Satellite Transit Simulator: Update camera immediately on view toggle
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !satelliteSim?.active || satelliteSim.status === 'setup') return;
    evaluateSatFrame(viewer, satelliteSim.craftId, satelliteSim.cameraMode, satPhysRef.current.progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satelliteSim?.active, satelliteSim?.cameraMode, satelliteSim?.status]);

  // Satellite Transit Simulator: 60fps Orbital Kinematics & Scan Loop
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !satelliteSim?.active) return;

    if (satelliteSim.status === 'setup' && pickMode !== 'inspect') {
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      return;
    }

    viewer.scene.screenSpaceCameraController.enableInputs = false;

    if (satelliteSim.status !== 'orbiting') {
      return;
    }

    let rafId = 0;
    let prevTs = performance.now();

    const tick = (now: number) => {
      const sim = callbackRefs.current.satelliteSim;
      if (!sim?.active || sim.status !== 'orbiting') return;

      const rawDt = Math.min(0.05, Math.max(0.001, (now - prevTs) / 1000));
      prevTs = now;
      const spec = SATELLITE_CRAFTS[sim.craftId];
      const p = satPhysRef.current;

      const dtSimSec = rawDt * sim.timeScale;
      const stepKm = p.groundSpeedKmS * dtSimSec;
      const dProgress = stepKm / Math.max(10, p.totalDistanceKm);
      p.progress = Math.min(1, p.progress + dProgress);
      p.elapsedMs += rawDt * 1000;

      evaluateSatFrame(viewer, sim.craftId, sim.cameraMode, p.progress);

      // Capture swath frames periodically along pass
      if (p.progress - p.lastScanProgress >= 0.08) {
        p.lastScanProgress = p.progress;
        p.scansCaptured += 1;
        playSatCue('scan', sim.muted);
      }

      // Check nearest surface station / rover within 950 km RF horizon
      let relayName: string | null = null;
      let relayDistKm: number | null = null;
      let relayLat = p.subLat;
      let relayLon = p.subLon;
      const surfaceAssets = callbackRefs.current.settings
        ? [
            { name: 'Perseverance (Jezero)', lat: 18.4446, lon: 77.4509 },
            { name: 'Curiosity (Gale)', lat: -4.5895, lon: 137.4417 },
            { name: 'InSight (Elysium)', lat: 4.5024, lon: 135.6234 },
            { name: 'Zhurong (Utopia)', lat: 25.102, lon: 109.914 },
            { name: 'Opportunity (Meridiani)', lat: -1.9483, lon: -5.5258 },
          ]
        : [];

      for (const a of surfaceAssets) {
        const dKm = marsDistanceMeters(p.subLat, p.subLon, a.lat, a.lon) / 1000;
        if (dKm <= 950 && (relayDistKm === null || dKm < relayDistKm)) {
          relayName = a.name;
          relayDistKm = dKm;
          relayLat = a.lat;
          relayLon = a.lon;
        }
      }

      p.relayTargetName = relayName;
      p.relayTargetDistKm = relayDistKm;
      if (relayName) {
        p.relayTargetPos = Cesium.Cartesian3.fromDegrees(relayLon, relayLat, 600, MARS_ELLIPSOID);
        if (p.lastRelayLogged !== relayName) {
          p.lastRelayLogged = relayName;
          playSatCue('relay', sim.muted);
          p.transitEvents = [
            {
              timeLabel: formatSatDuration(p.elapsedMs),
              message: `UHF Link: ${relayName}`,
              kind: 'relay' as const,
            },
            ...p.transitEvents,
          ].slice(0, 8);
        }
      }

      // Closest named region currently overflown
      let regionLabel = `${p.subLat.toFixed(1)}°, ${p.subLon.toFixed(1)}°`;
      let minLocKm = Infinity;
      for (const loc of MARS_LOCATIONS) {
        const dKm = marsDistanceMeters(p.subLat, p.subLon, loc.lat, loc.lon) / 1000;
        if (dKm < minLocKm) {
          minLocKm = dKm;
          regionLabel = dKm < 650 ? loc.name : `Near ${loc.name}`;
        }
      }

      const sunlit = Math.cos(Cesium.Math.toRadians(p.subLon + 30)) > -0.35;
      const solarPowerW = sunlit ? Math.round(spec.solarPeakW * (0.85 + 0.15 * Math.cos(p.progress * Math.PI))) : 0;
      const downlinkMbps = Number(
        (spec.downlinkPeakMbps * (relayName ? 1.0 : 0.72)).toFixed(2)
      );
      const distTraveledKm = p.progress * p.totalDistanceKm;
      const distRemainingKm = Math.max(0, (1 - p.progress) * p.totalDistanceKm);
      const destBearing = marsBearingDeg(
        p.subLat,
        p.subLon,
        sim.destination.lat,
        sim.destination.lon
      );

      if (p.progress >= 0.998) {
        playSatCue('arrived', sim.muted);
        const finalEvents: SatelliteTransitEvent[] = [
          {
            timeLabel: formatSatDuration(p.elapsedMs),
            message: `Target acquired: ${sim.destination.label || 'Destination'}`,
            kind: 'scan' as const,
          },
          ...p.transitEvents,
        ].slice(0, 8);
        callbackRefs.current.onSatelliteHudUpdate?.({
          subLat: p.subLat,
          subLon: p.subLon,
          altitudeKm: spec.altitudeKm,
          orbitalSpeedKmS: spec.orbitalSpeedKmS,
          groundSpeedKmS: p.groundSpeedKmS,
          headingDeg: p.headingDeg,
          solarPowerW,
          sunlit,
          downlinkMbps,
          swathWidthKm: spec.swathWidthKm,
          scansCaptured: p.scansCaptured + 1,
          overflownRegion: sim.destination.label || regionLabel,
          activeRelayTarget: relayName,
          activeRelayDistKm: relayDistKm,
          distanceTraveledKm: p.totalDistanceKm,
          distanceRemainingKm: 0,
          totalDistanceKm: p.totalDistanceKm,
          progressPct: 100,
          etaSeconds: 0,
          destBearingDeg: destBearing,
          timeScale: sim.timeScale,
          elapsedMs: p.elapsedMs,
          surfaceElevM:
            sampleElevationGrid(callbackRefs.current.elevationGrid, p.subLat, p.subLon).elevationM ??
            null,
          transitEvents: finalEvents,
        });
        callbackRefs.current.onSatelliteStatusChange?.('arrived');
        return;
      }

      if (now - p.lastHudEmitMs >= 55) {
        p.lastHudEmitMs = now;
        const etaSeconds = distRemainingKm / Math.max(0.1, p.groundSpeedKmS * sim.timeScale);
        callbackRefs.current.onSatelliteHudUpdate?.({
          subLat: p.subLat,
          subLon: p.subLon,
          altitudeKm: spec.altitudeKm,
          orbitalSpeedKmS: spec.orbitalSpeedKmS,
          groundSpeedKmS: p.groundSpeedKmS,
          headingDeg: p.headingDeg,
          solarPowerW,
          sunlit,
          downlinkMbps,
          swathWidthKm: spec.swathWidthKm,
          scansCaptured: p.scansCaptured,
          overflownRegion: regionLabel,
          activeRelayTarget: relayName,
          activeRelayDistKm: relayDistKm,
          distanceTraveledKm: distTraveledKm,
          distanceRemainingKm: distRemainingKm,
          totalDistanceKm: p.totalDistanceKm,
          progressPct: p.progress * 100,
          etaSeconds,
          destBearingDeg: destBearing,
          timeScale: sim.timeScale,
          elapsedMs: p.elapsedMs,
          surfaceElevM:
            sampleElevationGrid(callbackRefs.current.elevationGrid, p.subLat, p.subLon).elevationM ??
            null,
          transitEvents: p.transitEvents,
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [satelliteSim?.active, satelliteSim?.status, pickMode]);

  const cursorFormatted = cursorCoord
    ? formatMarsCoords(
        cursorCoord.lat,
        cursorCoord.lon,
        settings.coordinateFormat,
        settings.longitudeConvention
      )
    : null;

  const handleZoom = (factor: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const carto = MARS_ELLIPSOID.cartesianToCartographic(viewer.camera.positionWC);
    const h = carto ? Math.max(300, carto.height) : 100000;
    if (factor > 0) {
      viewer.camera.zoomIn(h * 0.45);
    } else {
      viewer.camera.zoomOut(Math.min(12000000, h * 0.65));
    }
  };

  const handleResetNorth = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: viewer.camera.positionWC,
      orientation: {
        heading: 0,
        pitch: viewer.camera.pitch,
        roll: 0,
      },
      duration: 0.6,
    });
  };

  const handleToggle3dView = () => {
    const viewer = viewerRef.current;
    onToggle3dTerrain?.();
    if (!viewer) return;
    const currentlyTilted = cameraPitchDeg > -75;
    viewer.camera.flyTo({
      destination: viewer.camera.positionWC,
      orientation: {
        heading: viewer.camera.heading,
        pitch: Cesium.Math.toRadians(currentlyTilted ? -90 : -45),
        roll: 0,
      },
      duration: 0.7,
    });
  };

  const handleFlyJezeroSurface = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(77.392, 18.42, 7500, MARS_ELLIPSOID),
      orientation: {
        heading: Cesium.Math.toRadians(-12),
        pitch: Cesium.Math.toRadians(-35),
        roll: 0,
      },
      duration: 1.6,
    });
  };

  const activeBasemapLabel = layerStates['mola_color_relief']?.enabled
    ? 'MOLA Elev'
    : layerStates['mola_hrsc_color']?.enabled
    ? 'HRSC Color'
    : layerStates['mola_hrsc_shade']?.enabled
    ? 'HRSC Shade'
    : layerStates['themis_day_ir']?.enabled
    ? 'THEMIS IR'
    : layerStates['jezero_hirise']?.enabled
    ? 'Viking + HiRISE'
    : 'Viking Color';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#030406]">
      <div
        ref={containerRef}
        className={`h-full w-full ${pickMode !== 'inspect' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
      />

      {splitCompareLayerId && !flightSim?.active && !roverSim?.active && !satelliteSim?.active && (
        <div
          className="pointer-events-auto absolute inset-y-0 z-10 w-0.5 bg-amber-400"
          style={{ left: `${splitPos * 100}%` }}
        >
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.01}
            value={splitPos}
            onChange={(e) => setSplitPos(parseFloat(e.target.value))}
            aria-label="Layer comparison split slider"
            className="absolute top-1/2 -left-16 w-32 -translate-y-1/2 cursor-ew-resize accent-amber-400"
          />
        </div>
      )}

      {pickMode !== 'inspect' && !flightSim?.active && (
        <div className="pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2 rounded-md border border-amber-500/60 bg-[#0B0F17]/95 px-4 py-1.5 text-xs font-medium text-amber-200 shadow-xl">
          Click anywhere on Mars to lock{' '}
          <span className="font-semibold text-amber-400">
            {pickMode === 'start' ? 'Starting Point' : 'Destination'}
          </span>
        </div>
      )}

      {/* Bottom-Left Tactical Surface Layer Switcher */}
      {!flightSim?.active && !roverSim?.active && !satelliteSim?.active && (
        <div className="absolute bottom-10 left-3 z-20">
          {basemapMenuOpen && (
            <div className="mb-2 w-56 rounded-lg border border-amber-500/25 bg-[#0B0F17]/95 p-2 text-xs text-slate-200 shadow-2xl">
              <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
                Surface Basemap Sensor
              </div>
              {(
                [
                  ['viking_mdim21', 'Viking Color + HiRISE', '232m / 25cm'],
                  ['mola_color_relief', 'MOLA Shaded Elevation', '463m/px'],
                  ['mola_hrsc_color', 'HRSC/MOLA Color Relief', '200m/px'],
                  ['mola_hrsc_shade', 'HRSC/MOLA Hillshade', '200m/px'],
                  ['themis_day_ir', 'THEMIS Day Infrared', '100m/px'],
                ] as const
              ).map(([id, title, res]) => {
                const active = Boolean(layerStates[id]?.enabled);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onSelectBasemap?.(id);
                      setBasemapMenuOpen(false);
                    }}
                    className={`mt-1 flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left transition-colors ${
                      active ? 'bg-amber-500/20 text-amber-300' : 'hover:bg-white/10'
                    }`}
                  >
                    <span className="font-medium">{title}</span>
                    <span className="font-mono text-[10px] opacity-70">{res}</span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => setBasemapMenuOpen((v) => !v)}
            className="group relative flex h-12 w-12 items-end justify-center overflow-hidden rounded-lg border border-amber-500/40 bg-[#0B0F17] shadow-xl transition-transform hover:scale-105 hover:border-amber-400"
            title={`Switch Mars Basemap (${activeBasemapLabel})`}
          >
            <div
              className="absolute inset-0 opacity-90"
              style={{
                background:
                  'radial-gradient(circle at 30% 35%, #d97736 0%, #9a3412 45%, #3f1d14 100%)',
              }}
            />
            <Layers className="relative z-10 mb-3 h-4 w-4 text-white/90 drop-shadow" />
            <span className="relative z-10 w-full bg-black/80 py-0.5 text-center text-[9px] font-medium text-amber-200 truncate px-0.5">
              {activeBasemapLabel.split(' ')[0]}
            </span>
          </button>
        </div>
      )}

      {/* Bottom-Right Survival Navigation Cluster (Jezero Recon, North Compass, 3D/2D, Zoom -/+) */}
      {!flightSim?.active && !roverSim?.active && !satelliteSim?.active && (
        <div className="absolute bottom-10 right-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={handleFlyJezeroSurface}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-amber-500/30 bg-[#0B0F17]/95 text-amber-400 shadow-lg transition-colors hover:border-amber-400 hover:text-amber-300"
            title="Fly to Jezero Crater 3D Surface View (Perseverance & Delta)"
          >
            <Navigation className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleToggle3dView}
            className={`flex h-9 w-9 items-center justify-center rounded-md border text-[11px] font-bold shadow-lg transition-colors ${
              settings.enable3dTerrain
                ? 'border-amber-500/60 bg-[#0B0F17]/95 text-amber-300 hover:border-amber-400'
                : 'border-slate-700 bg-[#0B0F17]/95 text-slate-400 hover:border-slate-500 hover:text-white'
            }`}
            title="Toggle 3D Terrain & Tilted Perspective"
          >
            3D
          </button>

          <button
            type="button"
            onClick={handleResetNorth}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700/80 bg-[#0B0F17]/95 text-slate-200 shadow-lg transition-colors hover:border-amber-500/50"
            title="Reset Camera Heading to North"
          >
            <div
              className="transition-transform duration-150"
              style={{ transform: `rotate(${-cameraHeadingDeg}deg)` }}
            >
              <Compass className="h-4 w-4 text-rose-400" />
            </div>
          </button>

          <div className="flex h-9 items-center overflow-hidden rounded-md border border-slate-700/80 bg-[#0B0F17]/95 shadow-lg">
            <button
              type="button"
              onClick={() => handleZoom(-1)}
              className="flex h-full w-9 items-center justify-center text-slate-200 hover:bg-white/10"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="h-4 w-px bg-slate-700" />
            <button
              type="button"
              onClick={() => handleZoom(1)}
              className="flex h-full w-9 items-center justify-center text-slate-200 hover:bg-white/10"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Very Bottom Survival Datum + Dynamic Scale Bar + Live Telemetry Strip */}
      {!flightSim?.active && !roverSim?.active && !satelliteSim?.active && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex h-7 items-center justify-between border-t border-amber-500/20 bg-[#080B11]/95 px-3 text-[11px] text-slate-300 select-none">
          <div className="flex items-center gap-3">
            <span className="font-display font-semibold tracking-wide text-amber-300">
              SURVIVAL DATUM · NASA / USGS
            </span>
            <button
              type="button"
              onClick={() => onOpenSettings?.()}
              className="underline decoration-amber-500/40 hover:text-white"
            >
              Calibration & attribution
            </button>
          </div>

          <div className="flex items-center gap-4 font-mono text-[11px] tabular-nums">
            {/* Metric Bracket Scale Bar */}
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-slate-200">
              <span>{scaleBar.label}</span>
              <div
                className="h-1.5 border-x border-b border-amber-400/80"
                style={{ width: `${scaleBar.widthPx}px` }}
              />
            </div>

            <span className="text-slate-200">
              ALT: {cameraAltKm >= 100 ? Math.round(cameraAltKm).toLocaleString() : cameraAltKm.toFixed(1)} km
            </span>

            {cursorFormatted ? (
              <span className="hidden md:inline text-cyan-300">
                {cursorFormatted.latStr} {cursorFormatted.lonStr}
                {cursorCoord?.elevM !== null && cursorCoord?.elevM !== undefined
                  ? ` · ${cursorCoord.elevM.toFixed(0)} m`
                  : ''}
              </span>
            ) : (
              <span className="hidden md:inline text-slate-400">Mars 2000 Planetocentric</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

