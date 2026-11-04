type Props = {
  className?: string;
  size?: number;
};

export function TomatoMark({ className, size = 28 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Tomate"
      className={className}
    >
      {/* leaf */}
      <path d="M16 6 C 14 3, 10 3, 9 6 C 8 8, 10 9, 12 8 C 13 7, 14 7, 16 6 Z" fill="#059669" />
      <path d="M16 6 C 18 3, 22 3, 23 6 C 24 8, 22 9, 20 8 C 19 7, 18 7, 16 6 Z" fill="#047857" />
      <path d="M16 6 C 15 4, 16 2, 17 3 C 18 4, 17 6, 16 6 Z" fill="#10b981" />
      {/* stem */}
      <rect x="15" y="5" width="2" height="3" rx="1" fill="#064e3b" />
      {/* body */}
      <circle cx="16" cy="19" r="11" fill="#dc2626" />
      <circle cx="16" cy="19" r="11" fill="url(#tomatoShade)" opacity="0.35" />
      <defs>
        <radialGradient id="tomatoShade" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
        </radialGradient>
      </defs>
    </svg>
  );
}
