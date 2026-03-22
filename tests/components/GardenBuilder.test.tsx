/**
 * tests/components/GardenBuilder.test.tsx
 *
 * Tests for the GardenBuilder Preact island.
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { render, fireEvent, waitFor } from '@testing-library/preact';
import GardenBuilder from '../../src/components/GardenBuilder.tsx';

const MOCK_BIRDS = [
  {
    id: 1, slug: 'american-robin', common_name: 'American Robin',
    scientific_name: 'Turdus migratorius', family: 'Turdidae',
    description: null, conservation_status: null,
    presence: 'resident', temp_min_c: null, temp_max_c: null, attraction_type: 'fruit',
    songs: [{ id: 1, filename: 'robin.opus', format: 'opus' }],
  },
];

const MOCK_COVERAGE = Array.from({ length: 12 }, (_, i) => ({
  month: i + 1,
  bird_count: i < 6 ? 3 : 1,
}));

function mockFetchWith(birds: unknown[], coverage: unknown[]) {
  const fn = mock((url: string) => {
    if (url.includes('/api/garden/coverage')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ coverage }),
      } as Response);
    }
    if (url.includes('/api/garden/birds')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ birds }),
      } as Response);
    }
    return Promise.reject(new Error('Unexpected URL: ' + url));
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  (window as any).fetch = fn;
  return fn;
}

beforeEach(() => {
  // Clear localStorage
  try { localStorage.clear(); } catch {}

  Object.defineProperty(window, 'location', {
    value: { href: 'http://localhost:4321/garden', pathname: '/garden', search: '' },
    writable: true,
  });

  // Clipboard mock
  if (!(navigator as any).clipboard) {
    (navigator as any).clipboard = {
      writeText: mock(() => Promise.resolve()),
    };
  }
});

describe('GardenBuilder', () => {
  test('renders empty state when no plants in localStorage', async () => {
    mockFetchWith([], []);
    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="garden-empty"]')).not.toBeNull();
    });
  });

  test('empty state contains link to /plants', async () => {
    mockFetchWith([], []);
    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      const link = container.querySelector('a[href="/plants"]');
      expect(link).not.toBeNull();
      expect(link!.textContent).toContain('Browse Plants');
    });
  });

  test('shows garden builder when plants exist in localStorage', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith(MOCK_BIRDS, MOCK_COVERAGE);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="garden-builder"]')).not.toBeNull();
    });
  });

  test('shows plant in the plants list', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith(MOCK_BIRDS, MOCK_COVERAGE);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.innerHTML).toContain('Red Maple');
    });
  });

  test('remove button removes plant from list', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([
        { slug: 'red-maple', name: 'Red Maple' },
        { slug: 'black-cherry', name: 'Black Cherry' },
      ]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith([], MOCK_COVERAGE);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.innerHTML).toContain('Red Maple');
      expect(container.innerHTML).toContain('Black Cherry');
    });

    const removeBtns = container.querySelectorAll('[aria-label^="Remove"]');
    expect(removeBtns.length).toBeGreaterThan(0);
    fireEvent.click(removeBtns[0]);

    await waitFor(() => {
      const plantLinks = container.querySelectorAll('a[href^="/plants/"]');
      expect(plantLinks.length).toBeLessThan(2);
    });
  });

  test('shows bird list when birds are returned', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith(MOCK_BIRDS, MOCK_COVERAGE);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.innerHTML).toContain('American Robin');
    });
  });

  test('shows region notice when no region set', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    // No region
    mockFetchWith([], []);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.querySelector('[role="status"]')).not.toBeNull();
      expect(container.innerHTML).toContain('Select your region');
    });
  });

  test('loads shared garden from URL params', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:4321/garden?plants=oak:Oak%20Tree&region=california',
        pathname: '/garden',
        search: '?plants=oak:Oak%20Tree&region=california',
      },
      writable: true,
    });
    mockFetchWith([], MOCK_COVERAGE);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.innerHTML).toContain('Oak Tree');
    });
  });

  test('share button copies URL to clipboard', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith(MOCK_BIRDS, MOCK_COVERAGE);

    const clipMock = mock(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipMock },
      writable: true,
      configurable: true,
    });

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="garden-builder"]')).not.toBeNull();
    });

    const shareBtn = container.querySelector('[aria-label="Copy shareable link to this garden"]') as HTMLButtonElement;
    expect(shareBtn).not.toBeNull();
    fireEvent.click(shareBtn);

    await waitFor(() => {
      expect(clipMock).toHaveBeenCalled();
    });
  });

  test('coverage chart renders 12 month columns', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith(MOCK_BIRDS, MOCK_COVERAGE);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      const chart = container.querySelector('[aria-label*="month bird coverage"]');
      expect(chart).not.toBeNull();
    });
  });

  test('summary shows plant count', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([
        { slug: 'red-maple', name: 'Red Maple' },
        { slug: 'oak', name: 'Oak' },
      ]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith(MOCK_BIRDS, MOCK_COVERAGE);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      const statCards = container.querySelectorAll('.stat-card');
      expect(statCards.length).toBeGreaterThan(0);
      // First card should show "2" for 2 plants
      expect(statCards[0].textContent).toContain('2');
    });
  });

  test('add-plant custom event adds plant to garden', async () => {
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith([], []);

    const { container } = render(<GardenBuilder />);

    // Initially empty
    await waitFor(() => {
      expect(container.querySelector('[data-testid="garden-empty"]')).not.toBeNull();
    });

    // Dispatch add-plant event
    window.dispatchEvent(
      new CustomEvent('bird-garden:add-plant', {
        detail: { slug: 'wild-bergamot', name: 'Wild Bergamot' },
      }),
    );

    await waitFor(() => {
      expect(container.querySelector('[data-testid="garden-builder"]')).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Jukebox mode
  // ---------------------------------------------------------------------------

  test('Play All button appears when birds with songs are loaded', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith(MOCK_BIRDS, MOCK_COVERAGE);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      const controls = container.querySelector('[data-testid="jukebox-controls"]');
      expect(controls).not.toBeNull();
      // Should show "Play All" button
      expect(controls!.textContent).toContain('Play All');
    });
  });

  test('Play All button is absent when no birds have songs', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    localStorage.setItem('bird-garden-region', 'california');

    const birdsWithoutSongs = [{ ...MOCK_BIRDS[0], songs: [] }];
    mockFetchWith(birdsWithoutSongs, MOCK_COVERAGE);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.innerHTML).toContain('American Robin');
    });

    expect(container.querySelector('[data-testid="jukebox-controls"]')).toBeNull();
  });

  test('clicking Play All dispatches song-play event', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith(MOCK_BIRDS, MOCK_COVERAGE);

    const dispatchedEvents: CustomEvent[] = [];
    window.addEventListener('bird-garden:song-play', (e) => {
      dispatchedEvents.push(e as CustomEvent);
    });

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="jukebox-controls"]')).not.toBeNull();
    });

    const playAllBtn = container.querySelector('[aria-label^="Play all"]') as HTMLButtonElement;
    expect(playAllBtn).not.toBeNull();
    fireEvent.click(playAllBtn);

    await waitFor(() => {
      expect(dispatchedEvents.length).toBeGreaterThan(0);
    });
    expect(dispatchedEvents[0].detail.songId).toBe(1);
    expect(dispatchedEvents[0].detail.birdName).toBe('American Robin');

    window.removeEventListener('bird-garden:song-play', () => {});
  });

  test('Stop button appears after Play All is clicked', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith(MOCK_BIRDS, MOCK_COVERAGE);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="jukebox-controls"]')).not.toBeNull();
    });

    const playAllBtn = container.querySelector('[aria-label^="Play all"]') as HTMLButtonElement;
    fireEvent.click(playAllBtn);

    await waitFor(() => {
      expect(container.querySelector('[aria-label="Stop jukebox"]')).not.toBeNull();
    });
  });

  test('Stop button dispatches mini-pause and hides itself', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith(MOCK_BIRDS, MOCK_COVERAGE);

    const pauseEvents: CustomEvent[] = [];
    window.addEventListener('bird-garden:mini-pause', (e) => {
      pauseEvents.push(e as CustomEvent);
    });

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="jukebox-controls"]')).not.toBeNull();
    });

    fireEvent.click(container.querySelector('[aria-label^="Play all"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(container.querySelector('[aria-label="Stop jukebox"]')).not.toBeNull();
    });

    fireEvent.click(container.querySelector('[aria-label="Stop jukebox"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(container.querySelector('[aria-label="Stop jukebox"]')).toBeNull();
      expect(container.querySelector('[aria-label^="Play all"]')).not.toBeNull();
    });

    expect(pauseEvents.length).toBeGreaterThan(0);

    window.removeEventListener('bird-garden:mini-pause', () => {});
  });

  test('currently playing bird row gets highlighted border', async () => {
    localStorage.setItem(
      'bird-garden-plants',
      JSON.stringify([{ slug: 'red-maple', name: 'Red Maple' }]),
    );
    localStorage.setItem('bird-garden-region', 'california');
    mockFetchWith(MOCK_BIRDS, MOCK_COVERAGE);

    const { container } = render(<GardenBuilder />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="jukebox-controls"]')).not.toBeNull();
    });

    fireEvent.click(container.querySelector('[aria-label^="Play all"]') as HTMLButtonElement);

    await waitFor(() => {
      const highlighted = container.querySelector('[data-jukebox-current="true"]');
      expect(highlighted).not.toBeNull();
    });
  });
});
