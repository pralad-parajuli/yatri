import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppSettings,
  ElevationProfilePoint,
  FlightCameraMode,
  FlightCraftId,
  FlightHudTelemetry,
  FlightStatus,
  FlightTouchInput,
  JezeroElevationGrid,
  LayerLoadStatus,
  LayerRuntimeState,
  MarsCoordinate,
  MarsLocation,
  MissionTelemetry,
  PlannedRoute,
  RouteMode,
  RouteWeights,
  RoverCameraMode,
  RoverDriveMode,
  RoverHudTelemetry,
  RoverSimStatus,
  RoverTouchInput,
  RoverVehicleId,
  SatelliteCameraMode,
  SatelliteCraftId,
  SatelliteHudTelemetry,
  SatelliteSimStatus,
  ScientificPoi,
} from './types/mars';
import { MARS_LAYERS } from './data/layers';
import { MARS_LOCATIONS } from './data/locations';
import { MARS_MISSIONS } from './data/missions';
import {
  ENVIRONMENTAL_RECORDS,
  GEOLOGICAL_FEATURES,
  SCIENTIFIC_POIS,
} from './data/geologyAndEnvironment';
import { FLIGHT_COURSES } from './data/flightCourses';
import { ROVER_EXPEDITIONS } from './data/roverMissions';
import { SATELLITE_CRAFTS, SATELLITE_PASS_PRESETS } from './data/satelliteMissions';
import { fetchJezeroElevationGrid, fetchMissionTelemetry } from './services/marsApi';
import { getPresetWeights, planTerrainAwareRoute } from './analysis/pathfinding';
import { marsBearingDeg, marsDistanceMeters, sphericalMidpoint } from './utils/coordinates';
import TopNav from './components/TopNav';
import LeftSidebar, { LeftTab } from './components/LeftSidebar';
import MarsGlobe from './components/MarsGlobe';
import RightSidebar from './components/RightSidebar';
import BottomPanel from './components/BottomPanel';
import DataLegend from './components/DataLegend';
import SettingsModal from './components/SettingsModal';
import ReportModal from './components/ReportModal';
import FlightSimulatorHUD from './components/FlightSimulatorHUD';
import RoverSimulatorHUD from './components/RoverSimulatorHUD';
import SatelliteSimulatorHUD from './components/SatelliteSimulatorHUD';
import MarsGallery from './components/MarsGallery';

const DEFAULT_SETTINGS: AppSettings = {
  coordinateFormat: 'decimal',
  longitudeConvention: 'signed',
  slopeWarningDeg: 6,
  slopeDangerDeg: 15,
  showGraticule: false,
  enable3dTerrain: true,
  showNasaModels: true,
};

const ROUTE_COLORS: Record<RouteMode, string> = {
  low_difficulty: '#22c55e',
  avoid_slopes: '#06b6d4',
  avoid_hazards: '#f59e0b',
  visit_science: '#a855f7',
  shortest: '#f97316',
};

const BASEMAP_LAYER_IDS = [
  'viking_mdim21',
  'mola_color_relief',
  'mola_hrsc_color',
  'mola_hrsc_shade',
  'themis_day_ir',
] as const;

