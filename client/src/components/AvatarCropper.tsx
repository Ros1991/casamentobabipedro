import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface Props {
  file: Blob;
  busy?: boolean;
  onCancel: () => void;
  /** Recebe a foto já recortada em quadrado (ou o arquivo original, se o navegador não conseguir abrir) */
  onConfirm: (blob: Blob) => void;
}

/** Lado da área de recorte na tela (px) e da imagem final (px) */
const VIEW = 280;
const OUTPUT = 640;
const MAX_ZOOM = 4;

/** Ajuste da foto de perfil: arrastar para posicionar e aproximar com o controle (ou com dois dedos). */
export function AvatarCropper({ file, busy = false, onCancel, onConfirm }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  // O endereço temporário da foto nasce e morre junto com o efeito (assim não é revogado antes de carregar)
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Escala em que o lado menor da foto preenche a área de recorte
  const base = size ? VIEW / Math.min(size.w, size.h) : 1;
  const shown = size ? { w: size.w * base * zoom, h: size.h * base * zoom } : { w: VIEW, h: VIEW };

  /** Mantém a foto sempre cobrindo a área de recorte. */
  const clamp = (o: { x: number; y: number }, z: number) => {
    if (!size) return o;
    const maxX = Math.max(0, (size.w * base * z - VIEW) / 2);
    const maxY = Math.max(0, (size.h * base * z - VIEW) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) };
  };

  const applyZoom = (z: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    setOffset((o) => clamp(o, next));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.distance > 0) applyZoom(pinch.current.zoom * (distance / pinch.current.distance));
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    setOffset((o) => clamp({ x: o.x + dx, y: o.y + dy }, zoom));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !size) return onConfirm(file);
    const scale = base * zoom;
    const side = VIEW / scale;
    const sx = (shown.w / 2 - VIEW / 2 - offset.x) / scale;
    const sy = (shown.h / 2 - VIEW / 2 - offset.y) / scale;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return onConfirm(file);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob((blob) => onConfirm(blob ?? file), 'image/jpeg', 0.88);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Ajustar foto de perfil">
      <div className="w-full max-w-sm space-y-4 rounded-3xl bg-cream p-5 shadow-soft">
        <div>
          <h2 className="font-serif text-xl font-semibold text-terra-dark">Ajuste sua foto</h2>
          <p className="text-sm text-ink-soft">Arraste para posicionar e use o controle para aproximar.</p>
        </div>

        <div
          className="relative mx-auto touch-none overflow-hidden rounded-2xl bg-ink select-none"
          style={{ width: VIEW, height: VIEW, cursor: 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.92))}
        >
          {url && (
          <img
            ref={imgRef}
            src={url}
            alt=""
            draggable={false}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            // Formato que o navegador não abre (ex.: HEIC fora do Safari): envia como está e o servidor recorta
            onError={() => onConfirm(file)}
            className="pointer-events-none absolute max-w-none"
            style={{
              width: shown.w,
              height: shown.h,
              left: VIEW / 2 - shown.w / 2 + offset.x,
              top: VIEW / 2 - shown.h / 2 + offset.y,
            }}
          />
          )}
          {/* Máscara redonda: o que fica dentro do círculo é o que aparece no perfil */}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(0_0_0/0.55)] ring-2 ring-cream/90" />
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => applyZoom(zoom - 0.2)} className="rounded-full border border-sand p-2 text-terra-dark" aria-label="Afastar">
            <Minus size={16} />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="flex-1 accent-terra"
            aria-label="Aproximação"
          />
          <button type="button" onClick={() => applyZoom(zoom + 0.2)} className="rounded-full border border-sand p-2 text-terra-dark" aria-label="Aproximar">
            <Plus size={16} />
          </button>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="flex-1 rounded-2xl border border-sand py-3 font-semibold text-ink-soft disabled:opacity-60">
            Cancelar
          </button>
          <button type="button" onClick={confirm} disabled={busy || !size} className="flex-1 rounded-2xl bg-terra-dark py-3 font-semibold text-cream disabled:opacity-60">
            {busy ? 'Enviando…' : 'Usar esta foto'}
          </button>
        </div>
      </div>
    </div>
  );
}
