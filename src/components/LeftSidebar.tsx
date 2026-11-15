import { useEffect, useState } from 'react';
import {
  ArrowUpDown,
  CloudSun,
  Compass,
  ExternalLink,
  Layers,
  MapPin,
  Mountain,
  Radio,
  RefreshCw,
  Rocket,
  Route,
  Sliders,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import {
  EnvironmentalRecord,
  GeologicalFeature,
  LayerRuntimeState,
  MarsCoordinate,
  MarsLayerConfig,
  MarsLocation,
  MarsMission,
  MissionTelemetry,
  PoiCategory,
  RouteMode,
  RouteWeights,
  ScientificPoi,
} from '../types/mars';
import { fetchMarsSpaceWeather, MarsSpaceWeatherSummary } from '../services/nasaMarsService';

export type LeftTab = 'layers' | 'missions' | 'geology' | 'environment' | 'routing';

interface LeftSidebarProps {
  activeTab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  layers: MarsLayerConfig[];
  layerStates: Record<string, LayerRuntimeState>;
  onToggleLayer: (layerId: string) => void;
  onLayerOpacity: (layerId: string, opacity: number) => void;
  splitCompareLayerId: string | null;
  onSetSplitCompare: (layerId: string | null) => void;
  missions: MarsMission[];
  visibleMissionIds: string[];
  onToggleMissionVisible: (missionId: string) => void;
  missionTelemetry: Record<string, MissionTelemetry>;
  loadingTelemetry: Record<string, boolean>;
  telemetryErrors: Record<string, string>;
  onFlyTo: (lat: number, lon: number, altitudeM: number, label?: string) => void;
  locations: MarsLocation[];
  savedLocations: MarsCoordinate[];
  onRemoveSavedLocation: (index: number) => void;
  geologicalFeatures: GeologicalFeature[];
  pois: ScientificPoi[];
  showPois: boolean;
  onToggleShowPois: () => void;
  envRecords: EnvironmentalRecord[];
  routeStart: MarsCoordinate | null;
  routeDest: MarsCoordinate | null;
  routeMode: RouteMode;
  routeWeights: RouteWeights;
  pickMode: 'inspect' | 'start' | 'destination';
  hasActiveRoute: boolean;
  onSetPickMode: (mode: 'inspect' | 'start' | 'destination') => void;
  onRouteStartChange: (coord: MarsCoordinate) => void;
  onRouteDestChange: (coord: MarsCoordinate) => void;
  onSwapEndpoints: () => void;
  onClearRoute: () => void;
  onLoadJezeroDemo: () => void;
  onFrameActiveRoute: () => void;
  onRouteModeChange: (mode: RouteMode) => void;
  onRouteWeightsChange: (weights: RouteWeights) => void;
  onGenerateRoute: () => void;
  onCompareAllRoutes: () => void;
  onLaunchRoverSim?: () => void;
  onCloseMobile?: () => void;
}

interface RoutePresetOption {
  label: string;
  group: 'jezero' | 'global';
  coord: MarsCoordinate;
}

const ROUTE_PRESETS: RoutePresetOption[] = [
  {
    label: 'Octavia E. Butler Landing (Jezero Floor)',
    group: 'jezero',
    coord: { lat: 18.4446, lon: 77.4509, label: 'Octavia E. Butler Landing' },
  },
  {
    label: 'Kodiak Delta Butte (Jezero)',
    group: 'jezero',
    coord: { lat: 18.442, lon: 77.372, label: 'Kodiak Delta Butte' },
  },
  {
    label: 'Wildcat Ridge (Jezero Delta Front)',
    group: 'jezero',
    coord: { lat: 18.4638, lon: 77.3822, label: 'Wildcat Ridge' },
  },
  {
    label: 'South Séítah (Jezero Olivine Ridge)',
    group: 'jezero',
    coord: { lat: 18.4209, lon: 77.4265, label: 'South Séítah' },
  },
  {
    label: 'Bright Angel (Neretva Channel)',
    group: 'jezero',
    coord: { lat: 18.4581, lon: 77.3195, label: 'Bright Angel' },
  },
  {
    label: 'Witch Hazel Hill (Jezero West Rim)',
    group: 'jezero',
    coord: { lat: 18.449, lon: 77.269, label: 'Witch Hazel Hill' },
  },
  {
    label: 'Belva Crater North Rim (Jezero)',
    group: 'jezero',
    coord: { lat: 18.491, lon: 77.386, label: 'Belva Crater Rim' },
  },
  {
    label: 'Gale Crater (Curiosity Site)',
    group: 'global',
    coord: { lat: -4.5895, lon: 137.4417, label: 'Gale Crater' },
  },
  {
    label: 'Elysium Planitia (InSight Site)',
    group: 'global',
    coord: { lat: 4.5024, lon: 135.6234, label: 'Elysium Planitia' },
  },
  {
    label: 'Olympus Mons (Tharsis)',
    group: 'global',
    coord: { lat: 18.65, lon: -133.8, label: 'Olympus Mons' },
  },
  {
    label: 'Valles Marineris (Melas Chasma)',
    group: 'global',
    coord: { lat: -10.35, lon: -70.6, label: 'Valles Marineris' },
  },
  {
    label: 'Meridiani Planum (Opportunity)',
    group: 'global',
    coord: { lat: -1.9483, lon: -5.5258, label: 'Meridiani Planum' },
  },
  {
    label: 'Gusev Crater (Spirit)',
    group: 'global',
    coord: { lat: -14.5719, lon: 175.4785, label: 'Gusev Crater' },
  },
  {
    label: 'Hellas Planitia Basin',
    group: 'global',
    coord: { lat: -42.4, lon: 70.5, label: 'Hellas Planitia' },
  },
  {
    label: 'Utopia Planitia (Zhurong)',
    group: 'global',
    coord: { lat: 25.102, lon: 109.914, label: 'Utopia Planitia' },
  },
  {
    label: 'Ares Vallis (Pathfinder)',
    group: 'global',
    coord: { lat: 19.13, lon: -33.22, label: 'Ares Vallis' },
  },
];

function matchPresetLabel(coord: MarsCoordinate | null): string {
  if (!coord) return '';
  const hit = ROUTE_PRESETS.find(
    (p) => Math.abs(p.coord.lat - coord.lat) < 0.002 && Math.abs(p.coord.lon - coord.lon) < 0.002
  );
  return hit ? hit.label : '__custom__';
}

export default function LeftSidebar({
  activeTab,
  onTabChange,
  layers,
  layerStates,
  onToggleLayer,
  onLayerOpacity,
  splitCompareLayerId,
  onSetSplitCompare,
  missions,
  visibleMissionIds,
  onToggleMissionVisible,
  missionTelemetry,
  loadingTelemetry,
  telemetryErrors,
  onFlyTo,
  locations,
  savedLocations,
  onRemoveSavedLocation,
  geologicalFeatures,
  pois,
  showPois,
  onToggleShowPois,
  envRecords,
  routeStart,
  routeDest,
  routeMode,
  routeWeights,
  pickMode,
  hasActiveRoute,
  onSetPickMode,
  onRouteStartChange,
  onRouteDestChange,
  onSwapEndpoints,
  onClearRoute,
  onLoadJezeroDemo,
  onFrameActiveRoute,
  onRouteModeChange,
  onRouteWeightsChange,
  onGenerateRoute,
  onCompareAllRoutes,
  onLaunchRoverSim,
  onCloseMobile,
}: LeftSidebarProps) {
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>('jezero_hirise');
  const [missionFilter, setMissionFilter] = useState<'all' | 'Rover' | 'Lander' | 'Helicopter' | 'Orbiter'>('all');
  const [poiFilter, setPoiFilter] = useState<'all' | PoiCategory>('all');
  const [envMissionFilter, setEnvMissionFilter] = useState<string>('all');
  const [envKindFilter, setEnvKindFilter] = useState<string>('all');
  const [spaceWeather, setSpaceWeather] = useState<MarsSpaceWeatherSummary | null>(null);
  const [spaceWeatherLoading, setSpaceWeatherLoading] = useState(false);
  const [spaceWeatherError, setSpaceWeatherError] = useState<string | null>(null);

  const loadSpaceWeather = () => {
    setSpaceWeatherLoading(true);
    setSpaceWeatherError(null);
    fetchMarsSpaceWeather()
      .then((data) => setSpaceWeather(data))
      .catch((err) =>
        setSpaceWeatherError(
          err instanceof Error ? err.message : 'Unable to reach NASA DONKI feed'
        )
      )
      .finally(() => setSpaceWeatherLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'environment' && !spaceWeather && !spaceWeatherLoading && !spaceWeatherError) {
      loadSpaceWeather();
    }
  }, [activeTab]);

  const tabs: Array<{ id: LeftTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'layers', label: 'Overlays', icon: Layers },
    { id: 'missions', label: 'Outposts', icon: Rocket },
    { id: 'geology', label: 'Terrain', icon: Mountain },
    { id: 'environment', label: 'Climate', icon: CloudSun },
    { id: 'routing', label: 'Traverse', icon: Route },
  ];

  const filteredMissions =
    missionFilter === 'all'
      ? missions
      : missions.filter((m) => m.missionType === missionFilter);

  const filteredPois =
    poiFilter === 'all' ? pois : pois.filter((p) => p.category === poiFilter);

  const filteredEnv = envRecords.filter((rec) => {
    if (envMissionFilter !== 'all' && rec.missionId !== envMissionFilter) return false;
    if (envKindFilter !== 'all' && rec.recordKind !== envKindFilter) return false;
    return true;
  });

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-amber-500/25 bg-[#0B0F17]/95 text-xs text-slate-200 shadow-2xl">
      {/* Survival Field Manual Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-amber-500/20 bg-[#080B11] px-3.5 py-2">
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
            Interplanetary Survival Guide
          </div>
          <div className="font-display text-xs font-semibold text-white">
            Mars Field Manual & Hazard Index
          </div>
        </div>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Close panel"
            title="Close Panel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tab Navigation Strip */}
      <div className="flex shrink-0 items-center border-b border-slate-800 bg-[#080B11]/80">
        <div className="grid flex-1 grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`flex flex-col items-center justify-center gap-1 border-b-2 py-2.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'border-amber-400 bg-amber-500/10 text-amber-300'
                    : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Tab Content */}
      <div className="flex-1 overflow-y-auto p-3.5">
        {/* TAB 1: SURVIVAL HAZARD OVERLAYS */}
        {activeTab === 'layers' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h2 className="font-display text-xs font-semibold text-white">
                  Survival Hazard & Surface Overlays
                </h2>
                <p className="text-[11px] text-slate-400">
                  {layers.filter((l) => layerStates[l.id]?.enabled).length} active overlays
                </p>
              </div>
              {splitCompareLayerId && (
                <button
                  type="button"
                  onClick={() => onSetSplitCompare(null)}
                  className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[10px] font-medium text-amber-300 hover:bg-amber-500/25"
                >
                  Exit Split
                </button>
              )}
            </div>

            {layers.map((layer) => {
              const st = layerStates[layer.id] || {
                enabled: layer.defaultEnabled,
                opacity: layer.defaultOpacity,
                status: 'idle',
              };
              const isExpanded = expandedLayerId === layer.id;
              const isSplit = splitCompareLayerId === layer.id;

              return (
                <div
                  key={layer.id}
                  className={`rounded-md border transition-colors ${
                    st.enabled
                      ? 'border-amber-500/35 bg-[#111824]'
                      : 'border-slate-800 bg-[#0D121B] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={st.enabled}
                        onChange={() => onToggleLayer(layer.id)}
                        className="h-3.5 w-3.5 accent-amber-500"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-slate-100">
                          {layer.shortName}
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                          {layer.instrument} · {layer.resolution}
                        </div>
                      </div>
                    </label>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {st.status === 'error' && (
                        <span className="text-[10px] font-medium text-rose-400" title={st.errorMessage}>
                          Err
                        </span>
                      )}
                      {(layer.kind === 'trek_wmts' || layer.kind === 'usgs_wms') && (
                        <button
                          type="button"
                          onClick={() => onSetSplitCompare(isSplit ? null : layer.id)}
                          className={`rounded-md border px-2 py-0.5 text-[10px] ${
                            isSplit
                              ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                              : 'border-slate-700 text-slate-400 hover:text-white'
                          }`}
                          title="Compare layer in split-screen slider"
                        >
                          Split
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedLayerId(isExpanded ? null : layer.id)}
                        className="rounded-md border border-slate-700/80 px-2 py-0.5 text-[10px] text-slate-400 hover:border-slate-500 hover:text-white"
                      >
                        {isExpanded ? 'Hide' : 'Info'}
                      </button>
                    </div>
                  </div>

                  {st.enabled && (
                    <div className="flex items-center gap-2 border-t border-slate-800 px-3 py-1.5">
                      <span className="text-[10px] text-slate-400">Opacity</span>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={st.opacity}
                        onChange={(e) => onLayerOpacity(layer.id, parseFloat(e.target.value))}
                        className="h-1 flex-1 accent-amber-500"
                      />
                      <span className="w-8 text-right font-mono text-[10px] text-slate-300 tabular-nums">
                        {Math.round(st.opacity * 100)}%
                      </span>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="space-y-1.5 border-t border-slate-800 bg-[#080B11]/80 px-3 py-2 text-[11px] text-slate-300">
                      <div className="font-medium text-white">{layer.name}</div>
                      <p className="leading-relaxed text-slate-400">{layer.description}</p>
                      <div className="grid grid-cols-1 gap-0.5 pt-1 text-[10px] text-slate-400">
                        <div>
                          <span className="text-slate-500">Source:</span> {layer.source}
                        </div>
                        <div>
                          <span className="text-slate-500">Date:</span> {layer.observationDate}
                        </div>
                        <div>
                          <span className="text-slate-500">Coverage:</span> {layer.coverage}
                        </div>
                        <div>
                          <span className="text-slate-500">License:</span> {layer.license}
                        </div>
                      </div>
                      {layer.bounds && (
                        <button
                          type="button"
                          onClick={() =>
                            onFlyTo(
                              (layer.bounds![1] + layer.bounds![3]) / 2,
                              (layer.bounds![0] + layer.bounds![2]) / 2,
                              35000,
                              layer.shortName
                            )
                          }
                          className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 hover:underline"
                        >
                          <Compass className="h-3 w-3" /> Zoom to coverage extent
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 2: OUTPOSTS & RECON ASSETS */}
        {activeTab === 'missions' && (
          <div className="space-y-3">
            <div className="border-b border-slate-800 pb-2.5">
              <h2 className="font-display text-xs font-semibold text-white">
                Surface Outposts, Rovers & Orbital Assets ({missions.length})
              </h2>
              <p className="text-[11px] text-slate-400">
                Historical NASA/CNSA landing sites and active UHF orbital relay craft.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(['all', 'Rover', 'Lander', 'Helicopter', 'Orbiter'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setMissionFilter(cat)}
                    className={`rounded-md border px-2.5 py-0.5 text-[10px] font-medium ${
                      missionFilter === cat
                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                        : 'border-slate-700/80 bg-[#111824] text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat === 'all' ? `All (${missions.length})` : cat}
                  </button>
                ))}
              </div>
            </div>

            {filteredMissions.map((m) => {
              const isVisible = visibleMissionIds.includes(m.id);
              const tel = missionTelemetry[m.id];
              const loading = loadingTelemetry[m.id];
              const err = telemetryErrors[m.id];

              const flyLat =
                tel && tel.waypoints.length > 0
                  ? tel.waypoints[tel.waypoints.length - 1].lat
                  : m.lat;
              const flyLon =
                tel && tel.waypoints.length > 0
                  ? tel.waypoints[tel.waypoints.length - 1].lon
                  : m.lon;
              const flyAlt = m.orbitAltitudeM
                ? m.orbitAltitudeM + 60000
                : m.id === 'perseverance' || m.id === 'ingenuity'
                ? 4500
                : 12000;

              return (
                <div key={m.id} className="rounded-md border border-slate-700/70 bg-[#111824] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-xs"
                          style={{ backgroundColor: m.color }}
                        />
                        <span className="truncate text-xs font-semibold text-white">{m.name}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {m.missionType} · {m.status} · {m.landingDate}
                        {m.endDate ? ` – ${m.endDate}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <label className="flex cursor-pointer items-center gap-1 text-[10px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => onToggleMissionVisible(m.id)}
                          className="accent-amber-500"
                        />
                        Show
                      </label>
                      <button
                        type="button"
                        onClick={() => onFlyTo(flyLat, flyLon, flyAlt, m.name)}
                        className="rounded-md border border-slate-700 bg-[#0B0F17] px-2.5 py-0.5 text-[10px] font-medium text-amber-300 hover:border-amber-500"
                      >
                        Locate
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{m.description}</p>

                  {m.modelSourceName && (
                    <div className="mt-1.5 text-[10px] text-cyan-300">
                      3D Model: {m.modelSourceName}
                    </div>
                  )}

                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2 font-mono text-[10px] tabular-nums">
                    <div>
                      <span className="text-slate-500">
                        {m.missionType === 'Orbiter' ? 'ORBIT: ' : 'SITE: '}
                      </span>
                      <span>
                        {m.lat.toFixed(2)}°, {m.lon.toFixed(2)}°
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">
                        {m.missionType === 'Orbiter' ? 'ALTITUDE: ' : 'TRAVERSE: '}
                      </span>
                      <span className="text-cyan-300">
                        {m.orbitAltitudeM
                          ? `${Math.round(m.orbitAltitudeM / 1000)} km`
                          : tel
                          ? `${tel.totalDistanceKm.toFixed(2)} km (Sol ${tel.maxSol})`
                          : `${m.totalTraverseKm} km`}
                      </span>
                    </div>
                  </div>

                  {loading && (
                    <div className="mt-1.5 text-[10px] text-cyan-400">
                      Loading NASA MMGIS historical waypoints...
                    </div>
                  )}
                  {err && (
                    <div className="mt-1.5 text-[10px] text-amber-400">
                      Archive fetch notice: {err}
                    </div>
                  )}

                  {m.sampleCaches && m.sampleCaches.length > 0 && (
                    <div className="mt-2 border-t border-slate-800/80 pt-2">
                      <div className="mb-1 text-[10px] font-medium text-amber-300">
                        Key Cached Samples ({m.sampleCaches.length})
                      </div>
                      <div className="space-y-1">
                        {m.sampleCaches.map((sc) => (
                          <button
                            key={sc.name}
                            type="button"
                            onClick={() => onFlyTo(sc.lat, sc.lon, 3500, sc.name)}
                            className="flex w-full items-center justify-between text-left text-[10px] text-slate-300 hover:text-white"
                          >
                            <span className="truncate pr-2">
                              Sol {sc.sol} · {sc.name}
                            </span>
                            <span className="shrink-0 text-slate-500">{sc.rockType.split(' ')[0]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 border-t border-slate-800/80 pt-2">
                    <div className="mb-1 text-[10px] font-medium text-slate-400">Timeline</div>
                    <div className="space-y-1">
                      {m.timeline.slice(0, 3).map((t, i) => (
                        <div key={i} className="text-[10px] text-slate-400">
                          <span className="font-mono text-slate-300">{t.date}</span> · {t.event}
                        </div>
                      ))}
                    </div>
                    <a
                      href={m.nasaRecordUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:underline"
                    >
                      NASA Official Mission Archive <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: TERRAIN TARGETS, GEOLOGY & SAVED LOCATIONS */}
        {activeTab === 'geology' && (
          <div className="space-y-4">
            {/* Scientific POIs */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-xs font-semibold text-white">
                  Surface Waypoints & Field Targets
                </h2>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={showPois}
                    onChange={onToggleShowPois}
                    className="accent-amber-500"
                  />
                  Show Pins
                </label>
              </div>

              <div className="mb-2 flex flex-wrap gap-1.5">
                {(
                  [
                    ['all', 'All'],
                    ['mineral', 'Minerals'],
                    ['ancient_water', 'Water'],
                    ['rover_target', 'Rover'],
                    ['terrain_feature', 'Terrain'],
                    ['geological_boundary', 'Contact'],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPoiFilter(val)}
                    className={`rounded-md border px-2.5 py-0.5 text-[10px] font-medium ${
                      poiFilter === val
                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                        : 'border-slate-700/80 bg-[#111824] text-slate-400 hover:text-white'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                {filteredPois.map((poi) => (
                  <button
                    key={poi.id}
                    type="button"
                    onClick={() => onFlyTo(poi.lat, poi.lon, 5500, poi.name)}
                    className="w-full rounded-md border border-slate-700/70 bg-[#111824] p-2.5 text-left transition-colors hover:border-amber-500/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium text-white">
                        <MapPin className="h-3 w-3 shrink-0 text-amber-400" />
                        <span className="truncate">{poi.name}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-slate-400 tabular-nums">
                        {poi.elevationM} m
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] text-slate-400">{poi.description}</p>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {poi.associatedInstrument} · {poi.observationDate}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Geological & Mineralogical Units */}
            <div className="border-t border-slate-800 pt-3">
              <h3 className="mb-2 font-display text-xs font-semibold text-white">
                Geological & Resource Units
              </h3>
              <div className="space-y-1.5">
                {geologicalFeatures.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onFlyTo(g.lat, g.lon, 12000, g.name)}
                    className="w-full rounded-md border border-slate-700/70 bg-[#111824] p-2.5 text-left transition-colors hover:border-slate-500"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-xs"
                          style={{ backgroundColor: g.color }}
                        />
                        <span className="truncate font-medium text-white">{g.name}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400">{g.observationDate}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-cyan-300">{g.evidenceStatus}</div>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-300">
                      {g.scientificSignificance}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Saved Locations */}
            <div className="border-t border-slate-800 pt-3">
              <h3 className="mb-2 font-display text-xs font-semibold text-white">
                Bookmarked Survival Sites ({savedLocations.length})
              </h3>
              {savedLocations.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  No bookmarked sites yet. Click a location on Mars and select "Bookmark" in the Site Survival Dossier.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {savedLocations.map((loc, idx) => (
                    <div
                      key={`${loc.lat}-${loc.lon}-${idx}`}
                      className="flex items-center justify-between rounded-md border border-slate-700/70 bg-[#111824] px-2.5 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => onFlyTo(loc.lat, loc.lon, 10000, loc.label)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-xs font-medium text-white">
                          {loc.label || `Site #${idx + 1}`}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                          {loc.lat.toFixed(4)}°N, {loc.lon.toFixed(4)}°E
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveSavedLocation(idx)}
                        className="ml-2 text-slate-400 hover:text-rose-400"
                        title="Remove saved site"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Famous Mars Landmarks */}
            <div className="border-t border-slate-800 pt-3">
              <h3 className="mb-2 font-display text-xs font-semibold text-white">
                Planetary Survival Sectors
              </h3>
              <div className="grid grid-cols-1 gap-1.5">
                {locations
                  .filter((l) => !l.region.includes('Jezero'))
                  .map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => onFlyTo(loc.lat, loc.lon, 320000, loc.name)}
                      className="flex items-center justify-between rounded-md border border-slate-800 bg-[#111824] px-3 py-1.5 text-left hover:border-amber-500/40"
                    >
                      <span className="truncate text-[11px] text-slate-200">{loc.name}</span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                        {loc.elevationM ? `${loc.elevationM} m` : ''}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: HISTORICAL ENVIRONMENTAL DATA & LIVE SOLAR RADIATION CONTEXT */}
        {activeTab === 'environment' && (
          <div className="space-y-3">
            <div className="border-b border-slate-800 pb-2">
              <h2 className="font-display text-xs font-semibold text-white">
                Atmospheric, Radiation & Dust Logs
              </h2>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                Distinguishes live NASA DONKI solar radiation context (api.nasa.gov) from NASA PDS historical surface station records (MEDA, TWINS, REMS) and modeled climatology.
              </p>
            </div>

            {/* Live NASA DONKI Heliospheric & Radiation Context */}
            <div className="rounded-md border border-cyan-500/35 bg-[#0D1420] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-cyan-300 uppercase">
                  <Radio className="h-3 w-3 text-cyan-400" />
                  Live Solar &amp; Radiation Context
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-sm border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9px] text-cyan-200">
                    NASA DONKI · LIVE
                  </span>
                  <button
                    type="button"
                    onClick={loadSpaceWeather}
                    disabled={spaceWeatherLoading}
                    className="rounded-sm p-0.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
                    title="Refresh NASA DONKI Space Weather"
                  >
                    <RefreshCw className={`h-3 w-3 ${spaceWeatherLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {spaceWeatherLoading && !spaceWeather && (
                <div className="mt-2 text-[11px] text-cyan-300">
                  Querying NASA CCMC DONKI heliospheric telemetry...
                </div>
              )}
              {spaceWeatherError && !spaceWeather && (
                <div className="mt-2 text-[11px] text-amber-300">
                  Space weather unavailable: {spaceWeatherError}
                </div>
              )}
              {spaceWeather && (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px] tabular-nums">
                    <div className="rounded-sm border border-slate-800 bg-[#080B11] p-1.5">
                      <div className="text-slate-500">30D CMEs</div>
                      <div className="text-xs font-semibold text-white">
                        {spaceWeather.cmeCount30d}
                      </div>
                    </div>
                    <div className="rounded-sm border border-slate-800 bg-[#080B11] p-1.5">
                      <div className="text-slate-500">30D SEPs</div>
                      <div className="text-xs font-semibold text-amber-300">
                        {spaceWeather.sepCount30d}
                      </div>
                    </div>
                    <div className="rounded-sm border border-slate-800 bg-[#080B11] p-1.5">
                      <div className="text-slate-500">MARS IMPACT</div>
                      <div
                        className={`text-xs font-semibold ${
                          spaceWeather.marsDirectedCmeCount30d > 0
                            ? 'text-rose-400'
                            : 'text-emerald-300'
                        }`}
                      >
                        {spaceWeather.marsDirectedCmeCount30d} CME
                      </div>
                    </div>
                  </div>
                  {spaceWeather.recentAlerts.length > 0 && (
                    <div className="space-y-1 border-t border-slate-800/80 pt-1.5">
                      {spaceWeather.recentAlerts.slice(0, 2).map((al) => (
                        <div key={al.messageId} className="text-[10px] text-slate-300">
                          <span className="font-mono text-amber-300">
                            [{al.messageType} {al.issueTime.slice(0, 10)}]
                          </span>{' '}
                          {al.summary}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[9px] leading-snug text-slate-400">
                    {spaceWeather.scopeNote} Window: {spaceWeather.windowStart} to {spaceWeather.windowEnd}.
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={envMissionFilter}
                onChange={(e) => setEnvMissionFilter(e.target.value)}
                className="h-8 rounded-md border border-slate-700/80 bg-[#111824] px-2 text-[11px] text-slate-200"
              >
                <option value="all">All Locations</option>
                <option value="perseverance">Jezero (Perseverance)</option>
                <option value="insight">Elysium (InSight)</option>
                <option value="curiosity">Gale (Curiosity)</option>
              </select>

              <select
                value={envKindFilter}
                onChange={(e) => setEnvKindFilter(e.target.value)}
                className="h-8 rounded-md border border-slate-700/80 bg-[#111824] px-2 text-[11px] text-slate-200"
              >
                <option value="all">All Record Types</option>
                <option value="Historical Measurement">Historical Measurements</option>
                <option value="Modeled / Aggregated Range">Modeled Estimates</option>
              </select>
            </div>

            <div className="space-y-2.5">
              {filteredEnv.map((rec) => (
                <div key={rec.id} className="rounded-md border border-slate-700/70 bg-[#111824] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{rec.missionName}</span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                        rec.recordKind === 'Historical Measurement'
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {rec.recordKind}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {rec.instrument} · {rec.location}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {rec.solRange} ({rec.earthDateRange})
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-2 font-mono text-[11px] tabular-nums">
                    <div>
                      <span className="text-[10px] text-slate-500">TEMP RANGE: </span>
                      <span className="text-slate-100">
                        {rec.tempMinC !== null ? `${rec.tempMinC}°C` : 'N/A'} to{' '}
                        {rec.tempMaxC !== null ? `${rec.tempMaxC}°C` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">PRESSURE: </span>
                      <span className="text-cyan-300">
                        {rec.pressurePa !== null ? `${rec.pressurePa} Pa` : 'Unavailable'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">WIND: </span>
                      <span className="text-slate-100">
                        {rec.windSpeedMs !== null ? `${rec.windSpeedMs} m/s` : 'Unavailable'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">DUST (TAU): </span>
                      <span className="text-amber-300">
                        {rec.dustOpacityTau !== null ? rec.dustOpacityTau.toFixed(2) : 'Unavailable'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    Dir: {rec.windDirection || 'Unavailable'}
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-slate-300">{rec.notes}</p>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="truncate pr-2">{rec.source}</span>
                    <button
                      type="button"
                      onClick={() => onFlyTo(rec.lat, rec.lon, 24000, rec.location)}
                      className="shrink-0 text-cyan-400 hover:underline"
                    >
                      Locate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: EVA SURVIVAL TRAVERSE PLANNER */}
        {activeTab === 'routing' && (
          <div className="space-y-3">
            <div className="border-b border-slate-800 pb-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xs font-semibold text-white">
                  EVA Survival Traverse Planner
                </h2>
                {(routeStart || routeDest || hasActiveRoute) && (
                  <button
                    type="button"
                    onClick={onClearRoute}
                    className="rounded-md border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:border-slate-500 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Terrain-aware 16-neighbor A* inside Jezero Crater DEM, or spherical great-circle geodesics anywhere on Mars.
              </p>
              <button
                type="button"
                onClick={onLoadJezeroDemo}
                className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-300 hover:bg-amber-500/20"
              >
                Load Jezero EVA Demo (Butler → Bright Angel)
              </button>
            </div>

            {/* Start Point */}
            <div className="rounded-md border border-slate-700/70 bg-[#111824] p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-emerald-400">Starting Point</span>
                <button
                  type="button"
                  onClick={() => onSetPickMode(pickMode === 'start' ? 'inspect' : 'start')}
                  className={`rounded-md border px-2.5 py-0.5 text-[10px] font-medium ${
                    pickMode === 'start'
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                      : 'border-slate-700 text-slate-300 hover:border-emerald-500/60'
                  }`}
                >
                  {pickMode === 'start' ? 'Click Globe...' : 'Pick on Globe'}
                </button>
              </div>
              <select
                value={matchPresetLabel(routeStart)}
                onChange={(e) => {
                  const found = ROUTE_PRESETS.find((p) => p.label === e.target.value);
                  if (found) onRouteStartChange(found.coord);
                }}
                className="mb-1.5 h-8 w-full rounded-md border border-slate-700/80 bg-[#080B11] px-2.5 text-[11px] text-slate-100"
              >
                <option value="">Choose starting site on Mars...</option>
                {routeStart && matchPresetLabel(routeStart) === '__custom__' && (
                  <option value="__custom__">
                    {routeStart.label || 'Custom'} ({routeStart.lat.toFixed(2)}°, {routeStart.lon.toFixed(2)}°)
                  </option>
                )}
                <optgroup label="Jezero Crater EVA Sites (High-Res DEM A*)">
                  {ROUTE_PRESETS.filter((p) => p.group === 'jezero').map((p) => (
                    <option key={`start-${p.label}`} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Mars Landmarks & Missions (Geodesic)">
                  {ROUTE_PRESETS.filter((p) => p.group === 'global').map((p) => (
                    <option key={`start-${p.label}`} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                {routeStart
                  ? `${routeStart.label ? `${routeStart.label} · ` : ''}${routeStart.lat.toFixed(4)}°, ${routeStart.lon.toFixed(4)}°`
                  : 'No start selected — choose preset or pick on globe'}
              </div>
            </div>

            {/* Swap Button */}
            <div className="flex justify-center -my-1.5">
              <button
                type="button"
                disabled={!routeStart && !routeDest}
                onClick={onSwapEndpoints}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-[#111824] px-2.5 py-0.5 text-[10px] font-medium text-slate-300 hover:border-amber-500/50 hover:text-white disabled:opacity-40"
                title="Swap Start and Destination"
              >
                <ArrowUpDown className="h-3 w-3" />
                Swap
              </button>
            </div>

            {/* Destination Point */}
            <div className="rounded-md border border-slate-700/70 bg-[#111824] p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-rose-400">Destination</span>
                <button
                  type="button"
                  onClick={() =>
                    onSetPickMode(pickMode === 'destination' ? 'inspect' : 'destination')
                  }
                  className={`rounded-md border px-2.5 py-0.5 text-[10px] font-medium ${
                    pickMode === 'destination'
                      ? 'border-rose-400 bg-rose-500/20 text-rose-200'
                      : 'border-slate-700 text-slate-300 hover:border-rose-500/60'
                  }`}
                >
                  {pickMode === 'destination' ? 'Click Globe...' : 'Pick on Globe'}
                </button>
              </div>
              <select
                value={matchPresetLabel(routeDest)}
                onChange={(e) => {
                  const found = ROUTE_PRESETS.find((p) => p.label === e.target.value);
                  if (found) onRouteDestChange(found.coord);
                }}
                className="mb-1.5 h-8 w-full rounded-md border border-slate-700/80 bg-[#080B11] px-2.5 text-[11px] text-slate-100"
              >
                <option value="">Choose destination anywhere on Mars...</option>
                {routeDest && matchPresetLabel(routeDest) === '__custom__' && (
                  <option value="__custom__">
                    {routeDest.label || 'Custom'} ({routeDest.lat.toFixed(2)}°, {routeDest.lon.toFixed(2)}°)
                  </option>
                )}
                <optgroup label="Mars Landmarks & Missions (Geodesic)">
                  {ROUTE_PRESETS.filter((p) => p.group === 'global').map((p) => (
                    <option key={`dest-${p.label}`} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Jezero Crater EVA Sites (High-Res DEM A*)">
                  {ROUTE_PRESETS.filter((p) => p.group === 'jezero').map((p) => (
                    <option key={`dest-${p.label}`} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                {routeDest
                  ? `${routeDest.label ? `${routeDest.label} · ` : ''}${routeDest.lat.toFixed(4)}°, ${routeDest.lon.toFixed(4)}°`
                  : 'No destination selected — choose preset or click Set Dest'}
              </div>
            </div>

            {/* Route Strategy Mode */}
            <div className="rounded-md border border-slate-700/70 bg-[#111824] p-2.5">
              <div className="mb-1.5 text-[11px] font-medium text-slate-300">Survival Route Strategy</div>
              <div className="grid grid-cols-1 gap-1.5">
                {(
                  [
                    ['low_difficulty', 'Lower Estimated Terrain Difficulty'],
                    ['avoid_slopes', 'Avoid Steep Slopes (>12°)'],
                    ['avoid_hazards', 'Avoid Mapped Crater / Dune Hazards'],
                    ['visit_science', 'Prioritize Scientific Targets'],
                    ['shortest', 'Shortest Geodesic Distance'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onRouteModeChange(mode)}
                    className={`rounded-md border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors ${
                      routeMode === mode
                        ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                        : 'border-slate-700/70 bg-[#080B11]/60 text-slate-300 hover:border-slate-500 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Configurable Cost Weights */}
            <div className="rounded-md border border-slate-700/70 bg-[#111824] p-2.5">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                <Sliders className="h-3.5 w-3.5 text-amber-400" />
                Terrain Cost Model Weights
              </div>
              <div className="space-y-2">
                {(
                  [
                    ['distanceWeight', 'Distance Penalty', 0.1, 2.0],
                    ['slopeWeight', 'Slope Gradient Penalty', 0.0, 3.5],
                    ['roughnessWeight', 'Surface Roughness Penalty', 0.0, 3.0],
                    ['hazardWeight', 'Known Hazard Penalty', 0.0, 4.0],
                    ['scienceRewardWeight', 'Science POI Attraction', 0.0, 3.0],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <div key={key}>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>{label}</span>
                      <span className="font-mono text-slate-200 tabular-nums">
                        {routeWeights[key].toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={0.05}
                      value={routeWeights[key]}
                      onChange={(e) =>
                        onRouteWeightsChange({
                          ...routeWeights,
                          [key]: parseFloat(e.target.value),
                        })
                      }
                      className="h-1 w-full accent-amber-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Generate Actions */}
            <div className="grid grid-cols-1 gap-2">
              {(!routeStart || !routeDest) && (
                <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  Select both a <strong>Starting Point</strong> and a <strong>Destination</strong> above (or pick points on Mars) to compute a route.
                </div>
              )}
              <button
                type="button"
                disabled={!routeStart || !routeDest}
                onClick={onGenerateRoute}
                className="w-full rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Compute EVA Route
              </button>
              <button
                type="button"
                disabled={!routeStart || !routeDest}
                onClick={onCompareAllRoutes}
                className="w-full rounded-md border border-amber-500/45 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Compare All 5 Route Strategies
              </button>
              {hasActiveRoute && (
                <>
                  {onLaunchRoverSim && (
                    <button
                      type="button"
                      onClick={onLaunchRoverSim}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-cyan-500/50 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
                    >
                      <Truck className="h-3.5 w-3.5 text-cyan-400" />
                      Drive This Route in Rover Sim
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onFrameActiveRoute}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-[#111824] px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:border-amber-500/40"
                  >
                    <Compass className="h-3.5 w-3.5 text-amber-400" />
                    Zoom to Route on Globe
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
