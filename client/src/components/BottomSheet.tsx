import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Altura máxima do painel (classe Tailwind) */
  maxHeight?: string;
}

export function BottomSheet({ open, onClose, title, children, maxHeight = 'max-h-[85dvh]' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-terra-dark/40 backdrop-blur-[2px]"
      />
      <div
        className={`relative flex w-full max-w-lg flex-col rounded-t-3xl bg-cream shadow-soft ${maxHeight} animate-fade-in`}
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-sand" />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2">
          <div className="min-w-0 font-serif text-xl font-semibold text-terra-dark">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-terra hover:bg-cream-dark"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
