/**
 * MiniPlayer.tsx — Preact island: sticky bottom "now playing" bar
 *
 * Appears when a bird-garden:song-play event fires and stays visible
 * while any audio is playing. Hides when closed or audio ends.
 *
 * Features: bird name, play/pause, close button.
 * Coordinates with AudioPlayer via CustomEvent.
 */
import { useState, useEffect, useRef } from 'preact/hooks';

interface NowPlaying {
  songId: number;
  birdName: string;
}

export default function MiniPlayer() {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Listen for song-play events dispatched by AudioPlayer
  useEffect(() => {
    function onSongPlay(e: Event) {
      const detail = (e as CustomEvent<{ songId: number; birdName?: string }>).detail;
      setNowPlaying({ songId: detail.songId, birdName: detail.birdName ?? 'Bird song' });
      setPlaying(true);
      setDismissed(false);
    }

    function onSongPause() {
      setPlaying(false);
    }

    function onSongEnd() {
      setPlaying(false);
    }

    window.addEventListener('bird-garden:song-play', onSongPlay);
    window.addEventListener('bird-garden:song-pause', onSongPause);
    window.addEventListener('bird-garden:song-end', onSongEnd);

    return () => {
      window.removeEventListener('bird-garden:song-play', onSongPlay);
      window.removeEventListener('bird-garden:song-pause', onSongPause);
      window.removeEventListener('bird-garden:song-end', onSongEnd);
    };
  }, []);

  function handlePlayPause() {
    if (!nowPlaying) return;
    // Toggle via custom event — the AudioPlayer will respond
    if (playing) {
      window.dispatchEvent(
        new CustomEvent('bird-garden:mini-pause', { detail: { songId: nowPlaying.songId } }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent('bird-garden:song-play', { detail: { songId: nowPlaying.songId } }),
      );
    }
    setPlaying((p) => !p);
  }

  function handleDismiss() {
    setDismissed(true);
    setPlaying(false);
    if (nowPlaying) {
      window.dispatchEvent(
        new CustomEvent('bird-garden:mini-pause', { detail: { songId: nowPlaying.songId } }),
      );
    }
  }

  // Don't render if no song playing or user dismissed
  if (!nowPlaying || dismissed) return null;

  return (
    <div
      class="mini-player"
      role="region"
      aria-label="Now playing"
      style={`
        position:fixed;
        bottom:0;
        left:0;
        right:0;
        z-index:100;
        background:var(--color-bg-card);
        border-top:1px solid var(--color-border);
        box-shadow:0 -2px 12px rgba(0,0,0,0.1);
        display:flex;
        align-items:center;
        gap:var(--space-3);
        padding:var(--space-3) var(--space-4);
        min-height:3.5rem;
      `}
    >
      {/* Bird icon */}
      <div
        aria-hidden="true"
        style="flex-shrink:0;width:2rem;height:2rem;border-radius:var(--radius-full);background:var(--color-green-100);display:flex;align-items:center;justify-content:center;"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 11C2 11 5 8 7 7C9 6 12 7 12 9C12 11 10 12 8 12C7 12 4 11.5 2 11Z"
            fill="var(--color-green-500)"/>
          <circle cx="9" cy="6" r="1" fill="var(--color-green-500)"/>
        </svg>
      </div>

      {/* Track info */}
      <div style="flex:1;min-width:0;overflow:hidden;">
        <p
          style="margin:0;font-size:var(--text-sm);font-weight:var(--font-medium);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
          aria-live="polite"
        >
          {nowPlaying.birdName}
        </p>
        <p style="margin:0;font-size:var(--text-xs);color:var(--color-text-muted);">
          {playing ? 'Playing' : 'Paused'}
        </p>
      </div>

      {/* Play / Pause */}
      <button
        type="button"
        class="audio-play-btn"
        onClick={handlePlayPause}
        aria-label={playing ? 'Pause' : 'Play'}
        aria-pressed={playing ? 'true' : 'false'}
        style="flex-shrink:0;"
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1"/>
            <rect x="9.5" y="2" width="3.5" height="12" rx="1"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M4 2.5L13 8L4 13.5V2.5Z"/>
          </svg>
        )}
      </button>

      {/* Close / dismiss */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss player"
        style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:2rem;height:2rem;border:none;background:transparent;cursor:pointer;color:var(--color-text-muted);border-radius:var(--radius-sm);"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  );
}
