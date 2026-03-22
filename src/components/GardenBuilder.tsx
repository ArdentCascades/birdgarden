/**
 * GardenBuilder.tsx — Preact island: main garden feature
 *
 * Features:
 *   - Zero-plants onboarding state with link to plant browser
 *   - Garden summary dashboard (total plants, bird species, 12-month coverage chart)
 *   - Plant list with single-action remove (✕)
 *   - Combined bird list filtered by month + region
 *   - "Share" button generating URL with plant slugs as query params
 *   - Load shared gardens from URL params on page load
 *   - localStorage persistence with validation
 */
import { useState, useEffect } from 'preact/hooks';

const STORAGE_KEY = 'bird-garden-plants';
const REGION_KEY = 'bird-garden-region';
const MAX_PLANTS = 50;

const MONTH_NAMES = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

interface PlantEntry {
  slug: string;
  name: string;
}

interface Bird {
  id: number;
  slug: string;
  common_name: string;
  scientific_name: string;
  presence: string;
  attraction_type: string | null;
  songs?: { id: number; filename: string; format: string }[];
}

interface MonthCoverage {
  month: number;
  bird_count: number;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadPlants(): PlantEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PlantEntry =>
        p && typeof p.slug === 'string' && typeof p.name === 'string',
    );
  } catch {
    return [];
  }
}

function savePlants(plants: PlantEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
  } catch {
    // storage full or unavailable
  }
}

