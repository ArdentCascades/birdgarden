/**
 * tests/components/FilterPanel.test.tsx
 *
 * Tests for the FilterPanel Preact island (plant browser).
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { render, fireEvent, waitFor } from '@testing-library/preact';
import FilterPanel from '../../src/components/FilterPanel.tsx';

const PLANTS = [
  {
    id: 1, slug: 'red-maple', common_name: 'Red Maple', scientific_name: 'Acer rubrum',
    family: 'Sapindaceae', plant_type: 'tree', description: null,
    usda_zone_min: 3, usda_zone_max: 9, bloom_start: 3, bloom_end: 4, bird_count: 12,
  },
  {
    id: 2, slug: 'black-cherry', common_name: 'Black Cherry', scientific_name: 'Prunus serotina',
    family: 'Rosaceae', plant_type: 'tree', description: null,
    usda_zone_min: 3, usda_zone_max: 9, bloom_start: 4, bloom_end: 5, bird_count: 20,
  },
];

function mockFetch(data: unknown) {
  const fn = mock(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  (window as any).fetch = fn;
  return fn;
}

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { href: 'http://localhost:4321/plants?region=california', pathname: '/plants', search: '?region=california' },
    writable: true,
  });
  // history.replaceState mock
  if (!(window as any).history) {
    (window as any).history = { replaceState: mock(() => {}) };
  } else {
    (window as any).history.replaceState = mock(() => {});
  }
});

describe('FilterPanel', () => {
  test('shows region prompt when no region provided', () => {
    mockFetch({ plants: [], total: 0 });
    const { container } = render(<FilterPanel />);
    // Should show "Select your region" prompt
    const link = container.querySelector('a[href="/"]');
    expect(link).not.toBeNull();
    expect(link!.textContent).toContain('Select your region');
  });

  test('renders filter controls', () => {
    mockFetch({ plants: PLANTS, total: 2 });
    const { container } = render(<FilterPanel initialRegion="california" />);

    expect(container.querySelector('#plant-search')).not.toBeNull();
    expect(container.querySelector('#plant-type')).not.toBeNull();
    expect(container.querySelector('#plant-sort')).not.toBeNull();
  });

  test('renders plant cards after fetch', async () => {
    mockFetch({ plants: PLANTS, total: 2 });
    const { container } = render(<FilterPanel initialRegion="california" />);

    await waitFor(() => {
      expect(container.querySelectorAll('.plant-card').length).toBe(2);
    });

    expect(container.innerHTML).toContain('Red Maple');
    expect(container.innerHTML).toContain('Black Cherry');
  });

  test('shows loading skeletons during fetch', async () => {
    let resolvePromise!: (v: Response) => void;
    const pending = new Promise<Response>((res) => { resolvePromise = res; });
    globalThis.fetch = mock(() => pending) as unknown as typeof fetch;
    (window as any).fetch = globalThis.fetch;

    const { container } = render(<FilterPanel initialRegion="california" />);

    // Wait for the debounce (0ms setTimeout) to fire and set loading=true
    await waitFor(() => {
      expect(container.querySelector('.skeleton-card')).not.toBeNull();
    });

    // Resolve to prevent hanging
    resolvePromise({ ok: true, json: () => Promise.resolve({ plants: [], total: 0 }) } as Response);
  });

  test('shows error message on fetch failure', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as unknown as typeof fetch;
    (window as any).fetch = globalThis.fetch;

    const { container } = render(<FilterPanel initialRegion="california" />);

    await waitFor(() => {
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain('Could not load plants');
    });
  });

  test('shows empty state when no plants match', async () => {
    mockFetch({ plants: [], total: 0 });
    const { container } = render(<FilterPanel initialRegion="california" />);

    await waitFor(() => {
      expect(container.querySelector('.empty-state')).not.toBeNull();
    });
  });

  test('shows active filter chip when type filter applied', async () => {
    mockFetch({ plants: PLANTS, total: 2 });
    const { container } = render(<FilterPanel initialRegion="california" initialType="tree" />);

    await waitFor(() => {
      const chips = container.querySelectorAll('.filter-chip');
      expect(chips.length).toBeGreaterThan(0);
      const chipTexts = Array.from(chips).map((c) => c.textContent ?? '');
      expect(chipTexts.some((t) => t.includes('Tree'))).toBe(true);
    });
  });

  test('clear all filters button removes filter chips', async () => {
    mockFetch({ plants: PLANTS, total: 2 });
    const { container } = render(
      <FilterPanel initialRegion="california" initialType="tree" initialSort="alpha" />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll('.filter-chip').length).toBeGreaterThan(0);
    });

    const clearBtn = container.querySelector('.btn-ghost') as HTMLButtonElement;
    expect(clearBtn).not.toBeNull();
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(container.querySelectorAll('.filter-chip').length).toBe(0);
    });
  });

  test('shows load more button when more plants available', async () => {
    mockFetch({ plants: PLANTS, total: 50 });
    const { container } = render(<FilterPanel initialRegion="california" />);

    await waitFor(() => {
      // Find the specific Load more button (not the Blooming now button)
      const allBtns = Array.from(container.querySelectorAll('button'));
      const loadMoreBtn = allBtns.find((b) => b.textContent?.includes('Load more'));
      expect(loadMoreBtn).not.toBeUndefined();
    });
  });

  test('sort options are rendered', () => {
    mockFetch({ plants: [], total: 0 });
    const { container } = render(<FilterPanel initialRegion="california" />);

    const sortSelect = container.querySelector('#plant-sort') as HTMLSelectElement;
    expect(sortSelect.innerHTML).toContain('Most birds');
    expect(sortSelect.innerHTML).toContain('A');
    expect(sortSelect.innerHTML).toContain('Bloom order');
  });

  test('Blooming now button toggles aria-pressed', async () => {
    mockFetch({ plants: [], total: 0 });
    const { container } = render(<FilterPanel initialRegion="california" />);

    await waitFor(() => {
      expect(container.querySelector('#plant-sort')).not.toBeNull();
    });

    const bloomBtn = container.querySelector('[aria-pressed]') as HTMLButtonElement;
    expect(bloomBtn).not.toBeNull();
    const initialPressed = bloomBtn.getAttribute('aria-pressed');
    fireEvent.click(bloomBtn);

    await waitFor(() => {
      const pressed = bloomBtn.getAttribute('aria-pressed');
      expect(pressed).not.toBe(initialPressed);
    });
  });
});
