import { jsPDF } from 'jspdf';
import { MarsLayerConfig, PlannedRoute } from '../types/mars';

export function exportRouteGeoJSON(route: PlannedRoute, missionName: string) {
  const geojson = {
    type: 'FeatureCollection',
    properties: {
      missionName,
      routeName: route.name,
      mode: route.mode,
      totalDistanceKm: route.totalDistanceKm,
      minElevationM: route.minElevationM,
      maxElevationM: route.maxElevationM,
      totalAscentM: route.totalAscentM,
      totalDescentM: route.totalDescentM,
      maxSlopeDeg: route.maxSlopeDeg,
      overallDifficulty: route.overallDifficulty,
      isProvisional: route.isProvisional,
      provisionalReason: route.provisionalReason || null,
      computedAt: route.computedAt,
      disclaimer:
        'Scientific mission-planning prototype. Not certified for actual astronaut or rover navigation.',
    },
    features: [
      {
        type: 'Feature',
        properties: {
          featureType: 'planned_route',
          name: route.name,
          mode: route.mode,
          distanceKm: route.totalDistanceKm,
        },
        geometry: {
          type: 'LineString',
          coordinates: route.profile.map((p) => [p.lon, p.lat, p.elevationM ?? 0]),
        },
      },
      {
        type: 'Feature',
        properties: { featureType: 'start_point', label: route.start.label || 'Start' },
        geometry: { type: 'Point', coordinates: [route.start.lon, route.start.lat] },
      },
      {
        type: 'Feature',
        properties: { featureType: 'destination_point', label: route.destination.label || 'Destination' },
        geometry: { type: 'Point', coordinates: [route.destination.lon, route.destination.lat] },
      },
      ...route.hazards.map((hz) => ({
        type: 'Feature',
        properties: {
          featureType: 'route_hazard',
          hazardType: hz.type,
          severity: hz.severity,
          distanceKm: hz.distanceKm,
          detail: hz.detail,
        },
        geometry: { type: 'Point', coordinates: [hz.lon, hz.lat] },
      })),
    ],
  };

  downloadTextFile(
    JSON.stringify(geojson, null, 2),
    `${slugify(missionName)}_${route.mode}.geojson`,
    'application/geo+json'
  );
}

export function exportRouteCSV(route: PlannedRoute, missionName: string) {
  const headers = [
    'Distance_km',
    'Latitude_deg',
    'Longitude_deg',
    'Elevation_m',
    'Slope_deg',
    'Roughness_TRI_m',
    'Risk_Level',
    'Data_Quality',
  ];
  const rows = route.profile.map((p) => [
    p.distanceKm.toFixed(3),
    p.lat.toFixed(6),
    p.lon.toFixed(6),
    p.elevationM !== null ? p.elevationM.toFixed(2) : 'MISSING',
    p.slopeDeg !== null ? p.slopeDeg.toFixed(2) : 'MISSING',
    p.roughnessM !== null ? p.roughnessM.toFixed(2) : 'MISSING',
    p.riskLevel,
    p.dataQuality,
  ]);
  const csv = [
    `# Mars Explorer Mission Report: ${missionName}`,
    `# Route: ${route.name} (${route.mode}) | Distance: ${route.totalDistanceKm} km | Provisional: ${route.isProvisional}`,
    `# Disclaimer: Not certified for operational astronaut navigation.`,
    headers.join(','),
    ...rows.map((r) => r.join(',')),
  ].join('\n');

  downloadTextFile(csv, `${slugify(missionName)}_profile.csv`, 'text/csv;charset=utf-8');
}