interface CameraHistoryEntry {
  lat: number;
  lon: number;
  altitudeM: number;
  pitchDeg?: number;
}

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('mars_explorer_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [savedLocations, setSavedLocations] = useState<MarsCoordinate[]>(() => {
    try {
      const saved = localStorage.getItem('mars_explorer_saved_locations');
      return saved
        ? JSON.parse(saved)
        : [
            { lat: 18.444627, lon: 77.450886, label: 'Octavia E. Butler Landing' },
            { lat: 18.4638, lon: 77.3822, label: 'Wildcat Ridge (Delta Front)' },
          ];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('mars_explorer_settings', JSON.stringify(settings));
    } catch {
      // ignore storage quota errors
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem('mars_explorer_saved_locations', JSON.stringify(savedLocations));
    } catch {
      // ignore storage quota errors
    }
  }, [savedLocations]);

  // Layer states
  const [layerStates, setLayerStates] = useState<Record<string, LayerRuntimeState>>(() => {
    const init: Record<string, LayerRuntimeState> = {};
    MARS_LAYERS.forEach((l) => {
      init[l.id] = {
        enabled: l.defaultEnabled,
        opacity: l.defaultOpacity,
        status: l.defaultEnabled ? 'ready' : 'idle',
      };
    });
    return init;
  });
  const [splitCompareLayerId, setSplitCompareLayerId] = useState<string | null>(null);

  // Mission visibility & telemetry
  const [activeMissionId, setActiveMissionId] = useState<string>('perseverance');
  const [visibleMissionIds, setVisibleMissionIds] = useState<string[]>(() =>
    MARS_MISSIONS.map((m) => m.id)
  );
  const [missionTelemetry, setMissionTelemetry] = useState<Record<string, MissionTelemetry>>({});
  const [loadingTelemetry, setLoadingTelemetry] = useState<Record<string, boolean>>({});
  const [telemetryErrors, setTelemetryErrors] = useState<Record<string, string>>({});

  // Elevation grid & UI state
  const [elevationGrid, setElevationGrid] = useState<JezeroElevationGrid | null>(null);
  const [showPois, setShowPois] = useState(true);
  const [leftTab, setLeftTab] = useState<LeftTab>('layers');
  const [selectedCoord, setSelectedCoord] = useState<MarsCoordinate | null>({
    lat: 18.444627,
    lon: 77.450886,
    label: 'Octavia E. Butler Landing Site',
  });
  const [selectedLocation, setSelectedLocation] = useState<MarsLocation | null>(
    () => MARS_LOCATIONS.find((l) => l.id === 'butler_landing') || null
  );
  const [selectedPoi, setSelectedPoi] = useState<ScientificPoi | null>(null);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [flyToRequest, setFlyToRequest] = useState<{
    lat: number;
    lon: number;
    altitudeM: number;
    pitchDeg?: number;
    nonce: number;
  } | null>(null);

  // Camera history stack (Google Earth Back/Forward toolbar arrows)
  const [camHistory, setCamHistory] = useState<CameraHistoryEntry[]>([
    { lat: 18.45, lon: 77.42, altitudeM: 9600000 },
  ]);
  const [camHistIdx, setCamHistIdx] = useState(0);

  // Routing state (unassigned by default so Jezero is not forced as destination)
  const [routeStart, setRouteStart] = useState<MarsCoordinate | null>(null);
  const [routeDest, setRouteDest] = useState<MarsCoordinate | null>(null);
  const [routeMode, setRouteMode] = useState<RouteMode>('low_difficulty');
  const [routeWeights, setRouteWeights] = useState<RouteWeights>(() =>
    getPresetWeights('low_difficulty')
  );
  const [pickMode, setPickMode] = useState<'inspect' | 'start' | 'destination'>('inspect');
  const [routes, setRoutes] = useState<PlannedRoute[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [hoveredProfilePoint, setHoveredProfilePoint] = useState<ElevationProfilePoint | null>(null);

  // Google Earth Floating Drawers & Docks (unobstructed globe on landing)
  const [showSettings, setShowSettings] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [bottomDockOpen, setBottomDockOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // Mars Flight Simulator State
  const [flightActive, setFlightActive] = useState(false);
  const [flightCourseId, setFlightCourseId] = useState<string>('jezero_delta_run');
  const [flightCraftId, setFlightCraftId] = useState<FlightCraftId>('ingenuity_scout');
  const [flightCameraMode, setFlightCameraMode] = useState<FlightCameraMode>('chase');
  const [flightStatus, setFlightStatus] = useState<FlightStatus>('menu');
  const [flightInvertPitch, setFlightInvertPitch] = useState(false);
  const [flightMuted, setFlightMuted] = useState(false);
  const [flightRunNonce, setFlightRunNonce] = useState(0);
  const [flightHud, setFlightHud] = useState<FlightHudTelemetry>({
    lat: 18.4446,
    lon: 77.4509,
    aglM: 135,
    molaElevM: -2570,
    speedMs: 48,
    speedKmh: 173,
    verticalSpeedMs: 0,
    headingDeg: 270,
    pitchDeg: 0,
    rollDeg: 0,
    throttle: 0.55,
    boosting: false,
    elapsedMs: 0,
    peakSpeedKmh: 173,
    lowTerrainWarning: false,
  });
  const flightTouchRef = useRef<FlightTouchInput>({
    pitch: 0,
    yaw: 0,
    throttleDelta: 0,
    boost: false,
  });

  // Astronaut Rover Simulator State
  const defaultRoverPreset = ROVER_EXPEDITIONS[0];
  const [roverActive, setRoverActive] = useState(false);
  const [roverVehicleId, setRoverVehicleId] = useState<RoverVehicleId>(
    defaultRoverPreset.recommendedVehicle
  );
  const [roverCameraMode, setRoverCameraMode] = useState<RoverCameraMode>('chase');
  const [roverStatus, setRoverStatus] = useState<RoverSimStatus>('setup');
  const [roverDriveMode, setRoverDriveMode] = useState<RoverDriveMode>('autopilot');
  const [roverTimeScale, setRoverTimeScale] = useState<1 | 5 | 20>(1);
  const [roverMuted, setRoverMuted] = useState(false);
  const [roverRunNonce, setRoverRunNonce] = useState(0);
  const [roverStart, setRoverStart] = useState<MarsCoordinate>(defaultRoverPreset.start);
  const [roverDest, setRoverDest] = useState<MarsCoordinate>(defaultRoverPreset.destination);
  const [roverRouteMode, setRoverRouteMode] = useState<RouteMode>(defaultRoverPreset.routeMode);
  const [roverPlannedRoute, setRoverPlannedRoute] = useState<PlannedRoute | null>(null);
  const [roverPickTarget, setRoverPickTarget] = useState<'start' | 'destination' | null>(null);
  const roverTouchRef = useRef<RoverTouchInput>({
    throttle: 0,
    steer: 0,
    brake: false,
    boost: false,
  });
  const [roverHud, setRoverHud] = useState<RoverHudTelemetry>(() => {
    const initialDistM = marsDistanceMeters(
      defaultRoverPreset.start.lat,
      defaultRoverPreset.start.lon,
      defaultRoverPreset.destination.lat,
      defaultRoverPreset.destination.lon
    );
    const initialBrg = marsBearingDeg(
      defaultRoverPreset.start.lat,
      defaultRoverPreset.start.lon,
      defaultRoverPreset.destination.lat,
      defaultRoverPreset.destination.lon
    );
    return {
      lat: defaultRoverPreset.start.lat,
      lon: defaultRoverPreset.start.lon,
      elevM: -2570,
      startElevM: null,
      destElevM: null,
      headingDeg: initialBrg,
      pitchDeg: 0,
      rollDeg: 0,
      slopeDeg: 0,
      speedMs: 0,
      speedKmh: 0,
      avgSpeedKmh: 0,
      throttle: 0,
      boosting: false,
      braking: false,
      driveMode: 'autopilot',
      timeScale: 1,
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
      distanceRemainingM: initialDistM,
      totalRouteDistanceM: initialDistM,
      progressPct: 0,
      etaSeconds: null,
      waypointIdx: 0,
      totalWaypoints: 2,
      nextWaypointBearingDeg: initialBrg,
      destBearingDeg: initialBrg,
      destDistM: initialDistM,
      peakSlopeDeg: 0,
      steepGradeWarning: false,
      nearbyPoiName: null,
      nearbyPoiDistM: null,
      elapsedMs: 0,
      transitEvents: [],
    };
  });

  // Satellite Orbital Transit Simulator State
  const defaultSatPreset = SATELLITE_PASS_PRESETS[0];
  const [satelliteActive, setSatelliteActive] = useState(false);
  const [satelliteCraftId, setSatelliteCraftId] = useState<SatelliteCraftId>(
    defaultSatPreset.recommendedCraft
  );
  const [satelliteCameraMode, setSatelliteCameraMode] = useState<SatelliteCameraMode>('chase');
  const [satelliteStatus, setSatelliteStatus] = useState<SatelliteSimStatus>('setup');
  const [satelliteTimeScale, setSatelliteTimeScale] = useState<1 | 10 | 50 | 200>(50);
  const [satelliteMuted, setSatelliteMuted] = useState(false);
  const [satelliteRunNonce, setSatelliteRunNonce] = useState(0);
  const [satelliteStart, setSatelliteStart] = useState<MarsCoordinate>(defaultSatPreset.start);
  const [satelliteDest, setSatelliteDest] = useState<MarsCoordinate>(
    defaultSatPreset.destination
  );
  const [satellitePickTarget, setSatellitePickTarget] = useState<'start' | 'destination' | null>(
    null
  );
  const [satelliteHud, setSatelliteHud] = useState<SatelliteHudTelemetry>(() => {
    const distKm =
      marsDistanceMeters(
        defaultSatPreset.start.lat,
        defaultSatPreset.start.lon,
        defaultSatPreset.destination.lat,
        defaultSatPreset.destination.lon
      ) / 1000;
    const brg = marsBearingDeg(
      defaultSatPreset.start.lat,
      defaultSatPreset.start.lon,
      defaultSatPreset.destination.lat,
      defaultSatPreset.destination.lon
    );
    const craft = SATELLITE_CRAFTS[defaultSatPreset.recommendedCraft];
    return {
      subLat: defaultSatPreset.start.lat,
      subLon: defaultSatPreset.start.lon,
      altitudeKm: craft.altitudeKm,
      orbitalSpeedKmS: craft.orbitalSpeedKmS,
      groundSpeedKmS: Number(((craft.orbitalSpeedKmS * 3396.19) / (3396.19 + craft.altitudeKm)).toFixed(2)),
      headingDeg: brg,
      solarPowerW: Math.round(craft.solarPeakW * 0.92),
      sunlit: true,
      downlinkMbps: craft.downlinkPeakMbps,
      swathWidthKm: craft.swathWidthKm,
      scansCaptured: 0,
      overflownRegion: defaultSatPreset.start.label || 'Syrtis Major / Jezero',
      activeRelayTarget: null,
      activeRelayDistKm: null,
      distanceTraveledKm: 0,
      distanceRemainingKm: distKm,
      totalDistanceKm: distKm,
      progressPct: 0,
      etaSeconds: distKm / Math.max(0.5, craft.orbitalSpeedKmS),
      destBearingDeg: brg,
      timeScale: 50,
      elapsedMs: 0,
      surfaceElevM: null,
      transitEvents: [],
    };
  });

  // Load Jezero Elevation Grid + Historical NASA MMGIS Telemetry progressively
  useEffect(() => {
    let cancelled = false;
    fetchJezeroElevationGrid()
      .then((grid) => {
        if (cancelled) return;
        setElevationGrid(grid);
      })
      .catch((err) => {
        console.error('Failed to load Jezero elevation grid:', err);
      });

    (['perseverance', 'curiosity'] as const).forEach((mId) => {
      setLoadingTelemetry((prev) => ({ ...prev, [mId]: true }));
      fetchMissionTelemetry(mId)
        .then((tel) => {
          if (cancelled) return;
          setMissionTelemetry((prev) => ({ ...prev, [mId]: tel }));
        })
        .catch((err) => {
          if (cancelled) return;
          setTelemetryErrors((prev) => ({
            ...prev,
            [mId]: err instanceof Error ? err.message : 'Unavailable',
          }));
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingTelemetry((prev) => ({ ...prev, [mId]: false }));
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Recompute terrain-aware A* corridor whenever Rover Simulator endpoints or optimization mode changes
  useEffect(() => {
    if (!roverActive || !elevationGrid) return;
    const computed = planTerrainAwareRoute({
      grid: elevationGrid,
      start: roverStart,
      destination: roverDest,
      mode: roverRouteMode,
      weights: getPresetWeights(roverRouteMode),
      pois: SCIENTIFIC_POIS,
      color: '#22d3ee',
    });
    setRoverPlannedRoute(computed);
  }, [roverActive, elevationGrid, roverStart, roverDest, roverRouteMode]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleFlyTo = useCallback(
    (lat: number, lon: number, altitudeM: number, label?: string, pitchDeg?: number) => {
      setFlyToRequest({ lat, lon, altitudeM, pitchDeg, nonce: Date.now() });
      setCamHistory((prev) => {
        const sliced = prev.slice(0, camHistIdx + 1);
        const next = [...sliced, { lat, lon, altitudeM, pitchDeg }].slice(-25);
        setCamHistIdx(next.length - 1);
        return next;
      });
      if (label) {
        setSelectedCoord({ lat, lon, label });
      }
    },
    [camHistIdx]
  );

  const handleCameraBack = useCallback(() => {
    if (camHistIdx <= 0) return;
    const prevIdx = camHistIdx - 1;
    const target = camHistory[prevIdx];
    if (!target) return;
    setCamHistIdx(prevIdx);
    setFlyToRequest({ ...target, nonce: Date.now() });
  }, [camHistIdx, camHistory]);

  const handleCameraForward = useCallback(() => {
    if (camHistIdx >= camHistory.length - 1) return;
    const nextIdx = camHistIdx + 1;
    const target = camHistory[nextIdx];
    if (!target) return;
    setCamHistIdx(nextIdx);
    setFlyToRequest({ ...target, nonce: Date.now() });
  }, [camHistIdx, camHistory]);

  const handleToggleLayer = useCallback((layerId: string) => {
    setLayerStates((prev) => {
      const curr = prev[layerId];
      if (!curr) return prev;
      const nextEnabled = !curr.enabled;
      return {
        ...prev,
        [layerId]: {
          ...curr,
          enabled: nextEnabled,
          status: nextEnabled ? 'ready' : 'idle',
          errorMessage: undefined,
        },
      };
    });
  }, []);

  const handleSelectBasemap = useCallback((basemapId: string) => {
    setLayerStates((prev) => {
      const next = { ...prev };
      BASEMAP_LAYER_IDS.forEach((id) => {
        const curr = next[id];
        if (!curr) return;
        const enabled = id === basemapId || (basemapId === 'viking_mdim21' && id === 'viking_mdim21');
        next[id] = {
          ...curr,
          enabled,
          status: enabled ? 'ready' : 'idle',
          errorMessage: undefined,
        };
      });
      if (basemapId === 'viking_mdim21' && next['jezero_hirise']) {
        next['jezero_hirise'] = {
          ...next['jezero_hirise'],
          enabled: true,
          status: 'ready',
        };
      }
      return next;
    });
  }, []);

  const handleLayerOpacity = useCallback((layerId: string, opacity: number) => {
    setLayerStates((prev) => ({
      ...prev,
      [layerId]: { ...prev[layerId], opacity },
    }));
  }, []);

  const handleLayerStatusChange = useCallback(
    (layerId: string, status: LayerLoadStatus, errorMessage?: string) => {
      setLayerStates((prev) => {
        const curr = prev[layerId];
        if (!curr || (curr.status === status && curr.errorMessage === errorMessage)) return prev;
        return {
          ...prev,
          [layerId]: { ...curr, status, errorMessage },
        };
      });
    },
    []
  );

  const handleSelectMissionFromNav = useCallback(
    (missionId: string) => {
      setActiveMissionId(missionId);
      setSelectedMissionId(missionId);
      setSelectedLocation(null);
      setSelectedPoi(null);
      const m = MARS_MISSIONS.find((x) => x.id === missionId);
      if (m) {
        setVisibleMissionIds((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]));
        const tel = missionTelemetry[m.id];
        const targetLat =
          tel && tel.waypoints.length > 0
            ? tel.waypoints[tel.waypoints.length - 1].lat
            : m.lat;
        const targetLon =
          tel && tel.waypoints.length > 0
            ? tel.waypoints[tel.waypoints.length - 1].lon
            : m.lon;
        const targetAlt = m.orbitAltitudeM
          ? m.orbitAltitudeM + 60000
          : m.id === 'perseverance' || m.id === 'ingenuity'
          ? 4500
          : 14000;
        handleFlyTo(targetLat, targetLon, targetAlt, m.name);
        setRightDrawerOpen(true);
      }
    },
    [handleFlyTo, missionTelemetry]
  );

  const flyToFrameRoute = useCallback(
    (start: MarsCoordinate, dest: MarsCoordinate) => {
      const distM = marsDistanceMeters(start.lat, start.lon, dest.lat, dest.lon);
      const mid = sphericalMidpoint(start.lat, start.lon, dest.lat, dest.lon);
      const altM = Math.max(9500, Math.min(11500000, distM * 2.15));
      handleFlyTo(mid.lat, mid.lon, altM);
    },
    [handleFlyTo]
  );

  const recomputeRouteFor = useCallback(
    (
      nextStart: MarsCoordinate | null,
      nextDest: MarsCoordinate | null,
      nextMode: RouteMode,
      nextWeights: RouteWeights,
      isComparingAll: boolean,
      frameCamera = false
    ) => {
      if (!elevationGrid || !nextStart || !nextDest) return;
      if (isComparingAll) {
        const modes: RouteMode[] = [
          'low_difficulty',
          'avoid_slopes',
          'avoid_hazards',
          'visit_science',
          'shortest',
        ];
        const generated = modes.map((m) =>
          planTerrainAwareRoute({
            grid: elevationGrid,
            start: nextStart,
            destination: nextDest,
            mode: m,
            weights: getPresetWeights(m),
            pois: SCIENTIFIC_POIS,
            color: ROUTE_COLORS[m],
          })
        );
        setRoutes(generated);
        const preferred = generated.find((g) => g.mode === nextMode) || generated[0];
        setActiveRouteId(preferred?.id || null);
        setHoveredProfilePoint(null);
      } else {
        const newRoute = planTerrainAwareRoute({
          grid: elevationGrid,
          start: nextStart,
          destination: nextDest,
          mode: nextMode,
          weights: nextWeights,
          pois: SCIENTIFIC_POIS,
          color: ROUTE_COLORS[nextMode],
        });
        setRoutes([newRoute]);
        setActiveRouteId(newRoute.id);
        setHoveredProfilePoint(null);
      }
      if (frameCamera) {
        flyToFrameRoute(nextStart, nextDest);
      }
    },
    [elevationGrid, flyToFrameRoute]
  );

  const handleSelectCoordinate = useCallback(
    (lat: number, lon: number) => {
      if (roverActive && roverPickTarget) {
        const picked: MarsCoordinate = {
          lat,
          lon,
          label: `Site ${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
        };
        if (roverPickTarget === 'start') {
          setRoverStart(picked);
        } else {
          setRoverDest(picked);
        }
        setRoverPickTarget(null);
        setPickMode('inspect');
        setRoverRunNonce((n) => n + 1);
        return;
      }
      if (satelliteActive && satellitePickTarget) {
        const picked: MarsCoordinate = {
          lat,
          lon,
          label: `Target ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
        };
        if (satellitePickTarget === 'start') {
          setSatelliteStart(picked);
        } else {
          setSatelliteDest(picked);
        }
        setSatellitePickTarget(null);
        setPickMode('inspect');
        setSatelliteRunNonce((n) => n + 1);
        return;
      }
      if (pickMode === 'start') {
        const nextStart = { lat, lon, label: `Site ${lat.toFixed(2)}°, ${lon.toFixed(2)}°` };
        setRouteStart(nextStart);
        setPickMode('inspect');
        if (routeDest) {
          recomputeRouteFor(nextStart, routeDest, routeMode, routeWeights, routes.length > 1, true);
          setBottomDockOpen(true);
        }
        return;
      }
      if (pickMode === 'destination') {
        const nextDest = { lat, lon, label: `Site ${lat.toFixed(2)}°, ${lon.toFixed(2)}°` };
        setRouteDest(nextDest);
        setPickMode('inspect');
        if (routeStart) {
          recomputeRouteFor(routeStart, nextDest, routeMode, routeWeights, routes.length > 1, true);
          setBottomDockOpen(true);
        }
        return;
      }
      setSelectedLocation(null);
      setSelectedPoi(null);
      setSelectedMissionId(null);
      setSelectedCoord({ lat, lon });
      setRightDrawerOpen(true);
    },
    [
      pickMode,
      recomputeRouteFor,
      routeDest,
      routeMode,
      routeStart,
      routeWeights,
      routes.length,
      roverActive,
      roverPickTarget,
      satelliteActive,
      satellitePickTarget,
    ]
  );

  const handleSelectPoi = useCallback((poi: ScientificPoi) => {
    setSelectedPoi(poi);
    setSelectedLocation(null);
    setSelectedMissionId(null);
    setSelectedCoord({ lat: poi.lat, lon: poi.lon, label: poi.name });
    setRightDrawerOpen(true);
  }, []);

  const handleSelectLocation = useCallback((loc: MarsLocation) => {
    setSelectedLocation(loc);
    setSelectedPoi(null);
    setSelectedMissionId(null);
    setSelectedCoord({ lat: loc.lat, lon: loc.lon, label: loc.name });
    setRightDrawerOpen(true);
  }, []);

  const handleRouteStartChange = useCallback(
    (coord: MarsCoordinate) => {
      setRouteStart(coord);
      if (routeDest) {
        recomputeRouteFor(coord, routeDest, routeMode, routeWeights, routes.length > 1, true);
        setBottomDockOpen(true);
      } else {
        handleFlyTo(coord.lat, coord.lon, 45000, coord.label);
      }
    },
    [handleFlyTo, recomputeRouteFor, routeDest, routeMode, routeWeights, routes.length]
  );

  const handleRouteDestChange = useCallback(
    (coord: MarsCoordinate) => {
      setRouteDest(coord);
      if (routeStart) {
        recomputeRouteFor(routeStart, coord, routeMode, routeWeights, routes.length > 1, true);
        setBottomDockOpen(true);
      } else {
        handleFlyTo(coord.lat, coord.lon, 45000, coord.label);
      }
    },
    [handleFlyTo, recomputeRouteFor, routeStart, routeMode, routeWeights, routes.length]
  );

  const handleSwapEndpoints = useCallback(() => {
    const nextStart = routeDest;
    const nextDest = routeStart;
    setRouteStart(nextStart);
    setRouteDest(nextDest);
    if (nextStart && nextDest) {
      recomputeRouteFor(nextStart, nextDest, routeMode, routeWeights, routes.length > 1, true);
      setBottomDockOpen(true);
    }
  }, [recomputeRouteFor, routeDest, routeMode, routeStart, routeWeights, routes.length]);

  const handleClearRoute = useCallback(() => {
    setRouteStart(null);
    setRouteDest(null);
    setRoutes([]);
    setActiveRouteId(null);
    setHoveredProfilePoint(null);
    setBottomDockOpen(false);
    setPickMode('inspect');
  }, []);

  const handleLoadJezeroDemo = useCallback(() => {
    const demoStart: MarsCoordinate = {
      lat: 18.4446,
      lon: 77.4509,
      label: 'Octavia E. Butler Landing',
    };
    const demoDest: MarsCoordinate = {
      lat: 18.4581,
      lon: 77.3195,
      label: 'Bright Angel',
    };
    setRouteStart(demoStart);
    setRouteDest(demoDest);
    recomputeRouteFor(demoStart, demoDest, routeMode, routeWeights, false, true);
    setBottomDockOpen(true);
  }, [recomputeRouteFor, routeMode, routeWeights]);

  const handleRouteModeChange = useCallback(
    (mode: RouteMode) => {
      const nextWeights = getPresetWeights(mode);
      setRouteMode(mode);
      setRouteWeights(nextWeights);
      if (routes.length > 1) {
        const match = routes.find((r) => r.mode === mode);
        if (match) {
          setActiveRouteId(match.id);
          setHoveredProfilePoint(null);
          return;
        }
      }
      if (routeStart && routeDest) {
        recomputeRouteFor(routeStart, routeDest, mode, nextWeights, false);
      }
    },
    [recomputeRouteFor, routeDest, routeStart, routes]
  );

  const handleGenerateRoute = useCallback(() => {
    if (!routeStart || !routeDest) return;
    recomputeRouteFor(routeStart, routeDest, routeMode, routeWeights, false, true);
    setBottomDockOpen(true);
  }, [recomputeRouteFor, routeStart, routeDest, routeMode, routeWeights]);

  const handleCompareAllRoutes = useCallback(() => {
    if (!routeStart || !routeDest) return;
    recomputeRouteFor(routeStart, routeDest, routeMode, routeWeights, true, true);
    setBottomDockOpen(true);
  }, [recomputeRouteFor, routeStart, routeDest, routeMode, routeWeights]);

  const handleSelectToolTab = useCallback(
    (tab: LeftTab) => {
      if (leftDrawerOpen && leftTab === tab) {
        setLeftDrawerOpen(false);
        return;
      }
      setLeftTab(tab);
      setLeftDrawerOpen(true);
      if (tab === 'routing') {
        setBottomDockOpen(true);
      }
    },
    [leftDrawerOpen, leftTab]
  );

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const handleOpenFlightSim = useCallback(() => {
    if (flightActive) {
      setFlightActive(false);
      setFlightStatus('menu');
      return;
    }
    setRoverActive(false);
    setRoverStatus('setup');
    setRoverPickTarget(null);
    setSatelliteActive(false);
    setSatelliteStatus('setup');
    setSatellitePickTarget(null);
    setPickMode('inspect');
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
    setBottomDockOpen(false);
    setShowLegend(false);
    setFlightCourseId('jezero_delta_run');
    setFlightStatus('flying');
    setFlightRunNonce((n) => n + 1);
    setFlightActive(true);
  }, [flightActive]);

  const handleSelectFlightCourse = useCallback((courseId: string) => {
    setFlightCourseId(courseId);
    const course = FLIGHT_COURSES.find((c) => c.id === courseId);
    if (course) {
      setFlightCraftId(course.recommendedCraft);
    }
  }, []);

  const handleStartFlight = useCallback(() => {
    setFlightRunNonce((n) => n + 1);
    setFlightStatus('flying');
  }, []);

  const handleRestartFlight = useCallback(() => {
    setFlightRunNonce((n) => n + 1);
    setFlightStatus('flying');
  }, []);

  const handleFlightHudUpdate = useCallback((nextHud: FlightHudTelemetry) => {
    setFlightHud(nextHud);
  }, []);

  const handleFlightStatusChange = useCallback((nextStatus: FlightStatus) => {
    setFlightStatus(nextStatus);
  }, []);

  const activeRoute = routes.find((r) => r.id === activeRouteId) || routes[0] || null;
  const activeLayers = MARS_LAYERS.filter((l) => layerStates[l.id]?.enabled);

  const handleOpenRoverSim = useCallback(() => {
    if (roverActive) {
      setRoverActive(false);
      setRoverStatus('setup');
      setRoverPickTarget(null);
      setPickMode('inspect');
      return;
    }
    setFlightActive(false);
    setFlightStatus('menu');
    setSatelliteActive(false);
    setSatelliteStatus('setup');
    setSatellitePickTarget(null);
    setPickMode('inspect');
    setRoverPickTarget(null);
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
    setBottomDockOpen(false);
    setShowLegend(false);
    setRoverStatus('driving');
    setRoverRunNonce((n) => n + 1);
    setRoverActive(true);
  }, [roverActive]);

  const handleLaunchRoverFromRoute = useCallback(() => {
    const srcRoute = activeRoute;
    const nextStart = srcRoute?.start || routeStart;
    const nextDest = srcRoute?.destination || routeDest;
    if (nextStart && nextDest) {
      setRoverStart(nextStart);
      setRoverDest(nextDest);
      setRoverRouteMode(srcRoute?.mode || routeMode);
      if (srcRoute) {
        setRoverPlannedRoute(srcRoute);
      }
    }
    setFlightActive(false);
    setFlightStatus('menu');
    setSatelliteActive(false);
    setSatelliteStatus('setup');
    setSatellitePickTarget(null);
    setPickMode('inspect');
    setRoverPickTarget(null);
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
    setBottomDockOpen(false);
    setShowLegend(false);
    setRoverStatus('driving');
    setRoverRunNonce((n) => n + 1);
    setRoverActive(true);
  }, [activeRoute, routeDest, routeMode, routeStart]);

  const handleUseExplorerRouteInRover = useCallback(() => {
    const nextStart = activeRoute?.start || routeStart;
    const nextDest = activeRoute?.destination || routeDest;
    if (!nextStart || !nextDest) return;
    setRoverStart(nextStart);
    setRoverDest(nextDest);
    setRoverRouteMode(activeRoute?.mode || routeMode);
    if (activeRoute) {
      setRoverPlannedRoute(activeRoute);
    }
    setRoverRunNonce((n) => n + 1);
  }, [activeRoute, routeDest, routeMode, routeStart]);

  const handleSelectRoverExpedition = useCallback((presetId: string) => {
    const preset = ROVER_EXPEDITIONS.find((p) => p.id === presetId);
    if (!preset) return;
    setRoverStart(preset.start);
    setRoverDest(preset.destination);
    setRoverRouteMode(preset.routeMode);
    setRoverVehicleId(preset.recommendedVehicle);
    setRoverRunNonce((n) => n + 1);
  }, []);

  const handleSwapRoverEndpoints = useCallback(() => {
    setRoverStart(roverDest);
    setRoverDest(roverStart);
    setRoverRunNonce((n) => n + 1);
  }, [roverDest, roverStart]);

  const handleRoverReturnTrip = useCallback(() => {
    setRoverStart(roverDest);
    setRoverDest(roverStart);
    setRoverRunNonce((n) => n + 1);
    setRoverStatus('driving');
  }, [roverDest, roverStart]);

  const handleRoverPickOnGlobe = useCallback(
    (which: 'start' | 'destination') => {
      setRoverPickTarget(which);
      setPickMode(which);
      flyToFrameRoute(roverStart, roverDest);
    },
    [flyToFrameRoute, roverDest, roverStart]
  );

  const handleRoverToggleCamera = useCallback(() => {
    setRoverCameraMode((prev) =>
      prev === 'chase' ? 'cabin' : prev === 'cabin' ? 'overhead' : 'chase'
    );
  }, []);

  const handleOpenSatelliteSim = useCallback(() => {
    if (satelliteActive) {
      setSatelliteActive(false);
      setSatelliteStatus('setup');
      setSatellitePickTarget(null);
      setPickMode('inspect');
      return;
    }
    setFlightActive(false);
    setFlightStatus('menu');
    setRoverActive(false);
    setRoverStatus('setup');
    setRoverPickTarget(null);
    setPickMode('inspect');
    setSatellitePickTarget(null);
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
    setBottomDockOpen(false);
    setShowLegend(false);
    setSatelliteStatus('setup');
    setSatelliteRunNonce((n) => n + 1);
    setSatelliteActive(true);
  }, [satelliteActive]);

  const handleSelectSatellitePassPreset = useCallback((presetId: string) => {
    const preset = SATELLITE_PASS_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSatelliteStart(preset.start);
    setSatelliteDest(preset.destination);
    setSatelliteCraftId(preset.recommendedCraft);
    setSatelliteRunNonce((n) => n + 1);
  }, []);

  const handleSwapSatelliteEndpoints = useCallback(() => {
    setSatelliteStart(satelliteDest);
    setSatelliteDest(satelliteStart);
    setSatelliteRunNonce((n) => n + 1);
  }, [satelliteDest, satelliteStart]);

  const handleSatelliteReturnPass = useCallback(() => {
    setSatelliteStart(satelliteDest);
    setSatelliteDest(satelliteStart);
    setSatelliteRunNonce((n) => n + 1);
    setSatelliteStatus('orbiting');
  }, [satelliteDest, satelliteStart]);

  const handleSatellitePickOnGlobe = useCallback(
    (which: 'start' | 'destination') => {
      setSatellitePickTarget(which);
      setPickMode(which);
      const mid = sphericalMidpoint(
        satelliteStart.lat,
        satelliteStart.lon,
        satelliteDest.lat,
        satelliteDest.lon
      );
      const distM = marsDistanceMeters(
        satelliteStart.lat,
        satelliteStart.lon,
        satelliteDest.lat,
        satelliteDest.lon
      );
      handleFlyTo(mid.lat, mid.lon, Math.max(4200000, Math.min(10500000, distM * 2.2)));
    },
    [handleFlyTo, satelliteDest, satelliteStart]
  );

  const handleSatelliteToggleCamera = useCallback(() => {
    setSatelliteCameraMode((prev) =>
      prev === 'chase' ? 'nadir' : prev === 'nadir' ? 'horizon' : 'chase'
    );
  }, []);

  return (
    <div ref={rootRef} className="flex h-screen w-screen flex-col overflow-hidden bg-[#030406] text-[#e8eaed]">
      <TopNav
        locations={MARS_LOCATIONS}
        missions={MARS_MISSIONS}
        activeMissionId={activeMissionId}
        onSelectMission={handleSelectMissionFromNav}
        onFlyTo={handleFlyTo}
        canGoBack={camHistIdx > 0}
        canGoForward={camHistIdx < camHistory.length - 1}
        onCameraBack={handleCameraBack}
        onCameraForward={handleCameraForward}
        leftDrawerOpen={leftDrawerOpen}
        activeLeftTab={leftTab}
        onSelectToolTab={handleSelectToolTab}
        rightDrawerOpen={rightDrawerOpen}
        onToggleRightDrawer={() => setRightDrawerOpen((v) => !v)}
        showLegend={showLegend}
        onToggleLegend={() => setShowLegend((v) => !v)}
        showGraticule={settings.showGraticule}
        onToggleGraticule={() =>
          setSettings((prev) => ({ ...prev, showGraticule: !prev.showGraticule }))
        }
        enable3dTerrain={settings.enable3dTerrain}
        onToggle3dTerrain={() =>
          setSettings((prev) => ({ ...prev, enable3dTerrain: !prev.enable3dTerrain }))
        }
        activeRoute={activeRoute}
        bottomDockOpen={bottomDockOpen}
        onToggleBottomDock={() => setBottomDockOpen((v) => !v)}
        onOpenReportModal={() => setShowReportModal(true)}
        onOpenSettings={() => setShowSettings(true)}
        onSetPickMode={(mode) => {
          setPickMode(mode);
          if (mode !== 'inspect') {
            setLeftTab('routing');
            setLeftDrawerOpen(true);
          }
        }}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        flightSimActive={flightActive}
        onOpenFlightSim={handleOpenFlightSim}
        roverSimActive={roverActive}
        onOpenRoverSim={handleOpenRoverSim}
        satelliteSimActive={satelliteActive}
        onOpenSatelliteSim={handleOpenSatelliteSim}
        galleryOpen={galleryOpen}
        onOpenGallery={() => setGalleryOpen((v) => !v)}
      />

      {/* Full-Bleed Google Earth Spatial Canvas + Floating Material Dark Drawers */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <MarsGlobe
            layers={MARS_LAYERS}
            layerStates={layerStates}
            onLayerStatusChange={handleLayerStatusChange}
            missions={MARS_MISSIONS}
            visibleMissionIds={visibleMissionIds}
            missionTelemetry={missionTelemetry}
            geologicalFeatures={GEOLOGICAL_FEATURES}
            pois={SCIENTIFIC_POIS}
            showPois={showPois}
            locations={MARS_LOCATIONS}
            elevationGrid={elevationGrid}
            routes={routes}
            activeRouteId={activeRouteId}
            hoveredProfileCoord={
              hoveredProfilePoint
                ? {
                    lat: hoveredProfilePoint.lat,
                    lon: hoveredProfilePoint.lon,
                    distanceKm: hoveredProfilePoint.distanceKm,
                    elevationM: hoveredProfilePoint.elevationM,
                  }
                : null
            }
            selectedCoord={selectedCoord}
            routeStart={routeStart}
            routeDest={routeDest}
            pickMode={pickMode}
            onSelectCoordinate={handleSelectCoordinate}
            onSelectMission={handleSelectMissionFromNav}
            onSelectPoi={handleSelectPoi}
            onSelectLocation={handleSelectLocation}
            flyToRequest={flyToRequest}
            settings={settings}
            splitCompareLayerId={splitCompareLayerId}
            onSelectBasemap={handleSelectBasemap}
            onToggle3dTerrain={() =>
              setSettings((prev) => ({ ...prev, enable3dTerrain: !prev.enable3dTerrain }))
            }
            onOpenSettings={() => setShowSettings(true)}
            flightSim={{
              active: flightActive,
              courseId: flightCourseId,
              craftId: flightCraftId,
              cameraMode: flightCameraMode,
              status: flightStatus,
              invertPitch: flightInvertPitch,
              muted: flightMuted,
              runNonce: flightRunNonce,
            }}
            flightTouchRef={flightTouchRef}
            onFlightHudUpdate={handleFlightHudUpdate}
            onFlightStatusChange={handleFlightStatusChange}
            onFlightToggleCamera={() =>
              setFlightCameraMode((m) => (m === 'chase' ? 'cockpit' : 'chase'))
            }
            onFlightTogglePause={() =>
              setFlightStatus((s) => (s === 'flying' ? 'paused' : s === 'paused' ? 'flying' : s))
            }
            onFlightExit={() => {
              setFlightActive(false);
              setFlightStatus('menu');
            }}
            roverSim={{
              active: roverActive,
              vehicleId: roverVehicleId,
              cameraMode: roverCameraMode,
              status: roverStatus,
              driveMode: roverDriveMode,
              timeScale: roverTimeScale,
              muted: roverMuted,
              runNonce: roverRunNonce,
              route: roverPlannedRoute,
              start: roverStart,
              destination: roverDest,
            }}
            roverTouchRef={roverTouchRef}
            onRoverHudUpdate={setRoverHud}
            onRoverStatusChange={setRoverStatus}
            onRoverToggleCamera={handleRoverToggleCamera}
            onRoverTogglePause={() =>
              setRoverStatus((s) => (s === 'driving' ? 'paused' : s === 'paused' ? 'driving' : s))
            }
            onRoverToggleAutopilot={() =>
              setRoverDriveMode((m) => (m === 'autopilot' ? 'manual' : 'autopilot'))
            }
            onRoverExit={() => {
              setRoverActive(false);
              setRoverStatus('setup');
              setRoverPickTarget(null);
              setPickMode('inspect');
            }}
            satelliteSim={{
              active: satelliteActive,
              craftId: satelliteCraftId,
              cameraMode: satelliteCameraMode,
              status: satelliteStatus,
              timeScale: satelliteTimeScale,
              muted: satelliteMuted,
              runNonce: satelliteRunNonce,
              start: satelliteStart,
              destination: satelliteDest,
            }}
            onSatelliteHudUpdate={setSatelliteHud}
            onSatelliteStatusChange={setSatelliteStatus}
            onSatelliteToggleCamera={handleSatelliteToggleCamera}
            onSatelliteTogglePause={() =>
              setSatelliteStatus((s) =>
                s === 'orbiting' ? 'paused' : s === 'paused' ? 'orbiting' : s
              )
            }
            onSatelliteExit={() => {
              setSatelliteActive(false);
              setSatelliteStatus('setup');
              setSatellitePickTarget(null);
              setPickMode('inspect');
            }}
          />
        </div>

        {flightActive && (
          <FlightSimulatorHUD
            status={flightStatus}
            courseId={flightCourseId}
            craftId={flightCraftId}
            cameraMode={flightCameraMode}
            invertPitch={flightInvertPitch}
            muted={flightMuted}
            hud={flightHud}
            touchControlRef={flightTouchRef}
            onSelectCourse={handleSelectFlightCourse}
            onSelectCraft={setFlightCraftId}
            onStartFlight={handleStartFlight}
            onRestartFlight={handleRestartFlight}
            onOpenMenu={() => {
              setFlightStatus('menu');
              setFlightRunNonce((n) => n + 1);
            }}
            onTogglePause={() =>
              setFlightStatus((s) => (s === 'flying' ? 'paused' : s === 'paused' ? 'flying' : s))
            }
            onToggleCamera={() =>
              setFlightCameraMode((m) => (m === 'chase' ? 'cockpit' : 'chase'))
            }
            onToggleInvertPitch={() => setFlightInvertPitch((v) => !v)}
            onToggleMute={() => setFlightMuted((v) => !v)}
            onExit={() => {
              setFlightActive(false);
              setFlightStatus('menu');
            }}
          />
        )}

        {roverActive && roverPickTarget && (
          <div className="pointer-events-auto absolute top-14 left-1/2 z-40 -translate-x-1/2">
            <button
              onClick={() => {
                setRoverPickTarget(null);
                setPickMode('inspect');
              }}
              className="rounded-lg border border-white/20 bg-[#0B0E17]/95 px-3.5 py-1.5 text-xs font-medium text-slate-200 shadow-lg hover:bg-white/10"
            >
              Cancel Globe Pick & Return to Rover Setup
            </button>
          </div>
        )}

        {roverActive && !roverPickTarget && (
          <RoverSimulatorHUD
            status={roverStatus}
            vehicleId={roverVehicleId}
            cameraMode={roverCameraMode}
            driveMode={roverDriveMode}
            timeScale={roverTimeScale}
            muted={roverMuted}
            startCoord={roverStart}
            destCoord={roverDest}
            routeMode={roverRouteMode}
            plannedRoute={roverPlannedRoute}
            hasExplorerRoute={Boolean(activeRoute || (routeStart && routeDest))}
            hud={roverHud}
            touchControlRef={roverTouchRef}
            onSelectVehicle={setRoverVehicleId}
            onSelectExpedition={handleSelectRoverExpedition}
            onChangeStart={(coord) => {
              setRoverStart(coord);
              setRoverRunNonce((n) => n + 1);
            }}
            onChangeDest={(coord) => {
              setRoverDest(coord);
              setRoverRunNonce((n) => n + 1);
            }}
            onSwapEndpoints={handleSwapRoverEndpoints}
            onUseExplorerRoute={handleUseExplorerRouteInRover}
            onPickOnGlobe={handleRoverPickOnGlobe}
            onChangeRouteMode={setRoverRouteMode}
            onSetDriveMode={setRoverDriveMode}
            onSetTimeScale={setRoverTimeScale}
            onToggleCamera={handleRoverToggleCamera}
            onToggleMute={() => setRoverMuted((v) => !v)}
            onStartDrive={() => {
              setRoverRunNonce((n) => n + 1);
              setRoverStatus('driving');
            }}
            onRestartDrive={() => {
              setRoverRunNonce((n) => n + 1);
              setRoverStatus('driving');
            }}
            onReturnTrip={handleRoverReturnTrip}
            onOpenSetup={() => {
              setRoverStatus('setup');
              setRoverRunNonce((n) => n + 1);
            }}
            onTogglePause={() =>
              setRoverStatus((s) => (s === 'driving' ? 'paused' : s === 'paused' ? 'driving' : s))
            }
            onExit={() => {
              setRoverActive(false);
              setRoverStatus('setup');
              setRoverPickTarget(null);
              setPickMode('inspect');
            }}
          />
        )}

        {satelliteActive && satellitePickTarget && (
          <div className="pointer-events-auto absolute top-14 left-1/2 z-40 -translate-x-1/2">
            <button
              onClick={() => {
                setSatellitePickTarget(null);
                setPickMode('inspect');
              }}
              className="rounded-lg border border-white/20 bg-[#0B0E17]/95 px-3.5 py-1.5 text-xs font-medium text-slate-200 shadow-lg hover:bg-white/10"
            >
              Cancel Globe Pick & Return to Satellite Setup
            </button>
          </div>
        )}

        {satelliteActive && !satellitePickTarget && (
          <SatelliteSimulatorHUD
            status={satelliteStatus}
            craftId={satelliteCraftId}
            cameraMode={satelliteCameraMode}
            timeScale={satelliteTimeScale}
            muted={satelliteMuted}
            startCoord={satelliteStart}
            destCoord={satelliteDest}
            hud={satelliteHud}
            onSelectCraft={setSatelliteCraftId}
            onSelectPassPreset={handleSelectSatellitePassPreset}
            onChangeStart={(coord) => {
              setSatelliteStart(coord);
              setSatelliteRunNonce((n) => n + 1);
            }}
            onChangeDest={(coord) => {
              setSatelliteDest(coord);
              setSatelliteRunNonce((n) => n + 1);
            }}
            onSwapEndpoints={handleSwapSatelliteEndpoints}
            onPickOnGlobe={handleSatellitePickOnGlobe}
            onSetTimeScale={setSatelliteTimeScale}
            onToggleCamera={handleSatelliteToggleCamera}
            onToggleMute={() => setSatelliteMuted((v) => !v)}
            onStartOrbit={() => {
              setSatelliteRunNonce((n) => n + 1);
              setSatelliteStatus('orbiting');
            }}
            onRestartOrbit={() => {
              setSatelliteRunNonce((n) => n + 1);
              setSatelliteStatus('orbiting');
            }}
            onReturnPass={handleSatelliteReturnPass}
            onOpenSetup={() => {
              setSatelliteStatus('setup');
              setSatelliteRunNonce((n) => n + 1);
            }}
            onTogglePause={() =>
              setSatelliteStatus((s) =>
                s === 'orbiting' ? 'paused' : s === 'paused' ? 'orbiting' : s
              )
            }
            onExit={() => {
              setSatelliteActive(false);
              setSatelliteStatus('setup');
              setSatellitePickTarget(null);
              setPickMode('inspect');
            }}
          />
        )}

        {/* Floating Left Drawer (Catalog, Missions, Geology, Climate, Route Planner) */}
        {!flightActive && !roverActive && !satelliteActive && leftDrawerOpen && (
          <div className="absolute top-3 left-3 bottom-10 z-30 flex w-[348px] max-w-[calc(100%-1.5rem)]">
            <LeftSidebar
              activeTab={leftTab}
              onTabChange={setLeftTab}
              layers={MARS_LAYERS}
              layerStates={layerStates}
              onToggleLayer={handleToggleLayer}
              onLayerOpacity={handleLayerOpacity}
              splitCompareLayerId={splitCompareLayerId}
              onSetSplitCompare={setSplitCompareLayerId}
              missions={MARS_MISSIONS}
              visibleMissionIds={visibleMissionIds}
              onToggleMissionVisible={(id) =>
                setVisibleMissionIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
              missionTelemetry={missionTelemetry}
              loadingTelemetry={loadingTelemetry}
              telemetryErrors={telemetryErrors}
              onFlyTo={(lat, lon, alt, lbl) => {
                handleFlyTo(lat, lon, alt, lbl);
              }}
              locations={MARS_LOCATIONS}
              savedLocations={savedLocations}
              onRemoveSavedLocation={(idx) =>
                setSavedLocations((prev) => prev.filter((_, i) => i !== idx))
              }
              geologicalFeatures={GEOLOGICAL_FEATURES}
              pois={SCIENTIFIC_POIS}
              showPois={showPois}
              onToggleShowPois={() => setShowPois((s) => !s)}
              envRecords={ENVIRONMENTAL_RECORDS}
              routeStart={routeStart}
              routeDest={routeDest}
              routeMode={routeMode}
              routeWeights={routeWeights}
              pickMode={pickMode}
              hasActiveRoute={Boolean(activeRoute)}
              onSetPickMode={setPickMode}
              onRouteStartChange={handleRouteStartChange}
              onRouteDestChange={handleRouteDestChange}
              onSwapEndpoints={handleSwapEndpoints}
              onClearRoute={handleClearRoute}
              onLoadJezeroDemo={handleLoadJezeroDemo}
              onFrameActiveRoute={() => {
                if (activeRoute) {
                  flyToFrameRoute(activeRoute.start, activeRoute.destination);
                } else if (routeStart && routeDest) {
                  flyToFrameRoute(routeStart, routeDest);
                }
              }}
              onRouteModeChange={handleRouteModeChange}
              onRouteWeightsChange={setRouteWeights}
              onGenerateRoute={handleGenerateRoute}
              onCompareAllRoutes={handleCompareAllRoutes}
              onLaunchRoverSim={handleLaunchRoverFromRoute}
              onCloseMobile={() => setLeftDrawerOpen(false)}
            />
          </div>
        )}

        {/* Floating Right Knowledge Card & Data Legend Stack (Collision-free) */}
        {!flightActive && !roverActive && !satelliteActive && (showLegend || rightDrawerOpen) && (
          <div className="pointer-events-none absolute top-3 right-3 z-20 flex max-h-[calc(100%-6.25rem)] max-w-[calc(100%-1.5rem)] items-start gap-2.5">
            {showLegend && (
              <div className="hidden sm:block">
                <DataLegend
                  layers={MARS_LAYERS}
                  layerStates={layerStates}
                  onClose={() => setShowLegend(false)}
                />
              </div>
            )}
            {rightDrawerOpen && (
              <div className="pointer-events-auto flex h-[min(640px,calc(100vh-11rem))] w-[336px] max-w-[calc(100vw-1.5rem)]">
                <RightSidebar
                  selectedCoord={selectedCoord}
                  selectedLocation={selectedLocation}
                  selectedPoi={selectedPoi}
                  selectedMission={
                    selectedMissionId
                      ? MARS_MISSIONS.find((m) => m.id === selectedMissionId) || null
                      : null
                  }
                  elevationGrid={elevationGrid}
                  missionTelemetry={missionTelemetry}
                  geologicalFeatures={GEOLOGICAL_FEATURES}
                  pois={SCIENTIFIC_POIS}
                  savedLocations={savedLocations}
                  onSaveLocation={(coord) => {
                    setSavedLocations((prev) => {
                      const exists = prev.some(
                        (s) =>
                          Math.abs(s.lat - coord.lat) < 0.0005 &&
                          Math.abs(s.lon - coord.lon) < 0.0005
                      );
                      if (exists) return prev;
                      return [
                        ...prev,
                        {
                          ...coord,
                          label:
                            coord.label ||
                            `Site ${coord.lat.toFixed(2)}°N, ${coord.lon.toFixed(2)}°E`,
                        },
                      ];
                    });
                  }}
                  onSetRouteStart={(coord) => {
                    handleRouteStartChange(coord);
                    setLeftTab('routing');
                    setLeftDrawerOpen(true);
                  }}
                  onSetRouteDest={(coord) => {
                    handleRouteDestChange(coord);
                    setLeftTab('routing');
                    setLeftDrawerOpen(true);
                  }}
                  onFlyTo={(lat, lon, alt, lbl) => handleFlyTo(lat, lon, alt, lbl)}
                  settings={settings}
                  onCloseMobile={() => setRightDrawerOpen(false)}
                />
              </div>
            )}
          </div>
        )}

        {/* Floating Bottom Route Telemetry & Elevation Profile Dock */}
        {!flightActive && !roverActive && !satelliteActive && bottomDockOpen && activeRoute && (
          <div
            className={`pointer-events-none absolute right-3 bottom-10 left-3 z-20 ${
              leftDrawerOpen ? 'lg:left-[372px]' : 'lg:left-20'
            } ${rightDrawerOpen ? 'lg:right-[364px]' : 'lg:right-72'}`}
          >
            <div className="mx-auto max-w-4xl">
              <BottomPanel
                routes={routes}
                activeRouteId={activeRouteId}
                onSelectRoute={setActiveRouteId}
                onHoverProfilePoint={setHoveredProfilePoint}
                onOpenReportModal={() => setShowReportModal(true)}
                onFlyToPoi={(lat, lon, name) => handleFlyTo(lat, lon, 5000, name)}
                onLaunchRoverSim={handleLaunchRoverFromRoute}
                onClose={() => setBottomDockOpen(false)}
              />
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showReportModal && activeRoute && (
        <ReportModal
          route={activeRoute}
          activeLayers={activeLayers}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {galleryOpen && <MarsGallery onClose={() => setGalleryOpen(false)} />}
    </div>
  );
}
