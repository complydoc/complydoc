import { StrictMode, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "@/App";
import { ContributorsPage } from "@/pages/ContributorsPage";
import { GatewayPage } from "@/pages/GatewayPage";
import { RouterPage } from "@/pages/RouterPage";

/**
 * Each page rendered to HTML at build time (scripts/prerender.mjs), so it shows at once
 * and the script only has to make it interactive.
 */
const PAGES: Record<string, () => ReactNode> = {
  "index.html": () => <App />,
  "contributors/index.html": () => <ContributorsPage />,
  "router/index.html": () => <RouterPage />,
  "gateway/index.html": () => <GatewayPage />,
};

export function render(file: string): string {
  const page = PAGES[file];
  if (!page) throw new Error(`no page is rendered into ${file}`);
  return renderToString(<StrictMode>{page()}</StrictMode>);
}

export const files = Object.keys(PAGES);
