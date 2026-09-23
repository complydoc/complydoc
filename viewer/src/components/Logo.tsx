interface LogoProps {
  /** Show the wordmark beside the mark. */
  withName?: boolean;
  height?: number;
}

/** The complydoc mark: a document inside a dashed boundary, one line in the accent. */
export function Logo({ withName = true, height = 32 }: LogoProps) {
  const width = withName ? height * (296 / 64) : height * (56 / 64);
  return (
    <svg
      viewBox={withName ? "0 0 296 64" : "0 0 56 64"}
      width={width}
      height={height}
      role="img"
      aria-label="complydoc"
    >
      <rect x="8" y="12" width="40" height="40" rx="8" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="3,3" />
      <rect x="20" y="21" width="16" height="22" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="23" y1="27" x2="33" y2="27" stroke="currentColor" strokeWidth="1.5" />
      <line x1="23" y1="32" x2="33" y2="32" stroke="currentColor" strokeWidth="1.5" />
      <line x1="23" y1="37" x2="29" y2="37" stroke="var(--primary)" strokeWidth="1.5" />
      {withName && (
        <text x="62" y="41" fill="currentColor" fontSize="27" fontWeight="600" fontFamily="Geist Variable, sans-serif" letterSpacing="-0.02em">
          complydoc
        </text>
      )}
    </svg>
  );
}
