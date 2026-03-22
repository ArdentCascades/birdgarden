/**
 * MiniPlayer.test.tsx
 *
 * Tests:
 *   - Renders nothing by default (no active song)
 *   - Appears when bird-garden:song-play event fires
 *   - Shows correct bird name from event detail
 *   - Play/pause button reflects audio state
 *   - Close button hides the player (without stopping audio)
 *   - Listens to bird-garden:song-pause to update isPlaying
 *   - Switches to a new song when a second song-play event arrives
 */
import { describe, test, expect, afterEach } from 'bun:test';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/preact';
import MiniPlayer from '../../src/components/MiniPlayer.tsx';

afterEach(cleanup);

/** Create a minimal mock HTMLAudioElement with overridable read-only properties */
function mockAudio(opts: { paused?: boolean; currentTime?: number; duration?: number } = {}): HTMLAudioElement {
  const el = document.createElement('audio') as HTMLAudioElement;
  Object.defineProperty(el, 'paused', { configurable: true, get: () => opts.paused ?? true });
  Object.defineProperty(el, 'currentTime', { configurable: true, get: () => opts.currentTime ?? 0, set() {} });
  Object.defineProperty(el, 'duration', { configurable: true, get: () => opts.duration ?? 30 });
  el.play = () => Promise.resolve();
  el.pause = () => {};
  return el;
}

function dispatchSongPlay(songId: number, birdName: string, audioEl: HTMLAudioElement) {
  window.dispatchEvent(
    new CustomEvent('bird-garden:song-play', { detail: { songId, birdName, audioEl } }),
  );
}

function dispatchSongPause(songId: number) {
  window.dispatchEvent(
    new CustomEvent('bird-garden:song-pause', { detail: { songId } }),
  );
}

describe('MiniPlayer', () => {
  test('renders nothing before any song plays', () => {
    const { container } = render(<MiniPlayer />);
    expect(container.firstChild).toBeNull();
  });

  test('appears after bird-garden:song-play event', async () => {
    render(<MiniPlayer />);
    const audio = mockAudio({ paused: false });

    await act(() => {
      dispatchSongPlay(1, 'Northern Cardinal', audio);
    });

    const region = screen.getByRole('region', { name: 'Now playing' });
    expect(region).toBeTruthy();
  });

  test('displays bird name from event detail', async () => {
    render(<MiniPlayer />);
    const audio = mockAudio({ paused: false });

    await act(() => {
      dispatchSongPlay(1, 'Cedar Waxwing', audio);
    });

    expect(screen.getByText('Cedar Waxwing')).toBeTruthy();
  });

  test('shows play button when audio is paused', async () => {
    render(<MiniPlayer />);
    const audio = mockAudio({ paused: true });

    await act(() => {
      dispatchSongPlay(5, 'Dark-eyed Junco', audio);
    });

    const btn = screen.getByRole('button', { name: 'Play' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  test('shows pause button when audio is playing', async () => {
    render(<MiniPlayer />);
    const audio = mockAudio({ paused: false });

    await act(() => {
      dispatchSongPlay(5, 'Song Sparrow', audio);
    });

    const btn = screen.getByRole('button', { name: 'Pause' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  test('close button hides the player', async () => {
    const { container } = render(<MiniPlayer />);
    const audio = mockAudio({ paused: false });

    await act(() => {
      dispatchSongPlay(1, 'American Goldfinch', audio);
    });

    expect(screen.getByRole('region', { name: 'Now playing' })).toBeTruthy();

    const closeBtn = screen.getByRole('button', { name: 'Dismiss mini player' });
    fireEvent.click(closeBtn);

    expect(container.firstChild).toBeNull();
  });

  test('bird-garden:song-pause event marks player as paused', async () => {
    render(<MiniPlayer />);
    const audio = mockAudio({ paused: false });

    await act(() => {
      dispatchSongPlay(3, 'House Finch', audio);
    });

    // Initially playing
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();

    await act(() => {
      dispatchSongPause(3);
    });

    // Now shows play
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  test('switches to a new song when second song-play event arrives', async () => {
    render(<MiniPlayer />);

    await act(() => {
      dispatchSongPlay(1, 'First Bird', mockAudio({ paused: false }));
    });
    expect(screen.getByText('First Bird')).toBeTruthy();

    await act(() => {
      dispatchSongPlay(2, 'Second Bird', mockAudio({ paused: false }));
    });
    expect(screen.getByText('Second Bird')).toBeTruthy();
    expect(() => screen.getByText('First Bird')).toThrow();
  });

  test('shows time display', async () => {
    render(<MiniPlayer />);
    const audio = mockAudio({ paused: false, currentTime: 0, duration: 30 });

    await act(() => {
      dispatchSongPlay(1, 'Robin', audio);
    });

    // Should show some time display
    const region = screen.getByRole('region', { name: 'Now playing' });
    expect(region.textContent).toContain('0:00');
  });

  test('progress bar element is present when playing', async () => {
    render(<MiniPlayer />);

    await act(() => {
      dispatchSongPlay(1, 'Bluebird', mockAudio({ paused: false }));
    });

    // The click-to-seek progress div should be present
    const region = screen.getByRole('region', { name: 'Now playing' });
    const progressBar = region.querySelector('[title="Click to seek"]');
    expect(progressBar).toBeTruthy();
  });
});
