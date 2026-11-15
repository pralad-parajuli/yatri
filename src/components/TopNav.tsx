import { useEffect, useRef, useState } from 'react';
import {
  CloudSun,
  Compass,
  FileText,
  Globe,
  Grid,
  Images,
  Info,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Mountain,
  Plane,
  Redo2,
  Rocket,
  Route as RouteIcon,
  Satellite,
  Search,
  Settings,
  Truck,
  Undo2,
  X,
} from 'lucide-react';
import { MarsLocation, MarsMission, PlannedRoute } from '../types/mars';
import { parseCoordinateQuery } from '../utils/coordinates';
import { searchMarsTrekNomenclature, TrekSearchItem } from '../services/marsApi';
import { LeftTab } from './LeftSidebar';

interface TopNavProps {
  locations: MarsLocation[];
  missions: MarsMission[];
  activeMissionId: string;
  onSelectMission: (missionId: string) => void;
  onFlyTo: (lat: number, lon: number, altitudeM: number, label?: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onCameraBack: () => void;
  onCameraForward: () => void;
  leftDrawerOpen: boolean;
  activeLeftTab: LeftTab;
  onSelectToolTab: (tab: LeftTab) => void;
  rightDrawerOpen: boolean;
  onToggleRightDrawer: () => void;
  showLegend: boolean;
  onToggleLegend: () => void;
  showGraticule: boolean;
  onToggleGraticule: () => void;
  enable3dTerrain: boolean;
  onToggle3dTerrain: () => void;
  activeRoute: PlannedRoute | null;
  bottomDockOpen: boolean;
  onToggleBottomDock: () => void;
  onOpenReportModal: () => void;
  onOpenSettings: () => void;
  onSetPickMode: (mode: 'inspect' | 'start' | 'destination') => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  flightSimActive?: boolean;
  onOpenFlightSim: () => void;
  roverSimActive?: boolean;
  onOpenRoverSim: () => void;
  satelliteSimActive?: boolean;
  onOpenSatelliteSim: () => void;
  galleryOpen?: boolean;
  onOpenGallery: () => void;
}

type MenuKey = 'file' | 'view' | 'layers' | 'missions' | 'tools' | 'help' | null;

export default function TopNav({
  locations,
  missions,
  activeMissionId,
  onSelectMission,
  onFlyTo,
  canGoBack,
  canGoForward,
  onCameraBack,
  onCameraForward,
  leftDrawerOpen,
  activeLeftTab,
  onSelectToolTab,
  rightDrawerOpen,
  onToggleRightDrawer,
  showLegend,
  onToggleLegend,
  showGraticule,
  onToggleGraticule,
  enable3dTerrain,
  onToggle3dTerrain,
  activeRoute,
  bottomDockOpen,
  onToggleBottomDock,
  onOpenReportModal,
  onOpenSettings,
  onSetPickMode,
  isFullscreen,
  onToggleFullscreen,
  flightSimActive,
  onOpenFlightSim,
  roverSimActive,
  onOpenRoverSim,
  satelliteSimActive,
  onOpenSatelliteSim,
  galleryOpen,
  onOpenGallery,
}: TopNavProps) {
  const [query, setQuery] = useState('');
  const [openResults, setOpenResults] = useState(false);
  const [trekResults, setTrekResults] = useState<TrekSearchItem[]>([]);
  const [searchingTrek, setSearchingTrek] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [showCatalogTip, setShowCatalogTip] = useState(true);
  const [showAttributionToast, setShowAttributionToast] = useState(false);

  const searchBoxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setOpenResults(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3 || parseCoordinateQuery(trimmed)) {
      setTrekResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingTrek(true);
      const res = await searchMarsTrekNomenclature(trimmed);
      setTrekResults(res.items.slice(0, 5));
      setSearchingTrek(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const parsedCoord = parseCoordinateQuery(query);
  const matchingLocations = query.trim()
    ? locations.filter(
        (l) =>
          l.name.toLowerCase().includes(query.toLowerCase()) ||
          l.region.toLowerCase().includes(query.toLowerCase())
      )
    : locations.slice(0, 6);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedCoord) {
      onFlyTo(parsedCoord.lat, parsedCoord.lon, 65000, 'Coordinate Target');
      setOpenResults(false);
      return;
    }
    if (matchingLocations.length > 0) {
      const top = matchingLocations[0];
      onFlyTo(
        top.lat,
        top.lon,
        top.region.includes('Jezero') ? 16000 : 180000,
        top.name
      );
      setOpenResults(false);
    }
  };

  const extractCenterFromWkt = (shape?: string): { lat: number; lon: number } | null => {
    if (!shape) return null;
    const nums = shape.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 2) return null;
    const lon = parseFloat(nums[0]);
    const lat = parseFloat(nums[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  };

  const isToolActive = (tab: LeftTab) => leftDrawerOpen && activeLeftTab === tab;

  const toolBtnClass = (active: boolean) =>
    `relative flex h-7 w-7 2xl:h-8 2xl:w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
      active
        ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
        : 'border-transparent text-slate-300 hover:border-slate-700 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <header className="relative z-30 shrink-0 border-b border-amber-500/20 bg-[#0B0F17] select-none">
      {/* Row 1: Survival Field Manual Command Bar */}
      <div
        ref={menuRef}
        className="flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-slate-800/90 bg-[#080B11] px-3 py-0.5 text-[11px] text-slate-400"
      >
        <div className="flex flex-wrap items-center gap-0.5">
          {(
            [
              ['file', 'Briefings'],
              ['view', 'Optics'],
              ['layers', 'Hazards'],
              ['missions', 'Outposts'],
              ['tools', 'Protocols'],
              ['help', 'Manual'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu((cur) => (cur === key ? null : key))}
                className={`rounded-xs px-2 py-0.5 transition-colors ${
                  openMenu === key ? 'bg-amber-500/20 text-amber-300' : 'hover:bg-white/8 hover:text-white'
                }`}
              >
                {label}
              </button>

              {openMenu === key && (
                <div className="absolute top-6 left-0 z-50 min-w-[220px] rounded-lg border border-amber-500/25 bg-[#0B0F17] py-1.5 text-xs text-slate-200 shadow-2xl">
                  {key === 'file' && (
                    <>
                      <button
                        type="button"
                        disabled={!activeRoute}
                        onClick={() => {
                          onOpenReportModal();
                          setOpenMenu(null);
                        }}
                        className="flex w-full items-center justify-between px-3.5 py-1.5 text-left hover:bg-white/10 disabled:opacity-40"
                      >
                        <span>Export Survival Brief (PDF / GeoJSON)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onToggleFullscreen();
                          setOpenMenu(null);
                        }}
                        className="flex w-full items-center justify-between px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        <span>{isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenSettings();
                          setOpenMenu(null);
                        }}
                        className="flex w-full items-center justify-between px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        <span>Preferences & Units...</span>
                      </button>
                    </>
                  )}

                  {key === 'view' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onFlyTo(18.45, 77.41, 9500000, 'Mars Global View');
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        Global Mars View
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onFlyTo(18.45, 77.41, 22000, 'Jezero Crater');
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        Zoom to Jezero Crater
                      </button>
                      <div className="my-1 border-t border-white/10" />
                      <button
                        type="button"
                        onClick={() => {
                          onToggle3dTerrain();
                          setOpenMenu(null);
                        }}
                        className="flex w-full items-center justify-between px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        <span>3D Jezero Terrain Relief</span>
                        <span className="text-[#8ab4f8]">{enable3dTerrain ? 'ON' : 'OFF'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onToggleGraticule();
                          setOpenMenu(null);
                        }}
                        className="flex w-full items-center justify-between px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        <span>30° Coordinate Graticule</span>
                        <span className="text-[#8ab4f8]">{showGraticule ? 'ON' : 'OFF'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onToggleLegend();
                          setOpenMenu(null);
                        }}
                        className="flex w-full items-center justify-between px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        <span>Map Legend & Provenance</span>
                        <span className="text-[#8ab4f8]">{showLegend ? 'ON' : 'OFF'}</span>
                      </button>
                      <div className="my-1 border-t border-white/10" />
                      <button
                        type="button"
                        onClick={() => {
                          onOpenGallery();
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3.5 py-1.5 text-left font-medium text-amber-300 hover:bg-white/10"
                      >
                        NASA Mars Image Gallery...
                      </button>
                    </>
                  )}

                  {key === 'layers' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectToolTab('layers');
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        Open NASA / USGS Data Catalog
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectToolTab('geology');
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        Geological Units & Scientific POIs
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectToolTab('environment');
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        Historical Sensor Climate Archives
                      </button>
                    </>
                  )}

                  {key === 'missions' && (
                    <div className="max-h-72 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectToolTab('missions');
                          setOpenMenu(null);
                        }}
                        className="block w-full border-b border-white/10 px-3.5 py-1.5 text-left font-medium text-[#8ab4f8] hover:bg-white/10"
                      >
                        Open All 14 Missions Panel
                      </button>
                      {missions.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onSelectMission(m.id);
                            setOpenMenu(null);
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3.5 py-1.5 text-left hover:bg-white/10"
                        >
                          <span className="truncate">{m.name}</span>
                          <span className="shrink-0 text-[10px] text-[#9aa0a6]">{m.missionType}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {key === 'tools' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectToolTab('routing');
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        A* Astronaut EVA Route Planner
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSetPickMode('start');
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        Pick Route Start on Globe
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSetPickMode('destination');
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        Pick Route Destination on Globe
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onToggleBottomDock();
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        {bottomDockOpen ? 'Hide Elevation Profile Tray' : 'Show Elevation Profile Tray'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onToggleRightDrawer();
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3.5 py-1.5 text-left hover:bg-white/10"
                      >
                        {rightDrawerOpen ? 'Hide Location Inspector' : 'Show Location Inspector'}
                      </button>
                      <div className="my-1 border-t border-white/10" />
                      <button
                        type="button"
                        onClick={() => {
                          onOpenRoverSim();
                          setOpenMenu(null);
                        }}
                        className="flex w-full items-center justify-between px-3.5 py-1.5 text-left font-medium text-cyan-300 hover:bg-white/10"
                      >
                        <span>Astronaut Rover Simulator</span>
                        <span className="text-[10px] text-cyan-400">A → B Drive</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenSatelliteSim();
                          setOpenMenu(null);
                        }}
                        className="flex w-full items-center justify-between px-3.5 py-1.5 text-left font-medium text-indigo-300 hover:bg-white/10"
                      >
                        <span>Mars Satellite Simulator</span>
                        <span className="text-[10px] text-indigo-400">Orbit A → B</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenFlightSim();
                          setOpenMenu(null);
                        }}
                        className="flex w-full items-center justify-between px-3.5 py-1.5 text-left font-medium text-orange-300 hover:bg-white/10"
                      >
                        <span>Mars Flight Simulator</span>
                        <span className="text-[10px] text-orange-400">3D Game</span>
                      </button>
                    </>
                  )}

                  {key === 'help' && (
                    <div className="max-w-xs space-y-2 px-3.5 py-2 text-[11px] leading-relaxed text-[#bdc1c6]">
                      <div className="font-semibold text-white">Mars Explorer Scientific Notice</div>
                      <p>
                        Imagery sourced from NASA Mars Trek WMTS & USGS Astrogeology WMS. Traverses from NASA MMGIS archives. Spacecraft 3D meshes from NASA-3D-Resources.
                      </p>
                      <p className="text-amber-300">
                        Not certified for operational rover or astronaut navigation.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAttributionToast(true);
                          setOpenMenu(null);
                        }}
                        className="text-[#8ab4f8] hover:underline"
                      >
                        View Coordinate Datum Info
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="hidden md:flex shrink-0 items-center gap-2 text-[10px] text-amber-400/90">
          <span className="font-mono whitespace-nowrap">Survival Datum: Mars 2000 IAU · 0.38g · ~610 Pa CO₂</span>
        </div>
      </div>

      {/* Row 2: Interplanetary Survival Guide Tactical Toolbar */}
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-3 py-1.5">
        {/* Left & Center: Survival Guide Emblem + Tactical Search + Navigation + Tools */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Survival Guide Reticle Emblem */}
          <button
            type="button"
            onClick={() => onFlyTo(18.45, 77.41, 9500000, 'Mars Global View')}
            className="flex shrink-0 items-center gap-2 rounded-md pr-1 transition-opacity hover:opacity-90"
            title="Interplanetary Survival Guide — Return to Global Sector View"
          >
            <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0">
              <defs>
                <radialGradient id="marsEmblemGrad" cx="35%" cy="32%" r="70%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="45%" stopColor="#d97706" />
                  <stop offset="100%" stopColor="#451a03" />
                </radialGradient>
              </defs>
              <circle cx="16" cy="16" r="14" fill="none" stroke="#f59e0b" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 2" />
              <circle cx="16" cy="16" r="11" fill="url(#marsEmblemGrad)" />
              <path
                d="M16 2v4M16 26v4M2 16h4M26 16h4"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <ellipse cx="16" cy="8.5" rx="3.5" ry="1.1" fill="rgba(255,255,255,0.65)" />
            </svg>
            <span className="hidden xl:inline 2xl:hidden font-display text-[13px] font-bold tracking-wide text-amber-200 whitespace-nowrap">
              Survival Guide
            </span>
            <span className="hidden 2xl:inline font-display text-[13px] font-bold tracking-wide text-amber-200 whitespace-nowrap">
              Interplanetary Survival Guide
            </span>
          </button>

          {/* Tactical Coordinate / Sector Search Input */}
          <div ref={searchBoxRef} className="relative w-40 sm:w-44 xl:w-44 2xl:w-60 shrink-0">
            <form onSubmit={handleSubmit} className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-amber-400/80" />
              <input
                type="text"
                value={query}
                onFocus={() => setOpenResults(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpenResults(true);
                }}
                placeholder="Search survival sector or coords"
                className="h-7 2xl:h-8 w-full rounded-md border border-slate-700/80 bg-[#111824] pr-2.5 pl-8 text-xs text-slate-100 placeholder:text-slate-400 focus:border-amber-500/70 focus:bg-[#0D131E] focus:outline-none"
              />
            </form>

            {openResults && (
              <div className="absolute top-10 left-0 z-50 max-h-80 w-80 overflow-y-auto rounded-lg border border-amber-500/25 bg-[#0B0F17] py-1.5 shadow-2xl">
                {parsedCoord && (
                  <button
                    type="button"
                    onClick={() => {
                      onFlyTo(parsedCoord.lat, parsedCoord.lon, 45000, 'Coordinate Target');
                      setOpenResults(false);
                    }}
                    className="flex w-full items-center justify-between border-b border-slate-800 px-3.5 py-2 text-left text-xs hover:bg-white/10"
                  >
                    <span className="font-medium text-amber-300">
                      Lock sector: {parsedCoord.lat.toFixed(4)}°, {parsedCoord.lon.toFixed(4)}°
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">Go</span>
                  </button>
                )}

                {matchingLocations.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      onFlyTo(
                        loc.lat,
                        loc.lon,
                        loc.region.includes('Jezero') ? 16000 : 160000,
                        loc.name
                      );
                      setOpenResults(false);
                    }}
                    className="flex w-full items-center justify-between border-b border-white/5 px-3.5 py-2 text-left hover:bg-white/10"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate text-xs font-medium text-[#e8eaed]">{loc.name}</div>
                      <div className="truncate text-[11px] text-[#9aa0a6]">{loc.region}</div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-[#9aa0a6] tabular-nums">
                      {loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}°
                    </span>
                  </button>
                ))}

                {searchingTrek && (
                  <div className="px-3.5 py-2 text-[11px] text-[#9aa0a6]">
                    Querying NASA Mars Trek index...
                  </div>
                )}

                {trekResults.length > 0 && (
                  <div className="border-t border-white/10">
                    <div className="bg-black/25 px-3.5 py-1 text-[10px] font-medium text-[#9aa0a6]">
                      NASA Mars Trek Index
                    </div>
                    {trekResults.map((item, idx) => {
                      const center = extractCenterFromWkt(item.shape);
                      return (
                        <button
                          key={`${item.productLabel}-${idx}`}
                          type="button"
                          disabled={!center}
                          onClick={() => {
                            if (center) {
                              onFlyTo(center.lat, center.lon, 60000, item.title);
                              setOpenResults(false);
                            }
                          }}
                          className="flex w-full items-center justify-between border-b border-white/5 px-3.5 py-1.5 text-left hover:bg-white/10 disabled:opacity-50"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="truncate text-xs text-[#e8eaed]">{item.title}</div>
                            <div className="truncate text-[10px] text-[#9aa0a6]">
                              {item.itemType}
                              {item.instrument ? ` · ${item.instrument}` : ''}
                            </div>
                          </div>
                          {center && (
                            <span className="shrink-0 font-mono text-[10px] text-[#8ab4f8] tabular-nums">
                              {center.lat.toFixed(2)}°, {center.lon.toFixed(2)}°
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Camera History & Graticule */}
          <div className="hidden md:flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={onCameraBack}
              className="flex h-7 w-7 2xl:h-8 2xl:w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
              title="Previous Camera View"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canGoForward}
              onClick={onCameraForward}
              className="flex h-7 w-7 2xl:h-8 2xl:w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
              title="Next Camera View"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onToggleGraticule}
              className={toolBtnClass(showGraticule)}
              title="Toggle 30° Mars Graticule Grid"
            >
              <Grid className="h-4 w-4" />
            </button>
          </div>

          <div className="hidden sm:block h-5 w-px shrink-0 bg-slate-800 mx-0.5" />

          {/* Main Spatial Tool Icons */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => onFlyTo(18.45, 77.41, 22000, 'Jezero Crater')}
              className={toolBtnClass(false)}
              title="Fly to Jezero Crater Base Sector"
            >
              <Compass className="h-4 w-4 text-amber-400" />
            </button>

            <button
              type="button"
              onClick={() => onFlyTo(18.45, 77.41, 9500000, 'Mars Global View')}
              className={toolBtnClass(false)}
              title="Return to Global Planetary View"
            >
              <Globe className="h-4 w-4" />
            </button>

            <div className="h-5 w-px bg-slate-800 mx-0.5" />

            <button
              type="button"
              onClick={() => onSelectToolTab('geology')}
              className={toolBtnClass(isToolActive('geology'))}
              title="Surface Targets, Geology & Bookmarks"
            >
              <MapPin className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => onSelectToolTab('missions')}
              className={toolBtnClass(isToolActive('missions'))}
              title="Outposts, Landers & Rover Archives (14)"
            >
              <Rocket className="h-4 w-4" />
            </button>

            {/* Survival Hazard Overlays */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  onSelectToolTab('layers');
                  setShowCatalogTip(false);
                }}
                className={toolBtnClass(isToolActive('layers'))}
                title="Survival Hazard Overlays & Sensor Layers"
              >
                <Layers className="h-4 w-4" />
              </button>

              {showCatalogTip && !leftDrawerOpen && (
                <div className="hidden md:block absolute top-11 left-1/2 z-50 w-72 -translate-x-1/2 rounded-lg border border-amber-500/35 bg-[#0B0F17] p-3.5 text-xs text-slate-200 shadow-2xl">
                  <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-t border-l border-amber-500/35 bg-[#0B0F17]" />
                  <p className="leading-relaxed text-slate-200">
                    Open the Survival Field Manual to inspect terrain hazards, atmospheric conditions, shelter outposts, and EVA traverse planning.
                  </p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowCatalogTip(false)}
                      className="font-medium text-slate-400 hover:text-white"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectToolTab('layers');
                        setShowCatalogTip(false);
                      }}
                      className="rounded-md bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/30"
                    >
                      Open Manual
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSelectToolTab('routing')}
              className={toolBtnClass(isToolActive('routing'))}
              title="EVA Survival Traverse Planner"
            >
              <RouteIcon className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => onSelectToolTab('environment')}
              className={toolBtnClass(isToolActive('environment'))}
              title="Atmospheric, Radiation & Dust Weather Logs"
            >
              <CloudSun className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onOpenGallery}
              className={toolBtnClass(Boolean(galleryOpen))}
              title="NASA Mars Image Gallery (images-api.nasa.gov)"
            >
              <Images className="h-4 w-4 text-amber-300" />
            </button>

            <div className="hidden lg:block h-5 w-px shrink-0 bg-slate-800 mx-0.5" />

            <button
              type="button"
              onClick={onToggleBottomDock}
              className={`max-lg:hidden ${toolBtnClass(bottomDockOpen)}`}
              title="Toggle Traverse Elevation & Hazard Tray"
            >
              <Mountain className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onToggleLegend}
              className={`max-lg:hidden ${toolBtnClass(showLegend)}`}
              title="Toggle Survival Hazard & Layer Key"
            >
              <Info className="h-4 w-4" />
            </button>

            {activeRoute && (
              <button
                type="button"
                onClick={onOpenReportModal}
                className="max-lg:hidden flex h-7 w-7 2xl:h-8 2xl:w-8 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white"
                title="Export Survival Traverse Brief (PDF / GeoJSON / CSV)"
              >
                <FileText className="h-4 w-4" />
              </button>
            )}

            <div className="h-5 w-px shrink-0 bg-slate-800 mx-0.5" />

            <button
              type="button"
              onClick={onOpenRoverSim}
              className={`flex h-7 2xl:h-8 items-center gap-1.5 rounded-md border px-2 2xl:px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                roverSimActive
                  ? 'border-cyan-500/70 bg-cyan-500/20 text-cyan-300'
                  : 'border-slate-700/80 bg-[#111824] text-slate-200 hover:border-cyan-500/50 hover:bg-cyan-500/15 hover:text-cyan-200'
              }`}
              title="Launch Astronaut Point-to-Point Rover Simulator"
            >
              <Truck className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
              <span className="hidden xl:inline 2xl:hidden">Rover</span>
              <span className="hidden 2xl:inline">Rover Sim</span>
            </button>

            <button
              type="button"
              onClick={onOpenSatelliteSim}
              className={`flex h-7 2xl:h-8 items-center gap-1.5 rounded-md border px-2 2xl:px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                satelliteSimActive
                  ? 'border-indigo-500/70 bg-indigo-500/20 text-indigo-300'
                  : 'border-slate-700/80 bg-[#111824] text-slate-200 hover:border-indigo-500/50 hover:bg-indigo-500/15 hover:text-indigo-200'
              }`}
              title="Launch Mars Satellite Orbital Transit Simulator"
            >
              <Satellite className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
              <span className="hidden xl:inline 2xl:hidden">Orbit</span>
              <span className="hidden 2xl:inline">Orbit Sim</span>
            </button>

            <button
              type="button"
              onClick={onOpenFlightSim}
              className={`flex h-7 2xl:h-8 items-center gap-1.5 rounded-md border px-2 2xl:px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                flightSimActive
                  ? 'border-orange-500/70 bg-orange-500/20 text-orange-300'
                  : 'border-slate-700/80 bg-[#111824] text-slate-200 hover:border-orange-500/50 hover:bg-orange-500/15 hover:text-orange-200'
              }`}
              title="Launch Mars Flight Simulator Game"
            >
              <Plane className="h-3.5 w-3.5 shrink-0 text-orange-400" />
              <span className="hidden xl:inline 2xl:hidden">Flight</span>
              <span className="hidden 2xl:inline">Flight Sim</span>
            </button>
          </div>
        </div>

        {/* Right: Outpost Selector, Settings, Fullscreen, Site Dossier */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <select
            aria-label="Jump to Mars mission"
            value={activeMissionId}
            onChange={(e) => onSelectMission(e.target.value)}
            className="hidden xl:block h-7 2xl:h-8 max-w-[140px] 2xl:max-w-[180px] rounded-md border border-slate-700/80 bg-[#111824] px-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
          >
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-7 w-7 2xl:h-8 2xl:w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
            title="Datum & Hazard Threshold Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            className="flex h-7 w-7 2xl:h-8 2xl:w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onToggleRightDrawer}
            className={`flex h-7 2xl:h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
              rightDrawerOpen
                ? 'border-amber-500/60 bg-amber-500/20 text-amber-200'
                : 'border-slate-700/80 bg-[#111824] text-slate-200 hover:border-amber-500/40 hover:text-white'
            }`}
            title="Toggle Site Survival Dossier"
          >
            <Compass className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span className="hidden sm:inline">Site Dossier</span>
          </button>
        </div>
      </div>

      {showAttributionToast && (
        <div className="absolute top-20 right-4 z-50 w-80 rounded-lg border border-amber-500/30 bg-[#0B0F17] p-4 text-xs text-slate-200 shadow-2xl">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-display font-semibold text-white">Survival Datum & Attribution</span>
            <button
              type="button"
              onClick={() => setShowAttributionToast(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300">
            Coordinates use Mars 2000 IAU Planetocentric Sphere (R = 3,396,190 m). Imagery streamed from NASA Mars Trek WMTS & USGS Astrogeology WMS; traverses from NASA/JPL MMGIS.
          </p>
        </div>
      )}
    </header>
  );
}
