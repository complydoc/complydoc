interface Branch {
  login: string;
  avatar: string | undefined;
}

/**
 * Open source, drawn as git draws it: one line that is main, and a branch for
 * each contributor that leaves it, carries their work, and comes back. Each
 * branch ends in that person's avatar. Decoration only.
 */
export function MergeArt({ people }: { people: Branch[] }) {
  const shown = people.slice(0, 6);
  const width = 420;
  const main = 130;
  const step = (width - 80) / Math.max(shown.length, 1);
  return (
    <svg viewBox={`0 0 ${width} 260`} aria-hidden className="h-auto w-full max-w-md">
      <defs>
        {shown.map((person, index) => (
          <clipPath key={person.login} id={`avatar-${index}`}>
            <circle cx={60 + index * step + step / 2} cy={index % 2 ? 214 : 46} r="20" />
          </clipPath>
        ))}
      </defs>
      <line x1="16" y1={main} x2={width - 16} y2={main} stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" />
      {shown.map((person, index) => {
        const out = 40 + index * step;
        const back = out + step;
        const up = index % 2 === 0;
        const tip = up ? 46 : 214;
        const x = out + step / 2 + 20;
        const colour = index % 2 ? "var(--blush)" : "var(--primary)";
        return (
          <g key={person.login}>
            <path
              d={`M ${out} ${main} C ${out + 10} ${tip}, ${x - 30} ${tip}, ${x - 20} ${tip} M ${x + 20} ${tip} C ${x + 30} ${tip}, ${back - 10} ${tip}, ${back} ${main}`}
              fill="none"
              stroke={colour}
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.8"
            />
            <circle cx={out} cy={main} r="6" fill="var(--background)" stroke="var(--primary)" strokeWidth="3" />
            <circle cx={x} cy={tip} r="22" fill="var(--card)" stroke={colour} strokeWidth="3" />
            {person.avatar && (
              <image
                href={person.avatar}
                x={x - 20}
                y={tip - 20}
                width="40"
                height="40"
                clipPath={`url(#avatar-${index})`}
              />
            )}
          </g>
        );
      })}
      <circle cx={width - 16} cy={main} r="7" fill="var(--primary)" />
    </svg>
  );
}
