/**
 * RegionSelector.tsx — Preact island for region selection
 *
 * Features:
 *   - Hierarchical dropdowns (Continent → Country → State/Province)
 *   - "Use my location" button (user-initiated only, never auto-triggered)
 *   - Client-side centroid distance calculation (coordinates never sent to server)
 *   - Geolocation failure UX with clear, non-technical messages
 *   - Stores selected region in URL params + localStorage (validated on read)
 *   - Progressive enhancement: falls back to <form> without JS
 *
 * Fully implemented in Task 7.
 */

// Stub — implementation in Task 7
export default function RegionSelector() {
  return (
    <div class="region-selector">
      <p style="color: var(--color-text-muted); font-size: var(--text-sm);">
        Region selector — implemented in Task 7.
      </p>
    </div>
  );
}
