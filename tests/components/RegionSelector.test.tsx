/**
 * tests/components/RegionSelector.test.tsx
 *
 * Tests for the RegionSelector Preact island.
 * NOTE: ARIA role+name queries like getByRole('link', { name: '...' }) are
 * unsupported in happy-dom. Use container.querySelector() or getByText().
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import RegionSelector from '../../src/components/RegionSelector.tsx';

const REGIONS = [
  { id: 1, slug: 'north-america', name: 'North America', level: 'continent', parent_id: null, latitude: null, longitude: null },
  { id: 2, slug: 'united-states', name: 'United States', level: 'country', parent_id: 1, latitude: null, longitude: null },
  { id: 3, slug: 'california', name: 'California', level: 'state_province', parent_id: 2, latitude: 37.0, longitude: -120.0 },
  { id: 4, slug: 'oregon', name: 'Oregon', level: 'state_province', parent_id: 2, latitude: 44.0, longitude: -120.5 },
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
  // Reset location search
  Object.defineProperty(window, 'location', {
    value: { href: 'http://localhost:4321/', pathname: '/', search: '' },
    writable: true,
  });
});

describe('RegionSelector', () => {
  test('renders loading skeleton initially', () => {
    mockFetch({ regions: [] });
    const { container } = render(<RegionSelector />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  test('renders continent dropdown after fetch', async () => {
    mockFetch({ regions: REGIONS });
    const { container } = render(<RegionSelector />);

    await waitFor(() => {
      expect(container.querySelector('#region-continent')).not.toBeNull();
    });

    const select = container.querySelector('#region-continent') as HTMLSelectElement;
    expect(select).not.toBeNull();
    // Should have continent option
    expect(select.innerHTML).toContain('North America');
  });

  test('shows country dropdown after continent selected', async () => {
    mockFetch({ regions: REGIONS });
    const { container } = render(<RegionSelector />);

    await waitFor(() => {
      expect(container.querySelector('#region-continent')).not.toBeNull();
    });

    const continentSelect = container.querySelector('#region-continent') as HTMLSelectElement;
    fireEvent.change(continentSelect, { target: { value: 'north-america' } });

    await waitFor(() => {
      expect(container.querySelector('#region-country')).not.toBeNull();
    });
    const countrySelect = container.querySelector('#region-country') as HTMLSelectElement;
    expect(countrySelect.innerHTML).toContain('United States');
  });

  test('shows state dropdown after country selected', async () => {
    mockFetch({ regions: REGIONS });
    const { container } = render(<RegionSelector />);

    await waitFor(() => {
      expect(container.querySelector('#region-continent')).not.toBeNull();
    });

    fireEvent.change(
      container.querySelector('#region-continent') as HTMLSelectElement,
      { target: { value: 'north-america' } },
    );

    await waitFor(() => {
      expect(container.querySelector('#region-country')).not.toBeNull();
    });

    fireEvent.change(
      container.querySelector('#region-country') as HTMLSelectElement,
      { target: { value: 'united-states' } },
    );

    await waitFor(() => {
      expect(container.querySelector('#region-state')).not.toBeNull();
    });
    const stateSelect = container.querySelector('#region-state') as HTMLSelectElement;
    expect(stateSelect.innerHTML).toContain('California');
    expect(stateSelect.innerHTML).toContain('Oregon');
  });

  test('Browse Native Plants button is disabled when no region selected', async () => {
    mockFetch({ regions: REGIONS });
    const { container } = render(<RegionSelector />);

    await waitFor(() => {
      expect(container.querySelector('#region-continent')).not.toBeNull();
    });

    const browseBtn = container.querySelector('.btn-accent') as HTMLButtonElement;
    expect(browseBtn).not.toBeNull();
    expect(browseBtn.disabled).toBe(true);
  });

  test('Browse Native Plants button enables when region selected', async () => {
    mockFetch({ regions: REGIONS });
    const { container } = render(<RegionSelector />);

    await waitFor(() => {
      expect(container.querySelector('#region-continent')).not.toBeNull();
    });

    fireEvent.change(
      container.querySelector('#region-continent') as HTMLSelectElement,
      { target: { value: 'north-america' } },
    );

    await waitFor(() => {
      const browseBtn = container.querySelector('.btn-accent') as HTMLButtonElement;
      expect(browseBtn.disabled).toBe(false);
    });
  });

  test('Use my location button is present', async () => {
    mockFetch({ regions: REGIONS });
    const { container } = render(<RegionSelector />);

    await waitFor(() => {
      expect(container.querySelector('#region-continent')).not.toBeNull();
    });

    const locBtn = container.querySelector('[aria-label="Detect my region from current location"]');
    expect(locBtn).not.toBeNull();
  });

  test('shows geolocation error when geolocation unavailable', async () => {
    mockFetch({ regions: REGIONS });
    // Remove geolocation
    const origGeo = (navigator as any).geolocation;
    delete (navigator as any).geolocation;

    const { container } = render(<RegionSelector />);
    await waitFor(() => {
      expect(container.querySelector('#region-continent')).not.toBeNull();
    });

    const locBtn = container.querySelector('[aria-label="Detect my region from current location"]') as HTMLButtonElement;
    fireEvent.click(locBtn);

    await waitFor(() => {
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain('Location unavailable');
    });

    if (origGeo) (navigator as any).geolocation = origGeo;
  });

  test('pre-fills dropdowns when initialRegion provided', async () => {
    mockFetch({ regions: REGIONS });
    const { container } = render(<RegionSelector initialRegion="california" />);

    await waitFor(() => {
      const stateSelect = container.querySelector('#region-state') as HTMLSelectElement;
      expect(stateSelect).not.toBeNull();
      expect(stateSelect.value).toBe('california');
    });
  });

  test('renders gracefully when fetch fails', async () => {
    // Return a response where .json() throws, simulating a parse error.
    // This hits the .catch() in the component and clears the loading state.
    const fn = mock(() =>
      Promise.resolve({
        ok: false,
        json: () => { throw new Error('parse error'); },
      } as unknown as Response),
    );
    globalThis.fetch = fn as unknown as typeof fetch;
    (window as any).fetch = fn;

    const { container } = render(<RegionSelector />);
    await waitFor(
      () => {
        expect(container.querySelector('[aria-busy="true"]')).toBeNull();
      },
      { timeout: 3000 },
    );
  });
});
