import { Camera, Images, LocateFixed, MapPinOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage } from '../lib/api';
import { getCurrentPosition, isValidLatLng, readExif, type LatLng } from '../lib/geo';
import { compressImage } from '../lib/image';
import { queuePhoto, uploadPhoto } from '../lib/photoUpload';
import { toast } from '../lib/toast';
import { useStore } from '../store';
import { PickLocationMap } from './map/PickLocationMap';

type Variant = 'fab' | 'icon' | 'button';
type Source = 'camera' | 'gallery';
type LocationSource = 'gps' | 'exif' | 'manual' | 'none';

interface Props {
  variant?: Variant;
  label?: string;
  className?: string;
}

interface Draft {
  blob: Blob;
  previewUrl: string;
  position: LatLng | null;
  locationSource: LocationSource;
  takenAt: number | null;
  accuracy: number | null;
}

export function PhotoCapture({ variant = 'fab', label = 'Tirar foto', className = '' }: Props) {
  const config = useStore((s) => s.config);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const positionPromise = useRef<Promise<Awaited<ReturnType<typeof getCurrentPosition>>> | null>(null);
  const sourceRef = useRef<Source>('camera');

  const [menuOpen, setMenuOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caption, setCaption] = useState('');
  const [includeLocation, setIncludeLocation] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (draft) URL.revokeObjectURL(draft.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.previewUrl]);

  const pick = (source: Source) => {
    setMenuOpen(false);
    sourceRef.current = source;
    // Pede a posição já no toque (gesto do usuário) para estar pronta quando a foto chegar
    positionPromise.current = getCurrentPosition(8000);
    (source === 'camera' ? cameraRef : galleryRef).current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPreparing(true);
    try {
      const [exif, devicePos, blob] = await Promise.all([
        readExif(file),
        positionPromise.current ?? getCurrentPosition(8000),
        compressImage(file),
      ]);

      let position: LatLng | null = null;
      let locationSource: LocationSource = 'none';
      // Câmera: a posição do aparelho é a da foto. Galeria: prefere o GPS gravado na foto.
      const preferExif = sourceRef.current === 'gallery';
      if (preferExif && isValidLatLng(exif.position)) {
        position = exif.position;
        locationSource = 'exif';
      } else if (devicePos && isValidLatLng(devicePos)) {
        position = { lat: devicePos.lat, lng: devicePos.lng };
        locationSource = 'gps';
      } else if (isValidLatLng(exif.position)) {
        position = exif.position;
        locationSource = 'exif';
      }

      setCaption('');
      setIncludeLocation(true);
      setProgress(null);
      setDraft({
        blob,
        previewUrl: URL.createObjectURL(blob),
        position,
        locationSource,
        takenAt: exif.takenAt ?? (sourceRef.current === 'camera' ? Date.now() : null),
        accuracy: locationSource === 'gps' && devicePos ? devicePos.accuracy : null,
      });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPreparing(false);
    }
  };

  const close = () => {
    if (progress !== null) return;
    setDraft(null);
  };

  const setManual = (p: LatLng) => {
    if (!draft) return;
    setDraft({ ...draft, position: p, locationSource: 'manual', accuracy: null });
  };

  const send = async () => {
    if (!draft) return;
    const withLocation = includeLocation && draft.position;
    const payload = {
      blob: draft.blob,
      caption: caption.trim() || null,
      lat: withLocation ? draft.position!.lat : null,
      lng: withLocation ? draft.position!.lng : null,
      locationSource: withLocation ? draft.locationSource : 'none',
      takenAt: draft.takenAt,
    };
    setProgress(0);
    try {
      await uploadPhoto(payload, (f) => setProgress(f));
      toast.success('Foto publicada! 📸');
      setDraft(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        await queuePhoto(payload);
        toast.info('Sem conexão agora. A foto ficou na fila e sobe quando o sinal voltar.');
        setDraft(null);
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setProgress(null);
    }
  };

  const mapCenter: [number, number] = config
    ? [config.wedding.mapCenter.lat, config.wedding.mapCenter.lng]
    : [-3.923, -38.328];

  const trigger = (() => {
    if (variant === 'fab') {
      return (
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={preparing}
          className={`flex size-14 items-center justify-center rounded-full bg-terra-dark text-cream shadow-soft transition hover:bg-terra active:scale-95 disabled:opacity-60 ${className}`}
          aria-label={label}
        >
          <Camera size={24} />
        </button>
      );
    }
    if (variant === 'icon') {
      return (
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={preparing}
          className={`rounded-full p-2.5 text-terra hover:bg-terra-pale disabled:opacity-60 ${className}`}
          aria-label={label}
        >
          <Camera size={22} />
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        disabled={preparing}
        className={`flex items-center justify-center gap-2 rounded-2xl bg-terra-dark px-4 py-3 font-semibold text-cream shadow-soft hover:bg-terra disabled:opacity-60 ${className}`}
      >
        <Camera size={20} /> {label}
      </button>
    );
  })();

  return (
    <>
      <div className="relative inline-block">
        {trigger}
        {menuOpen && (
          <>
            <button type="button" className="fixed inset-0 z-[1000] cursor-default" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />
            <div
              className={`absolute z-[1010] min-w-48 overflow-hidden rounded-2xl border border-sand bg-cream shadow-soft animate-fade-in ${
                variant === 'fab' ? 'right-0 bottom-full mb-2' : 'bottom-full left-0 mb-2'
              }`}
            >
              <button type="button" onClick={() => pick('camera')} className="flex w-full items-center gap-3 px-4 py-3 text-left font-semibold text-terra-dark hover:bg-terra-pale">
                <Camera size={18} /> Tirar foto agora
              </button>
              <button type="button" onClick={() => pick('gallery')} className="flex w-full items-center gap-3 px-4 py-3 text-left font-semibold text-terra-dark hover:bg-terra-pale">
                <Images size={18} /> Escolher da galeria
              </button>
            </div>
          </>
        )}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {preparing && (
        <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-terra-dark/40">
          <div className="rounded-2xl bg-cream px-5 py-4 font-semibold text-terra-dark shadow-soft">Preparando a foto…</div>
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-terra-dark/60 sm:items-center" role="dialog" aria-modal="true">
          <div
            className="flex max-h-[95dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-cream shadow-soft sm:rounded-3xl animate-fade-in"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="font-serif text-2xl font-semibold text-terra-dark">Publicar foto</h2>
              <button type="button" onClick={close} className="rounded-full p-2 text-terra hover:bg-cream-dark" aria-label="Cancelar" disabled={progress !== null}>
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">
              <img src={draft.previewUrl} alt="Prévia" className="max-h-64 w-full rounded-2xl bg-sand object-contain" />

              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Legenda (opcional)"
                maxLength={500}
                rows={2}
                className="w-full resize-none rounded-2xl border border-sand bg-white/70 px-3.5 py-2.5 text-ink outline-none focus:border-terra"
              />

              <div className="rounded-2xl border border-sand bg-white/60 p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-terra-dark">
                    {draft.position && includeLocation ? <LocateFixed size={16} /> : <MapPinOff size={16} />}
                    {draft.position
                      ? includeLocation
                        ? draft.locationSource === 'gps'
                          ? 'Marcada pela localização do celular'
                          : draft.locationSource === 'exif'
                            ? 'Marcada pelo GPS da foto'
                            : 'Local ajustado por você'
                        : 'Sem localização'
                      : 'Não conseguimos sua localização'}
                  </div>
                  {draft.position && (
                    <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <input type="checkbox" checked={includeLocation} onChange={(e) => setIncludeLocation(e.target.checked)} className="accent-terra" />
                      Mostrar no mapa
                    </label>
                  )}
                </div>
                {(includeLocation || !draft.position) && (
                  <>
                    <PickLocationMap value={draft.position} onChange={setManual} center={mapCenter} zoom={draft.position ? 15 : 10} className="h-40" />
                    <p className="mt-1.5 text-xs text-ink-soft">
                      {draft.position
                        ? 'Arraste o pino se precisar ajustar.'
                        : 'Toque no mapa para marcar onde a foto foi tirada, ou publique sem localização.'}
                      {draft.accuracy && draft.accuracy > 200 ? ` Precisão aproximada: ${Math.round(draft.accuracy)} m.` : ''}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="border-t border-sand px-5 py-3">
              {progress !== null ? (
                <div>
                  <div className="mb-1 flex justify-between text-xs font-semibold text-terra-dark">
                    <span>Enviando…</span>
                    <span>{Math.round(progress * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sand">
                    <div className="h-full bg-terra transition-all" style={{ width: `${Math.max(4, progress * 100)}%` }} />
                  </div>
                </div>
              ) : (
                <button type="button" onClick={send} className="w-full rounded-2xl bg-terra-dark py-3 font-semibold text-cream shadow-soft hover:bg-terra">
                  Publicar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
