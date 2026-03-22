/**
 * AudioPlayer.tsx — Preact island for bird song playback
 *
 * Features:
 *   - Play/pause, progress bar, playback speed control (0.5×/0.75×/1×)
 *   - Duration display (e.g., "0:22")
 *   - Full keyboard navigation (Space/Enter: play/pause, Arrow keys: seek ±5s)
 *   - aria-live announcements for play/stop state
 *   - Singleton: only one song plays at a time via CustomEvent
 *
 * Attribution (recordist, location, license) is rendered server-side by the
 * parent Astro template so it is available before the island hydrates.
 */
import { useState, useEffect, useRef } from 'preact/hooks';

interface Props {
  songId: number;
  birdName?: string;
}

const SPEEDS = [0.5, 0.75, 1] as const;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ songId, birdName }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [loadError, setLoadError] = useState('');

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<0.5 | 0.75 | 1>(1);

  // Coordinate with other players and MiniPlayer via CustomEvents
  useEffect(() => {
    function onOtherPlay(e: Event) {
      const other = (e as CustomEvent<{ songId: number }>).detail.songId;
      if (other !== songId && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }

    function onMiniPause(e: Event) {
      const target = (e as CustomEvent<{ songId: number }>).detail.songId;
      if (target === songId && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }

    window.addEventListener('bird-garden:song-play', onOtherPlay);
    window.addEventListener('bird-garden:mini-pause', onMiniPause);
    return () => {
      window.removeEventListener('bird-garden:song-play', onOtherPlay);
      window.removeEventListener('bird-garden:mini-pause', onMiniPause);
    };
  }, [songId]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // Announce to other players and MiniPlayer
      window.dispatchEvent(
        new CustomEvent('bird-garden:song-play', { detail: { songId, birdName } }),
      );
      audio.play().catch(() => setLoadError('Playback failed. Please try again.'));
    } else {
      audio.pause();
      window.dispatchEvent(
        new CustomEvent('bird-garden:song-pause', { detail: { songId } }),
      );
    }
  }

  function handleTimeUpdate() {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  }

  function handleLoadedMetadata() {
    if (audioRef.current) setDuration(audioRef.current.duration);
  }

  function handleEnded() {
    setPlaying(false);
    setCurrentTime(0);
    window.dispatchEvent(
      new CustomEvent('bird-garden:song-end', { detail: { songId } }),
    );
  }

  function handleProgressClick(e: MouseEvent) {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }

  function handleKeyDown(e: KeyboardEvent) {
    const audio = audioRef.current;
    if (!audio) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      audio.currentTime = Math.min(audio.currentTime + 5, duration);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      audio.currentTime = Math.max(audio.currentTime - 5, 0);
    }
  }

  function setPlaybackSpeed(s: 0.5 | 0.75 | 1) {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  }

  const progress = duration > 0 ? currentTime / duration : 0;
  // Waveform data is unavailable without server-side metadata; the player
  // falls back to a simple progress fill when the array is empty.
  const waveform: number[] = [];

  // Announce state changes
  const liveMessage = playing
    ? `Playing${birdName ? ` ${birdName}` : ''} song`
    : currentTime > 0
    ? 'Paused'
    : '';

  return (
    <div
      class="audio-player"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={birdName ? `${birdName} song player` : 'Song player'}
    >
      {/* Hidden audio element — streams from API */}
      <audio
        ref={audioRef}
        src={`/api/songs/${songId}`}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onError={() => setLoadError('Audio unavailable.')}
        aria-hidden="true"
      />

      {/* aria-live announcement */}
      <span class="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</span>

      {/* Waveform / progress bar */}
      <div
        ref={progressRef}
        class="audio-player-waveform"
        onClick={handleProgressClick}
        role="progressbar"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        title="Click to seek"
        style="position:relative;overflow:hidden;"
      >
        {/* Waveform bars (if available) */}
        {waveform.length > 0 ? (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${waveform.length} 48`}
            preserveAspectRatio="none"
            aria-hidden="true"
            style="position:absolute;inset:0;"
          >
            {waveform.map((amp, i) => {
              const h = Math.max(2, amp * 44);
              const played = i / waveform.length <= progress;
              return (
                <rect
                  key={i}
                  x={i + 0.2}
                  y={(48 - h) / 2}
                  width={0.6}
                  height={h}
                  fill={played ? 'var(--color-primary)' : 'var(--color-border)'}
                />
              );
            })}
          </svg>
        ) : (
          /* Simple progress fill when no waveform data */
          <div
            style={`position:absolute;inset:0;background:var(--color-border);`}
          >
            <div
              style={`width:${Math.round(progress * 100)}%;height:100%;background:var(--color-primary);transition:width 0.1s linear;`}
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* Controls row */}
      <div class="audio-player-controls">
        {/* Play / Pause */}
        <button
          class="audio-play-btn"
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          aria-pressed={playing ? 'true' : 'false'}
        >
          {playing ? (
            /* Pause icon */
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
              <rect x="4" y="3" width="3.5" height="12" rx="1"/>
              <rect x="10.5" y="3" width="3.5" height="12" rx="1"/>
            </svg>
          ) : (
            /* Play icon */
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
              <path d="M5 3.5L15 9L5 14.5V3.5Z"/>
            </svg>
          )}
        </button>

        {/* Progress track */}
        <div
          class="audio-progress-bar"
          onClick={handleProgressClick}
          aria-hidden="true"
          style="cursor:pointer;"
        >
          <div
            class="audio-progress-fill"
            style={`width:${Math.round(progress * 100)}%;transition:width 0.1s linear;`}
          />
        </div>

        {/* Time display */}
        <span class="audio-time">
          {formatTime(currentTime)}
          {duration > 0 && ` / ${formatTime(duration)}`}
        </span>

        {/* Speed controls */}
        <div style="display:flex;gap:var(--space-1);" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              class="audio-speed-btn"
              type="button"
              onClick={() => setPlaybackSpeed(s)}
              aria-pressed={speed === s ? 'true' : 'false'}
              aria-label={`${s}× speed`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Error message */}
      {loadError && (
        <p role="alert" style="margin-top:var(--space-2);font-size:var(--text-sm);color:var(--color-error);">
          {loadError}
        </p>
      )}

    </div>
  );
}
