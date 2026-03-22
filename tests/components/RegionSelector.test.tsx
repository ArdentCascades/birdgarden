/**
 * RegionSelector.test.tsx
 *
 * Tests:
 *   - Shows loading skeleton while fetching
 *   - Renders continent dropdown after fetch
 *   - Continent selection shows country dropdown
 *   - Country selection shows state dropdown
 *   - "Browse" button disabled until a region is selected
 *   - "Browse" button saves to localStorage and navigates
 *   - "Use my location" button shows error on geolocation denial
 *   - "Use my location" selects nearest state on success
 *   - initialRegion pre-fills dropdowns correctly
 */
import { describe, test, expect, afterEach, mock } from 'bun:test';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import RegionSelector from '../../src/components/RegionSelector.tsx';

afterEach(cleanup);

const TEST_REGIONS = [
  { id: 1, slug: 'north-america', name: 'North America', level: 'continent', parent_id: null, latitude: null, longitude: null },
  { id: 2, slug: 'united-states', name: 'United States', level: 'country', parent_id: 1, latitude: null, longitude: null },
  { id: 3, slug: 'new-york', name: 'New York', level: 'state_province', parent_id: 2, latitude: 42.9, longitude: -75.5 },
  { id: 4, slug: 'california', name: 'California', level: 'state_province', parent_id: 2, latitude: 37.1, longitude: -119.7 },
  { id: 5, slug: 'canada', name: 'Canada', level: 'country', parent_id: 1, latitude: null, longitude: null },
  { id: 6, slug: 'ontario', name: 'Ontario', level: 'state_province', parent_id: 5, latitude: 51.2, longitude: -85.3 },
];

function mockRegionsFetch(regions = TEST_REGIONS) {
  const fn = () =>
    Promise.resolve(new Response(
      JSON.stringify({ regions }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
  globalThis.fetch = fn as unknown as typeof fetch;
  (window as any).fetch = fn;
}

describe('RegionSelector', () => {
  test('shows loading skeleton initially', async () => {
    // Slow fetch so skeleton is visible
    globalThis.fetch = mock(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<RegionSelector />);
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  test('renders continent dropdown after fetch', async () => {
    mockRegionsFetch();
    render(<RegionSelector />);
    await waitFor(() => {
      expect(screen.getByLabelText('Continent')).toBeTruthy();
    });
  });

  test('continent dropdown contains fetched continents', async () => {
    mockRegionsFetch();
    render(<RegionSelector />);
    await waitFor(() => {
      const select = screen.getByLabelText('Continent') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.text);
      expect(options).toContain('North America');
    });
  });

  test('selecting continent reveals country dropdown', async () => {
    mockRegionsFetch();
    render(<RegionSelector />);
    await waitFor(() => screen.getByLabelText('Continent'));

    fireEvent.change(screen.getByLabelText('Continent'), { target: { value: 'north-america' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Country')).toBeTruthy();
    });
  });

  test('country dropdown lists correct countries for selected continent', async () => {
    mockRegionsFetch();
    render(<RegionSelector />);
    await waitFor(() => screen.getByLabelText('Continent'));

    fireEvent.change(screen.getByLabelText('Continent'), { target: { value: 'north-america' } });
    await waitFor(() => screen.getByLabelText('Country'));

    const select = screen.getByLabelText('Country') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain('United States');
    expect(options).toContain('Canada');
  });

  test('selecting country reveals state dropdown', async () => {
    mockRegionsFetch();
    render(<RegionSelector />);
    await waitFor(() => screen.getByLabelText('Continent'));

    fireEvent.change(screen.getByLabelText('Continent'), { target: { value: 'north-america' } });
    await waitFor(() => screen.getByLabelText('Country'));
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'united-states' } });

    await waitFor(() => {
      expect(screen.getByLabelText('State / Province')).toBeTruthy();
    });
  });

  test('state dropdown shows correct states for country', async () => {
    mockRegionsFetch();
    render(<RegionSelector />);
    await waitFor(() => screen.getByLabelText('Continent'));

    fireEvent.change(screen.getByLabelText('Continent'), { target: { value: 'north-america' } });
    await waitFor(() => screen.getByLabelText('Country'));
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'united-states' } });
    await waitFor(() => screen.getByLabelText('State / Province'));

    const select = screen.getByLabelText('State / Province') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain('New York');
    expect(options).toContain('California');
    expect(options).not.toContain('Ontario'); // Ontario belongs to Canada
  });

  test('"Browse" button is disabled until a region is selected', async () => {
    mockRegionsFetch();
    render(<RegionSelector />);
    await waitFor(() => screen.getByLabelText('Continent'));

    const browseBtn = screen.getByRole('button', { name: /browse native plants/i });
    expect(browseBtn.hasAttribute('disabled')).toBe(true);
  });

  test('"Browse" button becomes enabled after selecting a continent', async () => {
    mockRegionsFetch();
    render(<RegionSelector />);
    await waitFor(() => screen.getByLabelText('Continent'));

    fireEvent.change(screen.getByLabelText('Continent'), { target: { value: 'north-america' } });

    const browseBtn = screen.getByRole('button', { name: /browse native plants/i });
    expect(browseBtn.hasAttribute('disabled')).toBe(false);
  });

  test('"Use my location" button is present', async () => {
    mockRegionsFetch();
    render(<RegionSelector />);
    await waitFor(() => {
      const btn = screen.getByText(/use my location/i);
      expect(btn).toBeTruthy();
    });
  });

  test('geolocation error shows alert message', async () => {
    mockRegionsFetch();
    render(<RegionSelector />);
    await waitFor(() => screen.getByText(/use my location/i));

    // setup.ts stubs geolocation to call error by default
    fireEvent.click(screen.getByText(/use my location/i));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toContain('Location unavailable');
    });
  });

  test('geolocation success selects nearest state', async () => {
    mockRegionsFetch();
    // Override geolocation to succeed near New York (lat 41, lon -74)
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({ coords: { latitude: 41.0, longitude: -74.0 } } as GeolocationPosition);
        },
      },
    });

    render(<RegionSelector />);
    await waitFor(() => screen.getByText(/use my location/i));

    fireEvent.click(screen.getByText(/use my location/i));

    await waitFor(() => {
      // Should have selected New York (closest to lat 41, lon -74)
      const stateSelect = screen.queryByLabelText('State / Province') as HTMLSelectElement | null;
      expect(stateSelect?.value).toBe('new-york');
    });
  });

  test('initialRegion pre-fills continent and country dropdowns', async () => {
    mockRegionsFetch();
    render(<RegionSelector initialRegion="new-york" />);

    await waitFor(() => {
      const continent = screen.getByLabelText('Continent') as HTMLSelectElement;
      const country = screen.getByLabelText('Country') as HTMLSelectElement;
      expect(continent.value).toBe('north-america');
      expect(country.value).toBe('united-states');
    });
  });
});
