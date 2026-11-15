import { useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Compass,
  ExternalLink,
  Flag,
  MapPin,
  Navigation,
  Rocket,
  X,
} from 'lucide-react';
import {
  AppSettings,
  GeologicalFeature,
  JezeroElevationGrid,
  MarsCoordinate,
  MarsLocation,
  MarsMission,
  MissionTelemetry,
  RoverWaypoint,
  ScientificPoi,
} from '../types/mars';
import { evaluateTerrainRisk } from '../analysis/riskScore';
import { findAssociatedMissionForLocation, findNearestVerifiedLocation } from '../services/marsMapService';
import { formatMarsCoords, marsDistanceMeters } from '../utils/coordinates';

interface RightSidebarProps {
  selectedCoord: MarsCoordinate | null;
  selectedLocation?: MarsLocation | null;
  selectedPoi?: ScientificPoi | null;
  selectedMission?: MarsMission | null;
  elevationGrid: JezeroElevationGrid | null;
  missionTelemetry: Record<string, MissionTelemetry>;
  geologicalFeatures: GeologicalFeature[];
  pois: ScientificPoi[];
  savedLocations: MarsCoordinate[];
  onSaveLocation: (coord: MarsCoordinate) => void;
  onSetRouteStart: (coord: MarsCoordinate) => void;
  onSetRouteDest: (coord: MarsCoordinate) => void;
  onFlyTo?: (lat: number, lon: number, altitudeM: number, label?: string) => void;
  settings: AppSettings;
  onCloseMobile?: () => void;
}

