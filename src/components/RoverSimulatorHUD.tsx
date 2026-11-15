import { useState } from 'react';
import {
  ArrowLeftRight,
  Award,
  BatteryCharging,
  Compass,
  Crosshair,
  Eye,
  Flag,
  Gamepad2,
  Gauge,
  MapPin,
  Navigation,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Route as RouteIcon,
  ShieldAlert,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import {
  MarsCoordinate,
  PlannedRoute,
  RouteMode,
  RoverCameraMode,
  RoverDriveMode,
  RoverHudTelemetry,
  RoverSimStatus,
  RoverTouchInput,
  RoverVehicleId,
} from '../types/mars';
import {
  formatEtaSeconds,
  formatRoverDuration,
  ROVER_EXPEDITIONS,
  ROVER_VEHICLES,
  ROVER_WAYPOINT_PRESETS,
} from '../data/roverMissions';

interface RoverSimulatorHUDProps {
  status: RoverSimStatus;
  vehicleId: RoverVehicleId;
  cameraMode: RoverCameraMode;
  driveMode: RoverDriveMode;
  timeScale: 1 | 5 | 20;
  muted: boolean;
  startCoord: MarsCoordinate;
  destCoord: MarsCoordinate;
  routeMode: RouteMode;
  plannedRoute: PlannedRoute | null;
  hasExplorerRoute: boolean;
  hud: RoverHudTelemetry;
  touchControlRef: React.MutableRefObject<RoverTouchInput>;
  onSelectVehicle: (id: RoverVehicleId) => void;
  onSelectExpedition: (presetId: string) => void;
  onChangeStart: (coord: MarsCoordinate) => void;
  onChangeDest: (coord: MarsCoordinate) => void;
  onSwapEndpoints: () => void;
  onUseExplorerRoute: () => void;
  onPickOnGlobe: (which: 'start' | 'destination') => void;
  onChangeRouteMode: (mode: RouteMode) => void;
  onSetDriveMode: (mode: RoverDriveMode) => void;
  onSetTimeScale: (scale: 1 | 5 | 20) => void;
  onToggleCamera: () => void;
  onToggleMute: () => void;
  onStartDrive: () => void;
  onRestartDrive: () => void;
  onReturnTrip: () => void;
  onOpenSetup: () => void;
  onTogglePause: () => void;
  onExit: () => void;
}

const COMPASS_MARKS: Array<{ deg: number; label: string }> = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
];

