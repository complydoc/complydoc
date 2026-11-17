import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

/** Render a page of the site into its HTML file's #root. */
export function mount(page: ReactNode) {
  const root = document.getElementById("root");
  if (!root) throw new Error("the page has no #root element");
  createRoot(root).render(<StrictMode>{page}</StrictMode>);
}
