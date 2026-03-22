/**
 * MobileNav.tsx — Preact island: slide-out drawer navigation
 *
 * Uses the native <dialog> element for focus-trap and Esc-to-close.
 * Opens when the #mobile-nav-toggle button (in Base.astro) is clicked.
 * Contains: all nav links + current region indicator.
 */
import { useEffect, useRef } from 'preact/hooks';

const NAV_LINKS = [
  { href: '/plants',  label: 'Plants' },
  { href: '/birds',   label: 'Birds' },
  { href: '/garden',  label: 'My Garden' },
  { href: '/about',   label: 'About' },
];

export default function MobileNav() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const toggle = document.getElementById('mobile-nav-toggle');

    function openDrawer() {
      dialogRef.current?.showModal();
      toggle?.setAttribute('aria-expanded', 'true');
    }

    function closeDrawer() {
      dialogRef.current?.close();
      toggle?.setAttribute('aria-expanded', 'false');
      toggle?.focus();
    }

    toggle?.addEventListener('click', openDrawer);

    const dialog = dialogRef.current;
    dialog?.addEventListener('close', () =>
      toggle?.setAttribute('aria-expanded', 'false'),
    );

    // Close on backdrop click
    function handleBackdropClick(e: MouseEvent) {
      if (e.target === dialog) closeDrawer();
    }
    dialog?.addEventListener('click', handleBackdropClick);

    return () => {
      toggle?.removeEventListener('click', openDrawer);
      dialog?.removeEventListener('click', handleBackdropClick);
    };
  }, []);

  function close() {
    dialogRef.current?.close();
  }

  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
  const savedRegion = (() => {
    try { return localStorage.getItem('bird-garden-region') ?? ''; } catch { return ''; }
  })();

  return (
    <dialog
      ref={dialogRef}
      id="mobile-nav-drawer"
      aria-label="Navigation menu"
      style="
        position: fixed; inset: 0 0 0 auto;
        width: min(320px, 85vw);
        height: 100dvh;
        margin: 0;
        border: none;
        border-left: 1px solid var(--color-border);
        background: var(--color-bg);
        padding: 0;
        box-shadow: -4px 0 24px rgba(0,0,0,0.12);
        max-height: 100%;
        overflow-y: auto;
      "
    >
      {/* Drawer header */}
      <div style="
        display: flex; align-items: center; justify-content: space-between;
        padding: var(--space-4) var(--space-6);
        border-bottom: 1px solid var(--color-border-subtle);
        height: var(--nav-height);
      ">
        <a
          href="/"
          style="font-family: var(--font-display); font-size: var(--text-lg); font-weight: var(--font-bold); color: var(--color-primary); text-decoration: none;"
          onClick={close}
        >
          Bird Garden
        </a>
        <button
          type="button"
          onClick={close}
          aria-label="Close navigation menu"
          style="
            display: flex; align-items: center; justify-content: center;
            width: 2.75rem; height: 2.75rem;
            border-radius: var(--radius-md);
            color: var(--color-text-muted);
            transition: background-color var(--transition-fast);
          "
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      {/* Nav links */}
      <nav aria-label="Mobile navigation" style="padding: var(--space-4) 0;">
        <ul role="list" style="list-style: none;">
          {NAV_LINKS.map(({ href, label }) => {
            const isCurrent = currentPath.startsWith(href) && (href !== '/' || currentPath === '/');
            return (
              <li key={href}>
                <a
                  href={href}
                  onClick={close}
                  aria-current={isCurrent ? 'page' : undefined}
                  style={`
                    display: block;
                    padding: var(--space-3) var(--space-6);
                    font-weight: var(--font-medium);
                    font-size: var(--text-lg);
                    color: ${isCurrent ? 'var(--color-primary)' : 'var(--color-text)'};
                    text-decoration: none;
                    border-left: 3px solid ${isCurrent ? 'var(--color-primary)' : 'transparent'};
                    transition: color var(--transition-fast), border-color var(--transition-fast);
                  `}
                >
                  {label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Region indicator */}
      {savedRegion && (
        <div style="
          margin: var(--space-4) var(--space-6);
          padding: var(--space-3) var(--space-4);
          background: var(--color-green-50);
          border: 1px solid var(--color-green-200);
          border-radius: var(--radius-lg);
        ">
          <p style="font-size: var(--text-xs); color: var(--color-text-muted); margin-bottom: var(--space-1);">
            Current region
          </p>
          <p style="font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--color-green-800);">
            {savedRegion.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </p>
          <a
            href="/"
            style="font-size: var(--text-xs); color: var(--color-green-700); text-decoration: underline; margin-top: var(--space-1); display: inline-block;"
            onClick={close}
          >
            Change region
          </a>
        </div>
      )}
    </dialog>
  );
}
