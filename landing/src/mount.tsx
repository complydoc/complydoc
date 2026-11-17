import { StrictMode, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./index.css";

/** Render a page of the site into its HTML file's #root, or bring the HTML rendered at build time to life. */
export function mount(page: ReactNode) {
  const root = document.getElementById("root");
  if (!root) throw new Error("the page has no #root element");
  const tree = <StrictMode>{page}</StrictMode>;
  if (root.hasChildNodes()) hydrateRoot(root, tree);
  else createRoot(root).render(tree);
}
