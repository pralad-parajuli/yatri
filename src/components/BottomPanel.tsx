import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  MapPin,
  Truck,
  X,
} from 'lucide-react';
import { ElevationProfilePoint, PlannedRoute } from '../types/mars';

interface BottomPanelProps {
  routes: PlannedRoute[];
  activeRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  onHoverProfilePoint: (point: ElevationProfilePoint | null) => void;
  onOpenReportModal: () => void;
  onFlyToPoi: (lat: number, lon: number, name: string) => void;
  onLaunchRoverSim?: () => void;
  onClose?: () => void;
}

export default function BottomPanel({
  routes,
  activeRouteId,
  onSelectRoute,
  onHoverProfilePoint,
  onOpenReportModal,
  onFlyToPoi,
  onLaunchRoverSim,
  onClose,
}: BottomPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [subTab, setSubTab] = useState<'profile' | 'compare' | 'hazards' | 'science'>('profile');

  const activeRoute = routes.find((r) => r.id === activeRouteId) || routes[0] || null;

  if (!activeRoute) {
    return null;
  }

  const validPoints = activeRoute.profile.filter((p) => p.elevationM !== null);
  const minE =
    validPoints.length > 0 ? Math.min(...validPoints.map((p) => p.elevationM as number)) : -2700;
  const maxE =
    validPoints.length > 0 ? Math.max(...validPoints.map((p) => p.elevationM as number)) : -2100;
  const spanE = Math.max(20, maxE - minE);

  const svgW = 720;
  const svgH = 122;
  const padL = 48;
  const padR = 16;
  const padT = 12;
  const padB = 22;
  const innerW = svgW - padL - padR;
  const innerH = svgH - padT - padB;

  const totalDist = Math.max(0.01, activeRoute.totalDistanceKm);

  const toX = (distKm: number) => padL + (distKm / totalDist) * innerW;
  const toY = (elevM: number) => padT + innerH - ((elevM - minE) / spanE) * innerH;

  const polylinePoints = activeRoute.profile
    .filter((p) => p.elevationM !== null)
    .map((p) => `${toX(p.distanceKm).toFixed(1)},${toY(p.elevationM as number).toFixed(1)}`)
    .join(' ');

  const hoveredPoint =
    hoverIdx !== null && activeRoute.profile[hoverIdx] ? activeRoute.profile[hoverIdx] : null;

  return (
    <section className="pointer-events-auto overflow-hidden rounded-lg border border-amber-500/25 bg-[#0B0F17]/95 text-xs text-slate-200 shadow-2xl">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 bg-[#080B11] px-3.5 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-1.5 font-display font-semibold text-white hover:text-amber-300"
          >
            {collapsed ? <ChevronUp className="h-4 w-4 text-amber-400" /> : <ChevronDown className="h-4 w-4 text-amber-400" />}
            <span className="truncate max-w-[220px] sm:max-w-xs">{activeRoute.name}</span>
          </button>

          <div className="hidden md:flex items-center gap-2.5 font-mono text-[11px] text-slate-300 tabular-nums">
            <span>{activeRoute.totalDistanceKm.toFixed(2)} km</span>
            <span className="text-slate-600">·</span>
            <span>
              +{activeRoute.totalAscentM.toFixed(0)} / -{activeRoute.totalDescentM.toFixed(0)} m
            </span>
            <span className="text-slate-600">·</span>
            <span>Max {activeRoute.maxSlopeDeg.toFixed(1)}°</span>
            <span className="text-slate-600">·</span>
            <span
              className={
                activeRoute.overallDifficulty === 'low'
                  ? 'text-emerald-400'
                  : activeRoute.overallDifficulty === 'moderate'
                  ? 'text-amber-400'
                  : activeRoute.overallDifficulty === 'high'
                  ? 'text-rose-400'
                  : 'text-slate-400'
              }
            >
              {activeRoute.overallDifficulty.toUpperCase()} RISK
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-slate-700/80 bg-[#111824] p-0.5">
            {(
              [
                ['profile', 'Profile'],
                ['compare', `Compare (${routes.length})`],
                ['hazards', `Hazards (${activeRoute.hazards.length})`],
                ['science', `Targets (${activeRoute.nearbyPois.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSubTab(id);
                  setCollapsed(false);
                }}
                className={`rounded-xs px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                  subTab === id
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {onLaunchRoverSim && (
            <button
              type="button"
              onClick={onLaunchRoverSim}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/50 bg-cyan-500/15 px-3 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25 whitespace-nowrap"
              title="Drive this route in the 3D Rover Simulator"
            >
              <Truck className="h-3.5 w-3.5 text-cyan-400" />
              Drive Rover
            </button>
          )}

          <button
            type="button"
            onClick={onOpenReportModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1 text-[11px] font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
          >
            <FileText className="h-3.5 w-3.5" />
            Field Brief
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
              title="Close Elevation Profile Dock"
              aria-label="Close elevation dock"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-3">
          {activeRoute.isProvisional && (
            <div className="mb-2.5 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>
                <strong>Provisional Route:</strong> {activeRoute.provisionalReason}
              </span>
            </div>
          )}

          {subTab === 'profile' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-9">
                <div className="relative rounded-md border border-slate-700/70 bg-[#111824] p-2">
                  <svg
                    viewBox={`0 0 ${svgW} ${svgH}`}
                    className="h-28 w-full select-none"
                    onMouseLeave={() => {
                      setHoverIdx(null);
                      onHoverProfilePoint(null);
                    }}
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const relX = ((e.clientX - rect.left) / rect.width) * svgW;
                      const distGuess = ((relX - padL) / innerW) * totalDist;
                      let bestIdx = 0;
                      let bestDiff = Infinity;
                      activeRoute.profile.forEach((p, idx) => {
                        const d = Math.abs(p.distanceKm - distGuess);
                        if (d < bestDiff) {
                          bestDiff = d;
                          bestIdx = idx;
                        }
                      });
                      setHoverIdx(bestIdx);
                      onHoverProfilePoint(activeRoute.profile[bestIdx] || null);
                    }}
                  >
                    {/* Grid lines */}
                    {[0, 0.5, 1].map((t) => {
                      const y = padT + t * innerH;
                      const val = maxE - t * spanE;
                      return (
                        <g key={t}>
                          <line
                            x1={padL}
                            y1={y}
                            x2={svgW - padR}
                            y2={y}
                            stroke="rgba(255,255,255,0.1)"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={padL - 6}
                            y={y + 3}
                            textAnchor="end"
                            fill="#9aa0a6"
                            fontSize="9"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {val.toFixed(0)}m
                          </text>
                        </g>
                      );
                    })}

                    {/* Steep section highlights */}
                    {activeRoute.profile.map((p, idx) => {
                      if (idx === 0 || p.slopeDeg === null || p.slopeDeg < 12) return null;
                      const prev = activeRoute.profile[idx - 1];
                      const x0 = toX(prev.distanceKm);
                      const x1 = toX(p.distanceKm);
                      return (
                        <rect
                          key={idx}
                          x={x0}
                          y={padT}
                          width={Math.max(2, x1 - x0)}
                          height={innerH}
                          fill={p.slopeDeg >= 15 ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.2)'}
                        />
                      );
                    })}

                    {/* Elevation polyline */}
                    {polylinePoints && (
                      <polyline
                        fill="none"
                        stroke={activeRoute.color}
                        strokeWidth="2.4"
                        strokeLinejoin="round"
                        points={polylinePoints}
                      />
                    )}

                    {/* X-axis distance ticks */}
                    {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                      const x = padL + t * innerW;
                      return (
                        <text
                          key={t}
                          x={x}
                          y={svgH - 5}
                          textAnchor="middle"
                          fill="#9aa0a6"
                          fontSize="9"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {(t * totalDist).toFixed(2)} km
                        </text>
                      );
                    })}

                    {/* Hover crosshair */}
                    {hoveredPoint && hoveredPoint.elevationM !== null && (
                      <g>
                        <line
                          x1={toX(hoveredPoint.distanceKm)}
                          y1={padT}
                          x2={toX(hoveredPoint.distanceKm)}
                          y2={padT + innerH}
                          stroke="#f59e0b"
                          strokeWidth="1"
                        />
                        <circle
                          cx={toX(hoveredPoint.distanceKm)}
                          cy={toY(hoveredPoint.elevationM)}
                          r="4"
                          fill="#f59e0b"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                      </g>
                    )}
                  </svg>

                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                    <span>
                      Hover profile to pinpoint surface position. Highlighted bands mark steep grades (amber ≥12°, red ≥15°).
                    </span>
                    {hoveredPoint && (
                      <span className="font-mono text-amber-300 tabular-nums">
                        km {hoveredPoint.distanceKm.toFixed(2)} ·{' '}
                        {hoveredPoint.elevationM !== null
                          ? `${hoveredPoint.elevationM.toFixed(1)} m`
                          : 'No DEM'}{' '}
                        · Slope {hoveredPoint.slopeDeg !== null ? `${hoveredPoint.slopeDeg.toFixed(1)}°` : 'N/A'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 lg:col-span-3 font-mono tabular-nums">
                <div className="rounded-md border border-slate-700/70 bg-[#111824] p-2">
                  <div className="text-[10px] text-slate-400">DISTANCE</div>
                  <div className="text-sm font-semibold text-white">
                    {activeRoute.totalDistanceKm.toFixed(2)} km
                  </div>
                </div>
                <div className="rounded-md border border-slate-700/70 bg-[#111824] p-2">
                  <div className="text-[10px] text-slate-400">MAX / MIN</div>
                  <div className="text-xs font-semibold text-cyan-300">
                    {activeRoute.maxElevationM ?? '—'} / {activeRoute.minElevationM ?? '—'} m
                  </div>
                </div>
                <div className="rounded-md border border-slate-700/70 bg-[#111824] p-2">
                  <div className="text-[10px] text-slate-400">GAIN / LOSS</div>
                  <div className="text-xs font-semibold text-slate-100">
                    +{activeRoute.totalAscentM.toFixed(0)} / -{activeRoute.totalDescentM.toFixed(0)} m
                  </div>
                </div>
                <div className="rounded-md border border-slate-700/70 bg-[#111824] p-2">
                  <div className="text-[10px] text-slate-400">STEEP SEGS</div>
                  <div className="text-xs font-semibold text-amber-300">
                    {activeRoute.steepSectionsCount} (Max {activeRoute.maxSlopeDeg.toFixed(1)}°)
                  </div>
                </div>
              </div>
            </div>
          )}

          {subTab === 'compare' && (
            <div className="max-h-36 overflow-y-auto rounded-md border border-slate-700/70 bg-[#111824]">
              <table className="w-full text-left font-mono text-[11px] tabular-nums">
                <thead className="border-b border-slate-700/80 bg-[#080B11] text-[10px] text-slate-400">
                  <tr>
                    <th className="px-3 py-1.5">Strategy</th>
                    <th className="px-3 py-1.5">Dist (km)</th>
                    <th className="px-3 py-1.5">Ascent (m)</th>
                    <th className="px-3 py-1.5">Max Slope</th>
                    <th className="px-3 py-1.5">Hazards</th>
                    <th className="px-3 py-1.5">POIs Near</th>
                    <th className="px-3 py-1.5">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => onSelectRoute(r.id)}
                      className={`cursor-pointer border-b border-slate-800/80 hover:bg-white/5 ${
                        r.id === activeRoute.id ? 'bg-amber-500/15' : ''
                      }`}
                    >
                      <td className="px-3 py-1.5 font-sans font-medium text-white">
                        <span
                          className="mr-2 inline-block h-2 w-2 rounded-xs"
                          style={{ backgroundColor: r.color }}
                        />
                        {r.name}
                      </td>
                      <td className="px-3 py-1.5">{r.totalDistanceKm.toFixed(2)}</td>
                      <td className="px-3 py-1.5">+{r.totalAscentM.toFixed(0)}</td>
                      <td className="px-3 py-1.5">{r.maxSlopeDeg.toFixed(1)}°</td>
                      <td className="px-3 py-1.5">{r.hazards.length}</td>
                      <td className="px-3 py-1.5">{r.nearbyPois.length}</td>
                      <td className="px-3 py-1.5 uppercase">{r.overallDifficulty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {subTab === 'hazards' && (
            <div className="max-h-36 space-y-1.5 overflow-y-auto">
              {activeRoute.hazards.length === 0 ? (
                <div className="rounded-md border border-slate-700/70 bg-[#111824] p-3 text-slate-400">
                  No major grid-scale hazards (&ge;12° slope or mapped crater/dune hazards) along this path. Sub-meter rocks still require HiRISE validation.
                </div>
              ) : (
                activeRoute.hazards.map((hz) => (
                  <div
                    key={hz.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-slate-700/70 bg-[#111824] px-3 py-2"
                  >
                    <div>
                      <div className="font-semibold text-white">
                        {hz.type} · km {hz.distanceKm.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-400">{hz.detail}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onFlyToPoi(hz.lat, hz.lon, hz.type)}
                      className="shrink-0 text-[11px] font-medium text-amber-400 hover:underline"
                    >
                      Inspect
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {subTab === 'science' && (
            <div className="max-h-36 space-y-1.5 overflow-y-auto">
              {activeRoute.nearbyPois.length === 0 ? (
                <div className="rounded-md border border-slate-700/70 bg-[#111824] p-3 text-slate-400">
                  No cataloged scientific POIs within 1.5 km of this route. Try "Prioritize Scientific Targets" mode.
                </div>
              ) : (
                activeRoute.nearbyPois.map((poi) => (
                  <div
                    key={poi.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-700/70 bg-[#111824] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-medium text-white">
                        <MapPin className="h-3 w-3 shrink-0 text-amber-400" />
                        <span className="truncate">{poi.name}</span>
                      </div>
                      <div className="truncate text-[11px] text-slate-400">
                        {poi.distanceToRouteKm} km from route · {poi.associatedInstrument} ·{' '}
                        {poi.observationDate}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onFlyToPoi(poi.lat, poi.lon, poi.name)}
                      className="shrink-0 text-[11px] font-medium text-amber-400 hover:underline"
                    >
                      Locate
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
