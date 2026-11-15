import {
  ArrowLeftRight,
  Award,
  Camera,
  Compass,
  Crosshair,
  Eye,
  Flag,
  Globe,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Satellite,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  MarsCoordinate,
  SatelliteCameraMode,
  SatelliteCraftId,
  SatelliteHudTelemetry,
  SatelliteSimStatus,
} from '../types/mars';
import {
  formatSatDuration,
  formatSatEta,
  SATELLITE_CRAFTS,
  SATELLITE_PASS_PRESETS,
  SATELLITE_TARGET_PRESETS,
} from '../data/satelliteMissions';

interface SatelliteSimulatorHUDProps {
  status: SatelliteSimStatus;
  craftId: SatelliteCraftId;
  cameraMode: SatelliteCameraMode;
  timeScale: 1 | 10 | 50 | 200;
  muted: boolean;
  startCoord: MarsCoordinate;
  destCoord: MarsCoordinate;
  hud: SatelliteHudTelemetry;
  onSelectCraft: (id: SatelliteCraftId) => void;
  onSelectPassPreset: (presetId: string) => void;
  onChangeStart: (coord: MarsCoordinate) => void;
  onChangeDest: (coord: MarsCoordinate) => void;
  onSwapEndpoints: () => void;
  onPickOnGlobe: (which: 'start' | 'destination') => void;
  onSetTimeScale: (scale: 1 | 10 | 50 | 200) => void;
  onToggleCamera: () => void;
  onToggleMute: () => void;
  onStartOrbit: () => void;
  onRestartOrbit: () => void;
  onReturnPass: () => void;
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
  const hit = SATELLITE_TARGET_PRESETS.find(
    (p) => Math.abs(p.lat - coord.lat) < 0.05 && Math.abs(p.lon - coord.lon) < 0.05
  );
  return hit ? hit.label || '' : '__custom__';
}

