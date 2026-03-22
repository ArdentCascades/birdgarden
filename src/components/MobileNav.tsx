/**
 * MobileNav.tsx — Preact island: slide-out drawer navigation
 *
 * Uses the native <dialog> element for accessibility.
 * Contains: all nav links + inline region selector.
 */
import { useState, useEffect, useRef } from 'preact/hooks';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/plants', label: 'Plants' },
  { href: '/birds', label: 'Birds' },
  { href: '/garden', label: 'My Garden' },
  { href: '/about', label: 'About' },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal?.();
      document.body.style.overflow = 'hidden';
    } else {
      dialog.close?.();
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Close on backdrop click (click outside the dialog content)
  function handleDialogClick(e: MouseEvent) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;
    if (isOutside) setOpen(false);
  }

  // Close on Escape
  function handleClose() {
    setOpen(false);
  }

  const currentPath =
    typeof window !== 'undefined' ? window.location.pathname : '/';

  return (
    <>
      {/* Hamburger button */}
      <button
        class="mobile-nav-toggle"
        type="button"
        aria-label="Open navigation menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls="mobile-nav-dialog"
        onClick={() => setOpen(true)}
        style="display:flex;align-items:center;justify-content:center;width:2.5rem;height:2.5rem;border:none;background:transparent;cursor:pointer;color:var(--color-text);"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M3 5H19M3 11H19M3 17H19" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        </svg>
      </button>

      {/* Drawer dialog */}
      <dialog
        id="mobile-nav-dialog"
        ref={dialogRef}
        onClose={handleClose}
        onClick={handleDialogClick}
        aria-label="Navigation menu"
        style={`
          position:fixed;
          inset:0;
          margin:0;
          padding:0;
          width:100%;
          height:100%;
          max-width:100%;
          max-height:100%;
          background:transparent;
          border:none;
          outline:none;
        `}
      >
        {/* Backdrop */}
        <div
          style="position:absolute;inset:0;background:rgba(0,0,0,0.5);"
          aria-hidden="true"
        />

        {/* Drawer panel */}
        <nav
          style={`
            position:absolute;
            top:0;
            right:0;
            height:100%;
            width:min(320px, 85vw);
            background:var(--color-bg-card);
            display:flex;
            flex-direction:column;
            overflow-y:auto;
            box-shadow:-4px 0 24px rgba(0,0,0,0.15);
          `}
          aria-label="Main navigation"
        >
          {/* Header */}
          <div
            style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-4) var(--space-5);border-bottom:1px solid var(--color-border);"
          >
            <span style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:var(--font-semibold);color:var(--color-primary);">
              Bird Garden
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation menu"
              style="display:flex;align-items:center;justify-content:center;width:2rem;height:2rem;border:none;background:transparent;cursor:pointer;color:var(--color-text-muted);border-radius:var(--radius-sm);"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M3 3L15 15M15 3L3 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          {/* Nav links */}
          <ul
            style="list-style:none;margin:0;padding:var(--space-3) 0;"
            role="list"
          >
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = currentPath === href ||
                (href !== '/' && currentPath.startsWith(href));
              return (
                <li key={href}>
                  <a
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    style={`
                      display:block;
                      padding:var(--space-3) var(--space-5);
                      font-size:var(--text-base);
                      font-weight:${isActive ? 'var(--font-semibold)' : 'var(--font-normal)'};
                      color:${isActive ? 'var(--color-primary)' : 'var(--color-text)'};
                      text-decoration:none;
                      border-left:3px solid ${isActive ? 'var(--color-primary)' : 'transparent'};
                      transition:background 0.1s, border-color 0.1s;
                    `}
                  >
                    {label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </dialog>
    </>
  );
}
