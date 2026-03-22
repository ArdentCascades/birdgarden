/**
 * FilterPanel.test.tsx
 *
 * Tests:
 *   - Renders plant cards from API response
 *   - Plant card links to correct detail page
 *   - Shows empty state when API returns zero plants
 *   - Shows error state on fetch failure
 *   - Result count text displayed
 *   - Type filter buttons present + fetch includes type param when clicked
 *   - "Load more" button appears when total > loaded; absent when all loaded
 *   - Sort buttons present
 */
import { describe, test, expect, afterEach } from 'bun:test';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/preact';
import FilterPanel from '../../src/components/FilterPanel.tsx';

afterEach(cleanup);

const REGION = 'new-york';
const MONTH = 6;

interface PlantStub {
  id: number;
  slug: string;
  common_name: string;
  scientific_name: string;
  plant_type: string | null;
  family: string | null;
  bloom_start: number | null;
  bloom_end: number | null;
  bird_count: number;
  description: string | null;
  usda_zone_min: number | null;
  usda_zone_max: number | null;
}

function makePlant(slug: string, name: string, overrides: Partial<PlantStub> = {}): PlantStub {
  return {
    id: Math.floor(Math.random() * 1000) + 1,
    slug,
    common_name: name,
    scientific_name: `Plantus ${slug}`,
    plant_type: 'shrub',
    family: 'Rosaceae',
    bloom_start: 4,
    bloom_end: 6,
    bird_count: 3,
    description: null,
    usda_zone_min: 3,
    usda_zone_max: 9,
    ...overrides,
  };
}

function setFetch(fn: (url: string) => Promise<Response>) {
  globalThis.fetch = fn as unknown as typeof fetch;
  (window as any).fetch = fn;
}

function mockFetchPlants(plants: PlantStub[], total?: number) {
  setFetch(() =>
    Promise.resolve(new Response(
      JSON.stringify({ plants, total: total ?? plants.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )),
  );
}

function mockFetchError() {
  setFetch(() => Promise.reject(new Error('Network error')));
}

describe('FilterPanel', () => {
  test('shows plant cards after fetch resolves', async () => {
    const plants = [makePlant('eastern-redbud', 'Eastern Redbud'), makePlant('native-oak', 'Native Oak')];
    mockFetchPlants(plants, 2);
    render(<FilterPanel initialRegion={REGION} initialMonth={MONTH} />);

    await waitFor(() => {
      expect(screen.getByText('Eastern Redbud')).toBeTruthy();
      expect(screen.getByText('Native Oak')).toBeTruthy();
    });
  });

  test('plant card links to correct detail URL', async () => {
    mockFetchPlants([makePlant('purple-coneflower', 'Purple Coneflower')]);
    const { container } = render(<FilterPanel initialRegion={REGION} initialMonth={MONTH} />);

    await waitFor(() => screen.getByText('Purple Coneflower'));

    const link = container.querySelector('a[href="/plants/purple-coneflower"]');
    expect(link).toBeTruthy();
  });

  test('shows empty state when no plants returned', async () => {
    mockFetchPlants([], 0);
    render(<FilterPanel initialRegion={REGION} initialMonth={MONTH} />);

    await waitFor(() => {
      // FilterPanel shows "No plants found" or similar text
      const body = document.body.textContent ?? '';
      expect(body).toMatch(/no plants|0 plants/i);
    });
  });

  test('shows error state on fetch failure', async () => {
    mockFetchError();
    render(<FilterPanel initialRegion={REGION} initialMonth={MONTH} />);

    await waitFor(() => {
      expect(screen.getByText(/could not load plants/i)).toBeTruthy();
    });
  });

  test('result count text is displayed', async () => {
    const plants = Array.from({ length: 5 }, (_, i) => makePlant(`plant-${i}`, `Plant ${i}`));
    mockFetchPlants(plants, 5);
    render(<FilterPanel initialRegion={REGION} initialMonth={MONTH} />);

    await waitFor(() => {
      expect(screen.getByText(/5 plants/i)).toBeTruthy();
    });
  });

  test('type filter select is present with plant type options', async () => {
    mockFetchPlants([]);
    render(<FilterPanel initialRegion={REGION} initialMonth={MONTH} />);
    await waitFor(() => {
      const select = screen.getByLabelText('Type') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.text);
      expect(options).toContain('Tree');
      expect(options).toContain('Shrub');
      expect(options).toContain('Perennial');
    });
  });

  test('changing type filter select triggers fetch with type param', async () => {
    let urls: string[] = [];
    setFetch((url) => {
      urls.push(url);
      return Promise.resolve(new Response(
        JSON.stringify({ plants: [], total: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
    });

    render(<FilterPanel initialRegion={REGION} initialMonth={MONTH} />);
    await waitFor(() => expect(urls.length).toBeGreaterThan(0)); // initial fetch done

    const typeSelect = screen.getByLabelText('Type');
    fireEvent.change(typeSelect, { target: { value: 'tree' } });

    await waitFor(() => {
      expect(urls.some((u) => u.includes('type=tree'))).toBe(true);
    });
  });

  test('"Load more" button appears when total > loaded count', async () => {
    const plants = [makePlant('plant-a', 'Plant A')];
    mockFetchPlants(plants, 10); // total=10, loaded=1
    render(<FilterPanel initialRegion={REGION} initialMonth={MONTH} />);

    await waitFor(() => {
      expect(screen.getByText(/load more/i)).toBeTruthy();
    });
  });

  test('"Load more" absent when all plants are loaded', async () => {
    const plants = [makePlant('only-plant', 'Only Plant')];
    mockFetchPlants(plants, 1);
    render(<FilterPanel initialRegion={REGION} initialMonth={MONTH} />);

    await waitFor(() => screen.getByText('Only Plant'));
    expect(screen.queryByText(/load more/i)).toBeNull();
  });

  test('sort select is present with sort options', async () => {
    mockFetchPlants([]);
    render(<FilterPanel initialRegion={REGION} initialMonth={MONTH} />);

    await waitFor(() => {
      const select = screen.getByLabelText('Sort') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.text);
      expect(options).toContain('A – Z');
      expect(options).toContain('Most birds');
      expect(options).toContain('Bloom order');
    });
  });

  test('no region — does not call fetch', async () => {
    let fetchCalled = false;
    setFetch(() => {
      fetchCalled = true;
      return Promise.resolve(new Response(JSON.stringify({ plants: [], total: 0 })));
    });

    render(<FilterPanel />); // no region
    // Give enough time for any erroneous fetch to fire
    await new Promise((r) => setTimeout(r, 100));
    expect(fetchCalled).toBe(false);
  });
});
