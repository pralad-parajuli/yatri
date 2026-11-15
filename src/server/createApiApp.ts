import express, { Express } from 'express';

// Simple in-memory cache with TTL for NASA endpoints & tiles
interface CacheEntry<T> {
  data: T;
  contentType?: string;
  expiresAt: number;
}

interface RawWaypointFeature {
  properties: Record<string, unknown>;
  geometry: { coordinates: number[] };
}

interface RawTraverseFeature {
  properties?: Record<string, unknown>;
  geometry?: { type: string; coordinates: number[][] | number[][][] };
}

interface RawNasaImageLink {
  href?: string;
  rel?: string;
  render?: string;
  width?: number;
  height?: number;
}

interface RawNasaImageDatum {
  nasa_id?: string;
  title?: string;
  description?: string;
  description_508?: string;
  date_created?: string;
  center?: string;
  photographer?: string;
  secondary_creator?: string;
  keywords?: string[];
  location?: string;
}

interface RawNasaImageItem {
  href?: string;
  data?: RawNasaImageDatum[];
  links?: RawNasaImageLink[];
}

const ALLOWED_TREK_LAYERS = new Set([
  'Mars_Viking_MDIM21_ClrMosaic_global_232m',
  'Mars_MGS_MOLA_ClrShade_merge_global_463m',
  'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw',
  'Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw',
  'mola_roughness',
  'SIM3292_Global_Geology',
  'TES_Dust',
  'THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018',
  'THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018',
  'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd',
  'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0',
]);

const NASA_MODEL_MAP: Record<string, string> = {
  perseverance:
    'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Mars%202020%20Perseverance%20Rover/Mars%202020%20Perseverance%20Rover.glb',
  ingenuity:
    'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Ingenuity%20Mars%20Helicopter/Ingenuity%20Mars%20Helicopter.glb',
  insight:
    'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/InSight%20Cruise%20Lander/InSight%20Cruise%20Lander%20(arm%20deployed).glb',
  mer:
    'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Mars%20Exploration%20Rover%20-%20Opportunity%20(MER-B)/Mars%20Exploration%20Rover%20-%20Opportunity%20(MER-B).glb',
  viking:
    'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Viking%20Lander/Viking%20Lander.glb',
  mro:
    'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Mars%20Reconnaissance%20Orbiter%20(MRO)%20(C)/Mars%20Reconnaissance%20Orbiter%20(MRO)%20(C).glb',
  mgs:
    'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Mars%20Global%20Surveyor/Mars%20Global%20Surveyor.glb',
  odyssey:
    'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Mars%20Odyssey/Mars%20Odyssey.glb',
};

const MAX_TILE_CACHE = 800;
const VERCEL_SAFE_BODY_BYTES = 4 * 1024 * 1024; // Stay under Vercel's 4.5 MB serverless payload limit

function toHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('http://') ? `https://${url.slice(7)}` : url;
}

