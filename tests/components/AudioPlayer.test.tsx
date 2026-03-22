/**
 * tests/components/AudioPlayer.test.tsx
 *
 * Tests for the AudioPlayer Preact island.
 * Audio element interactions are limited in happy-dom; we test structure/ARIA.
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { render, fireEvent, waitFor } from '@testing-library/preact';
import AudioPlayer from '../../src/components/AudioPlayer.tsx';

beforeEach(() => {
  // Patch happy-dom's HTMLMediaElement prototype so audio.play() doesn't
  // reject in tests. We do NOT replace the entire class, as that breaks
  // Preact's DOM diffing (setAttribute would be missing).
  const proto = (window as any).HTMLAudioElement?.prototype ??
                (window as any).HTMLMediaElement?.prototype;
  if (proto && !proto._patched) {
    proto._patched = true;
    proto.play = function () {
      this._paused = false;
      return Promise.resolve();
    };
    proto.pause = function () {
      this._paused = true;
    };
    Object.defineProperty(proto, 'paused', {
      get() { return this._paused !== false; },
      configurable: true,
    });
    proto.load = function () {};
  }
});

describe('AudioPlayer', () => {
  test('renders player region with correct aria-label', () => {
    const { container } = render(<AudioPlayer songId={1} birdName="American Robin" />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toContain('American Robin');
  });

  test('renders play button with correct initial aria-label', () => {
    const { container } = render(<AudioPlayer songId={1} />);
    const playBtn = container.querySelector('.audio-play-btn') as HTMLButtonElement;
    expect(playBtn).not.toBeNull();
    expect(playBtn.getAttribute('aria-label')).toBe('Play');
  });

  test('renders waveform/progress bar', () => {
    const { container } = render(<AudioPlayer songId={1} />);
    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar).not.toBeNull();
    expect(progressbar!.getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar!.getAttribute('aria-valuemax')).toBe('100');
  });

  test('renders speed control buttons', () => {
    const { container } = render(<AudioPlayer songId={1} />);
    const speedGroup = container.querySelector('[role="group"][aria-label="Playback speed"]');
    expect(speedGroup).not.toBeNull();
    const speedBtns = speedGroup!.querySelectorAll('button');
    expect(speedBtns.length).toBe(3);
    // Check labels
    const labels = Array.from(speedBtns).map((b) => b.getAttribute('aria-label'));
    expect(labels).toContain('0.5× speed');
    expect(labels).toContain('0.75× speed');
    expect(labels).toContain('1× speed');
  });

  test('audio element src points to API endpoint', () => {
    const { container } = render(<AudioPlayer songId={42} />);
    const audio = container.querySelector('audio') as HTMLAudioElement;
    expect(audio).not.toBeNull();
    expect(audio.src).toContain('/api/songs/42');
  });

  test('speed button marks 1x as pressed by default', () => {
    const { container } = render(<AudioPlayer songId={1} />);
    const speedBtns = container.querySelectorAll('.audio-speed-btn');
    const oneX = Array.from(speedBtns).find(
      (b) => b.getAttribute('aria-label') === '1× speed',
    ) as HTMLButtonElement;
    expect(oneX).not.toBeNull();
    expect(oneX.getAttribute('aria-pressed')).toBe('true');
  });

  test('speed button changes aria-pressed on click', async () => {
    const { container } = render(<AudioPlayer songId={1} />);
    const speedBtns = container.querySelectorAll('.audio-speed-btn');
    const halfX = Array.from(speedBtns).find(
      (b) => b.getAttribute('aria-label') === '0.5× speed',
    ) as HTMLButtonElement;
    const oneX = Array.from(speedBtns).find(
      (b) => b.getAttribute('aria-label') === '1× speed',
    ) as HTMLButtonElement;

    expect(oneX.getAttribute('aria-pressed')).toBe('true');
    expect(halfX.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(halfX);

    await waitFor(() => {
      expect(halfX.getAttribute('aria-pressed')).toBe('true');
      expect(oneX.getAttribute('aria-pressed')).toBe('false');
    });
  });

  test('dispatches bird-garden:song-play event on play', async () => {
    const { container } = render(<AudioPlayer songId={7} />);
    let eventDetail: unknown = null;
    window.addEventListener('bird-garden:song-play', (e) => {
      eventDetail = (e as CustomEvent).detail;
    });

    const playBtn = container.querySelector('.audio-play-btn') as HTMLButtonElement;
    fireEvent.click(playBtn);

    await waitFor(() => {
      expect(eventDetail).not.toBeNull();
      expect((eventDetail as any).songId).toBe(7);
    });
  });

  test('has sr-only aria-live element for state announcements', () => {
    const { container } = render(<AudioPlayer songId={1} birdName="Sparrow" />);
    const live = container.querySelector('.sr-only[aria-live="polite"]');
    expect(live).not.toBeNull();
  });

  test('renders without birdName prop', () => {
    const { container } = render(<AudioPlayer songId={5} />);
    const region = container.querySelector('[role="region"]');
    expect(region!.getAttribute('aria-label')).toBe('Song player');
  });
});
