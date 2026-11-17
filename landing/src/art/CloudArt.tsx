/**
 * The page for companies, drawn: a server you run, and the cloud version above
 * it, joined by a line. Decoration only, in the baby blue and the pink.
 */
export function CloudArt() {
  return (
    <svg viewBox="0 0 320 260" aria-hidden className="h-auto w-full max-w-80">
      <defs>
        <linearGradient id="cloud-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--blush)" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="cloud-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--blush)" />
        </linearGradient>
      </defs>
      <path
        d="M78 112c-22 0-38-16-38-36s16-36 38-36c4 0 8 1 12 2 8-20 28-34 52-34 26 0 48 17 54 41 3-1 7-1 10-1 26 0 46 19 46 43s-20 41-46 41H78z"
        fill="url(#cloud-fill)"
        stroke="url(#cloud-edge)"
        strokeWidth="2.5"
      />
      <circle cx="120" cy="80" r="4" fill="var(--primary)" />
      <circle cx="160" cy="70" r="4" fill="var(--blush)" />
      <circle cx="200" cy="84" r="4" fill="var(--primary)" />
      <path d="M160 116v52" stroke="url(#cloud-edge)" strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round" />
      {[0, 1, 2].map((row) => (
        <g key={row} transform={`translate(96 ${172 + row * 28})`}>
          <rect width="128" height="22" rx="6" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
          <circle cx="14" cy="11" r="3.5" fill={row === 1 ? "var(--blush)" : "var(--primary)"} />
          <rect x="28" y="9" width="56" height="4" rx="2" fill="var(--border)" />
          <rect x="100" y="8" width="16" height="6" rx="3" fill="var(--border)" />
        </g>
      ))}
    </svg>
  );
}
