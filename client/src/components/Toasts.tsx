import { useToasts } from '../lib/toast';

const STYLES: Record<string, string> = {
  info: 'bg-terra-dark text-cream',
  success: 'bg-terra text-cream',
  error: 'bg-rose text-cream',
};

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[1300] flex flex-col items-center gap-2 px-4"
      style={{ top: 'calc(var(--safe-top) + 12px)' }}
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto max-w-md rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-soft animate-fade-in ${STYLES[t.kind]}`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
