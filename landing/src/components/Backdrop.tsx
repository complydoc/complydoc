/** The dot grid and glow behind a page's first section; decoration only. */
export function Backdrop() {
  return <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] backdrop-dots" />;
}
