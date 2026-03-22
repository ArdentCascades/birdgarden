/**
 * tests/components/MobileNav.test.tsx
 *
 * Tests for the MobileNav slide-out drawer.
 * happy-dom doesn't support native <dialog> showModal/close, so we test
 * the state-driven render behavior instead.
 */
import { describe, test, expect } from 'bun:test';
import { render, fireEvent, waitFor } from '@testing-library/preact';
import MobileNav from '../../src/components/MobileNav.tsx';

describe('MobileNav', () => {
  test('renders hamburger toggle button', () => {
    const { container } = render(<MobileNav />);
    const toggle = container.querySelector('[aria-label="Open navigation menu"]');
    expect(toggle).not.toBeNull();
  });

  test('hamburger button is aria-expanded=false initially', () => {
    const { container } = render(<MobileNav />);
    const toggle = container.querySelector('[aria-label="Open navigation menu"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  test('opening drawer sets aria-expanded=true', async () => {
    const { container } = render(<MobileNav />);
    const toggle = container.querySelector('[aria-label="Open navigation menu"]') as HTMLButtonElement;
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });
  });

  test('dialog element is present', () => {
    const { container } = render(<MobileNav />);
    expect(container.querySelector('dialog')).not.toBeNull();
  });

  test('nav contains all expected links', async () => {
    const { container } = render(<MobileNav />);
    fireEvent.click(
      container.querySelector('[aria-label="Open navigation menu"]') as HTMLButtonElement,
    );

    await waitFor(() => {
      expect(container.querySelector('nav')).not.toBeNull();
    });

    const links = container.querySelectorAll('nav a');
    const hrefs = Array.from(links).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/plants');
    expect(hrefs).toContain('/birds');
    expect(hrefs).toContain('/garden');
    expect(hrefs).toContain('/about');
  });

  test('close button sets aria-expanded back to false', async () => {
    const { container } = render(<MobileNav />);
    const toggle = container.querySelector('[aria-label="Open navigation menu"]') as HTMLButtonElement;
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    const closeBtn = container.querySelector('[aria-label="Close navigation menu"]') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });
  });

  test('nav has aria-label "Main navigation"', async () => {
    const { container } = render(<MobileNav />);
    fireEvent.click(
      container.querySelector('[aria-label="Open navigation menu"]') as HTMLButtonElement,
    );

    await waitFor(() => {
      const nav = container.querySelector('nav[aria-label="Main navigation"]');
      expect(nav).not.toBeNull();
    });
  });

  test('link labels are visible in the drawer', async () => {
    const { container } = render(<MobileNav />);
    fireEvent.click(
      container.querySelector('[aria-label="Open navigation menu"]') as HTMLButtonElement,
    );

    await waitFor(() => {
      expect(container.innerHTML).toContain('Plants');
      expect(container.innerHTML).toContain('Birds');
      expect(container.innerHTML).toContain('My Garden');
    });
  });
});
