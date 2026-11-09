import { initials } from '../lib/format';

const PALETTE = ['#747948', '#5b6946', '#8a9a7b', '#9bb0bf', '#b86b6b', '#a4a87c', '#7d9163', '#c2a878'];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

interface Props {
  guest: { name: string; avatarUrl: string | null };
  size?: number;
  className?: string;
  online?: boolean;
  /** Ex.: "+1" para quem vem acompanhado */
  badge?: string | null;
}

export function Avatar({ guest, size = 36, className = '', online, badge }: Props) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      {guest.avatarUrl ? (
        <img
          src={guest.avatarUrl}
          alt={guest.name}
          className="block rounded-full object-cover ring-2 ring-cream"
          style={style}
          loading="lazy"
        />
      ) : (
        <span
          className="flex items-center justify-center rounded-full font-bold text-cream ring-2 ring-cream"
          style={{ ...style, background: colorFor(guest.name) }}
          aria-label={guest.name}
        >
          {initials(guest.name)}
        </span>
      )}
      {online && (
        <span
          className="absolute -right-0.5 -bottom-0.5 block size-3 rounded-full bg-emerald-500 ring-2 ring-cream"
          title="Online agora"
        />
      )}
      {badge && (
        <span
          className="absolute -top-1 -right-1.5 rounded-full bg-rose px-1 text-[9px] leading-[14px] font-bold text-cream ring-2 ring-cream"
          title="Acompanhantes"
        >
          {badge}
        </span>
      )}
    </span>
  );
}
