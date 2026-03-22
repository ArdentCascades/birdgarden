/**
 * GardenBuilder.test.tsx
 *
 * Tests:
 *   - Zero-plants onboarding state
 *   - Renders plant list from localStorage
 *   - Remove button updates localStorage
 *   - Dispatches bird-garden:add-plant event listener (adds plant)
 *   - URL ?plants= param loads shared garden on mount
 *   - Share button builds correct URL
 *   - No-region warning shown when region not set
 *   - Bird API fetch called with correct URL on mount
 *   - Month selector triggers new bird fetch
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/preact';
import GardenBuilder from '../../src/components/GardenBuilder.tsx';

afterEach(cleanup);

const PLANTS_KEY = 'bird-garden-plants';
const REGION_KEY = 'bird-garden-region';

function setStoredPlants(plants: { slug: string; name: string }[]) {
  localStorage.setItem(PLANTS_KEY, JSON.stringify(plants));
}

function getStoredPlants(): { slug: string; name: string }[] {
  const raw = localStorage.getItem(PLANTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function setStoredRegion(slug: string) {
  localStorage.setItem(REGION_KEY, slug);
}

/** Stub fetch to return birds or empty */
function mockFetch(birds: unknown[] = []) {
  const fn = () =>
    Promise.resolve(new Response(JSON.stringify({ birds }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  globalThis.fetch = fn as unknown as typeof fetch;
  (window as any).fetch = fn;
}

describe('GardenBuilder — zero state', () => {
  test('shows onboarding when no plants in localStorage', async () => {
    mockFetch();
    render(<GardenBuilder />);
    await waitFor(() => {
      expect(screen.getByText(/your garden is empty/i)).toBeTruthy();
    });
  });

  test('onboarding links to /plants', async () => {
    mockFetch();
    render(<GardenBuilder />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /browse native plants/i });
      expect(link.getAttribute('href')).toBe('/plants');
    });
  });
});

describe('GardenBuilder — with plants', () => {
  beforeEach(() => {
    mockFetch([
      { id: 1, slug: 'northern-cardinal', common_name: 'Northern Cardinal', scientific_name: 'Cardinalis cardinalis', family: 'Cardinalidae', presence: 'resident', attraction_type: 'seeds' },
    ]);
    setStoredPlants([
      { slug: 'eastern-redbud', name: 'Eastern Redbud' },
      { slug: 'native-oak', name: 'Native Oak' },
    ]);
    setStoredRegion('new-york');
  });

  test('renders plants from localStorage', async () => {
    render(<GardenBuilder />);
    await waitFor(() => {
      expect(screen.getByText('Eastern Redbud')).toBeTruthy();
      expect(screen.getByText('Native Oak')).toBeTruthy();
    });
  });

  test('shows plant count in summary', async () => {
    render(<GardenBuilder />);
    await waitFor(() => {
      // 2 plants
      expect(screen.getByText('2')).toBeTruthy();
    });
  });

  test('remove button removes plant from list and localStorage', async () => {
    render(<GardenBuilder />);
    await waitFor(() => screen.getByText('Eastern Redbud'));

    const removeBtn = screen.getByRole('button', { name: /remove eastern redbud/i });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(() => screen.getByText('Eastern Redbud')).toThrow();
    });

    const stored = getStoredPlants();
    expect(stored.some((p) => p.slug === 'eastern-redbud')).toBe(false);
  });

  test('add-plant event adds a plant to the list', async () => {
    render(<GardenBuilder />);
    await waitFor(() => screen.getByText('Eastern Redbud'));

    await act(() => {
      window.dispatchEvent(
        new CustomEvent('bird-garden:add-plant', {
          detail: { slug: 'purple-coneflower', name: 'Purple Coneflower' },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Purple Coneflower')).toBeTruthy();
    });
  });

  test('add-plant event does not add duplicate', async () => {
    render(<GardenBuilder />);
    await waitFor(() => screen.getByText('Eastern Redbud'));

    await act(() => {
      window.dispatchEvent(
        new CustomEvent('bird-garden:add-plant', {
          detail: { slug: 'eastern-redbud', name: 'Eastern Redbud' },
        }),
      );
    });

    // Should still be exactly 2 plants
    const stored = getStoredPlants();
    expect(stored.filter((p) => p.slug === 'eastern-redbud').length).toBe(1);
  });

  test('fetches birds on mount with correct URL params', async () => {
    let capturedUrl = '';
    const fn = (url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify({ birds: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    };
    globalThis.fetch = fn as unknown as typeof fetch;
    (window as any).fetch = fn;

    render(<GardenBuilder />);
    await waitFor(() => {
      expect(capturedUrl).toContain('/api/garden/birds');
      expect(capturedUrl).toContain('region=new-york');
      expect(capturedUrl).toContain('plants=');
    });
  });

  test('renders fetched bird species', async () => {
    render(<GardenBuilder />);
    await waitFor(() => {
      expect(screen.getByText('Northern Cardinal')).toBeTruthy();
    });
  });

  test('shows no-region warning when region not set', async () => {
    localStorage.removeItem(REGION_KEY);
    mockFetch();
    render(<GardenBuilder />);
    await waitFor(() => {
      expect(screen.getByText(/no region selected/i)).toBeTruthy();
    });
  });

  test('share button copies URL with plant slugs', async () => {
    let copiedText = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => { copiedText = text; return Promise.resolve(); } },
    });

    render(<GardenBuilder />);
    await waitFor(() => screen.getByText('Eastern Redbud'));

    const shareBtn = screen.getByRole('button', { name: /copy shareable garden link/i });
    fireEvent.click(shareBtn);

    await waitFor(() => {
      expect(copiedText).toContain('plants=');
      expect(copiedText).toContain('eastern-redbud');
    });
  });
});

describe('GardenBuilder — shared garden URL', () => {
  test('loads plants from ?plants= URL param', async () => {
    mockFetch();
    // Set up URL with ?plants=
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'http://localhost/garden?plants=purple-coneflower,native-oak',
        search: '?plants=purple-coneflower,native-oak',
      },
    });
    // Patch history.replaceState so it doesn't throw
    Object.defineProperty(window, 'history', {
      configurable: true,
      value: { replaceState: () => {} },
    });

    render(<GardenBuilder />);
    await waitFor(() => {
      expect(screen.getByText('Purple Coneflower')).toBeTruthy();
      expect(screen.getByText('Native Oak')).toBeTruthy();
    });

    // Restore for other tests
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'http://localhost/garden', search: '' },
    });
  });
});