function loadRegion(): string {
  try {
    return localStorage.getItem(REGION_KEY) ?? '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// 12-month coverage chart
// ---------------------------------------------------------------------------

function CoverageChart({ coverage }: { coverage: MonthCoverage[] }) {
  const max = Math.max(...coverage.map((c) => c.bird_count), 1);
  return (
    <div aria-label="12-month bird coverage chart" style="margin-top:var(--space-4);">
      <div
        style="display:grid;grid-template-columns:repeat(12,1fr);gap:var(--space-1);align-items:end;height:60px;"
        role="img"
        aria-label={`Bird activity across 12 months. Peak: ${max} species.`}
      >
        {coverage.map(({ month, bird_count }) => {
          const heightPct = max > 0 ? (bird_count / max) * 100 : 0;
          const isNow = month === new Date().getMonth() + 1;
          return (
            <div
              key={month}
              title={`${MONTH_NAMES[month - 1]}: ${bird_count} bird${bird_count !== 1 ? 's' : ''}`}
              style={`
                height:${Math.max(heightPct, bird_count > 0 ? 8 : 2)}%;
                min-height:2px;
                background:${isNow ? 'var(--color-primary)' : 'var(--color-green-300)'};
                border-radius:2px 2px 0 0;
                transition:height 0.3s;
              `}
              aria-hidden="true"
            />
          );
        })}
      </div>
      <div
        style="display:grid;grid-template-columns:repeat(12,1fr);gap:var(--space-1);margin-top:var(--space-1);"
        aria-hidden="true"
      >
        {MONTH_NAMES.map((m, i) => (
          <span
            key={m}
            style={`
              font-size:0.6rem;
              text-align:center;
              color:${i + 1 === new Date().getMonth() + 1 ? 'var(--color-primary)' : 'var(--color-text-subtle)'};
              font-weight:${i + 1 === new Date().getMonth() + 1 ? 'var(--font-semibold)' : 'var(--font-normal)'};
            `}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function GardenBuilder() {
  const [plants, setPlants] = useState<PlantEntry[]>([]);
  const [region, setRegion] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [birds, setBirds] = useState<Bird[]>([]);
  const [coverage, setCoverage] = useState<MonthCoverage[]>(
    Array.from({ length: 12 }, (_, i) => ({ month: i + 1, bird_count: 0 })),
  );
  const [loadingBirds, setLoadingBirds] = useState(false);
  const [birdsError, setBirdsError] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Jukebox mode: auto-advance through all birds with songs
  const [jukeboxActive, setJukeboxActive] = useState(false);
  const [jukeboxIndex, setJukeboxIndex] = useState(0);

  // Load from localStorage + URL params on mount
  useEffect(() => {
    const stored = loadPlants();
    const storedRegion = loadRegion();

    // Check URL for shared garden: ?plants=slug1,slug2&region=slug
    const params = new URLSearchParams(window.location.search);
    const urlPlantsRaw = params.get('plants');
    const urlRegion = params.get('region') ?? storedRegion;

    if (urlPlantsRaw) {
      // Parse shared URL: format is "slug:name,slug:name,..."
      const urlPlants = urlPlantsRaw
        .split(',')
        .map((entry) => {
          const [slug, ...rest] = entry.split(':');
          return {
            slug: slug?.trim() ?? '',
            name: rest.join(':').trim() || slug?.trim() || '',
          };
        })
        .filter((p) => p.slug.length > 0)
        .slice(0, MAX_PLANTS);

      setPlants(urlPlants.length > 0 ? urlPlants : stored);
    } else {
      setPlants(stored);
    }

    setRegion(urlRegion);
    setInitialized(true);
  }, []);

  // Persist plants to localStorage whenever they change
  useEffect(() => {
    if (!initialized) return;
    savePlants(plants);
  }, [plants, initialized]);

  // Listen for add-to-garden events from plant cards on other pages
  useEffect(() => {
    function onAddPlant(e: Event) {
      const detail = (e as CustomEvent<{ slug: string; name: string }>).detail;
      if (!detail?.slug) return;
      setPlants((prev) => {
        if (prev.find((p) => p.slug === detail.slug)) return prev;
        if (prev.length >= MAX_PLANTS) return prev;
        return [...prev, { slug: detail.slug, name: detail.name }];
      });
    }
    window.addEventListener('bird-garden:add-plant', onAddPlant);
    return () => window.removeEventListener('bird-garden:add-plant', onAddPlant);
  }, []);

  // Fetch birds when plants/region/month change
  useEffect(() => {
    if (!initialized || plants.length === 0 || !region) {
      setBirds([]);
      setBirdsError('');
      return;
    }
    const controller = new AbortController();
    setLoadingBirds(true);
    setBirdsError('');

    const slugs = plants.map((p) => p.slug).join(',');
    const url = `/api/garden/birds?plants=${encodeURIComponent(slugs)}&region=${encodeURIComponent(region)}&month=${month}`;

    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { birds: Bird[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setBirds(data.birds ?? []);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setBirdsError('Could not load birds. Please try again.');
      })
      .finally(() => setLoadingBirds(false));

    return () => controller.abort();
  }, [plants, region, month, initialized]);

  // Fetch coverage chart data when plants/region change
  useEffect(() => {
    if (!initialized || plants.length === 0 || !region) {
      setCoverage(Array.from({ length: 12 }, (_, i) => ({ month: i + 1, bird_count: 0 })));
      return;
    }
    const controller = new AbortController();
    const slugs = plants.map((p) => p.slug).join(',');
    const url = `/api/garden/coverage?plants=${encodeURIComponent(slugs)}&region=${encodeURIComponent(region)}`;

    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { coverage: MonthCoverage[]; error?: string }) => {
        if (data.coverage) setCoverage(data.coverage);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Non-critical — chart just won't update
      });

    return () => controller.abort();
  }, [plants, region, initialized]);

  // Jukebox: list of birds that have songs
  const birdsWithSongs = birds.filter((b) => b.songs && b.songs.length > 0);

  // Start jukebox from given index
  function jukeboxPlay(index: number) {
    const bird = birdsWithSongs[index];
    if (!bird || !bird.songs?.length) {
      setJukeboxActive(false);
      return;
    }
    setJukeboxIndex(index);
    window.dispatchEvent(
      new CustomEvent('bird-garden:song-play', {
        detail: { songId: bird.songs[0]!.id, birdName: bird.common_name },
      }),
    );
  }

  function startJukebox() {
    if (birdsWithSongs.length === 0) return;
    setJukeboxActive(true);
    jukeboxPlay(0);
  }

  function stopJukebox() {
    setJukeboxActive(false);
    // Pause any playing song via mini-pause
    const current = birdsWithSongs[jukeboxIndex];
    if (current?.songs?.length) {
      window.dispatchEvent(
        new CustomEvent('bird-garden:mini-pause', {
          detail: { songId: current.songs[0]!.id },
        }),
      );
    }
  }

  // Listen for song-end to auto-advance jukebox
  useEffect(() => {
    if (!jukeboxActive) return;
    function onSongEnd() {
      setJukeboxIndex((prev) => {
        const next = prev + 1;
        if (next < birdsWithSongs.length) {
          // defer to avoid React batching issues
          setTimeout(() => jukeboxPlay(next), 200);
          return next;
        } else {
          setJukeboxActive(false);
          return 0;
        }
      });
    }
    window.addEventListener('bird-garden:song-end', onSongEnd);
    return () => window.removeEventListener('bird-garden:song-end', onSongEnd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jukeboxActive, birdsWithSongs.length]);

  // Reset jukebox when birds change (month/region switch)
  useEffect(() => {
    setJukeboxActive(false);
    setJukeboxIndex(0);
  }, [birds]);

  function removePlant(slug: string) {
    setPlants((prev) => prev.filter((p) => p.slug !== slug));
  }

  function handleShare() {
    const slugsParam = plants
      .map((p) => `${p.slug}:${p.name}`)
      .join(',');
    const url = new URL(window.location.href);
    url.searchParams.set('plants', slugsParam);
    if (region) url.searchParams.set('region', region);
    navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        setShareMsg('Link copied!');
        setTimeout(() => setShareMsg(''), 2500);
      })
      .catch(() => {
        setShareMsg('Copy failed');
        setTimeout(() => setShareMsg(''), 2500);
      });
  }

  const totalBirds = birds.length;

  // -------------------------------------------------------------------------
  // Empty / onboarding state
  // -------------------------------------------------------------------------

  if (!initialized) {
    return (
      <div style="padding:var(--space-8);text-align:center;color:var(--color-text-muted);">
        Loading your garden…
      </div>
    );
  }

  if (plants.length === 0) {
    return (
      <div
        style="padding:var(--space-12);text-align:center;max-width:480px;margin:0 auto;"
        data-testid="garden-empty"
      >
        <svg
          width="80" height="80" viewBox="0 0 80 80" fill="none"
          aria-hidden="true" style="margin:0 auto var(--space-4);"
        >
          <path
            d="M40 10C40 10 18 22 18 42C18 54.15 28.745 64 40 64C51.255 64 62 54.15 62 42C62 22 40 10 40 10Z"
            fill="var(--color-green-100)" stroke="var(--color-green-300)" stroke-width="2"
          />
          <path d="M40 64V44" stroke="var(--color-green-400)" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <h2 style="font-family:var(--font-display);margin-bottom:var(--space-3);">
          Your garden is empty
        </h2>
        <p style="color:var(--color-text-muted);margin-bottom:var(--space-6);">
          Browse native plants and add them to see which birds they'll attract throughout the year.
        </p>
        <a href="/plants" class="btn btn-accent" style="display:inline-flex;align-items:center;gap:var(--space-2);">
          Browse Plants
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8H13M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Garden with plants
  // -------------------------------------------------------------------------

  return (
    <div data-testid="garden-builder">
      {/* Region notice */}
      {!region && (
        <div
          style="padding:var(--space-4);background:var(--color-bg-subtle);border-radius:var(--radius-lg);border:1px dashed var(--color-border);margin-bottom:var(--space-6);"
          role="status"
        >
          <p style="color:var(--color-text-muted);margin:0;">
            <a href="/" style="color:var(--color-primary);">Select your region</a>
            {' '}to see which birds your garden attracts.
          </p>
        </div>
      )}

      {/* Summary dashboard */}
      <div
        style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--space-4);margin-bottom:var(--space-6);"
        aria-label="Garden summary"
      >
        <div class="stat-card" style="padding:var(--space-4);background:var(--color-bg-card);border-radius:var(--radius-lg);border:1px solid var(--color-border);">
          <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin:0 0 var(--space-1);">Plants</p>
          <p style="font-size:var(--text-3xl);font-weight:var(--font-bold);margin:0;font-family:var(--font-display);">{plants.length}</p>
        </div>
        <div class="stat-card" style="padding:var(--space-4);background:var(--color-bg-card);border-radius:var(--radius-lg);border:1px solid var(--color-border);">
          <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin:0 0 var(--space-1);">Bird species this month</p>
          <p style="font-size:var(--text-3xl);font-weight:var(--font-bold);margin:0;font-family:var(--font-display);">
            {loadingBirds ? '…' : totalBirds}
          </p>
        </div>
      </div>

      {/* 12-month coverage chart */}
      {region && (
        <div style="background:var(--color-bg-card);border-radius:var(--radius-lg);border:1px solid var(--color-border);padding:var(--space-4);margin-bottom:var(--space-6);">
          <h2 style="font-size:var(--text-base);font-weight:var(--font-semibold);margin:0 0 var(--space-2);">
            Year-round bird activity
          </h2>
          <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin:0 0 var(--space-2);">
            Unique bird species attracted each month
          </p>
          <CoverageChart coverage={coverage} />
        </div>
      )}

      {/* Month selector */}
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-6);flex-wrap:wrap;">
        <label
          for="garden-month"
          style="font-size:var(--text-sm);font-weight:var(--font-medium);color:var(--color-text-muted);"
        >
          Show birds for:
        </label>
        <select
          id="garden-month"
          value={month}
          onChange={(e) => setMonth(Number((e.target as HTMLSelectElement).value))}
          style="padding:var(--space-2) var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-card);color:var(--color-text);font-size:var(--text-sm);"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>

        {/* Share button */}
        <button
          type="button"
          class="btn btn-outline"
          onClick={handleShare}
          style="margin-left:auto;display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);"
          aria-label="Copy shareable link to this garden"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 1H13V5M13 1L7 7M6 3H2C1.448 3 1 3.448 1 4V12C1 12.552 1.448 13 2 13H10C10.552 13 11 12.552 11 12V8"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Share
        </button>
        {shareMsg && (
          <span
            role="status"
            aria-live="polite"
            style="font-size:var(--text-sm);color:var(--color-primary);"
          >
            {shareMsg}
          </span>
        )}
      </div>

      <div style="display:grid;grid-template-columns:1fr;gap:var(--space-6);" data-testid="garden-columns">

        {/* Plants list */}
        <section aria-label="Plants in your garden">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3);">
            <h2 style="font-size:var(--text-lg);font-weight:var(--font-semibold);margin:0;">
              Your Plants
              <span style="font-size:var(--text-sm);font-weight:var(--font-normal);color:var(--color-text-muted);margin-left:var(--space-2);">
                ({plants.length})
              </span>
            </h2>
            <a
              href="/plants"
              class="btn btn-ghost"
              style="font-size:var(--text-sm);"
            >
              + Add plants
            </a>
          </div>
          <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--space-2);" role="list">
            {plants.map((plant) => (
              <li
                key={plant.slug}
                style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-3) var(--space-4);background:var(--color-bg-card);border-radius:var(--radius-md);border:1px solid var(--color-border);"
              >
                <a
                  href={`/plants/${plant.slug}`}
                  style="font-size:var(--text-sm);color:var(--color-text);text-decoration:none;flex:1;"
                >
                  {plant.name}
                </a>
                <button
                  type="button"
                  onClick={() => removePlant(plant.slug)}
                  aria-label={`Remove ${plant.name} from garden`}
                  style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:1.75rem;height:1.75rem;border:none;background:transparent;cursor:pointer;color:var(--color-text-muted);border-radius:var(--radius-sm);"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Birds list */}
        <section aria-label="Birds attracted to your garden">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);margin-bottom:var(--space-3);flex-wrap:wrap;">
            <h2 style="font-size:var(--text-lg);font-weight:var(--font-semibold);margin:0;">
              Birds This Month
              {!loadingBirds && region && (
                <span style="font-size:var(--text-sm);font-weight:var(--font-normal);color:var(--color-text-muted);margin-left:var(--space-2);">
                  ({totalBirds})
                </span>
              )}
            </h2>

            {/* Jukebox controls */}
            {!loadingBirds && birdsWithSongs.length > 0 && (
              <div style="display:flex;align-items:center;gap:var(--space-2);" data-testid="jukebox-controls">
                {jukeboxActive ? (
                  <button
                    type="button"
                    class="btn btn-outline"
                    onClick={stopJukebox}
                    aria-label="Stop jukebox"
                    style="font-size:var(--text-xs);display:flex;align-items:center;gap:var(--space-1);padding:var(--space-1) var(--space-3);"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                      <rect x="2" y="2" width="8" height="8" rx="1"/>
                    </svg>
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    class="btn btn-ghost"
                    onClick={startJukebox}
                    aria-label={`Play all ${birdsWithSongs.length} bird songs`}
                    style="font-size:var(--text-xs);display:flex;align-items:center;gap:var(--space-1);padding:var(--space-1) var(--space-3);"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                      <path d="M2 1.5L10 6L2 10.5V1.5Z"/>
                    </svg>
                    Play All ({birdsWithSongs.length})
                  </button>
                )}

                {jukeboxActive && (
                  <span
                    role="status"
                    aria-live="polite"
                    style="font-size:var(--text-xs);color:var(--color-text-muted);"
                  >
                    {jukeboxIndex + 1} / {birdsWithSongs.length}
                  </span>
                )}
              </div>
            )}
          </div>

          {!region && (
            <p style="color:var(--color-text-muted);font-size:var(--text-sm);">
              Select a region on the home page to see birds.
            </p>
          )}

          {birdsError && (
            <p role="alert" style="color:var(--color-error);font-size:var(--text-sm);">{birdsError}</p>
          )}

          {loadingBirds && (
            <div style="display:flex;flex-direction:column;gap:var(--space-2);" aria-busy="true" aria-label="Loading birds">
              {[1,2,3].map((i) => (
                <div key={i} class="skeleton" style="height:3rem;border-radius:var(--radius-md);" />
              ))}
            </div>
          )}

          {!loadingBirds && region && birds.length === 0 && (
            <p style="color:var(--color-text-muted);font-size:var(--text-sm);">
              No birds recorded for this region and month combination.
            </p>
          )}

          {!loadingBirds && birds.length > 0 && (
            <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--space-2);" role="list">
              {birds.map((bird) => {
                const jukeboxPos = birdsWithSongs.indexOf(bird);
                const isJukeboxCurrent = jukeboxActive && jukeboxPos === jukeboxIndex;
                return (
                <li
                  key={bird.slug}
                  data-jukebox-current={isJukeboxCurrent ? 'true' : undefined}
                  style={`display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);background:var(--color-bg-card);border-radius:var(--radius-md);border:1px solid ${isJukeboxCurrent ? 'var(--color-primary)' : 'var(--color-border)'};transition:border-color 0.2s;`}
                >
                  <a
                    href={`/birds/${bird.slug}`}
                    style="flex:1;text-decoration:none;color:var(--color-text);"
                  >
                    <span style="display:block;font-size:var(--text-sm);font-weight:var(--font-medium);">
                      {bird.common_name}
                    </span>
                    <span style="display:block;font-size:var(--text-xs);color:var(--color-text-muted);font-style:italic;">
                      {bird.scientific_name}
                    </span>
                  </a>
                  {bird.presence && (
                    <span
                      class="badge badge-sage"
                      style="flex-shrink:0;font-size:var(--text-xs);"
                      aria-label={`Presence: ${bird.presence}`}
                    >
                      {bird.presence}
                    </span>
                  )}
                  {bird.songs && bird.songs.length > 0 && (
                    <button
                      type="button"
                      aria-label={`Play ${bird.common_name} song`}
                      style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:2rem;height:2rem;border:1px solid var(--color-border);background:var(--color-bg-card);cursor:pointer;border-radius:var(--radius-full);color:var(--color-primary);"
                      onClick={() => {
                        const song = bird.songs![0]!;
                        window.dispatchEvent(
                          new CustomEvent('bird-garden:song-play', {
                            detail: { songId: song.id, birdName: bird.common_name },
                          }),
                        );
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                        <path d="M2 1.5L9 5L2 8.5V1.5Z"/>
                      </svg>
                    </button>
                  )}
                </li>
              );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
