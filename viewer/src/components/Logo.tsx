/**
 * The complydoc mark, an owl's face in flat pieces, and the wordmark beside it.
 *
 * The same geometry as brand/logo/mark-flat.svg, inlined so it takes the
 * theme's green. brand/logo/README.md says why an owl and where each version goes.
 */
const MARK =
  "M26 30A17 17 0 0 1 8 6A17 17 0 0 1 26 30ZM92 6A17 17 0 0 1 74 30A17 17 0 0 1 92 6ZM8 54a20 20 0 1 0 40 0a20 20 0 1 0 -40 0ZM52 54a20 20 0 1 0 40 0a20 20 0 1 0 -40 0ZM23.5 56a7.5 7.5 0 1 0 15.0 0a7.5 7.5 0 1 0 -15.0 0ZM61.5 56a7.5 7.5 0 1 0 15.0 0a7.5 7.5 0 1 0 -15.0 0ZM50 72A15 15 0 0 1 50 96A15 15 0 0 1 50 72Z";

interface LogoProps {
  /** Show the wordmark beside the mark. */
  withName?: boolean;
  /** Height of the mark in pixels; the wordmark scales with it. */
  size?: number;
}

export function Logo({ withName = true, size = 24 }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2 text-primary" role="img" aria-label="complydoc">
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className="shrink-0">
        <path fill="currentColor" fillRule="evenodd" d={MARK} />
      </svg>
      {withName && (
        <span aria-hidden="true" className="font-semibold tracking-tight text-foreground" style={{ fontSize: size * 0.75 }}>
          complydoc
        </span>
      )}
    </span>
  );
}
