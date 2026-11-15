import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Map, X } from 'lucide-react';
import { MarsLayerConfig, PlannedRoute } from '../types/mars';
import {
  exportMissionReportPDF,
  exportRouteCSV,
  exportRouteGeoJSON,
} from '../services/reportExport';

interface ReportModalProps {
  route: PlannedRoute;
  activeLayers: MarsLayerConfig[];
  onClose: () => void;
}

export default function ReportModal({ route, activeLayers, onClose }: ReportModalProps) {
  const [missionName, setMissionName] = useState(
    `Jezero EVA Traverse — ${route.destination.label || 'Delta Campaign'}`
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-amber-500/30 bg-[#0B0F17] text-xs text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-amber-500/20 bg-[#080B11] px-4 py-3">
          <div>
            <div className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
              EVA Field Briefing Export
            </div>
            <h2 className="font-display text-sm font-semibold text-white">
              Survival Traverse Report Generator
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <label htmlFor="mission-report-name" className="mb-1.5 block font-medium text-slate-300">
              Survival Traverse Plan Title
            </label>
            <input
              id="mission-report-name"
              type="text"
              value={missionName}
              onChange={(e) => setMissionName(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-700/80 bg-[#111824] px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Summary Grid */}
          <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-700/70 bg-[#111824] p-3 font-mono tabular-nums">
            <div>
              <div className="text-[10px] text-slate-400">START COORDINATES</div>
              <div className="text-white">
                {route.start.lat.toFixed(5)}°N, {route.start.lon.toFixed(5)}°E
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">DESTINATION COORDINATES</div>
              <div className="text-white">
                {route.destination.lat.toFixed(5)}°N, {route.destination.lon.toFixed(5)}°E
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">TOTAL DISTANCE / HAZARD CLASS</div>
              <div className="text-amber-400">
                {route.totalDistanceKm.toFixed(2)} km · {route.overallDifficulty.toUpperCase()}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">ELEVATION / MAX SLOPE</div>
              <div className="text-cyan-300">
                {route.minElevationM ?? '—'}m to {route.maxElevationM ?? '—'}m · Max{' '}
                {route.maxSlopeDeg.toFixed(1)}°
              </div>
            </div>
          </div>

          {/* Hazards & Science */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border border-slate-700/70 bg-[#111824] p-3">
              <div className="mb-1.5 font-semibold text-white">
                Identified Survival Hazards ({route.hazards.length})
              </div>
              {route.hazards.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  No major grid-scale hazards detected along planned waypoints.
                </p>
              ) : (
                <ul className="space-y-1 text-[11px] text-slate-300">
                  {route.hazards.slice(0, 5).map((h) => (
                    <li key={h.id}>
                      km {h.distanceKm.toFixed(2)}: {h.type} ({h.severity})
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-md border border-slate-700/70 bg-[#111824] p-3">
              <div className="mb-1.5 font-semibold text-white">
                Field Science Targets Nearby ({route.nearbyPois.length})
              </div>
              {route.nearbyPois.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  No cataloged POIs within 1.5 km of traverse.
                </p>
              ) : (
                <ul className="space-y-1 text-[11px] text-slate-300">
                  {route.nearbyPois.slice(0, 5).map((p) => (
                    <li key={p.id}>
                      {p.name} ({p.distanceToRouteKm} km off route)
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Provenance & Limitations */}
          <div className="rounded-md border border-slate-700/70 bg-[#111824] p-3">
            <div className="mb-1.5 font-semibold text-white">
              Active Data Sources & Observation Dates ({activeLayers.length})
            </div>
            <ul className="space-y-1 text-[10px] text-slate-300">
              {activeLayers.map((l) => (
                <li key={l.id}>
                  <span className="text-white">{l.name}</span> — {l.source} ({l.observationDate})
                </li>
              ))}
            </ul>
            <div className="mt-2.5 border-t border-slate-800 pt-2 text-[10px] leading-relaxed text-amber-300/90">
              <strong>Field Advisory:</strong> Regional terrain risk combines ~115 m Jezero elevation modeling with historical NASA M20 Perseverance waypoints. Sub-meter boulders, unconsolidated dust traps, and overhangs require high-resolution HiRISE stereo DTM verification. Not certified for operational astronaut navigation.
            </div>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-[#080B11] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportMissionReportPDF(route, missionName, activeLayers)}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-1.5 font-semibold text-slate-950 hover:bg-amber-400"
            >
              <FileText className="h-3.5 w-3.5" />
              Export PDF Field Brief
            </button>
            <button
              type="button"
              onClick={() => exportRouteGeoJSON(route, missionName)}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-[#111824] px-3.5 py-1.5 font-medium text-cyan-300 hover:bg-cyan-500/10"
            >
              <Map className="h-3.5 w-3.5" />
              Export GeoJSON
            </button>
            <button
              type="button"
              onClick={() => exportRouteCSV(route, missionName)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#111824] px-3.5 py-1.5 font-medium text-slate-200 hover:border-slate-500"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Profile CSV
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-4 py-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <Download className="hidden" />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
