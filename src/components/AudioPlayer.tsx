/**
 * AudioPlayer.tsx — Preact island for bird song playback
 *
 * Features:
 *   - SVG waveform visualization (from song.metadata.waveform amplitude array)
 *   - Play/pause, progress bar, volume
 *   - Playback speed control: 0.5x / 0.75x / 1x
 *   - Song context line below player (recording location, date/season)
 *   - Audio file size display (e.g., "0:22 · 45 KB")
 *   - Attribution display beneath player
 *   - Full keyboard navigation (Space/Enter: play/pause, Arrow keys: seek)
 *   - aria-live announcements for play/stop state
 *   - Singleton: only one song plays at a time
 *
 * Fully implemented in Task 9.
 */

// Stub — implementation in Task 9
export default function AudioPlayer({ songId: _songId }: { songId: number }) {
  return (
    <div class="audio-player">
      <p style="color: var(--color-text-muted); font-size: var(--text-sm);">
        Audio player — implemented in Task 9.
      </p>
    </div>
  );
}