function wrapSignedAngleDeg(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function matchPresetKey(coord: MarsCoordinate): string {
  const hit = ROVER_WAYPOINT_PRESETS.find(
    (p) => Math.abs(p.coord.lat - coord.lat) < 0.002 && Math.abs(p.coord.lon - coord.lon) < 0.002
  );
  return hit ? hit.coord.label || '' : '__custom__';
}

export default function RoverSimulatorHUD({
  status,
  vehicleId,
  cameraMode,
  driveMode,
  timeScale,
  muted,
  startCoord,
  destCoord,
  routeMode,
  plannedRoute,
  hasExplorerRoute,
  hud,
  touchControlRef,
  onSelectVehicle,
  onSelectExpedition,
  onChangeStart,
  onChangeDest,
  onSwapEndpoints,
  onUseExplorerRoute,
  onPickOnGlobe,
  onChangeRouteMode,
  onSetDriveMode,
  onSetTimeScale,
  onToggleCamera,
  onToggleMute,
  onStartDrive,
  onRestartDrive,
  onReturnTrip,
  onOpenSetup,
  onTogglePause,
  onExit,
}: RoverSimulatorHUDProps) {
  const [showTouchPad, setShowTouchPad] = useState(false);

  const vehicle = ROVER_VEHICLES[vehicleId];
  const destBearingOffset = wrapSignedAngleDeg(hud.destBearingDeg - hud.headingDeg);
  const wpBearingOffset =
    hud.nextWaypointBearingDeg !== null
      ? wrapSignedAngleDeg(hud.nextWaypointBearingDeg - hud.headingDeg)
      : null;

  const setTouch = (patch: Partial<RoverTouchInput>) => {
    Object.assign(touchControlRef.current, patch);
  };

  if (status === 'setup') {
    const distKm = plannedRoute ? plannedRoute.totalDistanceKm : hud.destDistM / 1000;
    const estCruiseHours = distKm / Math.max(1, vehicle.cruiseSpeedMs * 3.6);
    const estMinutes = Math.round(estCruiseHours * 60);

    return (
      <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/15 bg-[#0B0E17]/95 shadow-2xl">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
            <div>
              <div className="text-[11px] font-medium tracking-wider text-cyan-400 uppercase">
                Astronaut Surface Mobility Console
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-white">
                Mars Rover Transit Simulator
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Plan any point-to-point surface traverse across Mars and drive manually or engage terrain-following Autopilot.
              </p>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-slate-300 hover:bg-white/15 hover:text-white"
              title="Exit Rover Simulator"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="grid flex-1 gap-5 overflow-y-auto p-6 lg:grid-cols-12">
            {/* Left Column: Origin, Destination & Corridor Strategy */}
            <div className="space-y-4 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-slate-200">
                  1. Set Origin & Destination
                </div>
                {hasExplorerRoute && (
                  <button
                    type="button"
                    onClick={onUseExplorerRoute}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/12 px-2.5 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/20 whitespace-nowrap"
                  >
                    <RouteIcon className="h-3.5 w-3.5" />
                    Import Planned Route
                  </button>
                )}
              </div>

              {/* Start & Destination Selectors */}
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="rounded-lg border border-white/10 bg-[#111827]/90 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-emerald-400">Origin (Start)</span>
                    <button
                      type="button"
                      onClick={() => onPickOnGlobe('start')}
                      className="flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"
                    >
                      <Crosshair className="h-3 w-3" />
                      Pick on Globe
                    </button>
                  </div>
                  <select
                    value={matchPresetKey(startCoord)}
                    onChange={(e) => {
                      const hit = ROVER_WAYPOINT_PRESETS.find(
                        (p) => p.coord.label === e.target.value
                      );
                      if (hit) onChangeStart(hit.coord);
                    }}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#07090E] px-2.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                  >
                    {matchPresetKey(startCoord) === '__custom__' && (
                      <option value="__custom__">
                        {startCoord.label || 'Custom Site'} ({startCoord.lat.toFixed(2)}°,{' '}
                        {startCoord.lon.toFixed(2)}°)
                      </option>
                    )}
                    <optgroup label="Jezero Crater (High-Res DEM A*)">
                      {ROVER_WAYPOINT_PRESETS.filter((p) => p.group === 'jezero').map((p) => (
                        <option key={`s-${p.coord.label}`} value={p.coord.label}>
                          {p.coord.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Mars Global Sites">
                      {ROVER_WAYPOINT_PRESETS.filter((p) => p.group === 'mars').map((p) => (
                        <option key={`s-${p.coord.label}`} value={p.coord.label}>
                          {p.coord.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="mt-1.5 font-mono text-[10px] text-slate-400 tabular-nums">
                    {startCoord.lat.toFixed(4)}°N, {startCoord.lon.toFixed(4)}°E
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onSwapEndpoints}
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-slate-300 hover:border-cyan-400/60 hover:text-white"
                  title="Swap Origin and Destination"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>

                <div className="rounded-lg border border-white/10 bg-[#111827]/90 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-amber-400">Destination</span>
                    <button
                      type="button"
                      onClick={() => onPickOnGlobe('destination')}
                      className="flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"
                    >
                      <Crosshair className="h-3 w-3" />
                      Pick on Globe
                    </button>
                  </div>
                  <select
                    value={matchPresetKey(destCoord)}
                    onChange={(e) => {
                      const hit = ROVER_WAYPOINT_PRESETS.find(
                        (p) => p.coord.label === e.target.value
                      );
                      if (hit) onChangeDest(hit.coord);
                    }}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#07090E] px-2.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                  >
                    {matchPresetKey(destCoord) === '__custom__' && (
                      <option value="__custom__">
                        {destCoord.label || 'Custom Target'} ({destCoord.lat.toFixed(2)}°,{' '}
                        {destCoord.lon.toFixed(2)}°)
                      </option>
                    )}
                    <optgroup label="Jezero Crater (High-Res DEM A*)">
                      {ROVER_WAYPOINT_PRESETS.filter((p) => p.group === 'jezero').map((p) => (
                        <option key={`d-${p.coord.label}`} value={p.coord.label}>
                          {p.coord.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Mars Global Sites">
                      {ROVER_WAYPOINT_PRESETS.filter((p) => p.group === 'mars').map((p) => (
                        <option key={`d-${p.coord.label}`} value={p.coord.label}>
                          {p.coord.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="mt-1.5 font-mono text-[10px] text-slate-400 tabular-nums">
                    {destCoord.lat.toFixed(4)}°N, {destCoord.lon.toFixed(4)}°E
                  </div>
                </div>
              </div>

              {/* Corridor Strategy + Computed Metrics */}
              <div className="rounded-lg border border-white/10 bg-[#111827]/75 p-3.5">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-300">
                    Pathfinding Strategy
                  </span>
                  <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-[#07090E] p-1">
                    {(
                      [
                        ['low_difficulty', 'Balanced'],
                        ['avoid_slopes', 'Flattest'],
                        ['avoid_hazards', 'Safest'],
                        ['visit_science', 'Science'],
                        ['shortest', 'Direct'],
                      ] as const
                    ).map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onChangeRouteMode(m)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                          routeMode === m
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3 font-mono tabular-nums sm:grid-cols-4">
                  <div>
                    <div className="text-[10px] text-slate-400">DISTANCE</div>
                    <div className="mt-0.5 text-sm font-semibold text-white">
                      {distKm.toFixed(2)} <span className="text-[10px] text-slate-400">km</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">ASCENT / DESCENT</div>
                    <div className="mt-0.5 text-sm font-semibold text-cyan-300">
                      +{plannedRoute ? Math.round(plannedRoute.totalAscentM) : 0} / -
                      {plannedRoute ? Math.round(plannedRoute.totalDescentM) : 0}
                      <span className="ml-1 text-[10px] text-slate-400">m</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">PEAK SLOPE</div>
                    <div className="mt-0.5 text-sm font-semibold text-amber-300">
                      {plannedRoute ? plannedRoute.maxSlopeDeg.toFixed(1) : '—'}°
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">EST. TRANSIT (1X)</div>
                    <div className="mt-0.5 text-sm font-semibold text-emerald-300">
                      ~{estMinutes} <span className="text-[10px] text-slate-400">min</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Curated Expedition Presets */}
              <div>
                <div className="mb-2 text-xs font-medium text-slate-300">
                  Quick Astronaut Transit Corridors
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ROVER_EXPEDITIONS.map((exp) => {
                    const isSelected =
                      Math.abs(exp.start.lat - startCoord.lat) < 0.002 &&
                      Math.abs(exp.start.lon - startCoord.lon) < 0.002 &&
                      Math.abs(exp.destination.lat - destCoord.lat) < 0.002 &&
                      Math.abs(exp.destination.lon - destCoord.lon) < 0.002;
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => onSelectExpedition(exp.id)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-cyan-500/70 bg-cyan-500/12'
                            : 'border-white/10 bg-[#111827]/70 hover:border-white/25'
                        }`}
                      >
                        <div className="text-xs font-semibold text-white">{exp.name}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">{exp.region}</div>
                        <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-300">
                          {exp.subtitle}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Vehicle Selection, Drive Mode & Controls */}
            <div className="flex flex-col justify-between space-y-4 lg:col-span-5">
              <div className="space-y-3">
                <div className="text-xs font-medium text-slate-200">2. Surface Rover</div>
                <div className="space-y-2.5">
                  {(Object.keys(ROVER_VEHICLES) as RoverVehicleId[]).map((id) => {
                    const spec = ROVER_VEHICLES[id];
                    const selected = vehicleId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onSelectVehicle(id)}
                        className={`w-full rounded-lg border p-3.5 text-left transition-colors ${
                          selected
                            ? 'border-cyan-500/70 bg-cyan-500/12'
                            : 'border-white/10 bg-[#111827]/70 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-white">{spec.name}</span>
                          <span className="font-mono text-[11px] text-cyan-300 tabular-nums">
                            {Math.round(spec.maxSpeedMs * 3.6)} km/h
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-amber-300/90">{spec.role}</div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                          {spec.description}
                        </p>
                        <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-slate-300 tabular-nums">
                          <span>Cruise {Math.round(spec.cruiseSpeedMs * 3.6)} km/h</span>
                          <span aria-hidden="true">·</span>
                          <span>Boost {Math.round(spec.boostSpeedMs * 3.6)} km/h</span>
                          <span aria-hidden="true">·</span>
                          <span>Max Grade {spec.maxSafeSlopeDeg}°</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Drive Mode & Time Warp */}
                <div className="rounded-lg border border-white/10 bg-[#111827]/75 p-3.5 text-xs">
                  <div className="mb-2 text-[11px] font-medium text-slate-300">
                    3. Assistance & Controls
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onSetDriveMode('autopilot')}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        driveMode === 'autopilot'
                          ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                          : 'border-white/10 bg-[#07090E] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="font-semibold">Autopilot Cruise</div>
                      <div className="mt-0.5 text-[10px] opacity-80">
                        Auto-steers A → B route
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetDriveMode('manual')}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        driveMode === 'manual'
                          ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                          : 'border-white/10 bg-[#07090E] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="font-semibold">Manual Drive</div>
                      <div className="mt-0.5 text-[10px] opacity-80">
                        Full WASD / Arrow steer
                      </div>
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-white/10 pt-2.5 text-[11px] text-slate-400">
                    <div>
                      <span className="font-mono text-slate-200">W / S</span> Throttle / Reverse
                    </div>
                    <div>
                      <span className="font-mono text-slate-200">A / D</span> Steer Left / Right
                    </div>
                    <div>
                      <span className="font-mono text-slate-200">T</span> Toggle Autopilot
                    </div>
                    <div>
                      <span className="font-mono text-slate-200">C</span> Cycle 3 Cameras
                    </div>
                    <div>
                      <span className="font-mono text-slate-200">Shift</span> Torque Boost
                    </div>
                    <div>
                      <span className="font-mono text-slate-200">Space</span> Handbrake
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={onExit}
                  className="rounded-lg border border-white/12 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
                >
                  Return to Explorer
                </button>
                <button
                  type="button"
                  onClick={onStartDrive}
                  className="flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-cyan-500 whitespace-nowrap"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>Deploy Rover</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* Top Rover Telemetry Ribbon */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 border-b border-white/12 bg-[#0B0E17]/88 px-3 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono text-xs font-semibold text-cyan-300 whitespace-nowrap">
            {vehicle.shortName}
          </span>
          <span className="hidden md:inline text-xs text-slate-400 truncate">
            {startCoord.label || 'Origin'} → {destCoord.label || 'Destination'}
          </span>

          <div className="flex items-center gap-1.5 pl-1">
            <button
              type="button"
              onClick={() => onSetDriveMode(driveMode === 'autopilot' ? 'manual' : 'autopilot')}
              className={`flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                driveMode === 'autopilot'
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/12 bg-white/5 text-slate-200 hover:bg-white/12'
              }`}
              title="Toggle Autopilot / Manual Drive (T)"
            >
              <Navigation className="h-3 w-3" />
              <span>{driveMode === 'autopilot' ? '● Autopilot' : '● Manual'}</span>
            </button>

            <div className="hidden sm:flex items-center rounded-lg border border-white/12 bg-black/40 p-0.5">
              {([1, 5, 20] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSetTimeScale(s)}
                  className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                    timeScale === s
                      ? 'bg-cyan-500/25 text-cyan-200'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={`Simulation Speed ${s}x`}
                >
                  {s}x
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleCamera}
              className="flex h-7 items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-2.5 text-[11px] text-slate-200 hover:bg-white/12 whitespace-nowrap"
              title="Cycle Camera View (C)"
            >
              <Eye className="h-3 w-3" />
              <span>
                {cameraMode === 'chase'
                  ? 'Chase'
                  : cameraMode === 'cabin'
                  ? 'Cabin'
                  : 'Overhead'}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-slate-300 hover:bg-white/12 hover:text-white"
              title="Toggle Audio Cues"
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Center Progress & Timer */}
        <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
          <span className="text-slate-200">{formatRoverDuration(hud.elapsedMs)}</span>
          <span aria-hidden="true" className="text-white/20">
            ·
          </span>
          <span className="text-cyan-300">{Math.round(hud.progressPct)}%</span>
          <span aria-hidden="true" className="hidden sm:inline text-white/20">
            ·
          </span>
          <span className="hidden sm:inline text-slate-300">
            {(hud.distanceRemainingM / 1000).toFixed(2)} km left
          </span>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowTouchPad((v) => !v)}
            className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] whitespace-nowrap ${
              showTouchPad
                ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-200'
                : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/12'
            }`}
            title="Toggle On-Screen Drive Pad"
          >
            <Gamepad2 className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Drive Pad</span>
          </button>

          {(status === 'driving' || status === 'paused') && (
            <button
              type="button"
              onClick={onTogglePause}
              className="flex h-7 items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-2.5 text-[11px] text-slate-100 hover:bg-white/15 whitespace-nowrap"
              title="Pause / Resume (P)"
            >
              {status === 'paused' ? (
                <>
                  <Play className="h-3 w-3" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3" />
                  <span>Pause</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSetup}
            className="hidden sm:flex h-7 items-center rounded-lg border border-white/12 bg-white/5 px-2.5 text-[11px] text-slate-200 hover:bg-white/15 whitespace-nowrap"
          >
            Route Setup
          </button>

          <button
            type="button"
            onClick={onExit}
            className="flex h-7 items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 text-[11px] font-medium text-rose-200 hover:bg-rose-500/25 whitespace-nowrap"
            title="Exit Rover Simulator (Esc)"
          >
            <X className="h-3.5 w-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Top-Center Compass & Destination Bearing Tape */}
      <div className="mx-auto mt-2.5 flex w-64 flex-col items-center">
        <div className="relative h-7 w-full overflow-hidden rounded-lg border border-white/12 bg-[#0B0E17]/75 backdrop-blur-sm">
          {COMPASS_MARKS.map((mark) => {
            const diff = wrapSignedAngleDeg(mark.deg - hud.headingDeg);
            if (Math.abs(diff) > 65) return null;
            const leftPct = 50 + (diff / 65) * 48;
            return (
              <div
                key={mark.deg}
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${leftPct}%` }}
              >
                <div className="h-1.5 w-px bg-white/50" />
                <span className="font-mono text-[10px] font-semibold text-slate-200">
                  {mark.label}
                </span>
              </div>
            );
          })}

          {wpBearingOffset !== null && Math.abs(wpBearingOffset) <= 65 && (
            <div
              className="absolute bottom-0.5 -translate-x-1/2 text-[10px] text-cyan-400"
              style={{ left: `${50 + (wpBearingOffset / 65) * 48}%` }}
              title="Next Route Waypoint"
            >
              ▲
            </div>
          )}

          {Math.abs(destBearingOffset) <= 65 && (
            <div
              className="absolute bottom-0.5 -translate-x-1/2 text-[10px] text-amber-400"
              style={{ left: `${50 + (destBearingOffset / 65) * 48}%` }}
              title="Final Destination Bearing"
            >
              ◆
            </div>
          )}

          <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-cyan-400/80" />
        </div>
        <div className="mt-1 flex items-center gap-2 rounded bg-[#0B0E17]/80 px-2.5 py-0.5 font-mono text-[11px] tabular-nums">
          <span className="font-semibold text-cyan-300">
            HDG {String(Math.round(((hud.headingDeg % 360) + 360) % 360)).padStart(3, '0')}°
          </span>
          <span className="text-white/25">·</span>
          <span className="text-amber-300">
            DEST {hud.destDistM >= 1000 ? `${(hud.destDistM / 1000).toFixed(2)} km` : `${Math.round(hud.destDistM)} m`}
          </span>
        </div>
      </div>

      {/* Warning & Nearby POI Alerts */}
      <div className="mx-auto mt-2 flex max-w-md flex-col items-center gap-1.5 px-4">
        {hud.steepGradeWarning && status === 'driving' && (
          <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-950/85 px-3 py-1 font-mono text-[11px] font-semibold text-amber-200 shadow-lg">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
            <span>▲ STEEP GRADE {hud.slopeDeg.toFixed(1)}° · SPEED GOVERNED</span>
          </div>
        )}
        {hud.nearbyPoiName && hud.nearbyPoiDistM !== null && (
          <div className="flex items-center gap-1.5 rounded-lg border border-cyan-500/50 bg-[#0B0E17]/88 px-3 py-1 text-[11px] text-cyan-200 shadow-lg">
            <MapPin className="h-3.5 w-3.5 text-cyan-400" />
            <span>
              Science Target Nearby: <strong>{hud.nearbyPoiName}</strong> (
              {Math.round(hud.nearbyPoiDistM)} m)
            </span>
          </div>
        )}
      </div>

      {/* Left Instrument Cluster: Speed, Drivetrain, Power & Life Support */}
      <div className="absolute top-1/2 left-4 hidden -translate-y-1/2 space-y-2.5 sm:block">
        <div className="w-48 rounded-lg border border-white/12 bg-[#0B0E17]/84 p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[10px] tracking-wider text-slate-400 uppercase">
            <span>Ground Speed</span>
            <Gauge className="h-3 w-3 text-cyan-400" />
          </div>
          <div className="mt-0.5 font-mono text-2xl font-bold text-white tabular-nums">
            {hud.speedKmh.toFixed(1)}
            <span className="ml-1.5 text-[11px] font-normal text-slate-400">km/h</span>
          </div>
          <div className="font-mono text-[10px] text-slate-400 tabular-nums">
            {hud.speedMs.toFixed(2)} m/s · Avg {hud.avgSpeedKmh.toFixed(1)} km/h
          </div>

          {hud.boosting && (
            <div className="mt-1.5 flex items-center gap-1 font-mono text-[10px] font-semibold text-amber-300">
              <Zap className="h-3 w-3" />
              <span>TORQUE BOOST</span>
            </div>
          )}

          {/* Drivetrain & Surface Grip */}
          <div className="mt-2.5 grid grid-cols-3 gap-1 border-t border-white/10 pt-2 font-mono text-[10px] tabular-nums">
            <div>
              <div className="text-[9px] text-slate-500">WHEEL RPM</div>
              <div className="text-slate-200">{Math.round(hud.wheelRpm)}</div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500">DRAW</div>
              <div className="text-cyan-300">{hud.powerDrawKw.toFixed(1)} kW</div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500">SLIP</div>
              <div className={hud.slipPct > 12 ? 'text-amber-300' : 'text-slate-200'}>
                {hud.slipPct.toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Battery SOC */}
          <div className="mt-2.5 border-t border-white/10 pt-2">
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] tabular-nums">
              <span className="flex items-center gap-1 text-slate-300">
                <BatteryCharging className="h-3 w-3 text-emerald-400" />
                BATTERY
              </span>
              <span className="text-emerald-300">{hud.batteryPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
              <div
                className={`h-full transition-all duration-150 ${
                  hud.batteryPct < 20 ? 'bg-rose-500' : 'bg-emerald-400'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, hud.batteryPct))}%` }}
              />
            </div>
          </div>

          {/* Cabin Oxygen & Ambient Temp */}
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] tabular-nums">
              <span className="flex items-center gap-1 text-slate-300">
                <Wind className="h-3 w-3 text-cyan-400" />
                CABIN O₂
              </span>
              <span className="text-cyan-300">
                {hud.oxygenPct.toFixed(1)}% · {hud.ambientTempC.toFixed(0)}°C
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
              <div
                className="h-full bg-cyan-400 transition-all duration-150"
                style={{ width: `${Math.max(0, Math.min(100, hud.oxygenPct))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Live Transit Logbook */}
        {hud.transitEvents.length > 0 && (
          <div className="hidden lg:block w-48 rounded-lg border border-white/12 bg-[#0B0E17]/80 p-2.5 backdrop-blur-sm">
            <div className="mb-1.5 text-[10px] font-medium tracking-wider text-slate-400 uppercase">
              Traverse Logbook
            </div>
            <div className="space-y-1.5">
              {hud.transitEvents.slice(0, 3).map((ev, idx) => (
                <div key={`${ev.timeLabel}-${idx}`} className="text-[10px] leading-snug">
                  <span className="font-mono text-slate-400">{ev.timeLabel}</span>{' '}
                  <span
                    className={
                      ev.kind === 'warn'
                        ? 'text-amber-300'
                        : ev.kind === 'science'
                        ? 'text-cyan-300'
                        : ev.kind === 'relay'
                        ? 'text-emerald-300'
                        : 'text-slate-200'
                    }
                  >
                    {ev.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Instrument Cluster: Terrain Inclinometer, Elevation Sparkline & Satellite Relay */}
      <div className="absolute top-1/2 right-4 hidden -translate-y-1/2 space-y-2.5 sm:block">
        <div className="w-48 rounded-lg border border-white/12 bg-[#0B0E17]/84 p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[10px] tracking-wider text-slate-400 uppercase">
            <span>Terrain & Suspension</span>
            <Compass className="h-3 w-3 text-amber-400" />
          </div>

          {/* Compact Pitch/Roll SVG Inclinometer */}
          <div className="my-2 flex items-center justify-between gap-2">
            <svg viewBox="-32 -32 64 64" className="h-14 w-14 shrink-0 rounded-full border border-white/15 bg-black/50">
              <line x1="-24" y1="0" x2="24" y2="0" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
              <line x1="0" y1="-24" x2="0" y2="24" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
              <g transform={`rotate(${-hud.rollDeg}) translate(0, ${Math.max(-18, Math.min(18, hud.pitchDeg * 0.8))})`}>
                <line x1="-22" y1="0" x2="22" y2="0" stroke="#22d3ee" strokeWidth="2" />
                <polygon points="-5,0 0,-6 5,0" fill="#f59e0b" />
              </g>
            </svg>
            <div className="text-right font-mono tabular-nums">
              <div
                className={`text-lg font-bold ${
                  hud.steepGradeWarning ? 'text-amber-400' : 'text-white'
                }`}
              >
                {hud.slopeDeg.toFixed(1)}°
              </div>
              <div className="text-[10px] text-slate-400">
                P {hud.pitchDeg >= 0 ? '+' : ''}
                {hud.pitchDeg.toFixed(1)}° · R {hud.rollDeg.toFixed(1)}°
              </div>
              <div className="text-[10px] text-cyan-300">
                BOGIE {Math.round(hud.suspensionCompressionPct)}%
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-2 font-mono text-[10px] text-slate-300 tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-400">ELEV</span>
              <span>{hud.elevM !== null ? `${hud.elevM.toFixed(0)} m` : 'Regional'}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-400">WAYPOINT</span>
              <span>
                {Math.min(hud.waypointIdx + 1, Math.max(1, hud.totalWaypoints))} /{' '}
                {Math.max(1, hud.totalWaypoints)}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-400">ETA ({timeScale}x)</span>
              <span className="text-cyan-300">{formatEtaSeconds(hud.etaSeconds)}</span>
            </div>
          </div>

          {/* Live Route Elevation Profile Sparkline */}
          {plannedRoute && plannedRoute.profile.length >= 2 && (
            <div className="mt-2 border-t border-white/10 pt-2">
              {(() => {
                const pts = plannedRoute.profile.filter((pt) => pt.elevationM !== null);
                if (pts.length < 2) return null;
                const minE = Math.min(...pts.map((pt) => pt.elevationM as number));
                const maxE = Math.max(...pts.map((pt) => pt.elevationM as number));
                const spanE = Math.max(10, maxE - minE);
                const w = 164;
                const h = 30;
                const polyPts = pts
                  .map((pt, idx) => {
                    const x = (idx / (pts.length - 1)) * w;
                    const y = h - 3 - (((pt.elevationM as number) - minE) / spanE) * (h - 6);
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(' ');
                const progX = Math.max(0, Math.min(1, hud.progressPct / 100)) * w;
                const curIdx = Math.min(
                  pts.length - 1,
                  Math.max(0, Math.round((hud.progressPct / 100) * (pts.length - 1)))
                );
                const progY =
                  h - 3 - (((pts[curIdx].elevationM as number) - minE) / spanE) * (h - 6);
                return (
                  <div>
                    <div className="mb-1 flex justify-between font-mono text-[9px] text-slate-400 tabular-nums">
                      <span>GRADE PROFILE</span>
                      <span>
                        {Math.round(minE)}..{Math.round(maxE)}m
                      </span>
                    </div>
                    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full overflow-visible">
                      <polyline
                        fill="none"
                        stroke="rgba(34,211,238,0.55)"
                        strokeWidth="1.5"
                        points={polyPts}
                      />
                      <circle cx={progX} cy={progY} r="3" fill="#f59e0b" stroke="#0B0E17" strokeWidth="1" />
                    </svg>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Overhead Orbiter Relay Link */}
          <div className="mt-2 border-t border-white/10 pt-2 font-mono text-[10px] tabular-nums">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-slate-400">
                <Radio className="h-3 w-3 text-emerald-400" />
                UHF RELAY
              </span>
              <span className={hud.relaySignalPct > 20 ? 'text-emerald-300' : 'text-amber-300'}>
                {hud.relaySignalPct > 0 ? `${Math.round(hud.relaySignalPct)}%` : 'LOS Scan'}
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between text-[9px] text-slate-400">
              <span>{hud.relaySatelliteName || 'Searching Orbiter'}</span>
              <span>El {Math.round(hud.relayElevationDeg)}°</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
              <div
                className="h-full bg-cyan-400 transition-all duration-150"
                style={{ width: `${Math.min(100, Math.round(hud.progressPct))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Optional On-Screen Virtual Drive Pad */}
      {showTouchPad && status === 'driving' && (
        <div className="pointer-events-auto absolute right-4 bottom-11 left-4 flex items-end justify-between">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/12 bg-[#0B0E17]/85 p-2 backdrop-blur-md">
            <button
              type="button"
              onMouseDown={() => setTouch({ steer: -1 })}
              onMouseUp={() => setTouch({ steer: 0 })}
              onMouseLeave={() => setTouch({ steer: 0 })}
              onTouchStart={() => setTouch({ steer: -1 })}
              onTouchEnd={() => setTouch({ steer: 0 })}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 font-mono text-sm font-bold text-white active:bg-cyan-500"
            >
              ◀
            </button>
            <button
              type="button"
              onMouseDown={() => setTouch({ steer: 1 })}
              onMouseUp={() => setTouch({ steer: 0 })}
              onMouseLeave={() => setTouch({ steer: 0 })}
              onTouchStart={() => setTouch({ steer: 1 })}
              onTouchEnd={() => setTouch({ steer: 0 })}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 font-mono text-sm font-bold text-white active:bg-cyan-500"
            >
              ▶
            </button>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-white/12 bg-[#0B0E17]/85 p-2 backdrop-blur-md">
            <button
              type="button"
              onMouseDown={() => setTouch({ throttle: -1 })}
              onMouseUp={() => setTouch({ throttle: 0 })}
              onMouseLeave={() => setTouch({ throttle: 0 })}
              onTouchStart={() => setTouch({ throttle: -1 })}
              onTouchEnd={() => setTouch({ throttle: 0 })}
              className="rounded-lg bg-white/10 px-3 py-2.5 font-mono text-xs font-semibold text-white active:bg-rose-500"
            >
              REV
            </button>
            <button
              type="button"
              onMouseDown={() => setTouch({ brake: true })}
              onMouseUp={() => setTouch({ brake: false })}
              onMouseLeave={() => setTouch({ brake: false })}
              onTouchStart={() => setTouch({ brake: true })}
              onTouchEnd={() => setTouch({ brake: false })}
              className="rounded-lg bg-rose-600/75 px-3 py-2.5 font-mono text-xs font-semibold text-white active:bg-rose-500"
            >
              BRAKE
            </button>
            <button
              type="button"
              onMouseDown={() => setTouch({ throttle: 1 })}
              onMouseUp={() => setTouch({ throttle: 0 })}
              onMouseLeave={() => setTouch({ throttle: 0 })}
              onTouchStart={() => setTouch({ throttle: 1 })}
              onTouchEnd={() => setTouch({ throttle: 0 })}
              className="rounded-lg bg-cyan-600/80 px-3.5 py-2.5 font-mono text-xs font-semibold text-white active:bg-cyan-500"
            >
              DRIVE
            </button>
          </div>
        </div>
      )}

      {/* Bottom Compact Coordinates & Keybind Strip */}
      <div className="absolute inset-x-0 bottom-0 flex h-8 items-center justify-between border-t border-white/12 bg-[#0B0E17]/85 px-3 text-[11px] text-slate-300 backdrop-blur-sm">
        <div className="hidden md:flex items-center gap-2 text-slate-400">
          <span className="font-mono text-slate-200">W/S</span> Drive
          <span>·</span>
          <span className="font-mono text-slate-200">A/D</span> Steer
          <span>·</span>
          <span className="font-mono text-slate-200">T</span> Autopilot
          <span>·</span>
          <span className="font-mono text-slate-200">C</span> Camera
          <span>·</span>
          <span className="font-mono text-slate-200">Space</span> Brake
          <span>·</span>
          <span className="font-mono text-slate-200">P</span> Pause
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
          <span className="sm:hidden">
            {hud.speedKmh.toFixed(1)} km/h · {hud.slopeDeg.toFixed(1)}°
          </span>
          <span>
            ODO {(hud.distanceTraveledM / 1000).toFixed(2)} km
          </span>
          <span className="text-white/25">·</span>
          <span>
            {hud.lat.toFixed(4)}°N, {hud.lon.toFixed(4)}°E
          </span>
        </div>
      </div>

      {/* Paused or Arrived Modal */}
      {(status === 'paused' || status === 'arrived') && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#0B0E17]/95 p-6 text-center shadow-2xl">
            {status === 'paused' && (
              <>
                <div className="text-[11px] font-medium tracking-wider text-cyan-400 uppercase">
                  Traverse Hold
                </div>
                <h3 className="mt-1 text-xl font-semibold text-white">Rover Parked</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {vehicle.name} · {(hud.distanceRemainingM / 1000).toFixed(2)} km to{' '}
                  {destCoord.label || 'Destination'}
                </p>
              </>
            )}

            {status === 'arrived' && (
              <>
                <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Award className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-white">Destination Reached</h3>
                <p className="mt-1 text-xs text-slate-300">
                  Arrived safely at {destCoord.label || 'Target Site'}
                </p>
              </>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2.5 rounded-lg border border-white/10 bg-[#111827] p-3 font-mono text-xs tabular-nums sm:grid-cols-4">
              <div>
                <div className="text-[10px] text-slate-400">DRIVEN</div>
                <div className="mt-0.5 font-semibold text-white">
                  {(hud.distanceTraveledM / 1000).toFixed(2)} km
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">AVG SPEED</div>
                <div className="mt-0.5 font-semibold text-cyan-300">
                  {hud.avgSpeedKmh.toFixed(1)} km/h
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">PEAK GRADE</div>
                <div className="mt-0.5 font-semibold text-amber-300">
                  {hud.peakSlopeDeg.toFixed(1)}°
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">ENERGY USED</div>
                <div className="mt-0.5 font-semibold text-emerald-300">
                  {hud.energyUsedKwh.toFixed(2)} kWh
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {status === 'paused' && (
                <button
                  type="button"
                  onClick={onTogglePause}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Resume Drive</span>
                </button>
              )}

              {status === 'arrived' && (
                <button
                  type="button"
                  onClick={onReturnTrip}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>Drive Return Trip</span>
                </button>
              )}

              <button
                type="button"
                onClick={onRestartDrive}
                className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/12"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Restart</span>
              </button>

              <button
                type="button"
                onClick={onOpenSetup}
                className="rounded-lg border border-white/12 bg-white/5 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/12"
              >
                New Route
              </button>

              <button
                type="button"
                onClick={onExit}
                className="rounded-lg border border-white/12 bg-white/5 px-3.5 py-2 text-xs font-medium text-slate-400 hover:bg-white/12 hover:text-white"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
