/**
 * The complydoc mark, a check of two leaves with a dot above, and the wordmark beside it.
 *
 * The same geometry as brand/logo/mark-flat.svg, inlined so it takes the
 * theme's green. brand/logo/README.md says what it means and where each version goes.
 */
const MARK =
  "M35 84A30 30 0 0 1 9 58A30 30 0 0 1 35 84Z" +
  "M43 84A72 72 0 0 1 93 20A72 72 0 0 1 43 84Z" +
  "M11 34a13 13 0 1 0 26 0a13 13 0 1 0 -26 0Z";

interface LogoProps {
  /** Show the wordmark beside the mark. */
  withName?: boolean;
  /** Height of the mark in pixels; the wordmark scales with it. */
  size?: number;
}

export function Logo({ withName = true, size = 24 }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2 text-primary" role="img" aria-label="complydoc">
      <svg viewBox="9 20 84 64" width={size * (84 / 64)} height={size} aria-hidden="true" className="shrink-0">
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
