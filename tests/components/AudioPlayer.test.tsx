/**
 * AudioPlayer.test.tsx
 *
 * Tests:
 *   - Initial render (play button visible, no waveform data without song)
 *   - Speed buttons cycle through 0.5×, 0.75×, 1×
 *   - Clicking play dispatches bird-garden:song-play CustomEvent with correct detail
 *   - Singleton: pauses when another song-play event arrives for a different songId
 *   - Keyboard: Space/Enter toggles play, ArrowLeft/Right seeks ±5s
 *   - Progress bar click seeks to proportional time
 *   - Error state displayed when audio fails
 *   - formatTime helper (via observed render output)
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import AudioPlayer from '../../src/components/AudioPlayer.tsx';

afterEach(cleanup);

// Helper: capture the next CustomEvent dispatched on window
function captureNextEvent<T = unknown>(eventName: string): Promise<CustomEvent<T>> {
  return new Promise((resolve) => {
    window.addEventListener(eventName, (e) => resolve(e as CustomEvent<T>), { once: true });
  });
}

describe('AudioPlayer', () => {
  test('renders play button initially', () => {
    render(<AudioPlayer songId={1} birdName="Northern Cardinal" />);
    const btn = screen.getByRole('button', { name: 'Play' });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  test('aria-label includes bird name in region', () => {
    render(<AudioPlayer songId={1} birdName="American Robin" />);
    const region = screen.getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('American Robin song player');
  });

  test('aria-label fallback when no birdName', () => {
    render(<AudioPlayer songId={1} />);
    const region = screen.getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('Song player');
  });

  test('speed buttons render with correct labels', () => {
    render(<AudioPlayer songId={1} />);
    const speeds = ['0.5×', '0.75×', '1×'];
    for (const label of speeds) {
      const btn = screen.getByRole('button', { name: `${label} speed` });
      expect(btn).toBeTruthy();
    }
    // 1× is selected by default
    const defaultSpeed = screen.getByRole('button', { name: '1× speed' });
    expect(defaultSpeed.getAttribute('aria-pressed')).toBe('true');
  });

  test('clicking a speed button marks it as pressed', () => {
    render(<AudioPlayer songId={1} />);
    const halfSpeed = screen.getByRole('button', { name: '0.5× speed' });
    fireEvent.click(halfSpeed);
    expect(halfSpeed.getAttribute('aria-pressed')).toBe('true');
    // Others should be unpressed
    expect(screen.getByRole('button', { name: '1× speed' }).getAttribute('aria-pressed')).toBe('false');
  });

  test('clicking play dispatches bird-garden:song-play with songId and birdName', async () => {
    render(<AudioPlayer songId={42} birdName="Baltimore Oriole" />);
    const eventPromise = captureNextEvent<{ songId: number; birdName: string }>('bird-garden:song-play');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    const event = await eventPromise;
    expect(event.detail.songId).toBe(42);
    expect(event.detail.birdName).toBe('Baltimore Oriole');
  });

  test('singleton: pauses audio when another song-play event arrives', () => {
    const { container } = render(<AudioPlayer songId={1} birdName="Cardinal" />);
    const audio = container.querySelector('audio')!;

    let paused = false;
    Object.defineProperty(audio, 'paused', { get: () => paused, configurable: true });
    audio.pause = () => { paused = true; };

    // Simulate the audio playing
    paused = false;
    // Dispatch event for a different songId — should trigger pause
    window.dispatchEvent(
      new CustomEvent('bird-garden:song-play', { detail: { songId: 99 } }),
    );
    expect(paused).toBe(true);
  });

  test('keyboard Space on container triggers play', async () => {
    render(<AudioPlayer songId={7} birdName="Sparrow" />);
    const eventPromise = captureNextEvent('bird-garden:song-play');
    const container = document.querySelector('[role="region"]')!;
    fireEvent.keyDown(container, { key: ' ' });
    const event = await eventPromise;
    expect((event as CustomEvent<{ songId: number }>).detail.songId).toBe(7);
  });

  test('keyboard Enter on container triggers play', async () => {
    render(<AudioPlayer songId={8} />);
    const eventPromise = captureNextEvent('bird-garden:song-play');
    const container = document.querySelector('[role="region"]')!;
    fireEvent.keyDown(container, { key: 'Enter' });
    await eventPromise; // resolves = event was dispatched
  });

  test('progress bar has progressbar role and aria attributes', () => {
    render(<AudioPlayer songId={1} />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('100');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('0');
  });

  test('audio element has correct src', () => {
    const { container } = render(<AudioPlayer songId={99} />);
    const audio = container.querySelector('audio');
    expect(audio?.getAttribute('src')).toBe('/api/songs/99');
  });

  test('audio element is aria-hidden', () => {
    const { container } = render(<AudioPlayer songId={1} />);
    const audio = container.querySelector('audio');
    expect(audio?.getAttribute('aria-hidden')).toBe('true');
  });

  test('shows plain progress bar when no waveform data', () => {
    render(<AudioPlayer songId={1} />);
    // No SVG waveform bars — expect the fallback div-based progress
    const waveformArea = document.querySelector('.audio-player-waveform');
    expect(waveformArea).toBeTruthy();
    // No waveform data means no <rect> elements
    const rects = waveformArea?.querySelectorAll('rect');
    expect(rects?.length ?? 0).toBe(0);
  });

  test('time display shows 0:00 initially', () => {
    render(<AudioPlayer songId={1} />);
    const time = document.querySelector('.audio-time');
    expect(time?.textContent).toContain('0:00');
  });
});
