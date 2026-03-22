/**
 * tests/components/MiniPlayer.test.tsx
 *
 * Tests for the MiniPlayer sticky bottom bar.
 */
import { describe, test, expect } from 'bun:test';
import { render, fireEvent, waitFor } from '@testing-library/preact';
import MiniPlayer from '../../src/components/MiniPlayer.tsx';

describe('MiniPlayer', () => {
  test('renders nothing initially (no song playing)', () => {
    const { container } = render(<MiniPlayer />);
    expect(container.querySelector('[role="region"]')).toBeNull();
  });

  test('appears when bird-garden:song-play event fires', async () => {
    const { container } = render(<MiniPlayer />);
    expect(container.querySelector('[role="region"]')).toBeNull();

    window.dispatchEvent(
      new CustomEvent('bird-garden:song-play', {
        detail: { songId: 1, birdName: 'American Robin' },
      }),
    );

    await waitFor(() => {
      expect(container.querySelector('[role="region"]')).not.toBeNull();
    });
  });

  test('displays bird name when shown', async () => {
    const { container } = render(<MiniPlayer />);
    window.dispatchEvent(
      new CustomEvent('bird-garden:song-play', {
        detail: { songId: 2, birdName: 'Blue Jay' },
      }),
    );

    await waitFor(() => {
      expect(container.innerHTML).toContain('Blue Jay');
    });
  });

  test('shows Playing status when song plays', async () => {
    const { container } = render(<MiniPlayer />);
    window.dispatchEvent(
      new CustomEvent('bird-garden:song-play', {
        detail: { songId: 3, birdName: 'Song Sparrow' },
      }),
    );

    await waitFor(() => {
      expect(container.innerHTML).toContain('Playing');
    });
  });

  test('dismiss button hides the player', async () => {
    const { container } = render(<MiniPlayer />);
    window.dispatchEvent(
      new CustomEvent('bird-garden:song-play', {
        detail: { songId: 4, birdName: 'Wren' },
      }),
    );

    await waitFor(() => {
      expect(container.querySelector('[role="region"]')).not.toBeNull();
    });

    const dismissBtn = container.querySelector(
      '[aria-label="Dismiss player"]',
    ) as HTMLButtonElement;
    expect(dismissBtn).not.toBeNull();
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(container.querySelector('[role="region"]')).toBeNull();
    });
  });

  test('play/pause button toggles aria-pressed', async () => {
    const { container } = render(<MiniPlayer />);
    window.dispatchEvent(
      new CustomEvent('bird-garden:song-play', {
        detail: { songId: 5, birdName: 'Finch' },
      }),
    );

    await waitFor(() => {
      expect(container.querySelector('.audio-play-btn')).not.toBeNull();
    });

    const playBtn = container.querySelector('.audio-play-btn') as HTMLButtonElement;
    expect(playBtn.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(playBtn);

    await waitFor(() => {
      expect(playBtn.getAttribute('aria-pressed')).toBe('false');
    });
  });

  test('defaults birdName to "Bird song" when not provided', async () => {
    const { container } = render(<MiniPlayer />);
    window.dispatchEvent(
      new CustomEvent('bird-garden:song-play', {
        detail: { songId: 6 },
      }),
    );

    await waitFor(() => {
      expect(container.innerHTML).toContain('Bird song');
    });
  });

  test('reappears when new song-play event fires after dismiss', async () => {
    const { container } = render(<MiniPlayer />);

    // Play then dismiss
    window.dispatchEvent(
      new CustomEvent('bird-garden:song-play', { detail: { songId: 7, birdName: 'Robin' } }),
    );
    await waitFor(() => expect(container.querySelector('[role="region"]')).not.toBeNull());

    const dismissBtn = container.querySelector('[aria-label="Dismiss player"]') as HTMLButtonElement;
    fireEvent.click(dismissBtn);
    await waitFor(() => expect(container.querySelector('[role="region"]')).toBeNull());

    // Play a new song — should reappear
    window.dispatchEvent(
      new CustomEvent('bird-garden:song-play', { detail: { songId: 8, birdName: 'Bluebird' } }),
    );
    await waitFor(() => {
      expect(container.querySelector('[role="region"]')).not.toBeNull();
      expect(container.innerHTML).toContain('Bluebird');
    });
  });
});
