import { Copy, ExternalLink, Gift } from 'lucide-react';
import { toast } from '../lib/toast';
import { useStore } from '../store';

/** Lista de presentes dos noivos e chave Pix, com botão de copiar. */
export function GiftsCard() {
  const wedding = useStore((s) => s.config?.wedding);
  if (!wedding) return null;

  const copyPix = async () => {
    try {
      await navigator.clipboard.writeText(wedding.pixKey);
      toast.success('Chave Pix copiada!');
    } catch {
      toast.info(`Chave Pix: ${wedding.pixKey}`);
    }
  };

  return (
    <div className="rounded-3xl border border-sand bg-white/60 p-4 shadow-soft">
      <div className="flex items-center gap-2 font-serif text-xl font-semibold text-terra-dark">
        <Gift size={20} /> Ainda não presenteou os noivos?
      </div>
      <p className="mt-2 text-sm text-ink">Se quiser nos presentear, é só acessar nossa lista de presentes.</p>
      <a
        href={wedding.giftsUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-terra-dark px-4 py-2 text-sm font-semibold text-cream"
      >
        <Gift size={15} /> Ver lista de presentes <ExternalLink size={14} />
      </a>
      <p className="mt-4 text-sm text-ink">Ou, se preferir, pode enviar seu carinho em forma de Pix:</p>
      <button
        type="button"
        onClick={copyPix}
        className="mt-2 flex w-full items-center justify-between gap-2 rounded-2xl border border-terra-light bg-cream px-4 py-3 text-left"
        aria-label="Copiar chave Pix"
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-bold tracking-widest text-terra uppercase">Chave Pix (e-mail)</span>
          <span className="block truncate font-semibold text-ink">{wedding.pixKey}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-terra-dark">
          <Copy size={15} /> Copiar
        </span>
      </button>
    </div>
  );
}
