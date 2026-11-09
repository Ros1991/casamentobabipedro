import { SmilePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/api';
import { toast } from '../lib/toast';
import { EMOJIS, type Reaction } from '../lib/types';
import { useStore } from '../store';

interface Props {
  messageId: number;
  reactions: Reaction[];
  align?: 'left' | 'right';
  onLocalUpdate?: (reactions: Reaction[]) => void;
}

export function Reactions({ messageId, reactions, align = 'left', onLocalUpdate }: Props) {
  const me = useStore((s) => s.me);
  const toggle = useStore((s) => s.toggleReaction);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const g = grouped.get(r.emoji) ?? { count: 0, mine: false };
    g.count++;
    if (r.guestId === me?.id) g.mine = true;
    grouped.set(r.emoji, g);
  }

  const handle = async (emoji: string) => {
    setOpen(false);
    try {
      const list = await toggle(messageId, emoji);
      onLocalUpdate?.(list);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div ref={ref} className={`relative flex flex-wrap items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
      {[...grouped.entries()].map(([emoji, g]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => handle(emoji)}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
            g.mine ? 'border-terra bg-terra-pale text-terra-dark' : 'border-sand bg-white/70 text-ink-soft'
          }`}
        >
          <span>{emoji}</span>
          <span className="font-semibold">{g.count}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-dashed border-sand p-1 text-ink-soft hover:border-terra hover:text-terra"
        aria-label="Reagir"
      >
        <SmilePlus size={14} />
      </button>
      {open && (
        <div
          className={`absolute bottom-full z-[1050] mb-1 flex gap-1 rounded-full border border-sand bg-cream px-2 py-1.5 shadow-soft animate-fade-in ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => handle(e)} className="text-xl transition hover:scale-125">
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
