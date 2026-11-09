import { MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PhotoCapture } from '../components/PhotoCapture';
import { PhotoViewer } from '../components/PhotoViewer';
import { useStore } from '../store';

export function Fotos() {
  const photos = useStore((s) => s.photos);
  const photosLoaded = useStore((s) => s.photosLoaded);
  const loadPhotos = useStore((s) => s.loadPhotos);
  const guestsLoaded = useStore((s) => s.guestsLoaded);
  const loadGuests = useStore((s) => s.loadGuests);
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    if (!photosLoaded) void loadPhotos().catch(() => undefined);
    if (!guestsLoaded) void loadGuests().catch(() => undefined);
  }, [photosLoaded, guestsLoaded, loadPhotos, loadGuests]);

  return (
    <div className="relative min-h-full pb-24">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h1 className="font-serif text-2xl font-semibold text-terra-dark">Fotos da galera</h1>
        <span className="text-xs font-semibold tracking-wider text-terra uppercase">{photos.length} fotos</span>
      </div>

      {photosLoaded && photos.length === 0 && (
        <div className="mt-20 px-6 text-center text-ink-soft">
          <p className="font-script text-3xl text-terra-dark">Nenhuma foto ainda</p>
          <p className="mt-1 text-sm">Seja a primeira pessoa a postar! Toque na câmera aí embaixo. 📸</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-0.5 px-0.5 sm:grid-cols-4">
        {photos.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setViewer(i)} className="relative aspect-square overflow-hidden bg-sand">
            <img src={p.thumbUrl} alt={p.caption ?? ''} className="h-full w-full object-cover" loading="lazy" />
            {p.lat !== null && (
              <span className="absolute right-1 bottom-1 rounded-full bg-cream/90 p-1 text-terra-dark">
                <MapPin size={11} />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="fixed right-4 z-[40]" style={{ bottom: 'calc(var(--safe-bottom) + 84px)' }}>
        <PhotoCapture variant="fab" />
      </div>

      {viewer !== null && photos[viewer] && (
        <PhotoViewer photos={photos} index={viewer} onClose={() => setViewer(null)} onIndexChange={setViewer} />
      )}
    </div>
  );
}
