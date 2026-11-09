interface Props {
  size?: number;
  className?: string;
  /** Mostra o coqueiro acima das letras */
  leaf?: boolean;
  /** "light" para usar sobre foto ou fundo escuro */
  tone?: 'dark' | 'light';
}

export function Monogram({ size = 64, className = '', leaf = true, tone = 'dark' }: Props) {
  const letter = tone === 'light' ? '#ffffff' : '#7c5546';
  const accent = tone === 'light' ? 'rgba(255,255,255,0.8)' : '#a47764';
  const frond = tone === 'light' ? 'rgba(255,255,255,0.85)' : '#c9a692';
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-label="Monograma P e B">
      {leaf && (
        <g transform="translate(100 70) scale(0.5)">
          {/* tronco */}
          <path d="M-4 80 C 0 50, 4 24, 10 -8" stroke={accent} strokeWidth="7" strokeLinecap="round" fill="none" />
          {/* folhas */}
          <path d="M10 -10 C -12 -46, -50 -56, -78 -40 C -52 -38, -22 -28, 10 -10 Z" fill={frond} />
          <path d="M10 -10 C -22 -14, -58 -2, -72 24 C -50 8, -22 -2, 10 -10 Z" fill={frond} opacity="0.9" />
          <path d="M10 -10 C 32 -46, 70 -56, 98 -40 C 72 -38, 42 -28, 10 -10 Z" fill={frond} />
          <path d="M10 -10 C 42 -14, 78 -2, 92 24 C 70 8, 42 -2, 10 -10 Z" fill={frond} opacity="0.9" />
          <path d="M10 -10 C 2 -44, -10 -66, -30 -82 C -14 -62, -2 -38, 10 -10 Z" fill={frond} opacity="0.95" />
          <path d="M10 -10 C 18 -44, 32 -66, 54 -80 C 36 -60, 22 -38, 10 -10 Z" fill={frond} opacity="0.95" />
          {/* cocos */}
          <circle cx="4" cy="-4" r="5" fill={accent} />
          <circle cx="14" cy="-2" r="5" fill={accent} />
        </g>
      )}
      <g fontFamily="'Cinzel', Georgia, serif" fontWeight="600" fill={letter} textAnchor="middle">
        <text x="68" y={leaf ? 172 : 140} fontSize="76">
          P
        </text>
        <text x="100" y={leaf ? 168 : 136} fontSize="56" fill={accent}>
          |
        </text>
        <text x="134" y={leaf ? 172 : 140} fontSize="76">
          B
        </text>
      </g>
    </svg>
  );
}
