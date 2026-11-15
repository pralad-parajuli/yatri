import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  fetchMarsGalleryImages,
  fetchNasaApodHighlight,
  fetchNasaImageAsset,
  MARS_GALLERY_PRESETS,
  NasaApodItem,
  NasaGalleryItem,
} from '../services/nasaImageService';

interface MarsGalleryProps {
  onClose: () => void;
}

function formatIsoDate(iso: string): string {
  if (!iso) return 'Date N/A';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export default function MarsGallery({ onClose }: MarsGalleryProps) {
  const [activePresetId, setActivePresetId] = useState<string>(MARS_GALLERY_PRESETS[0].id);
  const [searchInput, setSearchInput] = useState<string>(MARS_GALLERY_PRESETS[0].query);
  const [submittedQuery, setSubmittedQuery] = useState<string>(MARS_GALLERY_PRESETS[0].query);
  const [items, setItems] = useState<NasaGalleryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalHits, setTotalHits] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lightbox modal state
  const [selectedItem, setSelectedItem] = useState<NasaGalleryItem | null>(null);
  const [highResUrl, setHighResUrl] = useState<string | null>(null);
  const [loadingAsset, setLoadingAsset] = useState(false);

  // Optional NASA APOD astronomy briefing strip
  const [apod, setApod] = useState<NasaApodItem | null>(null);
  const [showApod, setShowApod] = useState(false);

  const loadGalleryPage = useCallback(
    async (query: string, targetPage: number, append: boolean, signal?: AbortSignal) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await fetchMarsGalleryImages({
          query,
          page: targetPage,
          pageSize: 18,
          signal,
        });
        if (signal?.aborted) return;
        setItems((prev) => {
          if (!append) return res.items;
          const seen = new Set(prev.map((x) => x.nasaId));
          const merged = [...prev];
          res.items.forEach((it) => {
            if (!seen.has(it.nasaId)) {
              seen.add(it.nasaId);
              merged.push(it);
            }
          });
          return merged;
        });
        setPage(targetPage);
        setTotalHits(res.totalHits);
        setHasMore(res.hasMore);
      } catch (err) {
        if (signal?.aborted) return;
        setError(
          err instanceof Error ? err.message : 'Unable to load images from NASA Image Library.'
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    loadGalleryPage(submittedQuery, 1, false, controller.signal);
    return () => controller.abort();
  }, [submittedQuery, loadGalleryPage]);

  useEffect(() => {
    let cancelled = false;
    fetchNasaApodHighlight(1)
      .then((res) => {
        if (!cancelled && res.items[0] && res.items[0].media_type === 'image') {
          setApod(res.items[0]);
        }
      })
      .catch(() => {
        // APOD highlight is optional; fail silently if unavailable
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedItem) {
          setSelectedItem(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItem, onClose]);

  const handleOpenLightbox = async (item: NasaGalleryItem) => {
    setSelectedItem(item);
    setHighResUrl(item.previewUrl || item.thumbUrl);
    setLoadingAsset(true);
    try {
      const assets = await fetchNasaImageAsset(item.nasaId);
      setHighResUrl(assets.largeUrl || assets.origUrl || item.previewUrl || item.thumbUrl);
    } catch {
      // keep previewUrl fallback
    } finally {
      setLoadingAsset(false);
    }
  };

  const handlePresetSelect = (presetId: string, query: string) => {
    setActivePresetId(presetId);
    setSearchInput(query);
    setSubmittedQuery(query);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = searchInput.trim();
    if (!cleaned) return;
    setActivePresetId('');
    setSubmittedQuery(cleaned);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-xs">
      <div className="flex h-[min(88vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-amber-500/30 bg-[#0B0F17] text-xs text-slate-200 shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 bg-[#080B11] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/35 bg-amber-500/15 text-amber-300">
              <ImageIcon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
                NASA Image & Video Library · images-api.nasa.gov
              </div>
              <h2 className="font-display text-sm font-semibold text-white">
                Mars Mission & Planetary Surface Gallery
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {apod && (
              <button
                type="button"
                onClick={() => setShowApod((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  showApod
                    ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                    : 'border-slate-700 bg-[#111824] text-slate-300 hover:border-cyan-500/40 hover:text-white'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                NASA APOD ({apod.date})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Close NASA Mars Image Gallery"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search & Presets Toolbar */}
        <div className="border-b border-slate-800 bg-[#0D131E] px-4 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={handleSearchSubmit} className="relative flex flex-1 min-w-[220px] items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-amber-400/80" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search NASA Mars archive (e.g., Jezero, Olympus Mons, HiRISE, Curiosity)..."
                className="h-9 w-full rounded-md border border-slate-700/80 bg-[#080B11] pr-20 pl-9 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500/70 focus:outline-none"
              />
              <button
                type="submit"
                className="absolute right-1.5 rounded-sm bg-amber-500 px-3 py-1 text-[11px] font-semibold text-slate-950 hover:bg-amber-400"
              >
                Search
              </button>
            </form>

            <div className="font-mono text-[11px] text-slate-400 tabular-nums">
              {loading ? 'Querying NASA...' : `${items.length} of ${totalHits.toLocaleString()} hits`}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {MARS_GALLERY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetSelect(preset.id, preset.query)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  activePresetId === preset.id
                    ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                    : 'border-slate-700/80 bg-[#111824] text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {showApod && apod && (
            <div className="flex flex-col sm:flex-row gap-3 rounded-md border border-cyan-500/30 bg-[#080B11] p-3">
              <img
                src={apod.url}
                alt={apod.title}
                referrerPolicy="no-referrer"
                className="h-24 w-full sm:w-40 shrink-0 rounded-md object-cover border border-slate-700"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tracking-wider text-cyan-400 uppercase">
                    NASA Astronomy Picture of the Day · {apod.date} (api.nasa.gov)
                  </span>
                  {apod.hdurl && (
                    <a
                      href={apod.hdurl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-cyan-300 hover:underline"
                    >
                      HD Image <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
                <div className="mt-0.5 font-display text-xs font-semibold text-white">
                  {apod.title}
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-300">
                  {apod.explanation}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && items.length === 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="animate-pulse overflow-hidden rounded-md border border-slate-800 bg-[#111824]"
                >
                  <div className="h-44 bg-slate-800/80" />
                  <div className="space-y-2 p-3">
                    <div className="h-4 w-3/4 rounded-xs bg-slate-800" />
                    <div className="h-3 w-full rounded-xs bg-slate-800/70" />
                    <div className="h-3 w-1/2 rounded-xs bg-slate-800/60" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="mx-auto my-12 max-w-md rounded-lg border border-rose-500/40 bg-rose-500/10 p-5 text-center">
              <AlertCircle className="mx-auto mb-2 h-7 w-7 text-rose-400" />
              <div className="font-display text-sm font-semibold text-white">
                NASA Imagery Request Failed
              </div>
              <p className="mt-1 text-[11px] text-rose-200">{error}</p>
              <button
                type="button"
                onClick={() => loadGalleryPage(submittedQuery, 1, false)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-rose-400/50 bg-rose-500/20 px-3.5 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/30"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Fetch
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="mx-auto my-12 max-w-md rounded-lg border border-slate-700/80 bg-[#111824] p-6 text-center">
              <ImageIcon className="mx-auto mb-2 h-7 w-7 text-slate-500" />
              <div className="font-display text-sm font-semibold text-white">
                No Matching NASA Mars Images
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                No verified images matched &ldquo;{submittedQuery}&rdquo;. Try a broader mission or terrain term.
              </p>
              <button
                type="button"
                onClick={() =>
                  handlePresetSelect(MARS_GALLERY_PRESETS[0].id, MARS_GALLERY_PRESETS[0].query)
                }
                className="mt-3 rounded-md bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                Reset to Perseverance Archive
              </button>
            </div>
          )}

          {items.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <article
                    key={item.nasaId}
                    className="group flex flex-col overflow-hidden rounded-md border border-slate-700/70 bg-[#111824] transition-colors hover:border-amber-500/50"
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenLightbox(item)}
                      className="relative h-44 w-full overflow-hidden bg-black text-left focus:outline-none"
                      title="Open high-resolution view"
                    >
                      <img
                        src={item.thumbUrl}
                        alt={item.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-sm bg-black/75 px-2 py-0.5 text-[10px] font-medium text-amber-300 opacity-0 transition-opacity group-hover:opacity-100">
                        <Maximize2 className="h-3 w-3" />
                        Inspect
                      </div>
                    </button>

                    <div className="flex flex-1 flex-col p-3">
                      <h3 className="line-clamp-1 font-display text-xs font-semibold text-white">
                        {item.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 flex-1 text-[11px] leading-relaxed text-slate-300">
                        {item.description}
                      </p>
                      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-800 pt-2 text-[10px] text-slate-400">
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          <Calendar className="h-3 w-3 text-amber-400/80" />
                          {formatIsoDate(item.dateCreated)}
                        </span>
                        <span className="truncate font-mono text-cyan-300/90" title={item.source}>
                          NASA/{item.center} · {item.nasaId}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {hasMore && (
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => loadGalleryPage(submittedQuery, page + 1, true)}
                    className="inline-flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/15 px-5 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50"
                  >
                    {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {loadingMore
                      ? 'Loading next NASA archive page...'
                      : `Load More Images (${items.length} of ${totalHits.toLocaleString()})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* High-Resolution Lightbox Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3 sm:p-6"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-amber-500/40 bg-[#0B0F17] text-xs text-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-[#080B11] px-4 py-3">
              <div className="min-w-0">
                <div className="font-mono text-[10px] text-amber-400">
                  {selectedItem.source} · ID: {selectedItem.nasaId}
                </div>
                <h3 className="truncate font-display text-sm font-semibold text-white">
                  {selectedItem.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={selectedItem.detailsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/25"
                >
                  NASA Record <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
                  aria-label="Close high-resolution viewer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
              <div className="relative flex min-h-[280px] items-center justify-center bg-black p-3 lg:col-span-8">
                {highResUrl && (
                  <img
                    src={highResUrl}
                    alt={selectedItem.title}
                    referrerPolicy="no-referrer"
                    className="max-h-[68vh] w-auto max-w-full rounded-sm object-contain"
                  />
                )}
                {loadingAsset && (
                  <div className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-md bg-black/80 px-2.5 py-1 text-[10px] text-amber-300">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Resolving full resolution...
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-between overflow-y-auto border-t border-slate-800 bg-[#0D131E] p-4 lg:col-span-4 lg:border-t-0 lg:border-l">
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
                      Archive Metadata
                    </div>
                    <div className="mt-1.5 space-y-1 font-mono text-[11px] text-slate-300">
                      <div>
                        <span className="text-slate-500">DATE: </span>
                        {formatIsoDate(selectedItem.dateCreated)}
                      </div>
                      <div>
                        <span className="text-slate-500">CENTER: </span>
                        {selectedItem.center}
                      </div>
                      {selectedItem.photographer && (
                        <div>
                          <span className="text-slate-500">CREDIT: </span>
                          {selectedItem.photographer}
                        </div>
                      )}
                      <div>
                        <span className="text-slate-500">NASA ID: </span>
                        {selectedItem.nasaId}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-3">
                    <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                      Description
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-[11px] leading-relaxed text-slate-200">
                      {selectedItem.description}
                    </p>
                  </div>

                  {selectedItem.keywords.length > 0 && (
                    <div className="border-t border-slate-800 pt-3">
                      <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                        Keywords
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.keywords.map((kw) => (
                          <span
                            key={kw}
                            className="rounded-sm border border-slate-700 bg-[#111824] px-2 py-0.5 text-[10px] text-slate-300"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {highResUrl && (
                  <div className="mt-4 border-t border-slate-800 pt-3">
                    <a
                      href={highResUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                    >
                      Open Full-Resolution Image <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