export default function SatelliteSimulatorHUD({
  status,
  craftId,
  cameraMode,
  timeScale,
  muted,
  startCoord,
  destCoord,
  hud,
  onSelectCraft,
  onSelectPassPreset,
  onChangeStart,
  onChangeDest,
  onSwapEndpoints,
  onPickOnGlobe,
  onSetTimeScale,
  onToggleCamera,
  onToggleMute,
  onStartOrbit,
  onRestartOrbit,
  onReturnPass,
  onOpenSetup,
  onTogglePause,
  onExit,
}: SatelliteSimulatorHUDProps) {
  const craft = SATELLITE_CRAFTS[craftId];
  const destBearingOffset = wrapSignedAngleDeg(hud.destBearingDeg - hud.headingDeg);

  if (status === 'setup') {
    const passKm = hud.totalDistanceKm;
    const estRealSec = passKm / Math.max(0.5, craft.orbitalSpeedKmS);
    const estCompressedSec = estRealSec / timeScale;

    return (
      <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/15 bg-[#0B0E17]/95 shadow-2xl">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
            <div>
              <div className="text-[11px] font-medium tracking-wider text-sky-400 uppercase">
                Orbital Reconnaissance & Relay Control
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-white">
                Mars Satellite Transit Simulator
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Task a NASA orbiter along a planetwide orbital arc from origin to target site with live swath scanning and rover UHF relays.
              </p>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-slate-300 hover:bg-white/15 hover:text-white"
              title="Exit Satellite Simulator"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="grid flex-1 gap-5 overflow-y-auto p-6 lg:grid-cols-12">
            {/* Left Column: Pass Endpoints & Presets */}
            <div className="space-y-4 lg:col-span-7">
              <div className="text-xs font-medium text-slate-200">
                1. Set Orbital Pass Origin & Target
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="rounded-lg border border-white/10 bg-[#111827]/90 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-emerald-400">Pass Entry (A)</span>
                    <button
                      type="button"
                      onClick={() => onPickOnGlobe('start')}
                      className="flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200"
                    >
                      <Crosshair className="h-3 w-3" />
                      Pick on Globe
                    </button>
                  </div>
                  <select
                    value={matchPresetKey(startCoord)}
                    onChange={(e) => {
                      const hit = SATELLITE_TARGET_PRESETS.find((p) => p.label === e.target.value);
                      if (hit) onChangeStart(hit);
                    }}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#07090E] px-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  >
                    {matchPresetKey(startCoord) === '__custom__' && (
                      <option value="__custom__">
                        {startCoord.label || 'Custom Orbit Entry'} ({startCoord.lat.toFixed(1)}°,{' '}
                        {startCoord.lon.toFixed(1)}°)
                      </option>
                    )}
                    {SATELLITE_TARGET_PRESETS.map((p) => (
                      <option key={`sat-s-${p.label}`} value={p.label}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1.5 font-mono text-[10px] text-slate-400 tabular-nums">
                    {startCoord.lat.toFixed(3)}°, {startCoord.lon.toFixed(3)}°
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onSwapEndpoints}
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-slate-300 hover:border-sky-400/60 hover:text-white"
                  title="Swap Pass Origin and Destination"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>

                <div className="rounded-lg border border-white/10 bg-[#111827]/90 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-amber-400">Target Site (B)</span>
                    <button
                      type="button"
                      onClick={() => onPickOnGlobe('destination')}
                      className="flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200"
                    >
                      <Crosshair className="h-3 w-3" />
                      Pick on Globe
                    </button>
                  </div>
                  <select
                    value={matchPresetKey(destCoord)}
                    onChange={(e) => {
                      const hit = SATELLITE_TARGET_PRESETS.find((p) => p.label === e.target.value);
                      if (hit) onChangeDest(hit);
                    }}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#07090E] px-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  >
                    {matchPresetKey(destCoord) === '__custom__' && (
                      <option value="__custom__">
                        {destCoord.label || 'Custom Target'} ({destCoord.lat.toFixed(1)}°,{' '}
                        {destCoord.lon.toFixed(1)}°)
                      </option>
                    )}
                    {SATELLITE_TARGET_PRESETS.map((p) => (
                      <option key={`sat-d-${p.label}`} value={p.label}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1.5 font-mono text-[10px] text-slate-400 tabular-nums">
                    {destCoord.lat.toFixed(3)}°, {destCoord.lon.toFixed(3)}°
                  </div>
                </div>
              </div>

              {/* Orbital Pass Metrics Preview */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-[#111827]/75 p-3.5 font-mono tabular-nums sm:grid-cols-4">
                <div>
                  <div className="text-[10px] text-slate-400">ARC DISTANCE</div>
                  <div className="mt-0.5 text-sm font-semibold text-white">
                    {passKm.toFixed(0)} <span className="text-[10px] text-slate-400">km</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">ORBIT ALTITUDE</div>
                  <div className="mt-0.5 text-sm font-semibold text-sky-300">
                    {craft.altitudeKm} <span className="text-[10px] text-slate-400">km</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">SWATH WIDTH</div>
                  <div className="mt-0.5 text-sm font-semibold text-amber-300">
                    {craft.swathWidthKm} <span className="text-[10px] text-slate-400">km</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">PASS TIME ({timeScale}x)</div>
                  <div className="mt-0.5 text-sm font-semibold text-emerald-300">
                    {formatSatEta(estCompressedSec)}
                  </div>
                </div>
              </div>

              {/* Curated Orbital Corridors */}
              <div>
                <div className="mb-2 text-xs font-medium text-slate-300">
                  Featured Orbital Survey Passes
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SATELLITE_PASS_PRESETS.map((exp) => {
                    const isSelected =
                      Math.abs(exp.start.lat - startCoord.lat) < 0.05 &&
                      Math.abs(exp.start.lon - startCoord.lon) < 0.05 &&
                      Math.abs(exp.destination.lat - destCoord.lat) < 0.05 &&
                      Math.abs(exp.destination.lon - destCoord.lon) < 0.05;
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => onSelectPassPreset(exp.id)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-sky-500/70 bg-sky-500/12'
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

            {/* Right Column: Orbiter Fleet & Time Compression */}
            <div className="flex flex-col justify-between space-y-4 lg:col-span-5">
              <div className="space-y-3">
                <div className="text-xs font-medium text-slate-200">2. Select Mars Orbiter</div>
                <div className="space-y-2.5">
                  {(Object.keys(SATELLITE_CRAFTS) as SatelliteCraftId[]).map((id) => {
                    const spec = SATELLITE_CRAFTS[id];
                    const selected = craftId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onSelectCraft(id)}
                        className={`w-full rounded-lg border p-3.5 text-left transition-colors ${
                          selected
                            ? 'border-sky-500/70 bg-sky-500/12'
                            : 'border-white/10 bg-[#111827]/70 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-white">{spec.name}</span>
                          <span className="font-mono text-[11px] text-sky-300 tabular-nums">
                            {spec.altitudeKm} km
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-amber-300/90">{spec.role}</div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                          {spec.description}
                        </p>
                        <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-slate-300 tabular-nums">
                          <span>{spec.orbitalSpeedKmS.toFixed(2)} km/s</span>
                          <span aria-hidden="true">·</span>
                          <span>{spec.downlinkPeakMbps} Mbps</span>
                          <span aria-hidden="true">·</span>
                          <span>Swath {spec.swathWidthKm} km</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Time Warp & Camera Defaults */}
                <div className="rounded-lg border border-white/10 bg-[#111827]/75 p-3.5 text-xs">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-300">
                      3. Orbital Time Compression
                    </span>
                    <span className="font-mono text-[11px] text-sky-300 tabular-nums">
                      {timeScale}x Real-Time
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([1, 10, 50, 200] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onSetTimeScale(s)}
                        className={`rounded-lg border py-1.5 font-mono text-xs font-semibold transition-colors ${
                          timeScale === s
                            ? 'border-sky-500/60 bg-sky-500/20 text-sky-200'
                            : 'border-white/10 bg-[#07090E] text-slate-400 hover:text-white'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/10 pt-2.5 text-[11px] text-slate-400">
                    <div>
                      <span className="font-mono text-slate-200">C</span> Chase / Nadir / Horizon
                    </div>
                    <div>
                      <span className="font-mono text-slate-200">Space / P</span> Hold Orbit
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
                  onClick={onStartOrbit}
                  className="flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-sky-500 whitespace-nowrap"
                >
                  <Satellite className="h-4 w-4" />
                  <span>Initiate Orbital Pass</span>
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
      {/* Top Satellite Telemetry Ribbon */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 border-b border-white/12 bg-[#0B0E17]/88 px-3 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono text-xs font-semibold text-sky-300 whitespace-nowrap">
            {craft.shortName}
          </span>
          <span className="hidden md:inline text-xs text-slate-400 truncate">
            {startCoord.label || 'Entry'} → {destCoord.label || 'Target'}
          </span>

          <div className="flex items-center gap-1.5 pl-1">
            <div className="flex items-center rounded-lg border border-white/12 bg-black/40 p-0.5">
              {([1, 10, 50, 200] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSetTimeScale(s)}
                  className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                    timeScale === s
                      ? 'bg-sky-500/25 text-sky-200'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={`Orbital Time Compression ${s}x`}
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
                  ? 'Orbiter Chase'
                  : cameraMode === 'nadir'
                  ? 'Nadir Scan'
                  : 'Horizon Track'}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-slate-300 hover:bg-white/12 hover:text-white"
              title="Toggle Telemetry Audio Cues"
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Center Progress & Timer */}
        <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
          <span className="text-slate-200">{formatSatDuration(hud.elapsedMs)}</span>
          <span aria-hidden="true" className="text-white/20">
            ·
          </span>
          <span className="text-sky-300">{Math.round(hud.progressPct)}%</span>
          <span aria-hidden="true" className="hidden sm:inline text-white/20">
            ·
          </span>
          <span className="hidden sm:inline text-slate-300">
            {hud.distanceRemainingKm.toFixed(0)} km left
          </span>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5">
          {(status === 'orbiting' || status === 'paused') && (
            <button
              type="button"
              onClick={onTogglePause}
              className="flex h-7 items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-2.5 text-[11px] text-slate-100 hover:bg-white/15 whitespace-nowrap"
              title="Pause / Resume Orbit (Space / P)"
            >
              {status === 'paused' ? (
                <>
                  <Play className="h-3 w-3" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3" />
                  <span>Hold</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSetup}
            className="hidden sm:flex h-7 items-center rounded-lg border border-white/12 bg-white/5 px-2.5 text-[11px] text-slate-200 hover:bg-white/15 whitespace-nowrap"
          >
            Pass Setup
          </button>

          <button
            type="button"
            onClick={onExit}
            className="flex h-7 items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 text-[11px] font-medium text-rose-200 hover:bg-rose-500/25 whitespace-nowrap"
            title="Exit Satellite Simulator (Esc)"
          >
            <X className="h-3.5 w-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Top-Center Orbital Heading & Ground Target Compass Tape */}
      <div className="mx-auto mt-2.5 flex w-72 flex-col items-center">
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

          {Math.abs(destBearingOffset) <= 65 && (
            <div
              className="absolute bottom-0.5 -translate-x-1/2 text-[10px] text-amber-400"
              style={{ left: `${50 + (destBearingOffset / 65) * 48}%` }}
              title="Orbital Target Azimuth"
            >
              ◆
            </div>
          )}

          <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-sky-400/80" />
        </div>
        <div className="mt-1 flex items-center gap-2 rounded bg-[#0B0E17]/80 px-2.5 py-0.5 font-mono text-[11px] tabular-nums">
          <span className="font-semibold text-sky-300">
            TRK {String(Math.round(((hud.headingDeg % 360) + 360) % 360)).padStart(3, '0')}°
          </span>
          <span className="text-white/25">·</span>
          <span className="text-amber-300">
            TARGET {hud.distanceRemainingKm.toFixed(0)} km
          </span>
        </div>
      </div>

      {/* Overhead Surface Relay Notification */}
      {hud.activeRelayTarget && (
        <div className="mx-auto mt-2 flex max-w-md justify-center px-4">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-[#0B0E17]/90 px-3 py-1 font-mono text-[11px] text-emerald-300 shadow-lg">
            <Radio className="h-3.5 w-3.5" />
            <span>
              UHF RELAY LOCK: {hud.activeRelayTarget} ({hud.activeRelayDistKm?.toFixed(0)} km)
            </span>
          </div>
        </div>
      )}

      {/* Left Cluster: Orbital Kinematics & Spacecraft Bus */}
      <div className="absolute top-1/2 left-4 hidden -translate-y-1/2 space-y-2.5 sm:block">
        <div className="w-48 rounded-lg border border-white/12 bg-[#0B0E17]/85 p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[10px] tracking-wider text-slate-400 uppercase">
            <span>Orbital Velocity</span>
            <Globe className="h-3 w-3 text-sky-400" />
          </div>
          <div className="mt-0.5 font-mono text-2xl font-bold text-white tabular-nums">
            {hud.orbitalSpeedKmS.toFixed(2)}
            <span className="ml-1.5 text-[11px] font-normal text-slate-400">km/s</span>
          </div>
          <div className="font-mono text-[10px] text-slate-400 tabular-nums">
            Ground Track {hud.groundSpeedKmS.toFixed(2)} km/s
          </div>

          <div className="mt-3 space-y-1.5 border-t border-white/10 pt-2.5 font-mono text-[10px] tabular-nums">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">ALTITUDE</span>
              <span className="text-sky-300">{hud.altitudeKm.toFixed(1)} km</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-slate-400">
                <Sun className="h-3 w-3 text-amber-400" />
                SOLAR ARRAY
              </span>
              <span className={hud.sunlit ? 'text-amber-300' : 'text-slate-400'}>
                {hud.sunlit ? `${hud.solarPowerW} W` : 'Eclipse (Batt)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">KA DOWNLINK</span>
              <span className="text-emerald-300">{hud.downlinkMbps.toFixed(2)} Mbps</span>
            </div>
          </div>
        </div>

        {/* Transit Event Feed */}
        {hud.transitEvents.length > 0 && (
          <div className="w-48 rounded-lg border border-white/12 bg-[#0B0E17]/82 p-2.5 backdrop-blur-sm">
            <div className="mb-1.5 text-[10px] font-medium tracking-wider text-slate-400 uppercase">
              Orbital Pass Log
            </div>
            <div className="space-y-1.5">
              {hud.transitEvents.slice(0, 3).map((ev, idx) => (
                <div key={`${ev.timeLabel}-${idx}`} className="text-[10px] leading-snug">
                  <span className="font-mono text-slate-400">{ev.timeLabel}</span>{' '}
                  <span
                    className={
                      ev.kind === 'relay'
                        ? 'text-emerald-300'
                        : ev.kind === 'scan'
                        ? 'text-sky-300'
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

      {/* Right Cluster: Swath Scanner & Nadir Geography */}
      <div className="absolute top-1/2 right-4 hidden -translate-y-1/2 space-y-2.5 sm:block">
        <div className="w-48 rounded-lg border border-white/12 bg-[#0B0E17]/85 p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[10px] tracking-wider text-slate-400 uppercase">
            <span>Nadir Payload</span>
            <Camera className="h-3 w-3 text-amber-400" />
          </div>

          <div className="mt-1.5 text-xs font-semibold text-white truncate">
            {hud.overflownRegion}
          </div>
          <div className="font-mono text-[10px] text-slate-400 tabular-nums">
            {craft.instrumentName}
          </div>

          <div className="mt-2.5 space-y-1.5 border-t border-white/10 pt-2.5 font-mono text-[10px] text-slate-300 tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-400">SWATH WIDTH</span>
              <span>{hud.swathWidthKm} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">SCANS CAPTURED</span>
              <span className="text-sky-300">{hud.scansCaptured} frames</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">NADIR ELEV</span>
              <span>{hud.surfaceElevM !== null ? `${hud.surfaceElevM.toFixed(0)} m` : 'MOLA Avg'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">ETA ({timeScale}x)</span>
              <span className="text-emerald-300">{formatSatEta(hud.etaSeconds)}</span>
            </div>
          </div>

          <div className="mt-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
              <div
                className="h-full bg-sky-400 transition-all duration-150"
                style={{ width: `${Math.min(100, Math.round(hud.progressPct))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Compact Sub-Satellite Strip */}
      <div className="absolute inset-x-0 bottom-0 flex h-8 items-center justify-between border-t border-white/12 bg-[#0B0E17]/85 px-3 text-[11px] text-slate-300 backdrop-blur-sm">
        <div className="hidden md:flex items-center gap-2 text-slate-400">
          <Compass className="h-3.5 w-3.5 text-sky-400" />
          <span className="font-mono text-slate-200">C</span> Camera
          <span>·</span>
          <span className="font-mono text-slate-200">Space / P</span> Hold Orbit
          <span>·</span>
          <span className="font-mono text-slate-200">Esc</span> Exit
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
          <span>ARC {hud.distanceTraveledKm.toFixed(1)} / {hud.totalDistanceKm.toFixed(1)} km</span>
          <span className="text-white/25">·</span>
          <span>
            NADIR {hud.subLat.toFixed(3)}°, {hud.subLon.toFixed(3)}°
          </span>
        </div>
      </div>

      {/* Paused or Arrived Modal */}
      {(status === 'paused' || status === 'arrived') && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#0B0E17]/95 p-6 text-center shadow-2xl">
            {status === 'paused' && (
              <>
                <div className="text-[11px] font-medium tracking-wider text-sky-400 uppercase">
                  Station-Keeping Hold
                </div>
                <h3 className="mt-1 text-xl font-semibold text-white">Orbital Pass Held</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {craft.name} · {hud.distanceRemainingKm.toFixed(0)} km remaining to{' '}
                  {destCoord.label || 'Target'}
                </p>
              </>
            )}

            {status === 'arrived' && (
              <>
                <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Award className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-white">Orbital Target Acquired</h3>
                <p className="mt-1 text-xs text-slate-300">
                  Completed reconnaissance pass over {destCoord.label || 'Target Site'}
                </p>
              </>
            )}

            <div className="mt-5 grid grid-cols-3 gap-2 rounded-lg border border-white/10 bg-[#111827] p-3 font-mono text-xs tabular-nums">
              <div>
                <div className="text-[10px] text-slate-400">ARC FLOWN</div>
                <div className="mt-0.5 font-semibold text-white">
                  {hud.distanceTraveledKm.toFixed(0)} km
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">FRAMES</div>
                <div className="mt-0.5 font-semibold text-sky-300">{hud.scansCaptured}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">DOWNLINK</div>
                <div className="mt-0.5 font-semibold text-emerald-300">
                  {hud.downlinkMbps.toFixed(1)} Mbps
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {status === 'paused' && (
                <button
                  type="button"
                  onClick={onTogglePause}
                  className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Resume Pass</span>
                </button>
              )}

              {status === 'arrived' && (
                <button
                  type="button"
                  onClick={onReturnPass}
                  className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>Fly Return Pass</span>
                </button>
              )}

              <button
                type="button"
                onClick={onRestartOrbit}
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
                New Pass
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
