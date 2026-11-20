/**
 * The visitor's cookie choice, kept in one cookie for complydoc.io and every site under it
 * (veil.complydoc.io reads the same one), so a visitor answers once.
 *
 * Visits are always counted by GoatCounter, which sets no cookies and stores nothing in the
 * browser. Analytics that do set cookies (PostHog, EU cloud) load only after "Accept".
 */
import { useSyncExternalStore } from "react";
import { POSTHOG_KEY } from "@/links";

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
  if (value === "granted") void startAnalytics();
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

let posthog: typeof import("posthog-js").default | null = null;

/** Load PostHog, only once the visitor has accepted and only if a project key is set. */
export async function startAnalytics() {
  if (!POSTHOG_KEY || readConsent() !== "granted") return;
  if (posthog) {
    posthog.opt_in_capturing();
    return;
  }
  posthog = (await import("posthog-js")).default;
  posthog.init(POSTHOG_KEY, {
    api_host: "https://eu.i.posthog.com",
    persistence: "localStorage+cookie",
    cross_subdomain_cookie: true,
    capture_pageview: true,
    capture_pageleave: true,
  });
}

/** Stop PostHog and remove what it stored, after "Decline". */
function stopAnalytics() {
  posthog?.opt_out_capturing();
  posthog?.reset();
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim() ?? "";
    if (!name.startsWith("ph_")) continue;
    document.cookie = `${name}=; max-age=0; path=/`;
    document.cookie = `${name}=; max-age=0; path=/${sharedDomain()}`;
  }
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("ph_")) localStorage.removeItem(key);
  } catch {
    /* storage blocked: nothing was kept there either */
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
