/**
 * tests/setup.ts — DOM globals injection for Bun 1.3.9 + happy-dom
 *
 * IMPORTANT: Bun 1.3.9's `environment = "happy-dom"` in bunfig.toml does NOT
 * automatically inject DOM globals into globalThis. We must do it manually.
 *
 * This file is preloaded via bunfig.toml's [test] preload setting.
 */
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost:4321' });

// Assign all DOM globals to globalThis so Preact components and
// @testing-library/preact can find them.
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  location: window.location,
  history: window.history,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  CustomEvent: window.CustomEvent,
  Event: window.Event,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  NodeList: window.NodeList,
  MutationObserver: window.MutationObserver,
  IntersectionObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 16),
  cancelAnimationFrame: clearTimeout,
  matchMedia: (_query: string) => ({
    matches: false,
    media: _query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// happy-dom's querySelectorAll uses window.SyntaxError internally — must be set.
(window as any).SyntaxError = SyntaxError;
(window as any).TypeError = TypeError;
(window as any).Error = Error;

// Fetch mocking: must set BOTH globalThis.fetch and window.fetch because
// happy-dom's Window instance shadows globalThis.fetch in some contexts.
// Tests that need to mock fetch should set both:
//   globalThis.fetch = mockFetch;
//   (window as any).fetch = mockFetch;
if (!globalThis.fetch) {
  const noopFetch = () => Promise.reject(new Error('fetch not mocked in this test'));
  globalThis.fetch = noopFetch as typeof fetch;
  (window as any).fetch = noopFetch;
}