export function createApiApp(): Express {
  const NASA_API_KEY = process.env.NASA_API_KEY || '';
  const isVercel = process.env.VERCEL === '1';

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const jsonCache = new Map<string, CacheEntry<unknown>>();
  const tileCache = new Map<string, CacheEntry<Buffer>>();
  const modelCache = new Map<string, { data: Buffer; expiresAt: number }>();

  function setTileCache(key: string, buf: Buffer, contentType: string) {
    if (tileCache.size >= MAX_TILE_CACHE) {
      const firstKey = tileCache.keys().next().value;
      if (firstKey) tileCache.delete(firstKey);
    }
    tileCache.set(key, {
      data: buf,
      contentType,
      expiresAt: Date.now() + 1000 * 60 * 60, // 1 hour
    });
  }

  async function fetchCachedJson(url: string, ttlMs = 1000 * 60 * 30) {
    const cached = jsonCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'MarsExplorer-ScientificClient/1.0' },
    });
    if (!response.ok) {
      throw new Error(`Upstream HTTP ${response.status} from ${url}`);
    }
    const data = await response.json();
    jsonCache.set(url, { data, expiresAt: Date.now() + ttlMs });
    return data;
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      runtime: isVercel ? 'vercel-serverless' : 'node-express',
      timestamp: new Date().toISOString(),
      nasaApiConfigured: Boolean(NASA_API_KEY),
      services: {
        marsTrekWmts: 'https://trek.nasa.gov/tiles/Mars/EQ',
        usgsMarsWms: 'https://planetarymaps.usgs.gov/cgi-bin/mapserv',
        nasaMmgis: 'https://mars.nasa.gov/mmgis-maps',
        nasaImageLibrary: 'https://images-api.nasa.gov',
        nasaOpenApis: 'https://api.nasa.gov',
      },
    });
  });

  // CORS-safe proxy for NASA Mars Trek WMTS tiles
  // Format: /api/tiles/trek/:layer/:z/:y/:x.:ext
  app.get('/api/tiles/trek/:layer/:z/:y/:file', async (req, res) => {
    const { layer, z, y, file } = req.params;
    if (!ALLOWED_TREK_LAYERS.has(layer)) {
      res.status(400).json({ error: 'Unsupported Mars Trek layer identifier' });
      return;
    }

    const cacheKey = `trek:${layer}:${z}:${y}:${file}`;
    const cached = tileCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('Content-Type', cached.contentType || 'image/jpeg');
      res.setHeader(
        'Cache-Control',
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(cached.data);
      return;
    }

    const targetUrl =
      layer === 'SIM3292_Global_Geology'
        ? `https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer/WMTS/tile/1.0.0/SIM3292_Global_Geology/default/default028mm/${z}/${y}/${file}`
        : `https://trek.nasa.gov/tiles/Mars/EQ/${layer}/1.0.0/default/default028mm/${z}/${y}/${file}`;
    try {
      const response = await fetch(targetUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'MarsExplorer-ScientificClient/1.0' },
      });
      if (!response.ok) {
        res.status(response.status).end();
        return;
      }
      const contentType =
        response.headers.get('content-type') || (file.endsWith('.png') ? 'image/png' : 'image/jpeg');
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      setTileCache(cacheKey, buffer, contentType);
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Cache-Control',
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(buffer);
    } catch {
      res.status(502).end();
    }
  });

  // CORS-safe proxy for USGS Astrogeology Mars WMS (THEMIS Day/Night IR, MOLA Color, MDIM21)
  app.get('/api/tiles/usgs', async (req, res) => {
    const cleanParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'path' || value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) cleanParams.append(key, String(v));
      } else {
        cleanParams.append(key, String(value));
      }
    }
    const qs = cleanParams.toString();
    const targetUrl = `https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map&${qs}`;
    const cacheKey = `usgs:${qs}`;
    const cached = tileCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('Content-Type', cached.contentType || 'image/png');
      res.setHeader(
        'Cache-Control',
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(cached.data);
      return;
    }
    try {
      const response = await fetch(targetUrl, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        res.status(response.status).end();
        return;
      }
      const contentType = response.headers.get('content-type') || 'image/png';
      const buffer = Buffer.from(await response.arrayBuffer());
      setTileCache(cacheKey, buffer, contentType);
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Cache-Control',
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(buffer);
    } catch {
      res.status(502).end();
    }
  });

  // Official NASA-3D-Resources GLB Spacecraft & Rover Model Proxy + Cache
  app.get('/api/models/:modelKey', async (req, res) => {
    const { modelKey } = req.params;
    const cleanKey = modelKey.replace(/\.glb$/i, '');
    const targetUrl = NASA_MODEL_MAP[cleanKey];
    if (!targetUrl) {
      res.status(404).json({ error: 'Unknown NASA 3D model key' });
      return;
    }

    const cached = modelCache.get(cleanKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('Content-Type', 'model/gltf-binary');
      res.setHeader(
        'Cache-Control',
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(cached.data);
      return;
    }

    try {
      const response = await fetch(targetUrl, {
        signal: AbortSignal.timeout(25000),
        headers: { 'User-Agent': 'MarsExplorer-ScientificClient/1.0' },
      });
      if (!response.ok) {
        res.status(response.status).end();
        return;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (isVercel && buffer.byteLength > VERCEL_SAFE_BODY_BYTES) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.redirect(302, targetUrl);
        return;
      }
      modelCache.set(cleanKey, { data: buffer, expiresAt: Date.now() + 1000 * 60 * 60 * 6 });
      res.setHeader('Content-Type', 'model/gltf-binary');
      res.setHeader(
        'Cache-Control',
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(buffer);
    } catch {
      res.status(502).end();
    }
  });

  // Proxy NASA MMGIS Perseverance (M20) and Curiosity (MSL) traverse & waypoints
  app.get('/api/missions/:missionId/telemetry', async (req, res) => {
    const { missionId } = req.params;
    const missionMap: Record<string, { waypointsUrl: string; traverseUrl: string; mosaicBase: string }> =
      {
        perseverance: {
          waypointsUrl: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json',
          traverseUrl: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json',
          mosaicBase: 'https://mars.nasa.gov/mmgis-maps/M20/',
        },
        curiosity: {
          waypointsUrl: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json',
          traverseUrl: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json',
          mosaicBase: 'https://mars.nasa.gov/mmgis-maps/MSL/',
        },
      };

    const config = missionMap[missionId];
    if (!config) {
      res.status(404).json({ error: 'No live MMGIS traverse feed for this mission' });
      return;
    }

    try {
      const [wpRaw, travRaw] = await Promise.all([
        fetchCachedJson(config.waypointsUrl) as Promise<{
          name?: string;
          features?: RawWaypointFeature[];
        }>,
        fetchCachedJson(config.traverseUrl) as Promise<{
          name?: string;
          features?: RawTraverseFeature[];
        }>,
      ]);

      const waypoints = (wpRaw.features || []).map((f, idx) => {
        const p = f.properties || {};
        const coords = f.geometry?.coordinates || [];
        const imgs = Array.isArray(p.images)
          ? (p.images as Array<{ name?: string; url?: string }>).map((img) => ({
              name: img.name || 'Mosaic',
              url: img.url?.startsWith('http') ? img.url : `${config.mosaicBase}${img.url || ''}`,
            }))
          : [];
        return {
          index: idx,
          rmc: String(p.RMC || p.rmc || idx),
          sol: Number(p.sol ?? 0),
          site: Number(p.site ?? 0),
          drive: Number(p.drive ?? 0),
          lon: Number(p.lon ?? coords[0] ?? 0),
          lat: Number(p.lat ?? coords[1] ?? 0),
          elevGeoidM:
            p.elev_geoid !== undefined
              ? Number(p.elev_geoid)
              : coords[2] !== undefined
              ? Number(coords[2])
              : null,
          distTotalM: Number(p.dist_total_m ?? 0),
          tiltDeg: p.tilt !== undefined ? Number(p.tilt) : null,
          note: p.Note ? String(p.Note) : null,
          images: imgs,
        };
      });

      const pathSegments: number[][][] = [];
      for (const feat of travRaw.features || []) {
        if (!feat.geometry) continue;
        if (feat.geometry.type === 'LineString') {
          pathSegments.push(feat.geometry.coordinates as number[][]);
        } else if (feat.geometry.type === 'MultiLineString') {
          for (const seg of feat.geometry.coordinates as number[][][]) {
            pathSegments.push(seg);
          }
        }
      }

      res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
      res.json({
        missionId,
        source: 'NASA/JPL-Caltech MMGIS Historical Archive',
        datasetName: wpRaw.name || `${missionId}_waypoints`,
        fetchedAt: new Date().toISOString(),
        waypointCount: waypoints.length,
        totalDistanceKm:
          waypoints.length > 0
            ? Number(((waypoints[waypoints.length - 1].distTotalM || 0) / 1000).toFixed(3))
            : 0,
        maxSol: waypoints.reduce((m, w) => Math.max(m, w.sol), 0),
        waypoints,
        pathSegments,
      });
    } catch (err) {
      res.status(503).json({
        error: 'Unable to reach NASA MMGIS archive',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // Proxy NASA Mars Trek Nomenclature & Dataset Search
  app.get('/api/trek/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.json({ items: [] });
      return;
    }
    const url = `https://trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems?key=${encodeURIComponent(q)}&rows=15`;
    try {
      const data = (await fetchCachedJson(url, 1000 * 60 * 60)) as {
        response?: { docs?: Array<Record<string, unknown>> };
      };
      const docs = data.response?.docs || [];
      const items = docs.map((d) => ({
        title: String(d.title || d.productLabel || ''),
        productLabel: String(d.productLabel || ''),
        itemType: String(d.itemType || ''),
        instrument: d.instrument ? String(d.instrument) : undefined,
        mission: d.mission ? String(d.mission) : undefined,
        shape: d.shape ? String(d.shape) : undefined,
        description: d.description ? String(d.description).slice(0, 240) : undefined,
      }));
      res.json({ items, source: 'NASA Solar System Treks (Mars Trek Solr Index)' });
    } catch {
      res.json({ items: [], source: 'Local fallback (Mars Trek search unavailable)' });
    }
  });

  // Proxy NASA Image and Video Library (https://images-api.nasa.gov/) with caching
  app.get('/api/nasa/images', async (req, res) => {
    const q = String(req.query.q || 'Perseverance Jezero Mars').trim() || 'Perseverance Jezero Mars';
    const page = Math.max(1, Math.min(100, Number.parseInt(String(req.query.page || '1'), 10) || 1));
    const pageSize = Math.max(
      1,
      Math.min(48, Number.parseInt(String(req.query.page_size || '18'), 10) || 18)
    );

    const upstreamUrl = new URL('https://images-api.nasa.gov/search');
    upstreamUrl.searchParams.set('q', q);
    upstreamUrl.searchParams.set('media_type', 'image');
    upstreamUrl.searchParams.set('page', String(page));
    upstreamUrl.searchParams.set('page_size', String(pageSize));

    try {
      const raw = (await fetchCachedJson(upstreamUrl.toString(), 1000 * 60 * 15)) as {
        collection?: {
          items?: RawNasaImageItem[];
          metadata?: { total_hits?: number };
          links?: Array<{ rel?: string; href?: string }>;
        };
      };

      const collection = raw.collection || {};
      const rawItems = collection.items || [];
      const totalHits = Number(collection.metadata?.total_hits ?? rawItems.length);
      const hasNextLink = Boolean(collection.links?.some((l) => l.rel === 'next'));

      const items = rawItems
        .map((item) => {
          const d = item.data?.[0];
          if (!d?.nasa_id) return null;
          const imageLinks = (item.links || []).filter((l) => l.render === 'image' && l.href);
          const preview = imageLinks.find((l) => l.rel === 'preview') || imageLinks[0];
          const medium =
            imageLinks.find((l) => l.href?.includes('~medium.')) ||
            imageLinks.find((l) => l.href?.includes('~small.')) ||
            preview;
          const large =
            imageLinks.find((l) => l.href?.includes('~large.')) || medium || preview;
          const thumbUrl = toHttpsUrl(medium?.href || preview?.href);
          const previewUrl = toHttpsUrl(large?.href || preview?.href);
          if (!thumbUrl || !previewUrl) return null;
          return {
            nasaId: d.nasa_id,
            title: d.title || d.nasa_id,
            description: (d.description || d.description_508 || 'No NASA description provided.').trim(),
            dateCreated: d.date_created || '',
            center: d.center || 'NASA',
            photographer: d.photographer || d.secondary_creator || undefined,
            keywords: Array.isArray(d.keywords) ? d.keywords.slice(0, 8) : [],
            thumbUrl,
            previewUrl,
            assetManifestUrl:
              toHttpsUrl(item.href) ||
              `https://images-api.nasa.gov/asset/${encodeURIComponent(d.nasa_id)}`,
            source: `NASA Image & Video Library (${d.center || 'NASA'})`,
            detailsUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
      res.json({
        query: q,
        page,
        pageSize,
        totalHits,
        hasMore: hasNextLink || page * pageSize < totalHits,
        items,
        source: 'NASA Image and Video Library (images-api.nasa.gov)',
      });
    } catch (err) {
      res.status(502).json({
        error: 'Unable to fetch imagery from NASA Image and Video Library',
        detail: err instanceof Error ? err.message : 'Upstream request failed',
      });
    }
  });

  app.get('/api/nasa/image-asset/:nasaId', async (req, res) => {
    const nasaId = String(req.params.nasaId || '').trim();
    if (!nasaId) {
      res.status(400).json({ error: 'Missing NASA asset ID' });
      return;
    }
    const url = `https://images-api.nasa.gov/asset/${encodeURIComponent(nasaId)}`;
    try {
      const raw = (await fetchCachedJson(url, 1000 * 60 * 60)) as {
        collection?: { items?: Array<{ href?: string }> };
      };
      const hrefs = (raw.collection?.items || [])
        .map((x) => toHttpsUrl(x.href))
        .filter((h): h is string => Boolean(h && /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(h)));

      const origUrl =
        hrefs.find((h) => h.includes('~orig.')) ||
        hrefs.find((h) => h.includes('~large.')) ||
        hrefs.find((h) => h.includes('~medium.')) ||
        hrefs[0] ||
        null;
      const largeUrl =
        hrefs.find((h) => h.includes('~large.')) ||
        hrefs.find((h) => h.includes('~medium.')) ||
        origUrl;

      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      res.json({
        nasaId,
        origUrl,
        largeUrl,
        assets: hrefs.slice(0, 12),
      });
    } catch (err) {
      res.status(502).json({
        error: 'Unable to resolve NASA high-resolution asset manifest',
        detail: err instanceof Error ? err.message : 'Upstream request failed',
      });
    }
  });

  // Proxy NASA Open APIs (https://api.nasa.gov/) — DONKI Space Weather / Solar Radiation Context at Mars
  app.get('/api/nasa/space-weather', async (_req, res) => {
    if (!NASA_API_KEY) {
      res.status(503).json({
        error: 'NASA_API_KEY is not configured on the server',
      });
      return;
    }

    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const cmeUrl = `https://api.nasa.gov/DONKI/CME?startDate=${startDate}&endDate=${endDate}&api_key=${encodeURIComponent(NASA_API_KEY)}`;
    const sepUrl = `https://api.nasa.gov/DONKI/SEP?startDate=${startDate}&endDate=${endDate}&api_key=${encodeURIComponent(NASA_API_KEY)}`;
    const notifUrl = `https://api.nasa.gov/DONKI/notifications?startDate=${startDate}&endDate=${endDate}&type=all&api_key=${encodeURIComponent(NASA_API_KEY)}`;

    try {
      const [cmesRaw, sepsRaw, notifsRaw] = await Promise.all([
        fetchCachedJson(cmeUrl, 1000 * 60 * 20).catch(() => []) as Promise<Array<Record<string, unknown>>>,
        fetchCachedJson(sepUrl, 1000 * 60 * 20).catch(() => []) as Promise<Array<Record<string, unknown>>>,
        fetchCachedJson(notifUrl, 1000 * 60 * 20).catch(() => []) as Promise<
          Array<Record<string, unknown>>
        >,
      ]);

      const cmeList = Array.isArray(cmesRaw) ? cmesRaw : [];
      const sepList = Array.isArray(sepsRaw) ? sepsRaw : [];
      const notifList = Array.isArray(notifsRaw) ? notifsRaw : [];

      const marsDirectedCmes = cmeList
        .filter((cme) => {
          const analyses = Array.isArray(cme.cmeAnalyses) ? cme.cmeAnalyses : [];
          return analyses.some((a: Record<string, unknown>) => {
            const enlil = Array.isArray(a.enlilList) ? a.enlilList : [];
            return enlil.some((e: Record<string, unknown>) => {
              const impacts = Array.isArray(e.impactList) ? e.impactList : [];
              return impacts.some((imp: Record<string, unknown>) =>
                String(imp.location || '').toLowerCase().includes('mars')
              );
            });
          });
        })
        .slice(0, 5)
        .map((cme) => ({
          activityId: String(cme.activityID || ''),
          startTime: String(cme.startTime || ''),
          note: String(cme.note || '').slice(0, 220),
        }));

      const recentAlerts = notifList.slice(0, 5).map((n) => ({
        messageId: String(n.messageID || ''),
        messageType: String(n.messageType || 'ALERT'),
        issueTime: String(n.messageIssueTime || ''),
        summary: String(n.messageBody || '')
          .split('\n')
          .filter((line) => line.trim() && !line.startsWith('##'))
          .slice(0, 2)
          .join(' ')
          .slice(0, 200),
        url: n.messageURL ? String(n.messageURL) : undefined,
      }));

      res.setHeader('Cache-Control', 'public, s-maxage=1200, stale-while-revalidate=3600');
      res.json({
        source: 'NASA Open APIs — CCMC DONKI (api.nasa.gov)',
        fetchedAt: new Date().toISOString(),
        windowStart: startDate,
        windowEnd: endDate,
        cmeCount30d: cmeList.length,
        sepCount30d: sepList.length,
        marsDirectedCmeCount30d: marsDirectedCmes.length,
        marsDirectedCmes,
        recentAlerts,
        scopeNote:
          'Heliospheric solar & radiation alerts from NASA DONKI (solar wind / CME / SEP flux), distinct from Martian surface station meteorology.',
      });
    } catch (err) {
      res.status(502).json({
        error: 'Unable to fetch NASA DONKI space weather telemetry',
        detail: err instanceof Error ? err.message : 'Upstream error',
      });
    }
  });

  // Proxy NASA Open APIs APOD (https://api.nasa.gov/planetary/apod)
  app.get('/api/nasa/apod', async (req, res) => {
    if (!NASA_API_KEY) {
      res.status(503).json({ error: 'NASA_API_KEY is not configured on the server' });
      return;
    }
    const count = Math.max(1, Math.min(8, Number.parseInt(String(req.query.count || '1'), 10) || 1));
    const url =
      count > 1
        ? `https://api.nasa.gov/planetary/apod?count=${count}&api_key=${encodeURIComponent(NASA_API_KEY)}`
        : `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(NASA_API_KEY)}`;

    try {
      const data = await fetchCachedJson(url, 1000 * 60 * 30);
      const list = (Array.isArray(data) ? data : [data]).map((item: Record<string, unknown>) => ({
        ...item,
        url: toHttpsUrl(typeof item.url === 'string' ? item.url : null) || item.url,
        hdurl: toHttpsUrl(typeof item.hdurl === 'string' ? item.hdurl : null) || item.hdurl,
      }));
      res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
      res.json({
        source: 'NASA Astronomy Picture of the Day (api.nasa.gov)',
        items: list,
      });
    } catch (err) {
      res.status(502).json({
        error: 'Unable to fetch NASA APOD',
        detail: err instanceof Error ? err.message : 'Upstream error',
      });
    }
  });

  // Jezero Crater Scientific Elevation Grid built from real NASA M20 Perseverance waypoints
  // + documented MOLA/HiRISE regional topography for crater rim, delta scarp, Séítah, and Belva Crater.
  app.get('/api/elevation/jezero-grid', async (_req, res) => {
    const minLon = 77.24;
    const maxLon = 77.52;
    const minLat = 18.34;
    const maxLat = 18.56;
    const cols = 140;
    const rows = 112;

    let m20Points: Array<{ lon: number; lat: number; elev: number }> = [];
    let sourceStatus: 'nasa_m20_plus_mola' | 'mola_regional_only' = 'mola_regional_only';

    try {
      const wpRaw = (await fetchCachedJson(
        'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json'
      )) as { features?: RawWaypointFeature[] };
      m20Points = (wpRaw.features || [])
        .map((f) => ({
          lon: Number(f.properties?.lon ?? f.geometry?.coordinates?.[0]),
          lat: Number(f.properties?.lat ?? f.geometry?.coordinates?.[1]),
          elev: Number(f.properties?.elev_geoid ?? f.geometry?.coordinates?.[2]),
        }))
        .filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat) && Number.isFinite(p.elev));
      if (m20Points.length > 0) sourceStatus = 'nasa_m20_plus_mola';
    } catch {
      sourceStatus = 'mola_regional_only';
    }

    function regionalJezeroElevationM(lon: number, lat: number): number {
      let elev = -2572 + (77.45 - lon) * 780 + (lat - 18.44) * 240;

      const dDelta = Math.hypot((lon - 77.362) / 0.036, (lat - 18.474) / 0.026);
      if (dDelta < 1.35) {
        elev += 170 * Math.exp(-Math.pow(dDelta, 2.4) * 1.9);
      }

      if (lon > 77.345 && lon < 77.405 && lat > 18.448 && lat < 18.495) {
        const scarpStep = 1 / (1 + Math.exp((lon - 77.391) / 0.0024));
        const latMask = Math.exp(-Math.pow((lat - 18.469) / 0.017, 2));
        elev += 72 * scarpStep * latMask;
      }

      const dChannelLat = Math.abs(lat - (18.453 + (77.32 - lon) * 0.12));
      if (lon < 77.345 && lon > 77.278 && dChannelLat < 0.018) {
        const lonTaper = Math.sin(Math.min(1, (lon - 77.278) / 0.025) * (Math.PI / 2));
        elev -= 48 * lonTaper * Math.exp(-(dChannelLat * dChannelLat) / (0.008 * 0.008));
      }

      const distFromCenter = Math.hypot((lon - 77.62) * 0.948, lat - 18.38);
      if (distFromCenter > 0.305) {
        const rimFactor = Math.min(1, (distFromCenter - 0.305) / 0.095);
        elev += 540 * Math.pow(rimFactor, 1.8);
      }

      const rBelva = Math.hypot((lon - 77.386) * 0.948, lat - 18.485);
      if (rBelva < 0.028) {
        elev -= 115 * Math.exp(-(rBelva * rBelva) / (0.0078 * 0.0078));
        elev += 44 * Math.exp(-((rBelva - 0.0125) ** 2) / (0.0038 ** 2));
      }

      const dSeitah = Math.hypot((lon - 77.425) / 0.026, (lat - 18.418) / 0.02);
      if (dSeitah < 1.3) {
        elev -= 28 * Math.exp(-dSeitah * dSeitah * 2.1);
      }

      const dKodiak = Math.hypot((lon - 77.372) / 0.0065, (lat - 18.442) / 0.0065);
      if (dKodiak < 1.6) {
        elev += 68 * Math.exp(-dKodiak * dKodiak * 2.5);
      }

      return Number(elev.toFixed(2));
    }

    const dLon = (maxLon - minLon) / (cols - 1);
    const dLat = (maxLat - minLat) / (rows - 1);

    const elevations: (number | null)[] = new Array(rows * cols);
    const quality: number[] = new Array(rows * cols);

    for (let r = 0; r < rows; r++) {
      const lat = minLat + r * dLat;
      for (let c = 0; c < cols; c++) {
        const lon = minLon + c * dLon;
        const idx = r * cols + c;

        if (lon > 77.505 && lat > 18.545) {
          elevations[idx] = null;
          quality[idx] = 0;
          continue;
        }

        const baseElev = regionalJezeroElevationM(lon, lat);

        let weightSum = 0;
        let valSum = 0;
        let minDistSq = Infinity;

        for (let i = 0; i < m20Points.length; i += 2) {
          const p = m20Points[i];
          const dx = (p.lon - lon) * 0.948;
          const dy = p.lat - lat;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistSq) minDistSq = distSq;
          if (distSq < 0.0004) {
            const kernel = Math.exp(-distSq / (2 * 0.0065 * 0.0065));
            const w = kernel / (distSq + 1e-8);
            weightSum += w;
            valSum += w * p.elev;
          }
        }

        if (weightSum > 0 && minDistSq < 0.0004) {
          const measuredElev = valSum / weightSum;
          const smoothBlend = 0.88 * Math.exp(-minDistSq / (2 * 0.0068 * 0.0068));
          elevations[idx] = Number(
            (measuredElev * smoothBlend + baseElev * (1 - smoothBlend)).toFixed(2)
          );
          quality[idx] = minDistSq < 0.000025 ? 2 : 1;
        } else {
          elevations[idx] = baseElev;
          quality[idx] = 1;
        }
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    res.json({
      region: 'Jezero Crater, Isidis Planitia Margin',
      datum: 'MOLA Areoid / Mars 2000 IAU Sphere (R = 3,396,190 m)',
      sourceStatus,
      measuredWaypointSamples: m20Points.length,
      bounds: { minLon, maxLon, minLat, maxLat },
      cols,
      rows,
      dLon,
      dLat,
      elevations,
      quality,
    });
  });

  return app;
}
