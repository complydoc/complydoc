import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

// jsdom has no layout, so it lacks a few browser APIs the components use.
let systemDark = false;
let wideScreen = false;

/** Make `min-width` queries match, as on a wide screen, for the next render. */
export function wide() {
  wideScreen = true;
}

/** Make `prefers-color-scheme: dark` match, or not, for the next render. */
export function setSystemDark(dark: boolean) {
  systemDark = dark;
}

beforeEach(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: (query.includes("dark") && systemDark) || (query.includes("min-width") && wideScreen),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  // Radix Select measures and scrolls its list, and captures the pointer.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.scrollTo ??= () => {};
  // Opening a page scrolls the window to its top; jsdom has no window to scroll.
  window.scrollTo = () => {};
  // A finding's mark in the diff is placed by the rectangle of its text range.
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  systemDark = false;
  wideScreen = false;
  window.location.hash = "";
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

// jsdom draws nothing, and git-diff-view measures its line numbers' width on a canvas.
HTMLCanvasElement.prototype.getContext = function getContext() {
  return { font: "", measureText: (text: string) => ({ width: text.length * 7 }) };
} as unknown as typeof HTMLCanvasElement.prototype.getContext;
