import { useState } from 'react';
import {
  Compass,
  Eye,
  Gamepad2,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  FLIGHT_COURSES,
  FLIGHT_CRAFTS,
  formatFlightTime,
} from '../data/flightCourses';
import {
  FlightCameraMode,
  FlightCraftId,
  FlightHudTelemetry,
  FlightStatus,
  FlightTouchInput,
} from '../types/mars';

interface FlightSimulatorHUDProps {
  status: FlightStatus;
  courseId: string;
  craftId: FlightCraftId;
  cameraMode: FlightCameraMode;
  invertPitch: boolean;
  muted: boolean;
  hud: FlightHudTelemetry;
  touchControlRef: React.MutableRefObject<FlightTouchInput>;
  onSelectCourse: (courseId: string) => void;
  onSelectCraft: (craftId: FlightCraftId) => void;
  onStartFlight: () => void;
  onRestartFlight: () => void;
  onOpenMenu: () => void;
  onTogglePause: () => void;
  onToggleCamera: () => void;
  onToggleInvertPitch: () => void;
  onToggleMute: () => void;
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

export default function FlightSimulatorHUD({
  status,
  courseId,
  craftId,
  cameraMode,
  invertPitch,
  muted,
  hud,
  touchControlRef,
  onSelectCourse,
  onSelectCraft,
  onStartFlight,
  onRestartFlight,
  onOpenMenu,
  onTogglePause,
  onToggleCamera,
  onToggleInvertPitch,
  onToggleMute,
  onExit,
}: FlightSimulatorHUDProps) {
  const [showTouchPad, setShowTouchPad] = useState(false);

  const course = FLIGHT_COURSES.find((c) => c.id === courseId) || FLIGHT_COURSES[0];
  const craft = FLIGHT_CRAFTS[craftId];

  // Speed of sound on Mars ~ 240 m/s
  const marsMach = hud.speedMs / 240;

  const setTouchAxis = (patch: Partial<FlightTouchInput>) => {
    Object.assign(touchControlRef.current, patch);
  };

  if (status === 'menu') {
    return (
      <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
        <div className="w-full max-w-4xl overflow-hidden rounded-lg border border-amber-500/25 bg-[#0B0F17]/95 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-amber-500/15 bg-[#080B11]/80 px-6 py-4">
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
                Atmospheric Recon & Flight Deck
              </div>
              <h2 className="font-display text-lg font-semibold tracking-tight text-slate-100">
                Mars Recon Flight Simulator
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Fly NASA spacecraft over Mars terrain under 0.38g gravity and thin CO₂ aerodynamics.
              </p>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-white/12 bg-white/5 text-slate-300 hover:border-amber-500/35 hover:bg-white/10 hover:text-white"
              title="Exit Flight Simulator"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-5 p-6 lg:grid-cols-12">
            {/* Craft Selection */}
            <div className="space-y-3 lg:col-span-5">
              <div className="text-xs font-medium text-[#bdc1c6]">1. Select Aircraft</div>
              <div className="space-y-2.5">
                {(Object.keys(FLIGHT_CRAFTS) as FlightCraftId[]).map((id) => {
                  const spec = FLIGHT_CRAFTS[id];
                  const selected = craftId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectCraft(id)}
                      className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                        selected
                          ? 'border-orange-500/70 bg-orange-500/12'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white">{spec.name}</span>
                        {course.recommendedCraft === id && (
                          <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-orange-300/90">{spec.role}</div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-[#9aa0a6]">
                        {spec.description}
                      </p>
                      <div className="mt-2.5 flex items-center gap-4 font-mono text-[10px] text-[#cbd5e1] tabular-nums">
                        <span>Cruise: {Math.round(spec.cruiseSpeedMs * 3.6)} km/h</span>
                        <span>Boost: {Math.round(spec.boostSpeedMs * 3.6)} km/h</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Flight Settings */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                <div className="mb-2 flex items-center gap-1.5 font-medium text-[#e2e8f0]">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-sky-400" />
                  <span>Flight Controls & Camera</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#9aa0a6]">
                  <div>
                    <span className="font-mono text-[#e2e8f0]">W / S · ↑ / ↓</span> Pitch
                  </div>
                  <div>
                    <span className="font-mono text-[#e2e8f0]">A / D · ← / →</span> Bank & Turn
                  </div>
                  <div>
                    <span className="font-mono text-[#e2e8f0]">E / Q</span> Throttle +/-
                  </div>
                  <div>
                    <span className="font-mono text-[#e2e8f0]">Shift</span> Afterburner
                  </div>
                  <div>
                    <span className="font-mono text-[#e2e8f0]">C</span> Chase / Cockpit
                  </div>
                  <div>
                    <span className="font-mono text-[#e2e8f0]">P / Esc</span> Pause / Exit
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5">
                  <button
                    type="button"
                    onClick={onToggleInvertPitch}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] transition-colors ${
                      invertPitch
                        ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                        : 'border-white/12 bg-white/5 text-[#cbd5e1]'
                    }`}
                  >
                    Pitch Mode: {invertPitch ? 'Aviation Stick (W = Dive)' : 'Arcade (W = Climb)'}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className="flex items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-2.5 py-1 text-[11px] text-[#cbd5e1] hover:bg-white/10"
                  >
                    {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                    <span>{muted ? 'Audio Muted' : 'Audio On'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Launch Sector */}
            <div className="flex flex-col justify-between space-y-3 lg:col-span-7">
              <div className="space-y-2.5">
                <div className="text-xs font-medium text-[#bdc1c6]">2. Flight Operations Sector</div>
                <div className="space-y-2.5">
                  {FLIGHT_COURSES.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => onSelectCourse(c.id)}
                      className="flex flex-col justify-between rounded-xl border border-orange-500/70 bg-orange-500/12 p-4 text-left"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-white">{c.name}</span>
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                            Active Sector
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#9aa0a6]">{c.region}</div>
                        <p className="mt-2 text-xs leading-relaxed text-[#cbd5e1]">
                          {c.subtitle}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 font-mono text-[10px] text-[#9aa0a6] tabular-nums">
                        <span>0.38g CO₂ Aerodynamics · Ground Effect Active</span>
                        <span className="text-sky-300">Launch {c.startAglM} m AGL</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={onExit}
                  className="rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-xs font-medium text-[#e2e8f0] hover:bg-white/10"
                >
                  Return to Explorer
                </button>
                <button
                  type="button"
                  onClick={onStartFlight}
                  className="flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-2.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-orange-500"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>Launch Flight ({craft.shortName})</span>
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
      {/* Top Flight Deck Telemetry Bar */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0b0e14]/75 px-3 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-orange-500/20 px-2 py-0.5 text-[11px] font-semibold text-orange-300">
            {craft.shortName}
          </span>
          <span className="hidden sm:inline text-xs font-medium text-[#e8eaed]">{course.name}</span>
          <div className="hidden md:flex items-center gap-1.5 pl-2">
            <button
              type="button"
              onClick={onToggleCamera}
              className="flex items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-2 py-1 text-[11px] text-[#cbd5e1] hover:bg-white/12 hover:text-white"
              title="Toggle Chase / Cockpit View (C)"
            >
              <Eye className="h-3 w-3" />
              <span>{cameraMode === 'chase' ? 'Chase Cam' : 'Cockpit'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleInvertPitch}
              className="rounded-lg border border-white/12 bg-white/5 px-2 py-1 text-[11px] text-[#cbd5e1] hover:bg-white/12 hover:text-white"
              title="Toggle Pitch Direction"
            >
              {invertPitch ? 'Stick: Aviation' : 'Stick: Arcade'}
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-[#cbd5e1] hover:bg-white/12 hover:text-white"
              title="Toggle Flight Audio"
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Center Top: Free Reconnaissance Mode & Flight Timer */}
        <div className="flex items-center gap-4 font-mono text-xs tabular-nums">
          <div className="flex items-center gap-1.5 text-sky-300">
            <Compass className="h-3.5 w-3.5" />
            <span>Free Reconnaissance</span>
          </div>

          <div className="text-white">{formatFlightTime(hud.elapsedMs)}</div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowTouchPad((v) => !v)}
            className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] ${
              showTouchPad
                ? 'border-sky-500/60 bg-sky-500/20 text-sky-200'
                : 'border-white/12 bg-white/5 text-[#cbd5e1] hover:bg-white/12'
            }`}
            title="Toggle On-Screen Controls"
          >
            <Gamepad2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Controls</span>
          </button>

          {(status === 'flying' || status === 'paused') && (
            <button
              type="button"
              onClick={onTogglePause}
              className="flex h-7 items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-2.5 text-[11px] text-[#e8eaed] hover:bg-white/15"
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
            onClick={onOpenMenu}
            className="hidden sm:flex h-7 items-center rounded-lg border border-white/12 bg-white/5 px-2.5 text-[11px] text-[#cbd5e1] hover:bg-white/15 hover:text-white"
          >
            Hangar
          </button>

          <button
            type="button"
            onClick={onExit}
            className="flex h-7 items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 text-[11px] font-medium text-rose-200 hover:bg-rose-500/25"
            title="Exit Flight Simulator (Esc)"
          >
            <X className="h-3.5 w-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Compass Heading Tape (Top Center below Bar) */}
      <div className="mx-auto mt-2.5 flex w-64 flex-col items-center">
        <div className="relative h-7 w-full overflow-hidden rounded-lg border border-white/12 bg-black/45 backdrop-blur-sm">
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
                <span className="font-mono text-[10px] font-semibold text-[#e2e8f0]">
                  {mark.label}
                </span>
              </div>
            );
          })}

          <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-sky-400/80" />
        </div>
        <div className="mt-1 rounded bg-black/55 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-300 tabular-nums">
          HDG {String(Math.round(((hud.headingDeg % 360) + 360) % 360)).padStart(3, '0')}°
        </div>
      </div>

      {/* Center Artificial Horizon Pitch Ladder */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="relative h-56 w-56">
          <svg viewBox="-100 -100 200 200" className="h-full w-full overflow-visible">
            <g transform={`rotate(${-hud.rollDeg}) translate(0, ${hud.pitchDeg * 2.1})`}>
              {/* Horizon line */}
              <line
                x1="-56"
                y1="0"
                x2="-16"
                y2="0"
                stroke="rgba(56, 189, 248, 0.72)"
                strokeWidth="1.5"
              />
              <line
                x1="16"
                y1="0"
                x2="56"
                y2="0"
                stroke="rgba(56, 189, 248, 0.72)"
                strokeWidth="1.5"
              />
              {/* Pitch rungs */}
              {[-20, -10, 10, 20].map((deg) => {
                const y = -deg * 2.1;
                const dashed = deg < 0 ? '4 3' : undefined;
                return (
                  <g key={deg}>
                    <line
                      x1="-28"
                      y1={y}
                      x2="-10"
                      y2={y}
                      stroke="rgba(226, 232, 240, 0.45)"
                      strokeWidth="1"
                      strokeDasharray={dashed}
                    />
                    <line
                      x1="10"
                      y1={y}
                      x2="28"
                      y2={y}
                      stroke="rgba(226, 232, 240, 0.45)"
                      strokeWidth="1"
                      strokeDasharray={dashed}
                    />
                  </g>
                );
              })}
            </g>

            {/* Fixed Center Aircraft Bore-Sight Chevron */}
            <path
              d="M -14 4 L -5 0 L 0 5 L 5 0 L 14 4"
              fill="none"
              stroke="#f97316"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Low Terrain Warning */}
          {hud.lowTerrainWarning && status === 'flying' && (
            <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/70 bg-rose-950/85 px-3 py-1 font-mono text-[11px] font-bold text-rose-200 shadow-lg">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
              <span>LOW TERRAIN · PULL UP</span>
            </div>
          )}
        </div>
      </div>

      {/* Left HUD Cluster: Airspeed & Throttle */}
      <div className="absolute top-1/2 left-4 hidden -translate-y-1/2 space-y-2 sm:block">
        <div className="w-36 rounded-xl border border-white/12 bg-black/50 p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[10px] text-[#9aa0a6]">
            <span>AIRSPEED</span>
            <Gauge className="h-3 w-3 text-sky-400" />
          </div>
          <div className="mt-0.5 font-mono text-xl font-bold text-white tabular-nums">
            {Math.round(hud.speedKmh)}{' '}
            <span className="text-xs font-normal text-[#9aa0a6]">km/h</span>
          </div>
          <div className="font-mono text-[10px] text-sky-300 tabular-nums">
            Mars Mach {marsMach.toFixed(2)}
          </div>

          <div className="mt-2.5">
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[#cbd5e1] tabular-nums">
              <span>THROTTLE</span>
              <span>{Math.round(hud.throttle * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full transition-all duration-75 ${
                  hud.boosting ? 'bg-orange-400' : 'bg-sky-400'
                }`}
                style={{ width: `${Math.min(100, Math.round(hud.throttle * 100))}%` }}
              />
            </div>
          </div>

          {hud.boosting && (
            <div className="mt-2 flex items-center gap-1 font-mono text-[10px] font-semibold text-orange-300">
              <Zap className="h-3 w-3" />
              <span>AFTERBURNER</span>
            </div>
          )}
        </div>
      </div>

      {/* Right HUD Cluster: Radar Altitude */}
      <div className="absolute top-1/2 right-4 hidden -translate-y-1/2 space-y-2 sm:block">
        <div className="w-40 rounded-xl border border-white/12 bg-black/50 p-3 text-right backdrop-blur-sm">
          <div className="text-[10px] text-[#9aa0a6]">RADAR ALT (AGL)</div>
          <div
            className={`mt-0.5 font-mono text-xl font-bold tabular-nums ${
              hud.lowTerrainWarning ? 'text-rose-400' : 'text-white'
            }`}
          >
            {Math.round(hud.aglM).toLocaleString()}{' '}
            <span className="text-xs font-normal text-[#9aa0a6]">m</span>
          </div>
          <div className="font-mono text-[10px] text-[#cbd5e1] tabular-nums">
            V/S {hud.verticalSpeedMs >= 0 ? '+' : ''}
            {hud.verticalSpeedMs.toFixed(1)} m/s
          </div>
          {hud.molaElevM !== null && (
            <div className="mt-1 font-mono text-[10px] text-[#9aa0a6] tabular-nums">
              Ground {hud.molaElevM.toFixed(0)} m MOLA
            </div>
          )}
        </div>
      </div>

      {/* On-Screen Virtual Controls (Optional Touch / Mouse Flight Deck) */}
      {showTouchPad && status === 'flying' && (
        <div className="pointer-events-auto absolute right-4 bottom-12 left-4 flex items-end justify-between">
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-white/12 bg-black/65 p-2 backdrop-blur-md">
            <div />
            <button
              type="button"
              onMouseDown={() => setTouchAxis({ pitch: 1 })}
              onMouseUp={() => setTouchAxis({ pitch: 0 })}
              onMouseLeave={() => setTouchAxis({ pitch: 0 })}
              onTouchStart={() => setTouchAxis({ pitch: 1 })}
              onTouchEnd={() => setTouchAxis({ pitch: 0 })}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 font-mono text-xs font-bold text-white active:bg-orange-500"
            >
              ↑
            </button>
            <div />
            <button
              type="button"
              onMouseDown={() => setTouchAxis({ yaw: -1 })}
              onMouseUp={() => setTouchAxis({ yaw: 0 })}
              onMouseLeave={() => setTouchAxis({ yaw: 0 })}
              onTouchStart={() => setTouchAxis({ yaw: -1 })}
              onTouchEnd={() => setTouchAxis({ yaw: 0 })}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 font-mono text-xs font-bold text-white active:bg-orange-500"
            >
              ←
            </button>
            <button
              type="button"
              onMouseDown={() => setTouchAxis({ pitch: -1 })}
              onMouseUp={() => setTouchAxis({ pitch: 0 })}
              onMouseLeave={() => setTouchAxis({ pitch: 0 })}
              onTouchStart={() => setTouchAxis({ pitch: -1 })}
              onTouchEnd={() => setTouchAxis({ pitch: 0 })}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 font-mono text-xs font-bold text-white active:bg-orange-500"
            >
              ↓
            </button>
            <button
              type="button"
              onMouseDown={() => setTouchAxis({ yaw: 1 })}
              onMouseUp={() => setTouchAxis({ yaw: 0 })}
              onMouseLeave={() => setTouchAxis({ yaw: 0 })}
              onTouchStart={() => setTouchAxis({ yaw: 1 })}
              onTouchEnd={() => setTouchAxis({ yaw: 0 })}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 font-mono text-xs font-bold text-white active:bg-orange-500"
            >
              →
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-black/65 p-2 backdrop-blur-md">
            <button
              type="button"
              onMouseDown={() => setTouchAxis({ throttleDelta: -1 })}
              onMouseUp={() => setTouchAxis({ throttleDelta: 0 })}
              onMouseLeave={() => setTouchAxis({ throttleDelta: 0 })}
              onTouchStart={() => setTouchAxis({ throttleDelta: -1 })}
              onTouchEnd={() => setTouchAxis({ throttleDelta: 0 })}
              className="rounded-lg bg-white/10 px-3 py-2 font-mono text-xs font-semibold text-white active:bg-sky-500"
            >
              THR -
            </button>
            <button
              type="button"
              onMouseDown={() => setTouchAxis({ throttleDelta: 1 })}
              onMouseUp={() => setTouchAxis({ throttleDelta: 0 })}
              onMouseLeave={() => setTouchAxis({ throttleDelta: 0 })}
              onTouchStart={() => setTouchAxis({ throttleDelta: 1 })}
              onTouchEnd={() => setTouchAxis({ throttleDelta: 0 })}
              className="rounded-lg bg-white/10 px-3 py-2 font-mono text-xs font-semibold text-white active:bg-sky-500"
            >
              THR +
            </button>
            <button
              type="button"
              onMouseDown={() => setTouchAxis({ boost: true })}
              onMouseUp={() => setTouchAxis({ boost: false })}
              onMouseLeave={() => setTouchAxis({ boost: false })}
              onTouchStart={() => setTouchAxis({ boost: true })}
              onTouchEnd={() => setTouchAxis({ boost: false })}
              className="rounded-lg bg-orange-600/80 px-3.5 py-2 font-mono text-xs font-semibold text-white active:bg-orange-500"
            >
              BOOST
            </button>
          </div>
        </div>
      )}

      {/* Bottom Compact Coordinates & Keybind Strip */}
      <div className="absolute inset-x-0 bottom-0 flex h-8 items-center justify-between border-t border-white/10 bg-[#0b0e14]/75 px-3 text-[11px] text-[#cbd5e1] backdrop-blur-sm">
        <div className="hidden md:flex items-center gap-2 text-[#9aa0a6]">
          <span className="font-mono text-[#e2e8f0]">W/S</span> Pitch
          <span>·</span>
          <span className="font-mono text-[#e2e8f0]">A/D</span> Bank
          <span>·</span>
          <span className="font-mono text-[#e2e8f0]">E/Q</span> Throttle
          <span>·</span>
          <span className="font-mono text-[#e2e8f0]">Shift</span> Boost
          <span>·</span>
          <span className="font-mono text-[#e2e8f0]">C</span> Camera
          <span>·</span>
          <span className="font-mono text-[#e2e8f0]">P</span> Pause
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
          <span className="sm:hidden">
            {Math.round(hud.speedKmh)} km/h · {Math.round(hud.aglM)} m AGL
          </span>
          <span>
            {hud.lat.toFixed(4)}°N, {hud.lon.toFixed(4)}°E
          </span>
        </div>
      </div>

      {/* Paused / Crashed Modal */}
      {(status === 'paused' || status === 'crashed') && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#10141c]/95 p-6 text-center shadow-2xl">
            {status === 'paused' && (
              <>
                <div className="text-[11px] font-medium tracking-wider text-sky-400 uppercase">
                  Simulation Hold
                </div>
                <h3 className="mt-1 text-xl font-semibold text-white">Flight Paused</h3>
                <p className="mt-1 text-xs text-[#9aa0a6]">
                  {course.name} · {craft.name}
                </p>
              </>
            )}

            {status === 'crashed' && (
              <>
                <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-white">Terrain Impact</h3>
                <p className="mt-1 text-xs text-rose-300">
                  {hud.crashReason || 'Vehicle contacted the Martian surface below safe clearance.'}
                </p>
              </>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 font-mono text-xs tabular-nums">
              <div>
                <div className="text-[10px] text-[#9aa0a6]">FLIGHT TIME</div>
                <div className="mt-0.5 font-semibold text-white">
                  {formatFlightTime(hud.elapsedMs)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#9aa0a6]">PEAK SPEED</div>
                <div className="mt-0.5 font-semibold text-orange-300">
                  {Math.round(hud.peakSpeedKmh)} km/h
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {status === 'paused' && (
                <button
                  type="button"
                  onClick={onTogglePause}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Resume</span>
                </button>
              )}

              <button
                type="button"
                onClick={onRestartFlight}
                className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Fly Again</span>
              </button>

              <button
                type="button"
                onClick={onOpenMenu}
                className="rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-xs font-medium text-[#e2e8f0] hover:bg-white/12"
              >
                Hangar
              </button>

              <button
                type="button"
                onClick={onExit}
                className="rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-xs font-medium text-[#9aa0a6] hover:bg-white/12 hover:text-white"
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