export function exportMissionReportPDF(
  route: PlannedRoute,
  missionName: string,
  activeLayers: MarsLayerConfig[]
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('MARS EXPLORER — MISSION PLANNING REPORT', 14, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`Mission Plan: ${missionName} | Generated: ${new Date(route.computedAt).toUTCString()}`, 14, y);
  y += 8;

  doc.setDrawColor(210, 80, 30);
  doc.line(14, y, 196, y);
  y += 7;

  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('1. Route Summary & Coordinates (Mars 2000 IAU)', 14, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const summaryLines = [
    `Route Strategy: ${route.name} (${route.mode})`,
    `Start: ${route.start.lat.toFixed(5)}°N, ${route.start.lon.toFixed(5)}°E ${route.start.label ? `(${route.start.label})` : ''}`,
    `Destination: ${route.destination.lat.toFixed(5)}°N, ${route.destination.lon.toFixed(5)}°E ${route.destination.label ? `(${route.destination.label})` : ''}`,
    `Total Distance: ${route.totalDistanceKm} km | Overall Difficulty: ${route.overallDifficulty.toUpperCase()}`,
    `Elevation Range: ${route.minElevationM ?? 'N/A'} m to ${route.maxElevationM ?? 'N/A'} m (Ascent: +${route.totalAscentM} m / Descent: -${route.totalDescentM} m)`,
    `Max Estimated Slope: ${route.maxSlopeDeg}° | Mean Slope: ${route.avgSlopeDeg}° | Steep Sections (>=12°): ${route.steepSectionsCount}`,
    `Provisional Status: ${route.isProvisional ? `YES — ${route.provisionalReason}` : 'No data gaps detected within Jezero grid'}`,
  ];
  summaryLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, 180);
    doc.text(wrapped, 14, y);
    y += wrapped.length * 4.8;
  });

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('2. Elevation Profile Preview', 14, y);
  y += 4;

  // Draw vector elevation chart in PDF
  const chartX = 14;
  const chartY = y;
  const chartW = 180;
  const chartH = 34;
  doc.setDrawColor(180, 180, 180);
  doc.rect(chartX, chartY, chartW, chartH);

  const validPts = route.profile.filter((p) => p.elevationM !== null);
  if (validPts.length >= 2 && route.totalDistanceKm > 0) {
    const minE = Math.min(...validPts.map((p) => p.elevationM as number));
    const maxE = Math.max(...validPts.map((p) => p.elevationM as number));
    const spanE = Math.max(10, maxE - minE);
    doc.setDrawColor(234, 88, 12);
    doc.setLineWidth(0.6);
    for (let i = 1; i < validPts.length; i++) {
      const p0 = validPts[i - 1];
      const p1 = validPts[i];
      const x0 = chartX + (p0.distanceKm / route.totalDistanceKm) * chartW;
      const y0 = chartY + chartH - (((p0.elevationM as number) - minE) / spanE) * (chartH - 6) - 3;
      const x1 = chartX + (p1.distanceKm / route.totalDistanceKm) * chartW;
      const y1 = chartY + chartH - (((p1.elevationM as number) - minE) / spanE) * (chartH - 6) - 3;
      doc.line(x0, y0, x1, y1);
    }
  }
  y += chartH + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`3. Identified Terrain Hazards (${route.hazards.length})`, 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (route.hazards.length === 0) {
    doc.text('No major grid-scale hazards (>12° slope or mapped crater/dune hazard) intersected.', 14, y);
    y += 5;
  } else {
    route.hazards.slice(0, 8).forEach((hz) => {
      const text = `- [${hz.severity.toUpperCase()}] km ${hz.distanceKm.toFixed(2)}: ${hz.type} — ${hz.detail}`;
      const wrapped = doc.splitTextToSize(text, 180);
      doc.text(wrapped, 14, y);
      y += wrapped.length * 4.4;
    });
  }

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`4. Nearby Scientific Points of Interest (${route.nearbyPois.length})`, 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (route.nearbyPois.length === 0) {
    doc.text('No cataloged POIs within 1.5 km of planned path.', 14, y);
    y += 5;
  } else {
    route.nearbyPois.slice(0, 6).forEach((poi) => {
      const text = `- ${poi.name} (${poi.distanceToRouteKm} km off route) | ${poi.associatedInstrument} | ${poi.observationDate}`;
      const wrapped = doc.splitTextToSize(text, 180);
      doc.text(wrapped, 14, y);
      y += wrapped.length * 4.4;
    });
  }

  y += 4;
  if (y > 240) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('5. Data Sources, Provenance & Limitations', 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  activeLayers.forEach((l) => {
    const line = `- ${l.name} | Source: ${l.source} | Date: ${l.observationDate} | Res: ${l.resolution}`;
    const wrapped = doc.splitTextToSize(line, 180);
    doc.text(wrapped, 14, y);
    y += wrapped.length * 4.1;
  });

  y += 4;
  doc.setTextColor(150, 40, 20);
  const disclaimer = doc.splitTextToSize(
    'SCIENTIFIC LIMITATIONS: Terrain analysis uses ~220 m regional elevation grid blended with NASA M20 Perseverance historical waypoints. Sub-meter hazards (boulders, unconsolidated aeolian dust traps, cliff overhangs) cannot be verified without dedicated HiRISE stereo DTM inspection. This software is NOT certified for actual astronaut or robotic surface navigation.',
    180
  );
  doc.text(disclaimer, 14, y);

  doc.save(`${slugify(missionName)}_mission_report.pdf`);
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'mars_mission';
}
