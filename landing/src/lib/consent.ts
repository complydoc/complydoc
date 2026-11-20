/**
 * The visitor's cookie choice, kept in one cookie for complydoc.io and every site under it
 * (veil.complydoc.io reads the same one), so a visitor answers once.
 *
 * Visits are always counted by GoatCounter, which sets no cookies and stores nothing in the
 * browser. Google Analytics, which does set cookies, loads only after "Accept".
 */
import { useSyncExternalStore } from "react";
import { GA_ID } from "@/links";

export type Consent = "granted" | "denied";

const NAME = "cd_consent";
const YEAR = 60 * 60 * 24 * 365;
const OPEN = "consent:open";
const CHANGE = "consent:change";

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)cd_consent=(granted|denied)/);
  return (match?.[1] as Consent | undefined) ?? null;
}

function sharedDomain(): string {
  return location.hostname.endsWith("complydoc.io") ? "; domain=.complydoc.io" : "";
}

export function writeConsent(value: Consent) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${NAME}=${value}; max-age=${YEAR}; path=/; samesite=lax${secure}${sharedDomain()}`;
  window.dispatchEvent(new CustomEvent<Consent>(CHANGE, { detail: value }));
  if (value === "granted") startAnalytics();
  else stopAnalytics();
}

/** Show the cookie banner again, from "Cookie settings". */
export function openConsent() {
  window.dispatchEvent(new Event(OPEN));
}

export function onConsentOpen(listener: () => void) {
  window.addEventListener(OPEN, listener);
  return () => window.removeEventListener(OPEN, listener);
}

export function onConsentChange(listener: (value: Consent) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<Consent>).detail);
  window.addEventListener(CHANGE, handler);
  return () => window.removeEventListener(CHANGE, handler);
}

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/** Load Google Analytics, only once the visitor has accepted and only if a measurement ID is set. */
export function startAnalytics() {
  if (!GA_ID || readConsent() !== "granted") return;
  (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = false;
  if (window.gtag) {
    window.gtag("consent", "update", { analytics_storage: "granted" });
    return;
  }
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // gtag.js reads the arguments object itself, as Google's snippet does.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  // "auto" puts the cookies on complydoc.io, so the main site and Veil count one visitor once.
  window.gtag("config", GA_ID, { cookie_domain: "auto", cookie_expires: 60 * 60 * 24 * 395 });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
}

/** Stop Google Analytics and remove the cookies it set, after "Decline". */
function stopAnalytics() {
  if (GA_ID) (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = true;
  window.gtag?.("consent", "update", { analytics_storage: "denied" });
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim() ?? "";
    if (name !== "_ga" && !name.startsWith("_ga_")) continue;
    document.cookie = `${name}=; max-age=0; path=/`;
    document.cookie = `${name}=; max-age=0; path=/${sharedDomain()}`;
  }
}

/**
 * The visitor's choice, kept up to date. "unknown" while the page is rendered at build time and
 * hydrating, so nothing about the choice is guessed before the browser can tell.
 */
export function useConsent(): Consent | null | "unknown" {
  return useSyncExternalStore(
    (listener) => onConsentChange(listener),
    readConsent,
    () => "unknown" as const,
  );
}
