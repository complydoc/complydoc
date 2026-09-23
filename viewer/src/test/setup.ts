import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

// jsdom has no layout, so it lacks a few browser APIs the components use.
let systemDark = false;

/** Make `prefers-color-scheme: dark` match, or not, for the next render. */
export function setSystemDark(dark: boolean) {
  systemDark = dark;
}

beforeEach(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("dark") && systemDark,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  systemDark = false;
  window.location.hash = "";
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});
