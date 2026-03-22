/**
 * tests/setup.ts — Global test setup loaded via bunfig.toml [test].preload
 *
 * Sets up happy-dom globals (document, window, localStorage, etc.) for
 * component tests. Guards ensure API/unit tests that don't import components
 * are unaffected.
 */
import { Window } from 'happy-dom';

// ---------------------------------------------------------------------------
// Inject happy-dom globals into Bun's global scope
// ---------------------------------------------------------------------------
const happyWindow = new Window({ url: 'http://localhost/', width: 1280, height: 800 });

// Expose standard error classes on the happy-dom window so its internal
// selector parser can do `new this.window.SyntaxError(...)` without crashing
(happyWindow as any).SyntaxError = SyntaxError;
(happyWindow as any).TypeError = TypeError;
(happyWindow as any).RangeError = RangeError;
(happyWindow as any).Error = Error;

// Core browser globals needed by @testing-library/preact
(globalThis as any).window = happyWindow;
(globalThis as any).document = happyWindow.document;
(globalThis as any).navigator = happyWindow.navigator;
(globalThis as any).location = happyWindow.location;
(globalThis as any).history = happyWindow.history;
(globalThis as any).HTMLElement = happyWindow.HTMLElement;
(globalThis as any).HTMLMediaElement = happyWindow.HTMLMediaElement;
(globalThis as any).HTMLDialogElement = happyWindow.HTMLDialogElement;
(globalThis as any).HTMLSelectElement = happyWindow.HTMLSelectElement;
(globalThis as any).HTMLInputElement = happyWindow.HTMLInputElement;
(globalThis as any).HTMLButtonElement = happyWindow.HTMLButtonElement;
(globalThis as any).HTMLAnchorElement = happyWindow.HTMLAnchorElement;
(globalThis as any).SVGElement = happyWindow.SVGElement;
(globalThis as any).Element = happyWindow.Element;
(globalThis as any).Node = happyWindow.Node;
(globalThis as any).Event = happyWindow.Event;
(globalThis as any).CustomEvent = happyWindow.CustomEvent;
(globalThis as any).MouseEvent = happyWindow.MouseEvent;
(globalThis as any).KeyboardEvent = happyWindow.KeyboardEvent;
(globalThis as any).MutationObserver = happyWindow.MutationObserver;
(globalThis as any).getComputedStyle = happyWindow.getComputedStyle.bind(happyWindow);
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
(globalThis as any).cancelAnimationFrame = clearTimeout;

// ---------------------------------------------------------------------------
// localStorage — happy-dom provides it
// ---------------------------------------------------------------------------
(globalThis as any).localStorage = happyWindow.localStorage;
(globalThis as any).sessionStorage = happyWindow.sessionStorage;

// ---------------------------------------------------------------------------
// Reset DOM body and localStorage before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  happyWindow.document.body.innerHTML = '';
  try { happyWindow.localStorage.clear(); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// HTMLMediaElement — play/pause not implemented in happy-dom
// ---------------------------------------------------------------------------
Object.defineProperty(happyWindow.HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: () => Promise.resolve(),
});
Object.defineProperty(happyWindow.HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  },
});
Object.defineProperty(happyWindow.HTMLMediaElement.prototype, 'paused', {
  configurable: true,
  get() { return true; },
});
Object.defineProperty(happyWindow.HTMLMediaElement.prototype, 'duration', {
  configurable: true,
  get() { return 0; },
});

// ---------------------------------------------------------------------------
// navigator.geolocation — default: permission denied
// Tests that need success behaviour override per-test.
// ---------------------------------------------------------------------------
Object.defineProperty(happyWindow.navigator, 'geolocation', {
  configurable: true,
  value: {
    getCurrentPosition: (
      _success: PositionCallback,
      error?: PositionErrorCallback,
    ) => {
      error?.({
        code: 1,
        message: 'User denied Geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    },
  },
});
