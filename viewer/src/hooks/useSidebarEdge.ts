import { useEffect, useState } from "react";

/**
 * Where the sidebar ends, in pixels from the window's left: its full width, its icons when
 * folded, nothing where it is hidden, as on a phone. Measured from the space the sidebar
 * keeps in the layout, and again as that changes, so what opens beside it can leave it be.
 */
export function useSidebarEdge(): number {
  const [edge, setEdge] = useState(0);
  useEffect(() => {
    const gap = document.querySelector('[data-slot="sidebar-gap"]');
    const measure = () => setEdge(gap instanceof HTMLElement ? Math.round(gap.getBoundingClientRect().right) : 0);
    measure();
    const observer = gap && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (gap) observer?.observe(gap);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return edge;
}
