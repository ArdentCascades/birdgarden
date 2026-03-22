/**
 * MiniPlayer.tsx — Preact island: sticky bottom "now playing" bar
 *
 * Appears when audio is playing (or paused mid-track).
 * Receives song context from the bird-garden:song-play CustomEvent dispatched
 * by AudioPlayer.tsx — the event detail carries { songId, birdName, audioEl }.
 * Controls the same HTMLAudioElement reference directly (no extra API calls).
 *
 * Features:
 *   - Bird name + song icon
 *   - Play/pause toggle (mirrors AudioPlayer state)
 *   - Progress bar (click-to-seek)
 *   - Time display
 *   - Close button (hides player, does NOT stop audio)
 *   - Singleton: listens to bird-garden:song-play / bird-garden:song-pause events
 */
import { useState, useEffect, useRef } from 'preact/hooks';

interface NowPlaying {
  songId: number;
  birdName: string;
  audioEl: HTMLAudioElement;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MiniPlayer() {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [visible, setVisible] = useState(false);

  // Ref to keep latest audioEl for cleanup
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Sync state listeners from the audio element
  function attachListeners(audio: HTMLAudioElement) {
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onPlay = () => { setIsPlaying(true); setVisible(true); };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }

  useEffect(() => {
    let removeListeners: (() => void) | null = null;

    function onSongPlay(e: Event) {
      const { songId, birdName, audioEl } = (e as CustomEvent<NowPlaying>).detail;

      // Detach from previous audio element
      if (removeListeners) { removeListeners(); removeListeners = null; }

      audioRef.current = audioEl;
      setNowPlaying({ songId, birdName, audioEl });
      setCurrentTime(audioEl.currentTime);
      setDuration(audioEl.duration || 0);
      setIsPlaying(!audioEl.paused);
      setVisible(true);

      removeListeners = attachListeners(audioEl);
    }

    function onSongPause(e: Event) {
      const { songId } = (e as CustomEvent<{ songId: number }>).detail;
      setNowPlaying((prev) => {
        if (prev?.songId === songId) setIsPlaying(false);
        return prev;
      });
    }

    window.addEventListener('bird-garden:song-play', onSongPlay);
    window.addEventListener('bird-garden:song-pause', onSongPause);

    return () => {
      window.removeEventListener('bird-garden:song-play', onSongPlay);
      window.removeEventListener('bird-garden:song-pause', onSongPause);
      if (removeListeners) removeListeners();
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function handleProgressClick(e: MouseEvent) {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }

  function handleClose() {
    setVisible(false);
    // Don't stop playback — user can still hear it, just no mini bar
  }

  if (!nowPlaying || !visible) return null;

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div
      role="region"
      aria-label="Now playing"
      style={`
        position: fixed;
        bottom: 0; left: 0; right: 0;
        z-index: 200;
        background: var(--color-bg);
        border-top: 1px solid var(--color-border);
        box-shadow: 0 -4px 24px rgba(0,0,0,0.10);
        padding: var(--space-3) var(--space-4);
        display: flex;
        align-items: center;
        gap: var(--space-3);
      `}
    >
      {/* Bird icon */}
      <div
        aria-hidden="true"
        style="width:36px;height:36px;border-radius:50%;background:var(--color-sage-100);display:flex;align-items:center;justify-content:center;flex-shrink:0;"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 14C3 14 7 9 10 7.5C13 6 16 8 16 11C16 14 13 15.5 10 15.5C8 15.5 5 14.5 3 14Z"
            fill="var(--color-sage-400)"/>
          <circle cx="12" cy="7" r="2" fill="var(--color-sage-500)"/>
        </svg>
      </div>

      {/* Bird name + progress */}
      <div style="flex:1;min-width:0;">
        <div style="font-size:var(--text-sm);font-weight:var(--font-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:var(--space-1);">
          {nowPlaying.birdName || 'Bird song'}
        </div>
        {/* Progress bar */}
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          title="Click to seek"
          style="height:4px;border-radius:2px;background:var(--color-border);cursor:pointer;position:relative;overflow:hidden;"
          aria-hidden="true"
        >
          <div
            style={`position:absolute;left:0;top:0;height:100%;width:${Math.round(progress * 100)}%;background:var(--color-primary);transition:width 0.1s linear;`}
          />
        </div>
      </div>

      {/* Time */}
      <span style="font-size:var(--text-xs);color:var(--color-text-muted);white-space:nowrap;flex-shrink:0;">
        {formatTime(currentTime)}{duration > 0 && ` / ${formatTime(duration)}`}
      </span>

      {/* Play/pause */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        aria-pressed={isPlaying ? 'true' : 'false'}
        style="display:flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:50%;background:var(--color-primary);color:#fff;flex-shrink:0;"
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <rect x="2" y="2" width="3.5" height="10" rx="1"/>
            <rect x="8.5" y="2" width="3.5" height="10" rx="1"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <path d="M3 2L13 7L3 12V2Z"/>
          </svg>
        )}
      </button>

      {/* Close */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="Dismiss mini player"
        style="display:flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:var(--radius-md);color:var(--color-text-muted);flex-shrink:0;"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  );
}
