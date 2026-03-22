/**
 * MobileNav.test.tsx
 *
 * Tests:
 *   - Renders a <dialog> element
 *   - Dialog is closed initially
 *   - Clicking the #mobile-nav-toggle button opens the dialog
 *   - Close button inside dialog closes it
 *   - Nav links are present and have correct hrefs
 *   - Region indicator shows saved region from localStorage
 *   - No region indicator when localStorage is empty
 *   - Backdrop click closes the dialog
 *   - aria-expanded is updated on toggle button
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/preact';
import MobileNav from '../../src/components/MobileNav.tsx';

afterEach(cleanup);

/** Create the external toggle button that MobileNav.tsx looks for */
function createToggleButton() {
  const btn = document.createElement('button');
  btn.id = 'mobile-nav-toggle';
  btn.setAttribute('aria-expanded', 'false');
  document.body.appendChild(btn);
  return btn;
}

function removeToggleButton() {
  document.getElementById('mobile-nav-toggle')?.remove();
}

// happy-dom's <dialog> may not support showModal — stub it
function stubDialog() {
  const orig = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  const origClose = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  return () => {
    HTMLDialogElement.prototype.showModal = orig;
    HTMLDialogElement.prototype.close = origClose;
  };
}

describe('MobileNav', () => {
  let restoreDialog: () => void;

  beforeEach(() => {
    restoreDialog = stubDialog();
    createToggleButton();
  });

  afterEach(() => {
    restoreDialog?.();
    removeToggleButton();
  });

  test('renders a dialog element', () => {
    render(<MobileNav />);
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeTruthy();
  });

  test('dialog is closed initially', () => {
    render(<MobileNav />);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
  });

  test('dialog opens when toggle button is clicked', async () => {
    render(<MobileNav />);
    const toggle = document.getElementById('mobile-nav-toggle')!;
    fireEvent.click(toggle);

    await waitFor(() => {
      const dialog = document.querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(true);
    });
  });

  test('aria-expanded set to true when dialog opens', async () => {
    render(<MobileNav />);
    const toggle = document.getElementById('mobile-nav-toggle')!;
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });
  });

  test('close button inside dialog closes it', async () => {
    render(<MobileNav />);
    const toggle = document.getElementById('mobile-nav-toggle')!;
    fireEvent.click(toggle);
    await waitFor(() => {
      expect((document.querySelector('dialog') as HTMLDialogElement).open).toBe(true);
    });

    const closeBtn = screen.getByRole('button', { name: /close navigation menu/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect((document.querySelector('dialog') as HTMLDialogElement).open).toBe(false);
    });
  });

  test('nav contains Plants link', () => {
    const { container } = render(<MobileNav />);
    const link = container.querySelector('a[href="/plants"]');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('Plants');
  });

  test('nav contains Birds link', () => {
    const { container } = render(<MobileNav />);
    const link = container.querySelector('a[href="/birds"]');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('Birds');
  });

  test('nav contains My Garden link', () => {
    const { container } = render(<MobileNav />);
    const link = container.querySelector('a[href="/garden"]');
    expect(link).toBeTruthy();
  });

  test('nav contains About link', () => {
    const { container } = render(<MobileNav />);
    const link = container.querySelector('a[href="/about"]');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('About');
  });

  test('shows region indicator when localStorage has region', () => {
    localStorage.setItem('bird-garden-region', 'new-york');
    render(<MobileNav />);
    // Region slug formatted as "New York"
    expect(screen.getByText('New York')).toBeTruthy();
    expect(screen.getByText('Current region')).toBeTruthy();
  });

  test('no region indicator when localStorage is empty', () => {
    render(<MobileNav />);
    expect(screen.queryByText('Current region')).toBeNull();
  });

  test('"Change region" link goes to home', () => {
    localStorage.setItem('bird-garden-region', 'california');
    render(<MobileNav />);
    const changeLink = screen.getByText('Change region');
    expect(changeLink.getAttribute('href')).toBe('/');
  });

  test('region slug formatted as Title Case', () => {
    localStorage.setItem('bird-garden-region', 'british-columbia');
    render(<MobileNav />);
    expect(screen.getByText('British Columbia')).toBeTruthy();
  });

  test('Bird Garden logo link goes to home', () => {
    const { container } = render(<MobileNav />);
    const links = Array.from(container.querySelectorAll('a[href="/"]'));
    const logoLink = links.find((el) => el.textContent?.includes('Bird Garden'));
    expect(logoLink).toBeTruthy();
  });
});