export default function RightSidebar({
  selectedCoord,
  selectedLocation,
  selectedPoi,
  selectedMission,
  elevationGrid,
  missionTelemetry,
  geologicalFeatures,
  pois,
  savedLocations,
  onSaveLocation,
  onSetRouteStart,
  onSetRouteDest,
  onFlyTo,
  settings,
  onCloseMobile,
}: RightSidebarProps) {
  const [imgError, setImgError] = useState(false);

  if (!selectedCoord) {
    return (
      <aside className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-amber-500/25 bg-[#0B0F17]/95 p-4 text-xs text-slate-400 shadow-2xl">
        <div className="mb-3 flex items-center justify-between border-b border-amber-500/20 pb-2.5">
          <div>
            <div className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
              Interplanetary Survival Guide
            </div>
            <h2 className="font-display text-sm font-semibold text-white">Site Survival Dossier</h2>
          </div>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Close Site Dossier"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="leading-relaxed">
          Select any coordinates on the 3D Mars terrain to assess EVA traversability, slope hazard class, atmospheric exposure conditions, geological deposits, and nearby rover field logs.
        </p>
      </aside>
    );
  }

  const formatted = formatMarsCoords(
    selectedCoord.lat,
    selectedCoord.lon,
    settings.coordinateFormat,
    settings.longitudeConvention
  );

  const terrain = evaluateTerrainRisk(
    elevationGrid,
    selectedCoord.lat,
    selectedCoord.lon,
    settings.slopeWarningDeg,
    settings.slopeDangerDeg
  );

  // Find nearest historical rover waypoint across loaded missions
  let nearestWp: { missionName: string; wp: RoverWaypoint; distanceM: number } | null = null;
  for (const [mId, tel] of Object.entries(missionTelemetry)) {
    for (const wp of tel.waypoints) {
      const d = marsDistanceMeters(selectedCoord.lat, selectedCoord.lon, wp.lat, wp.lon);
      if (!nearestWp || d < nearestWp.distanceM) {
        nearestWp = {
          missionName: mId === 'perseverance' ? 'Perseverance (M20)' : 'Curiosity (MSL)',
          wp,
          distanceM: d,
        };
      }
    }
  }

  // Nearby geological units (< 5 km)
  const nearbyGeology = geologicalFeatures
    .map((g) => ({
      feature: g,
      distKm: marsDistanceMeters(selectedCoord.lat, selectedCoord.lon, g.lat, g.lon) / 1000,
    }))
    .filter((x) => x.distKm <= x.feature.radiusKm + 2.5)
    .sort((a, b) => a.distKm - b.distKm);

  // Nearby scientific POIs (< 3 km)
  const nearbyPois = pois
    .map((p) => ({
      poi: p,
      distKm: marsDistanceMeters(selectedCoord.lat, selectedCoord.lon, p.lat, p.lon) / 1000,
    }))
    .filter((x) => x.distKm <= 3.0)
    .sort((a, b) => a.distKm - b.distKm);

  const isSaved = savedLocations.some(
    (s) => Math.abs(s.lat - selectedCoord.lat) < 0.0005 && Math.abs(s.lon - selectedCoord.lon) < 0.0005
  );

  const riskBadgeStyle =
    terrain.riskLevel === 'low'
      ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
      : terrain.riskLevel === 'moderate'
      ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
      : terrain.riskLevel === 'high'
      ? 'text-rose-400 border-rose-500/40 bg-rose-500/10'
      : 'text-slate-300 border-slate-600 bg-slate-800/60';

  const riskLabel =
    terrain.riskLevel === 'low'
      ? 'Lower Estimated Difficulty'
      : terrain.riskLevel === 'moderate'
      ? 'Moderate Estimated Difficulty'
      : terrain.riskLevel === 'high'
      ? 'Higher Estimated Difficulty'
      : 'Insufficient Data Coverage';

  const wpImage =
    nearestWp && nearestWp.distanceM <= 2500 && nearestWp.wp.images.length > 0
      ? nearestWp.wp.images[0]
      : null;

  const matchedLocation =
    selectedLocation ||
    findNearestVerifiedLocation(selectedCoord.lat, selectedCoord.lon, 25000)?.location ||
    null;

  const associatedMission =
    selectedMission || (matchedLocation ? findAssociatedMissionForLocation(matchedLocation) : null);

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto rounded-lg border border-amber-500/25 bg-[#0B0F17]/95 text-xs text-slate-200 shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-amber-500/20 bg-[#080B11]/95 px-4 py-3 backdrop-blur-sm">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
            Site Survival Dossier
          </div>
          <h2 className="truncate font-display text-sm font-semibold text-white">
            {selectedLocation?.name ||
              selectedMission?.name ||
              selectedPoi?.name ||
              selectedCoord.label ||
              'Selected Surface Sector'}
          </h2>
        </div>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Close Site Dossier"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-3 p-3.5">
        {/* Route & Save Actions */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onSetRouteStart(selectedCoord)}
            className="flex items-center justify-center gap-1 rounded-md border border-slate-700/80 bg-[#111824] px-2 py-1.5 text-[11px] font-medium text-emerald-300 hover:border-emerald-500/60"
          >
            <Navigation className="h-3 w-3" />
            Set Start
          </button>
          <button
            type="button"
            onClick={() => onSetRouteDest(selectedCoord)}
            className="flex items-center justify-center gap-1 rounded-md border border-slate-700/80 bg-[#111824] px-2 py-1.5 text-[11px] font-medium text-rose-300 hover:border-rose-500/60"
          >
            <Flag className="h-3 w-3" />
            Set Dest
          </button>
          <button
            type="button"
            onClick={() => onSaveLocation(selectedCoord)}
            className="flex items-center justify-center gap-1 rounded-md border border-slate-700/80 bg-[#111824] px-2 py-1.5 text-[11px] font-medium text-slate-200 hover:border-amber-500/60"
          >
            {isSaved ? <BookmarkCheck className="h-3 w-3 text-amber-400" /> : <Bookmark className="h-3 w-3" />}
            {isSaved ? 'Saved' : 'Bookmark'}
          </button>
        </div>

        {/* Verified Exploration Location & Mission Info Card */}
        {(matchedLocation || selectedPoi || associatedMission) && (
          <div className="rounded-md border border-cyan-500/35 bg-[#0D1420] p-3 space-y-2">
            {matchedLocation && (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tracking-wider text-cyan-300 uppercase">
                    Verified Exploration Location
                  </span>
                  <span className="rounded-sm border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200 uppercase">
                    {matchedLocation.category.replace('_', ' ')}
                  </span>
                </div>
                <div className="mt-1 font-display text-xs font-semibold text-white">
                  {matchedLocation.name}
                </div>
                <div className="text-[10px] text-slate-400">
                  {matchedLocation.region}
                  {matchedLocation.elevationM !== undefined
                    ? ` · MOLA ${matchedLocation.elevationM.toLocaleString()} m`
                    : ''}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-200">
                  {matchedLocation.summary}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                  <span className="truncate">Source: {matchedLocation.source}</span>
                  {onFlyTo && (
                    <button
                      type="button"
                      onClick={() =>
                        onFlyTo(
                          matchedLocation.lat,
                          matchedLocation.lon,
                          matchedLocation.region.includes('Jezero') ? 12000 : 120000,
                          matchedLocation.name
                        )
                      }
                      className="inline-flex shrink-0 items-center gap-1 font-medium text-amber-400 hover:underline"
                    >
                      <Compass className="h-3 w-3" /> Focus
                    </button>
                  )}
                </div>
              </div>
            )}

            {selectedPoi && (
              <div className={matchedLocation ? 'border-t border-slate-800 pt-2' : ''}>
                <div className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
                  Scientific Target Pin
                </div>
                <div className="mt-0.5 font-display text-xs font-semibold text-white">
                  {selectedPoi.name}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                  {selectedPoi.description}
                </p>
                <div className="mt-1 text-[10px] text-slate-400">
                  {selectedPoi.associatedInstrument} · {selectedPoi.observationDate} ·{' '}
                  {selectedPoi.source}
                </div>
              </div>
            )}

            {associatedMission && (
              <div className={matchedLocation || selectedPoi ? 'border-t border-slate-800 pt-2' : ''}>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider text-amber-300 uppercase">
                    <Rocket className="h-3 w-3" />
                    Associated Mission
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {associatedMission.missionType} · {associatedMission.landingDate}
                  </span>
                </div>
                <div className="mt-1 font-display text-xs font-semibold text-white">
                  {associatedMission.name}
                </div>
                <div className="text-[10px] text-slate-400">
                  {associatedMission.agency} · {associatedMission.status}
                  {associatedMission.totalTraverseKm > 0
                    ? ` · ${associatedMission.totalTraverseKm} km traverse`
                    : ''}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                  {associatedMission.description}
                </p>
                <a
                  href={associatedMission.nasaRecordUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-cyan-300 hover:underline"
                >
                  NASA Official Mission Archive <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Coordinates & Telemetry Grid */}
        <div className="rounded-md border border-slate-700/70 bg-[#111824] p-3">
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>Mars 2000 Planetocentric</span>
            <span className="font-mono text-amber-400/90">IAU Datum</span>
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
            <div>
              <div className="text-[10px] text-slate-500">LATITUDE</div>
              <div className="text-sm font-semibold text-white">{formatted.latStr}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">LONGITUDE</div>
              <div className="text-sm font-semibold text-white">{formatted.lonStr}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">ELEVATION (MOLA AREOID)</div>
              <div className="text-sm font-semibold text-cyan-300">
                {terrain.elevationM !== null
                  ? `${terrain.elevationM.toFixed(1)} m`
                  : matchedLocation?.elevationM !== undefined
                  ? `${matchedLocation.elevationM.toLocaleString()} m (MOLA)`
                  : 'Out of Grid'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">EST. SLOPE / TRI</div>
              <div className="text-sm font-semibold text-slate-100">
                {terrain.slopeDeg !== null
                  ? `${terrain.slopeDeg.toFixed(1)}° / ${terrain.roughnessM?.toFixed(1) ?? '—'} m`
                  : 'N/A'}
              </div>
            </div>
          </div>
          <div className="mt-2 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
            Provenance:{' '}
            <span className="text-slate-200">
              {terrain.dataQuality === 'measured'
                ? 'Measured NASA M20 Localization + Regional DTM'
                : terrain.dataQuality === 'regional_model'
                ? 'Regional MOLA/HiRISE Topographic Estimate'
                : 'Global MOLA Reference (Outside Jezero High-Res Grid)'}
            </span>
          </div>
        </div>

        {/* Terrain Risk & Survival Classification */}
        <div className="rounded-md border border-slate-700/70 bg-[#111824] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-300">EVA Hazard Rating</span>
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${riskBadgeStyle}`}>
              {riskLabel}
            </span>
          </div>
          <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-200">
            {terrain.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-xs bg-amber-400" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2.5 flex items-start gap-1.5 border-t border-slate-800 pt-2 text-[10px] text-slate-400">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
            <span>
              Orbital imagery and ~115 m DEM slopes cannot verify sub-meter regolith bearing strength or boulder traps.
            </span>
          </div>
        </div>

        {/* Planetary Survival Protocol Summary */}
        <div className="rounded-md border border-amber-500/25 bg-[#0D131E] p-3">
          <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
            Surface Survival Mandate
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono text-[10px] tabular-nums">
            <div>
              <div className="text-slate-500">AMBIENT PRESSURE</div>
              <div className="text-rose-300">~610 Pa · Suit Required</div>
            </div>
            <div>
              <div className="text-slate-500">GRAVITY / RADIATION</div>
              <div className="text-amber-300">0.38g · ~0.67 mSv/day</div>
            </div>
          </div>
          <div className="mt-2 border-t border-slate-800/80 pt-1.5 text-[10px] leading-relaxed text-slate-300">
            {terrain.riskLevel === 'high'
              ? 'Survival Advisory: High-angle terrain. Avoid unpressurized foot EVA; use SEV pressurized rover or reroute via low-grade corridor.'
              : terrain.riskLevel === 'moderate'
              ? 'Survival Advisory: Moderate grade. Monitor wheel slip and battery thermal draw; confirm line-of-sight to MRO UHF relay.'
              : 'Survival Advisory: Favorable surface geometry for rover transit and temporary field shelter deployment.'}
          </div>
        </div>

        {/* Nearest Rover Observation */}
        {nearestWp && nearestWp.distanceM <= 8000 && (
          <div className="rounded-md border border-slate-700/70 bg-[#111824] p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-amber-400">
                Nearest Recon Rover Log
              </span>
              <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                {(nearestWp.distanceM / 1000).toFixed(2)} km away
              </span>
            </div>
            <div className="text-xs font-semibold text-white">
              {nearestWp.missionName} · Sol {nearestWp.wp.sol} (RMC {nearestWp.wp.rmc})
            </div>
            <div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
              Odometer: {(nearestWp.wp.distTotalM / 1000).toFixed(2)} km · Tilt:{' '}
              {nearestWp.wp.tiltDeg !== null ? `${nearestWp.wp.tiltDeg.toFixed(1)}°` : 'N/A'} · Elev:{' '}
              {nearestWp.wp.elevGeoidM !== null ? `${nearestWp.wp.elevGeoidM.toFixed(1)} m` : 'N/A'}
            </div>
            {nearestWp.wp.note && (
              <div className="mt-1.5 text-[11px] text-slate-300">Note: {nearestWp.wp.note}</div>
            )}
            {wpImage && !imgError && (
              <div className="mt-2 overflow-hidden rounded-md border border-slate-700 bg-black">
                <img
                  src={wpImage.url}
                  alt={`${nearestWp.missionName} Sol ${nearestWp.wp.sol} ${wpImage.name}`}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="h-28 w-full object-cover"
                />
                <div className="px-2 py-1 text-[10px] text-slate-400">
                  NASA/JPL Mastcam/Navcam Mosaic ({wpImage.name}) · Sol {nearestWp.wp.sol}
                </div>
              </div>
            )}
            <div className="mt-1.5 text-[10px] text-slate-500">
              Source: NASA/JPL MMGIS Historical Localization Archive
            </div>
          </div>
        )}

        {/* Geological & Mineralogical Context */}
        <div className="rounded-md border border-slate-700/70 bg-[#111824] p-3">
          <h3 className="mb-2 text-[11px] font-medium text-slate-300">
            Geological & Mineral Resources
          </h3>
          {nearbyGeology.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              No cataloged Jezero geological/CRISM mineral unit polygon intersects this point. Refer to USGS SIM 3292 Global Geology layer for regional units.
            </p>
          ) : (
            <div className="space-y-2.5">
              {nearbyGeology.map(({ feature, distKm }) => (
                <div key={feature.id} className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{feature.name}</span>
                    <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                      {distKm < 0.2 ? 'Inside unit' : `${distKm.toFixed(1)} km`}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-cyan-300">
                    {feature.evidenceStatus} · {feature.observationDate}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                    {feature.description}
                  </p>
                  <div className="mt-1 text-[10px] text-slate-400">
                    Observation: {feature.supportingObservation}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500">Source: {feature.source}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Nearby Scientific POIs */}
        {nearbyPois.length > 0 && (
          <div className="rounded-md border border-slate-700/70 bg-[#111824] p-3">
            <h3 className="mb-2 text-[11px] font-medium text-slate-300">
              Nearby Waypoints & Science Targets (&lt; 3 km)
            </h3>
            <div className="space-y-2">
              {nearbyPois.map(({ poi, distKm }) => (
                <div key={poi.id} className="flex items-start justify-between gap-2 border-t border-slate-800 pt-2 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium text-white">
                      <MapPin className="h-3 w-3 shrink-0 text-amber-400" />
                      <span className="truncate">{poi.name}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {poi.associatedInstrument} · {poi.observationDate}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400 tabular-nums">
                    {distKm.toFixed(2)} km
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
