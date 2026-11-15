export interface NasaGalleryItem {
  nasaId: string;
  title: string;
  description: string;
  dateCreated: string;
  center: string;
  photographer?: string;
  keywords: string[];
  thumbUrl: string;
  previewUrl: string;
  assetManifestUrl: string;
  source: string;
  detailsUrl: string;
}

export interface NasaGalleryResponse {
  query: string;
  page: number;
  pageSize: number;
  totalHits: number;
  hasMore: boolean;
  items: NasaGalleryItem[];
  source: string;
}

export interface NasaImageAssetResponse {
  nasaId: string;
  origUrl: string | null;
  largeUrl: string | null;
  assets: string[];
}

export interface NasaApodItem {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: string;
  copyright?: string;
}

export interface MarsGalleryPreset {
  id: string;
  label: string;
  query: string;
}

export const MARS_GALLERY_PRESETS: MarsGalleryPreset[] = [
  { id: 'perseverance', label: 'Perseverance · Jezero', query: 'Perseverance Jezero Crater Mars' },
  { id: 'curiosity', label: 'Curiosity · Gale Crater', query: 'Curiosity Gale Crater Mars' },
  { id: 'hirise', label: 'MRO HiRISE Orbital', query: 'HiRISE Mars Reconnaissance Orbiter' },
  { id: 'ingenuity', label: 'Ingenuity Helicopter', query: 'Ingenuity Mars Helicopter' },
  { id: 'geology', label: 'Canyons & Volcanoes', query: 'Valles Marineris Olympus Mons Mars' },
  { id: 'planet', label: 'Mars Global Views', query: 'Mars planet atmosphere Viking' },
];

interface CachedItem<T> {
  value: T;
  expiresAt: number;
}

const searchCache = new Map<string, CachedItem<NasaGalleryResponse>>();
const assetCache = new Map<string, CachedItem<NasaImageAssetResponse>>();
let apodCache: CachedItem<{ source: string; items: NasaApodItem[] }> | null = null;

export async function fetchMarsGalleryImages(params: {
  query: string;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}): Promise<NasaGalleryResponse> {
  const query = params.query.trim() || 'Perseverance Jezero Crater Mars';
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 18;
  const cacheKey = `${query.toLowerCase()}::${page}::${pageSize}`;

  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const url = `/api/nasa/images?q=${encodeURIComponent(query)}&page=${page}&page_size=${pageSize}`;
  const res = await fetch(url, { signal: params.signal });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.error || body.detail || detail;
    } catch {
      // ignore json parse error
    }
    throw new Error(detail);
  }

  const data = (await res.json()) as NasaGalleryResponse;
  searchCache.set(cacheKey, {
    value: data,
    expiresAt: Date.now() + 1000 * 60 * 10, // 10 min client cache
  });
  return data;
}

export async function fetchNasaImageAsset(nasaId: string): Promise<NasaImageAssetResponse> {
  const cached = assetCache.get(nasaId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const res = await fetch(`/api/nasa/image-asset/${encodeURIComponent(nasaId)}`);
  if (!res.ok) {
    throw new Error(`Failed to resolve NASA asset manifest (HTTP ${res.status})`);
  }

  const data = (await res.json()) as NasaImageAssetResponse;
  assetCache.set(nasaId, {
    value: data,
    expiresAt: Date.now() + 1000 * 60 * 30,
  });
  return data;
}

export async function fetchNasaApodHighlight(count = 1): Promise<{ source: string; items: NasaApodItem[] }> {
  if (apodCache && apodCache.expiresAt > Date.now() && apodCache.value.items.length >= count) {
    return apodCache.value;
  }
  const res = await fetch(`/api/nasa/apod?count=${count}`);
  if (!res.ok) {
    throw new Error(`Failed to load NASA APOD (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { source: string; items: NasaApodItem[] };
  apodCache = {
    value: data,
    expiresAt: Date.now() + 1000 * 60 * 20,
  };
  return data;
}
