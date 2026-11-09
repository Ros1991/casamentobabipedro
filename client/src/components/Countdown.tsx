import { useEffect, useState } from 'react';

interface Props {
  target: string;
  className?: string;
  /** "light" para a faixa terracota: caixas brancas com números terracota, como no site oficial */
  tone?: 'dark' | 'light';
}

function diffParts(target: number) {
  const ms = target - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return { days, hours, minutes };
}

export function Countdown({ target, className = '', tone = 'dark' }: Props) {
  const targetMs = new Date(target).getTime();
  const [parts, setParts] = useState(() => diffParts(targetMs));
  const light = tone === 'light';

  useEffect(() => {
    const id = window.setInterval(() => setParts(diffParts(targetMs)), 30_000);
    return () => window.clearInterval(id);
  }, [targetMs]);

  if (!parts) {
    const sinceMs = Date.now() - targetMs;
    const isToday = sinceMs < 12 * 3_600_000;
    return (
      <div className={`font-script text-4xl ${light ? 'text-white' : 'text-terra-dark'} ${className}`}>
        {isToday ? 'É hoje!' : 'Foi lindo!'}
      </div>
    );
  }

  const items = [
    { v: parts.days, l: parts.days === 1 ? 'dia' : 'dias' },
    { v: parts.hours, l: parts.hours === 1 ? 'hora' : 'horas' },
    { v: parts.minutes, l: 'min' },
  ];

  return (
    <div className={`flex items-end justify-center gap-3 ${className}`}>
      {items.map((it) => (
        <div key={it.l} className={`min-w-[74px] text-center ${light ? 'rounded-2xl bg-white/95 px-3 py-2 shadow-soft' : ''}`}>
          <div className={`font-serif text-4xl leading-none font-semibold tabular-nums ${light ? 'text-terra' : 'text-terra-dark'}`}>
            {it.v}
          </div>
          <div className="mt-1 text-[11px] font-semibold tracking-widest text-terra uppercase">{it.l}</div>
        </div>
      ))}
    </div>
  );
}
