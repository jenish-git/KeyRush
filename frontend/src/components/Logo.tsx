import { useId } from 'react';

/** KeyRush mark: a red keycap with a slanted "K" and speed streaks. */
export function LogoMark({ size = 40, framed = false }: { size?: number; framed?: boolean }) {
  const gid = useId();
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff4a3f" />
          <stop offset="1" stopColor="#d40500" />
        </linearGradient>
      </defs>
      {framed && <rect width="64" height="64" rx="14" fill="#0b0c0e" />}
      <g fill="#ff3b30">
        <rect x="4" y="21" width="14" height="4" rx="2" />
        <rect x="8" y="30" width="10" height="4" rx="2" opacity="0.7" />
        <rect x="11" y="39" width="7" height="4" rx="2" opacity="0.45" />
      </g>
      <rect x="20" y="12" width="40" height="44" rx="9" fill="#7a0300" />
      <rect x="22" y="9" width="36" height="39" rx="8" fill={`url(#${gid})`} />
      <rect x="24.5" y="11.5" width="31" height="34" rx="6" fill="none" stroke="#fff" strokeOpacity="0.25" />
      <g fill="#fff" transform="skewX(-12) translate(6 0)">
        <rect x="29" y="17" width="6" height="23" rx="1" />
        <polygon points="35,28.5 45,17 52.5,17 40.5,30" />
        <polygon points="38.5,27 52.5,40 45,40 35,31.5" />
      </g>
    </svg>
  );
}

/** Mark + "KEYRUSH" wordmark. */
export function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`brand ${className}`} aria-label="KeyRush" role="img">
      <LogoMark size={size} />
      <span className="brand-word" style={{ fontSize: size * 0.72 }} aria-hidden>
        KEY<em>RUSH</em>
      </span>
    </span>
  );
}
